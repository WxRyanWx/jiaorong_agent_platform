import { BackendFailure } from '../cli/failures.mjs';

const EVENT_NAMES = new Set([
    'chat.stream.updated',
    'chat.stream.completed',
    'chat.stream.failed',
]);
const BLOCK_TYPES = new Set([
    'content',
    'search',
    'reasoning_content',
    'plan',
    'error',
    'tool_call',
    'action',
    'image',
]);
const BLOCK_STATUSES = new Set([
    'pending',
    'success',
    'error',
    'loading',
    'granted',
    'denied',
]);

function invalidEvent() {
    return new BackendFailure(
        'INTERNAL_ERROR',
        'JiaorongAI returned an invalid stream event.',
    );
}

function nonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

function timestamp(value) {
    return Number.isInteger(value) && value >= 0;
}

function validBlock(block) {
    return (
        block !== null &&
        typeof block === 'object' &&
        (block.id === undefined || nonEmptyString(block.id)) &&
        BLOCK_TYPES.has(block.type) &&
        (block.content === undefined || typeof block.content === 'string') &&
        BLOCK_STATUSES.has(block.status) &&
        timestamp(block.timestamp)
    );
}

function validatePayload(eventName, payload) {
    if (
        !EVENT_NAMES.has(eventName) ||
        payload === null ||
        typeof payload !== 'object' ||
        !nonEmptyString(payload.requestId) ||
        !nonEmptyString(payload.sessionId) ||
        !nonEmptyString(payload.messageId)
    )
        throw invalidEvent();

    if (eventName === 'chat.stream.updated') {
        if (
            payload.kind !== 'snapshot' ||
            !timestamp(payload.updatedAt) ||
            !Array.isArray(payload.blocks) ||
            payload.blocks.length > 512 ||
            !payload.blocks.every(validBlock)
        )
            throw invalidEvent();
    } else if (eventName === 'chat.stream.completed') {
        if (!timestamp(payload.completedAt)) throw invalidEvent();
    } else if (
        !timestamp(payload.failedAt) ||
        typeof payload.error !== 'string'
    ) {
        throw invalidEvent();
    }
}

function snapshotText(blocks, type) {
    return blocks
        .filter((block) => block.type === type)
        .map((block) => block.content ?? '')
        .join('');
}

export function createBridgeProjector({ sessionId }) {
    if (!nonEmptyString(sessionId)) throw invalidEvent();

    let requestId = null;
    let messageId = null;
    let content = '';
    let reasoning = '';
    let sendBound = false;
    let terminal = false;

    function correlate(payload) {
        if (payload.sessionId !== sessionId) throw invalidEvent();
        requestId ??= payload.requestId;
        messageId ??= payload.messageId;
        if (
            payload.requestId !== requestId ||
            payload.messageId !== messageId
        )
            throw invalidEvent();
    }

    return {
        project(eventName, payload) {
            validatePayload(eventName, payload);
            correlate(payload);
            if (terminal) throw invalidEvent();

            if (eventName === 'chat.stream.failed') {
                terminal = true;
                throw new BackendFailure(
                    'INTERNAL_ERROR',
                    'JiaorongAI failed the Agent Session stream.',
                );
            }
            if (eventName === 'chat.stream.completed') {
                terminal = true;
                return [{ kind: 'complete', usage: null, turns: 1 }];
            }
            if (
                payload.blocks.some(
                    (block) =>
                        block.type !== 'content' &&
                        block.type !== 'reasoning_content',
                )
            )
                throw invalidEvent();

            const nextContent = snapshotText(payload.blocks, 'content');
            const nextReasoning = snapshotText(
                payload.blocks,
                'reasoning_content',
            );
            if (
                !nextContent.startsWith(content) ||
                !nextReasoning.startsWith(reasoning)
            )
                throw invalidEvent();

            const events = [];
            if (nextContent.length > content.length) {
                events.push({
                    kind: 'message',
                    messageId,
                    delta: nextContent.slice(content.length),
                });
            }
            content = nextContent;
            reasoning = nextReasoning;
            return events;
        },

        bindSendResult(result) {
            const hasIdentity =
                nonEmptyString(result?.requestId) &&
                nonEmptyString(result?.messageId);
            const queuedWithoutIdentity =
                result?.requestId === null && result?.messageId === null;
            if (
                sendBound ||
                result === null ||
                typeof result !== 'object' ||
                result.accepted !== true ||
                (!hasIdentity && !queuedWithoutIdentity)
            )
                throw invalidEvent();
            if (hasIdentity) {
                requestId ??= result.requestId;
                messageId ??= result.messageId;
                if (
                    result.requestId !== requestId ||
                    result.messageId !== messageId
                )
                    throw invalidEvent();
            }
            sendBound = true;
        },

        assertComplete() {
            if (
                !terminal ||
                !sendBound ||
                requestId === null ||
                messageId === null
            )
                throw invalidEvent();
        },
    };
}
