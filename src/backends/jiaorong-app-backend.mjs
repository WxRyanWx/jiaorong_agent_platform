import {
    inspectAppReadiness,
    openVerifiedAppRuntime,
} from '../app/app-runtime.mjs';
import {
    invokeBridgeRoute,
    runBridgeTurn,
} from '../app/deepchat-bridge.mjs';
import { AppReadinessError } from '../app/readiness-error.mjs';
import { BackendFailure } from '../cli/failures.mjs';
import { MAX_PROMPT_BYTES } from '../cli/limits.mjs';

const VERSION = '0.1.0';
const DOCTOR_CHECKS = [
    'app-installation',
    'app-version',
    'loopback-endpoint',
    'app-state',
    'endpoint-owner',
    'cdp-metadata',
    'renderer-target',
    'bridge-contract',
    'models',
];

function checksBeforeFailure(name) {
    const index = DOCTOR_CHECKS.indexOf(name);
    return DOCTOR_CHECKS.slice(0, Math.max(0, index)).map((checkName) => ({
        name: checkName,
        status: 'pass',
    }));
}

function invalidBridgeDocument() {
    return new BackendFailure(
        'INTERNAL_ERROR',
        'JiaorongAI returned an invalid bridge document.',
    );
}

function nonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

function permissionMode(mode) {
    return mode === 'bypassPermissions' ? 'full_access' : 'default';
}

export function createJiaorongAppBackend({ runtimeOptions } = {}) {
    return {
        async doctor() {
            try {
                const readiness = await inspectAppReadiness(runtimeOptions);
                return {
                    ok: true,
                    cliVersion: VERSION,
                    protocolVersions: [1],
                    app: {
                        version: readiness.version,
                        endpoint: readiness.endpoint,
                    },
                    models: { available: readiness.models },
                    checks: DOCTOR_CHECKS.map((name) => ({
                        name,
                        status: 'pass',
                    })),
                };
            } catch (error) {
                const failure =
                    error instanceof AppReadinessError
                        ? error
                        : new AppReadinessError(
                              'internal',
                              'JiaorongAI readiness could not be verified.',
                          );
                return {
                    ok: false,
                    cliVersion: VERSION,
                    protocolVersions: [1],
                    app: { version: null, endpoint: null },
                    models: { available: 0 },
                    checks: [
                        ...checksBeforeFailure(failure.check),
                        {
                            name: failure.check,
                            status: 'fail',
                            message: failure.message,
                        },
                    ],
                };
            }
        },

        async prepare(request) {
            if (Buffer.byteLength(request.prompt, 'utf8') > MAX_PROMPT_BYTES) {
                throw new BackendFailure(
                    'INVALID_ARGUMENT',
                    'Prompt exceeds the 128 KiB UTF-8 limit.',
                    42,
                );
            }
            if (request.resume) {
                throw new BackendFailure(
                    'INVALID_ARGUMENT',
                    'Resuming an Agent Session is not available yet.',
                    42,
                );
            }
            if (
                request.files.length > 0 ||
                request.additionalDirectories.length > 0
            ) {
                throw new BackendFailure(
                    'INVALID_ARGUMENT',
                    'Attachments and Additional Directories are not available yet.',
                    42,
                );
            }

            const runtime = await openVerifiedAppRuntime(runtimeOptions);
            const { client, config, readiness } = runtime;
            try {
                const agentDocument = await invokeBridgeRoute(
                    client,
                    'sessions.getAgents',
                    {},
                    { timeoutMs: config.bridgeInvokeTimeoutMs },
                );
                const agents = agentDocument?.agents;
                if (!Array.isArray(agents)) throw invalidBridgeDocument();
                const agent = agents.find(
                    (candidate) =>
                        candidate?.id === 'deepchat' &&
                        candidate.type === 'deepchat' &&
                        candidate.enabled === true,
                );
                if (!agent) throw invalidBridgeDocument();

                let selectedModel;
                if (request.modelId) {
                    const matches = readiness.availableModels.filter(
                        (model) => model.id === request.modelId,
                    );
                    if (matches.length !== 1) {
                        throw new BackendFailure(
                            'MODEL_UNAVAILABLE',
                            'The selected JiaorongAI model is unavailable.',
                        );
                    }
                    selectedModel = matches[0];
                } else if (readiness.availableModels.length === 1) {
                    [selectedModel] = readiness.availableModels;
                } else {
                    throw new BackendFailure(
                        'MODEL_UNAVAILABLE',
                        'Select an available JiaorongAI model with --model.',
                    );
                }

                const createInput = {
                    agentId: agent.id,
                    message: '',
                    projectDir: request.cwd,
                    permissionMode: permissionMode(request.permissionMode),
                    providerId: selectedModel.providerId,
                    modelId: selectedModel.id,
                };
                const sessionDocument = await invokeBridgeRoute(
                    client,
                    'sessions.create',
                    createInput,
                    { timeoutMs: config.bridgeInvokeTimeoutMs },
                );
                const session = sessionDocument?.session;
                if (
                    !session ||
                    typeof session !== 'object' ||
                    !nonEmptyString(session.id) ||
                    !nonEmptyString(session.providerId) ||
                    !nonEmptyString(session.modelId)
                )
                    throw invalidBridgeDocument();

                const model = readiness.availableModels.find(
                    (candidate) =>
                        candidate.id === session.modelId &&
                        candidate.providerId === session.providerId,
                );
                return {
                    sessionId: session.id,
                    resumed: false,
                    model: {
                        id: session.modelId,
                        displayName: model?.displayName ?? session.modelId,
                    },
                    attachments: [],
                    bridgeClient: client,
                    bridgeInvokeTimeoutMs: config.bridgeInvokeTimeoutMs,
                    runTimeoutMs: config.runTimeoutMs,
                };
            } catch (error) {
                client.close();
                throw error;
            }
        },

        async *run(prepared, request) {
            try {
                yield* runBridgeTurn(prepared.bridgeClient, {
                    sessionId: prepared.sessionId,
                    prompt: request.prompt,
                    invokeTimeoutMs: prepared.bridgeInvokeTimeoutMs,
                    runTimeoutMs: prepared.runTimeoutMs,
                });
            } finally {
                prepared.bridgeClient.close();
            }
        },
    };
}
