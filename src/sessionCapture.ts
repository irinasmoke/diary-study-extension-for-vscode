import * as vscode from 'vscode';
import * as os from 'os';
import { SessionTurn, SessionModelInfo, AgentMode } from './sessionStorage';

/**
 * Extract a text representation from a single ChatResponsePart.
 * Handles markdown, anchor, and skips command-button parts.
 */
function extractPartText(part: vscode.ChatResponsePart): string {
    if (part instanceof vscode.ChatResponseMarkdownPart) {
        return part.value.value;
    }
    if (part instanceof vscode.ChatResponseAnchorPart) {
        const title = part.title ?? '';
        const uri = part.value instanceof vscode.Uri
            ? part.value.toString()
            : part.value.uri.toString();
        return `[${title}](${uri})`;
    }
    // Skip ChatResponseCommandButtonPart and unknown part types
    return '';
}

/**
 * Extract structured SessionTurn[] from ChatContext.history.
 *
 * Each ChatRequestTurn becomes a user turn; each ChatResponseTurn becomes
 * an assistant turn. Timestamps are approximated to the current time since
 * the API does not expose per-turn timestamps.
 */
export function extractTurns(
    history: ReadonlyArray<vscode.ChatRequestTurn | vscode.ChatResponseTurn>,
): SessionTurn[] {
    const turns: SessionTurn[] = [];
    const now = new Date();

    for (let i = 0; i < history.length; i++) {
        const entry = history[i];

        if (entry instanceof vscode.ChatRequestTurn) {
            const references = entry.references
                .map((ref) => {
                    if (ref.value instanceof vscode.Uri) {
                        return ref.value.fsPath;
                    }
                    if (ref.value instanceof vscode.Location) {
                        return ref.value.uri.fsPath;
                    }
                    if (typeof ref.value === 'string') {
                        return ref.value;
                    }
                    return undefined;
                })
                .filter((v): v is string => v !== undefined);

            const toolRefs = entry.toolReferences.map((t) => t.name);

            turns.push({
                role: 'user',
                content: entry.prompt,
                timestamp: now.toISOString(),
                participantId: entry.participant,
                command: entry.command,
                references: references.length > 0 ? references : undefined,
                toolReferences: toolRefs.length > 0 ? toolRefs : undefined,
            });
        } else if (entry instanceof vscode.ChatResponseTurn) {
            const content = entry.response
                .map(extractPartText)
                .join('');

            turns.push({
                role: 'assistant',
                content,
                timestamp: now.toISOString(),
                participantId: entry.participant,
                command: entry.command,
            });
        }
    }

    return turns;
}

/**
 * Extract model information from the current ChatRequest.
 *
 * NOTE: ChatRequest.model reflects the model selected for the CURRENT request.
 * Historical turns (ChatRequestTurn/ChatResponseTurn) do not expose which
 * model was used — this is the best signal available in the API today.
 */
export function extractModelInfo(request: vscode.ChatRequest): SessionModelInfo {
    return {
        id: request.model.id,
        family: request.model.family,
        name: request.model.name,
        vendor: request.model.vendor,
    };
}

/**
 * Infer the agent mode (Ask / Edit / Agent) from participant IDs in history.
 *
 * The VS Code Chat API does NOT expose an explicit mode enum. We infer it
 * from the `participant` string on history turns:
 *   - Participant IDs containing "edit" → Edit mode
 *   - Tool references present on requests → Agent mode (tool-use)
 *   - Default / "copilot" → Ask mode
 *
 * This heuristic checks the MOST RECENT request turn for the strongest signal,
 * since mode can change mid-session.
 */
export function inferAgentMode(
    history: ReadonlyArray<vscode.ChatRequestTurn | vscode.ChatResponseTurn>,
): AgentMode {
    // Walk backward to find the most recent request turn
    for (let i = history.length - 1; i >= 0; i--) {
        const entry = history[i];
        if (entry instanceof vscode.ChatRequestTurn) {
            const pid = entry.participant.toLowerCase();

            if (pid.includes('edit')) {
                return 'edit';
            }
            if (entry.toolReferences.length > 0 || pid.includes('agent')) {
                return 'agent';
            }
            return 'ask';
        }
    }
    return 'unknown';
}

/**
 * Collect unique file paths from all ChatPromptReferences in the history.
 */
export function extractFilesReferenced(
    history: ReadonlyArray<vscode.ChatRequestTurn | vscode.ChatResponseTurn>,
): string[] {
    const files = new Set<string>();

    for (const entry of history) {
        if (!(entry instanceof vscode.ChatRequestTurn)) {
            continue;
        }
        for (const ref of entry.references) {
            if (ref.value instanceof vscode.Uri) {
                files.add(ref.value.fsPath);
            } else if (ref.value instanceof vscode.Location) {
                files.add(ref.value.uri.fsPath);
            } else if (typeof ref.value === 'string') {
                files.add(ref.value);
            }
        }
    }

    const home = os.homedir();
    return [...files].map((f) => (f.startsWith(home) ? '~' + f.slice(home.length) : f));
}

/**
 * Derive workspace context from currently open documents.
 * Language IDs are de-duplicated; projectType is always "anonymous"
 * to avoid leaking identifying info about the participant's repo.
 */
export function extractWorkspaceContext(): {
    languages: string[];
    projectType: string;
} {
    const languages = new Set<string>();
    for (const doc of vscode.workspace.textDocuments) {
        if (doc.uri.scheme === 'file') {
            languages.add(doc.languageId);
        }
    }
    return {
        languages: [...languages],
        projectType: 'anonymous',
    };
}
