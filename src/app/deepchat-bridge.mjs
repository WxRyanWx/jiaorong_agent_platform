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
    'sessions.setProjectDir',
    'sessions.getPermissionMode',
    'sessions.setPermissionMode',
    'sessions.getDisabledAgentTools',
    'providers.testConnection',
    'chat.respondToolInteraction',
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

async function evaluate(
    client,
    expression,
    timeoutMs,
    { requestTimeoutMs = timeoutMs + 250 } = {},
) {
    const response = await client.request(
        'Runtime.evaluate',
        {
            expression,
            awaitPromise: true,
            returnByValue: true,
            timeout: timeoutMs,
        },
        { timeoutMs: requestTimeoutMs },
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

function prepareAttachmentsExpression(token, attachments) {
    const inputs = attachments.map(({ path, mimeType }) => ({
        path,
        mimeType,
    }));
    const inputsBase64 = Buffer.from(JSON.stringify(inputs), 'utf8').toString(
        'base64',
    );
    return `
(async () => {
  const bridge = window.deepchat;
  if (!bridge || typeof bridge.invoke !== 'function') throw new Error('bridge unavailable');
  const storeName = '__JIAORONG_CLI_ATTACHMENTS_V1__';
  const store = window[storeName] || Object.defineProperty(window, storeName, {
    value: Object.create(null), configurable: true
  })[storeName];
  const token = ${JSON.stringify(token)};
  if (store[token]) throw new Error('attachment token collision');
  const inputBytes = Uint8Array.from(
    atob(${JSON.stringify(inputsBase64)}),
    (character) => character.charCodeAt(0)
  );
  const inputs = JSON.parse(new TextDecoder().decode(inputBytes));
  const files = [];
  try {
    for (const input of inputs) {
      const document = await bridge.invoke('file.prepareFile', input);
      const file = document && document.file;
      if (!file || typeof file !== 'object') throw new Error('invalid prepared file');
      files.push(file);
    }
    store[token] = files;
    return {
      prepared: true,
      files: files.map((file) => ({
        name: file.name,
        path: file.path,
        mimeType: file.mimeType,
        size: typeof file.size === 'number' ? file.size : null,
        contentIsString: typeof file.content === 'string',
        metadataFileName: file.metadata && file.metadata.fileName,
        metadataFileSize: file.metadata && file.metadata.fileSize
      }))
    };
  } catch {
    delete store[token];
    return { prepared: false };
  }
})()
`;
}

export async function prepareBridgeAttachments(
    client,
    attachments,
    { timeoutMs = 10_000 } = {},
) {
    if (attachments.length === 0) return null;
    const token = crypto.randomUUID();
    const document = await evaluate(
        client,
        prepareAttachmentsExpression(token, attachments),
        timeoutMs,
    );
    if (document?.prepared !== true)
        throw new BackendFailure(
            'UNSUPPORTED_ATTACHMENT',
            'JiaorongAI could not prepare an Attachment.',
            42,
        );
    const invalid =
        !Array.isArray(document.files) ||
        document.files.length !== attachments.length ||
        document.files.some((file, index) => {
            const expected = attachments[index];
            return (
                file?.name !== expected.name ||
                file.path !== expected.path ||
                file.mimeType !== expected.mimeType ||
                !(
                    file.size === null ||
                    file.size === expected.sizeBytes
                ) ||
                file.contentIsString !== true ||
                file.metadataFileName !== expected.name ||
                file.metadataFileSize !== expected.sizeBytes
            );
        });
    if (invalid) {
        await discardBridgeAttachments(client, token, { timeoutMs });
        throw bridgeFailure('JiaorongAI returned an invalid prepared Attachment.');
    }
    return token;
}

export async function discardBridgeAttachments(
    client,
    token,
    { timeoutMs = 10_000 } = {},
) {
    if (token === null) return;
    await evaluate(
        client,
        `
(() => {
  const store = window.__JIAORONG_CLI_ATTACHMENTS_V1__;
  if (!store) return { discarded: false };
  const existed = Object.prototype.hasOwnProperty.call(store, ${JSON.stringify(token)});
  delete store[${JSON.stringify(token)}];
  return { discarded: existed };
})()
`,
        timeoutMs,
    );
}

function startExpression(
    token,
    sessionId,
    projectRoot,
    prompt,
    attachmentToken,
    rendererDeadlineMs,
) {
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
    permissionResetAttempted: false,
    preexistingMessageIds: [],
    sendStartedAt: null,
    unsubscriptions: [],
    deadlineTimer: undefined,
    aborted: false,
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
  const assertActive = () => {
    if (state.aborted || state.cleaned) throw new Error('run deadline exceeded');
  };
  try {
    const promptBytes = Uint8Array.from(
      atob(${JSON.stringify(promptBase64)}),
      (character) => character.charCodeAt(0)
    );
    const prompt = new TextDecoder().decode(promptBytes);
    const attachmentToken = ${JSON.stringify(attachmentToken)};
    const attachmentStore = window.__JIAORONG_CLI_ATTACHMENTS_V1__;
    let files = [];
    if (attachmentToken !== null) {
      files = attachmentStore && attachmentStore[attachmentToken];
      if (!Array.isArray(files)) throw new Error('prepared attachments unavailable');
      delete attachmentStore[attachmentToken];
    }
    state.deadlineTimer = setTimeout(() => {
      state.aborted = true;
      const permissionResetAttempted = state.permissionResetAttempted;
      state.cleanup();
      if (permissionResetAttempted) {
        Promise.resolve()
          .then(() => bridge.invoke('chat.stopStream', { sessionId }))
          .catch(() => undefined);
      }
    }, ${JSON.stringify(rendererDeadlineMs)});
    Promise.resolve()
      .then(async () => {
        const disabled = await bridge.invoke('sessions.getDisabledAgentTools', {
          sessionId
        });
        assertActive();
        if (!disabled || !Array.isArray(disabled.disabledAgentTools) ||
            !['exec', 'process'].every((name) => disabled.disabledAgentTools.includes(name))) {
          throw new Error('unsafe agent tool configuration');
        }
        const restored = await bridge.invoke('sessions.restore', { sessionId });
        assertActive();
        if (!restored || !restored.session || restored.session.id !== sessionId ||
            typeof restored.session.status !== 'string' || !Array.isArray(restored.messages) ||
            !restored.messages.every((message) => message && typeof message.id === 'string')) {
          throw new Error('invalid session status');
        }
        if (restored.session.status !== 'idle') {
          throw new Error('session is not idle');
        }
        state.permissionResetAttempted = true;
        const reset = await bridge.invoke('chat.stopStream', { sessionId });
        assertActive();
        if (!reset || reset.stopped !== true) {
          throw new Error('permission cache reset failed');
        }
        const project = await bridge.invoke('sessions.setProjectDir', {
          sessionId,
          projectDir: ${JSON.stringify(projectRoot)}
        });
        assertActive();
        if (!project || !project.session || project.session.id !== sessionId ||
            project.session.projectDir !== ${JSON.stringify(projectRoot)}) {
          throw new Error('invalid project configuration');
        }
        const permission = await bridge.invoke('sessions.setPermissionMode', {
          sessionId,
          mode: 'default'
        });
        assertActive();
        if (!permission || permission.updated !== true) {
          throw new Error('invalid permission configuration');
        }
        const permissionReadback = await bridge.invoke('sessions.getPermissionMode', {
          sessionId
        });
        assertActive();
        if (!permissionReadback || permissionReadback.mode !== 'default') {
          throw new Error('invalid permission configuration');
        }
        assertActive();
        for (const name of ${JSON.stringify(RUN_EVENTS)}) {
          const unsubscribe = bridge.on(name, (payload) => enqueue(name, payload));
          if (typeof unsubscribe !== 'function') throw new Error('subscription cleanup unavailable');
          state.unsubscriptions.push(unsubscribe);
        }
        assertActive();
        state.preexistingMessageIds = restored.messages.map((message) => message.id);
        state.sendStartedAt = Date.now();
        state.send = { status: 'invoking' };
        return bridge.invoke('chat.sendMessage', {
          sessionId,
          content: files.length === 0 ? prompt : { text: prompt, files }
        });
      })
      .then(
        (value) => { state.send = { status: 'fulfilled', value }; },
        (error) => {
          state.send = {
            status: 'rejected',
            reason: error && error.message === 'session is not idle'
              ? 'session_busy'
              : error && (error.message === 'invalid project configuration' ||
                           error.message === 'invalid permission configuration' ||
                           error.message === 'unsafe agent tool configuration' ||
                           error.message === 'permission cache reset failed')
                ? 'preflight'
                : 'internal'
          };
        }
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

function cleanupExpression(token, sessionId) {
    return `
(async () => {
  const bridge = window.deepchat;
  if (!bridge || typeof bridge.invoke !== 'function') throw new Error('bridge unavailable');
  const store = window.__JIAORONG_CLI_RUNS_V1__;
  const state = store && store[${JSON.stringify(token)}];
  if (!state) return { cleaned: false, cleanupError: false, permissionReset: false };
  const terminalCount = state.terminalCount;
  const remaining = state.events.length;
  const overflow = state.overflow;
  const cleanupError = state.cleanup();
  let permissionReset = !state.permissionResetAttempted;
  if (state.permissionResetAttempted) {
    try {
      const reset = await bridge.invoke('chat.stopStream', {
        sessionId: ${JSON.stringify(sessionId)}
      });
      permissionReset = Boolean(reset && reset.stopped === true);
    } catch {}
  }
  return { cleaned: true, cleanupError, permissionReset, terminalCount, remaining, overflow };
})()
`;
}

function cancelExpression(token, sessionId, requestId) {
    return `
(async () => {
  const bridge = window.deepchat;
  if (!bridge || typeof bridge.invoke !== 'function') throw new Error('bridge unavailable');
  const store = window.__JIAORONG_CLI_RUNS_V1__;
  const state = store && store[${JSON.stringify(token)}];
  if (!state || state.cleaned || state.aborted) {
    return { requested: false, unavailable: true };
  }
  if (state.cancellationRequested === true) {
    return { requested: true, requestId: ${JSON.stringify(requestId)} };
  }
  state.cancellationRequested = true;
  const input = { sessionId: ${JSON.stringify(sessionId)} };
  if (${JSON.stringify(requestId)} !== null) {
    input.requestId = ${JSON.stringify(requestId)};
  }
  const stopped = await bridge.invoke('chat.stopStream', input);
  return {
    requested: Boolean(stopped && stopped.stopped === true),
    requestId: ${JSON.stringify(requestId)}
  };
})()
`;
}

function interactionResponseExpression(token, interaction, granted) {
    return `
(async () => {
  const bridge = window.deepchat;
  if (!bridge || typeof bridge.invoke !== 'function') throw new Error('bridge unavailable');
  const state = window.__JIAORONG_CLI_RUNS_V1__?.[${JSON.stringify(token)}];
  if (!state || state.cleaned || state.aborted || state.cancellationRequested === true) {
    return { responded: false, cancelled: true };
  }
  const response = await bridge.invoke('chat.respondToolInteraction', {
    sessionId: ${JSON.stringify(interaction.sessionId)},
    messageId: ${JSON.stringify(interaction.messageId)},
    toolCallId: ${JSON.stringify(interaction.toolCallId)},
    response: { kind: 'permission', granted: ${JSON.stringify(granted)} }
  });
  return { responded: true, cancelled: false, response };
})()
`;
}

function cancellationSettlementExpression(token, sessionId) {
    return `
(async () => {
  const bridge = window.deepchat;
  if (!bridge || typeof bridge.invoke !== 'function') throw new Error('bridge unavailable');
  const state = window.__JIAORONG_CLI_RUNS_V1__?.[${JSON.stringify(token)}];
  if (!state || !Array.isArray(state.preexistingMessageIds) ||
      typeof state.sendStartedAt !== 'number') throw new Error('missing run identity state');
  const restored = await bridge.invoke('sessions.restore', {
    sessionId: ${JSON.stringify(sessionId)},
    limit: 10
  });
  if (!restored || !restored.session || restored.session.id !== ${JSON.stringify(sessionId)} ||
      typeof restored.session.status !== 'string' || !Array.isArray(restored.messages)) {
    throw new Error('invalid cancellation settlement');
  }
  if (restored.session.status !== 'idle') return { settled: false };
  const latestUserOrderSeq = restored.messages.reduce((latest, message) =>
    message && message.role === 'user' && Number.isInteger(message.orderSeq)
      ? Math.max(latest, message.orderSeq)
      : latest,
    -1
  );
  for (let index = restored.messages.length - 1; index >= 0; index -= 1) {
    const message = restored.messages[index];
    if (!message || message.role !== 'assistant' || message.status !== 'error' ||
        typeof message.id !== 'string' || message.id.length === 0 ||
        typeof message.content !== 'string' || !Number.isInteger(message.orderSeq) ||
        !Number.isInteger(message.updatedAt) ||
        state.preexistingMessageIds.includes(message.id) ||
        message.updatedAt < state.sendStartedAt ||
        message.orderSeq <= latestUserOrderSeq) continue;
    let blocks;
    try { blocks = JSON.parse(message.content); } catch { continue; }
    if (!Array.isArray(blocks)) continue;
    const cancelled = blocks.some((block) =>
      block && block.type === 'error' && block.status === 'error' &&
      block.content === 'common.error.userCanceledGeneration'
    );
    if (cancelled) return { settled: true, messageId: message.id };
  }
  return { settled: false };
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
        ['pending', 'invoking', 'fulfilled', 'rejected'].includes(document.send.status) &&
        (document.send.status === 'rejected'
            ? ['internal', 'preflight', 'session_busy'].includes(document.send.reason)
            : document.send.reason === undefined)
    );
}

function validInteractionResponse(document) {
    return (
        document !== null &&
        typeof document === 'object' &&
        document.accepted === true &&
        ['resumed', 'waitingForUserMessage', 'handledInline'].every(
            (key) =>
                document[key] === undefined ||
                typeof document[key] === 'boolean',
        )
    );
}

function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function* runBridgeTurn(
    client,
    {
        sessionId,
        projectRoot,
        prompt,
        attachmentToken = null,
        handleInteraction,
        invokeTimeoutMs = 10_000,
        runTimeoutMs,
        cancellationGraceMs = 30_000,
        signal,
    },
) {
    const token = crypto.randomUUID();
    const projector = createBridgeProjector({ sessionId });
    let sendBound = false;
    let terminalFailureObserved = false;
    let persistedCancellationObserved = false;
    let preflightRejected = false;
    let started = false;
    let runSucceeded = false;
    let terminationFailure = null;
    let cancellationRequested = false;
    let cancellationPromise = null;
    let interactionInProgress = false;
    let nextCancellationSettlementCheck = 0;
    let deadline = Date.now() + runTimeoutMs;
    const observeTermination = () => {
        if (!signal?.aborted || terminationFailure !== null) return;
        terminationFailure =
            signal.reason instanceof BackendFailure
                ? signal.reason
                : new BackendFailure(
                      signal.reason?.code ?? 'CANCELLED',
                      signal.reason?.message ?? 'The run was cancelled.',
                      signal.reason?.exitCode ?? 130,
                  );
        deadline = Math.min(deadline, Date.now() + cancellationGraceMs);
    };
    const currentInvokeTimeout = () => {
        if (terminationFailure === null) return invokeTimeoutMs;
        return Math.max(1, Math.min(invokeTimeoutMs, deadline - Date.now()));
    };
    const evaluateCurrent = (expression) => {
        const timeoutMs = currentInvokeTimeout();
        return evaluate(client, expression, timeoutMs, {
            requestTimeoutMs:
                terminationFailure === null ? timeoutMs + 250 : timeoutMs,
        });
    };
    const requestCancellation = () => {
        if (cancellationRequested) return Promise.resolve();
        if (cancellationPromise !== null) return cancellationPromise;
        const identity = projector.currentIdentity();
        cancellationPromise = evaluateCurrent(
            cancelExpression(token, sessionId, identity.requestId),
        ).then((cancellation) => {
            if (
                cancellation?.requested !== true ||
                cancellation.requestId !== identity.requestId
            )
                throw bridgeFailure(
                    'The JiaorongAI run cancellation could not be verified.',
                );
            cancellationRequested = true;
        });
        return cancellationPromise;
    };
    const handleAbort = () => {
        observeTermination();
        if (started && interactionInProgress)
            void requestCancellation().catch(() => undefined);
    };
    signal?.addEventListener('abort', handleAbort);
    try {
        const start = await evaluate(
            client,
            startExpression(
                token,
                sessionId,
                projectRoot,
                prompt,
                attachmentToken,
                runTimeoutMs,
            ),
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
            observeTermination();
            const document = await evaluateCurrent(pollExpression(token));
            observeTermination();
            if (!validPoll(document) || document.overflow)
                throw bridgeFailure(
                    'JiaorongAI returned an invalid stream event.',
                );
            if (document.terminalCount > 1)
                throw bridgeFailure(
                    'JiaorongAI returned an invalid stream event.',
                );

            if (
                document.send.status === 'rejected' &&
                document.send.reason === 'session_busy'
            ) {
                preflightRejected = true;
                throw new BackendFailure(
                    'INVALID_ARGUMENT',
                    'The JiaorongAI Session is not idle.',
                    42,
                );
            }
            if (
                document.send.status === 'rejected' &&
                document.send.reason === 'preflight'
            ) {
                preflightRejected = true;
                throw bridgeFailure(
                    'JiaorongAI rejected the Headless Run safety configuration.',
                );
            }
            if (
                document.send.status === 'rejected' &&
                terminationFailure === null
            )
                throw bridgeFailure('JiaorongAI rejected the Agent Session run.');
            if (document.send.status === 'fulfilled' && !sendBound) {
                projector.bindSendResult(document.send.value);
                sendBound = true;
            }
            if (
                terminationFailure !== null &&
                (document.send.status === 'invoking' || sendBound) &&
                !cancellationRequested
            ) {
                const identity = projector.currentIdentity();
                await requestCancellation();
            }

            if (
                terminationFailure !== null &&
                cancellationRequested &&
                !terminalFailureObserved &&
                Date.now() >= nextCancellationSettlementCheck
            ) {
                nextCancellationSettlementCheck = Date.now() + 100;
                const settlement = await evaluateCurrent(
                    cancellationSettlementExpression(token, sessionId),
                );
                if (
                    settlement?.settled !== false &&
                    !(
                        settlement?.settled === true &&
                        typeof settlement.messageId === 'string'
                    )
                )
                    throw bridgeFailure(
                        'The JiaorongAI run cancellation settlement was invalid.',
                    );
                if (settlement.settled === true) {
                    const identity = projector.currentIdentity();
                    if (
                        identity.messageId !== null &&
                        identity.messageId !== settlement.messageId
                    )
                        throw bridgeFailure(
                            'The JiaorongAI run cancellation identity did not match.',
                        );
                    persistedCancellationObserved = true;
                    terminalFailureObserved = true;
                    throw terminationFailure;
                }
            }

            for (const event of document.events) {
                let projectedEvents;
                try {
                    projectedEvents = projector.project(
                        event?.name,
                        event?.payload,
                    );
                } catch (error) {
                    if (error?.remoteSettled === true) {
                        terminalFailureObserved = true;
                        if (
                            terminationFailure !== null &&
                            cancellationRequested
                        )
                            throw terminationFailure;
                    }
                    throw error;
                }
                for (const projected of projectedEvents) {
                    if (projected.kind === 'tool_interaction') {
                        observeTermination();
                        if (terminationFailure !== null) continue;
                        if (typeof handleInteraction !== 'function')
                            throw bridgeFailure(
                                'JiaorongAI requested an unsupported tool interaction.',
                            );
                        interactionInProgress = true;
                        let granted;
                        try {
                            granted = await handleInteraction(projected);
                        } catch (error) {
                            observeTermination();
                            if (terminationFailure === null) throw error;
                        } finally {
                            interactionInProgress = false;
                        }
                        observeTermination();
                        if (terminationFailure !== null) {
                            await requestCancellation();
                            continue;
                        }
                        if (typeof granted !== 'boolean')
                            throw bridgeFailure(
                                'JiaorongAI returned an invalid tool permission decision.',
                            );
                        const interactionResponse = await evaluateCurrent(
                            interactionResponseExpression(
                                token,
                                projected,
                                granted,
                            ),
                        );
                        observeTermination();
                        if (
                            interactionResponse?.responded === false &&
                            interactionResponse.cancelled === true &&
                            terminationFailure !== null
                        )
                            continue;
                        if (
                            interactionResponse?.responded !== true ||
                            interactionResponse.cancelled !== false ||
                            !validInteractionResponse(
                                interactionResponse.response,
                            )
                        )
                            throw bridgeFailure(
                                'JiaorongAI returned an invalid interaction response.',
                            );
                        if (terminationFailure !== null) continue;
                        projector.acceptInteraction(projected.toolCallId);
                    } else {
                        yield projected;
                    }
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
    } catch (error) {
        for (const result of projector.failPending({
            code:
                typeof error?.code === 'string'
                    ? error.code
                    : 'INTERNAL_ERROR',
        })) {
            yield result;
        }
        throw error;
    } finally {
        signal?.removeEventListener('abort', handleAbort);
        if (started) {
            const cleanup = await evaluateCurrent(
                cleanupExpression(token, sessionId),
            );
            const cleanupValid =
                cleanup?.cleaned === true &&
                cleanup.cleanupError === false &&
                cleanup.permissionReset === true &&
                cleanup.terminalCount === 1 &&
                cleanup.remaining === 0 &&
                cleanup.overflow === false;
            const persistedCleanupValid =
                persistedCancellationObserved &&
                cleanup?.cleaned === true &&
                cleanup.cleanupError === false &&
                cleanup.permissionReset === true &&
                cleanup.terminalCount === 0 &&
                cleanup.remaining === 0 &&
                cleanup.overflow === false;
            const remotelySettled =
                runSucceeded || terminalFailureObserved;
            const preflightCleanupValid =
                preflightRejected &&
                cleanup?.cleaned === true &&
                cleanup.cleanupError === false &&
                cleanup.permissionReset === true &&
                cleanup.terminalCount === 0 &&
                cleanup.remaining === 0 &&
                cleanup.overflow === false;
            if (
                (remotelySettled &&
                    (cleanupValid || persistedCleanupValid)) ||
                preflightCleanupValid
            ) {
                const release = await evaluateCurrent(
                    releaseExpression(token, sessionId),
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
                cleanup.cleanupError === true ||
                cleanup.permissionReset !== true
            ) {
                throw bridgeFailure(
                    'The JiaorongAI bridge listener cleanup failed.',
                );
            }
        }
    }
}
