import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { connect } from 'node:net';
import { promisify } from 'node:util';

import { AppReadinessError } from './readiness-error.mjs';

const execFileAsync = promisify(execFile);

function portIsListening(endpoint, timeoutMs = 250) {
    return new Promise((resolve) => {
        const socket = connect({
            host: endpoint.hostname.replaceAll('[', '').replaceAll(']', ''),
            port: Number(endpoint.port),
        });
        const finish = (value) => {
            socket.destroy();
            resolve(value);
        };
        socket.setTimeout(timeoutMs, () => finish(false));
        socket.once('connect', () => finish(true));
        socket.once('error', () => finish(false));
    });
}

async function processIsRunning(expectedExecutable) {
    try {
        await execFileAsync('/usr/bin/pgrep', ['-f', expectedExecutable], {
            timeout: 1_000,
            maxBuffer: 16_000,
        });
        return true;
    } catch {
        return false;
    }
}

async function installed(config) {
    try {
        await Promise.all([
            access(config.appBundlePath),
            access(config.expectedExecutable),
        ]);
        return true;
    } catch {
        return false;
    }
}

async function launch(config) {
    await execFileAsync(
        '/usr/bin/open',
        [
            '-na',
            config.appBundlePath,
            '--args',
            '--remote-debugging-address=127.0.0.1',
            `--remote-debugging-port=${config.endpoint.port}`,
        ],
        { timeout: 5_000, maxBuffer: 32_000 },
    );
}

async function waitUntilListening(config) {
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline) {
        if (await portIsListening(config.endpoint)) return true;
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
}

const defaultDependencies = {
    endpointIsListening: (config) => portIsListening(config.endpoint),
    appIsRunning: (config) => processIsRunning(config.expectedExecutable),
    appIsInstalled: installed,
    launchApp: launch,
    waitForEndpoint: waitUntilListening,
};

export async function ensureAppEndpoint(config, dependencies = defaultDependencies) {
    if (await dependencies.endpointIsListening(config))
        return { launched: false };
    if (await dependencies.appIsRunning(config))
        throw new AppReadinessError(
            'app-state',
            'JiaorongAI is already running without a debugging endpoint; quit it manually if safe, then retry.',
        );
    if (!(await dependencies.appIsInstalled(config)))
        throw new AppReadinessError(
            'app-installation',
            'JiaorongAI.app 0.5.6 must be installed in /Applications.',
        );
    try {
        await dependencies.launchApp(config);
    } catch {
        throw new AppReadinessError(
            'app-state',
            'JiaorongAI could not be launched with a loopback debugging endpoint.',
        );
    }
    if (!(await dependencies.waitForEndpoint(config)))
        throw new AppReadinessError(
            'app-state',
            'JiaorongAI did not open its loopback debugging endpoint in time.',
        );
    return { launched: true };
}
