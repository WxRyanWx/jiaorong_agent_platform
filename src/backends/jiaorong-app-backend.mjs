import {
    openVerifiedAppRuntime,
} from '../app/app-runtime.mjs';
import {
    discardBridgeAttachments,
    invokeBridgeRoute,
    prepareBridgeAttachments,
    runBridgeTurn,
} from '../app/deepchat-bridge.mjs';
import { AppReadinessError } from '../app/readiness-error.mjs';
import { shouldGrantToolPermission } from '../app/tool-permission-policy.mjs';
import { BackendFailure } from '../cli/failures.mjs';
import { MAX_PROMPT_BYTES } from '../cli/limits.mjs';

const VERSION = '0.1.0';
const REQUIRED_DISABLED_AGENT_TOOLS = ['exec', 'process'];
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
    'authentication',
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

function providerConnectionFailure(connection) {
    if (
        !connection ||
        typeof connection !== 'object' ||
        typeof connection.isOk !== 'boolean' ||
        !(
            connection.errorMsg === null ||
            typeof connection.errorMsg === 'string'
        )
    )
        return invalidBridgeDocument();
    if (connection.isOk) return null;
    return new BackendFailure(
        'INTERNAL_ERROR',
        'JiaorongAI could not verify the selected provider/model connection.',
    );
}

async function verifyProviderConnection(client, config, selectedModel) {
    const connection = await invokeBridgeRoute(
        client,
        'providers.testConnection',
        {
            providerId: selectedModel.providerId,
            modelId: selectedModel.bridgeModelId,
        },
        { timeoutMs: config.bridgeInvokeTimeoutMs },
    );
    const failure = providerConnectionFailure(connection);
    if (failure) throw failure;
}

async function verifyDisabledAgentTools(client, config, sessionId) {
    const document = await invokeBridgeRoute(
        client,
        'sessions.getDisabledAgentTools',
        { sessionId },
        { timeoutMs: config.bridgeInvokeTimeoutMs },
    );
    if (
        !Array.isArray(document?.disabledAgentTools) ||
        !REQUIRED_DISABLED_AGENT_TOOLS.every((toolName) =>
            document.disabledAgentTools.includes(toolName),
        )
    )
        throw new BackendFailure(
            'INVALID_ARGUMENT',
            'The JiaorongAI Session is not CLI-safe because Shell tools are enabled.',
            42,
        );
}

async function prepareFileScope(client, config, fileScope) {
    const attachmentToken = await prepareBridgeAttachments(
        client,
        fileScope.attachments,
        { timeoutMs: config.bridgeInvokeTimeoutMs },
    );
    return {
        attachmentToken,
        attachments: fileScope.attachments.map(
            ({ id, name, mimeType, sizeBytes }) => ({
                id,
                name,
                mimeType,
                sizeBytes,
            }),
        ),
        additionalDirectories: fileScope.additionalDirectories,
    };
}

export function createJiaorongAppBackend({
    runtimeOptions,
    toolPermissionPolicy = shouldGrantToolPermission,
} = {}) {
    return {
        async doctor() {
            let client;
            try {
                const runtime = await openVerifiedAppRuntime(runtimeOptions);
                client = runtime.client;
                const { readiness } = runtime;
                if (readiness.availableModels.length === 0)
                    throw new AppReadinessError(
                        'models',
                        'JiaorongAI does not report an available model.',
                    );
                return {
                    ok: true,
                    cliVersion: VERSION,
                    protocolVersions: [1],
                    app: {
                        version: readiness.version,
                        endpoint: readiness.endpoint,
                    },
                    models: { available: readiness.models },
                    checks: DOCTOR_CHECKS.map((name) =>
                        name === 'authentication'
                            ? {
                                  name,
                                  status: 'warn',
                                  message:
                                      'Provider authentication is verified only when a run starts.',
                              }
                            : { name, status: 'pass' },
                    ),
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
            } finally {
                client?.close();
            }
        },

        async listModels() {
            const runtime = await openVerifiedAppRuntime(runtimeOptions);
            try {
                const { modelCatalog, availableModels } = runtime.readiness;
                const defaultModelId =
                    availableModels.length === 1
                        ? availableModels[0].id
                        : null;
                return {
                    schemaVersion: 1,
                    models: modelCatalog.map((model) => ({
                        id: model.id,
                        displayName: model.displayName,
                        isDefault: model.id === defaultModelId,
                        available: model.available,
                        inputTypes: model.vision
                            ? ['text', 'image']
                            : ['text'],
                        ...(model.contextWindow === null
                            ? {}
                            : { contextWindow: model.contextWindow }),
                    })),
                };
            } finally {
                runtime.client.close();
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
            const { fileScope } = request;

            const runtime = await openVerifiedAppRuntime(runtimeOptions);
            const { client, config, readiness } = runtime;
            let attachmentToken = null;
            try {
                if (request.resume) {
                    const restored = await invokeBridgeRoute(
                        client,
                        'sessions.restore',
                        { sessionId: request.resume },
                        { timeoutMs: config.bridgeInvokeTimeoutMs },
                    );
                    if (
                        !restored ||
                        typeof restored !== 'object' ||
                        !Array.isArray(restored.messages) ||
                        typeof restored.hasMore !== 'boolean' ||
                        !(
                            restored.nextCursor === null ||
                            typeof restored.nextCursor === 'object'
                        )
                    )
                        throw invalidBridgeDocument();
                    if (restored.session === null)
                        throw new BackendFailure(
                            'INVALID_ARGUMENT',
                            'The JiaorongAI Session does not exist.',
                            42,
                        );
                    const session = restored.session;
                    if (
                        !session ||
                        typeof session !== 'object' ||
                        session.id !== request.resume ||
                        !nonEmptyString(session.providerId) ||
                        !nonEmptyString(session.modelId)
                    )
                        throw invalidBridgeDocument();
                    await verifyDisabledAgentTools(
                        client,
                        config,
                        session.id,
                    );
                    const matches = readiness.availableModels.filter(
                        (model) =>
                            model.providerId === session.providerId &&
                            model.bridgeModelId === session.modelId,
                    );
                    if (matches.length !== 1)
                        throw new BackendFailure(
                            'MODEL_UNAVAILABLE',
                            'The JiaorongAI Session model is unavailable.',
                        );
                    const selectedModel = matches[0];
                    if (
                        request.modelId !== undefined &&
                        request.modelId !== selectedModel.id
                    )
                        throw new BackendFailure(
                            'MODEL_UNAVAILABLE',
                            'The requested model does not match the resumed JiaorongAI Session.',
                        );
                    await verifyProviderConnection(
                        client,
                        config,
                        selectedModel,
                    );
                    const preparedFileScope = await prepareFileScope(
                        client,
                        config,
                        fileScope,
                    );
                    attachmentToken = preparedFileScope.attachmentToken;
                    return {
                        sessionId: session.id,
                        resumed: true,
                        model: {
                            id: selectedModel.id,
                            displayName: selectedModel.displayName,
                        },
                        ...preparedFileScope,
                        bridgeClient: client,
                        bridgeInvokeTimeoutMs: config.bridgeInvokeTimeoutMs,
                        runTimeoutMs: config.runTimeoutMs,
                        cancellationGraceMs: config.cancellationGraceMs,
                        permissionMode: request.permissionMode,
                        fileScope: {
                            projectRoot: fileScope.projectRoot,
                            additionalDirectories:
                                fileScope.additionalDirectories,
                        },
                    };
                }

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

                await verifyProviderConnection(client, config, selectedModel);
                const preparedFileScope = await prepareFileScope(
                    client,
                    config,
                    fileScope,
                );
                attachmentToken = preparedFileScope.attachmentToken;

                const createInput = {
                    agentId: agent.id,
                    message: '',
                    projectDir: fileScope.projectRoot,
                    permissionMode: 'default',
                    disabledAgentTools: REQUIRED_DISABLED_AGENT_TOOLS,
                    providerId: selectedModel.providerId,
                    modelId: selectedModel.bridgeModelId,
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
                    !nonEmptyString(session.modelId) ||
                    session.providerId !== selectedModel.providerId ||
                    session.modelId !== selectedModel.bridgeModelId
                )
                    throw invalidBridgeDocument();
                await verifyDisabledAgentTools(client, config, session.id);
                return {
                    sessionId: session.id,
                    resumed: false,
                    model: {
                        id: selectedModel.id,
                        displayName: selectedModel.displayName,
                    },
                    ...preparedFileScope,
                    bridgeClient: client,
                    bridgeInvokeTimeoutMs: config.bridgeInvokeTimeoutMs,
                    runTimeoutMs: config.runTimeoutMs,
                    cancellationGraceMs: config.cancellationGraceMs,
                    permissionMode: request.permissionMode,
                    fileScope: {
                        projectRoot: fileScope.projectRoot,
                        additionalDirectories: fileScope.additionalDirectories,
                    },
                };
            } catch (error) {
                if (attachmentToken !== null) {
                    try {
                        await discardBridgeAttachments(client, attachmentToken, {
                            timeoutMs: config.bridgeInvokeTimeoutMs,
                        });
                    } catch {
                        client.close();
                        throw new BackendFailure(
                            'INTERNAL_ERROR',
                            'Prepared Attachment cleanup failed.',
                        );
                    }
                }
                client.close();
                throw error;
            }
        },

        async *run(prepared, request) {
            yield* runBridgeTurn(prepared.bridgeClient, {
                sessionId: prepared.sessionId,
                projectRoot: prepared.fileScope.projectRoot,
                prompt: request.prompt,
                attachmentToken: prepared.attachmentToken,
                invokeTimeoutMs: prepared.bridgeInvokeTimeoutMs,
                runTimeoutMs: prepared.runTimeoutMs,
                cancellationGraceMs: prepared.cancellationGraceMs,
                signal: request.signal,
                handleInteraction: async (event) => {
                    return toolPermissionPolicy({
                        permissionMode: prepared.permissionMode,
                        interaction: event,
                        fileScope: prepared.fileScope,
                    });
                },
            });
        },

        async dispose(prepared) {
            let failure = null;
            try {
                await discardBridgeAttachments(
                    prepared.bridgeClient,
                    prepared.attachmentToken,
                    { timeoutMs: prepared.bridgeInvokeTimeoutMs },
                );
            } catch {
                failure ??= new BackendFailure(
                    'INTERNAL_ERROR',
                    'Prepared Attachment cleanup failed.',
                );
            } finally {
                prepared.bridgeClient.close();
            }
            if (failure) throw failure;
        },
    };
}
