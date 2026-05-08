# Phase 3: Export + Redaction — Architecture Design

> Authors: 🏗️ Lorelai (Architect) · 🔧 Rory (Data Engineer)  
> Status: **DRAFT — awaiting review**  
> Date: 2025-01-XX

---

## Executive Summary

Phase 3 adds two capabilities: (1) an **Export** command that bundles all diary sessions into a shareable artifact, and (2) an **LLM-driven redaction** pass that identifies and removes sensitive information before export. The LLM replaces regex heuristics — it understands *context*, catches secrets that pattern-matching misses, and can distinguish a real API key from example code.

---

## 1. LLM Access: Use the VS Code Language Model API

### Recommendation: `vscode.lm.selectChatModels()` (Option A)

| Criterion | vscode.lm API ✅ | External API (OpenAI/Azure) | Chat participant self-invoke |
|-----------|------------------|----------------------------|------------------------------|
| API key required | No — uses Copilot subscription | Yes — privacy/logistics issue | No |
| Data leaves machine | No — routed through existing Copilot channel | Yes — new data processor | No |
| Works offline | No (needs Copilot backend) | No | No |
| Token limits | ~128k context (GPT-4o class) | Configurable | Chat history limit |
| Programmatic control | Full — streaming, system prompt, structured output | Full | Limited — must parse chat responses |
| Available since | VS Code 1.90+ (we target 1.93+) ✅ | Always | Already registered |

**Why not the chat participant?** Using `@diary /redact` would require the participant to manually invoke redaction in chat, parse markdown responses, and can't batch multiple sessions programmatically. The `vscode.lm` API gives us a proper programmatic interface.

**Offline consideration:** Copilot must be available for LLM redaction. If unavailable, we offer two fallbacks:
1. **Export without redaction** (with a clear warning banner)
2. **Regex-based best-effort scan** as a safety net (catches obvious patterns like `sk-...`, `ghp_...`, `-----BEGIN`)

### Usage Pattern

```typescript
import * as vscode from 'vscode';

const [model] = await vscode.lm.selectChatModels({
    vendor: 'copilot',
    family: 'gpt-4o'  // request capable model; falls back gracefully
});

const messages = [
    vscode.LanguageModelChatMessage.User(systemPrompt),
    vscode.LanguageModelChatMessage.User(sessionContent),
];

const response = await model.sendRequest(messages, {}, token);
```

---

## 2. What the LLM Should Redact

### Always redact (high confidence):
| Category | Example | Replacement |
|----------|---------|-------------|
| API keys & tokens | `sk-abc123...`, `ghp_xxxx`, Bearer tokens | `[REDACTED_SECRET]` |
| Connection strings | `Server=prod.db.internal;Password=...` | `[REDACTED_CONNECTION_STRING]` |
| Passwords & credentials | `password: "hunter2"` | `[REDACTED_PASSWORD]` |
| Private keys / certs | `-----BEGIN RSA PRIVATE KEY-----` | `[REDACTED_PRIVATE_KEY]` |
| Emails & phone numbers | `jane.doe@company.com`, `+1-555-0123` | `[REDACTED_EMAIL]`, `[REDACTED_PHONE]` |
| IP addresses (non-localhost) | `10.0.0.45`, `192.168.1.100` | `[REDACTED_IP]` |
| Internal URLs | `https://internal.corp.net/api/v2` | `[REDACTED_URL]` |

### Redact with judgment (LLM decides based on context):
| Category | Guidance |
|----------|----------|
| Personal names | Redact if they identify a real person (not a variable name) |
| File paths | Redact if they reveal org structure (e.g., `/Users/jsmith/company/secret-project/`) — replace username and org-specific segments |
| Project/repo names | Redact if they're clearly internal codenames; leave generic names like "my-app" |
| Database names & table names | Redact if they reveal business domain (e.g., `customer_pii_table`) |

### Never redact:
- Code syntax, language keywords, library names
- Generic programming concepts and patterns
- The participant's *task description* and *reflection* (annotation fields) — unless they contain embedded secrets
- Public URLs (docs.microsoft.com, stackoverflow.com, etc.)

---

## 3. Redaction Strategy: Structured Span Identification (Option B+)

### Recommendation: Hybrid — LLM identifies spans, extension replaces them, participant reviews

We do NOT ask the LLM to rewrite content (Option A) because:
- Rewriting risks introducing hallucinated changes to verbatim conversation logs
- Makes diff review harder — participant can't tell what changed vs. what was rewritten
- Verbatim capture is a research requirement

Instead:

```
┌─────────────────────────────────────────────────────────┐
│  1. Extension sends session content to LLM              │
│  2. LLM returns JSON array of redaction spans           │
│  3. Extension applies replacements mechanically         │
│  4. Participant reviews before/after in a diff editor   │
│  5. Participant approves → redacted version is exported │
└─────────────────────────────────────────────────────────┘
```

### LLM Output Schema

The system prompt instructs the LLM to return a JSON array:

```json
{
  "redactions": [
    {
      "field": "turns[2].content",
      "startOffset": 145,
      "endOffset": 189,
      "originalText": "sk-proj-abc123def456ghi789",
      "category": "API_KEY",
      "confidence": "high",
      "replacement": "[REDACTED_SECRET]"
    },
    {
      "field": "filesReferenced[0]",
      "startOffset": 0,
      "endOffset": 42,
      "originalText": "/Users/jsmith/contoso/project-falcon/src/auth.ts",
      "category": "FILE_PATH",
      "confidence": "medium",
      "replacement": "/Users/[REDACTED]/[REDACTED]/[REDACTED]/src/auth.ts"
    }
  ],
  "summary": "Found 2 items to redact: 1 API key, 1 identifying file path."
}
```

### Why include `originalText`?
- Allows the extension to **verify** the span matches before applying (guards against LLM position drift)
- If `originalText` doesn't match the content at `startOffset:endOffset`, we flag it for manual review instead of blindly replacing

### Confidence levels:
- **high** — definitely sensitive (API keys, passwords, private keys)
- **medium** — likely sensitive, participant should confirm (internal URLs, names)
- **low** — possibly sensitive, flagged for participant awareness (project names, paths)

---

## 4. Batching Strategy

### Problem
A participant with 50 sessions × average 8 turns × ~500 chars/turn = ~200KB of text. Within a single model's context window, but sending all at once is wasteful if only a few sessions have sensitive content.

### Approach: Session-level batching with chunking

```
┌──────────────────────────────────────────────┐
│  Step 1: Batch sessions into chunks           │
│  - Target: ~50KB per LLM call                 │
│  - Typically 5-10 sessions per chunk          │
│  - Each chunk gets one sendRequest() call     │
│                                               │
│  Step 2: Process chunks sequentially          │
│  - Show progress bar: "Scanning 5/50..."      │
│  - Respect cancellation token                 │
│  - Accumulate redaction spans                 │
│                                               │
│  Step 3: Apply all redactions                 │
│  - Sort spans by position (reverse order)     │
│  - Apply replacements back-to-front           │
│  - Generate diff for participant review       │
└──────────────────────────────────────────────┘
```

### Why not fully parallel?
- `vscode.lm` rate limits aren't documented; sequential with progress is safer
- Participant sees steady progress rather than all-or-nothing
- Easier error recovery (retry one chunk, not everything)

### Chunk sizing heuristic:
```typescript
const MAX_CHUNK_CHARS = 50_000;  // ~12.5k tokens at 4 chars/token
const sessions = loadAllSessions();
const chunks: DiarySession[][] = [];
let currentChunk: DiarySession[] = [];
let currentSize = 0;

for (const session of sessions) {
    const size = JSON.stringify(session).length;
    if (currentSize + size > MAX_CHUNK_CHARS && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentSize = 0;
    }
    currentChunk.push(session);
    currentSize += size;
}
if (currentChunk.length > 0) chunks.push(currentChunk);
```

---

## 5. Participant Review Flow

### UX Design (minimal UI, no webview)

```
User runs: "Copilot Diary: Export Sessions" command
         │
         ▼
┌─────────────────────────────────────────┐
│  Quick Pick: "How would you like to     │
│  handle sensitive information?"          │
│                                         │
│  > 🤖 Smart redaction (AI-powered)      │
│    🔍 Export as-is (no redaction)        │
│    ✂️  Delete sessions before exporting  │
└─────────────────────────────────────────┘
         │ (user picks "Smart redaction")
         ▼
┌─────────────────────────────────────────┐
│  Progress notification:                  │
│  "Scanning sessions for sensitive info   │
│   ████████░░░░░░░░ 12/50"              │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  If redactions found:                    │
│  Opens a DIFF EDITOR showing            │
│  original (left) vs. redacted (right)   │
│                                         │
│  Info message:                           │
│  "Found 14 items to redact across 8     │
│   sessions. Review the changes, then     │
│   click 'Approve & Export'."            │
│                                         │
│  [Approve & Export] [Edit Manually]     │
│  [Cancel]                                │
└─────────────────────────────────────────┘
         │
         ▼ (Approve)
┌─────────────────────────────────────────┐
│  Quick Pick: Export format               │
│  > 📦 ZIP (individual session files)    │
│    📄 Single JSON (all sessions)         │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  Save dialog → file saved               │
│  "✅ Exported 50 sessions to            │
│   ~/Desktop/diary-export-2025-01-15.zip"│
└─────────────────────────────────────────┘
```

### Diff Editor Implementation

VS Code has a built-in diff editor we can leverage:

```typescript
// Create temp documents for comparison
const originalUri = vscode.Uri.parse('diary-original:sessions.json');
const redactedUri = vscode.Uri.parse('diary-redacted:sessions.json');

// Register a TextDocumentContentProvider for our custom scheme
// Then open the diff:
await vscode.commands.executeCommand('vscode.diff',
    originalUri,
    redactedUri,
    'Diary Export — Review Redactions (Original ↔ Redacted)'
);
```

We'll use a `TextDocumentContentProvider` with a custom URI scheme (`diary-original:` / `diary-redacted:`) to serve the content without writing temp files.

---

## 6. Export Format

### Recommendation: Support both, default to ZIP

**ZIP format** (default):
```
diary-export-2025-01-15.zip
├── manifest.json          # metadata: export date, session count, redaction summary
├── sessions/
│   ├── 2025-01-03-091500-setup-auth-a1b2c3d4.json
│   ├── 2025-01-03-142300-debug-api-e5f6g7h8.json
│   └── ...
└── redaction-log.json     # what was redacted, for researcher transparency
```

**Single JSON** (alternative for simple tooling):
```json
{
  "exportMetadata": {
    "exportDate": "2025-01-15T10:30:00Z",
    "sessionCount": 50,
    "redactionApplied": true,
    "redactionSummary": { "secrets": 3, "emails": 2, "paths": 8 }
  },
  "sessions": [ /* array of DiarySession objects */ ]
}
```

### Redaction log (included in export for researcher transparency):
```json
{
  "redactions": [
    {
      "sessionId": "uuid",
      "field": "turns[2].content",
      "category": "API_KEY",
      "confidence": "high",
      "charCount": 44,
      "replacement": "[REDACTED_SECRET]"
    }
  ],
  "totalRedactions": 14,
  "participantApproved": true,
  "approvedAt": "2025-01-15T10:28:00Z"
}
```

Note: The log does NOT include the original text — only the category, position, and length.

---

## 7. System Prompt for Redaction LLM

```markdown
You are a privacy redaction assistant for a UX research diary study. 
You will receive JSON-formatted diary session entries containing Copilot Chat 
conversations captured from a participant's VS Code.

Your task: Identify all sensitive information that should be redacted before 
this data is shared with the research team.

## What to redact:
- API keys, tokens, secrets (any string that looks like a credential)
- Connection strings and database URLs with embedded credentials
- Passwords, passphrases
- Private keys, certificates
- Personal email addresses and phone numbers
- IP addresses (except 127.0.0.1 and localhost)
- Internal/corporate URLs that reveal company infrastructure
- File paths that reveal a person's real name or organization structure
- Names of real people (when used as identifiers, not as variable names)

## What NOT to redact:
- Programming keywords, library names, public package names
- Public URLs (github.com, stackoverflow.com, docs.microsoft.com, etc.)
- Generic file paths (./src/index.ts, ./package.json)
- Code syntax, function names, variable names (unless they ARE the secret)
- The participant's task description and reflection text (unless it contains secrets)

## Output format:
Return ONLY valid JSON in this exact schema:
{
  "redactions": [
    {
      "field": "turns[0].content",
      "startOffset": <number>,
      "endOffset": <number>,
      "originalText": "<exact text to redact>",
      "category": "API_KEY" | "PASSWORD" | "CONNECTION_STRING" | "PRIVATE_KEY" | "EMAIL" | "PHONE" | "IP_ADDRESS" | "INTERNAL_URL" | "FILE_PATH" | "PERSON_NAME" | "OTHER",
      "confidence": "high" | "medium" | "low",
      "replacement": "<suggested replacement placeholder>"
    }
  ],
  "summary": "<one sentence summary of findings>"
}

If nothing needs redacting, return: {"redactions": [], "summary": "No sensitive information found."}

IMPORTANT:
- startOffset and endOffset are character positions within the specified field's string value
- originalText must be the EXACT substring at that position (this is used for verification)
- Be thorough but avoid false positives — when in doubt, flag with confidence "low"
- Process ALL fields: turns[].content, filesReferenced[], annotation.task, annotation.reflection
```

---

## 8. Module Structure

New files to add:

```
src/
├── export/
│   ├── exportCommand.ts       # Command registration + orchestration
│   ├── redactionEngine.ts     # LLM interaction, span identification, application
│   ├── redactionPrompt.ts     # System prompt + chunk formatting
│   ├── redactionFallback.ts   # Regex-based fallback when LLM unavailable
│   ├── diffReview.ts          # TextDocumentContentProvider + diff editor
│   ├── exportFormats.ts       # ZIP and single-JSON serialization
│   └── types.ts               # RedactionSpan, ExportManifest, etc.
├── sessionStorage.ts          # ADD: loadAllSessions() function
└── extension.ts               # ADD: register export command
```

### New commands to register in package.json:

```json
{
  "command": "copilotDiary.exportSessions",
  "title": "Export Diary Sessions",
  "category": "Copilot Diary"
},
{
  "command": "copilotDiary.deleteEntry",
  "title": "Delete Diary Entry",
  "category": "Copilot Diary"
}
```

---

## 9. Error Handling & Edge Cases

| Scenario | Handling |
|----------|----------|
| Copilot unavailable (no LLM) | Offer regex fallback or export-as-is with warning |
| LLM returns malformed JSON | Retry once with stricter prompt; then fall back to regex |
| LLM hallucinates offsets | Verify `originalText` matches content at offset; skip mismatches |
| Session file corrupted | Skip with warning, continue processing others |
| Very large session (>100KB single file) | Process alone in its own chunk; warn if over model limit |
| Participant cancels mid-scan | Discard partial results, no export produced |
| No sessions to export | Show info message, no-op |
| Rate limiting from Copilot LM API | Exponential backoff between chunks; surface "try again later" if persistent |

---

## 10. Sequence Diagram

```
Participant                Extension                    VS Code LM API
    │                         │                              │
    │ ─── Export command ───► │                              │
    │                         │                              │
    │ ◄── Quick pick ──────── │                              │
    │ ─── "Smart redaction" ► │                              │
    │                         │                              │
    │                         │ ── loadAllSessions() ──────► (disk)
    │                         │ ◄─ DiarySession[] ────────── │
    │                         │                              │
    │                         │ ── chunkSessions() ────────► │
    │                         │                              │
    │ ◄── Progress bar ────── │                              │
    │                         │                              │
    │                         │ ── sendRequest(chunk1) ────► │
    │                         │ ◄─ RedactionSpan[] ───────── │
    │                         │                              │
    │                         │ ── sendRequest(chunk2) ────► │
    │                         │ ◄─ RedactionSpan[] ───────── │
    │                         │         ...                  │
    │                         │                              │
    │                         │ ── applyRedactions() ──────► (in-memory)
    │                         │                              │
    │ ◄── Diff editor ─────── │                              │
    │     (original vs.       │                              │
    │      redacted)          │                              │
    │                         │                              │
    │ ─── "Approve" ────────► │                              │
    │                         │                              │
    │ ◄── Save dialog ─────── │                              │
    │ ─── picks location ───► │                              │
    │                         │ ── writeExport() ──────────► (disk)
    │ ◄── "✅ Done" ────────── │                              │
```

---

## 11. Open Questions for Team

1. **Should participants be able to redact individual sessions before the full export?** (e.g., right-click a session → "Redact this entry")  
   _Lorelai's lean:_ Yes, as a Phase 3.5 enhancement. Ship batch-export first.

2. **Should we store the redacted version alongside the original?** Or only produce it at export time?  
   _Rory's lean:_ Only at export time. Don't duplicate data on disk. The original stays pristine until the participant explicitly exports.

3. **What if the LLM itself sees the sensitive data?** Is that a privacy concern?  
   _Lorelai's take:_ The vscode.lm API routes through the same Copilot infrastructure the participant already uses to write code. If they trust Copilot with their code (which they do — they're in this study), routing diary content through the same channel is consistent. But we should document this in the study consent form.

4. **Token budget:** Should we expose a setting for max tokens per redaction call?  
   _Rory's lean:_ No. Use sensible defaults (50KB chunks ≈ 12.5k tokens input, expect <2k tokens output). Don't burden participants with config.

5. **Should the regex fallback run ALWAYS (as a safety net behind the LLM)?**  
   _Lorelai's lean:_ Yes. Run regex first (fast, catches obvious patterns), then LLM (catches contextual secrets). Union the results. This gives defense-in-depth without slowing down the UX.

---

## 12. Implementation Priority

| Order | Component | Effort | Assignee |
|-------|-----------|--------|----------|
| 1 | `sessionStorage.ts` — add `loadAllSessions()` | S | Rory |
| 2 | `export/types.ts` — interfaces | S | Rory |
| 3 | `export/redactionFallback.ts` — regex patterns | M | Rory |
| 4 | `export/redactionPrompt.ts` — system prompt + chunking | M | Rory |
| 5 | `export/redactionEngine.ts` — LLM calls + span application | L | Rory + Emily |
| 6 | `export/diffReview.ts` — content provider + diff UX | M | Emily |
| 7 | `export/exportFormats.ts` — ZIP + JSON output | M | Rory |
| 8 | `export/exportCommand.ts` — full orchestration | M | Emily |
| 9 | `package.json` — commands + menus | S | Emily |
| 10 | Tests — redaction accuracy, edge cases | L | Paris |

---

## 13. Dependencies

- **archiver** (npm) — for ZIP creation. Zero-dep alternative: use VS Code's built-in `vscode.workspace.fs` + manual ZIP via `yazl` (lighter).
- No new VS Code API beyond what we already use + `vscode.lm` (available since 1.90, we target 1.93+).
- No external services. No API keys. No telemetry.

---

## Decision Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| LLM access | `vscode.lm` API | No keys, privacy-preserving, already trusted by participant |
| Redaction strategy | LLM identifies spans → mechanical replacement → participant reviews diff | Preserves verbatim integrity, auditable, reversible |
| Offline fallback | Regex patterns + "export without redaction" option | Participant always has an escape hatch |
| Batching | ~50KB chunks, sequential with progress | Predictable, cancellable, within token limits |
| Review UX | VS Code diff editor (built-in) | No webview, minimal UI, familiar to devs |
| Export format | ZIP (default) or single JSON | ZIP preserves file structure; JSON for simple tooling |
| Redacted data storage | Ephemeral (export-time only) | Don't duplicate sensitive data on disk |

---

*Ready for review by the squad. Tag @Sookie for consent-form language re: LLM processing, @Paris for test plan.*
