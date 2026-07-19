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
