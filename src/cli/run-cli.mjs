import { CliFailure } from './failures.mjs';
import { MAX_PROMPT_BYTES } from './limits.mjs';
import { createOutputRenderer } from './output-renderer.mjs';
import { detectOutputFormat, parseArgs } from './parse-args.mjs';
import {
    cleanupAttachmentSnapshots,
    preflightAttachments,
} from '../files/attachment-preflight.mjs';

const VERSION = '0.1.0';

function throwIfAborted(signal) {
    if (signal.aborted) throw signal.reason;
}

async function readStdin(stdin, signal) {
    if (stdin.isTTY) return '';
    const chunks = [];
    let bytes = 0;
    const iterator = stdin[Symbol.asyncIterator]();
    try {
        while (true) {
            throwIfAborted(signal);
            let abortListener;
            const aborted = new Promise((_, reject) => {
                abortListener = () => reject(signal.reason);
                signal.addEventListener('abort', abortListener, { once: true });
            });
            let item;
            try {
                item = await Promise.race([iterator.next(), aborted]);
            } finally {
                signal.removeEventListener('abort', abortListener);
            }
            if (item.done) break;
            const buffer = Buffer.from(item.value);
            bytes += buffer.byteLength;
            if (bytes > MAX_PROMPT_BYTES) throw promptTooLargeFailure();
            chunks.push(buffer);
        }
    } catch (error) {
        if (signal.aborted) {
            if (typeof stdin.destroy === 'function' && stdin.destroyed !== true) {
                try {
                    stdin.destroy();
                } catch {}
            }
            if (typeof iterator.return === 'function') {
                try {
                    void Promise.resolve(iterator.return()).catch(
                        () => undefined,
                    );
                } catch {}
            }
        }
        throw error;
    }
    return Buffer.concat(chunks).toString('utf8');
}

function promptTooLargeFailure() {
    return new CliFailure(
        'INVALID_ARGUMENT',
        'Prompt exceeds the 128 KiB UTF-8 limit.',
        42,
    );
}

function assertPromptSize(prompt) {
    if (Buffer.byteLength(prompt, 'utf8') > MAX_PROMPT_BYTES)
        throw promptTooLargeFailure();
}

function initEvent(requestId, options, prepared = null) {
    return {
        type: 'init',
        protocolVersion: 1,
        requestId,
        sessionId: prepared?.sessionId ?? null,
        resumed: prepared?.resumed ?? Boolean(options.resume),
        model: prepared?.model ?? null,
        permissionMode: options.permissionMode ?? null,
        attachments: prepared?.attachments ?? [],
    };
}

function resultEvent({
    requestId,
    sessionId,
    status,
    content,
    usage,
    turns,
    durationMs,
    error,
}) {
    return {
        type: 'result',
        requestId,
        sessionId,
        status,
        content,
        usage,
        turns,
        durationMs,
        error,
    };
}

function jsonResult({
    requestId,
    sessionId,
    status,
    content,
    model,
    usage,
    turns,
    durationMs,
    error,
}) {
    return {
        protocolVersion: 1,
        requestId,
        sessionId,
        status,
        content,
        model,
        usage,
        turns,
        durationMs,
        error,
    };
}

function normalizeFailure(error) {
    if (error instanceof CliFailure) return error;
    return new CliFailure(
        'INTERNAL_ERROR',
        'The Headless Run failed internally.',
        1,
    );
}

async function cleanupSnapshots(fileScope) {
    try {
        await cleanupAttachmentSnapshots(fileScope);
        return null;
    } catch {
        return new CliFailure(
            'INTERNAL_ERROR',
            'Attachment snapshot cleanup failed.',
            1,
        );
    }
}

function emitFailure({
    renderer,
    options,
    requestId,
    prepared,
    content,
    startedAt,
    now,
    failure,
}) {
    const error = { code: failure.code, message: failure.message };
    const durationMs = Math.max(0, now() - startedAt);
    const sessionId = prepared?.sessionId ?? null;
    const result = resultEvent({
        requestId,
        sessionId,
        status: failure.code === 'CANCELLED' ? 'cancelled' : 'failed',
        content,
        usage: null,
        turns: prepared?.turns ?? 0,
        durationMs,
        error,
    });
    const json = jsonResult({
        requestId,
        sessionId,
        status: failure.code === 'CANCELLED' ? 'cancelled' : 'failed',
        content,
        model: prepared?.model ?? null,
        usage: null,
        turns: prepared?.turns ?? 0,
        durationMs,
        error,
    });
    renderer.failure({
        init: initEvent(requestId, options, prepared),
        error: { type: 'error', ...error, recoverable: false, details: null },
        result,
        json,
        humanError: `${failure.code}: ${failure.message}`,
    });
    return failure.exitCode;
}

export async function runCli({
    argv,
    stdin,
    stdout,
    stderr,
    backend,
    ids = {
        requestId: () => `req_${crypto.randomUUID()}`,
        messageId: () => `msg_${crypto.randomUUID()}`,
    },
    now = () => Date.now(),
    signalSource = process,
    forceExit = (code) => process.exit(code),
    attachmentPreflight = preflightAttachments,
}) {
    let options;
    const detectedOutputFormat = detectOutputFormat(argv);
    try {
        options = parseArgs(argv);
    } catch (error) {
        const failure = normalizeFailure(error);
        if (
            detectedOutputFormat === 'json' ||
            detectedOutputFormat === 'stream-json'
        ) {
            options = {
                outputFormat: detectedOutputFormat,
                permissionMode: null,
                resume: undefined,
            };
            const renderer = createOutputRenderer(options.outputFormat, {
                stdout,
                stderr,
            });
            const startedAt = now();
            return emitFailure({
                renderer,
                options,
                requestId: ids.requestId(),
                prepared: null,
                content: '',
                startedAt,
                now,
                failure,
            });
        }
        stderr.write(
            `${failure.message}\nUsage: jiaorong-cli [-p <prompt>] [--output-format text|json|stream-json]\n`,
        );
        return failure.exitCode;
    }

    if (options.command === 'version') {
        stdout.write(`${VERSION}\n`);
        return 0;
    }

    if (options.command === 'doctor') {
        const document = await backend.doctor();
        if (options.outputFormat === 'json') {
            stdout.write(`${JSON.stringify(document)}\n`);
        } else {
            stdout.write(
                `JiaorongAI readiness: ${document.ok ? 'ready' : 'not ready'}\n`,
            );
            for (const check of document.checks) {
                const detail = check.message ? `: ${check.message}` : '';
                stdout.write(
                    `${check.status.toUpperCase()} ${check.name}${detail}\n`,
                );
            }
        }
        return document.ok ? 0 : 1;
    }

    if (options.command === 'models-list') {
        try {
            const document = await backend.listModels();
            if (options.outputFormat === 'json') {
                stdout.write(`${JSON.stringify(document)}\n`);
            } else {
                for (const model of document.models) {
                    stdout.write(
                        `${model.id}\t${model.displayName}\t${model.available ? 'available' : 'unavailable'}\n`,
                    );
                }
            }
            return 0;
        } catch (error) {
            const failure = normalizeFailure(error);
            stderr.write(`${failure.code}: ${failure.message}\n`);
            return failure.exitCode;
        }
    }

    const renderer = createOutputRenderer(options.outputFormat, {
        stdout,
        stderr,
    });
    const startedAt = now();
    const requestId = ids.requestId();
    const abortController = new AbortController();
    let sigintCount = 0;
    const handleSigint = () => {
        sigintCount += 1;
        if (sigintCount > 1) {
            forceExit(130);
            return;
        }
        abortController.abort(
            new CliFailure('CANCELLED', 'The run was cancelled.', 130),
        );
    };
    const finishEarly = (exitCode) => {
        signalSource.removeListener('SIGINT', handleSigint);
        return exitCode;
    };
    signalSource.on('SIGINT', handleSigint);
    let stdinPrompt;
    try {
        stdinPrompt = await readStdin(stdin, abortController.signal);
        throwIfAborted(abortController.signal);
        if (options.prompt !== undefined) assertPromptSize(options.prompt);
    } catch (error) {
        return finishEarly(emitFailure({
            renderer,
            options,
            requestId,
            prepared: null,
            content: '',
            startedAt,
            now,
            failure: normalizeFailure(error),
        }));
    }
    let prompt = options.prompt;
    if (prompt !== undefined && stdinPrompt.length > 0) {
        const failure = new CliFailure(
            'INVALID_ARGUMENT',
            'Prompt argv and non-empty stdin are mutually exclusive.',
            42,
        );
        return finishEarly(emitFailure({
            renderer,
            options,
            requestId,
            prepared: null,
            content: '',
            startedAt,
            now,
            failure,
        }));
    }
    prompt ??= stdinPrompt;
    if (prompt.length === 0) {
        const failure = new CliFailure(
            'INVALID_ARGUMENT',
            'Prompt must not be empty.',
            42,
        );
        return finishEarly(emitFailure({
            renderer,
            options,
            requestId,
            prepared: null,
            content: '',
            startedAt,
            now,
            failure,
        }));
    }

    const request = { ...options, prompt, requestId, cwd: process.cwd() };
    request.signal = abortController.signal;
    let prepared;
    let state;
    let content = '';
    let usage = null;
    let turns = 0;
    let failure = null;
    let timeoutTimer;
    let runStarted = false;
    try {
        request.fileScope = await attachmentPreflight({
            cwd: request.cwd,
            files: request.files,
            additionalDirectories: request.additionalDirectories,
        });
        throwIfAborted(abortController.signal);
        prepared = await backend.prepare(request);
        throwIfAborted(abortController.signal);
        state = { ...prepared, turns: 0 };
        renderer.start(initEvent(requestId, options, prepared));
        if (options.timeoutSeconds !== undefined) {
            timeoutTimer = setTimeout(
                () =>
                    abortController.abort(
                        new CliFailure('TIMEOUT', 'The run timed out.', 1),
                    ),
                options.timeoutSeconds * 1_000,
            );
        }
        runStarted = true;
        for await (const event of backend.run(prepared, request)) {
            if (event.kind === 'message') {
                content += event.delta;
                renderer.event({
                    type: 'message',
                    messageId: event.messageId ?? ids.messageId(),
                    role: 'assistant',
                    delta: event.delta,
                });
            } else if (event.kind === 'reasoning_summary') {
                renderer.event({
                    type: 'reasoning_summary',
                    messageId: event.messageId ?? ids.messageId(),
                    delta: event.delta,
                });
            } else if (event.kind === 'tool_use') {
                renderer.event({
                    type: 'tool_use',
                    toolCallId: event.toolCallId,
                    name: event.name,
                    input: event.input,
                });
            } else if (event.kind === 'tool_result') {
                renderer.event({
                    type: 'tool_result',
                    toolCallId: event.toolCallId,
                    status: event.status,
                    output: event.output,
                    error: event.error,
                });
            } else if (event.kind === 'complete') {
                usage = event.usage ?? null;
                turns = event.turns;
                state.turns = turns;
                if (
                    options.maxTurns !== undefined &&
                    turns > options.maxTurns
                ) {
                    throw new CliFailure(
                        'TURN_LIMIT',
                        'The run reached its turn limit.',
                        53,
                    );
                }
            }
        }
    } catch (error) {
        failure = normalizeFailure(
            !runStarted && abortController.signal.aborted
                ? abortController.signal.reason
                : error,
        );
    } finally {
        clearTimeout(timeoutTimer);
        signalSource.removeListener('SIGINT', handleSigint);
        let lifecycleFailure = null;
        if (prepared && typeof backend.dispose === 'function') {
            try {
                await backend.dispose(prepared);
            } catch (error) {
                lifecycleFailure = normalizeFailure(error);
            }
        }
        const snapshotFailure = await cleanupSnapshots(request.fileScope);
        lifecycleFailure ??= snapshotFailure;
        failure = lifecycleFailure ?? failure;
    }

    if (failure) {
        return emitFailure({
            renderer,
            options,
            requestId,
            prepared: state ?? null,
            content,
            startedAt,
            now,
            failure,
        });
    }

    const durationMs = Math.max(0, now() - startedAt);
    renderer.success({
        content,
        result: resultEvent({
            requestId,
            sessionId: prepared.sessionId,
            status: 'success',
            content,
            usage,
            turns,
            durationMs,
            error: null,
        }),
        json: jsonResult({
            requestId,
            sessionId: prepared.sessionId,
            status: 'success',
            content,
            model: prepared.model,
            usage,
            turns,
            durationMs,
            error: null,
        }),
    });
    return 0;
}
