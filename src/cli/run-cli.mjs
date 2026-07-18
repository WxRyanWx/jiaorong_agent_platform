import { CliFailure } from './failures.mjs';
import { createOutputRenderer } from './output-renderer.mjs';
import { detectOutputFormat, parseArgs } from './parse-args.mjs';

const VERSION = '0.1.0';

async function readStdin(stdin) {
    if (stdin.isTTY) return '';
    const chunks = [];
    for await (const chunk of stdin) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString('utf8');
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

    const renderer = createOutputRenderer(options.outputFormat, {
        stdout,
        stderr,
    });
    const startedAt = now();
    const requestId = ids.requestId();
    const stdinPrompt = await readStdin(stdin);
    let prompt = options.prompt;
    if (prompt !== undefined && stdinPrompt.length > 0) {
        const failure = new CliFailure(
            'INVALID_ARGUMENT',
            'Prompt argv and non-empty stdin are mutually exclusive.',
            42,
        );
        return emitFailure({
            renderer,
            options,
            requestId,
            prepared: null,
            content: '',
            startedAt,
            now,
            failure,
        });
    }
    prompt ??= stdinPrompt;
    if (prompt.length === 0) {
        const failure = new CliFailure(
            'INVALID_ARGUMENT',
            'Prompt must not be empty.',
            42,
        );
        return emitFailure({
            renderer,
            options,
            requestId,
            prepared: null,
            content: '',
            startedAt,
            now,
            failure,
        });
    }

    const request = { ...options, prompt, requestId, cwd: process.cwd() };
    let prepared;
    try {
        prepared = await backend.prepare(request);
    } catch (error) {
        const failure = normalizeFailure(error);
        return emitFailure({
            renderer,
            options,
            requestId,
            prepared: null,
            content: '',
            startedAt,
            now,
            failure,
        });
    }

    const state = { ...prepared, turns: 0 };
    renderer.start(initEvent(requestId, options, prepared));
    let content = '';
    let usage = null;
    let turns = 0;
    try {
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
            } else if (event.kind === 'complete') {
                usage = event.usage ?? null;
                turns = event.turns;
                state.turns = turns;
            }
        }
    } catch (error) {
        const failure = normalizeFailure(error);
        return emitFailure({
            renderer,
            options,
            requestId,
            prepared: state,
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
