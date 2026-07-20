import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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

function failed(overrides = {}) {
    return {
        name: 'chat.stream.failed',
        payload: {
            requestId: 'app-request-test',
            sessionId: 'session-test',
            messageId: 'message-test',
            failedAt: 12,
            error: 'cancelled',
            ...overrides,
        },
    };
}

function toolUpdated({
    name = 'read',
    params = { path: 'README.md' },
    status = 'pending',
    response,
    action = false,
    actionStatus = 'pending',
    needsUserAction = true,
    content,
    argsComplete = status !== 'pending',
    requestId,
    permissionType = name === 'exec' ? 'command' : 'read',
    permissionToolName = name,
    permissionServerName = 'agent-filesystem',
    permissionPaths =
        typeof params.path === 'string' ? [resolve(root, params.path)] : [],
    permissionCommand = params.command,
} = {}) {
    const toolCall = {
        id: 'tool-read-1',
        name,
        params,
        ...(response === undefined ? {} : { response }),
    };
    return updated({
        ...(requestId === undefined ? {} : { requestId }),
        blocks: [
            {
                id: 'tool-read-block',
                type: 'tool_call',
                status,
                timestamp: 9,
                tool_call: toolCall,
                extra: { toolCallArgsComplete: argsComplete },
            },
            ...(action
                ? [
                      {
                          id: 'permission-action',
                          type: 'action',
                          action_type: 'tool_call_permission',
                          status: actionStatus,
                          timestamp: 10,
                          tool_call: toolCall,
                          extra: {
                              needsUserAction,
                              permissionType,
                              toolName: permissionToolName,
                              serverName: permissionServerName,
                              permissionRequest: JSON.stringify({
                                  toolName: permissionToolName,
                                  serverName: permissionServerName,
                                  permissionType,
                                  description: 'Permission required.',
                                  ...(permissionPaths.length === 0
                                      ? {}
                                      : { paths: permissionPaths }),
                                  ...(permissionCommand === undefined
                                      ? {}
                                      : {
                                            command: permissionCommand,
                                            commandSignature: 'fake-signature',
                                        }),
                              }),
                          },
                      },
                  ]
                : []),
            ...(content === undefined
                ? []
                : [
                      {
                          id: 'content-test',
                          type: 'content',
                          content,
                          status: 'success',
                          timestamp: 11,
                      },
                  ]),
        ],
    });
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
                disabledAgentTools: ['exec', 'process'],
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

test('default mode denies an owned permission interaction through the real response route and the Agent can recover', async () => {
    const server = await startFakeCdpServer({
        streamEvents: [
            toolUpdated({
                status: 'success',
                response: '',
                action: true,
                argsComplete: true,
            }),
        ],
        responseStreamEvents: [
            toolUpdated({
                status: 'error',
                response: 'User denied the request.',
                action: true,
                actionStatus: 'denied',
                needsUserAction: false,
                content: 'Recovered safely.',
                requestId: 'app-request-resumed',
            }),
            completed({ requestId: 'app-request-resumed' }),
        ],
    });
    try {
        const result = await runProcess(
            cli,
            ['-p', 'read then recover', '--output-format', 'stream-json'],
            { cwd: root, env: appEnv(server.endpoint) },
        );
        assert.equal(result.exitCode, 0, result.stderr || result.stdout);
        const validation = await validateStream(result.stdout, {
            exitCode: result.exitCode,
        });
        assert.equal(validation.valid, true, validation.errors.join('; '));
        assert.deepEqual(
            validation.events.map(({ type }) => type),
            ['init', 'tool_use', 'tool_result', 'message', 'result'],
        );
        assert.equal(validation.events[2].status, 'failed');
        assert.equal(
            validation.events[2].error.code,
            'PERMISSION_DENIED',
        );
        assert.equal(validation.events.at(-1).status, 'success');
        assert.equal(validation.events.at(-1).content, 'Recovered safely.');
        assert.deepEqual(server.state.respondToolInteractionInputs, [
            {
                sessionId: 'session-test',
                messageId: 'message-test',
                toolCallId: 'tool-read-1',
                response: { kind: 'permission', granted: false },
            },
        ]);
    } finally {
        await server.close();
    }
});

test('a successful App tool is projected once without a permission response', async () => {
    const server = await startFakeCdpServer({
        streamEvents: [
            toolUpdated(),
            toolUpdated({
                status: 'success',
                response: 'READ_CANARY',
                content: 'READ_CANARY',
            }),
            completed(),
        ],
    });
    try {
        const result = await runProcess(
            cli,
            ['-p', 'read README', '--output-format', 'stream-json'],
            { cwd: root, env: appEnv(server.endpoint) },
        );
        assert.equal(result.exitCode, 0, result.stderr || result.stdout);
        const validation = await validateStream(result.stdout, {
            exitCode: result.exitCode,
        });
        assert.equal(validation.valid, true, validation.errors.join('; '));
        assert.deepEqual(
            validation.events.map(({ type }) => type),
            ['init', 'tool_use', 'tool_result', 'message', 'result'],
        );
        assert.equal(validation.events[2].status, 'success');
        assert.deepEqual(validation.events[2].output, {
            content: 'READ_CANARY',
            truncated: false,
        });
        assert.deepEqual(server.state.respondToolInteractionInputs, []);
    } finally {
        await server.close();
    }
});

test('a run failure closes every already-published tool before the Terminal Result', async () => {
    const server = await startFakeCdpServer({
        streamEvents: [toolUpdated(), completed()],
    });
    try {
        const result = await runProcess(
            cli,
            ['-p', 'incomplete tool', '--output-format', 'stream-json'],
            { cwd: root, env: appEnv(server.endpoint) },
        );
        assert.equal(result.exitCode, 1);
        const validation = await validateStream(result.stdout, {
            exitCode: result.exitCode,
        });
        assert.equal(validation.valid, true, validation.errors.join('; '));
        assert.deepEqual(
            validation.events.map(({ type }) => type),
            ['init', 'tool_use', 'tool_result', 'error', 'result'],
        );
        assert.equal(validation.events[2].status, 'failed');
        assert.equal(validation.events[2].error.code, 'INTERNAL_ERROR');
    } finally {
        await server.close();
    }
});

test('full-access CLI runs keep JiaorongAI in default mode', async () => {
    const server = await startFakeCdpServer();
    try {
        const result = await runProcess(
            cli,
            [
                '-p',
                'trusted run',
                '--permission-mode',
                'full_access',
                '--output-format',
                'stream-json',
            ],
            { cwd: root, env: appEnv(server.endpoint) },
        );
        assert.equal(result.exitCode, 0, result.stderr || result.stdout);
        assert.deepEqual(server.state.setProjectDirInputs, [
            { sessionId: 'session-test', projectDir: root },
        ]);
        assert.deepEqual(server.state.setPermissionModeInputs, [
            { sessionId: 'session-test', mode: 'default' },
        ]);
        assert.equal(server.state.createInputs[0].permissionMode, 'default');
    } finally {
        await server.close();
    }
});

test('an invalid interaction response still closes the published tool pair', async () => {
    const server = await startFakeCdpServer({
        streamEvents: [
            toolUpdated({
                status: 'success',
                response: '',
                action: true,
                argsComplete: true,
            }),
        ],
        respondToolInteractionResult: { accepted: false },
    });
    try {
        const result = await runProcess(
            cli,
            ['-p', 'must fail closed', '--output-format', 'stream-json'],
            { cwd: root, env: appEnv(server.endpoint) },
        );
        assert.equal(result.exitCode, 1);
        const validation = await validateStream(result.stdout, {
            exitCode: result.exitCode,
        });
        assert.equal(validation.valid, true, validation.errors.join('; '));
        assert.deepEqual(
            validation.events.map(({ type }) => type),
            ['init', 'tool_use', 'tool_result', 'error', 'result'],
        );
        assert.equal(validation.events[2].error.code, 'INTERNAL_ERROR');
    } finally {
        await server.close();
    }
});

test('full-access grants a correlated file request inside an Additional Directory', async () => {
    const additionalDirectory = await mkdtemp(
        resolve(tmpdir(), 'jiaorong-cli-tool-add-dir-'),
    );
    const target = resolve(additionalDirectory, 'note.txt');
    const permissionEvent = {
        params: { path: target },
        permissionPaths: [target],
    };
    const server = await startFakeCdpServer({
        streamEvents: [
            toolUpdated({
                ...permissionEvent,
                status: 'success',
                response: '',
                action: true,
            }),
        ],
        responseStreamEvents: [
            toolUpdated({
                ...permissionEvent,
                status: 'success',
                response: 'ADDITIONAL_CANARY',
                action: true,
                actionStatus: 'granted',
                needsUserAction: false,
                content: 'Additional Directory read completed.',
                requestId: 'app-request-resumed',
            }),
            completed({ requestId: 'app-request-resumed' }),
        ],
    });
    try {
        const result = await runProcess(
            cli,
            [
                '-p',
                'read the authorized additional file',
                '--permission-mode',
                'full_access',
                '--add-dir',
                additionalDirectory,
                '--output-format',
                'stream-json',
            ],
            { cwd: root, env: appEnv(server.endpoint) },
        );
        assert.equal(result.exitCode, 0, result.stderr || result.stdout);
        const validation = await validateStream(result.stdout, {
            exitCode: result.exitCode,
        });
        assert.equal(validation.valid, true, validation.errors.join('; '));
        assert.deepEqual(server.state.respondToolInteractionInputs, [
            {
                sessionId: 'session-test',
                messageId: 'message-test',
                toolCallId: 'tool-read-1',
                response: { kind: 'permission', granted: true },
            },
        ]);
        assert.deepEqual(server.state.setPermissionModeInputs, [
            { sessionId: 'session-test', mode: 'default' },
        ]);
    } finally {
        await rm(additionalDirectory, { recursive: true, force: true });
        await server.close();
    }
});

test('an Additional Directory grant cannot carry into a later run that omits it', async () => {
    const additionalDirectory = await mkdtemp(
        resolve(tmpdir(), 'jiaorong-cli-tool-cache-'),
    );
    const target = resolve(additionalDirectory, 'cached-note.txt');
    const permissionEvent = {
        params: { path: target },
        permissionPaths: [target],
    };
    const action = (requestId) =>
        toolUpdated({
            ...permissionEvent,
            status: 'success',
            response: '',
            action: true,
            requestId,
        });
    const server = await startFakeCdpServer({
        permissionCacheTarget: target,
        streamEventsPerSend: [
            [action('permission-cache-run-a')],
            [action('permission-cache-run-b')],
        ],
        cachedPermissionStreamEvents: [
            toolUpdated({
                ...permissionEvent,
                status: 'success',
                response: 'CACHED_GRANT_LEAKED',
                content: 'A stale permission was reused.',
                requestId: 'permission-cache-run-b-cached',
            }),
            completed({ requestId: 'permission-cache-run-b-cached' }),
        ],
        responseStreamEventsPerResponse: [
            [
                toolUpdated({
                    ...permissionEvent,
                    status: 'success',
                    response: 'ADDITIONAL_CACHE_CANARY',
                    action: true,
                    actionStatus: 'granted',
                    needsUserAction: false,
                    content: 'Authorized once.',
                    requestId: 'permission-cache-run-a-resumed',
                }),
                completed({ requestId: 'permission-cache-run-a-resumed' }),
            ],
            [
                toolUpdated({
                    ...permissionEvent,
                    status: 'error',
                    response: 'User denied the request.',
                    action: true,
                    actionStatus: 'denied',
                    needsUserAction: false,
                    content: 'Stale permission denied.',
                    requestId: 'permission-cache-run-b-resumed',
                }),
                completed({ requestId: 'permission-cache-run-b-resumed' }),
            ],
        ],
    });
    try {
        const first = await runProcess(
            cli,
            [
                '-p',
                'authorize the additional file once',
                '--permission-mode',
                'full_access',
                '--add-dir',
                additionalDirectory,
                '--output-format',
                'stream-json',
            ],
            { cwd: root, env: appEnv(server.endpoint) },
        );
        assert.equal(first.exitCode, 0, first.stderr || first.stdout);
        const firstValidation = await validateStream(first.stdout, {
            exitCode: first.exitCode,
        });
        assert.equal(
            firstValidation.valid,
            true,
            firstValidation.errors.join('; '),
        );
        const sessionId = firstValidation.events[0].sessionId;

        const second = await runProcess(
            cli,
            [
                '-p',
                'attempt the same file without an additional directory',
                '--permission-mode',
                'full_access',
                '--resume',
                sessionId,
                '--output-format',
                'stream-json',
            ],
            { cwd: root, env: appEnv(server.endpoint) },
        );
        assert.equal(second.exitCode, 0, second.stderr || second.stdout);
        const secondValidation = await validateStream(second.stdout, {
            exitCode: second.exitCode,
        });
        assert.equal(
            secondValidation.valid,
            true,
            secondValidation.errors.join('; '),
        );
        const denied = secondValidation.events.find(
            (event) => event.type === 'tool_result',
        );
        assert.equal(denied?.status, 'failed');
        assert.equal(denied?.error.code, 'PERMISSION_DENIED');
        assert.equal(server.state.permissionCacheHits, 0);
        assert.deepEqual(server.state.stopInputs, [
            { sessionId },
            { sessionId },
            { sessionId },
            { sessionId },
        ]);
    } finally {
        await rm(additionalDirectory, { recursive: true, force: true });
        await server.close();
    }
});

test('a permission cache reset failure prevents the prompt from being sent', async () => {
    const server = await startFakeCdpServer({ stopStreamThrowAt: [1, 2] });
    try {
        const result = await runProcess(
            cli,
            ['-p', 'must not be sent', '--output-format', 'stream-json'],
            { cwd: root, env: appEnv(server.endpoint) },
        );
        assert.equal(result.exitCode, 1);
        const validation = await validateStream(result.stdout, {
            exitCode: result.exitCode,
        });
        assert.equal(validation.valid, true, validation.errors.join('; '));
        assert.equal(validation.events.at(-2).code, 'INTERNAL_ERROR');
        assert.deepEqual(server.state.sendInputs, []);
        assert.deepEqual(server.state.stopInputs, [
            { sessionId: 'session-test' },
            { sessionId: 'session-test' },
        ]);
    } finally {
        await server.close();
    }
});

test('crossed Project Root readback fails closed before prompt send', async () => {
    const server = await startFakeCdpServer({
        setProjectDirResult: {
            session: { id: 'session-test', projectDir: '/tmp/crossed-root' },
        },
    });
    try {
        const result = await runProcess(
            cli,
            ['-p', 'must not send', '--output-format', 'stream-json'],
            { cwd: root, env: appEnv(server.endpoint) },
        );
        assert.equal(result.exitCode, 1, result.stderr || result.stdout);
        assert.equal(server.state.sendInputs.length, 0);
    } finally {
        await server.close();
    }
});

test('crossed Permission Mode readback fails closed before prompt send', async () => {
    const server = await startFakeCdpServer({
        permissionModeReadback: 'full_access',
    });
    try {
        const result = await runProcess(
            cli,
            ['-p', 'must not send', '--output-format', 'stream-json'],
            { cwd: root, env: appEnv(server.endpoint) },
        );
        assert.equal(result.exitCode, 1, result.stderr || result.stdout);
        assert.equal(server.state.sendInputs.length, 0);
    } finally {
        await server.close();
    }
});

test('full-access denies a correlated file request outside every authorized root', async () => {
    const outsideDirectory = await mkdtemp(
        resolve(tmpdir(), 'jiaorong-cli-tool-outside-'),
    );
    const target = resolve(outsideDirectory, 'outside.txt');
    const permissionEvent = {
        params: { path: target },
        permissionPaths: [target],
    };
    const server = await startFakeCdpServer({
        streamEvents: [
            toolUpdated({
                ...permissionEvent,
                status: 'success',
                response: '',
                action: true,
            }),
        ],
        responseStreamEvents: [
            toolUpdated({
                ...permissionEvent,
                status: 'error',
                response: 'User denied the request.',
                action: true,
                actionStatus: 'denied',
                needsUserAction: false,
                content: 'Outside access denied.',
                requestId: 'app-request-resumed',
            }),
            completed({ requestId: 'app-request-resumed' }),
        ],
    });
    try {
        const result = await runProcess(
            cli,
            [
                '-p',
                'attempt outside read',
                '--permission-mode',
                'full_access',
                '--output-format',
                'stream-json',
            ],
            { cwd: root, env: appEnv(server.endpoint) },
        );
        assert.equal(result.exitCode, 0, result.stderr || result.stdout);
        const validation = await validateStream(result.stdout, {
            exitCode: result.exitCode,
        });
        assert.equal(validation.valid, true, validation.errors.join('; '));
        assert.equal(validation.events[2].error.code, 'PERMISSION_DENIED');
        assert.deepEqual(server.state.respondToolInteractionInputs, [
            {
                sessionId: 'session-test',
                messageId: 'message-test',
                toolCallId: 'tool-read-1',
                response: { kind: 'permission', granted: false },
            },
        ]);
    } finally {
        await rm(outsideDirectory, { recursive: true, force: true });
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

test('App Backend ignores another Session stream while consuming its own', async () => {
    const server = await startFakeCdpServer({
        streamEvents: [
            updated({ sessionId: 'session-other' }),
            updated(),
            completed(),
        ],
    });
    try {
        const result = await runProcess(
            cli,
            ['-p', 'hello', '--output-format', 'stream-json'],
            { cwd: root, env: appEnv(server.endpoint) },
        );
        assert.equal(result.exitCode, 0, result.stderr || result.stdout);
        const validation = await validateStream(result.stdout, {
            exitCode: result.exitCode,
        });
        assert.equal(validation.valid, true, validation.errors.join('; '));
        assert.equal(validation.events.at(-1).content, 'partial');
        assert.equal(server.state.activeSubscriptions, 0);
    } finally {
        await server.close();
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
        dropRuntimeStartResponseCount: 1,
        dropRuntimeCleanupRequestCount: 1,
        sharedRenderer: true,
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
        assert.deepEqual(server.state.stopInputs, [
            { sessionId: 'session-test' },
            { sessionId: 'session-test' },
        ]);
        const second = await runProcess(
            cli,
            [
                '-p',
                'must not start',
                '--resume',
                'session-test',
                '--output-format',
                'stream-json',
            ],
            {
                cwd: root,
                env: appEnv(server.endpoint, {
                    JIAORONG_CLI_TEST_BRIDGE_INVOKE_TIMEOUT_MS: '50',
                    JIAORONG_CLI_TEST_RUN_TIMEOUT_MS: '50',
                }),
            },
        );
        assert.equal(second.exitCode, 42, second.stderr || second.stdout);
        const validation = await validateStream(second.stdout, {
            exitCode: second.exitCode,
        });
        assert.equal(validation.valid, true, validation.errors.join('; '));
        assert.equal(validation.events.at(-2).code, 'INVALID_ARGUMENT');
        assert.equal(server.state.sendInputs.length, 1);
    } finally {
        await server.close();
    }
});

test('renderer-local deadline prevents a delayed preflight reset from sending', async () => {
    let resetCalls = 0;
    const server = await startFakeCdpServer({
        sharedRenderer: true,
        async beforeInvoke(route) {
            if (route === 'chat.stopStream' && ++resetCalls === 1)
                await wait(120);
        },
    });
    try {
        const result = await runProcess(
            cli,
            ['-p', 'must not start', '--output-format', 'stream-json'],
            {
                cwd: root,
                env: appEnv(server.endpoint, {
                    JIAORONG_CLI_TEST_BRIDGE_INVOKE_TIMEOUT_MS: '50',
                    JIAORONG_CLI_TEST_RUN_TIMEOUT_MS: '50',
                }),
            },
        );
        assert.equal(result.exitCode, 1);
        await wait(200);
        assert.deepEqual(server.state.sendInputs, []);
        assert.equal(server.state.activeSubscriptions, 0);
        assert.ok(server.state.stopInputs.length >= 1);
    } finally {
        await server.close();
    }
});

test('SIGINT stops the exact active App run and waits for its cancelled terminal', async () => {
    const server = await startFakeCdpServer({
        sendResult: {
            accepted: true,
            requestId: 'app-request-test',
            messageId: 'message-test',
        },
        streamEvents: [
            toolUpdated({ status: 'loading', argsComplete: true }),
        ],
        stopStreamEvents: [failed()],
    });
    try {
        const result = await runProcess(
            cli,
            ['-p', 'cancel me', '--output-format', 'stream-json'],
            {
                cwd: root,
                env: appEnv(server.endpoint),
                signals: [
                    {
                        signal: 'SIGINT',
                        afterStdout: '"type":"tool_use"',
                    },
                ],
            },
        );
        assert.equal(result.signal, null);
        assert.equal(result.exitCode, 130, result.stderr || result.stdout);
        const validation = await validateStream(result.stdout, {
            exitCode: result.exitCode,
        });
        assert.equal(validation.valid, true, validation.errors.join('; '));
        assert.equal(validation.events.at(-1).status, 'cancelled');
        assert.equal(validation.events.at(-1).error.code, 'CANCELLED');
        const toolResult = validation.events.find(
            ({ type }) => type === 'tool_result',
        );
        assert.equal(toolResult.status, 'cancelled');
        assert.deepEqual(server.state.stopInputs.at(-2), {
            sessionId: 'session-test',
            requestId: 'app-request-test',
        });
        assert.equal(server.state.activeSubscriptions, 0);
    } finally {
        await server.close();
    }
});

test('SIGINT stops a queued App run by its exclusively locked Session before request identity arrives', async () => {
    const server = await startFakeCdpServer({
        sendResult: {
            accepted: true,
            requestId: null,
            messageId: null,
        },
        streamEvents: [],
        stopStreamEvents: [failed()],
    });
    try {
        const result = await runProcess(
            cli,
            ['-p', 'cancel queued', '--output-format', 'stream-json'],
            {
                cwd: root,
                env: appEnv(server.endpoint),
                signals: [
                    {
                        signal: 'SIGINT',
                        afterStdout: '"type":"init"',
                        delayMs: 20,
                    },
                ],
            },
        );
        assert.equal(result.exitCode, 130, result.stderr || result.stdout);
        const validation = await validateStream(result.stdout, {
            exitCode: result.exitCode,
        });
        assert.equal(validation.valid, true, validation.errors.join('; '));
        assert.equal(validation.events.at(-1).status, 'cancelled');
        assert.deepEqual(server.state.stopInputs.at(-2), {
            sessionId: 'session-test',
        });
        assert.equal(server.state.activeSubscriptions, 0);
    } finally {
        await server.close();
    }
});

test('SIGINT stops while the real-style sendMessage promise is still invoking', async () => {
    const server = await startFakeCdpServer({
        sendWaitsForStop: true,
        streamEvents: [],
        sendResult: {
            accepted: true,
            requestId: 'app-request-test',
            messageId: 'message-test',
        },
        streamEvents: [],
        stopStreamEvents: [failed()],
    });
    try {
        const result = await runProcess(
            cli,
            ['-p', 'cancel invoking', '--output-format', 'stream-json'],
            {
                cwd: root,
                env: appEnv(server.endpoint),
                signals: [
                    {
                        signal: 'SIGINT',
                        afterStdout: '"type":"init"',
                        delayMs: 20,
                    },
                ],
            },
        );
        assert.equal(result.exitCode, 130, result.stderr || result.stdout);
        const validation = await validateStream(result.stdout, {
            exitCode: result.exitCode,
        });
        assert.equal(validation.valid, true, validation.errors.join('; '));
        assert.equal(validation.events.at(-1).status, 'cancelled');
        assert.deepEqual(server.state.stopInputs.at(-2), {
            sessionId: 'session-test',
        });
        assert.equal(server.state.activeSubscriptions, 0);
    } finally {
        await server.close();
    }
});

test('SIGINT accepts the pinned App persisted cancellation terminal when no stream terminal is emitted', async () => {
    const server = await startFakeCdpServer({
        sendWaitsForStop: true,
        stopPersistsCancellation: true,
        sendResult: {
            accepted: true,
            requestId: 'app-request-test',
            messageId: 'message-test',
        },
        streamEvents: [],
        stopStreamEvents: [],
    });
    try {
        const result = await runProcess(
            cli,
            ['-p', 'cancel persisted', '--output-format', 'stream-json'],
            {
                cwd: root,
                env: appEnv(server.endpoint),
                signals: [
                    {
                        signal: 'SIGINT',
                        afterStdout: '"type":"init"',
                        delayMs: 20,
                    },
                ],
            },
        );
        assert.equal(result.exitCode, 130, result.stderr || result.stdout);
        const validation = await validateStream(result.stdout, {
            exitCode: result.exitCode,
        });
        assert.equal(validation.valid, true, validation.errors.join('; '));
        assert.equal(validation.events.at(-1).status, 'cancelled');
        assert.equal(validation.events.at(-1).error.code, 'CANCELLED');
        assert.ok(
            server.state.restoreInputs.some(
                ({ sessionId, limit }) =>
                    sessionId === 'session-test' && limit === 10,
            ),
        );
        assert.equal(server.state.activeSubscriptions, 0);
    } finally {
        await server.close();
    }
});

test('a stale persisted cancellation from an earlier turn cannot settle the current run', async () => {
    const server = await startFakeCdpServer({
        sharedRenderer: true,
        sendWaitsForStop: true,
        sendResult: {
            accepted: true,
            requestId: 'app-request-test',
            messageId: 'message-test',
        },
        streamEvents: [],
        stopStreamEvents: [],
        initialSessionMessages: [
            {
                id: 'old-user',
                sessionId: 'session-test',
                orderSeq: 1,
                role: 'user',
                content: 'old run',
                status: 'sent',
                isContextEdge: 0,
                metadata: '{}',
                createdAt: 1,
                updatedAt: 1,
            },
            {
                id: 'old-cancelled-assistant',
                sessionId: 'session-test',
                orderSeq: 2,
                role: 'assistant',
                content: JSON.stringify([
                    {
                        type: 'error',
                        content: 'common.error.userCanceledGeneration',
                        status: 'error',
                        timestamp: 2,
                    },
                ]),
                status: 'error',
                isContextEdge: 0,
                metadata: '{}',
                createdAt: 2,
                updatedAt: 2,
            },
        ],
    });
    try {
        const result = await runProcess(
            cli,
            ['-p', 'must not reuse stale cancellation', '--output-format', 'stream-json'],
            {
                cwd: root,
                env: appEnv(server.endpoint, {
                    JIAORONG_CLI_TEST_RUN_TIMEOUT_MS: '120',
                }),
                signals: [
                    {
                        signal: 'SIGINT',
                        afterStdout: '"type":"init"',
                        delayMs: 20,
                    },
                ],
            },
        );
        assert.equal(result.exitCode, 1, result.stderr || result.stdout);
        const validation = await validateStream(result.stdout, {
            exitCode: result.exitCode,
        });
        assert.equal(validation.valid, true, validation.errors.join('; '));
        assert.equal(validation.events.at(-1).status, 'failed');
        assert.equal(validation.events.at(-1).error.code, 'INTERNAL_ERROR');
        assert.notEqual(validation.events.at(-1).status, 'cancelled');
    } finally {
        await server.close();
    }
});

function persistedCancellationMessage({ id, orderSeq, updatedAt }) {
    return {
        id,
        sessionId: 'session-test',
        orderSeq,
        role: 'assistant',
        content: JSON.stringify([
            {
                type: 'error',
                content: 'common.error.userCanceledGeneration',
                status: 'error',
                timestamp: updatedAt,
            },
        ]),
        status: 'error',
        isContextEdge: 0,
        metadata: '{}',
        createdAt: updatedAt,
        updatedAt,
    };
}

function persistedUserMessage({ id, orderSeq, updatedAt }) {
    return {
        id,
        sessionId: 'session-test',
        orderSeq,
        role: 'user',
        content: 'current run',
        status: 'sent',
        isContextEdge: 0,
        metadata: '{}',
        createdAt: updatedAt,
        updatedAt,
    };
}

for (const scenario of [
    {
        name: 'a preexisting message ID cannot settle the current persisted cancellation',
        initialMessages: [{ id: 'reused-assistant-id' }],
        messages: [
            persistedUserMessage({
                id: 'current-user-id',
                orderSeq: 1,
                updatedAt: Number.MAX_SAFE_INTEGER,
            }),
            persistedCancellationMessage({
                id: 'reused-assistant-id',
                orderSeq: 2,
                updatedAt: Number.MAX_SAFE_INTEGER,
            }),
        ],
    },
    {
        name: 'an old updatedAt cannot settle the current persisted cancellation',
        messages: [
            persistedUserMessage({
                id: 'current-user-time',
                orderSeq: 1,
                updatedAt: Number.MAX_SAFE_INTEGER,
            }),
            persistedCancellationMessage({
                id: 'new-assistant-old-time',
                orderSeq: 2,
                updatedAt: 1,
            }),
        ],
    },
    {
        name: 'an assistant before the latest user cannot settle persisted cancellation',
        messages: [
            persistedCancellationMessage({
                id: 'new-assistant-old-order',
                orderSeq: 1,
                updatedAt: Number.MAX_SAFE_INTEGER,
            }),
            persistedUserMessage({
                id: 'current-user-order',
                orderSeq: 2,
                updatedAt: Number.MAX_SAFE_INTEGER,
            }),
        ],
    },
]) {
    test(scenario.name, async () => {
        const server = await startFakeCdpServer({
            sharedRenderer: true,
            sendWaitsForStop: true,
            streamEvents: [],
            stopStreamEvents: [],
            stopPersistedMessages: scenario.messages,
            initialSessionMessages: scenario.initialMessages ?? [],
        });
        try {
            const result = await runProcess(
                cli,
                ['-p', 'do not accept crossed persisted state', '--output-format', 'stream-json'],
                {
                    cwd: root,
                    env: appEnv(server.endpoint, {
                        JIAORONG_CLI_TEST_RUN_TIMEOUT_MS: '150',
                        JIAORONG_CLI_TEST_CANCELLATION_GRACE_MS: '80',
                    }),
                    signals: [
                        {
                            signal: 'SIGINT',
                            afterStdout: '"type":"init"',
                            delayMs: 20,
                        },
                    ],
                },
            );
            assert.equal(result.exitCode, 1, result.stderr || result.stdout);
            const validation = await validateStream(result.stdout, {
                exitCode: result.exitCode,
            });
            assert.equal(validation.valid, true, validation.errors.join('; '));
            assert.equal(validation.events.at(-1).error.code, 'INTERNAL_ERROR');
        } finally {
            await server.close();
        }
    });
}

test('timeout uses the same verified stop-and-settle path', async () => {
    const server = await startFakeCdpServer({
        sendResult: {
            accepted: true,
            requestId: 'app-request-test',
            messageId: 'message-test',
        },
        streamEvents: [updated()],
        stopStreamEvents: [failed({ error: 'timed out' })],
    });
    try {
        const result = await runProcess(
            cli,
            [
                '-p',
                'time out',
                '--timeout',
                '0.05',
                '--output-format',
                'stream-json',
            ],
            { cwd: root, env: appEnv(server.endpoint) },
        );
        assert.equal(result.exitCode, 1, result.stderr || result.stdout);
        const validation = await validateStream(result.stdout, {
            exitCode: result.exitCode,
        });
        assert.equal(validation.valid, true, validation.errors.join('; '));
        assert.equal(validation.events.at(-1).status, 'failed');
        assert.equal(validation.events.at(-1).error.code, 'TIMEOUT');
        assert.deepEqual(server.state.stopInputs.at(-2), {
            sessionId: 'session-test',
            requestId: 'app-request-test',
        });
        assert.equal(server.state.activeSubscriptions, 0);
    } finally {
        await server.close();
    }
});

test('cancellation never approves a pending full-access Edit interaction', async () => {
    const target = resolve(root, 'cancelled-edit.txt');
    const server = await startFakeCdpServer({
        sendWaitsForStop: true,
        streamEvents: [],
        stopStreamEvents: [
            toolUpdated({
                name: 'edit',
                params: {
                    path: target,
                    oldText: 'before',
                    newText: 'after',
                    replaceAll: true,
                },
                permissionType: 'write',
                permissionPaths: [target],
                status: 'loading',
                argsComplete: true,
                action: true,
            }),
            failed(),
        ],
    });
    try {
        const result = await runProcess(
            cli,
            [
                '-p',
                'cancel pending edit',
                '--permission-mode',
                'full_access',
                '--output-format',
                'stream-json',
            ],
            {
                cwd: root,
                env: appEnv(server.endpoint),
                signals: [{ signal: 'SIGINT', afterStdout: '"type":"init"' }],
            },
        );
        assert.equal(result.exitCode, 130, result.stderr || result.stdout);
        assert.equal(
            server.state.respondToolInteractionInputs.some(
                (input) => input.response?.granted === true,
            ),
            false,
        );
    } finally {
        await server.close();
    }
});

test('cancellation during full-access permission validation commits stop before grant', async () => {
    const target = resolve(root, 'cancelled-during-policy.txt');
    const server = await startFakeCdpServer({
        streamEvents: [
            toolUpdated({
                name: 'edit',
                params: {
                    path: target,
                    oldText: 'before',
                    newText: 'after',
                    replaceAll: true,
                },
                permissionType: 'write',
                permissionPaths: [target],
                status: 'loading',
                argsComplete: true,
                action: true,
            }),
        ],
        stopStreamEvents: [failed()],
    });
    try {
        const result = await runProcess(
            cli,
            [
                '-p',
                'cancel while validating edit',
                '--permission-mode',
                'full_access',
                '--output-format',
                'stream-json',
            ],
            {
                cwd: root,
                env: appEnv(server.endpoint, {
                    JIAORONG_CLI_TEST_PERMISSION_POLICY_DELAY_MS: '100',
                }),
                signals: [
                    {
                        signal: 'SIGINT',
                        afterStdout: '"type":"tool_use"',
                        delayMs: 20,
                    },
                ],
            },
        );
        assert.equal(result.exitCode, 130, result.stderr || result.stdout);
        assert.equal(server.state.respondToolInteractionInputs.length, 0);
    } finally {
        await server.close();
    }
});

test('unproven timeout settlement stops at the cancellation grace deadline', async () => {
    let restoreCalls = 0;
    const server = await startFakeCdpServer({
        sendResult: {
            accepted: true,
            requestId: 'app-request-test',
            messageId: 'message-test',
        },
        streamEvents: [updated()],
        async beforeInvoke(route) {
            if (route === 'sessions.restore' && ++restoreCalls > 1)
                await wait(500);
        },
    });
    try {
        const startedAt = Date.now();
        const result = await runProcess(
            cli,
            [
                '-p',
                'timeout without settlement',
                '--timeout',
                '0.02',
                '--output-format',
                'stream-json',
            ],
            {
                cwd: root,
                env: appEnv(server.endpoint, {
                    JIAORONG_CLI_TEST_RUN_TIMEOUT_MS: '2000',
                    JIAORONG_CLI_TEST_CANCELLATION_GRACE_MS: '80',
                }),
                timeoutMs: 1_000,
            },
        );
        assert.equal(result.timedOut, false);
        assert.ok(Date.now() - startedAt < 1_000);
        assert.equal(result.exitCode, 1, result.stderr || result.stdout);
        const validation = await validateStream(result.stdout, {
            exitCode: result.exitCode,
        });
        assert.equal(validation.valid, true, validation.errors.join('; '));
        assert.equal(validation.events.at(-1).error.code, 'INTERNAL_ERROR');
    } finally {
        await server.close();
    }
});

test('a stop acknowledgement without the original terminal is not reported as cancelled', async () => {
    const server = await startFakeCdpServer({
        sharedRenderer: true,
        sendResult: {
            accepted: true,
            requestId: 'app-request-test',
            messageId: 'message-test',
        },
        streamEvents: [updated()],
    });
    try {
        const result = await runProcess(
            cli,
            ['-p', 'cannot settle', '--output-format', 'stream-json'],
            {
                cwd: root,
                env: appEnv(server.endpoint, {
                    JIAORONG_CLI_TEST_RUN_TIMEOUT_MS: '100',
                }),
                signals: [
                    {
                        signal: 'SIGINT',
                        afterStdout: '"type":"message"',
                    },
                ],
            },
        );
        assert.equal(result.exitCode, 1, result.stderr || result.stdout);
        const validation = await validateStream(result.stdout, {
            exitCode: result.exitCode,
        });
        assert.equal(validation.valid, true, validation.errors.join('; '));
        assert.equal(validation.events.at(-1).status, 'failed');
        assert.equal(validation.events.at(-1).error.code, 'INTERNAL_ERROR');
        assert.notEqual(validation.events.at(-1).status, 'cancelled');

        const second = await runProcess(
            cli,
            [
                '-p',
                'must remain locked',
                '--resume',
                'session-test',
                '--output-format',
                'stream-json',
            ],
            { cwd: root, env: appEnv(server.endpoint) },
        );
        assert.equal(second.exitCode, 42, second.stderr || second.stdout);
        assert.equal(server.state.sendInputs.length, 1);
    } finally {
        await server.close();
    }
});

test('a second SIGINT force-exits locally without claiming remote cancellation', async () => {
    const server = await startFakeCdpServer({
        sendResult: {
            accepted: true,
            requestId: 'app-request-test',
            messageId: 'message-test',
        },
        streamEvents: [updated()],
    });
    try {
        const result = await runProcess(
            cli,
            ['-p', 'force me', '--output-format', 'stream-json'],
            {
                cwd: root,
                env: appEnv(server.endpoint, {
                    JIAORONG_CLI_TEST_RUN_TIMEOUT_MS: '1000',
                }),
                timeoutMs: 2_000,
                signals: [
                    {
                        signal: 'SIGINT',
                        afterStdout: '"type":"message"',
                    },
                    {
                        signal: 'SIGINT',
                        afterStdout: '"type":"message"',
                        delayMs: 20,
                    },
                ],
            },
        );
        assert.equal(result.timedOut, false);
        assert.equal(result.signal, null);
        assert.equal(result.exitCode, 130);
        const lines = result.stdout
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line));
        assert.ok(lines.some(({ type }) => type === 'init'));
        assert.ok(
            lines.filter(({ type }) => type === 'result').length <= 1,
        );
        assert.notEqual(lines.at(-1)?.status, 'cancelled');
        assert.deepEqual(server.state.stopInputs.at(-1), {
            sessionId: 'session-test',
            requestId: 'app-request-test',
        });
    } finally {
        await server.close();
    }
});

test('timeout and SIGINT race emits one deterministic terminal reason', async () => {
    let resetCalls = 0;
    const server = await startFakeCdpServer({
        sendResult: {
            accepted: true,
            requestId: 'app-request-test',
            messageId: 'message-test',
        },
        streamEvents: [updated()],
        stopStreamEvents: [failed({ error: 'timed out' })],
        async beforeInvoke(route) {
            if (route === 'chat.stopStream' && ++resetCalls === 2)
                await wait(100);
        },
    });
    try {
        const result = await runProcess(
            cli,
            [
                '-p',
                'race termination',
                '--timeout',
                '0.03',
                '--output-format',
                'stream-json',
            ],
            {
                cwd: root,
                env: appEnv(server.endpoint),
                signals: [
                    {
                        signal: 'SIGINT',
                        afterStdout: '"type":"message"',
                        delayMs: 50,
                    },
                ],
            },
        );
        assert.equal(result.exitCode, 1, result.stderr || result.stdout);
        const validation = await validateStream(result.stdout, {
            exitCode: result.exitCode,
        });
        assert.equal(validation.valid, true, validation.errors.join('; '));
        assert.equal(validation.events.at(-1).error.code, 'TIMEOUT');
        assert.equal(
            validation.events.filter(({ type }) => type === 'result').length,
            1,
        );
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
        sharedRenderer: true,
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
        const second = await runProcess(
            cli,
            [
                '-p',
                'must not start',
                '--resume',
                'session-test',
                '--output-format',
                'stream-json',
            ],
            { cwd: root, env: appEnv(server.endpoint) },
        );
        assert.equal(second.exitCode, 42, second.stderr || second.stdout);
        assert.equal(server.state.sendInputs.length, 1);
    } finally {
        await server.close();
    }
});
