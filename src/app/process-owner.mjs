import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { promisify } from 'node:util';

import { AppReadinessError } from './readiness-error.mjs';

const execFileAsync = promisify(execFile);

export function validateListenerRecords(output, endpoint) {
    const records = new Map();
    let currentPid;
    for (const line of output.split('\n')) {
        if (/^p\d+$/.test(line)) {
            currentPid = Number(line.slice(1));
            records.set(currentPid, []);
        } else if (line.startsWith('n') && currentPid !== undefined) {
            records.get(currentPid).push(line.slice(1));
        }
    }
    if (records.size !== 1)
        throw new AppReadinessError(
            'endpoint-owner',
            'The JiaorongAI debugging endpoint does not have one unambiguous owner.',
        );
    const [[pid, listeners]] = records;
    const allowed = new Set([
        `127.0.0.1:${endpoint.port}`,
        `[::1]:${endpoint.port}`,
    ]);
    if (listeners.length === 0 || listeners.some((name) => !allowed.has(name)))
        throw new AppReadinessError(
            'endpoint-owner',
            'The JiaorongAI debugging listener is not bound only to loopback.',
        );
    return { pid };
}

export async function assertListenerOwner(endpoint, expectedExecutable) {
    let output;
    try {
        ({ stdout: output } = await execFileAsync(
            '/usr/sbin/lsof',
            [
                '-nP',
                `-iTCP:${endpoint.port}`,
                '-sTCP:LISTEN',
                '-Fpn',
            ],
            { timeout: 2_000, maxBuffer: 64_000 },
        ));
    } catch {
        throw new AppReadinessError(
            'endpoint-owner',
            'No verified process owns the JiaorongAI debugging endpoint.',
        );
    }
    const { pid } = validateListenerRecords(output, endpoint);
    let actualExecutable;
    try {
        const result = await execFileAsync(
            '/bin/ps',
            ['-p', String(pid), '-o', 'comm='],
            { timeout: 2_000, maxBuffer: 16_000 },
        );
        actualExecutable = result.stdout.trim();
        const [actual, expected] = await Promise.all([
            realpath(actualExecutable),
            realpath(expectedExecutable),
        ]);
        if (actual !== expected) throw new Error('owner mismatch');
    } catch {
        throw new AppReadinessError(
            'endpoint-owner',
            'The debugging endpoint is owned by an unexpected process.',
        );
    }
    return { pid };
}
