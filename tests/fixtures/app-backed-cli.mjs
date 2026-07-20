#!/usr/bin/env node
import { runMain } from '../../src/cli/main.mjs';
import { shouldGrantToolPermission } from '../../src/app/tool-permission-policy.mjs';

const endpoint = process.env.JIAORONG_CLI_TEST_CDP_ENDPOINT;
const expectedExecutable = process.env.JIAORONG_CLI_TEST_APP_EXECUTABLE;
if (!endpoint || !expectedExecutable)
    throw new Error('Missing fake App Runtime configuration.');

process.exitCode = await runMain({
    backendOptions: {
        toolPermissionPolicy: async (input) => {
            const delayMs = Number(
                process.env.JIAORONG_CLI_TEST_PERMISSION_POLICY_DELAY_MS ?? 0,
            );
            if (delayMs > 0)
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            return shouldGrantToolPermission(input);
        },
    },
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
                bridgeInvokeTimeoutMs: Number(
                    process.env.JIAORONG_CLI_TEST_BRIDGE_INVOKE_TIMEOUT_MS ??
                        10_000,
                ),
                runTimeoutMs: Number(
                    process.env.JIAORONG_CLI_TEST_RUN_TIMEOUT_MS ??
                        30 * 60 * 1_000,
                ),
                cancellationGraceMs: Number(
                    process.env.JIAORONG_CLI_TEST_CANCELLATION_GRACE_MS ??
                        30_000,
                ),
        },
        bundleValidator: async () => {},
    },
});
