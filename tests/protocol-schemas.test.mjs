import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
    validateDocument,
    validateStream,
} from '../src/protocol/validate-fixture.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const expectedSchemas = [
    'auth-status.schema.json',
    'doctor.schema.json',
    'error.schema.json',
    'init.schema.json',
    'json-result.schema.json',
    'message.schema.json',
    'models-list.schema.json',
    'reasoning-summary.schema.json',
    'result.schema.json',
    'sessions-list.schema.json',
    'tool-result.schema.json',
    'tool-use.schema.json',
];

const samples = {
    'models-list.schema.json': {
        schemaVersion: 1,
        models: [
            {
                id: 'model-1',
                displayName: 'Model 1',
                isDefault: true,
                available: true,
                inputTypes: ['text'],
            },
        ],
    },
    'sessions-list.schema.json': {
        schemaVersion: 1,
        sessions: [
            {
                id: 'ses-1',
                title: 'Test',
                createdAt: '2026-07-18T00:00:00Z',
                updatedAt: '2026-07-18T00:00:01Z',
                modelId: 'model-1',
            },
        ],
    },
    'auth-status.schema.json': {
        authenticated: false,
        account: null,
        credentialSource: null,
    },
    'doctor.schema.json': {
        ok: true,
        cliVersion: '0.1.0',
        protocolVersions: [1],
        checks: [{ name: 'installation', status: 'pass' }],
    },
    'json-result.schema.json': {
        protocolVersion: 1,
        requestId: 'req-1',
        sessionId: 'ses-1',
        status: 'success',
        content: 'ok',
        model: { id: 'model-1' },
        usage: null,
        turns: 1,
        durationMs: 1,
        error: null,
    },
};

test('all frozen v1 document Schemas compile and validate their public examples', async () => {
    const files = (await readdir(resolve(root, 'protocol/v1')))
        .filter(
            (name) =>
                name.endsWith('.schema.json') && name !== 'common.schema.json',
        )
        .sort();
    assert.deepEqual(files, expectedSchemas.toSorted());

    for (const [schema, sample] of Object.entries(samples)) {
        const accepted = await validateDocument(schema, sample);
        assert.equal(
            accepted.valid,
            true,
            `${schema}: ${accepted.errors.join('; ')}`,
        );
        const { [Object.keys(sample)[0]]: _required, ...missingRequired } =
            sample;
        const rejected = await validateDocument(schema, missingRequired);
        assert.equal(
            rejected.valid,
            false,
            `${schema} accepted a missing required field`,
        );
    }
});

test('tool result status and error must agree semantically', async () => {
    const source =
        [
            {
                type: 'init',
                protocolVersion: 1,
                requestId: 'req',
                sessionId: 'ses',
                resumed: false,
                model: { id: 'model' },
                permissionMode: 'default',
                attachments: [],
            },
            {
                type: 'tool_use',
                toolCallId: 'tool',
                name: 'read_file',
                input: {},
            },
            {
                type: 'tool_result',
                toolCallId: 'tool',
                status: 'success',
                output: {},
                error: { code: 'TOOL_FAILED', message: 'contradiction' },
            },
            {
                type: 'result',
                requestId: 'req',
                sessionId: 'ses',
                status: 'success',
                content: '',
                usage: null,
                turns: 1,
                durationMs: 1,
                error: null,
            },
        ]
            .map(JSON.stringify)
            .join('\n') + '\n';

    const result = await validateStream(source, { exitCode: 0 });
    assert.equal(result.valid, false);
    assert.ok(
        result.errors.some((error) =>
            error.includes('successful tool_result requires error null'),
        ),
    );
});

test('failed Terminal Results use the fixed Machine Error Code exit mapping', async () => {
    const source =
        [
            {
                type: 'init',
                protocolVersion: 1,
                requestId: 'req',
                sessionId: null,
                resumed: false,
                model: null,
                permissionMode: 'default',
                attachments: [],
            },
            {
                type: 'error',
                code: 'INVALID_ARGUMENT',
                message: 'bad input',
                recoverable: false,
                details: null,
            },
            {
                type: 'result',
                requestId: 'req',
                sessionId: null,
                status: 'failed',
                content: '',
                usage: null,
                turns: 0,
                durationMs: 1,
                error: { code: 'INVALID_ARGUMENT', message: 'bad input' },
            },
        ]
            .map(JSON.stringify)
            .join('\n') + '\n';

    const wrongExit = await validateStream(source, { exitCode: 1 });
    assert.equal(wrongExit.valid, false);
    assert.ok(
        wrongExit.errors.some((error) =>
            error.includes('INVALID_ARGUMENT requires exit 42'),
        ),
    );

    const correctExit = await validateStream(source, { exitCode: 42 });
    assert.equal(correctExit.valid, true, correctExit.errors.join('; '));
});

test('a non-recoverable error must be immediately followed by result', async () => {
    const source =
        [
            {
                type: 'init',
                protocolVersion: 1,
                requestId: 'req',
                sessionId: 'ses',
                resumed: false,
                model: { id: 'model' },
                permissionMode: 'default',
                attachments: [],
            },
            {
                type: 'error',
                code: 'TIMEOUT',
                message: 'timed out',
                recoverable: false,
                details: null,
            },
            {
                type: 'message',
                messageId: 'msg',
                role: 'assistant',
                delta: 'too late',
            },
            {
                type: 'result',
                requestId: 'req',
                sessionId: 'ses',
                status: 'failed',
                content: 'too late',
                usage: null,
                turns: 1,
                durationMs: 1,
                error: { code: 'TIMEOUT', message: 'timed out' },
            },
        ]
            .map(JSON.stringify)
            .join('\n') + '\n';

    const result = await validateStream(source, { exitCode: 1 });
    assert.equal(result.valid, false);
    assert.ok(
        result.errors.some((error) =>
            error.includes(
                'non-recoverable error must be followed immediately by result',
            ),
        ),
    );
});
