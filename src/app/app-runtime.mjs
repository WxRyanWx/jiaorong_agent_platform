import { assertLoopbackWebSocket, parseLoopbackEndpoint } from './endpoint.mjs';
import { ensureAppEndpoint } from './app-lifecycle.mjs';
import { validateAppBundle } from './app-bundle.mjs';
import { CdpClient } from './cdp-client.mjs';
import { getBoundedJson } from './http-json.mjs';
import { assertListenerOwner } from './process-owner.mjs';
import {
    assertTrustedBridgeManifest,
    probeBridge,
} from './bridge-readiness.mjs';
import { AppReadinessError } from './readiness-error.mjs';

export const SUPPORTED_APP_VERSION = '0.5.6';
export const SUPPORTED_APP_ASAR_SHA256 =
    '46c10c761eb3c70f461061cbd80ad1c0cc2796aea29574e73cd85d445f1b22aa';
const MAX_PROVIDER_COUNT = 64;
const MAX_MODEL_COUNT = 4_096;
const MAX_IDENTIFIER_BYTES = 512;
const MAX_DISPLAY_NAME_BYTES = 2_048;
export const defaultRuntimeConfig = Object.freeze({
    endpoint: 'http://127.0.0.1:9238',
    expectedExecutable:
        '/Applications/JiaorongAI.app/Contents/MacOS/JiaorongAI',
    appBundlePath: '/Applications/JiaorongAI.app',
    bundleId: 'com.wefonk.jiaorong',
    supportedVersion: SUPPORTED_APP_VERSION,
    supportedAppAsarSha256: SUPPORTED_APP_ASAR_SHA256,
    targetUrlPrefix:
        'file:///Applications/JiaorongAI.app/Contents/Resources/app.asar/out/renderer/',
    cdpTimeoutMs: 3_000,
    rendererTimeoutMs: 2_000,
    bridgeInvokeTimeoutMs: 10_000,
    runTimeoutMs: 30 * 60 * 1_000,
    cancellationGraceMs: 30_000,
});

function rendererTarget(targets, config) {
    if (!Array.isArray(targets))
        throw new AppReadinessError(
            'renderer-target',
            'The CDP target list is malformed.',
        );
    if (targets.length > 32)
        throw new AppReadinessError(
            'renderer-target',
            'The CDP endpoint exposed too many renderer targets.',
        );
    const candidates = targets.filter(
        (target) =>
            target?.type === 'page' &&
            typeof target.title === 'string' &&
            /jiaorong/i.test(target.title) &&
            typeof target.url === 'string' &&
            target.url.startsWith(config.targetUrlPrefix) &&
            typeof target.webSocketDebuggerUrl === 'string',
    );
    if (candidates.length !== 1)
        throw new AppReadinessError(
            'renderer-target',
            'The JiaorongAI renderer target is missing or ambiguous.',
        );
    return candidates[0];
}

function boundedBridgeString(value, maxBytes) {
    return (
        typeof value === 'string' &&
        value.length > 0 &&
        Buffer.byteLength(value, 'utf8') <= maxBytes &&
        !/[\u0000-\u001f\u007f]/u.test(value)
    );
}

function invalidCatalog() {
    return new AppReadinessError(
        'bridge-contract',
        'The JiaorongAI model catalog is invalid.',
    );
}

function projectModelCatalog(probe) {
    if (
        probe.providers.length > MAX_PROVIDER_COUNT ||
        probe.models.length > MAX_MODEL_COUNT
    )
        throw invalidCatalog();
    const enabledProviders = new Set();
    const providerIds = new Set();
    for (const provider of probe.providers) {
        if (
            !boundedBridgeString(provider?.id, MAX_IDENTIFIER_BYTES) ||
            typeof provider.enabled !== 'boolean'
        )
            throw invalidCatalog();
        if (providerIds.has(provider.id)) throw invalidCatalog();
        providerIds.add(provider.id);
        if (provider.enabled) enabledProviders.add(provider.id);
    }

    const modelCatalog = [];
    const publicIds = new Set();
    for (const model of probe.models) {
        if (
            !boundedBridgeString(model?.id, MAX_IDENTIFIER_BYTES) ||
            !boundedBridgeString(model?.providerId, MAX_IDENTIFIER_BYTES) ||
            !boundedBridgeString(
                model?.displayName,
                MAX_DISPLAY_NAME_BYTES,
            ) ||
            typeof model.available !== 'boolean' ||
            typeof model.vision !== 'boolean' ||
            !(
                model.contextWindow === null ||
                (Number.isInteger(model.contextWindow) &&
                    model.contextWindow > 0)
            )
        )
            throw invalidCatalog();
        if (!enabledProviders.has(model.providerId)) continue;
        const id = `${encodeURIComponent(model.providerId)}/${encodeURIComponent(model.id)}`;
        if (publicIds.has(id)) throw invalidCatalog();
        publicIds.add(id);
        modelCatalog.push({
            ...model,
            id,
            bridgeModelId: model.id,
        });
    }
    return modelCatalog;
}

export async function openVerifiedAppRuntime({
    config: configOverrides = defaultRuntimeConfig,
    bundleValidator = validateAppBundle,
    lifecycleDependencies,
} = {}) {
    const config = { ...defaultRuntimeConfig, ...configOverrides };
    if (!config.endpoint || !config.expectedExecutable || !config.appBundlePath)
        throw new AppReadinessError(
            'configuration',
            'The test App Runtime configuration is incomplete.',
        );
    await bundleValidator(config);
    const endpoint = parseLoopbackEndpoint(config.endpoint);
    await ensureAppEndpoint(
        { ...config, endpoint },
        lifecycleDependencies,
    );
    await assertListenerOwner(endpoint, config.expectedExecutable);
    const [metadata, targets] = await Promise.all([
        getBoundedJson(new URL('/json/version', endpoint)),
        getBoundedJson(new URL('/json/list', endpoint)),
    ]);
    const productIdentity = [metadata?.Browser, metadata?.['User-Agent']].some(
        (value) =>
            typeof value === 'string' && /(?:^|\s)JiaorongAI\//.test(value),
    );
    if (!productIdentity)
        throw new AppReadinessError(
            'cdp-metadata',
            'The CDP endpoint does not identify JiaorongAI.',
        );
    const target = rendererTarget(targets, config);
    const websocket = assertLoopbackWebSocket(
        target.webSocketDebuggerUrl,
        endpoint,
        target.id,
    );
    const client = await CdpClient.connect(websocket, {
        timeoutMs: config.cdpTimeoutMs,
    });
    try {
        const probe = await probeBridge(client, {
            rendererTimeoutMs: config.rendererTimeoutMs,
        });
        if (probe.version !== config.supportedVersion)
            throw new AppReadinessError(
                'app-version',
                `JiaorongAI ${probe.version} is unsupported; version ${config.supportedVersion} is required.`,
            );
        assertTrustedBridgeManifest(probe);
        const modelCatalog = projectModelCatalog(probe);
        const availableModels = modelCatalog.filter(
            (model) => model.available === true,
        );
        return {
            client,
            config,
            readiness: {
                version: probe.version,
                endpoint: endpoint.host,
                providers: probe.providers.length,
                models: availableModels.length,
                modelCatalog,
                availableModels,
            },
        };
    } catch (error) {
        client.close();
        throw error;
    }
}
