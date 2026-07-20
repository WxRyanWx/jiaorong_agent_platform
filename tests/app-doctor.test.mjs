import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';

import { parseLoopbackEndpoint } from '../src/app/endpoint.mjs';
import { ensureAppEndpoint } from '../src/app/app-lifecycle.mjs';
import { validateAppBundle } from '../src/app/app-bundle.mjs';
import { validateListenerRecords } from '../src/app/process-owner.mjs';
import { runProcess } from '../src/conformance/run-process.mjs';
import { validateDocument } from '../src/protocol/validate-fixture.mjs';
import { startFakeCdpServer } from './helpers/fake-cdp-server.mjs';

const root = resolve(import.meta.dirname, '..');
const cli = resolve(root, 'tests/fixtures/app-backed-cli.mjs');

function doctorEnv(
    endpoint,
    expectedExecutable = process.execPath,
    extra = {},
) {
    return {
        JIAORONG_CLI_TEST_CDP_ENDPOINT: endpoint,
        JIAORONG_CLI_TEST_APP_EXECUTABLE: expectedExecutable,
        ...extra,
    };
}

test('doctor proves a conforming loopback JiaorongAI bridge through the production command', async () => {
    const server = await startFakeCdpServer();
    try {
        const result = await runProcess(
            cli,
            ['doctor', '--output-format', 'json'],
            { cwd: root, env: doctorEnv(server.endpoint) },
        );

        assert.equal(result.exitCode, 0, result.stderr || result.stdout);
        assert.equal(result.stderr, '');
        assert.match(result.stdout, /\n$/);
        const document = JSON.parse(result.stdout);
        assert.equal(document.ok, true);
        assert.equal(document.app.version, '0.5.6');
        assert.equal(document.app.endpoint, new URL(server.endpoint).host);
        assert.equal(document.models.available, 1);
        const validation = await validateDocument(
            'doctor.schema.json',
            document,
        );
        assert.deepEqual(validation.errors, []);

        const textResult = await runProcess(cli, ['doctor'], {
            cwd: root,
            env: doctorEnv(server.endpoint),
        });
        assert.equal(textResult.exitCode, 0, textResult.stderr);
        assert.match(textResult.stdout, /^JiaorongAI readiness: ready\n/);
        assert.equal(server.state.activeSubscriptions, 0);
        assert.equal(server.state.subscriptions.length, 6);
        assert.equal(server.state.unsubscriptions, 6);
        assert.deepEqual(server.state.testConnectionInputs, []);
    } finally {
        await server.close();
    }
});

test('listener ownership requires one owner bound to the requested loopback address', () => {
    const endpoint = new URL('http://127.0.0.1:9238');
    assert.deepEqual(
        validateListenerRecords('p42\nn127.0.0.1:9238\n', endpoint),
        { pid: 42 },
    );
    assert.throws(
        () => validateListenerRecords('p42\nn*:9238\n', endpoint),
        /loopback/,
    );
    assert.throws(
        () =>
            validateListenerRecords(
                'p42\nn127.0.0.1:9238\np43\nn127.0.0.1:9238\n',
                endpoint,
            ),
        /unambiguous/,
    );
});

test('App Runtime validates the installed bundle identity and exact supported version', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'jiaorong-bundle-'));
    const contents = resolve(directory, 'Contents');
    const plist = resolve(contents, 'Info.plist');
    const resources = resolve(contents, 'Resources');
    const appAsar = resolve(resources, 'app.asar');
    const writePlist = (bundleId, version) =>
        writeFile(
            plist,
            `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>${bundleId}</string>
<key>CFBundleShortVersionString</key><string>${version}</string>
</dict></plist>`,
        );
    const config = {
        appBundlePath: directory,
        bundleId: 'com.wefonk.jiaorong',
        supportedVersion: '0.5.6',
        supportedAppAsarSha256:
            '9488114ad29c32d562aee5597bb04defc79868266d28aa847aa041a2143e2d8a',
    };
    try {
        await mkdir(contents, { recursive: true });
        await mkdir(resources, { recursive: true });
        await writeFile(appAsar, 'trusted-bundle');
        await writePlist('com.wefonk.jiaorong', '0.5.6');
        await validateAppBundle(config);

        await writeFile(appAsar, 'different-bundle');
        await assert.rejects(validateAppBundle(config), /build identity/);
        await writeFile(appAsar, 'trusted-bundle');

        await writePlist('com.wefonk.jiaorong', '0.5.7');
        await assert.rejects(validateAppBundle(config), /unsupported/);

        await writePlist('com.example.unrelated', '0.5.6');
        await assert.rejects(validateAppBundle(config), /bundle identity/);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('doctor rejects wrong versions, ambiguous targets, and missing bridge contracts', async (t) => {
    const scenarios = [
        {
            name: 'wrong version',
            options: { appVersion: '0.5.7' },
            check: 'app-version',
        },
        {
            name: 'ambiguous targets',
            options: { targetCount: 2 },
            check: 'renderer-target',
        },
        {
            name: 'missing route',
            options: { missingRoutes: ['sessions.create'] },
            check: 'bridge-contract',
        },
        {
            name: 'missing disabled-tools route',
            options: {
                missingRoutes: ['sessions.getDisabledAgentTools'],
            },
            check: 'bridge-contract',
        },
        {
            name: 'event subscription failure',
            options: { missingEvents: ['chat.stream.completed'] },
            check: 'bridge-contract',
        },
        {
            name: 'missing method',
            options: { missingMethods: ['on'] },
            check: 'bridge-contract',
        },
        {
            name: 'oversized bridge response',
            options: { responsePadding: 'x'.repeat(600_000) },
            check: 'bridge-contract',
        },
        {
            name: 'hung bridge invocation cleans subscriptions on renderer deadline',
            options: { hangRoutes: ['providers.listSummaries'] },
            env: {
                JIAORONG_CLI_TEST_CDP_TIMEOUT_MS: '500',
                JIAORONG_CLI_TEST_RENDERER_TIMEOUT_MS: '100',
            },
            check: 'bridge-contract',
            expectedSubscriptions: 3,
        },
        {
            name: 'listener cleanup failure',
            options: { unsubscribeThrows: true },
            check: 'bridge-contract',
        },
        {
            name: 'unsafe renderer WebSocket',
            options: {
                websocketUrl:
                    'ws://192.168.1.8:9238/devtools/page/jiaorong-0',
            },
            check: 'renderer-target',
        },
        {
            name: 'oversized target list',
            options: { targetCount: 33 },
            check: 'renderer-target',
        },
        {
            name: 'untrusted renderer URL',
            options: { targetUrl: 'file:///tmp/index.html' },
            check: 'renderer-target',
        },
        {
            name: 'disabled provider has no available model',
            options: {
                providers: [{ id: 'provider-test', enable: false }],
            },
            check: 'models',
        },
    ];

    for (const scenario of scenarios) {
        await t.test(scenario.name, async () => {
            const server = await startFakeCdpServer(scenario.options);
            try {
                const result = await runProcess(
                    cli,
                    ['doctor', '--output-format', 'json'],
                    {
                        cwd: root,
                        env: doctorEnv(
                            server.endpoint,
                            process.execPath,
                            scenario.env,
                        ),
                    },
                );
                assert.equal(result.exitCode, 1);
                const document = JSON.parse(result.stdout);
                assert.equal(document.ok, false);
                assert.equal(document.checks.at(-1).name, scenario.check);
                assert.equal(server.state.activeSubscriptions, 0);
                if (scenario.expectedSubscriptions !== undefined) {
                    assert.equal(
                        server.state.subscriptions.length,
                        scenario.expectedSubscriptions,
                    );
                    assert.equal(
                        server.state.unsubscriptions,
                        scenario.expectedSubscriptions,
                    );
                }
            } finally {
                await server.close();
            }
        });
    }
});

test('doctor rejects malformed and oversized CDP metadata', async (t) => {
    for (const scenario of [
        { name: 'malformed', metadataBody: '{not-json' },
        {
            name: 'unrelated product',
            metadataBody: JSON.stringify({
                Browser: 'Chrome/144.0.0.0',
                'User-Agent': 'Mozilla/5.0 Chrome/144.0.0.0',
            }),
        },
        {
            name: 'oversized',
            metadataBody: JSON.stringify({
                Browser: `JiaorongAI/${'x'.repeat(300_000)}`,
            }),
        },
        { name: 'timed out', metadataDelayMs: 2_500 },
    ]) {
        await t.test(scenario.name, async () => {
            const server = await startFakeCdpServer(scenario);
            try {
                const result = await runProcess(
                    cli,
                    ['doctor', '--output-format', 'json'],
                    { cwd: root, env: doctorEnv(server.endpoint) },
                );
                assert.equal(result.exitCode, 1);
                assert.equal(JSON.parse(result.stdout).checks.at(-1).name, 'cdp-metadata');
            } finally {
                await server.close();
            }
        });
    }
});

test('App Runtime launches only an absent installed app and never restarts a running app', async () => {
    let launches = 0;
    const dependencies = {
        endpointIsListening: async () => false,
        appIsRunning: async () => false,
        appIsInstalled: async () => true,
        launchApp: async () => {
            launches += 1;
        },
        waitForEndpoint: async () => true,
    };
    await ensureAppEndpoint({}, dependencies);
    assert.equal(launches, 1);

    await assert.rejects(
        ensureAppEndpoint(
            {},
            {
                ...dependencies,
                appIsRunning: async () => true,
            },
        ),
        /already running without a debugging endpoint/,
    );
    assert.equal(launches, 1);
});

test('text doctor preserves the manual recovery instruction when an app is already running without CDP', async () => {
    const server = await startFakeCdpServer();
    const endpoint = server.endpoint;
    await server.close();

    const result = await runProcess(cli, ['doctor'], {
        cwd: root,
        env: doctorEnv(endpoint),
    });
    assert.equal(result.exitCode, 1);
    assert.match(result.stdout, /already running without a debugging endpoint/);
    assert.match(result.stdout, /quit it manually if safe/);
});

test('doctor fails closed for an unrelated listener owner', async () => {
    const server = await startFakeCdpServer();
    try {
        const result = await runProcess(
            cli,
            ['doctor', '--output-format', 'json'],
            { cwd: root, env: doctorEnv(server.endpoint, '/bin/sh') },
        );

        assert.equal(result.exitCode, 1);
        assert.equal(result.stderr, '');
        const document = JSON.parse(result.stdout);
        assert.equal(document.ok, false);
        assert.equal(
            document.checks.find(({ name }) => name === 'endpoint-owner')
                .status,
            'fail',
        );
        assert.doesNotMatch(result.stdout, new RegExp(process.execPath));
    } finally {
        await server.close();
    }
});

test('endpoint parsing rejects non-loopback and ambiguous endpoint URLs', () => {
    assert.throws(
        () => parseLoopbackEndpoint('http://192.168.1.8:9238'),
        /loopback/,
    );
    assert.throws(
        () => parseLoopbackEndpoint('http://localhost:9238'),
        /loopback/,
    );
    assert.throws(
        () => parseLoopbackEndpoint('http://user:pass@127.0.0.1:9238'),
        /credentials/,
    );
    assert.throws(
        () => parseLoopbackEndpoint('http://127.0.0.1:9238/path'),
        /origin/,
    );
});
