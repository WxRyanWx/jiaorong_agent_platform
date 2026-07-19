import { createServer } from 'node:http';
import { runInNewContext } from 'node:vm';

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
    targetCount = 1,
    websocketUrl,
    targetUrl =
        'file:///Applications/JiaorongAI.app/Contents/Resources/app.asar/out/renderer/index.html#/chat',
    evaluateDelayMs = 0,
    responsePadding = '',
    metadataBody,
    targetBody,
    metadataDelayMs = 0,
} = {}) {
    const state = {
        activeSubscriptions: 0,
        subscriptions: [],
        unsubscriptions: 0,
        invokedRoutes: [],
    };
    const unavailableRoutes = new Set(missingRoutes);
    const unavailableEvents = new Set(missingEvents);
    const hangingRoutes = new Set(hangRoutes);

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
    websocketServer.on('connection', (client) => {
        client.on('message', async (data) => {
            const message = JSON.parse(data.toString('utf8'));
            if (evaluateDelayMs > 0)
                await new Promise((resolve) =>
                    setTimeout(resolve, evaluateDelayMs),
                );
            let result = {};
            if (message.method === 'Runtime.evaluate') {
                const deepchat = {};
                if (!missingMethods.includes('invoke')) {
                    deepchat.invoke = async (route, input) => {
                        state.invokedRoutes.push(route);
                        if (!allRoutes.has(route) || unavailableRoutes.has(route))
                            throw new Error(`Unknown deepchat route: ${route}`);
                        if (input === null)
                            throw new Error('Invalid bridge route input');
                        if (hangingRoutes.has(route))
                            return new Promise(() => {});
                        if (route === 'device.getAppVersion')
                            return { version: appVersion };
                        if (route === 'providers.listSummaries')
                            return { providers };
                        if (route === 'models.getProviderCatalog')
                            return {
                                catalog: catalogs[input.providerId] ?? {
                                    providerModels: [],
                                    customModels: [],
                                    dbProviderModels: [],
                                    modelStatusMap: {},
                                },
                            };
                        throw new Error('Unexpected non-probe bridge invocation');
                    };
                }
                if (!missingMethods.includes('on')) {
                    deepchat.on = (eventName) => {
                        if (!allEvents.has(eventName) || unavailableEvents.has(eventName))
                            throw new Error(`Unknown deepchat event: ${eventName}`);
                        state.activeSubscriptions += 1;
                        state.subscriptions.push(eventName);
                        let active = true;
                        return () => {
                            if (!active) return;
                            active = false;
                            state.activeSubscriptions -= 1;
                            state.unsubscriptions += 1;
                            if (unsubscribeThrows)
                                throw new Error('unsubscribe failed');
                        };
                    };
                }
                try {
                    const value = await runInNewContext(
                        message.params.expression,
                        {
                            window: { deepchat },
                            setTimeout,
                            clearTimeout,
                        },
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
        async close() {
            for (const client of websocketServer.clients) client.terminate();
            await new Promise((resolve) => websocketServer.close(resolve));
            await new Promise((resolve) => server.close(resolve));
        },
    };
}
