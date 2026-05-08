import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { SessionAnnotation } from './annotationFlow';

export interface SessionTurn {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    participantId?: string;
    command?: string;
    references?: string[];
    toolReferences?: string[];
}

export interface SessionModelInfo {
    id: string;
    family: string;
    name: string;
    vendor: string;
}

export type AgentMode = 'ask' | 'edit' | 'agent' | 'unknown';

export interface DiarySession {
    schemaVersion: number;
    sessionId: string;
    timestamp: string;
    surface: string;
    model: SessionModelInfo | null;
    agentMode: AgentMode;
    turns: SessionTurn[];
    filesReferenced: string[];
    workspaceContext: {
        languages: string[];
        projectType: string;
    };
    annotation: SessionAnnotation | null;
}

export const DIARY_DIR = path.join(
    os.homedir(),
    '.copilot-diary',
    'sessions'
);

export function formatTimestamp(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function slugify(text: string, maxLength = 40): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, maxLength)
        .replace(/-$/, '');
}

export async function saveSession(
    turns: SessionTurn[],
    filesReferenced: string[],
    workspaceContext: { languages: string[]; projectType: string },
    annotation: SessionAnnotation | null,
    model: SessionModelInfo | null,
    agentMode: AgentMode,
    title?: string,
): Promise<string> {
    const now = new Date();

    const session: DiarySession = {
        schemaVersion: 1,
        sessionId: crypto.randomUUID(),
        timestamp: now.toISOString(),
        surface: 'VS Code',
        model,
        agentMode,
        turns,
        filesReferenced,
        workspaceContext,
        annotation,
    };

    await fs.promises.mkdir(DIARY_DIR, { recursive: true });

    const slug = title ? `-${slugify(title)}` : '';
    const filename = `${formatTimestamp(now)}${slug}-${session.sessionId.slice(0, 8)}.json`;
    const filepath = path.join(DIARY_DIR, filename);
    await fs.promises.writeFile(filepath, JSON.stringify(session, null, 2), 'utf-8');

    return filepath;
}
