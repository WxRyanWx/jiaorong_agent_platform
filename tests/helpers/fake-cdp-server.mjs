import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { basename } from 'node:path';
import { createContext, runInContext } from 'node:vm';

import { WebSocketServer, WebSocket } from 'ws';

const allRoutes = new Set([
    'device.getAppVersion',
    'sessions.getAgents',
    'sessions.create',
    'sessions.restore',
    'sessions.setProjectDir',
    'sessions.setPermissionMode',
    'sessions.setModel',
    'sessions.delete',
    'providers.listSummaries',
    'providers.testConnection',
    'models.getProviderCatalog',
    'file.prepareFile',
    'chat.sendMessage',
    'chat.stopStream',
    'chat.respondToolInteraction',
]);
const allEvents = new Set([
    'chat.stream.updated',
    'chat.stream.completed',
    'chat.stream.failed',
]);

export async function startFakeCdpServer({
    appVersion = '0.5.6',
    providers = [{ id: 'provider-test', enable: true }],
    testConnectionResult = { isOk: true, errorMsg: null },
    catalogs = {
        'provider-test': {
            providerModels: [
                {
                    id: 'model-test',
                    providerId: 'provider-test',
                    enabled: true,
                },
            ],
            customModels: [],
            dbProviderModels: [],
            modelStatusMap: { 'model-test': true },
        },
    },
    missingRoutes = [],
    missingEvents = [],
    missingMethods = [],
    hangRoutes = [],
    unsubscribeThrows = false,
    unsubscribeThrowAt = [],
    targetCount = 1,
    websocketUrl,
    targetUrl =
        'file:///Applications/JiaorongAI.app/Contents/Resources/app.asar/out/renderer/index.html#/chat',
    evaluateDelayMs = 0,
    responsePadding = '',
    metadataBody,
    targetBody,
    metadataDelayMs = 0,
    agents = [
        {
            id: 'deepchat',
            name: 'JiaorongAI',
            type: 'deepchat',
            enabled: true,
        },
    ],
    sessionId = 'session-test',
    sessionIds,
    sessionProviderId = 'provider-test',
    sessionModelId = 'model-test',
    sessionResponseProviderId,
    sessionResponseModelId,
    sendResult = {
        accepted: true,
        requestId: null,
        messageId: null,
    },
    streamRequestId = 'app-request-test',
    streamMessageId = 'message-test',
    streamEvents,
    streamEventsPerSend,
    respondWithSessionHistory = false,
    sharedRenderer = false,
    streamDelayMs = 0,
    dropRuntimeStartResponse = false,
    dropRuntimeStartResponseCount,
    dropRuntimeCleanupRequest = false,
    dropRuntimeCleanupRequestCount,
    emitLateTerminalBeforeCleanup = false,
    prepareFileFactory,
} = {}) {
    const state = {
        activeSubscriptions: 0,
        subscriptions: [],
        unsubscriptions: 0,
        invokedRoutes: [],
        testConnectionInputs: [],
        createInputs: [],
        restoreInputs: [],
        prepareFileInputs: [],
        sendInputs: [],
        stopInputs: [],
        lateTerminalEmitted: false,
    };
    const sessions = new Map();
    const sessionPrompts = new Map();
    const unavailableRoutes = new Set(missingRoutes);
    const unavailableEvents = new Set(missingEvents);
    const hangingRoutes = new Set(hangRoutes);
    const unsubscribeThrowNumbers = new Set(unsubscribeThrowAt);
    let remainingStartResponseDrops =
        dropRuntimeStartResponseCount ??
        (dropRuntimeStartResponse ? Number.POSITIVE_INFINITY : 0);
    let remainingCleanupRequestDrops =
        dropRuntimeCleanupRequestCount ??
        (dropRuntimeCleanupRequest ? Number.POSITIVE_INFINITY : 0);

    const server = createServer(async (request, response) => {
        const address = server.address();
        const pageWebsocketUrl =
            websocketUrl ??
            `ws://127.0.0.1:${address.port}/devtools/page/jiaorong-0`;
        response.setHeader('content-type', 'application/json');
        if (request.url === '/json/version') {
            if (metadataDelayMs > 0)
                await new Promise((resolve) =>
                    setTimeout(resolve, metadataDelayMs),
                );
            response.end(
                metadataBody ??
                    JSON.stringify({
                        Browser: 'JiaorongAI/0.5.6',
                        'Protocol-Version': '1.3',
                    }),
            );
            return;
        }
        if (request.url === '/json/list') {
            response.end(
                targetBody ??
                    JSON.stringify(
                        Array.from({ length: targetCount }, (_, index) => ({
                            id: `jiaorong-${index}`,
                            type: 'page',
                            title: 'JiaorongAI',
                            url: targetUrl,
                            webSocketDebuggerUrl:
                                websocketUrl ??
                                `ws://127.0.0.1:${address.port}/devtools/page/jiaorong-${index}`,
                        })),
                    ),
            );
            return;
        }
        response.statusCode = 404;
        response.end('{}');
    });
    const websocketServer = new WebSocketServer({ noServer: true });
    server.on('upgrade', (request, socket, head) => {
        websocketServer.handleUpgrade(request, socket, head, (client) => {
            websocketServer.emit('connection', client, request);
        });
    });
    let sharedRuntime;
    websocketServer.on('connection', (client) => {
        let runtime = sharedRenderer ? sharedRuntime : undefined;
        if (!runtime) {
            const listeners = new Map();
            const deepchat = {};
            const context = createContext({
                window: { deepchat },
                setTimeout,
                clearTimeout,
                atob,
                TextDecoder,
                TextEncoder,
            });
            const emit = (eventName, payload) => {
                for (const listener of listeners.get(eventName) ?? [])
                    listener(payload);
            };
            runtime = { listeners, deepchat, context, emit };
            if (sharedRenderer) sharedRuntime = runtime;
        }
        const { listeners, deepchat, context, emit } = runtime;
        const eventsForRun = (input) => {
            if (streamEventsPerSend)
                return streamEventsPerSend[state.sendInputs.length - 1] ?? [];
            if (streamEvents) return streamEvents;
            const eventSessionId = input.sessionId;
            const sendOrdinal = state.sendInputs.length;
            const eventRequestId = sessionIds
                ? `${streamRequestId}-${eventSessionId}-${sendOrdinal}`
                : streamRequestId;
            const eventMessageId = sessionIds
                ? `${streamMessageId}-${eventSessionId}-${sendOrdinal}`
                : streamMessageId;
            let content = 'Hello 世界';
            if (respondWithSessionHistory) {
                const prompts = sessionPrompts.get(eventSessionId) ?? [];
                prompts.push(input.content);
                sessionPrompts.set(eventSessionId, prompts);
                content = prompts.join(' > ');
            }
            return [
                {
                    name: 'chat.stream.updated',
                    payload: {
                        kind: 'snapshot',
                        requestId: eventRequestId,
                        sessionId: eventSessionId,
                        messageId: eventMessageId,
                        updatedAt: 10,
                        blocks: [
                            {
                                id: 'reasoning-test',
                                type: 'reasoning_content',
                                content: 'Checking',
                                status: 'pending',
                                timestamp: 8,
                            },
                            {
                                id: 'content-test',
                                type: 'content',
                                content: content.slice(0, 1),
                                status: 'pending',
                                timestamp: 9,
                            },
                        ],
                    },
                },
                {
                    name: 'chat.stream.updated',
                    payload: {
                        kind: 'snapshot',
                        requestId: eventRequestId,
                        sessionId: eventSessionId,
                        messageId: eventMessageId,
                        updatedAt: 11,
                        blocks: [
                            {
                                id: 'reasoning-test',
                                type: 'reasoning_content',
                                content: 'Checking files',
                                status: 'success',
                                timestamp: 8,
                            },
                            {
                                id: 'content-test',
                                type: 'content',
                                content,
                                status: 'success',
                                timestamp: 9,
                            },
                        ],
                    },
                },
                {
                    name: 'chat.stream.completed',
                    payload: {
                        requestId: eventRequestId,
                        sessionId: eventSessionId,
                        messageId: eventMessageId,
                        completedAt: 12,
                    },
                },
            ];
        };

        if (
            !missingMethods.includes('invoke') &&
            typeof deepchat.invoke !== 'function'
        ) {
            deepchat.invoke = async (route, input) => {
                state.invokedRoutes.push(route);
                if (!allRoutes.has(route) || unavailableRoutes.has(route))
                    throw new Error(`Unknown deepchat route: ${route}`);
                if (input === null)
                    throw new Error('Invalid bridge route input');
                if (hangingRoutes.has(route)) return new Promise(() => {});
                if (route === 'device.getAppVersion')
                    return { version: appVersion };
                if (route === 'providers.listSummaries') return { providers };
                if (route === 'providers.testConnection') {
                    state.testConnectionInputs.push(
                        JSON.parse(JSON.stringify(input)),
                    );
                    return testConnectionResult;
                }
                if (route === 'models.getProviderCatalog') {
                    return {
                        catalog: catalogs[input.providerId] ?? {
                            providerModels: [],
                            customModels: [],
                            dbProviderModels: [],
                            modelStatusMap: {},
                        },
                    };
                }
                if (route === 'sessions.getAgents') return { agents };
                if (route === 'sessions.create') {
                    state.createInputs.push(
                        JSON.parse(JSON.stringify(input)),
                    );
                    const createdSessionId =
                        sessionIds?.[state.createInputs.length - 1] ??
                        sessionId;
                    const session = {
                            id: createdSessionId,
                            agentId: input.agentId,
                            title: String(input.message).slice(0, 50),
                            projectDir: input.projectDir ?? null,
                            isPinned: false,
                            sessionKind: 'regular',
                            subagentEnabled: false,
                            createdAt: 1,
                            updatedAt: 1,
                            status: 'idle',
                            providerId:
                                sessionResponseProviderId ??
                                input.providerId ??
                                sessionProviderId,
                            modelId:
                                sessionResponseModelId ??
                                input.modelId ??
                                sessionModelId,
                        };
                    sessions.set(session.id, session);
                    sessionPrompts.set(session.id, []);
                    return { session };
                }
                if (route === 'sessions.restore') {
                    state.restoreInputs.push(
                        JSON.parse(JSON.stringify(input)),
                    );
                    return {
                        session: sessions.get(input.sessionId) ?? null,
                        messages: [],
                        nextCursor: null,
                        hasMore: false,
                    };
                }
                if (route === 'file.prepareFile') {
                    state.prepareFileInputs.push(
                        JSON.parse(JSON.stringify(input)),
                    );
                    if (prepareFileFactory)
                        return { file: await prepareFileFactory(input) };
                    const fileStat = await stat(input.path);
                    const source = await readFile(input.path);
                    const name = basename(input.path);
                    const image = input.mimeType.startsWith('image/');
                    return {
                        file: {
                            name,
                            path: input.path,
                            mimeType: input.mimeType,
                            size: fileStat.size,
                            content: image
                                ? `data:${input.mimeType};base64,${source.toString('base64')}`
                                : source.toString('utf8'),
                            token: 1,
                            thumbnail: '',
                            metadata: {
                                fileName: name,
                                fileSize: fileStat.size,
                                fileDescription: input.mimeType,
                                fileCreated: fileStat.birthtime.toISOString(),
                                fileModified: fileStat.mtime.toISOString(),
                            },
                        },
                    };
                }
                if (route === 'chat.sendMessage') {
                    state.sendInputs.push(JSON.parse(JSON.stringify(input)));
                    if (streamDelayMs > 0)
                        await new Promise((resolve) =>
                            setTimeout(resolve, streamDelayMs),
                        );
                    for (const event of eventsForRun(input))
                        emit(event.name, event.payload);
                    return sendResult;
                }
                if (route === 'chat.stopStream') {
                    state.stopInputs.push(JSON.parse(JSON.stringify(input)));
                    return { stopped: true };
                }
                if (route === 'sessions.setProjectDir') {
                    return { session: { id: sessionId } };
                }
                if (route === 'sessions.setPermissionMode')
                    return { updated: true };
                if (route === 'sessions.setModel') {
                    return { session: { id: sessionId } };
                }
                if (route === 'sessions.delete') return { deleted: true };
                throw new Error('Unexpected non-probe bridge invocation');
            };
        }
        if (!missingMethods.includes('on') && typeof deepchat.on !== 'function') {
            deepchat.on = (eventName, listener) => {
                if (
                    !allEvents.has(eventName) ||
                    unavailableEvents.has(eventName)
                )
                    throw new Error(`Unknown deepchat event: ${eventName}`);
                if (typeof listener !== 'function')
                    throw new Error('Bridge event listener is required');
                const eventListeners = listeners.get(eventName) ?? new Set();
                eventListeners.add(listener);
                listeners.set(eventName, eventListeners);
                state.activeSubscriptions += 1;
                state.subscriptions.push(eventName);
                let active = true;
                return () => {
                    if (!active) return;
                    active = false;
                    eventListeners.delete(listener);
                    state.activeSubscriptions -= 1;
                    state.unsubscriptions += 1;
                    if (
                        unsubscribeThrows ||
                        unsubscribeThrowNumbers.has(state.unsubscriptions)
                    )
                        throw new Error('unsubscribe failed');
                };
            };
        }

        client.on('message', async (data) => {
            const message = JSON.parse(data.toString('utf8'));
            if (evaluateDelayMs > 0)
                await new Promise((resolve) =>
                    setTimeout(resolve, evaluateDelayMs),
                );
            let result = {};
            if (message.method === 'Runtime.evaluate') {
                if (
                    remainingCleanupRequestDrops > 0 &&
                    message.params.expression.includes(
                        'const cleanupError = state.cleanup(',
                    )
                ) {
                    remainingCleanupRequestDrops -= 1;
                    return;
                }
                try {
                    if (
                        emitLateTerminalBeforeCleanup &&
                        !state.lateTerminalEmitted &&
                        message.params.expression.includes(
                            'const cleanupError = state.cleanup(',
                        )
                    ) {
                        state.lateTerminalEmitted = true;
                        emit('chat.stream.completed', {
                            requestId: streamRequestId,
                            sessionId,
                            messageId: streamMessageId,
                            completedAt: 13,
                        });
                    }
                    const value = await runInContext(
                        message.params.expression,
                        context,
                        { timeout: 1_000 },
                    );
                    if (responsePadding) value.padding = responsePadding;
                    result = { result: { type: 'object', value } };
                } catch (error) {
                    result = {
                        exceptionDetails: {
                            text: String(error?.message ?? error),
                        },
                    };
                }
            }
            if (
                remainingStartResponseDrops > 0 &&
                message.method === 'Runtime.evaluate' &&
                message.params.expression.includes(
                    '__JIAORONG_CLI_RUNS_V1__',
                ) &&
                message.params.expression.includes("bridge.invoke('chat.sendMessage'")
            ) {
                remainingStartResponseDrops -= 1;
                return;
            }
            if (client.readyState === WebSocket.OPEN)
                client.send(JSON.stringify({ id: message.id, result }));
        });
    });
    await new Promise((resolve) =>
        server.listen(0, '127.0.0.1', resolve),
    );
    const { port } = server.address();
    return {
        endpoint: `http://127.0.0.1:${port}`,
        state,
        deleteSession(value) {
            sessions.delete(value);
            sessionPrompts.delete(value);
        },
        async close() {
            for (const client of websocketServer.clients) client.terminate();
            await new Promise((resolve) => websocketServer.close(resolve));
            await new Promise((resolve) => server.close(resolve));
        },
    };
}
