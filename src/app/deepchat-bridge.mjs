import { BackendFailure } from '../cli/failures.mjs';
import { createBridgeProjector } from './bridge-projector.mjs';

const RUN_EVENTS = [
    'chat.stream.updated',
    'chat.stream.completed',
    'chat.stream.failed',
];
const INVOKE_ROUTES = new Set([
    'sessions.getAgents',
    'sessions.create',
    'sessions.restore',
    'providers.testConnection',
]);
const MAX_BUFFERED_EVENTS = 128;
const MAX_EVENT_BYTES = 32 * 1_024;
const DRAIN_BATCH_SIZE = 4;
const MAX_RETIRED_IDENTITIES = 16_384;

function bridgeFailure(message = 'The JiaorongAI bridge request failed.') {
    return new BackendFailure('INTERNAL_ERROR', message);
}

function expressionValue(response) {
    if (response?.exceptionDetails) throw bridgeFailure();
    if (!response?.result || !('value' in response.result))
        throw bridgeFailure();
    return response.result.value;
}

async function evaluate(client, expression, timeoutMs) {
    const response = await client.request(
        'Runtime.evaluate',
        {
            expression,
            awaitPromise: true,
            returnByValue: true,
            timeout: timeoutMs,
        },
        { timeoutMs: timeoutMs + 250 },
    );
    return expressionValue(response);
}

export async function invokeBridgeRoute(
    client,
    route,
    input,
    { timeoutMs = 10_000 } = {},
) {
    if (!INVOKE_ROUTES.has(route)) throw bridgeFailure();
    const expression = `
(async () => {
  const bridge = window.deepchat;
  if (!bridge || typeof bridge.invoke !== 'function') throw new Error('bridge unavailable');
  return await bridge.invoke(${JSON.stringify(route)}, ${JSON.stringify(input)});
})()
`;
    return evaluate(client, expression, timeoutMs);
}

function startExpression(token, sessionId, prompt, rendererDeadlineMs) {
    const promptBase64 = Buffer.from(prompt, 'utf8').toString('base64');
    return `
(() => {
  const bridge = window.deepchat;
  if (!bridge || typeof bridge.invoke !== 'function' || typeof bridge.on !== 'function') {
    throw new Error('bridge unavailable');
  }
  const storeName = '__JIAORONG_CLI_RUNS_V1__';
  const store = window[storeName] || Object.defineProperty(window, storeName, {
    value: Object.create(null), configurable: true
  })[storeName];
  const lockStoreName = '__JIAORONG_CLI_SESSION_LOCKS_V1__';
  const locks = window[lockStoreName] || Object.defineProperty(window, lockStoreName, {
    value: Object.create(null), configurable: true
  })[lockStoreName];
  const identityStoreName = '__JIAORONG_CLI_RETIRED_IDENTITIES_V1__';
  const identityHistory = window[identityStoreName] || Object.defineProperty(window, identityStoreName, {
    value: { bySession: Object.create(null), total: 0, saturated: false }, configurable: true
  })[identityStoreName];
  const token = ${JSON.stringify(token)};
  const sessionId = ${JSON.stringify(sessionId)};
  if (store[token]) throw new Error('run token collision');
  if (identityHistory.saturated) return { started: false, historyFull: true };
  if (locks[sessionId]) return { started: false, busy: true };
  locks[sessionId] = token;
  const state = {
    events: [],
    overflow: false,
    terminalCount: 0,
    identities: [],
    send: { status: 'pending' },
    unsubscriptions: [],
    deadlineTimer: undefined,
    cleaned: false,
    cleanup: undefined
  };
  store[token] = state;
  state.cleanup = () => {
    if (state.cleaned) return false;
    state.cleaned = true;
    clearTimeout(state.deadlineTimer);
    let cleanupError = false;
    for (const unsubscribe of state.unsubscriptions.reverse()) {
      try { unsubscribe(); } catch { cleanupError = true; }
    }
    let retired = identityHistory.bySession[sessionId];
    if (!retired) {
      retired = [];
      identityHistory.bySession[sessionId] = retired;
    }
    for (const identity of state.identities) {
      if (retired.includes(identity)) continue;
      if (identityHistory.total >= ${MAX_RETIRED_IDENTITIES}) {
        identityHistory.saturated = true;
        cleanupError = true;
        break;
      }
      retired.push(identity);
      identityHistory.total += 1;
    }
    delete store[token];
    return cleanupError;
  };
  const enqueue = (name, payload) => {
    if (!payload || payload.sessionId !== sessionId) return;
    let size = ${MAX_EVENT_BYTES + 1};
    try { size = new TextEncoder().encode(JSON.stringify(payload)).byteLength; } catch {}
    if (size > ${MAX_EVENT_BYTES} || state.events.length >= ${MAX_BUFFERED_EVENTS}) {
      state.overflow = true;
      return;
    }
    if (typeof payload.requestId === 'string' && typeof payload.messageId === 'string') {
      const identity = JSON.stringify([payload.requestId, payload.messageId]);
      if (identityHistory.bySession[sessionId]?.includes(identity)) return;
      if (!state.identities.includes(identity)) state.identities.push(identity);
    }
    if (name === 'chat.stream.completed' || name === 'chat.stream.failed') {
      state.terminalCount += 1;
    }
    state.events.push({ name, payload });
  };
  try {
    const promptBytes = Uint8Array.from(
      atob(${JSON.stringify(promptBase64)}),
      (character) => character.charCodeAt(0)
    );
    const prompt = new TextDecoder().decode(promptBytes);
    for (const name of ${JSON.stringify(RUN_EVENTS)}) {
      const unsubscribe = bridge.on(name, (payload) => enqueue(name, payload));
      if (typeof unsubscribe !== 'function') throw new Error('subscription cleanup unavailable');
      state.unsubscriptions.push(unsubscribe);
    }
    state.deadlineTimer = setTimeout(() => state.cleanup(), ${JSON.stringify(rendererDeadlineMs)});
    Promise.resolve()
      .then(() => bridge.invoke('chat.sendMessage', {
        sessionId: ${JSON.stringify(sessionId)},
        content: prompt
      }))
      .then(
        (value) => { state.send = { status: 'fulfilled', value }; },
        () => { state.send = { status: 'rejected' }; }
      );
    return { started: true };
  } catch (error) {
    state.cleanup();
    throw error;
  }
})()
`;
}

function pollExpression(token) {
    return `
(() => {
  const store = window.__JIAORONG_CLI_RUNS_V1__;
  const state = store && store[${JSON.stringify(token)}];
  if (!state) return { missing: true };
  const events = state.events.splice(0, ${DRAIN_BATCH_SIZE});
  return {
    missing: false,
    events,
    remaining: state.events.length,
    overflow: state.overflow,
    terminalCount: state.terminalCount,
    send: state.send
  };
})()
`;
}

function cleanupExpression(token) {
    return `
(() => {
  const store = window.__JIAORONG_CLI_RUNS_V1__;
  const state = store && store[${JSON.stringify(token)}];
  if (!state) return { cleaned: false, cleanupError: false };
  const terminalCount = state.terminalCount;
  const remaining = state.events.length;
  const overflow = state.overflow;
  const cleanupError = state.cleanup();
  return { cleaned: true, cleanupError, terminalCount, remaining, overflow };
})()
`;
}

function releaseExpression(token, sessionId) {
    return `
(() => {
  const locks = window.__JIAORONG_CLI_SESSION_LOCKS_V1__;
  if (!locks || locks[${JSON.stringify(sessionId)}] !== ${JSON.stringify(token)}) {
    return { released: false };
  }
  delete locks[${JSON.stringify(sessionId)}];
  return { released: true };
})()
`;
}

function validPoll(document) {
    return (
        document !== null &&
        typeof document === 'object' &&
        document.missing === false &&
        Array.isArray(document.events) &&
        Number.isInteger(document.remaining) &&
        document.remaining >= 0 &&
        typeof document.overflow === 'boolean' &&
        Number.isInteger(document.terminalCount) &&
        document.terminalCount >= 0 &&
        document.send !== null &&
        typeof document.send === 'object' &&
        ['pending', 'fulfilled', 'rejected'].includes(document.send.status)
    );
}

function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function* runBridgeTurn(
    client,
    { sessionId, prompt, invokeTimeoutMs = 10_000, runTimeoutMs },
) {
    const token = crypto.randomUUID();
    const projector = createBridgeProjector({ sessionId });
    let sendBound = false;
    let terminalFailureObserved = false;
    let started = false;
    let runSucceeded = false;
    const deadline = Date.now() + runTimeoutMs;
    try {
        const start = await evaluate(
            client,
            startExpression(token, sessionId, prompt, runTimeoutMs),
            invokeTimeoutMs,
        );
        if (start?.busy === true)
            throw new BackendFailure(
                'INVALID_ARGUMENT',
                'The JiaorongAI Session already has an active run.',
                42,
            );
        if (start?.historyFull === true)
            throw bridgeFailure(
                'The JiaorongAI request identity history reached its safety limit; restart JiaorongAI before running another Session.',
            );
        if (start?.started !== true) throw bridgeFailure();
        started = true;

        while (Date.now() <= deadline) {
            const document = await evaluate(
                client,
                pollExpression(token),
                invokeTimeoutMs,
            );
            if (!validPoll(document) || document.overflow)
                throw bridgeFailure(
                    'JiaorongAI returned an invalid stream event.',
                );
            if (document.terminalCount > 1)
                throw bridgeFailure(
                    'JiaorongAI returned an invalid stream event.',
                );

            if (document.send.status === 'rejected')
                throw bridgeFailure('JiaorongAI rejected the Agent Session run.');
            if (document.send.status === 'fulfilled' && !sendBound) {
                projector.bindSendResult(document.send.value);
                sendBound = true;
            }

            for (const event of document.events) {
                let projectedEvents;
                try {
                    projectedEvents = projector.project(
                        event?.name,
                        event?.payload,
                    );
                } catch (error) {
                    if (error?.remoteSettled === true)
                        terminalFailureObserved = true;
                    throw error;
                }
                for (const projected of projectedEvents) {
                    yield projected;
                }
            }

            if (
                sendBound &&
                document.terminalCount === 1 &&
                document.remaining === 0 &&
                document.events.length === 0
            ) {
                projector.assertComplete();
                runSucceeded = true;
                return;
            }
            await delay(5);
        }
        throw bridgeFailure('The JiaorongAI Agent Session did not settle.');
    } finally {
        if (started) {
            const cleanup = await evaluate(
                client,
                cleanupExpression(token),
                invokeTimeoutMs,
            );
            const cleanupValid =
                cleanup?.cleaned === true &&
                cleanup.cleanupError === false &&
                cleanup.terminalCount === 1 &&
                cleanup.remaining === 0 &&
                cleanup.overflow === false;
            const remotelySettled =
                runSucceeded || terminalFailureObserved;
            if (remotelySettled && cleanupValid) {
                const release = await evaluate(
                    client,
                    releaseExpression(token, sessionId),
                    invokeTimeoutMs,
                );
                if (release?.released !== true)
                    throw bridgeFailure(
                        'The JiaorongAI Session lock could not be released safely.',
                    );
            } else if (remotelySettled) {
                throw bridgeFailure(
                    'The JiaorongAI bridge listener cleanup failed.',
                );
            } else if (
                cleanup?.cleaned !== true ||
                cleanup.cleanupError === true
            ) {
                throw bridgeFailure(
                    'The JiaorongAI bridge listener cleanup failed.',
                );
            }
        }
    }
}
