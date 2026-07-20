import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import { AppReadinessError } from './readiness-error.mjs';

const execFileAsync = promisify(execFile);

async function plistValue(plistPath, key) {
    const { stdout } = await execFileAsync(
        '/usr/bin/plutil',
        ['-extract', key, 'raw', '-o', '-', plistPath],
        { timeout: 2_000, maxBuffer: 16_000 },
    );
    return stdout.trim();
}

function fileSha256(path) {
    return new Promise((resolveHash, rejectHash) => {
        const hash = createHash('sha256');
        const stream = createReadStream(path);
        stream.on('error', rejectHash);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolveHash(hash.digest('hex')));
    });
}

export async function validateAppBundle(config) {
    const plistPath = resolve(config.appBundlePath, 'Contents/Info.plist');
    let bundleId;
    let version;
    try {
        [bundleId, version] = await Promise.all([
            plistValue(plistPath, 'CFBundleIdentifier'),
            plistValue(plistPath, 'CFBundleShortVersionString'),
        ]);
    } catch {
        throw new AppReadinessError(
            'app-installation',
            'JiaorongAI.app is missing or its bundle metadata cannot be read.',
        );
    }
    if (bundleId !== config.bundleId)
        throw new AppReadinessError(
            'app-installation',
            'The installed application does not have the JiaorongAI bundle identity.',
        );
    if (version !== config.supportedVersion)
        throw new AppReadinessError(
            'app-version',
            `JiaorongAI ${version} is unsupported; version ${config.supportedVersion} is required.`,
        );
    let appAsarSha256;
    try {
        appAsarSha256 = await fileSha256(
            resolve(config.appBundlePath, 'Contents/Resources/app.asar'),
        );
    } catch {
        throw new AppReadinessError(
            'app-installation',
            'JiaorongAI.app is missing or its application resources cannot be read.',
        );
    }
    if (appAsarSha256 !== config.supportedAppAsarSha256)
        throw new AppReadinessError(
            'app-version',
            'The installed JiaorongAI build identity is unsupported.',
        );
}
