import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
    access,
    chmod,
    lstat,
    mkdir,
    mkdtemp,
    open,
    realpath,
    rm,
    stat,
} from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import {
    basename,
    extname,
    isAbsolute,
    join,
    relative,
    resolve,
    sep,
} from 'node:path';
import { promisify } from 'node:util';

import { BackendFailure } from '../cli/failures.mjs';

export const MAX_ATTACHMENTS = 16;
export const MAX_ADDITIONAL_DIRECTORIES = 16;
export const MAX_ATTACHMENT_BYTES = 30 * 1_024 * 1_024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 60 * 1_024 * 1_024;
export const MAX_PATH_BYTES = 4_096;

const execFileAsync = promisify(execFile);
const textMimeTypes = new Map([
    ['.txt', 'text/plain'],
    ['.text', 'text/plain'],
    ['.md', 'text/markdown'],
    ['.markdown', 'text/markdown'],
    ['.json', 'application/json'],
]);

function invalid(message) {
    return new BackendFailure('INVALID_ARGUMENT', message, 42);
}

function denied() {
    return new BackendFailure(
        'PERMISSION_DENIED',
        'The Attachment is outside the authorized filesystem boundary.',
    );
}

function unsupported() {
    return new BackendFailure(
        'UNSUPPORTED_ATTACHMENT',
        'The Attachment type is not supported.',
        42,
    );
}

function assertPathArgument(value, label) {
    if (
        typeof value !== 'string' ||
        value.length === 0 ||
        Buffer.byteLength(value, 'utf8') > MAX_PATH_BYTES ||
        /[\u0000-\u001f\u007f]/u.test(value)
    )
        throw invalid(`${label} requires a valid path.`);
}

function contains(root, target) {
    const pathFromRoot = relative(root, target);
    return (
        pathFromRoot === '' ||
        (!pathFromRoot.startsWith(`..${sep}`) &&
            pathFromRoot !== '..' &&
            !isAbsolute(pathFromRoot))
    );
}

async function canonicalDirectory(input, projectRoot, label) {
    assertPathArgument(input, label);
    const candidate = resolve(projectRoot, input);
    let canonical;
    try {
        canonical = await realpath(candidate);
        const directoryStat = await stat(canonical);
        if (!directoryStat.isDirectory())
            throw invalid(`${label} must identify a directory.`);
        await access(canonical, constants.R_OK | constants.X_OK);
    } catch (error) {
        if (error instanceof BackendFailure) throw error;
        throw invalid(`${label} does not identify an accessible directory.`);
    }
    return canonical;
}

async function isMacAlias(path) {
    if (process.platform !== 'darwin') return false;
    try {
        const { stdout } = await execFileAsync(
            '/usr/bin/xattr',
            ['-px', 'com.apple.FinderInfo', path],
            { encoding: 'utf8', maxBuffer: 256 },
        );
        const bytes = Buffer.from(stdout.replace(/\s/gu, ''), 'hex');
        return bytes.length >= 10 && (bytes.readUInt16BE(8) & 0x8000) !== 0;
    } catch {
        return false;
    }
}

function imageMimeType(buffer) {
    if (
        buffer.length >= 8 &&
        buffer.subarray(0, 8).equals(
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        )
    )
        return 'image/png';
    if (
        buffer.length >= 3 &&
        buffer[0] === 0xff &&
        buffer[1] === 0xd8 &&
        buffer[2] === 0xff
    )
        return 'image/jpeg';
    if (
        buffer.length >= 12 &&
        buffer.toString('ascii', 0, 4) === 'RIFF' &&
        buffer.toString('ascii', 8, 12) === 'WEBP'
    )
        return 'image/webp';
    const gif = buffer.toString('ascii', 0, 6);
    if (gif === 'GIF87a' || gif === 'GIF89a') return 'image/gif';
    return null;
}

function detectMimeType(path, content) {
    const image = imageMimeType(content);
    if (image) return image;
    const textMimeType = textMimeTypes.get(extname(path).toLowerCase());
    if (!textMimeType) throw unsupported();
    try {
        new TextDecoder('utf-8', { fatal: true }).decode(content);
    } catch {
        throw unsupported();
    }
    if (content.includes(0)) throw unsupported();
    return textMimeType;
}

function sameFileIdentity(left, right) {
    return (
        left.dev === right.dev &&
        left.ino === right.ino &&
        left.size === right.size &&
        left.ctimeNs === right.ctimeNs &&
        left.mtimeNs === right.mtimeNs
    );
}

function changedDuringPreflight() {
    return invalid('The Attachment changed while it was being prepared.');
}

async function readStableFile(handle, expectedStat) {
    const content = Buffer.alloc(Number(expectedStat.size));
    let offset = 0;
    while (offset < content.length) {
        const { bytesRead } = await handle.read(
            content,
            offset,
            content.length - offset,
            offset,
        );
        if (bytesRead === 0) throw changedDuringPreflight();
        offset += bytesRead;
    }
    const extra = Buffer.alloc(1);
    const { bytesRead: extraBytes } = await handle.read(
        extra,
        0,
        1,
        content.length,
    );
    const finalStat = await handle.stat({ bigint: true });
    if (extraBytes !== 0 || !sameFileIdentity(expectedStat, finalStat))
        throw changedDuringPreflight();
    return content;
}

async function closeHandles(handles) {
    await Promise.allSettled(handles.map((handle) => handle.close()));
}

export async function cleanupAttachmentSnapshots(fileScope) {
    if (!fileScope?.snapshotDirectory) return;
    await rm(fileScope.snapshotDirectory, { recursive: true, force: true });
    fileScope.snapshotDirectory = null;
}

export async function preflightAttachments({
    cwd,
    files,
    additionalDirectories,
}) {
    if (files.length > MAX_ATTACHMENTS)
        throw invalid(`At most ${MAX_ATTACHMENTS} Attachments are allowed.`);
    if (additionalDirectories.length > MAX_ADDITIONAL_DIRECTORIES)
        throw invalid(
            `At most ${MAX_ADDITIONAL_DIRECTORIES} Additional Directories are allowed.`,
        );

    const projectRoot = await canonicalDirectory(cwd, cwd, 'Project Root');
    const authorizedRoots = [projectRoot];
    for (const directory of additionalDirectories) {
        const canonical = await canonicalDirectory(
            directory,
            projectRoot,
            '--add-dir',
        );
        if (!authorizedRoots.includes(canonical)) authorizedRoots.push(canonical);
    }

    const candidates = [];
    for (const input of files) {
        assertPathArgument(input, '--file');
        const candidate = resolve(projectRoot, input);
        let canonical;
        let fileStat;
        try {
            canonical = await realpath(candidate);
            if (!authorizedRoots.some((root) => contains(root, canonical)))
                throw denied();
            const linkStat = await lstat(canonical, { bigint: true });
            fileStat = await stat(canonical, { bigint: true });
            if (!linkStat.isFile() || !fileStat.isFile())
                throw invalid('--file must identify a regular file.');
        } catch (error) {
            if (error instanceof BackendFailure) throw error;
            throw invalid('The Attachment does not identify a readable file.');
        }
        if (await isMacAlias(canonical)) throw denied();
        if (fileStat.size > BigInt(MAX_ATTACHMENT_BYTES))
            throw new BackendFailure(
                'UNSUPPORTED_ATTACHMENT',
                `An Attachment exceeds the ${MAX_ATTACHMENT_BYTES}-byte limit.`,
                42,
            );
        candidates.push({ path: canonical, stat: fileStat });
    }

    const handles = [];
    let snapshotDirectory = null;
    try {
        let totalBytes = 0n;
        for (const candidate of candidates) {
            let handle;
            try {
                handle = await open(
                    candidate.path,
                    constants.O_RDONLY | constants.O_NOFOLLOW,
                );
                const openedStat = await handle.stat({ bigint: true });
                if (
                    !openedStat.isFile() ||
                    !sameFileIdentity(candidate.stat, openedStat)
                )
                    throw changedDuringPreflight();
                if (openedStat.size > BigInt(MAX_ATTACHMENT_BYTES))
                    throw new BackendFailure(
                        'UNSUPPORTED_ATTACHMENT',
                        `An Attachment exceeds the ${MAX_ATTACHMENT_BYTES}-byte limit.`,
                        42,
                    );
                totalBytes += openedStat.size;
                if (totalBytes > BigInt(MAX_TOTAL_ATTACHMENT_BYTES))
                    throw new BackendFailure(
                        'UNSUPPORTED_ATTACHMENT',
                        `Attachments exceed the ${MAX_TOTAL_ATTACHMENT_BYTES}-byte total limit.`,
                        42,
                    );
                candidate.stat = openedStat;
                handles.push(handle);
            } catch (error) {
                if (handle && !handles.includes(handle)) await handle.close();
                if (error instanceof BackendFailure) throw error;
                throw invalid('The Attachment does not identify a readable file.');
            }
        }

        if (candidates.length > 0) {
            snapshotDirectory = await mkdtemp(
                join(tmpdir(), 'jiaorong-cli-attachments-'),
            );
            await chmod(snapshotDirectory, 0o700);
        }

        const attachments = [];
        for (let index = 0; index < candidates.length; index += 1) {
            const candidate = candidates[index];
            let content;
            try {
                content = await readStableFile(handles[index], candidate.stat);
            } catch (error) {
                if (error instanceof BackendFailure) throw error;
                throw invalid('The Attachment could not be read.');
            }
            const mimeType = detectMimeType(candidate.path, content);
            const name = basename(candidate.path);
            const attachmentDirectory = join(snapshotDirectory, String(index));
            await mkdir(attachmentDirectory, { mode: 0o700 });
            const snapshotPath = join(attachmentDirectory, name);
            const snapshot = await open(
                snapshotPath,
                constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
                0o600,
            );
            try {
                await snapshot.writeFile(content);
            } finally {
                await snapshot.close();
            }
            attachments.push({
                id: `att_${randomUUID()}`,
                name,
                mimeType,
                sizeBytes: Number(candidate.stat.size),
                path: snapshotPath,
            });
        }

        return {
            projectRoot,
            additionalDirectories: authorizedRoots.slice(1),
            attachments,
            snapshotDirectory,
        };
    } catch (error) {
        if (snapshotDirectory)
            await rm(snapshotDirectory, { recursive: true, force: true });
        throw error;
    } finally {
        await closeHandles(handles);
    }
}
