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
const MAX_TOOL_INPUT_BYTES = 8 * 1_024;
const MAX_TOOL_OUTPUT_BYTES = 16 * 1_024;
const REDACTED_KEY = /(?:authorization|api[_-]?key|password|secret|token|credential|cookie)/iu;
const PRIVATE_TOOL_OUTPUT_KEY = /^(?:provider|server|rtk|image|action)/iu;
const TOOL_PERMISSION_TYPES = new Map([
    ['read', 'read'],
    ['write', 'write'],
    ['edit', 'write'],
    ['glob', 'read'],
    ['grep', 'read'],
    ['exec', 'command'],
]);
const PERMISSION_TYPES = new Set(['read', 'write', 'all', 'command']);
const FILE_PERMISSION_REQUEST_KEYS = new Set([
    'toolName',
    'serverName',
    'permissionType',
    'description',
    'paths',
    'rememberable',
]);
const COMMAND_PERMISSION_REQUEST_KEYS = new Set([
    'toolName',
    'serverName',
    'permissionType',
    'description',
    'command',
    'commandSignature',
    'rememberable',
]);

function invalidEvent() {
    return new BackendFailure(
        'INTERNAL_ERROR',
        'JiaorongAI returned an invalid stream event.',
    );
}

function nonEmptyString(value) {
    return (
        typeof value === 'string' &&
        value.length > 0 &&
        Buffer.byteLength(value, 'utf8') <= 512 &&
        !/[\u0000-\u001f\u007f]/u.test(value)
    );
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

function jsonBytes(value) {
    let serialized;
    try {
        serialized = JSON.stringify(value);
    } catch {
        throw invalidEvent();
    }
    if (serialized === undefined) throw invalidEvent();
    return { serialized, bytes: Buffer.byteLength(serialized, 'utf8') };
}

function redactJson(value) {
    if (Array.isArray(value)) return value.map(redactJson);
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, entry]) => [
                key,
                REDACTED_KEY.test(key) ? '<redacted>' : redactJson(entry),
            ]),
        );
    }
    return value;
}

function sanitizeToolOutput(value) {
    if (Array.isArray(value)) return value.map(sanitizeToolOutput);
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).flatMap(([key, entry]) => {
                if (PRIVATE_TOOL_OUTPUT_KEY.test(key)) return [];
                return [
                    [
                        key,
                        REDACTED_KEY.test(key)
                            ? '<redacted>'
                            : sanitizeToolOutput(entry),
                    ],
                ];
            }),
        );
    }
    return value;
}

function boundedToolInput(value) {
    const document = jsonBytes(value);
    if (document.bytes > MAX_TOOL_INPUT_BYTES) throw invalidEvent();
    return redactJson(JSON.parse(document.serialized));
}

function normalizedToolInput(value) {
    if (typeof value !== 'string') return value;
    if (value.trim() === '') throw invalidEvent();
    try {
        return boundedToolInput(JSON.parse(value));
    } catch {
        throw invalidEvent();
    }
}

function truncateUtf8(value, maxBytes) {
    const source = Buffer.from(value, 'utf8');
    if (source.byteLength <= maxBytes)
        return { value, truncated: false };
    let end = maxBytes;
    while (end > 0 && (source[end] & 0xc0) === 0x80) end -= 1;
    return {
        value: source.subarray(0, end).toString('utf8'),
        truncated: true,
    };
}

function boundedToolOutput(value) {
    const redacted = sanitizeToolOutput(value);
    const document = jsonBytes(redacted);
    if (document.bytes <= MAX_TOOL_OUTPUT_BYTES)
        return { content: redacted, truncated: false };
    const preview =
        typeof redacted === 'string' ? redacted : document.serialized;
    const sourceBytes = Buffer.byteLength(preview, 'utf8');
    let minimum = 0;
    let maximum = sourceBytes;
    let previewValue = '';
    while (minimum <= maximum) {
        const candidateBytes = Math.floor((minimum + maximum) / 2);
        const candidate = truncateUtf8(preview, candidateBytes).value;
        if (jsonBytes(candidate).bytes <= MAX_TOOL_OUTPUT_BYTES) {
            previewValue = candidate;
            minimum = candidateBytes + 1;
        } else {
            maximum = candidateBytes - 1;
        }
    }
    return { content: previewValue, truncated: true };
}

function toolCallDocument(block) {
    const toolCall = block.tool_call;
    if (
        toolCall === null ||
        typeof toolCall !== 'object' ||
        !nonEmptyString(toolCall.id) ||
        !nonEmptyString(toolCall.name) ||
        !Object.hasOwn(toolCall, 'params')
    )
        throw invalidEvent();
    return {
        id: toolCall.id,
        name: toolCall.name,
        input: boundedToolInput(toolCall.params),
        hasResponse: Object.hasOwn(toolCall, 'response'),
        response: toolCall.response,
    };
}

function permissionDocument(block, tool) {
    const extra = block.extra;
    if (
        !nonEmptyString(extra.toolName) ||
        !nonEmptyString(extra.serverName) ||
        !PERMISSION_TYPES.has(extra.permissionType) ||
        typeof extra.permissionRequest !== 'string' ||
        Buffer.byteLength(extra.permissionRequest, 'utf8') > MAX_TOOL_INPUT_BYTES
    )
        throw invalidEvent();
    let request;
    try {
        request = JSON.parse(extra.permissionRequest);
    } catch {
        throw invalidEvent();
    }
    const expectedPermission = TOOL_PERMISSION_TYPES.get(tool.name);
    const allowedKeys =
        expectedPermission === 'command'
            ? COMMAND_PERMISSION_REQUEST_KEYS
            : FILE_PERMISSION_REQUEST_KEYS;
    if (
        request === null ||
        typeof request !== 'object' ||
        Array.isArray(request) ||
        expectedPermission === undefined ||
        !Object.keys(request).every((key) => allowedKeys.has(key)) ||
        request.toolName !== extra.toolName ||
        request.serverName !== extra.serverName ||
        request.permissionType !== extra.permissionType ||
        request.toolName !== tool.name ||
        (request.description !== undefined &&
            typeof request.description !== 'string') ||
        (request.rememberable !== undefined &&
            typeof request.rememberable !== 'boolean') ||
        (request.paths !== undefined &&
            (!Array.isArray(request.paths) ||
                request.paths.length > 16 ||
                !request.paths.every(nonEmptyString))) ||
        (request.command !== undefined &&
            (typeof request.command !== 'string' ||
                Buffer.byteLength(request.command, 'utf8') > 4_096)) ||
        (request.commandSignature !== undefined &&
            !nonEmptyString(request.commandSignature))
    )
        throw invalidEvent();
    if (
        request.serverName !== 'agent-filesystem' ||
        request.permissionType !== expectedPermission
    )
        throw invalidEvent();
    const input = normalizedToolInput(tool.input);
    if (tool.name === 'exec' && request.command !== input?.command)
        throw invalidEvent();
    return {
        toolName: request.toolName,
        serverName: request.serverName,
        permissionType: request.permissionType,
        ...(request.paths === undefined ? {} : { paths: request.paths }),
        ...(request.command === undefined
            ? {}
            : { command: request.command }),
        ...(request.commandSignature === undefined
            ? {}
            : { commandSignature: request.commandSignature }),
    };
}

function sameJson(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
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
    let requestTransitionAllowed = false;
    const tools = new Map();
    const interactions = new Set();

    function correlate(payload) {
        if (payload.sessionId !== sessionId) throw invalidEvent();
        requestId ??= payload.requestId;
        messageId ??= payload.messageId;
        if (payload.messageId !== messageId) throw invalidEvent();
        if (payload.requestId !== requestId) {
            if (!requestTransitionAllowed) throw invalidEvent();
            requestId = payload.requestId;
            requestTransitionAllowed = false;
        }
    }

    function emitToolUse(events, toolCallId, state) {
        if (state.emitted) return;
        state.input = normalizedToolInput(state.input);
        state.emitted = true;
        events.push({
            kind: 'tool_use',
            toolCallId,
            name: state.name,
            input: state.input,
        });
    }

    return {
        project(eventName, payload) {
            validatePayload(eventName, payload);
            correlate(payload);
            if (terminal) throw invalidEvent();

            if (eventName === 'chat.stream.failed') {
                terminal = true;
                const failure = new BackendFailure(
                    'INTERNAL_ERROR',
                    'JiaorongAI failed the Agent Session stream.',
                );
                failure.remoteSettled = true;
                throw failure;
            }
            if (eventName === 'chat.stream.completed') {
                terminal = true;
                return [{ kind: 'complete', usage: null, turns: 1 }];
            }
            if (payload.blocks.some((block) =>
                ![
                    'content',
                    'reasoning_content',
                    'tool_call',
                    'action',
                ].includes(block.type),
            ))
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
            const permissionActions = new Map();
            for (const block of payload.blocks.filter(
                ({ type }) => type === 'action',
            )) {
                if (
                    block.action_type !== 'tool_call_permission' ||
                    block.extra === null ||
                    typeof block.extra !== 'object' ||
                    typeof block.extra.needsUserAction !== 'boolean'
                )
                    throw invalidEvent();
                const tool = toolCallDocument(block);
                if (permissionActions.has(tool.id)) throw invalidEvent();
                let decision;
                if (
                    block.status === 'pending' &&
                    block.extra.needsUserAction === true
                ) {
                    decision = 'pending';
                } else if (
                    block.status === 'denied' &&
                    block.extra.needsUserAction === false
                ) {
                    decision = 'denied';
                } else if (
                    ['granted', 'success'].includes(block.status) &&
                    block.extra.needsUserAction === false
                ) {
                    decision = 'granted';
                } else {
                    throw invalidEvent();
                }
                const permission = permissionDocument(block, tool);
                permissionActions.set(tool.id, {
                    block,
                    tool,
                    permission,
                    decision,
                });
            }

            for (const block of payload.blocks.filter(
                ({ type }) => type === 'tool_call',
            )) {
                const tool = toolCallDocument(block);
                let state = tools.get(tool.id);
                if (state === undefined) {
                    state = {
                        name: tool.name,
                        input: tool.input,
                        emitted: false,
                        permission: null,
                        terminal: null,
                    };
                    tools.set(tool.id, state);
                } else if (state.name !== tool.name) {
                    throw invalidEvent();
                } else if (!state.emitted) {
                    state.input = tool.input;
                } else if (
                    !sameJson(state.input, normalizedToolInput(tool.input))
                ) {
                    throw invalidEvent();
                }
                const permission = permissionActions.get(tool.id);
                if (permission) {
                    if (
                        state.permission !== null &&
                        state.permission !== 'pending' &&
                        state.permission !== permission.decision
                    )
                        throw invalidEvent();
                    state.permission = permission.decision;
                } else if (state.permission === 'pending') {
                    throw invalidEvent();
                }

                if (block.status === 'pending') {
                    if (state.terminal !== null) throw invalidEvent();
                    continue;
                }
                if (block.status === 'loading') {
                    if (state.terminal !== null) throw invalidEvent();
                    if (block.extra?.toolCallArgsComplete !== true)
                        throw invalidEvent();
                    emitToolUse(events, tool.id, state);
                    continue;
                }
                if (!['success', 'error', 'granted', 'denied'].includes(block.status))
                    throw invalidEvent();
                if (!tool.hasResponse) throw invalidEvent();
                if (block.extra?.toolCallArgsComplete !== true)
                    throw invalidEvent();
                emitToolUse(events, tool.id, state);
                if (state.permission === 'pending') continue;
                const permissionDenied =
                    block.status === 'denied' ||
                    state.permission === 'denied';
                if (
                    state.permission === 'denied' &&
                    !['error', 'denied'].includes(block.status)
                )
                    throw invalidEvent();
                const terminalEvent =
                    block.status === 'success' || block.status === 'granted'
                        ? {
                              kind: 'tool_result',
                              toolCallId: tool.id,
                              status: 'success',
                              output: boundedToolOutput(tool.response),
                              error: null,
                          }
                        : {
                              kind: 'tool_result',
                              toolCallId: tool.id,
                              status: 'failed',
                              output: null,
                              error: {
                                  code: permissionDenied
                                      ? 'PERMISSION_DENIED'
                                      : 'TOOL_FAILED',
                                  message: permissionDenied
                                      ? 'The tool request was denied by the headless permission policy.'
                                      : 'The JiaorongAI tool request failed.',
                              },
                          };
                if (state.terminal === null) {
                    state.terminal = terminalEvent;
                    events.push(terminalEvent);
                } else if (!sameJson(state.terminal, terminalEvent)) {
                    throw invalidEvent();
                }
            }

            for (const block of payload.blocks.filter(
                ({ type }) => type === 'action',
            )) {
                const action = permissionActions.get(block.tool_call.id);
                const tool = action.tool;
                const state = tools.get(tool.id);
                if (
                    state === undefined ||
                    state.name !== tool.name
                )
                    throw invalidEvent();
                if (action.decision !== 'pending') continue;
                const interactionInput = normalizedToolInput(tool.input);
                if (state.emitted && !sameJson(state.input, interactionInput))
                    throw invalidEvent();
                if (!state.emitted) state.input = interactionInput;
                emitToolUse(events, tool.id, state);
                if (!interactions.has(tool.id)) {
                    interactions.add(tool.id);
                    events.push({
                        kind: 'tool_interaction',
                        sessionId,
                        messageId,
                        toolCallId: tool.id,
                        actionType: block.action_type,
                        tool: {
                            name: tool.name,
                            input: interactionInput,
                        },
                        permission: action.permission,
                    });
                }
            }
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

        currentIdentity() {
            return { requestId, messageId };
        },

        acceptInteraction(toolCallId) {
            const state = tools.get(toolCallId);
            if (
                requestTransitionAllowed ||
                !interactions.has(toolCallId) ||
                state?.permission !== 'pending' ||
                state.terminal !== null
            )
                throw invalidEvent();
            requestTransitionAllowed = true;
        },

        failPending({ code = 'INTERNAL_ERROR', message }) {
            const results = [];
            for (const [toolCallId, state] of tools) {
                if (state.terminal !== null) continue;
                emitToolUse(results, toolCallId, state);
                const cancelled = code === 'CANCELLED';
                const event = {
                    kind: 'tool_result',
                    toolCallId,
                    status: cancelled ? 'cancelled' : 'failed',
                    output: null,
                    error: {
                        code,
                        message:
                            message ??
                            (cancelled
                                ? 'The tool request was cancelled.'
                                : 'The tool request did not reach a verified terminal state.'),
                    },
                };
                state.terminal = event;
                results.push(event);
            }
            return results;
        },

        assertComplete() {
            if (
                !terminal ||
                !sendBound ||
                requestId === null ||
                messageId === null ||
                [...tools.values()].some(({ terminal: result }) => result === null)
            )
                throw invalidEvent();
        },
    };
}
