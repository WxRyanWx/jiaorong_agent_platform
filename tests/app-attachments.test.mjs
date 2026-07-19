import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
    chmod,
    mkdtemp,
    open,
    realpath,
    rm,
    symlink,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

import { runProcess } from '../src/conformance/run-process.mjs';
import {
    MAX_ADDITIONAL_DIRECTORIES,
    MAX_ATTACHMENTS,
    MAX_ATTACHMENT_BYTES,
    MAX_TOTAL_ATTACHMENT_BYTES,
} from '../src/files/attachment-preflight.mjs';
import { validateStream } from '../src/protocol/validate-fixture.mjs';
import { startFakeCdpServer } from './helpers/fake-cdp-server.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const cli = resolve(repositoryRoot, 'tests/fixtures/app-backed-cli.mjs');
const execFileAsync = promisify(execFile);

function appEnv(endpoint) {
    return {
        JIAORONG_CLI_TEST_CDP_ENDPOINT: endpoint,
        JIAORONG_CLI_TEST_APP_EXECUTABLE: process.execPath,
    };
}

async function streamRun(endpoint, cwd, args) {
    const result = await runProcess(
        cli,
        [...args, '--output-format', 'stream-json'],
        { cwd, env: appEnv(endpoint) },
    );
    const validation = await validateStream(result.stdout, {
        exitCode: result.exitCode,
    });
    return { result, validation };
}

test('repeatable --file arguments are prepared before Session creation and sent structurally', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'jiaorong-cli-files-'));
    const markdownPath = join(projectRoot, 'notes.md');
    const jsonPath = join(projectRoot, 'data.json');
    await writeFile(markdownPath, 'ATTACHMENT_TEXT_CANARY\n');
    await writeFile(jsonPath, '{"canary":"ATTACHMENT_JSON_CANARY"}\n');
    const canonicalMarkdownPath = await realpath(markdownPath);
    const canonicalJsonPath = await realpath(jsonPath);
    const server = await startFakeCdpServer();
    try {
        const prompt = 'Compare the selected files; do not interpolate paths.';
        const run = await streamRun(server.endpoint, projectRoot, [
            '-p',
            prompt,
            '--file',
            './notes.md',
            '--file',
            './data.json',
        ]);

        assert.equal(run.result.exitCode, 0, run.result.stderr || run.result.stdout);
        assert.equal(
            run.validation.valid,
            true,
            run.validation.errors.join('; '),
        );
        const init = run.validation.events[0];
        assert.deepEqual(
            init.attachments.map(({ name, mimeType, sizeBytes }) => ({
                name,
                mimeType,
                sizeBytes,
            })),
            [
                {
                    name: 'notes.md',
                    mimeType: 'text/markdown',
                    sizeBytes: 23,
                },
                {
                    name: 'data.json',
                    mimeType: 'application/json',
                    sizeBytes: 36,
                },
            ],
        );
        for (const attachment of init.attachments) {
            assert.match(attachment.id, /^att_[0-9a-f-]+$/u);
            assert.deepEqual(Object.keys(attachment).sort(), [
                'id',
                'mimeType',
                'name',
                'sizeBytes',
            ]);
        }
        assert.deepEqual(server.state.prepareFileInputs, [
            { path: canonicalMarkdownPath, mimeType: 'text/markdown' },
            { path: canonicalJsonPath, mimeType: 'application/json' },
        ]);
        assert.equal(server.state.createInputs.length, 1);
        assert.ok(
            server.state.invokedRoutes.lastIndexOf('file.prepareFile') <
                server.state.invokedRoutes.lastIndexOf('sessions.create'),
        );
        assert.equal(server.state.sendInputs.length, 1);
        assert.equal(server.state.sendInputs[0].content.text, prompt);
        assert.deepEqual(
            server.state.sendInputs[0].content.files.map((file) => ({
                name: file.name,
                path: file.path,
                mimeType: file.mimeType,
            })),
            [
                {
                    name: 'notes.md',
                    path: canonicalMarkdownPath,
                    mimeType: 'text/markdown',
                },
                {
                    name: 'data.json',
                    path: canonicalJsonPath,
                    mimeType: 'application/json',
                },
            ],
        );
    } finally {
        await server.close();
        await rm(projectRoot, { recursive: true, force: true });
    }
});

test('an Additional Directory authorizes only its canonical filesystem boundary', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'jiaorong-cli-project-'));
    const additionalRoot = await mkdtemp(
        join(tmpdir(), 'jiaorong-cli-additional-'),
    );
    const outsidePath = join(additionalRoot, 'outside.txt');
    await writeFile(outsidePath, 'AUTHORIZED_ADDITIONAL_DIRECTORY\n');
    const canonicalProjectRoot = await realpath(projectRoot);
    const canonicalOutsidePath = await realpath(outsidePath);
    const server = await startFakeCdpServer();
    try {
        const denied = await streamRun(server.endpoint, projectRoot, [
            '-p',
            'read it',
            '--file',
            outsidePath,
        ]);
        assert.equal(denied.result.exitCode, 1);
        assert.equal(denied.validation.valid, true, denied.validation.errors.join('; '));
        assert.equal(denied.validation.events.at(-2).code, 'PERMISSION_DENIED');
        assert.equal(server.state.createInputs.length, 0);
        assert.equal(server.state.prepareFileInputs.length, 0);

        const accepted = await streamRun(server.endpoint, projectRoot, [
            '-p',
            'read it',
            '--add-dir',
            relative(projectRoot, additionalRoot),
            '--file',
            outsidePath,
        ]);
        assert.equal(
            accepted.result.exitCode,
            0,
            accepted.result.stderr || accepted.result.stdout,
        );
        assert.equal(accepted.validation.valid, true, accepted.validation.errors.join('; '));
        assert.equal(server.state.createInputs.length, 1);
        assert.equal(
            server.state.createInputs[0].projectDir,
            canonicalProjectRoot,
        );
        assert.deepEqual(server.state.prepareFileInputs, [
            { path: canonicalOutsidePath, mimeType: 'text/plain' },
        ]);
    } finally {
        await server.close();
        await rm(projectRoot, { recursive: true, force: true });
        await rm(additionalRoot, { recursive: true, force: true });
    }
});

test('filesystem and Attachment failures stop before the App Backend is opened', async (t) => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'jiaorong-cli-boundary-'));
    const outsideRoot = await mkdtemp(join(tmpdir(), 'jiaorong-cli-outside-'));
    const outsidePath = join(outsideRoot, 'outside.md');
    const unreadablePath = join(projectRoot, 'unreadable.md');
    const oversizedPath = join(projectRoot, 'oversized.md');
    const unsupportedPath = join(projectRoot, 'document.pdf');
    const aliasPath = join(projectRoot, 'finder-alias.md');
    await writeFile(outsidePath, 'OUTSIDE\n');
    await writeFile(unreadablePath, 'UNREADABLE\n');
    await chmod(unreadablePath, 0o000);
    const oversized = await open(oversizedPath, 'w');
    await oversized.truncate(MAX_ATTACHMENT_BYTES + 1);
    await oversized.close();
    await writeFile(unsupportedPath, Buffer.from('%PDF-1.7\n'));
    await writeFile(aliasPath, 'ALIAS\n');
    const symlinkPath = join(projectRoot, 'escape.md');
    await symlink(outsidePath, symlinkPath);

    async function rejected(name, args, code) {
        await t.test(name, async () => {
            const server = await startFakeCdpServer();
            try {
                const run = await streamRun(server.endpoint, projectRoot, [
                    '-p',
                    'must fail',
                    ...args,
                ]);
                assert.equal(
                    run.result.exitCode,
                    code === 'PERMISSION_DENIED' ? 1 : 42,
                );
                assert.equal(run.result.stderr, '');
                assert.equal(run.validation.valid, true, run.validation.errors.join('; '));
                assert.equal(run.validation.events[0].sessionId, null);
                assert.equal(run.validation.events.at(-2).code, code);
                assert.deepEqual(server.state.invokedRoutes, []);
                assert.deepEqual(server.state.prepareFileInputs, []);
                assert.deepEqual(server.state.createInputs, []);
            } finally {
                await server.close();
            }
        });
    }

    try {
        await rejected('missing file', ['--file', './missing.md'], 'INVALID_ARGUMENT');
        await rejected('unreadable file', ['--file', './unreadable.md'], 'INVALID_ARGUMENT');
        await rejected('unsupported MIME', ['--file', './document.pdf'], 'UNSUPPORTED_ATTACHMENT');
        await rejected('oversized file', ['--file', './oversized.md'], 'UNSUPPORTED_ATTACHMENT');
        await rejected('parent traversal', ['--file', relative(projectRoot, outsidePath)], 'PERMISSION_DENIED');
        await rejected('symlink escape', ['--file', './escape.md'], 'PERMISSION_DENIED');
        await rejected(
            'bypassPermissions does not bypass the file boundary',
            ['--permission-mode', 'bypassPermissions', '--file', outsidePath],
            'PERMISSION_DENIED',
        );

        if (process.platform === 'darwin') {
            try {
                await execFileAsync('/usr/bin/xattr', [
                    '-wx',
                    'com.apple.FinderInfo',
                    '0000000000000000800000000000000000000000000000000000000000000000',
                    aliasPath,
                ]);
                await rejected(
                    'macOS Finder alias',
                    ['--file', './finder-alias.md'],
                    'PERMISSION_DENIED',
                );
            } catch (error) {
                t.diagnostic(`Finder alias xattr unavailable: ${error.message}`);
            }
        }
    } finally {
        await chmod(unreadablePath, 0o600);
        await rm(projectRoot, { recursive: true, force: true });
        await rm(outsideRoot, { recursive: true, force: true });
    }
});

test('PNG, JPEG, WebP, and GIF files keep their detected MIME and send order', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'jiaorong-cli-images-'));
    const fixtures = [
        ['pixel.png', Buffer.from('89504e470d0a1a0a00000000', 'hex'), 'image/png'],
        ['pixel.jpg', Buffer.from('ffd8ffd9', 'hex'), 'image/jpeg'],
        ['pixel.webp', Buffer.from('524946460400000057454250', 'hex'), 'image/webp'],
        ['pixel.gif', Buffer.from('47494638396100000000', 'hex'), 'image/gif'],
    ];
    for (const [name, content] of fixtures)
        await writeFile(join(projectRoot, name), content);
    const server = await startFakeCdpServer();
    try {
        const args = ['-p', 'inspect images'];
        for (const [name] of fixtures) args.push('--file', `./${name}`);
        const run = await streamRun(server.endpoint, projectRoot, args);
        assert.equal(run.result.exitCode, 0, run.result.stderr || run.result.stdout);
        assert.equal(run.validation.valid, true, run.validation.errors.join('; '));
        assert.deepEqual(
            run.validation.events[0].attachments.map(({ name, mimeType }) => ({
                name,
                mimeType,
            })),
            fixtures.map(([name, _content, mimeType]) => ({ name, mimeType })),
        );
        assert.deepEqual(
            server.state.sendInputs[0].content.files.map(({ name, mimeType }) => ({
                name,
                mimeType,
            })),
            fixtures.map(([name, _content, mimeType]) => ({ name, mimeType })),
        );
    } finally {
        await server.close();
        await rm(projectRoot, { recursive: true, force: true });
    }
});

test('JiaorongAI attachment preparation failures do not create a Session', async (t) => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'jiaorong-cli-prepare-'));
    await writeFile(join(projectRoot, 'notes.md'), 'PREPARE_FAILURE\n');
    try {
        await t.test('route rejection', async () => {
            const server = await startFakeCdpServer({
                prepareFileFactory() {
                    throw new Error('private route failure');
                },
            });
            try {
                const run = await streamRun(server.endpoint, projectRoot, [
                    '-p',
                    'must fail',
                    '--file',
                    './notes.md',
                ]);
                assert.equal(run.result.exitCode, 42);
                assert.equal(run.validation.valid, true, run.validation.errors.join('; '));
                assert.equal(run.validation.events.at(-2).code, 'UNSUPPORTED_ATTACHMENT');
                assert.deepEqual(server.state.createInputs, []);
                assert.doesNotMatch(run.result.stdout, /private route failure/u);
            } finally {
                await server.close();
            }
        });

        await t.test('malformed prepared metadata', async () => {
            const server = await startFakeCdpServer({
                prepareFileFactory(input) {
                    return {
                        name: 'wrong.md',
                        path: input.path,
                        mimeType: input.mimeType,
                        content: 'wrong',
                        metadata: {
                            fileName: 'wrong.md',
                            fileSize: 5,
                        },
                    };
                },
            });
            try {
                const run = await streamRun(server.endpoint, projectRoot, [
                    '-p',
                    'must fail',
                    '--file',
                    './notes.md',
                ]);
                assert.equal(run.result.exitCode, 1);
                assert.equal(run.validation.valid, true, run.validation.errors.join('; '));
                assert.equal(run.validation.events.at(-2).code, 'INTERNAL_ERROR');
                assert.deepEqual(server.state.createInputs, []);
            } finally {
                await server.close();
            }
        });
    } finally {
        await rm(projectRoot, { recursive: true, force: true });
    }
});

test('published Attachment and Additional Directory limits fail before any read or backend call', async (t) => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'jiaorong-cli-limits-'));
    const totalPaths = [];
    for (let index = 0; index < 3; index += 1) {
        const path = join(projectRoot, `total-${index}.md`);
        const handle = await open(path, 'w');
        await handle.truncate(Math.floor(MAX_TOTAL_ATTACHMENT_BYTES / 3) + 1);
        await handle.close();
        totalPaths.push(path);
    }

    async function limitFailure(name, args) {
        await t.test(name, async () => {
            const server = await startFakeCdpServer();
            try {
                const run = await streamRun(server.endpoint, projectRoot, [
                    '-p',
                    'must fail',
                    ...args,
                ]);
                assert.equal(run.result.exitCode, 42);
                assert.equal(run.validation.valid, true, run.validation.errors.join('; '));
                assert.equal(run.validation.events.at(-2).code, 'INVALID_ARGUMENT');
                assert.deepEqual(server.state.invokedRoutes, []);
            } finally {
                await server.close();
            }
        });
    }

    try {
        const tooManyFiles = Array.from(
            { length: MAX_ATTACHMENTS + 1 },
            (_, index) => [`--file`, `missing-${index}.md`],
        ).flat();
        await limitFailure('Attachment count', tooManyFiles);

        const tooManyDirectories = Array.from(
            { length: MAX_ADDITIONAL_DIRECTORIES + 1 },
            () => ['--add-dir', '.'],
        ).flat();
        await limitFailure('Additional Directory count', tooManyDirectories);

        await t.test('total Attachment bytes', async () => {
            const server = await startFakeCdpServer();
            try {
                const args = ['-p', 'must fail'];
                for (const path of totalPaths) args.push('--file', path);
                const run = await streamRun(server.endpoint, projectRoot, args);
                assert.equal(run.result.exitCode, 42);
                assert.equal(run.validation.valid, true, run.validation.errors.join('; '));
                assert.equal(
                    run.validation.events.at(-2).code,
                    'UNSUPPORTED_ATTACHMENT',
                );
                assert.deepEqual(server.state.invokedRoutes, []);
            } finally {
                await server.close();
            }
        });

        await limitFailure('invalid Additional Directory', [
            '--add-dir',
            './missing-directory',
        ]);
    } finally {
        await rm(projectRoot, { recursive: true, force: true });
    }
});
