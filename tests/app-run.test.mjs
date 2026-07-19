import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';

import { runProcess } from '../src/conformance/run-process.mjs';
import {
    validateDocument,
    validateStream,
} from '../src/protocol/validate-fixture.mjs';
import { startFakeCdpServer } from './helpers/fake-cdp-server.mjs';

const root = resolve(import.meta.dirname, '..');
const cli = resolve(root, 'tests/fixtures/app-backed-cli.mjs');

function appEnv(endpoint, extra = {}) {
    return {
        JIAORONG_CLI_TEST_CDP_ENDPOINT: endpoint,
        JIAORONG_CLI_TEST_APP_EXECUTABLE: process.execPath,
        ...extra,
    };
}

function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function updated(overrides = {}) {
    return {
        name: 'chat.stream.updated',
        payload: {
            kind: 'snapshot',
            requestId: 'app-request-test',
            sessionId: 'session-test',
            messageId: 'message-test',
            updatedAt: 10,
            blocks: [
                {
                    id: 'content-test',
                    type: 'content',
                    content: 'partial',
                    status: 'pending',
                    timestamp: 9,
                },
            ],
            ...overrides,
        },
    };
}

function completed(overrides = {}) {
    return {
        name: 'chat.stream.completed',
        payload: {
            requestId: 'app-request-test',
            sessionId: 'session-test',
            messageId: 'message-test',
            completedAt: 12,
            ...overrides,
        },
    };
}

test('production App Backend preserves an arbitrary prompt and streams one real Session', async () => {
    const server = await startFakeCdpServer();
    const prompt =
        '中文 line\nquotes " and shell text $(touch should-not-run) `false`';
    try {
        const result = await runProcess(
            cli,
            ['-p', prompt, '--output-format', 'stream-json'],
            { cwd: root, env: appEnv(server.endpoint) },
        );

        assert.equal(result.exitCode, 0, result.stderr || result.stdout);
        assert.equal(result.stderr, '');
        const validation = await validateStream(result.stdout, {
            exitCode: result.exitCode,
        });
        assert.equal(validation.valid, true, validation.errors.join('; '));
        assert.deepEqual(
            validation.events.map(({ type }) => type),
            [
                'init',
                'message',
                'message',
                'result',
            ],
        );
        assert.equal(validation.events[0].sessionId, 'session-test');
        assert.equal(validation.events.at(-1).sessionId, 'session-test');
        assert.equal(validation.events.at(-1).content, 'Hello 世界');
        assert.deepEqual(server.state.createInputs, [
            {
                agentId: 'deepchat',
                message: '',
                projectDir: root,
                permissionMode: 'default',
                providerId: 'provider-test',
                modelId: 'model-test',
            },
        ]);
        assert.deepEqual(server.state.sendInputs, [
            { sessionId: 'session-test', content: prompt },
        ]);
        assert.equal(server.state.activeSubscriptions, 0);
    } finally {
        await server.close();
    }
});

test('stdin and all output modes project the same App Backend outcome', async () => {
    const server = await startFakeCdpServer();
    const prompt = 'stdin 中文\nsecond line "quoted"';
    try {
        const text = await runProcess(
            cli,
            ['--output-format', 'text'],
            { cwd: root, stdin: prompt, env: appEnv(server.endpoint) },
        );
        assert.equal(text.exitCode, 0, text.stderr);
        assert.equal(text.stdout, 'Hello 世界');
        assert.equal(text.stderr, '');

        const json = await runProcess(
            cli,
            ['-p', prompt, '--output-format', 'json'],
            { cwd: root, env: appEnv(server.endpoint) },
        );
        assert.equal(json.exitCode, 0, json.stderr);
        assert.equal(json.stderr, '');
        const jsonDocument = JSON.parse(json.stdout);
        assert.equal(jsonDocument.content, text.stdout);
        assert.equal(jsonDocument.sessionId, 'session-test');
        assert.deepEqual(
            (
                await validateDocument(
                    'json-result.schema.json',
                    jsonDocument,
                )
            ).errors,
            [],
        );

        const stream = await runProcess(
            cli,
            ['-p', prompt, '--output-format', 'stream-json'],
            { cwd: root, env: appEnv(server.endpoint) },
        );
        assert.equal(stream.exitCode, 0, stream.stderr);
        const validation = await validateStream(stream.stdout, {
            exitCode: stream.exitCode,
        });
        assert.equal(validation.valid, true, validation.errors.join('; '));
        assert.equal(validation.events.at(-1).content, text.stdout);

        assert.deepEqual(
            server.state.createInputs.map(({ message }) => message),
            ['', '', ''],
        );
        assert.deepEqual(
            server.state.sendInputs.map(({ content }) => content),
            [prompt, prompt, prompt],
        );
        assert.equal(server.state.activeSubscriptions, 0);
    } finally {
        await server.close();
    }
});

test('App Backend fails closed and cleans listeners for invalid stream boundaries', async (t) => {
    const scenarios = [
        {
            name: 'malformed snapshot',
            streamEvents: [updated({ blocks: null })],
        },
        {
            name: 'duplicate terminal',
            streamEvents: [updated(), completed(), completed()],
        },
        {
            name: 'crossed Session',
            streamEvents: [
                updated({ sessionId: 'session-other' }),
                completed(),
            ],
        },
        {
            name: 'crossed request',
            streamEvents: [
                updated(),
                completed({ requestId: 'app-request-other' }),
            ],
        },
        {
            name: 'bridge failed event',
            streamEvents: [
                updated(),
                {
                    name: 'chat.stream.failed',
                    payload: {
                        requestId: 'app-request-test',
                        sessionId: 'session-test',
                        messageId: 'message-test',
                        failedAt: 12,
                        error: 'private provider failure',
                    },
                },
            ],
        },
        {
            name: 'event buffer overflow',
            streamEvents: Array.from({ length: 129 }, (_, index) =>
                updated({
                    updatedAt: 10 + index,
                    blocks: [
                        {
                            id: 'content-test',
                            type: 'content',
                            content: 'x'.repeat(index + 1),
                            status: 'pending',
                            timestamp: 9,
                        },
                    ],
                }),
            ),
        },
        {
            name: 'oversized UTF-8 stream event',
            streamEvents: [
                updated({
                    blocks: [
                        {
                            id: 'content-test',
                            type: 'content',
                            content: '界'.repeat(20_000),
                            status: 'pending',
                            timestamp: 9,
                        },
                    ],
                }),
            ],
        },
    ];

    for (const scenario of scenarios) {
        await t.test(scenario.name, async () => {
            const server = await startFakeCdpServer({
                streamEvents: scenario.streamEvents,
            });
            try {
                const result = await runProcess(
                    cli,
                    ['-p', 'hello', '--output-format', 'stream-json'],
                    { cwd: root, env: appEnv(server.endpoint) },
                );
                assert.equal(result.exitCode, 1);
                assert.equal(result.stderr, '');
                const validation = await validateStream(result.stdout, {
                    exitCode: result.exitCode,
                });
                assert.equal(
                    validation.valid,
                    true,
                    validation.errors.join('; '),
                );
                assert.equal(validation.events.at(-2).type, 'error');
                assert.equal(
                    validation.events.at(-2).code,
                    'INTERNAL_ERROR',
                );
                assert.equal(validation.events.at(-1).type, 'result');
                assert.equal(validation.events.at(-1).status, 'failed');
                assert.equal(server.state.activeSubscriptions, 0);
                assert.doesNotMatch(result.stdout, /private provider failure/);
            } finally {
                await server.close();
            }
        });
    }
});

test('App Backend rejects an oversized UTF-8 prompt before Session creation', async () => {
    const server = await startFakeCdpServer();
    try {
        const result = await runProcess(
            cli,
            ['--output-format', 'stream-json'],
            {
                cwd: root,
                stdin: '界'.repeat(100_000),
                env: appEnv(server.endpoint),
            },
        );
        assert.equal(result.exitCode, 42);
        const validation = await validateStream(result.stdout, {
            exitCode: result.exitCode,
        });
        assert.equal(validation.valid, true, validation.errors.join('; '));
        assert.equal(validation.events.at(-2).code, 'INVALID_ARGUMENT');
        assert.deepEqual(server.state.createInputs, []);
        assert.deepEqual(server.state.sendInputs, []);
    } finally {
        await server.close();
    }
});

test('App Backend preserves a prompt whose JSON escaping would exceed the CDP limit', async () => {
    const server = await startFakeCdpServer();
    const prompt = '\0'.repeat(100_000);
    try {
        const result = await runProcess(
            cli,
            ['--output-format', 'stream-json'],
            {
                cwd: root,
                stdin: prompt,
                env: appEnv(server.endpoint),
            },
        );
        assert.equal(result.exitCode, 0, result.stderr || result.stdout);
        const validation = await validateStream(result.stdout, {
            exitCode: result.exitCode,
        });
        assert.equal(validation.valid, true, validation.errors.join('; '));
        assert.deepEqual(server.state.createInputs.map(({ message }) => message), [
            '',
        ]);
        assert.deepEqual(server.state.sendInputs, [
            { sessionId: 'session-test', content: prompt },
        ]);
        assert.equal(server.state.activeSubscriptions, 0);
    } finally {
        await server.close();
    }
});

test('renderer-local deadline cleans listeners when the start response is lost', async () => {
    const server = await startFakeCdpServer({
        dropRuntimeStartResponse: true,
        dropRuntimeCleanupRequest: true,
    });
    try {
        const result = await runProcess(
            cli,
            ['-p', 'hello', '--output-format', 'stream-json'],
            {
                cwd: root,
                env: appEnv(server.endpoint, {
                    JIAORONG_CLI_TEST_BRIDGE_INVOKE_TIMEOUT_MS: '50',
                    JIAORONG_CLI_TEST_RUN_TIMEOUT_MS: '50',
                }),
            },
        );
        assert.equal(result.exitCode, 1);
        await wait(150);
        assert.equal(server.state.activeSubscriptions, 0);
    } finally {
        await server.close();
    }
});

test('authoritative send identity is checked before any crossed event is emitted', async () => {
    const server = await startFakeCdpServer({
        sendResult: {
            accepted: true,
            requestId: 'authoritative-request',
            messageId: 'message-test',
        },
        streamRequestId: 'crossed-request',
    });
    try {
        const result = await runProcess(
            cli,
            ['-p', 'hello', '--output-format', 'stream-json'],
            { cwd: root, env: appEnv(server.endpoint) },
        );
        assert.equal(result.exitCode, 1);
        const validation = await validateStream(result.stdout, {
            exitCode: result.exitCode,
        });
        assert.equal(validation.valid, true, validation.errors.join('; '));
        assert.deepEqual(
            validation.events.map(({ type }) => type),
            ['init', 'error', 'result'],
        );
        assert.equal(validation.events.at(-1).content, '');
    } finally {
        await server.close();
    }
});

test('a terminal arriving between the final poll and cleanup fails explicitly', async () => {
    const server = await startFakeCdpServer({
        emitLateTerminalBeforeCleanup: true,
    });
    try {
        const result = await runProcess(
            cli,
            ['-p', 'hello', '--output-format', 'stream-json'],
            { cwd: root, env: appEnv(server.endpoint) },
        );
        assert.equal(result.exitCode, 1);
        const validation = await validateStream(result.stdout, {
            exitCode: result.exitCode,
        });
        assert.equal(validation.valid, true, validation.errors.join('; '));
        assert.equal(validation.events.at(-2).code, 'INTERNAL_ERROR');
        assert.equal(validation.events.at(-1).status, 'failed');
        assert.equal(server.state.activeSubscriptions, 0);
    } finally {
        await server.close();
    }
});
