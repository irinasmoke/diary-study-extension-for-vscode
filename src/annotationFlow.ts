import * as vscode from 'vscode';

export interface SessionAnnotation {
    task: string;
    gotTheJobDone: string;
    reflection: string;
}

const LIKERT_OPTIONS = [
    'Strongly disagree',
    'Disagree',
    'Neither agree nor disagree',
    'Agree',
    'Strongly agree',
];

const TOTAL_STEPS = 3;

/** Show a text input step with back-button support. */
function showInputStep(
    title: string,
    prompt: string,
    placeholder: string,
    step: number,
    initialValue: string,
    validate?: (value: string) => string | undefined,
): Promise<{ value: string } | 'back' | 'cancel'> {
    return new Promise((resolve) => {
        const input = vscode.window.createInputBox();
        input.title = title;
        input.prompt = prompt;
        input.placeholder = placeholder;
        input.step = step;
        input.totalSteps = TOTAL_STEPS;
        input.value = initialValue;
        input.ignoreFocusOut = true;
        let resolved = false;

        if (validate) {
            input.onDidChangeValue((value) => {
                input.validationMessage = validate(value) ?? '';
            });
        }

        input.onDidAccept(() => {
            if (resolved) { return; }
            if (validate) {
                const error = validate(input.value);
                if (error) {
                    input.validationMessage = error;
                    return;
                }
            }
            resolved = true;
            const value = input.value;
            resolve({ value });
            input.dispose();
        });
        input.onDidTriggerButton((btn) => {
            if (btn === vscode.QuickInputButtons.Back) {
                if (resolved) { return; }
                resolved = true;
                resolve('back');
                input.dispose();
            }
        });
        input.onDidHide(() => {
            if (resolved) { return; }
            resolved = true;
            resolve('cancel');
            input.dispose();
        });

        if (step > 1) {
            input.buttons = [vscode.QuickInputButtons.Back];
        }
        input.show();
    });
}

/** Show a quick-pick step with back-button support. */
function showPickStep(
    title: string,
    placeholder: string,
    items: string[],
    step: number,
): Promise<{ value: string } | 'back' | 'cancel'> {
    return new Promise((resolve) => {
        const pick = vscode.window.createQuickPick();
        pick.title = title;
        pick.placeholder = placeholder;
        pick.items = items.map((label) => ({ label }));
        pick.step = step;
        pick.totalSteps = TOTAL_STEPS;
        pick.ignoreFocusOut = true;
        let resolved = false;

        pick.onDidAccept(() => {
            if (resolved) { return; }
            const selected = pick.selectedItems[0]?.label;
            if (selected) {
                resolved = true;
                resolve({ value: selected });
                pick.dispose();
            } else {
                resolved = true;
                resolve('cancel');
                pick.dispose();
            }
        });
        pick.onDidTriggerButton((btn) => {
            if (btn === vscode.QuickInputButtons.Back) {
                if (resolved) { return; }
                resolved = true;
                resolve('back');
                pick.dispose();
            }
        });
        pick.onDidHide(() => {
            if (resolved) { return; }
            resolved = true;
            resolve('cancel');
            pick.dispose();
        });

        if (step > 1) {
            pick.buttons = [vscode.QuickInputButtons.Back];
        }
        pick.show();
    });
}

/**
 * Three-step annotation flow with back-button navigation.
 * Returns null if participant cancels (Escape) at any step.
 */
export async function collectAnnotations(): Promise<SessionAnnotation | null> {
    const answers: { task: string; likert: string; reflection: string } = {
        task: '',
        likert: '',
        reflection: '',
    };
    let step = 1;

    while (step >= 1 && step <= TOTAL_STEPS) {
        if (step === 1) {
            const result = await showInputStep(
                'Copilot Diary',
                'What were you trying to do with Azure in this chat session?',
                'e.g., Deploying a Function App or configuring an Azure SQL database',
                1,
                answers.task,
                (v) => v.trim() ? undefined : 'Please describe what you were trying to do.',
            );
            if (result === 'cancel') { return null; }
            if (result === 'back') { step--; continue; }
            answers.task = result.value;
            step++;
        } else if (step === 2) {
            const result = await showPickStep(
                'Copilot Diary',
                'Rate this statement: "GitHub Copilot helped me complete what I was trying to do."',
                LIKERT_OPTIONS,
                2,
            );
            if (result === 'cancel') { return null; }
            if (result === 'back') { step--; continue; }
            answers.likert = result.value;
            step++;
        } else if (step === 3) {
            const result = await showInputStep(
                'Copilot Diary',
                'What worked well or didn\'t work well in this session? What would a great experience have looked like instead?',
                'Describe what happened and what you wish had happened…',
                3,
                answers.reflection,
            );
            if (result === 'cancel') { return null; }
            if (result === 'back') { step--; continue; }
            answers.reflection = result.value;
            step++;
        }
    }

    return {
        task: answers.task || '',
        gotTheJobDone: answers.likert,
        reflection: answers.reflection || '',
    };
}
