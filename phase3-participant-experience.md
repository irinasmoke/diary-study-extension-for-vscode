# Phase 3: Participant Experience Design — Export & Redaction

> Author: 🔬 Sookie (UX Research Advisor)  
> Status: **RECOMMENDATION — for squad review**  
> Input to: Phase 3 architecture (Lorelai + Rory's technical design)

---

## TL;DR Recommendation

Use a **"Trust but verify" model**: the LLM scans automatically, then the participant sees a single summary screen with the ability to drill in. No tedious item-by-item approval. No blind "just export it." Give participants the feeling of informed control with minimal friction.

The emotional design goal: **"I feel safe sharing this because I saw what's being protected, and I had the final say."**

---

## 1. How Is Export Invoked?

### Recommendation: Command palette primary, chat hint secondary

**Primary:** `Copilot Diary: Export Sessions` in the command palette.

Why:
- Export is a **deliberate, study-ending action** — not something that happens mid-flow
- Command palette communicates gravity: "this is a tool action, not a conversation"
- Consistent with how devs do other one-off operations (Git push, settings sync)
- Already proposed in the technical design — no change needed

**Secondary:** At the end of the study period, show a one-time notification:
> "📋 Your diary study period ends soon. When you're ready, run **Copilot Diary: Export Sessions** to share your entries with the research team."  
> `[Export Now]` `[Remind Me Later]` `[Dismiss]`

**NOT recommended:** `@diary /export` in chat. Reasons:
- Export involves multi-step review UI that doesn't belong in a chat response
- Chat responses are ephemeral — participant can't easily go back to them
- Mixing "talk to AI" with "produce a file for my researcher" is confusing
- The technical design already chose the programmatic `vscode.lm` API over the chat participant for redaction — the UX should match

### What about a sidebar button?

Not for v1. A persistent sidebar implies ongoing interaction with export, but export is a one-shot event. The command palette is appropriately low-profile for something participants will do once (or a few times at most).

---

## 2. The Review Experience

### Design principle: **Summary → Drill-down → Override**

Participants are developers. They understand diffs. But they're also busy research participants doing us a favor. The review experience must:
1. Respect their time (≤60 seconds for the typical case)
2. Respect their intelligence (show them what happened, don't hide it)
3. Respect their autonomy (let them override, undo, or delete)

### The Three-Layer Review

```
┌─────────────────────────────────────────────────────────────┐
│  LAYER 1: Summary Panel (QuickPick / Information Message)    │
│                                                             │
│  "Scanned 47 sessions. Found 12 items to redact:           │
│   • 3 API keys/tokens (auto-redacted)                      │
│   • 4 internal file paths (partially redacted)             │
│   • 2 email addresses                                      │
│   • 3 internal URLs                                        │
│                                                             │
│   All redactions use placeholder text like [REDACTED_SECRET]│
│   Your original data is unchanged — only the export copy   │
│   is modified."                                             │
│                                                             │
│  [✅ Looks good — Export]  [🔍 Review Details]  [Cancel]    │
└─────────────────────────────────────────────────────────────┘
         │                           │
         │ (fast path)               │ (if curious or nervous)
         ▼                           ▼
┌─────────────────────┐   ┌───────────────────────────────────┐
│ Export dialog        │   │  LAYER 2: Redaction List           │
│ (save file)         │   │  (QuickPick with detail lines)     │
└─────────────────────┘   │                                   │
                          │  ◻ [HIGH] API key in session 3/14  │
                          │    "sk-proj-abc1..." → [REDACTED]  │
                          │  ◻ [HIGH] Token in session 7/14    │
                          │    "ghp_xxxx..." → [REDACTED]      │
                          │  ☑ [MED] Path: /Users/jsmith/...   │
                          │    → /Users/[REDACTED]/...         │
                          │  ☑ [MED] Email: j.smith@contoso    │
                          │    → [REDACTED_EMAIL]              │
                          │                                   │
                          │  ☑ = selected for redaction        │
                          │  ◻ = uncheck to KEEP original      │
                          │                                   │
                          │  [Apply Changes] [Open Full Diff]  │
                          └───────────────────────────────────┘
                                         │
                                         │ (if they really want to see everything)
                                         ▼
                          ┌───────────────────────────────────┐
                          │  LAYER 3: Full Diff Editor         │
                          │  (VS Code built-in diff view)      │
                          │                                   │
                          │  Left: Original sessions           │
                          │  Right: Redacted version           │
                          │                                   │
                          │  Participant can manually edit the │
                          │  right side if they want custom    │
                          │  redactions.                       │
                          │                                   │
                          │  [Approve & Export] [Cancel]       │
                          └───────────────────────────────────┘
```

### Why this three-layer approach?

**Most participants will stop at Layer 1.** If the summary says "3 API keys and 2 emails redacted," most developers will think "yeah, that sounds right" and click Export. Done in 10 seconds.

**Anxious or privacy-conscious participants go to Layer 2.** They see each redaction as a line item. They can uncheck ones they want to keep (e.g., "that's a public URL, leave it in"). Takes 30–60 seconds.

**Power users or edge cases hit Layer 3.** Full diff. Edit anything. This is the escape hatch that makes the other layers trustworthy — participants accept the summary *because* they know the detailed view exists.

### Undo / Override Interactions

| Action | How |
|--------|-----|
| Keep a redacted item (undo redaction) | Uncheck it in Layer 2 list |
| Add a custom redaction the LLM missed | Edit the right side in Layer 3 diff |
| Delete an entire session | Layer 2 has a "Manage Sessions" option → shows session list with delete buttons |
| Redact something MORE aggressively | Edit the replacement text in Layer 3 |

---

## 3. How Much Control? The "Trust but Verify" Model

### NOT "trust the LLM, just export" because:
- Participants in research studies have been told their data matters
- One bad experience (they find out a secret leaked) destroys trust in the study
- IRB/ethics protocols typically require informed consent for each data handoff

### NOT "approve each one individually" because:
- 12 redactions × 47 sessions = tedious nightmare
- Participants will abandon the process or rubber-stamp everything
- Either outcome is worse than a smart default

### YES: "Here's what we did. Look right? [Export] / [Let me check]"

This is the same pattern as:
- Git commit staging (see summary → expand if curious)
- VS Code's "trust this workspace" dialog (informed default with escape hatch)
- macOS permission dialogs that show what's being accessed

**Key insight:** The summary itself IS the trust mechanism. By showing "we found 12 items across these categories," we signal:
1. We actually looked (not security theater)
2. We'll tell you what we found (transparency)
3. You can dig in if you want (control)

---

## 4. Emotional Design

### The anxiety participants feel

Diary study participants are sharing *their actual work* — not a lab task. Their prompts contain:
- Code they might be embarrassed about ("why did I ask Copilot that?")
- Context about internal projects they can't share
- Evidence of mistakes or dead ends
- Personal work patterns (when they work, what frustrates them)

### Design responses to each anxiety

| Anxiety | Design response |
|---------|-----------------|
| "What if a secret leaks?" | Summary shows exactly what was caught. Red badge count gives confidence. |
| "What if I shared something embarrassing?" | Session delete option. We say "you can remove any session before exporting." |
| "I don't understand what the AI did" | Plain-language labels: "API key," "email address" — not jargon codes |
| "What happens to my data after?" | Export confirmation includes a 1-line reminder of where data goes |
| "What if I miss something?" | Reassurance: "The AI scanner catches common secrets. You can also review the full export." |

### Copy / Messaging (participant-facing text)

**On scan start:**
> "Scanning your diary entries for passwords, API keys, and personal information…"

(Not "redacting" — that sounds like censorship. "Scanning" sounds protective.)

**On scan complete (nothing found):**
> "✅ No sensitive information detected in your 47 sessions. Ready to export."  
> `[Export]` `[Review Anyway]` `[Cancel]`

**On scan complete (items found):**
> "🔒 Found 12 items to protect across 8 sessions (3 API keys, 4 file paths, 2 emails, 3 URLs). These will be replaced with placeholder text in your export."  
> "Your original entries are not modified — only the exported copy."  
> `[Looks good — Export]` `[Review Details]` `[Cancel]`

**Key phrasing choices:**
- "protect" not "redact" — positions the tool as guardian, not censor
- "your original entries are not modified" — reduces stakes, calms anxiety
- "placeholder text" — concretizes what happens (not a black hole)

### Session deletion messaging

If participant chooses to delete a session:
> "This will permanently remove this session from your diary. It won't appear in any export. Are you sure?"  
> `[Delete]` `[Keep it]`

After deletion:
> "Session removed. (Your other 46 entries are unaffected.)"

---

## 5. Post-Export: File Delivery

### Recommendation: Save to participant-chosen location, then provide copy instructions

**Step 1: Participant picks save location** via system Save dialog.

Default filename: `diary-export-[participant-alias]-[date].zip`  
Default location: Desktop (or last-used export location)

Why a save dialog (not auto-save to Downloads)?
- Gives participant one more moment of agency
- They see the filename — reminds them what it is
- Devs might want to put it in a specific folder

**Step 2: Confirmation with delivery instructions**

> "✅ Exported 47 sessions to `~/Desktop/diary-export-2025-02-15.zip`"  
>  
> "To complete your diary study:"  
> "Share this file with your researcher via [method]."  
>  
> `[Open File Location]` `[Copy File Path]` `[Done]`

### Delivery method: The extension should NOT handle delivery.

**Why:**
- Study logistics vary (some researchers use SharePoint, some use secure upload links, some use email)
- Adding upload logic means auth flows, error handling, network issues
- It crosses the boundary between "tool that helps participant" and "data collection pipe"
- Participants feel more in control when they manually send the file

**What the extension should do instead:**
- Produce the file locally
- Show where it is
- Remind them how to send it (text from the researcher, configured at install time)

### Configurable delivery message

In `settings.json` or extension config, the researcher can set:

```json
{
  "copilotDiary.exportInstructions": "Upload this file to the secure link your researcher shared with you in the study onboarding email."
}
```

This lets Irina customize the post-export message per study without code changes.

---

## 6. Edge Cases & Participant Protection

### What if they export and then realize they missed something?

- Export is repeatable. They can re-run it.
- Exported file is a copy — originals stay on disk
- They can delete the export, remove the problem session, and re-export

### What if the LLM is unavailable?

Show honest messaging:
> "⚠️ The AI scanner requires GitHub Copilot access, which isn't available right now."  
> "You can:"  
> "• Try again later when Copilot is connected"  
> "• Export with basic pattern matching only (catches common API key formats)"  
> "• Export as-is (no redaction) — review the file manually before sharing"  
>  
> `[Try Later]` `[Basic Scan]` `[Export As-Is]`

### What if there are zero sessions?

> "You don't have any diary entries yet. Log a session with `@diary /log` first!"

### What if the scan takes a while? (50+ sessions)

- Show progress: "Scanning session 12 of 47…"
- Allow cancellation at any time
- On cancel: "No export was produced. Your entries are unchanged."

---

## 7. Research Methodology Considerations

### Why this design produces better data for the researcher

| Design choice | Research benefit |
|---------------|-----------------|
| Participant reviews redactions | Fewer false positives in export = cleaner data for analysis |
| Participant can undo redactions | Keeps URLs, paths, tool names that provide context for analysis |
| Session deletion available | Participant comfort → more honest logging during study → richer data |
| Redaction log included in export | Researcher knows what was hidden → can assess data completeness |
| Original text NOT in redaction log | IRB-safe; researcher sees pattern without seeing the secret |

### What should the researcher receive?

The ZIP export should include:
1. **Sessions** (redacted JSON files) — the diary data
2. **Redaction log** — what categories were found and where (without originals)
3. **Manifest** — metadata: session count, date range, export timestamp, extension version
4. **Participant note** (optional) — free-text field at export time: "Anything you want the researcher to know about this export?"

That last one is gold for research. It gives participants a final voice:
- "I deleted 2 sessions because they were about a personal project, not work"
- "The API key in session 12 was a test key, but I let it get redacted anyway"
- "I missed a few days in week 2 because I was on vacation"

### Suggested export-time prompt:

> "Optional: Anything you'd like the researcher to know about these sessions?"  
> (textarea, can be skipped)  
>  
> `[Include Note & Export]` `[Skip — Just Export]`

---

## 8. Consent & Trust Messaging

### The LLM sees their data — address this transparently

The technical design routes diary content through `vscode.lm` (the Copilot API). This means an LLM processes their prompts for redaction. For participants who think about this:

**In the study consent form (not in the extension — this is researcher's job):**
> "Before exporting, the extension uses your existing GitHub Copilot subscription to scan entries for sensitive information. This uses the same AI infrastructure Copilot already uses when you code. No additional data sharing occurs."

**In the extension, on first export:**
> "The redaction scan uses your Copilot subscription to identify sensitive content. This is the same AI that powers your code completions — no new services or accounts are involved."

### One-time trust decision, not repeated

Don't ask "are you sure you want the AI to scan?" every time. That trains participants to click through warnings. Show it once (first export), then remember their choice.

---

## 9. Summary of Interaction Flow

```
Participant ready to export
         │
         ├── Cmd+Shift+P → "Copilot Diary: Export Sessions"
         │   (or clicks notification reminder)
         │
         ▼
┌─── Scan preference ────────────────────────────┐
│ "How would you like to prepare your export?"    │
│                                                │
│  > 🔒 Smart scan (AI-powered, recommended)     │
│    📋 Basic scan (pattern matching only)        │
│    📤 Export as-is (I'll review manually)       │
│    🗑️  Manage sessions first (delete/review)    │
└────────────────────────────────────────────────┘
         │
         ▼ (Smart scan selected)
┌─── Progress ───────────────────────────────────┐
│ "Scanning your entries for sensitive info…      │
│  ████████████░░░░░░░░ 32/47 sessions"          │
│                                        [Cancel] │
└────────────────────────────────────────────────┘
         │
         ▼
┌─── Summary ────────────────────────────────────┐
│ "🔒 Found 12 items to protect:                 │
│  3 API keys · 4 paths · 2 emails · 3 URLs     │
│                                                │
│  Originals unchanged. Only the export copy     │
│  is modified."                                 │
│                                                │
│  [✅ Export]  [🔍 Review Details]  [Cancel]     │
└────────────────────────────────────────────────┘
         │                    │
         │ (happy path)       │ (wants to check)
         │                    ▼
         │         ┌─── Item List (toggleable) ───┐
         │         │ ☑ API key — session 3        │
         │         │ ☑ API key — session 7        │
         │         │ ☑ Token — session 7          │
         │         │ ☑ Path — session 4           │
         │         │ ☐ URL — session 12 (undo!)   │
         │         │   ...                        │
         │         │ [Apply] [Full Diff] [Cancel] │
         │         └──────────────────────────────┘
         │                    │
         ▼                    ▼
┌─── Optional note ──────────────────────────────┐
│ "Anything for the researcher to know?"          │
│ [text area]                                    │
│ [Include Note & Export]  [Skip — Just Export]   │
└────────────────────────────────────────────────┘
         │
         ▼
┌─── Save dialog ────────────────────────────────┐
│ (System file picker — default: Desktop)         │
│ diary-export-2025-02-15.zip                    │
└────────────────────────────────────────────────┘
         │
         ▼
┌─── Confirmation ───────────────────────────────┐
│ "✅ Exported 47 sessions.                       │
│  Share this file with your researcher:          │
│  [configured delivery instructions]"            │
│                                                │
│  [Open File Location] [Copy Path] [Done]       │
└────────────────────────────────────────────────┘
```

---

## 10. What I'd Change in the Technical Design

Having reviewed Lorelai and Rory's architecture doc, my recommendations:

| Their design | My suggestion | Why |
|---|---|---|
| Diff editor as primary review | Make it Layer 3, not Layer 1 | Most participants won't need it; a summary is faster |
| Quick pick for scan choice | ✅ Keep as-is | Minimal, appropriate gravity |
| ZIP default export | ✅ Keep as-is | Familiar to devs, preserves structure |
| No participant note field | Add one at export time | Invaluable research context (see §7) |
| No configurable delivery message | Add `copilotDiary.exportInstructions` setting | Different studies, different handoff methods |
| "Delete sessions before exporting" as a choice | Integrate it as "Manage Sessions" in the scan choice menu | Deletion shouldn't feel like it's instead of scanning — it's prep work |
| No first-run explanation of LLM usage | Add one-time info message on first export | Proactive trust, prevents surprise |

---

## 11. Consent Form Language (for Irina to include in study materials)

> **Data Export & AI-Assisted Redaction**
>
> When you export your diary entries at the end of the study, the extension will offer to scan for sensitive information (passwords, API keys, personal identifiers) using your existing GitHub Copilot subscription. This scan runs through the same infrastructure that powers your everyday Copilot code completions — no additional services or data processors are involved.
>
> You will see a summary of what was found and can approve, modify, or reject any redaction before the export is created. You may also delete individual diary entries at any time. The exported file is the only thing shared with the research team; your original entries remain on your machine.
>
> You are always in control of what is shared.

---

## 12. Annotation Review: "Do I still want to say this?"

> Added in response to Irina's requirement: participants should be able to review their own annotations before exporting.

### The Problem This Solves

Annotations are the most *personal* part of the diary. The conversation log is something Copilot generated in collaboration with the participant — but the annotation is 100% the participant's own words and judgment:

- **"What were you trying to do?"** → reveals their goals, possibly exposing internal projects
- **"Copilot got the job done" (Likert)** → a judgment they made in-the-moment that they may now disagree with
- **"What worked well or didn't?"** → raw reflection, possibly written while frustrated or exuberant

Participants logged these entries **days or weeks ago**. They may not remember what they wrote. When they discover an old annotation at export time, the reaction might be:

- "Oh god, I wrote that while I was really frustrated — I don't want the researcher to think I'm always like that"
- "Wait, I said 'Strongly disagree' but the session actually worked fine — I was just annoyed at a different thing"
- "I mentioned my coworker by name in the reflection"
- "I described an internal project that I shouldn't be sharing"

**This is DIFFERENT from redaction.** Redaction catches secrets (API keys, tokens, PII patterns). Annotation review is about the participant's *comfort with their own qualitative self-expression*.

### Where It Goes in the Flow: BEFORE Redaction

```
┌─────────────────────────────────────────────────────────────┐
│  EXPORT FLOW (REVISED)                                       │
│                                                             │
│  1. Command palette → "Copilot Diary: Export Sessions"       │
│  2. Scan preference (Smart/Basic/As-is/Manage sessions)      │
│  3. ★ ANNOTATION REVIEW ← new step                          │
│     "Review what you wrote before we scan for secrets"       │
│  4. Redaction scan (LLM processes included sessions)         │
│  5. Redaction summary + review (existing Layer 1/2/3)        │
│  6. Optional participant note                                │
│  7. Save dialog → Export                                     │
└─────────────────────────────────────────────────────────────┘
```

**Why before redaction:**

| Reason | Explanation |
|--------|-------------|
| **Efficiency** | If participant excludes 5 sessions during annotation review, the LLM doesn't waste tokens scanning them |
| **Cognitive flow** | "First decide what you want to share" → "Then let us make it safe" is natural escalation |
| **Separation of concerns** | Annotation review = your words, your comfort. Redaction = system protecting you from secrets. Different mental models. |
| **Prevents confusion** | If combined, participant might think redaction changes their annotations (it doesn't) or that annotation editing changes the conversation (it shouldn't) |

**Why NOT after redaction:**
- Participant sees the redaction summary saying "47 sessions scanned" — then goes back and excludes 5? Now the count is wrong and they feel disoriented.
- Psychologically: finding out your annotations are embarrassing AFTER you've already committed to sharing them creates regret, not comfort.

**Why NOT combined with redaction:**
- Redaction review is about a *system action* (LLM flagged these items — do you agree?). Annotation review is about a *personal action* (you wrote this — do you still want to share it?). Combining them conflates the participant's agency with the system's work.
- The UI needs are different: redaction is a checklist of flagged items. Annotation review is a scrollable journal with edit-in-place.

### Should Participants Be Able to Edit Ratings?

**Yes — but preserve the original. Here's why this is the right call:**

#### Arguments for allowing edits:
- **Participant comfort** → if they feel locked into a rating they now disagree with, they may exclude the entire session rather than share a "wrong" rating. We lose the whole entry.
- **In-moment ratings can be noisy** → participant may have been annoyed at something unrelated (build was broken, meeting ran late) and rated Copilot harshly by spillover.
- **Research relationship** → telling participants "you can't change what you said" feels coercive. Diary studies depend on willing participation.
- **Reduces the "delete entire entry" impulse** → if they can adjust a rating from "Strongly disagree" to "Disagree," they keep the session in the export instead of deleting it entirely.

#### Arguments against (and why they don't override):
- **In-moment ratings have ecological validity** — TRUE, and we address this by *preserving the original*
- **Participants might "clean up" all ratings to look better** — POSSIBLE but unlikely for 50 entries; also mitigated by the researcher seeing the edit history
- **Cognitive load of reconsidering 50 ratings** — addressed by making edit optional (read-only by default; click to edit)

#### Solution: Edit with provenance

```json
{
  "annotation": {
    "task": "Setting up Azure deployment for my service",
    "gotTheJobDone": "Disagree",
    "gotTheJobDone_original": "Strongly disagree",
    "gotTheJobDone_editedAt": "2025-02-15T10:30:00Z",
    "reflection": "It gave me the wrong CLI command but...",
    "reflection_original": null,
    "reflection_editedAt": null
  }
}
```

- `_original` fields are only present when an edit occurred
- `_editedAt` tells the researcher when the revision happened (at export time, not in-situ)
- The researcher gets BOTH the ecological in-moment data AND the reflective reassessment
- This is actually **richer data** — the gap between original and revised reveals something about how participants' perceptions change over time

#### What we tell participants:

> "You can update any of your entries. If you change a rating or edit your notes, the researcher will see your updated version (along with a note that it was revised)."

This is honest. No hidden tracking. But it also reduces the motivation to game ratings — they know the researcher sees "revised."

### The UX: Lightweight Webview Panel

**This is the one justified use of a webview in the extension.**

Why we break the "no webview" constraint here:
- Participants have 10–50+ sessions to scan through
- QuickPick can't show multi-line content legibly
- They need to read, compare, and possibly edit — that's a *document* interaction, not a *picker* interaction
- This is a one-time use at export (not a daily UI), so the weight is justified
- It's similar to VS Code's built-in "Release Notes" or "Welcome" tab — a one-shot informational webview

#### Layout: Session Journal View

```
┌─────────────────────────────────────────────────────────────────┐
│  📋 Review Your Diary Annotations                    [Select All]│
│                                                      [Clear All] │
│  "Take a moment to re-read what you wrote. You can edit,        │
│   exclude, or leave entries as-is. Only included entries         │
│   will be exported."                                            │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ☑ Jan 14, 2025 · 10:32 AM                          [Expand ▼] │
│    Task: "Setting up Azure deployment pipeline"                 │
│    Rating: ★★★★☆ Agree                                         │
│    Reflection: "Worked well once I figured out the right..."    │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ☑ Jan 15, 2025 · 3:47 PM                           [Expand ▼] │
│    Task: "Debugging auth token refresh"                         │
│    Rating: ★☆☆☆☆ Strongly disagree                             │
│    Reflection: "This was incredibly frustrating. It kept..."    │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ☐ Jan 16, 2025 · 9:15 AM                [EXCLUDED] [Expand ▼] │
│    Task: "Personal project stuff"                               │
│    Rating: ★★★★★ Strongly agree                                │
│    Reflection: "Great experience but this was a side project."  │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ... (scrollable)                                               │
│                                                                 │
│  ────────────────────────────────────────────────────────────── │
│  47 sessions · 45 included · 2 excluded                         │
│  [← Back]           [Continue to Security Scan →]               │
└─────────────────────────────────────────────────────────────────┘
```

#### Expanded/Edit State:

```
┌─────────────────────────────────────────────────────────────────┐
│  ☑ Jan 15, 2025 · 3:47 PM                         [Collapse ▲] │
│                                                                 │
│  What were you trying to do?                                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Debugging auth token refresh in the new microservice     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                    [Edit ✏️]     │
│                                                                 │
│  Copilot got the job done:                                      │
│  ○ Strongly agree  ○ Agree  ○ Neither  ● Disagree  ○ Strongly  │
│                                                   disagree      │
│                                    (was: Strongly disagree)      │
│                                                                 │
│  What worked well or didn't?                                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ This was incredibly frustrating. It kept suggesting the  │    │
│  │ wrong token endpoint. I ended up finding the answer on   │    │
│  │ Stack Overflow. The Azure SDK docs were more helpful     │    │
│  │ than Copilot here.                                       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                    [Edit ✏️]     │
│                                                                 │
│  Conversation: 12 turns · 3 min duration                        │
│  (Conversation content will be scanned for secrets in next step)│
│                                                                 │
│  [Exclude This Session]                                         │
└─────────────────────────────────────────────────────────────────┘
```

### Key UX Decisions

| Decision | Rationale |
|----------|-----------|
| **Default: all sessions included** | Opt-out is lower friction than opt-in. Participant signed up for a diary study — the default should be "share" with easy escape hatches. |
| **Collapsed by default** | Scanning 50 sessions at a glance. They only expand ones that catch their eye. |
| **First line of reflection visible** | Enough to jog memory ("oh right, that frustrating session") without requiring a click |
| **Rating shown as stars** | Visual shorthand — they can spot their low-rated sessions instantly (★☆☆☆☆ stands out) |
| **Edit is behind a click** | Read-only default prevents accidental changes. Deliberate edit requires intent. |
| **"was: original value" shown on edits** | Transparency — participant knows researcher sees both. No surprises. |
| **No edit for timestamps or conversation content** | Timestamps are facts. Conversation content is handled by redaction, not here. |
| **Session count footer** | "45 included · 2 excluded" gives confidence they know what's being exported |
| **"Continue to Security Scan →"** | Clear that this is step 1 of 2. Annotation review THEN redaction. |

### What Happens to Excluded Sessions

- Excluded sessions are **not scanned** by the LLM (saves tokens and time)
- Excluded sessions are **not in the export ZIP**
- Excluded sessions are **NOT deleted from local storage** — participant keeps their personal journal
- If they change their mind later, they can re-export and include them

Messaging when excluding:
> "This session won't be included in your export. It'll still be saved locally in your diary."

### Skip Option: For Participants Who Don't Want to Re-read

Some participants will not want to revisit 50 entries. Respect their time:

```
┌─────────────────────────────────────────────────────────────────┐
│  📋 Review Your Diary Annotations                               │
│                                                                 │
│  You have 47 diary entries. Would you like to review your       │
│  annotations before exporting?                                  │
│                                                                 │
│  [Review My Entries]  [Skip — Include All]                      │
│                                                                 │
│  "Skipping means all 47 entries will be included as-is.         │
│   You can still remove sessions during the security scan step." │
└─────────────────────────────────────────────────────────────────┘
```

This skip option is important because:
- Informed consent doesn't require line-by-line review — it requires the *opportunity* to review
- Some participants trust their past selves ("I already annotated carefully, I'm fine")
- Forcing review makes the export feel onerous → lower completion rates

### Research Methodology Impact

| Consideration | Impact |
|---------------|--------|
| **Ecological validity of ratings** | Preserved via `_original` field. Researcher has both timepoints. |
| **Retrospective bias** | Real but mitigated: most participants won't bother editing 50 ratings. Those who DO edit are telling us something valuable (their perception shifted). |
| **Data completeness** | INCREASES: participants who would have deleted an entire session because of one regretted annotation can now just edit it and keep the session. |
| **Researcher analysis** | Rating edit rate itself is a signal: if 30% of entries get revised ratings, that tells us something about in-moment vs. reflective assessment of Copilot quality. |
| **Participant trust** | "You can see everything and change anything" → less anxiety during logging phase → more honest initial annotations. The export review is a *promise they can rely on while logging*. |

### One More Thing: Pre-export Nudge During Study

During the study (not just at export), participants should know they'll have a chance to review. Add this to the post-logging confirmation:

> "✅ Session logged. You'll be able to review and edit all your entries before exporting."

This single line changes behavior throughout the entire study. It means:
- Participants don't agonize over their annotation phrasing in the moment
- They feel safer logging quickly ("I can fix this later")
- They log MORE because the stakes of each individual entry feel lower
- They write more honestly because they know they'll have an edit pass

**This is the single highest-value design decision in this document.** The annotation review step doesn't just serve export — its *existence* improves the quality of logging across the entire study period.

---

## 13. Revised Complete Flow (with Annotation Review)

```
Participant ready to export
         │
         ├── Cmd+Shift+P → "Copilot Diary: Export Sessions"
         │
         ▼
┌─── Scan preference ────────────────────────────┐
│ "How would you like to prepare your export?"    │
│                                                │
│  > 🔒 Smart scan (AI-powered, recommended)     │
│    📋 Basic scan (pattern matching only)        │
│    📤 Export as-is (I'll review manually)       │
└────────────────────────────────────────────────┘
         │
         ▼
┌─── Annotation Review Gate ─────────────────────┐
│ "You have 47 diary entries. Review your         │
│  annotations before exporting?"                 │
│                                                │
│  [Review My Entries]  [Skip — Include All]      │
└────────────────────────────────────────────────┘
         │                         │
         │ (review)                │ (skip)
         ▼                         │
┌─── Annotation Review (Webview) ────────────────┐
│  Scrollable list of sessions                   │
│  • Read annotations                            │
│  • Edit task/reflection text                   │
│  • Change ratings (original preserved)         │
│  • Exclude sessions via checkbox               │
│                                                │
│  [Continue to Security Scan →]                 │
└────────────────────────────────────────────────┘
         │                         │
         ▼◄────────────────────────┘
┌─── Redaction Scan ─────────────────────────────┐
│  "Scanning included entries for secrets…        │
│   ████████████░░░ 32/45 sessions"              │
│   (only scans INCLUDED sessions)        [Cancel]│
└────────────────────────────────────────────────┘
         │
         ▼
┌─── Redaction Summary (existing flow) ──────────┐
│  "🔒 Found 10 items to protect..."              │
│  [Export]  [Review Details]  [Cancel]           │
└────────────────────────────────────────────────┘
         │
         ▼
┌─── Optional participant note ──────────────────┐
│ "Anything for the researcher to know?"          │
│ [Include Note & Export]  [Skip — Just Export]   │
└────────────────────────────────────────────────┘
         │
         ▼
┌─── Save + Confirmation (existing flow) ────────┐
│  Save dialog → confirmation → done             │
└────────────────────────────────────────────────┘
```

### Key change from previous flow:
- **Removed** "Manage sessions first" as a separate scan-preference option — it's now the annotation review step that naturally handles inclusion/exclusion
- **Added** the annotation review gate between scan preference and actual scanning
- **Redaction only processes included sessions** — respects participant's choices from annotation review

---

*Ready for squad discussion. Ping 🏗️ Lorelai to reconcile this with the technical architecture, 🧪 Paris for test scenarios around the review flow, ⚛️ Emily for feasibility of the three-layer QuickPick → List → Diff pattern and the annotation review webview.*
