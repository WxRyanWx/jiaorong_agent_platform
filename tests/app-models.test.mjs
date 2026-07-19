import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';

import { runProcess } from '../src/conformance/run-process.mjs';
import {
    validateDocument,
    validateStream,
} from '../src/protocol/validate-fixture.mjs';
import { startFakeCdpServer } from './helpers/fake-cdp-server.mjs';

const root = resolve(import.meta.dirname, '..');
const cli = resolve(root, 'tests/fixtures/app-backed-cli.mjs');

function appEnv(endpoint, extra = {}) {
    return {
        JIAORONG_CLI_TEST_CDP_ENDPOINT: endpoint,
        JIAORONG_CLI_TEST_APP_EXECUTABLE: process.execPath,
        ...extra,
    };
}

test('models list projects enabled JiaorongAI catalogs as text and Schema-valid JSON', async () => {
    const server = await startFakeCdpServer({
        providers: [
            { id: 'provider-enabled', enable: true },
            { id: 'provider-disabled', enable: false },
        ],
        catalogs: {
            'provider-enabled': {
                providerModels: [
                    {
                        id: 'model-ready',
                        name: 'Ready Display Name',
                        enabled: true,
                        vision: true,
                        contextLength: 200_000,
                    },
                    {
                        id: 'model-unavailable',
                        name: 'Unavailable Display Name',
                        enabled: true,
                        vision: false,
                    },
                ],
                customModels: [],
                dbProviderModels: [],
                modelStatusMap: {
                    'model-ready': true,
                    'model-unavailable': false,
                },
            },
            'provider-disabled': {
                providerModels: [
                    {
                        id: 'model-disabled-provider',
                        name: 'Must Not Be Listed',
                        enabled: true,
                    },
                ],
                customModels: [],
                dbProviderModels: [],
                modelStatusMap: { 'model-disabled-provider': true },
            },
        },
    });
    try {
        const json = await runProcess(
            cli,
            ['models', 'list', '--output-format', 'json'],
            { cwd: root, env: appEnv(server.endpoint) },
        );
        assert.equal(json.exitCode, 0, json.stderr || json.stdout);
        assert.equal(json.stderr, '');
        const document = JSON.parse(json.stdout);
        assert.deepEqual(
            (await validateDocument('models-list.schema.json', document))
                .errors,
            [],
        );
        assert.deepEqual(document, {
            schemaVersion: 1,
            models: [
                {
                    id: 'provider-enabled/model-ready',
                    displayName: 'Ready Display Name',
                    isDefault: true,
                    available: true,
                    inputTypes: ['text', 'image'],
                    contextWindow: 200_000,
                },
                {
                    id: 'provider-enabled/model-unavailable',
                    displayName: 'Unavailable Display Name',
                    isDefault: false,
                    available: false,
                    inputTypes: ['text'],
                },
            ],
        });

        const text = await runProcess(cli, ['models', 'list'], {
            cwd: root,
            env: appEnv(server.endpoint),
        });
        assert.equal(text.exitCode, 0, text.stderr);
        assert.equal(text.stderr, '');
        assert.match(
            text.stdout,
            /provider-enabled\/model-ready\tReady Display Name\tavailable/,
        );
        assert.match(
            text.stdout,
            /provider-enabled\/model-unavailable\tUnavailable Display Name\tunavailable/,
        );
        assert.doesNotMatch(text.stdout, /model-disabled-provider/);
        assert.deepEqual(server.state.createInputs, []);
    } finally {
        await server.close();
    }
});

test('an exact available Model ID selects one provider/model pair before Session creation', async () => {
    const server = await startFakeCdpServer();
    try {
        const result = await runProcess(
            cli,
            [
                '-p',
                'hello',
                '--model',
                'provider-test/model-test',
                '--output-format',
                'stream-json',
            ],
            { cwd: root, env: appEnv(server.endpoint) },
        );
        assert.equal(result.exitCode, 0, result.stderr || result.stdout);
        const validation = await validateStream(result.stdout, {
            exitCode: result.exitCode,
        });
        assert.equal(validation.valid, true, validation.errors.join('; '));
        assert.equal(
            validation.events[0].model.id,
            'provider-test/model-test',
        );
        assert.deepEqual(server.state.testConnectionInputs, [
            { providerId: 'provider-test', modelId: 'model-test' },
        ]);
        assert.deepEqual(
            server.state.createInputs.map(({ providerId, modelId }) => ({
                providerId,
                modelId,
            })),
            [{ providerId: 'provider-test', modelId: 'model-test' }],
        );
    } finally {
        await server.close();
    }
});

test('unknown, unavailable, disabled-provider, and unauthenticated models fail before Session creation', async (t) => {
    const scenarios = [
        {
            name: 'unknown',
            modelId: 'provider-test/model-unknown',
            expectedCode: 'MODEL_UNAVAILABLE',
        },
        {
            name: 'unavailable',
            modelId: 'provider-test/model-unavailable',
            expectedCode: 'MODEL_UNAVAILABLE',
            server: {
                catalogs: {
                    'provider-test': {
                        providerModels: [
                            {
                                id: 'model-unavailable',
                                providerId: 'provider-test',
                                enabled: true,
                            },
                        ],
                        customModels: [],
                        dbProviderModels: [],
                        modelStatusMap: { 'model-unavailable': false },
                    },
                },
            },
        },
        {
            name: 'disabled provider',
            modelId: 'provider-test/model-disabled',
            expectedCode: 'MODEL_UNAVAILABLE',
            server: {
                providers: [{ id: 'provider-test', enable: false }],
                catalogs: {
                    'provider-test': {
                        providerModels: [
                            {
                                id: 'model-disabled',
                                providerId: 'provider-test',
                                enabled: true,
                            },
                        ],
                        customModels: [],
                        dbProviderModels: [],
                        modelStatusMap: { 'model-disabled': true },
                    },
                },
            },
        },
        {
            name: 'unstructured authentication-shaped failure',
            modelId: 'provider-test/model-test',
            expectedCode: 'INTERNAL_ERROR',
            server: {
                testConnectionResult: {
                    isOk: false,
                    errorMsg:
                        'HTTP 401 Unauthorized: Bearer sk-private-token expired',
                },
            },
        },
        {
            name: 'unstructured model-shaped failure',
            modelId: 'provider-test/model-test',
            expectedCode: 'INTERNAL_ERROR',
            server: {
                testConnectionResult: {
                    isOk: false,
                    errorMsg: 'HTTP 404: model is not found',
                },
            },
        },
        {
            name: 'provider connection failure with no auth signal',
            modelId: 'provider-test/model-test',
            expectedCode: 'INTERNAL_ERROR',
            server: {
                testConnectionResult: {
                    isOk: false,
                    errorMsg: 'Provider request timed out',
                },
            },
        },
        {
            name: 'provider connection timeout',
            modelId: 'provider-test/model-test',
            expectedCode: 'INTERNAL_ERROR',
            server: { hangRoutes: ['providers.testConnection'] },
            env: {
                JIAORONG_CLI_TEST_BRIDGE_INVOKE_TIMEOUT_MS: '50',
            },
        },
    ];

    for (const scenario of scenarios) {
        await t.test(scenario.name, async () => {
            const server = await startFakeCdpServer(scenario.server);
            try {
                const result = await runProcess(
                    cli,
                    [
                        '-p',
                        'hello',
                        '--model',
                        scenario.modelId,
                        '--output-format',
                        'stream-json',
                    ],
                    {
                        cwd: root,
                        env: appEnv(server.endpoint, scenario.env),
                    },
                );
                assert.equal(result.exitCode, 1);
                assert.equal(result.stderr, '');
                const validation = await validateStream(result.stdout, {
                    exitCode: result.exitCode,
                });
                assert.equal(
                    validation.valid,
                    true,
                    validation.errors.join('; '),
                );
                assert.equal(
                    validation.events.at(-2).code,
                    scenario.expectedCode,
                );
                assert.equal(validation.events[0].sessionId, null);
                assert.deepEqual(server.state.createInputs, []);
                assert.doesNotMatch(result.stdout, /sk-private-token|Bearer/);
            } finally {
                await server.close();
            }
        });
    }
});

test('malformed and duplicate bridge catalog entries fail closed', async (t) => {
    const scenarios = [
        {
            name: 'malformed provider',
            server: { providers: [{ id: '', enable: true }] },
        },
        {
            name: 'unsafe display name',
            server: {
                catalogs: {
                    'provider-test': {
                        providerModels: [
                            {
                                id: 'model-test',
                                name: 'unsafe\nname',
                                enabled: true,
                            },
                        ],
                        customModels: [],
                        dbProviderModels: [],
                        modelStatusMap: { 'model-test': true },
                    },
                },
            },
        },
        {
            name: 'duplicate provider/model pair',
            server: {
                catalogs: {
                    'provider-test': {
                        providerModels: [
                            { id: 'model-test', enabled: true },
                        ],
                        customModels: [
                            { id: 'model-test', enabled: true },
                        ],
                        dbProviderModels: [],
                        modelStatusMap: { 'model-test': true },
                    },
                },
            },
        },
    ];
    for (const scenario of scenarios) {
        await t.test(scenario.name, async () => {
            const server = await startFakeCdpServer(scenario.server);
            try {
                const result = await runProcess(
                    cli,
                    ['models', 'list', '--output-format', 'json'],
                    { cwd: root, env: appEnv(server.endpoint) },
                );
                assert.equal(result.exitCode, 1);
                assert.equal(result.stdout, '');
                assert.match(result.stderr, /^INTERNAL_ERROR:/);
                assert.deepEqual(server.state.createInputs, []);
            } finally {
                await server.close();
            }
        });
    }
});

test('doctor reports authentication as unverified without making a model request', async () => {
    const server = await startFakeCdpServer({
        testConnectionResult: {
            isOk: false,
            errorMsg: 'Bearer sk-private-token expired',
        },
    });
    try {
        const result = await runProcess(
            cli,
            ['doctor', '--output-format', 'json'],
            { cwd: root, env: appEnv(server.endpoint) },
        );
        assert.equal(result.exitCode, 0, result.stdout);
        assert.equal(result.stderr, '');
        const document = JSON.parse(result.stdout);
        assert.equal(document.ok, true);
        assert.deepEqual(
            document.checks.find(({ name }) => name === 'authentication'),
            {
            name: 'authentication',
                status: 'warn',
                message:
                    'Provider authentication is verified only when a run starts.',
            },
        );
        assert.deepEqual(server.state.testConnectionInputs, []);
        assert.deepEqual(server.state.createInputs, []);
        assert.doesNotMatch(result.stdout, /sk-private-token|Bearer/);
    } finally {
        await server.close();
    }
});

test('provider-qualified Model IDs remain unique and select the exact pair', async () => {
    const sharedModel = {
        id: 'shared/model',
        name: 'Shared Display',
        enabled: true,
    };
    const server = await startFakeCdpServer({
        providers: [
            { id: 'provider/a', enable: true },
            { id: 'provider-b', enable: true },
        ],
        catalogs: {
            'provider/a': {
                providerModels: [sharedModel],
                customModels: [],
                dbProviderModels: [],
                modelStatusMap: { 'shared/model': true },
            },
            'provider-b': {
                providerModels: [sharedModel],
                customModels: [],
                dbProviderModels: [],
                modelStatusMap: { 'shared/model': true },
            },
        },
        sessionProviderId: 'provider-b',
        sessionModelId: 'shared/model',
    });
    try {
        const catalog = await runProcess(
            cli,
            ['models', 'list', '--output-format', 'json'],
            { cwd: root, env: appEnv(server.endpoint) },
        );
        assert.equal(catalog.exitCode, 0, catalog.stderr);
        assert.deepEqual(
            JSON.parse(catalog.stdout).models.map(({ id }) => id),
            ['provider%2Fa/shared%2Fmodel', 'provider-b/shared%2Fmodel'],
        );

        const run = await runProcess(
            cli,
            [
                '-p',
                'hello',
                '--model',
                'provider-b/shared%2Fmodel',
                '--output-format',
                'stream-json',
            ],
            { cwd: root, env: appEnv(server.endpoint) },
        );
        assert.equal(run.exitCode, 0, run.stderr || run.stdout);
        assert.deepEqual(server.state.testConnectionInputs, [
            { providerId: 'provider-b', modelId: 'shared/model' },
        ]);
        assert.deepEqual(
            server.state.createInputs.map(({ providerId, modelId }) => ({
                providerId,
                modelId,
            })),
            [{ providerId: 'provider-b', modelId: 'shared/model' }],
        );
    } finally {
        await server.close();
    }
});

test('a Session that silently changes the selected provider/model pair fails closed', async () => {
    const server = await startFakeCdpServer({
        sessionResponseProviderId: 'provider-other',
        sessionResponseModelId: 'model-other',
    });
    try {
        const result = await runProcess(
            cli,
            [
                '-p',
                'hello',
                '--model',
                'provider-test/model-test',
                '--output-format',
                'stream-json',
            ],
            { cwd: root, env: appEnv(server.endpoint) },
        );
        assert.equal(result.exitCode, 1);
        const validation = await validateStream(result.stdout, {
            exitCode: result.exitCode,
        });
        assert.equal(validation.valid, true, validation.errors.join('; '));
        assert.equal(validation.events.at(-2).code, 'INTERNAL_ERROR');
        assert.equal(validation.events[0].sessionId, null);
    } finally {
        await server.close();
    }
});
