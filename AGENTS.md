# Squad: VS Code Diary Study Extension

## Team

| Name | Role | Responsibility |
|------|------|---------------|
| 🏗️ **Lorelai** | Lead | Architecture, API design, code review, phased build plan |
| ⚛️ **Emily** | Extension Dev | VS Code Extension API, chat participant, notifications, UI |
| 🔧 **Rory** | Data Engineer | Session capture, storage, export, redaction |
| 🧪 **Paris** | Tester | Extension tests, edge cases, privacy validation |
| 🔬 **Sookie** | UX Research Advisor | Diary study methodology, participant experience, PII vigilance, participant-facing copy |
| 📋 **Scribe** | (silent) | Memory, decisions, session logs |
| 🔄 **Ralph** | (monitor) | Work queue, backlog |

## Product

A VS Code extension that captures Copilot Chat sessions for a UX research diary study evaluating Azure Skills and MCP Tools.

## Build Phases

### Phase 1 — Chat Participant MVP
- Register a chat participant (`@diary`)
- Participant invoked manually: user says "log this session"
- Captures full verbatim conversation from chat context
- Asks 3 annotation questions:
  1. "What were you trying to do?" (free text)
  2. "GitHub Copilot got the job done." (Strongly agree / Agree / Neither agree nor disagree / Disagree / Strongly disagree)
  3. "What would a great experience have looked like here?" (free text — or "it was great")
- Saves structured JSON to `~/.copilot-diary/sessions/YYYY-MM-DD-HHMMSS.json`

### Phase 2 — Auto-detect + Notification
- Detect when a Copilot Chat session ends (idle timeout or new conversation)
- Show non-blocking notification: "Want to log this Copilot session?" → Log it / Skip
- "Log it" opens a minimal quick-input or sidebar form with the 3 questions
- Auto-extract conversation from chat history API or persisted `.jsonl` transcripts

### Phase 3 — Export + Redaction
- "Export diary" command bundles all session entries into a single file
- Redaction pass: flag potential secrets (API keys, connection strings, tokens) for participant review
- Participant can delete individual entries before export
- Export format: single JSON or ZIP with individual session files

## Data Schema (per session)

```json
{
  "sessionId": "uuid",
  "timestamp": "ISO 8601",
  "surface": "VS Code",
  "turns": [
    {
      "role": "user",
      "content": "verbatim prompt",
      "timestamp": "ISO 8601"
    },
    {
      "role": "assistant",
      "content": "verbatim full response",
      "timestamp": "ISO 8601",
      "skillsInvoked": ["azure-deploy", "..."],
      "agentsUsed": ["@azure", "..."]
    }
  ],
  "filesReferenced": ["path/to/file.ts"],
  "workspaceContext": {
    "languages": ["typescript"],
    "projectType": "anonymous"
  },
  "annotation": {
    "task": "free text",
    "gotTheJobDone": "Strongly agree | Agree | Neither | Disagree | Strongly disagree",
    "idealExperience": "free text"
  }
}
```

## Constraints

- All data stored locally — no telemetry, no phone-home
- Extension collects NO data about non-Copilot activity
- Must work on VS Code Stable and Insiders
- Minimal UI — notification + quick-input/sidebar, NOT a full webview
- TypeScript, standard VS Code Extension API + `vscode.chat` namespace
