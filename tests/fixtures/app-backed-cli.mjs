#!/usr/bin/env node
import { runMain } from '../../src/cli/main.mjs';

const endpoint = process.env.JIAORONG_CLI_TEST_CDP_ENDPOINT;
const expectedExecutable = process.env.JIAORONG_CLI_TEST_APP_EXECUTABLE;
if (!endpoint || !expectedExecutable)
    throw new Error('Missing fake App Runtime configuration.');

process.exitCode = await runMain({
    runtimeOptions: {
        config: {
            endpoint,
            expectedExecutable,
            appBundlePath: expectedExecutable,
            bundleId: 'test.fake',
            supportedVersion: '0.5.6',
            targetUrlPrefix:
                'file:///Applications/JiaorongAI.app/Contents/Resources/app.asar/out/renderer/',
                cdpTimeoutMs: Number(
                    process.env.JIAORONG_CLI_TEST_CDP_TIMEOUT_MS ?? 3_000,
                ),
                rendererTimeoutMs: Number(
                    process.env.JIAORONG_CLI_TEST_RENDERER_TIMEOUT_MS ?? 2_000,
                ),
        },
        bundleValidator: async () => {},
    },
});
