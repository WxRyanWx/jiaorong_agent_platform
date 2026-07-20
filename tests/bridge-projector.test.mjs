import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBridgeProjector } from '../src/app/bridge-projector.mjs';

function snapshot({
    requestId = 'app-request-1',
    sessionId = 'session-1',
    messageId = 'message-1',
    content = 'Hello',
    reasoning = 'Checking',
} = {}) {
    return {
        kind: 'snapshot',
        requestId,
        sessionId,
        messageId,
        updatedAt: 10,
        blocks: [
            {
                id: 'reasoning-1',
                type: 'reasoning_content',
                content: reasoning,
                status: 'pending',
                timestamp: 8,
            },
            {
                id: 'content-1',
                type: 'content',
                content,
                status: 'pending',
                timestamp: 9,
            },
        ],
    };
}

function terminal(overrides = {}) {
    return {
        requestId: 'app-request-1',
        sessionId: 'session-1',
        messageId: 'message-1',
        completedAt: 12,
        ...overrides,
    };
}

function toolSnapshot({
    name = 'read',
    status = 'pending',
    response,
    action = false,
    actionStatus = 'pending',
    actionType = 'tool_call_permission',
    needsUserAction = true,
    params = {
        path: 'README.md',
        apiKey: 'must-not-leak',
    },
    argsComplete = status !== 'pending',
    permissionType = 'read',
    permissionToolName = name,
    permissionServerName = 'agent-filesystem',
    permissionPaths = ['/project/README.md'],
    permissionRequestExtra = {},
} = {}) {
    const toolCall = {
        id: 'tool-1',
        name,
        params,
        ...(response === undefined ? {} : { response }),
    };
    return {
        ...snapshot({ content: '', reasoning: '' }),
        blocks: [
            {
                id: 'tool-block-1',
                type: 'tool_call',
                status,
                timestamp: 9,
                tool_call: toolCall,
                extra: { toolCallArgsComplete: argsComplete },
            },
            ...(action
                ? [
                      {
                          id: 'action-1',
                          type: 'action',
                          action_type: actionType,
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
                                  paths: permissionPaths,
                                  ...permissionRequestExtra,
                              }),
                          },
                      },
                  ]
                : []),
        ],
    };
}

test('Bridge Projector emits monotonic text without exposing raw reasoning content', () => {
    const projector = createBridgeProjector({ sessionId: 'session-1' });

    assert.deepEqual(
        projector.project('chat.stream.updated', snapshot()),
        [
            {
                kind: 'message',
                messageId: 'message-1',
                delta: 'Hello',
            },
        ],
    );
    assert.deepEqual(
        projector.project(
            'chat.stream.updated',
            snapshot({ content: 'Hello 世界', reasoning: 'Checking files' }),
        ),
        [
            {
                kind: 'message',
                messageId: 'message-1',
                delta: ' 世界',
            },
        ],
    );

    projector.bindSendResult({
        accepted: true,
        requestId: 'app-request-1',
        messageId: 'message-1',
    });
    assert.deepEqual(
        projector.project('chat.stream.completed', terminal()),
        [{ kind: 'complete', usage: null, turns: 1 }],
    );
    projector.assertComplete();
});

test('Bridge Projector fails closed for malformed, non-monotonic, crossed, and duplicate events', () => {
    const scenarios = [
        {
            name: 'malformed snapshot',
            events: [['chat.stream.updated', { ...snapshot(), blocks: null }]],
        },
        {
            name: 'oversized request identity',
            events: [
                [
                    'chat.stream.updated',
                    snapshot({ requestId: 'r'.repeat(513) }),
                ],
            ],
        },
        {
            name: 'unsupported error block',
            events: [
                [
                    'chat.stream.updated',
                    {
                        ...snapshot(),
                        blocks: [
                            {
                                id: 'error-1',
                                type: 'error',
                                content: 'provider failed',
                                status: 'error',
                                timestamp: 9,
                            },
                        ],
                    },
                ],
            ],
        },
        {
            name: 'non-monotonic content',
            events: [
                ['chat.stream.updated', snapshot()],
                ['chat.stream.updated', snapshot({ content: 'Help' })],
            ],
        },
        {
            name: 'crossed Session',
            events: [
                [
                    'chat.stream.updated',
                    snapshot({ sessionId: 'session-other' }),
                ],
            ],
        },
        {
            name: 'crossed request',
            events: [
                ['chat.stream.updated', snapshot()],
                [
                    'chat.stream.completed',
                    terminal({ requestId: 'app-request-other' }),
                ],
            ],
        },
        {
            name: 'duplicate terminal',
            events: [
                ['chat.stream.updated', snapshot()],
                ['chat.stream.completed', terminal()],
                ['chat.stream.completed', terminal()],
            ],
        },
    ];

    for (const scenario of scenarios) {
        const projector = createBridgeProjector({ sessionId: 'session-1' });
        assert.throws(
            () => {
                for (const [name, payload] of scenario.events)
                    projector.project(name, payload);
            },
            (error) =>
                error.code === 'INTERNAL_ERROR' &&
                error.message ===
                    'JiaorongAI returned an invalid stream event.',
            scenario.name,
        );
    }
});

test('Bridge Projector requires the bridge send identity and one terminal', () => {
    const missingTerminal = createBridgeProjector({ sessionId: 'session-1' });
    missingTerminal.project('chat.stream.updated', snapshot());
    missingTerminal.bindSendResult({
        accepted: true,
        requestId: 'app-request-1',
        messageId: 'message-1',
    });
    assert.throws(
        () => missingTerminal.assertComplete(),
        /invalid stream event/,
    );

    const rejected = createBridgeProjector({ sessionId: 'session-1' });
    assert.throws(
        () =>
            rejected.bindSendResult({
                accepted: false,
                requestId: null,
                messageId: null,
            }),
        /invalid stream event/,
    );

    const mismatch = createBridgeProjector({ sessionId: 'session-1' });
    mismatch.project('chat.stream.updated', snapshot());
    assert.throws(
        () =>
            mismatch.bindSendResult({
                accepted: true,
                requestId: 'app-request-other',
                messageId: 'message-1',
            }),
        /invalid stream event/,
    );
});

test('Bridge Projector accepts a queued send acknowledgement and binds identity from events', () => {
    const projector = createBridgeProjector({ sessionId: 'session-1' });
    projector.bindSendResult({
        accepted: true,
        requestId: null,
        messageId: null,
    });
    assert.deepEqual(
        projector.project('chat.stream.updated', snapshot()),
        [
            {
                kind: 'message',
                messageId: 'message-1',
                delta: 'Hello',
            },
        ],
    );
    projector.project('chat.stream.completed', terminal());
    projector.assertComplete();
});

test('Bridge Projector emits one redacted tool start and one correlated success', () => {
    const projector = createBridgeProjector({ sessionId: 'session-1' });
    assert.deepEqual(
        projector.project(
            'chat.stream.updated',
            toolSnapshot({ status: 'loading' }),
        ),
        [
            {
                kind: 'tool_use',
                toolCallId: 'tool-1',
                name: 'read',
                input: { path: 'README.md', apiKey: '<redacted>' },
            },
        ],
    );
    assert.deepEqual(
        projector.project(
            'chat.stream.updated',
            toolSnapshot({ status: 'success', response: 'README canary' }),
        ),
        [
            {
                kind: 'tool_result',
                toolCallId: 'tool-1',
                status: 'success',
                output: { content: 'README canary', truncated: false },
                error: null,
            },
        ],
    );
    assert.deepEqual(
        projector.project(
            'chat.stream.updated',
            toolSnapshot({ status: 'success', response: 'README canary' }),
        ),
        [],
    );
});

test('Bridge Projector exposes one owned pending permission interaction and waits for its terminal snapshot', () => {
    const projector = createBridgeProjector({ sessionId: 'session-1' });
    assert.deepEqual(
        projector.project(
            'chat.stream.updated',
            toolSnapshot({
                status: 'success',
                response: '',
                action: true,
                argsComplete: true,
                permissionRequestExtra: { rememberable: true },
            }),
        ),
        [
            {
                kind: 'tool_use',
                toolCallId: 'tool-1',
                name: 'read',
                input: { path: 'README.md', apiKey: '<redacted>' },
            },
            {
                kind: 'tool_interaction',
                sessionId: 'session-1',
                messageId: 'message-1',
                toolCallId: 'tool-1',
                actionType: 'tool_call_permission',
                tool: {
                    name: 'read',
                    input: { path: 'README.md', apiKey: '<redacted>' },
                },
                permission: {
                    toolName: 'read',
                    serverName: 'agent-filesystem',
                    permissionType: 'read',
                    paths: ['/project/README.md'],
                },
            },
        ],
    );
    assert.deepEqual(
        projector.project(
            'chat.stream.updated',
            toolSnapshot({
                status: 'error',
                response: 'User denied the request.',
                action: true,
                actionStatus: 'denied',
                needsUserAction: false,
            }),
        ),
        [
            {
                kind: 'tool_result',
                toolCallId: 'tool-1',
                status: 'failed',
                output: null,
                error: {
                    code: 'PERMISSION_DENIED',
                    message: 'The tool request was denied by the headless permission policy.',
                },
            },
        ],
    );
});

test('Bridge Projector bounds tool output and fails closed on malformed tool state', () => {
    const projector = createBridgeProjector({ sessionId: 'session-1' });
    projector.project(
        'chat.stream.updated',
        toolSnapshot({ status: 'loading' }),
    );
    const [result] = projector.project(
        'chat.stream.updated',
        toolSnapshot({ status: 'success', response: '界'.repeat(8_000) }),
    );
    assert.equal(result.kind, 'tool_result');
    assert.equal(result.output.truncated, true);
    assert.ok(
        Buffer.byteLength(result.output.content, 'utf8') <= 16 * 1_024,
    );

    const escapedProjector = createBridgeProjector({ sessionId: 'session-1' });
    escapedProjector.project(
        'chat.stream.updated',
        toolSnapshot({ status: 'loading' }),
    );
    const [escaped] = escapedProjector.project(
        'chat.stream.updated',
        toolSnapshot({
            status: 'success',
            response: '"\\'.repeat(12_000),
        }),
    );
    assert.equal(escaped.output.truncated, true);
    assert.ok(
        Buffer.byteLength(
            JSON.stringify(escaped.output.content),
            'utf8',
        ) <=
            16 * 1_024,
    );

    const privateProjector = createBridgeProjector({ sessionId: 'session-1' });
    privateProjector.project(
        'chat.stream.updated',
        toolSnapshot({ status: 'loading' }),
    );
    const [privateResult] = privateProjector.project(
        'chat.stream.updated',
        toolSnapshot({
            status: 'success',
            response: {
                content: 'safe',
                provider: { id: 'private-provider' },
                nested: {
                    serverName: 'private-server',
                    rtk: 'private-rtk',
                    image: 'private-image',
                    action: 'private-action',
                    password: 'private-password',
                    visible: true,
                },
            },
        }),
    );
    assert.deepEqual(privateResult.output, {
        content: {
            content: 'safe',
            nested: {
                password: '<redacted>',
                visible: true,
            },
        },
        truncated: false,
    });

    for (const invalid of [
        toolSnapshot({ status: 'cancelled', response: 'cancelled' }),
        toolSnapshot({ action: true, actionType: 'unknown_action' }),
        toolSnapshot({ action: true, permissionType: 'write' }),
        toolSnapshot({ action: true, permissionToolName: 'edit' }),
        toolSnapshot({
            action: true,
            permissionRequestExtra: { command: 'cat README.md' },
        }),
        toolSnapshot({
            action: true,
            permissionRequestExtra: { unexpected: true },
        }),
        {
            ...toolSnapshot(),
            blocks: [
                {
                    ...toolSnapshot().blocks[0],
                    tool_call: {
                        ...toolSnapshot().blocks[0].tool_call,
                        params: { value: 'x'.repeat(9_000) },
                    },
                },
            ],
        },
    ]) {
        const isolated = createBridgeProjector({ sessionId: 'session-1' });
        assert.throws(
            () => isolated.project('chat.stream.updated', invalid),
            /invalid stream event/,
        );
    }
});

test('Bridge Projector waits for streamed tool params and publishes the final parsed input', () => {
    const projector = createBridgeProjector({ sessionId: 'session-1' });
    assert.deepEqual(
        projector.project(
            'chat.stream.updated',
            toolSnapshot({ params: '' }),
        ),
        [],
    );
    assert.deepEqual(
        projector.project(
            'chat.stream.updated',
            toolSnapshot({ params: '{"path":"README' }),
        ),
        [],
    );
    assert.deepEqual(
        projector.project(
            'chat.stream.updated',
            toolSnapshot({
                status: 'success',
                params: '{"path":"README.md"}',
                response: 'canary',
            }),
        ),
        [
            {
                kind: 'tool_use',
                toolCallId: 'tool-1',
                name: 'read',
                input: { path: 'README.md' },
            },
            {
                kind: 'tool_result',
                toolCallId: 'tool-1',
                status: 'success',
                output: { content: 'canary', truncated: false },
                error: null,
            },
        ],
    );
});
