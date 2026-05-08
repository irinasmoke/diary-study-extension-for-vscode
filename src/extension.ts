import * as vscode from 'vscode';
import * as os from 'os';
import { collectAnnotations } from './annotationFlow';
import { saveSession, DIARY_DIR } from './sessionStorage';
import { createStatusBarItem } from './statusBar';
import { extractTurns, extractFilesReferenced, extractWorkspaceContext, extractModelInfo, inferAgentMode } from './sessionCapture';

async function handleDiaryRequest(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
): Promise<vscode.ChatResult> {
    const turns = extractTurns(context.history);
    const filesReferenced = extractFilesReferenced(context.history);
    const workspaceContext = extractWorkspaceContext();
    const modelInfo = extractModelInfo(request);
    const agentMode = inferAgentMode(context.history);

    if (turns.length === 0) {
        stream.markdown(
            '⚠️ No conversation history found in this chat session. '
            + 'Have a conversation with Copilot first, then come back and say `@diary /log`.',
        );
        return { metadata: { command: 'log' } };
    }

    const annotation = await collectAnnotations();

    if (annotation === null) {
        stream.markdown('Session not logged — your conversation is still here if you\'d like to try again.');
        return { metadata: { command: 'log' } };
    }

    try {
        const filepath = await saveSession(
            turns,
            filesReferenced,
            workspaceContext,
            annotation,
            modelInfo,
            agentMode,
            annotation.task,
        );
        const displayPath = filepath.replace(os.homedir(), '~');
        stream.markdown(`✅ Session logged to \`${displayPath}\``);

        // Show notification with action buttons (easier to notice than in-chat text)
        const choice = await vscode.window.showInformationMessage(
            `Diary entry saved to ${displayPath}`,
            'Open File',
            'View All Entries',
        );
        if (choice === 'Open File') {
            const doc = await vscode.workspace.openTextDocument(filepath);
            await vscode.window.showTextDocument(doc, { preview: true });
        } else if (choice === 'View All Entries') {
            await vscode.commands.executeCommand('copilotDiary.viewAllEntries');
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const safeMessage = message.replace(os.homedir(), '~');
        stream.markdown(`❌ Something went wrong saving your diary entry. Please try again.\n\nDetails: ${safeMessage}`);
    }

    return { metadata: { command: 'log' } };
}

export function activate(context: vscode.ExtensionContext) {
    // Chat participant
    const participant = vscode.chat.createChatParticipant('copilotDiary.diary', handleDiaryRequest);
    participant.iconPath = new vscode.ThemeIcon('notebook');
    context.subscriptions.push(participant);

    // Status bar button
    const statusBar = createStatusBarItem();
    context.subscriptions.push(statusBar);

    // Command: log session — opens chat with @diary /log
    const logCommand = vscode.commands.registerCommand(
        'copilotDiary.logSession',
        async () => {
            await vscode.commands.executeCommand('workbench.action.chat.open', { query: '@diary /log' });
        },
    );
    context.subscriptions.push(logCommand);

    // Command: view all diary entries in OS file manager
    const viewAllCommand = vscode.commands.registerCommand(
        'copilotDiary.viewAllEntries',
        async () => {
            await vscode.env.openExternal(vscode.Uri.file(DIARY_DIR));
        },
    );
    context.subscriptions.push(viewAllCommand);
}

export function deactivate() {}
