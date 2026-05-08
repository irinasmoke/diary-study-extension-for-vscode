import * as vscode from 'vscode';

let statusBarItem: vscode.StatusBarItem;

export function createStatusBarItem(): vscode.StatusBarItem {
    statusBarItem = vscode.window.createStatusBarItem(
        'copilotDiary.statusBar',
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBarItem.text = '$(notebook) Log Diary Entry';
    statusBarItem.name = 'Copilot Diary';
    statusBarItem.tooltip = 'Log this Copilot session to your diary';
    statusBarItem.command = 'copilotDiary.logSession';
    statusBarItem.show();
    return statusBarItem;
}

export async function showSuccess(): Promise<void> {
    if (statusBarItem) {
        const originalText = statusBarItem.text;
        statusBarItem.text = '$(check) Session logged';
        setTimeout(() => {
            statusBarItem.text = originalText;
        }, 3000);
    }
}

export async function showSkipped(): Promise<void> {
    if (statusBarItem) {
        const originalText = statusBarItem.text;
        statusBarItem.text = '$(dash) Not logged';
        setTimeout(() => {
            statusBarItem.text = originalText;
        }, 2000);
    }
}
