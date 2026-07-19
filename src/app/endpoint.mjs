import { AppReadinessError } from './readiness-error.mjs';

const loopbackHosts = new Set(['127.0.0.1', '[::1]']);

export function parseLoopbackEndpoint(value) {
    let endpoint;
    try {
        endpoint = new URL(value);
    } catch {
        throw new AppReadinessError(
            'loopback-endpoint',
            'The JiaorongAI debugging endpoint is not a valid URL.',
        );
    }
    if (endpoint.protocol !== 'http:') {
        throw new AppReadinessError(
            'loopback-endpoint',
            'The JiaorongAI debugging endpoint must use HTTP.',
        );
    }
    if (!loopbackHosts.has(endpoint.hostname)) {
        throw new AppReadinessError(
            'loopback-endpoint',
            'The JiaorongAI debugging endpoint must use a loopback address.',
        );
    }
    if (endpoint.username || endpoint.password) {
        throw new AppReadinessError(
            'loopback-endpoint',
            'The JiaorongAI debugging endpoint must not contain credentials.',
        );
    }
    if (
        endpoint.pathname !== '/' ||
        endpoint.search ||
        endpoint.hash ||
        !endpoint.port
    ) {
        throw new AppReadinessError(
            'loopback-endpoint',
            'The JiaorongAI debugging endpoint must be one HTTP origin.',
        );
    }
    return endpoint;
}

export function assertLoopbackWebSocket(value, expectedEndpoint, targetId) {
    let websocket;
    try {
        websocket = new URL(value);
    } catch {
        throw new AppReadinessError(
            'renderer-target',
            'The renderer WebSocket URL is invalid.',
        );
    }
    if (
        websocket.protocol !== 'ws:' ||
        !loopbackHosts.has(websocket.hostname) ||
        websocket.port !== expectedEndpoint.port ||
        websocket.username ||
        websocket.password ||
        websocket.pathname !== `/devtools/page/${targetId}` ||
        websocket.search ||
        websocket.hash
    ) {
        throw new AppReadinessError(
            'renderer-target',
            'The renderer WebSocket is not owned by the verified loopback endpoint.',
        );
    }
    return websocket;
}
