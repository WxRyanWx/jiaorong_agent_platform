import { AppReadinessError } from './readiness-error.mjs';

export const UPSTREAM_SOURCE_REVISION =
    'd2a7d3fe6a525a8b33633f8851afb44cf6ccc8c3';

export const requiredBridgeRoutes = [
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
];

const bridgeManifestByVersion = new Map([
    [
        '0.5.6',
        {
            sourceRevision: UPSTREAM_SOURCE_REVISION,
            events: [
                'chat.stream.updated',
                'chat.stream.completed',
                'chat.stream.failed',
            ],
        },
    ],
]);

export const requiredBridgeEvents = bridgeManifestByVersion.get('0.5.6').events;

function buildProbeExpression(rendererTimeoutMs) {
    return `
(async () => {
  const bridge = window.deepchat;
  if (!bridge || typeof bridge.invoke !== 'function' || typeof bridge.on !== 'function') {
    throw new Error('window.deepchat bridge unavailable');
  }
  const requiredRoutes = ${JSON.stringify(requiredBridgeRoutes)};
  const requiredEvents = ${JSON.stringify(requiredBridgeEvents)};
  const unsubscriptions = [];
  let deadlineTimer;
  let cleanupError;
  const work = async () => {
    const verifiedRoutes = [];
    const verifiedSubscriptions = [];
    for (const eventName of requiredEvents) {
      const unsubscribe = bridge.on(eventName, () => {});
      if (typeof unsubscribe !== 'function') {
        throw new Error('bridge event subscription did not return cleanup');
      }
      unsubscriptions.push(unsubscribe);
      verifiedSubscriptions.push(eventName);
    }
    for (const routeName of requiredRoutes) {
      try {
        await bridge.invoke(routeName, null);
        throw new Error('bridge route accepted the invalid readiness probe');
      } catch (error) {
        const message = String(error && error.message ? error.message : error);
        if (message.includes('Unknown deepchat route')) throw error;
        if (message.includes('accepted the invalid readiness probe')) throw error;
        verifiedRoutes.push(routeName);
      }
    }
    const versionResult = await bridge.invoke('device.getAppVersion', {});
    const providerResult = await bridge.invoke('providers.listSummaries', {});
    const providers = Array.isArray(providerResult.providers) ? providerResult.providers : [];
    const catalogs = await Promise.all(providers.slice(0, 64).map(async (provider) => {
      const result = await bridge.invoke('models.getProviderCatalog', { providerId: provider.id });
      return { providerId: provider.id, catalog: result && result.catalog };
    }));
    const models = catalogs.flatMap(({ providerId, catalog }) => {
      const candidates = [
        ...(Array.isArray(catalog && catalog.providerModels) ? catalog.providerModels : []),
        ...(Array.isArray(catalog && catalog.customModels) ? catalog.customModels : []),
        ...(Array.isArray(catalog && catalog.dbProviderModels) ? catalog.dbProviderModels : [])
      ];
      const status = catalog && catalog.modelStatusMap && typeof catalog.modelStatusMap === 'object'
        ? catalog.modelStatusMap
        : {};
      return candidates.map((model) => ({
        id: model.id,
        providerId,
        displayName: typeof model.name === 'string' && model.name.length > 0 ? model.name : model.id,
        available: model.enabled !== false && status[model.id] !== false,
        vision: model.vision === true,
        contextWindow: Number.isInteger(model.contextLength) && model.contextLength > 0
          ? model.contextLength
          : null
      }));
    });
    return {
      bridgeMethods: ['invoke', 'on'],
      version: versionResult.version,
      routes: verifiedRoutes,
      subscriptions: verifiedSubscriptions,
      providers: providers.map((provider) => ({ id: provider.id, enabled: provider.enable === true })),
      models
    };
  };
  try {
    return await Promise.race([
      work(),
      new Promise((_, reject) => {
        deadlineTimer = setTimeout(
          () => reject(new Error('bridge readiness deadline exceeded')),
          ${JSON.stringify(rendererTimeoutMs)}
        );
      })
    ]);
  } finally {
    clearTimeout(deadlineTimer);
    for (const unsubscribe of unsubscriptions.reverse()) {
      try {
        unsubscribe();
      } catch (error) {
        cleanupError = cleanupError || error;
      }
    }
    if (cleanupError) throw cleanupError;
  }
})()
`;
}

function stringArray(value) {
    return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function assertTrustedBridgeManifest(probe) {
    const manifest = bridgeManifestByVersion.get(probe.version);
    if (!manifest || manifest.sourceRevision !== UPSTREAM_SOURCE_REVISION)
        throw new AppReadinessError(
            'bridge-contract',
            'No trusted bridge manifest exists for this JiaorongAI version.',
        );
    if (
        !manifest.events.every((event) =>
            probe.subscriptions.includes(event),
        )
    )
        throw new AppReadinessError(
            'bridge-contract',
            'The JiaorongAI bridge subscription contract is incomplete.',
        );
}

export async function probeBridge(client, { rendererTimeoutMs = 2_000 } = {}) {
    const response = await client.request('Runtime.evaluate', {
        expression: buildProbeExpression(rendererTimeoutMs),
        awaitPromise: true,
        returnByValue: true,
        timeout: rendererTimeoutMs + 250,
    });
    if (response?.exceptionDetails) {
        throw new AppReadinessError(
            'bridge-contract',
            'The JiaorongAI bridge readiness probe failed.',
        );
    }
    const probe = response?.result?.value;
    if (
        !probe ||
        typeof probe !== 'object' ||
        !stringArray(probe.bridgeMethods) ||
        typeof probe.version !== 'string' ||
        !stringArray(probe.routes) ||
        !stringArray(probe.subscriptions) ||
        !Array.isArray(probe.providers) ||
        !Array.isArray(probe.models)
    ) {
        throw new AppReadinessError(
            'bridge-contract',
            'The JiaorongAI bridge returned an invalid readiness document.',
        );
    }
    if (
        !['invoke', 'on'].every((method) =>
            probe.bridgeMethods.includes(method),
        ) ||
        !requiredBridgeRoutes.every((route) => probe.routes.includes(route))
    )
        throw new AppReadinessError(
            'bridge-contract',
            'The JiaorongAI bridge contract is incomplete.',
        );
    return probe;
}
