import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';

import { runCli } from '../src/cli/run-cli.mjs';

function streams() {
    let stdout = '';
    let stderr = '';
    return {
        stdout: { write: (chunk) => (stdout += chunk) },
        stderr: { write: (chunk) => (stderr += chunk) },
        output: () => ({ stdout, stderr }),
    };
}

function backendProbe() {
    const calls = { prepare: 0, run: 0, dispose: 0 };
    return {
        calls,
        backend: {
            async prepare() {
                calls.prepare += 1;
                return {
                    sessionId: 'session-early-cancel',
                    resumed: false,
                    model: { id: 'model-test', displayName: 'Model Test' },
                    attachments: [],
                };
            },
            async *run() {
                calls.run += 1;
                yield { kind: 'complete', usage: null, turns: 1 };
            },
            async dispose() {
                calls.dispose += 1;
            },
        },
    };
}

function runOptions({ stdin, signalSource, backend, attachmentPreflight }) {
    const io = streams();
    return {
        io,
        options: {
            argv: ['-p', 'early cancellation', '--output-format', 'stream-json'],
            stdin,
            stdout: io.stdout,
            stderr: io.stderr,
            backend,
            signalSource,
            attachmentPreflight,
            ids: {
                requestId: () => 'request-early-cancel',
                messageId: () => 'message-early-cancel',
            },
        },
    };
}

test('SIGINT observed while stdin is being read prevents backend preparation', async () => {
    const signalSource = new EventEmitter();
    const probe = backendProbe();
    let iteratorReturned = false;
    const stdin = {
        isTTY: false,
        [Symbol.asyncIterator]() {
            return {
                async next() {
                    signalSource.emit('SIGINT');
                    return new Promise(() => {});
                },
                async return() {
                    iteratorReturned = true;
                    return { done: true };
                },
            };
        },
    };
    const { io, options } = runOptions({
        stdin,
        signalSource,
        backend: probe.backend,
    });

    const exitCode = await runCli(options);

    assert.equal(exitCode, 130, io.output().stderr || io.output().stdout);
    assert.equal(probe.calls.prepare, 0);
    assert.equal(probe.calls.run, 0);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(iteratorReturned, true);
});

test('SIGINT destroys a real blocked Node stdin Readable', async () => {
    const signalSource = new EventEmitter();
    const probe = backendProbe();
    const stdin = new PassThrough();
    stdin.isTTY = false;
    const { io, options } = runOptions({
        stdin,
        signalSource,
        backend: probe.backend,
    });
    setImmediate(() => signalSource.emit('SIGINT'));

    const exitCode = await runCli(options);

    assert.equal(exitCode, 130, io.output().stderr || io.output().stdout);
    assert.equal(stdin.destroyed, true);
    assert.equal(probe.calls.prepare, 0);
});

test('SIGINT wins over an Attachment preflight error observed afterward', async () => {
    const signalSource = new EventEmitter();
    const probe = backendProbe();
    const { io, options } = runOptions({
        stdin: { isTTY: true },
        signalSource,
        backend: probe.backend,
        attachmentPreflight: async () => {
            signalSource.emit('SIGINT');
            throw new Error('late preflight error');
        },
    });

    const exitCode = await runCli(options);

    assert.equal(exitCode, 130, io.output().stderr || io.output().stdout);
    assert.equal(probe.calls.prepare, 0);
    assert.doesNotMatch(io.output().stdout, /INTERNAL_ERROR/u);
});

test('SIGINT observed during Attachment preflight prevents backend preparation', async () => {
    const signalSource = new EventEmitter();
    const probe = backendProbe();
    const { io, options } = runOptions({
        stdin: { isTTY: true },
        signalSource,
        backend: probe.backend,
        attachmentPreflight: async () => {
            signalSource.emit('SIGINT');
            return { attachments: [], additionalDirectories: [] };
        },
    });

    const exitCode = await runCli(options);

    assert.equal(exitCode, 130, io.output().stderr || io.output().stdout);
    assert.equal(probe.calls.prepare, 0);
    assert.equal(probe.calls.run, 0);
});

test('SIGINT observed during backend preparation prevents renderer start and run', async () => {
    const signalSource = new EventEmitter();
    const probe = backendProbe();
    const originalPrepare = probe.backend.prepare;
    probe.backend.prepare = async (...args) => {
        const prepared = await originalPrepare(...args);
        signalSource.emit('SIGINT');
        return prepared;
    };
    const { io, options } = runOptions({
        stdin: { isTTY: true },
        signalSource,
        backend: probe.backend,
    });

    const exitCode = await runCli(options);

    assert.equal(exitCode, 130, io.output().stderr || io.output().stdout);
    assert.equal(probe.calls.prepare, 1);
    assert.equal(probe.calls.run, 0);
    assert.equal(probe.calls.dispose, 1);
});

test('SIGINT wins over a backend preparation error observed afterward', async () => {
    const signalSource = new EventEmitter();
    const probe = backendProbe();
    probe.backend.prepare = async () => {
        probe.calls.prepare += 1;
        signalSource.emit('SIGINT');
        throw new Error('late prepare error');
    };
    const { io, options } = runOptions({
        stdin: { isTTY: true },
        signalSource,
        backend: probe.backend,
    });

    const exitCode = await runCli(options);

    assert.equal(exitCode, 130, io.output().stderr || io.output().stdout);
    assert.equal(probe.calls.run, 0);
    assert.doesNotMatch(io.output().stdout, /INTERNAL_ERROR/u);
});
