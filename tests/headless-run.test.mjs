import assert from 'node:assert/strict';
import { chmod } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { runProcess } from '../src/conformance/run-process.mjs';
import { validateStream } from '../src/protocol/validate-fixture.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureCli = resolve(root, 'tests/fixtures/conformant-cli.mjs');
const productionCli = resolve(root, 'bin/jiaorong-cli.mjs');

function execute(args, stdin = '') {
    return runProcess(fixtureCli, args, { cwd: root, stdin });
}

test.before(async () => chmod(fixtureCli, 0o755));

test('a stream-json Headless Run preserves an arbitrary prompt through the backend seam', async () => {
    const prompt =
        '中文 line\nquotes " and shell text $(touch should-not-run) `false`';
    const result = await execute([
        '-p',
        prompt,
        '--output-format',
        'stream-json',
    ]);

    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(result.stderr, '');
    const validation = await validateStream(result.stdout, {
        exitCode: result.exitCode,
    });
    assert.equal(validation.valid, true, validation.errors.join('; '));
    assert.equal(validation.events[1].delta, `echo:${prompt}`);
    assert.equal(validation.events.at(-1).content, `echo:${prompt}`);
});

test('text and json modes project the same successful Headless Run', async () => {
    const text = await execute(['-p', 'hello', '--output-format', 'text']);
    assert.equal(text.exitCode, 0);
    assert.equal(text.stdout, 'echo:hello');
    assert.equal(text.stderr, '');

    const json = await execute(['-p', 'hello', '--output-format', 'json']);
    assert.equal(json.exitCode, 0, json.stderr);
    assert.equal(json.stderr, '');
    assert.deepEqual(JSON.parse(json.stdout), {
        protocolVersion: 1,
        requestId: 'req_fixture',
        sessionId: 'ses_fixture',
        status: 'success',
        content: 'echo:hello',
        model: { id: 'jiaorong-fixture', displayName: 'Jiaorong Fixture' },
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        turns: 1,
        durationMs: 10,
        error: null,
    });
});

test('non-empty prompt argv and stdin fail after establishing the machine protocol', async () => {
    const result = await execute(
        ['-p', 'argv prompt', '--output-format', 'stream-json'],
        'stdin prompt',
    );

    assert.equal(result.exitCode, 42);
    const validation = await validateStream(result.stdout, {
        exitCode: result.exitCode,
    });
    assert.equal(validation.valid, true, validation.errors.join('; '));
    assert.deepEqual(
        validation.events.map(({ type }) => type),
        ['init', 'error', 'result'],
    );
    assert.equal(validation.events[0].sessionId, null);
    assert.equal(validation.events[0].model, null);
    assert.equal(validation.events[1].code, 'INVALID_ARGUMENT');
    assert.equal(validation.events[2].error.code, 'INVALID_ARGUMENT');
});

test('a preflight argument error uses an already selected machine protocol', async () => {
    const result = await execute([
        '-p',
        'hello',
        '--output-format',
        'stream-json',
        '--permission-mode',
        'not-a-mode',
    ]);

    assert.equal(result.exitCode, 42);
    assert.equal(result.stderr, '');
    const validation = await validateStream(result.stdout, {
        exitCode: result.exitCode,
    });
    assert.equal(validation.valid, true, validation.errors.join('; '));
    assert.equal(validation.events[0].permissionMode, null);
    assert.equal(validation.events[1].code, 'INVALID_ARGUMENT');
});

test('all argument failures after selecting a machine format stay in protocol', async () => {
    for (const args of [
        ['--output-format', 'stream-json', '--unknown'],
        ['--output-format', 'stream-json', '--model'],
        ['--output-format', 'stream-json', '--max-turns', '-1'],
    ]) {
        const result = await execute(args);
        assert.equal(result.exitCode, 42);
        assert.equal(result.stderr, '');
        const validation = await validateStream(result.stdout, {
            exitCode: result.exitCode,
        });
        assert.equal(
            validation.valid,
            true,
            `${args.join(' ')}: ${validation.errors.join('; ')}`,
        );
        assert.equal(validation.events[1].code, 'INVALID_ARGUMENT');
    }
});

test('prompt argv may begin with a hyphen', async () => {
    const result = await execute(['-p', '-leading', '--output-format', 'text']);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, 'echo:-leading');
});

test('the production executable is wired without enabling the fixture backend', async () => {
    await chmod(productionCli, 0o755);
    const version = await runProcess(productionCli, ['--version'], {
        cwd: root,
    });
    assert.equal(version.exitCode, 0);
    assert.equal(version.stdout, '0.1.0\n');

    const run = await runProcess(
        productionCli,
        ['-p', 'hello', '--output-format', 'stream-json'],
        { cwd: root },
    );
    assert.equal(run.exitCode, 1);
    const validation = await validateStream(run.stdout, {
        exitCode: run.exitCode,
    });
    assert.equal(validation.valid, true, validation.errors.join('; '));
    assert.equal(validation.events[1].code, 'INTERNAL_ERROR');
    assert.doesNotMatch(run.stdout, /echo:hello/);
});
