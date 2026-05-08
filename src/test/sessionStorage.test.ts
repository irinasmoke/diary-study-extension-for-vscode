import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import {
    saveSession,
    DIARY_DIR,
    formatTimestamp,
    DiarySession,
    SessionTurn,
    SessionModelInfo,
    AgentMode,
} from '../sessionStorage';

// Track files created during tests for cleanup
const createdFiles: string[] = [];

after(async () => {
    for (const f of createdFiles) {
        try {
            await fs.promises.unlink(f);
        } catch {
            // file already removed
        }
    }
});

// ─── helpers ────────────────────────────────────────────────────────────────

const sampleModel: SessionModelInfo = {
    id: 'copilot-gpt-4o',
    family: 'gpt-4o',
    name: 'GPT-4o',
    vendor: 'copilot',
};

const defaultMode: AgentMode = 'ask';

function sampleTurns(): SessionTurn[] {
    const now = new Date();
    return [
        {
            role: 'user',
            content: 'How do I deploy to Azure?',
            timestamp: now.toISOString(),
            participantId: 'copilot',
        },
        {
            role: 'assistant',
            content: 'You can use the Azure CLI...',
            timestamp: now.toISOString(),
            participantId: 'copilot',
        },
    ];
}

const defaultCtx = { languages: [] as string[], projectType: 'anonymous' };

// ─── formatTimestamp ────────────────────────────────────────────────────────

describe('formatTimestamp', () => {
    it('formats a known date as YYYY-MM-DD-HHMMSS', () => {
        // Month is 0-indexed in JS Date constructor
        const date = new Date(2024, 0, 15, 9, 5, 3);
        assert.strictEqual(formatTimestamp(date), '2024-01-15-090503');
    });

    it('zero-pads single-digit months, days, hours, minutes, seconds', () => {
        const date = new Date(2024, 2, 3, 1, 2, 3);
        assert.strictEqual(formatTimestamp(date), '2024-03-03-010203');
    });

    it('handles midnight (00:00:00)', () => {
        const date = new Date(2024, 11, 31, 0, 0, 0);
        assert.strictEqual(formatTimestamp(date), '2024-12-31-000000');
    });

    it('handles end-of-day (23:59:59)', () => {
        const date = new Date(2024, 5, 15, 23, 59, 59);
        assert.strictEqual(formatTimestamp(date), '2024-06-15-235959');
    });
});

// ─── saveSession ────────────────────────────────────────────────────────────

describe('saveSession', () => {
    it('creates the diary directory if it does not exist', async () => {
        const filepath = await saveSession(sampleTurns(), [], defaultCtx, null, sampleModel, defaultMode);
        createdFiles.push(filepath);
        assert.ok(fs.existsSync(DIARY_DIR), `Expected ${DIARY_DIR} to exist`);
    });

    it('writes valid JSON to disk', async () => {
        const filepath = await saveSession(sampleTurns(), [], defaultCtx, null, sampleModel, defaultMode);
        createdFiles.push(filepath);
        const raw = await fs.promises.readFile(filepath, 'utf-8');
        assert.doesNotThrow(() => JSON.parse(raw), 'File content should be valid JSON');
    });

    it('saved JSON contains all DiarySession required fields', async () => {
        const filepath = await saveSession(sampleTurns(), ['src/index.ts'], defaultCtx, null, sampleModel, defaultMode);
        createdFiles.push(filepath);
        const session: DiarySession = JSON.parse(
            await fs.promises.readFile(filepath, 'utf-8'),
        );

        // Top-level scalars
        assert.ok(typeof session.sessionId === 'string' && session.sessionId.length > 0);
        assert.ok(!isNaN(Date.parse(session.timestamp)), 'timestamp must be ISO 8601');
        assert.strictEqual(session.surface, 'VS Code');

        // Arrays
        assert.ok(Array.isArray(session.turns));
        assert.ok(Array.isArray(session.filesReferenced));

        // Nested object
        assert.ok(typeof session.workspaceContext === 'object');
        assert.ok(Array.isArray(session.workspaceContext.languages));
        assert.strictEqual(session.workspaceContext.projectType, 'anonymous');
    });

    it('saves correctly when annotation is null', async () => {
        const filepath = await saveSession(sampleTurns(), [], defaultCtx, null, sampleModel, defaultMode);
        createdFiles.push(filepath);
        const session: DiarySession = JSON.parse(
            await fs.promises.readFile(filepath, 'utf-8'),
        );
        assert.strictEqual(session.annotation, null);
    });

    it('saves all annotation fields when a full annotation is provided', async () => {
        const annotation = {
            task: 'Building a REST API',
            gotTheJobDone: 'Agree',
            reflection: 'Copilot suggested good patterns',
        };
        const filepath = await saveSession(sampleTurns(), [], defaultCtx, annotation, sampleModel, defaultMode);
        createdFiles.push(filepath);
        const session: DiarySession = JSON.parse(
            await fs.promises.readFile(filepath, 'utf-8'),
        );

        assert.deepStrictEqual(session.annotation, annotation);
    });

    it('generates a unique sessionId for each save', async () => {
        const fp1 = await saveSession(sampleTurns(), [], defaultCtx, null, sampleModel, defaultMode);
        createdFiles.push(fp1);
        const s1: DiarySession = JSON.parse(await fs.promises.readFile(fp1, 'utf-8'));

        const fp2 = await saveSession(sampleTurns(), [], defaultCtx, null, sampleModel, defaultMode);
        createdFiles.push(fp2);
        const s2: DiarySession = JSON.parse(await fs.promises.readFile(fp2, 'utf-8'));

        assert.notStrictEqual(s1.sessionId, s2.sessionId);
    });

    it('filename includes UUID suffix (no title)', async () => {
        const filepath = await saveSession(sampleTurns(), [], defaultCtx, null, sampleModel, defaultMode);
        createdFiles.push(filepath);
        const filename = path.basename(filepath);
        assert.match(
            filename,
            /^\d{4}-\d{2}-\d{2}-\d{6}-[0-9a-f]{8}\.json$/,
            'No-title filename should be YYYY-MM-DD-HHMMSS-<uuid8>.json',
        );
    });

    it('filename includes slugified title when provided', async () => {
        const filepath = await saveSession(sampleTurns(), [], defaultCtx, null, sampleModel, defaultMode, 'Deploy to Azure');
        createdFiles.push(filepath);
        const filename = path.basename(filepath);
        assert.match(
            filename,
            /^\d{4}-\d{2}-\d{2}-\d{6}-deploy-to-azure-[0-9a-f]{8}\.json$/,
            'Filename should contain slugified title between timestamp and UUID',
        );
    });

    it('empty title produces valid filename without slug segment', async () => {
        const filepath = await saveSession(sampleTurns(), [], defaultCtx, null, sampleModel, defaultMode, '');
        createdFiles.push(filepath);
        const filename = path.basename(filepath);
        assert.match(
            filename,
            /^\d{4}-\d{2}-\d{2}-\d{6}-[0-9a-f]{8}\.json$/,
            'Empty title should behave same as no title',
        );
    });

    it('title with special characters slugifies to lowercase alphanumeric-dashes', async () => {
        const filepath = await saveSession(
            sampleTurns(), [], defaultCtx, null, sampleModel, defaultMode,
            'Fix bug #42: "null ref" in /api/users!',
        );
        createdFiles.push(filepath);
        const filename = path.basename(filepath);
        // Slug should only contain lowercase a-z, 0-9, and hyphens
        const slugMatch = filename.match(
            /^\d{4}-\d{2}-\d{2}-\d{6}-(.+)-[0-9a-f]{8}\.json$/,
        );
        assert.ok(slugMatch, 'Filename should contain a slug segment');
        const slug = slugMatch![1];
        assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug must be lowercase alphanum + hyphens');
    });

    it('UUID suffix is unique across saves (no collisions)', async () => {
        const paths: string[] = [];
        for (let i = 0; i < 5; i++) {
            const fp = await saveSession(sampleTurns(), [], defaultCtx, null, sampleModel, defaultMode, 'same title');
            createdFiles.push(fp);
            paths.push(fp);
        }
        const uuids = paths.map((fp) => {
            const match = path.basename(fp).match(/-([0-9a-f]{8})\.json$/);
            assert.ok(match, 'Each filename must end with UUID suffix');
            return match![1];
        });
        const uniqueUuids = new Set(uuids);
        assert.strictEqual(uniqueUuids.size, uuids.length, 'All UUID suffixes must be unique');
    });

    it('persists the provided turns verbatim', async () => {
        const turns = sampleTurns();
        const filepath = await saveSession(turns, [], defaultCtx, null, sampleModel, defaultMode);
        createdFiles.push(filepath);
        const session: DiarySession = JSON.parse(
            await fs.promises.readFile(filepath, 'utf-8'),
        );
        assert.deepStrictEqual(session.turns, turns);
    });

    it('persists filesReferenced and workspaceContext', async () => {
        const files = ['src/a.ts', 'src/b.ts'];
        const ctx = { languages: ['typescript', 'json'], projectType: 'anonymous' };
        const filepath = await saveSession(sampleTurns(), files, ctx, null, sampleModel, defaultMode);
        createdFiles.push(filepath);
        const session: DiarySession = JSON.parse(
            await fs.promises.readFile(filepath, 'utf-8'),
        );
        assert.deepStrictEqual(session.filesReferenced, files);
        assert.deepStrictEqual(session.workspaceContext, ctx);
    });
});

// ─── Schema validation ─────────────────────────────────────────────────────

describe('DiarySession schema validation', () => {
    it('a fully-populated session has correct types for all fields', async () => {
        const annotation = {
            task: 'Debugging auth flow',
            gotTheJobDone: 'Strongly agree',
            reflection: 'It was great',
        };
        const filepath = await saveSession(
            sampleTurns(),
            ['src/auth.ts', 'src/config.ts'],
            { languages: ['typescript', 'json'], projectType: 'anonymous' },
            annotation,
            sampleModel,
            defaultMode,
            'Auth debugging session',
        );
        createdFiles.push(filepath);
        const session: DiarySession = JSON.parse(
            await fs.promises.readFile(filepath, 'utf-8'),
        );

        // sessionId: non-empty string, UUID-shaped
        assert.strictEqual(typeof session.sessionId, 'string');
        assert.match(session.sessionId, /^[0-9a-f-]{36}$/, 'sessionId should be a UUID');

        // timestamp: valid ISO 8601
        assert.strictEqual(typeof session.timestamp, 'string');
        assert.ok(!isNaN(Date.parse(session.timestamp)), 'timestamp must parse as a date');

        // surface
        assert.strictEqual(session.surface, 'VS Code');

        // turns: array of objects with required role/content/timestamp
        assert.ok(Array.isArray(session.turns));
        assert.ok(session.turns.length > 0, 'turns should not be empty');
        for (const turn of session.turns) {
            assert.ok(['user', 'assistant'].includes(turn.role), `invalid role: ${turn.role}`);
            assert.strictEqual(typeof turn.content, 'string');
            assert.strictEqual(typeof turn.timestamp, 'string');
        }

        // filesReferenced: string[]
        assert.ok(Array.isArray(session.filesReferenced));
        for (const f of session.filesReferenced) {
            assert.strictEqual(typeof f, 'string');
        }

        // workspaceContext
        assert.strictEqual(typeof session.workspaceContext, 'object');
        assert.ok(Array.isArray(session.workspaceContext.languages));
        assert.strictEqual(typeof session.workspaceContext.projectType, 'string');

        // annotation (non-null)
        assert.ok(session.annotation !== null);
        assert.strictEqual(typeof session.annotation!.task, 'string');
        assert.strictEqual(typeof session.annotation!.gotTheJobDone, 'string');
        assert.strictEqual(typeof session.annotation!.reflection, 'string');
    });

    it('a session with null annotation still has all other required fields', async () => {
        const filepath = await saveSession(
            sampleTurns(), [], defaultCtx, null, sampleModel, defaultMode,
        );
        createdFiles.push(filepath);
        const session: DiarySession = JSON.parse(
            await fs.promises.readFile(filepath, 'utf-8'),
        );

        const requiredKeys: (keyof DiarySession)[] = [
            'sessionId', 'timestamp', 'surface', 'model', 'agentMode',
            'turns', 'filesReferenced', 'workspaceContext', 'annotation',
        ];
        for (const key of requiredKeys) {
            assert.ok(key in session, `missing required field: ${key}`);
        }
        assert.strictEqual(session.annotation, null);
    });

    it('SessionTurn optional fields are preserved when set', async () => {
        const turns: SessionTurn[] = [
            {
                role: 'user',
                content: 'test prompt',
                timestamp: new Date().toISOString(),
                participantId: 'copilot',
                command: 'log',
                references: ['/path/to/file.ts'],
            },
        ];
        const filepath = await saveSession(turns, [], defaultCtx, null, sampleModel, defaultMode);
        createdFiles.push(filepath);
        const session: DiarySession = JSON.parse(
            await fs.promises.readFile(filepath, 'utf-8'),
        );
        const saved = session.turns[0];
        assert.strictEqual(saved.participantId, 'copilot');
        assert.strictEqual(saved.command, 'log');
        assert.deepStrictEqual(saved.references, ['/path/to/file.ts']);
    });
});
