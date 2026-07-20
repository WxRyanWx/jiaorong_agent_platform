import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';

import { runProcess } from '../src/conformance/run-process.mjs';
import { validateStream } from '../src/protocol/validate-fixture.mjs';
import { startFakeCdpServer } from './helpers/fake-cdp-server.mjs';

const root = resolve(import.meta.dirname, '..');
const cli = resolve(root, 'tests/fixtures/app-backed-cli.mjs');

function appEnv(endpoint) {
    return {
        JIAORONG_CLI_TEST_CDP_ENDPOINT: endpoint,
        JIAORONG_CLI_TEST_APP_EXECUTABLE: process.execPath,
    };
}

async function streamRun(endpoint, args) {
    const result = await runProcess(
        cli,
        [...args, '--output-format', 'stream-json'],
        { cwd: root, env: appEnv(endpoint) },
    );
    const validation = await validateStream(result.stdout, {
        exitCode: result.exitCode,
    });
    return { result, validation };
}

test('a Session ID resumes the same JiaorongAI Session in a separate CLI process', async () => {
    const server = await startFakeCdpServer();
    try {
        const first = await streamRun(server.endpoint, ['-p', 'first turn']);
        assert.equal(first.result.exitCode, 0, first.result.stderr);
        assert.equal(first.validation.valid, true, first.validation.errors.join('; '));
        const sessionId = first.validation.events[0].sessionId;

        const second = await streamRun(server.endpoint, [
            '-p',
            'second turn',
            '--resume',
            sessionId,
        ]);
        assert.equal(second.result.exitCode, 0, second.result.stderr);
        assert.equal(
            second.validation.valid,
            true,
            second.validation.errors.join('; '),
        );
        assert.equal(second.validation.events[0].resumed, true);
        assert.equal(second.validation.events[0].sessionId, sessionId);
        assert.equal(second.validation.events.at(-1).sessionId, sessionId);
        assert.deepEqual(server.state.restoreInputs, [
            { sessionId: 'session-test' },
            { sessionId: 'session-test' },
            { sessionId: 'session-test' },
        ]);
        assert.deepEqual(server.state.setProjectDirInputs, [
            { sessionId: 'session-test', projectDir: root },
            { sessionId: 'session-test', projectDir: root },
        ]);
        assert.deepEqual(server.state.setPermissionModeInputs, [
            { sessionId: 'session-test', mode: 'default' },
            { sessionId: 'session-test', mode: 'default' },
        ]);
        assert.equal(server.state.createInputs.length, 1);
        assert.deepEqual(
            server.state.sendInputs.map(({ sessionId: value }) => value),
            ['session-test', 'session-test'],
        );
    } finally {
        await server.close();
    }
});

test('resume sends only the new prompt while JiaorongAI preserves prior context', async () => {
    const server = await startFakeCdpServer({
        respondWithSessionHistory: true,
    });
    try {
        const first = await streamRun(server.endpoint, [
            '-p',
            'CONTEXT_CANARY_ONE',
        ]);
        assert.equal(first.result.exitCode, 0, first.result.stderr);
        const sessionId = first.validation.events[0].sessionId;

        const second = await streamRun(server.endpoint, [
            '-p',
            'SECOND_PROMPT_ONLY',
            '--resume',
            sessionId,
        ]);
        assert.equal(second.result.exitCode, 0, second.result.stderr);
        assert.equal(second.validation.valid, true, second.validation.errors.join('; '));
        assert.equal(
            second.validation.events.at(-1).content,
            'CONTEXT_CANARY_ONE > SECOND_PROMPT_ONLY',
        );
        assert.deepEqual(
            server.state.sendInputs.map(({ content }) => content),
            ['CONTEXT_CANARY_ONE', 'SECOND_PROMPT_ONLY'],
        );
    } finally {
        await server.close();
    }
});

test('resume rejects a Session whose Shell tools were re-enabled', async () => {
    const server = await startFakeCdpServer();
    try {
        const first = await streamRun(server.endpoint, ['-p', 'create safe']);
        assert.equal(first.result.exitCode, 0, first.result.stderr);
        const sessionId = first.validation.events[0].sessionId;
        const sendsBefore = server.state.sendInputs.length;
        server.mutateSession(sessionId, { disabledAgentTools: [] });

        const resumed = await streamRun(server.endpoint, [
            '-p',
            'must not run',
            '--resume',
            sessionId,
        ]);
        assert.equal(resumed.result.exitCode, 42);
        assert.equal(resumed.validation.valid, true, resumed.validation.errors.join('; '));
        assert.equal(resumed.validation.events.at(-2).code, 'INVALID_ARGUMENT');
        assert.equal(server.state.sendInputs.length, sendsBefore);
    } finally {
        await server.close();
    }
});

test('resume does not stop or send into a non-idle JiaorongAI Session', async () => {
    const server = await startFakeCdpServer();
    try {
        const first = await streamRun(server.endpoint, ['-p', 'create safe']);
        assert.equal(first.result.exitCode, 0, first.result.stderr);
        const sessionId = first.validation.events[0].sessionId;
        const sendsBefore = server.state.sendInputs.length;
        const stopsBefore = server.state.stopInputs.length;
        server.mutateSession(sessionId, { status: 'generating' });

        const resumed = await streamRun(server.endpoint, [
            '-p',
            'must not interrupt the active turn',
            '--resume',
            sessionId,
        ]);
        assert.equal(resumed.result.exitCode, 42);
        assert.equal(resumed.validation.valid, true, resumed.validation.errors.join('; '));
        assert.equal(resumed.validation.events.at(-2).code, 'INVALID_ARGUMENT');
        assert.equal(server.state.sendInputs.length, sendsBefore);
        assert.equal(server.state.stopInputs.length, stopsBefore);
    } finally {
        await server.close();
    }
});

test('unknown and deleted Session IDs fail without creating replacements', async (t) => {
    await t.test('unknown Session', async () => {
        const server = await startFakeCdpServer();
        try {
            const run = await streamRun(server.endpoint, [
                '-p',
                'must fail',
                '--resume',
                'missing-session',
            ]);
            assert.equal(run.result.exitCode, 42);
            assert.equal(run.result.stderr, '');
            assert.equal(run.validation.valid, true, run.validation.errors.join('; '));
            assert.equal(run.validation.events[0].sessionId, null);
            assert.equal(run.validation.events.at(-2).code, 'INVALID_ARGUMENT');
            assert.deepEqual(server.state.createInputs, []);
            assert.deepEqual(server.state.sendInputs, []);
        } finally {
            await server.close();
        }
    });

    await t.test('deleted Session', async () => {
        const server = await startFakeCdpServer();
        try {
            const first = await streamRun(server.endpoint, ['-p', 'create']);
            const sessionId = first.validation.events[0].sessionId;
            server.deleteSession(sessionId);

            const resumed = await streamRun(server.endpoint, [
                '-p',
                'must fail',
                '--resume',
                sessionId,
            ]);
            assert.equal(resumed.result.exitCode, 42);
            assert.equal(
                resumed.validation.events.at(-2).code,
                'INVALID_ARGUMENT',
            );
            assert.equal(server.state.createInputs.length, 1);
            assert.equal(server.state.sendInputs.length, 1);
        } finally {
            await server.close();
        }
    });
});

test('malformed Session IDs are rejected before restore', async (t) => {
    for (const sessionId of ['', 'unsafe\nsession']) {
        await t.test(JSON.stringify(sessionId), async () => {
            const server = await startFakeCdpServer();
            try {
                const run = await streamRun(server.endpoint, [
                    '-p',
                    'must fail',
                    '--resume',
                    sessionId,
                ]);
                assert.equal(run.result.exitCode, 42);
                assert.equal(run.validation.valid, true, run.validation.errors.join('; '));
                assert.equal(run.validation.events.at(-2).code, 'INVALID_ARGUMENT');
                assert.deepEqual(server.state.restoreInputs, []);
                assert.deepEqual(server.state.createInputs, []);
            } finally {
                await server.close();
            }
        });
    }
});

test('concurrent CLI processes keep different Session streams isolated', async () => {
    const server = await startFakeCdpServer({
        sessionIds: ['session-a', 'session-b'],
        sharedRenderer: true,
        streamDelayMs: 50,
    });
    try {
        const [first, second] = await Promise.all([
            streamRun(server.endpoint, ['-p', 'parallel-a']),
            streamRun(server.endpoint, ['-p', 'parallel-b']),
        ]);
        for (const run of [first, second]) {
            assert.equal(run.result.exitCode, 0, run.result.stderr || run.result.stdout);
            assert.equal(run.validation.valid, true, run.validation.errors.join('; '));
        }
        assert.deepEqual(
            [first, second]
                .map(({ validation }) => validation.events[0].sessionId)
                .sort(),
            ['session-a', 'session-b'],
        );
        assert.equal(server.state.activeSubscriptions, 0);
        assert.equal(server.state.unsubscriptions, 12);
    } finally {
        await server.close();
    }
});

test('concurrent runs for one Session fail closed before a second stream starts', async () => {
    const server = await startFakeCdpServer({
        sessionIds: ['session-shared'],
        sharedRenderer: true,
        streamDelayMs: 80,
    });
    try {
        const created = await streamRun(server.endpoint, ['-p', 'create']);
        assert.equal(created.result.exitCode, 0, created.result.stderr);
        const sessionId = created.validation.events[0].sessionId;
        const sendsBefore = server.state.sendInputs.length;
        const projectConfigurationsBefore =
            server.state.setProjectDirInputs.length;
        const permissionConfigurationsBefore =
            server.state.setPermissionModeInputs.length;
        const permissionResetsBefore = server.state.stopInputs.length;

        const runs = await Promise.all([
            streamRun(server.endpoint, [
                '-p',
                'same-session-a',
                '--resume',
                sessionId,
            ]),
            streamRun(server.endpoint, [
                '-p',
                'same-session-b',
                '--resume',
                sessionId,
            ]),
        ]);
        assert.deepEqual(
            runs.map(({ result }) => result.exitCode).sort((a, b) => a - b),
            [0, 42],
        );
        const failed = runs.find(({ result }) => result.exitCode !== 0);
        assert.equal(failed.validation.valid, true, failed.validation.errors.join('; '));
        assert.equal(failed.validation.events.at(-2).code, 'INVALID_ARGUMENT');
        assert.equal(server.state.sendInputs.length, sendsBefore + 1);
        assert.equal(
            server.state.setProjectDirInputs.length,
            projectConfigurationsBefore + 1,
        );
        assert.equal(
            server.state.setPermissionModeInputs.length,
            permissionConfigurationsBefore + 1,
        );
        assert.equal(server.state.activeSubscriptions, 0);
        assert.equal(
            server.state.stopInputs.length,
            permissionResetsBefore + 2,
        );
        assert.deepEqual(
            server.state.stopInputs.slice(permissionResetsBefore),
            [{ sessionId }, { sessionId }],
        );
    } finally {
        await server.close();
    }
});

test('a resumed run ignores a retired request that arrives late for the same Session', async () => {
    const event = (requestId, content, terminal = false) =>
        terminal
            ? {
                  name: 'chat.stream.completed',
                  payload: {
                      requestId,
                      sessionId: 'session-shared',
                      messageId: `message-${requestId}`,
                      completedAt: 12,
                  },
              }
            : {
                  name: 'chat.stream.updated',
                  payload: {
                      kind: 'snapshot',
                      requestId,
                      sessionId: 'session-shared',
                      messageId: `message-${requestId}`,
                      updatedAt: 10,
                      blocks: [
                          {
                              id: 'content-test',
                              type: 'content',
                              content,
                              status: 'success',
                              timestamp: 9,
                          },
                      ],
                  },
              };
    const oldStream = [
        event('request-old', 'OLD'),
        event('request-old', '', true),
    ];
    const nextStream = [
        event('request-old', 'STALE'),
        event('request-old', '', true),
        event('request-new', 'FRESH'),
        event('request-new', '', true),
    ];
    const server = await startFakeCdpServer({
        sessionIds: ['session-shared'],
        sharedRenderer: true,
        streamEventsPerSend: [oldStream, nextStream],
    });
    try {
        const first = await streamRun(server.endpoint, ['-p', 'first']);
        assert.equal(first.result.exitCode, 0, first.result.stderr);
        const sessionId = first.validation.events[0].sessionId;
        const second = await streamRun(server.endpoint, [
            '-p',
            'second',
            '--resume',
            sessionId,
        ]);
        assert.equal(second.result.exitCode, 0, second.result.stderr || second.result.stdout);
        assert.equal(second.validation.valid, true, second.validation.errors.join('; '));
        assert.equal(second.validation.events.at(-1).content, 'FRESH');
        assert.doesNotMatch(second.result.stdout, /OLD|STALE/);
    } finally {
        await server.close();
    }
});

test('retired identity history fails closed at its 16,384 identity capacity', async () => {
    const retiredIdentityState = {
        bySession: Object.create(null),
        total: 16_384,
        saturated: true,
    };
    const server = await startFakeCdpServer({
        sharedRenderer: true,
        retiredIdentityState,
    });
    try {
        const run = await streamRun(server.endpoint, [
            '-p',
            'must fail before send',
        ]);
        assert.equal(run.result.exitCode, 1, run.result.stderr);
        assert.equal(
            run.validation.valid,
            true,
            run.validation.errors.join('; '),
        );
        assert.equal(
            run.validation.events.at(-1).error.code,
            'INTERNAL_ERROR',
        );
        assert.deepEqual(server.state.sendInputs, []);
        assert.equal(server.state.activeSubscriptions, 0);
        assert.equal(retiredIdentityState.total, 16_384);
        assert.equal(retiredIdentityState.saturated, true);
    } finally {
        await server.close();
    }
});

test('a validated failed terminal releases only its own Session lock', async () => {
    const failedStream = [
        {
            name: 'chat.stream.failed',
            payload: {
                requestId: 'request-failed',
                sessionId: 'session-shared',
                messageId: 'message-failed',
                failedAt: 12,
                error: 'private failure',
            },
        },
    ];
    const recoveredStream = [
        {
            name: 'chat.stream.updated',
            payload: {
                kind: 'snapshot',
                requestId: 'request-recovered',
                sessionId: 'session-shared',
                messageId: 'message-recovered',
                updatedAt: 20,
                blocks: [
                    {
                        id: 'content-recovered',
                        type: 'content',
                        content: 'RECOVERED',
                        status: 'success',
                        timestamp: 19,
                    },
                ],
            },
        },
        {
            name: 'chat.stream.completed',
            payload: {
                requestId: 'request-recovered',
                sessionId: 'session-shared',
                messageId: 'message-recovered',
                completedAt: 21,
            },
        },
    ];
    const server = await startFakeCdpServer({
        sessionIds: ['session-shared'],
        sharedRenderer: true,
        streamEventsPerSend: [failedStream, recoveredStream],
    });
    try {
        const first = await streamRun(server.endpoint, ['-p', 'fail']);
        assert.equal(first.result.exitCode, 1);
        assert.equal(first.validation.valid, true, first.validation.errors.join('; '));
        const sessionId = first.validation.events[0].sessionId;

        const second = await streamRun(server.endpoint, [
            '-p',
            'recover',
            '--resume',
            sessionId,
        ]);
        assert.equal(second.result.exitCode, 0, second.result.stderr || second.result.stdout);
        assert.equal(second.validation.valid, true, second.validation.errors.join('; '));
        assert.equal(second.validation.events.at(-1).content, 'RECOVERED');
        assert.equal(server.state.sendInputs.length, 2);
    } finally {
        await server.close();
    }
});

test('listener cleanup failure keeps the Session locked', async () => {
    const server = await startFakeCdpServer({
        sharedRenderer: true,
        unsubscribeThrowAt: [4, 5, 6],
    });
    try {
        const first = await streamRun(server.endpoint, ['-p', 'first']);
        assert.equal(first.result.exitCode, 1);
        assert.equal(first.validation.valid, true, first.validation.errors.join('; '));

        const second = await streamRun(server.endpoint, [
            '-p',
            'must not start',
            '--resume',
            'session-test',
        ]);
        assert.equal(second.result.exitCode, 42, second.result.stderr || second.result.stdout);
        assert.equal(second.validation.valid, true, second.validation.errors.join('; '));
        assert.equal(second.validation.events.at(-2).code, 'INVALID_ARGUMENT');
        assert.equal(server.state.sendInputs.length, 1);
    } finally {
        await server.close();
    }
});
