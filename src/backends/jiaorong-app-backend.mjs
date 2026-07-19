import { inspectAppReadiness } from '../app/app-runtime.mjs';
import { AppReadinessError } from '../app/readiness-error.mjs';
import { BackendFailure } from '../cli/failures.mjs';

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

        async prepare() {
            throw new BackendFailure(
                'INTERNAL_ERROR',
                'Real JiaorongAI runs are not implemented yet.',
            );
        },
        async *run() {},
    };
}
