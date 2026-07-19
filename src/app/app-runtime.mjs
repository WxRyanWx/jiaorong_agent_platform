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
export const defaultRuntimeConfig = Object.freeze({
    endpoint: 'http://127.0.0.1:9238',
    expectedExecutable:
        '/Applications/JiaorongAI.app/Contents/MacOS/JiaorongAI',
    appBundlePath: '/Applications/JiaorongAI.app',
    bundleId: 'com.wefonk.jiaorong',
    supportedVersion: SUPPORTED_APP_VERSION,
    targetUrlPrefix:
        'file:///Applications/JiaorongAI.app/Contents/Resources/app.asar/out/renderer/',
    cdpTimeoutMs: 3_000,
    rendererTimeoutMs: 2_000,
    bridgeInvokeTimeoutMs: 10_000,
    runTimeoutMs: 30 * 60 * 1_000,
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
        const enabledProviders = new Set(
            probe.providers
                .filter((provider) => provider?.enabled === true)
                .map((provider) => provider.id),
        );
        const availableModels = probe.models.filter(
            (model) =>
                typeof model?.id === 'string' &&
                model.id.length > 0 &&
                model.available === true &&
                enabledProviders.has(model.providerId),
        );
        if (availableModels.length === 0)
            throw new AppReadinessError(
                'models',
                'JiaorongAI does not report an available model.',
            );
        return {
            client,
            config,
            readiness: {
                version: probe.version,
                endpoint: endpoint.host,
                providers: probe.providers.length,
                models: availableModels.length,
                availableModels,
            },
        };
    } catch (error) {
        client.close();
        throw error;
    }
}

export async function inspectAppReadiness(options = {}) {
    const runtime = await openVerifiedAppRuntime(options);
    try {
        return runtime.readiness;
    } finally {
        runtime.client.close();
    }
}
