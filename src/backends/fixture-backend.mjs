import { mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { BackendFailure } from '../cli/failures.mjs';

const FIXTURE_SESSION_ID = 'ses_fixture';

function fixtureToolUse(toolCallId, name, input) {
    return { kind: 'tool_use', toolCallId, name, input };
}

function fixtureToolSuccess(toolCallId, content, truncated = false) {
    return {
        kind: 'tool_result',
        toolCallId,
        status: 'success',
        output: { content, truncated },
        error: null,
    };
}

function fixtureToolFailure(toolCallId, code, message) {
    return {
        kind: 'tool_result',
        toolCallId,
        status: 'failed',
        output: null,
        error: { code, message },
    };
}

function waitForAbort(signal) {
    if (signal?.aborted) return Promise.reject(signal.reason);
    return new Promise((resolvePromise, rejectPromise) => {
        const keepAlive = setInterval(() => {}, 1_000);
        signal?.addEventListener('abort', () => {
            clearInterval(keepAlive);
            rejectPromise(signal.reason);
        }, { once: true });
    });
}

const preflightFailures = new Map([
    [
        '__JIAORONG_FIXTURE_AUTH_REQUIRED__',
        new BackendFailure(
            'AUTH_REQUIRED',
            'Sign in with jiaorong-cli auth login.',
        ),
    ],
    [
        '__JIAORONG_FIXTURE_MODEL_UNAVAILABLE__',
        new BackendFailure(
            'MODEL_UNAVAILABLE',
            'The selected model is unavailable.',
        ),
    ],
]);

export function createFixtureBackend({
    modelDisplayName = 'Jiaorong Fixture',
    stateDirectory,
} = {}) {
    return {
        async doctor() {
            return {
                ok: true,
                cliVersion: '0.1.0',
                protocolVersions: [1],
                app: {
                    version: '0.5.6',
                    endpoint: '127.0.0.1:9238',
                },
                models: { available: 1 },
                checks: [
                    { name: 'app-installation', status: 'pass' },
                    { name: 'app-version', status: 'pass' },
                    { name: 'bridge-contract', status: 'pass' },
                    { name: 'models', status: 'pass' },
                    {
                        name: 'authentication',
                        status: 'warn',
                        message:
                            'Provider authentication is verified only when a run starts.',
                    },
                ],
            };
        },

        async listModels() {
            return {
                schemaVersion: 1,
                models: [
                    {
                        id: 'jiaorong-fixture',
                        displayName: modelDisplayName,
                        isDefault: true,
                        available: true,
                        inputTypes: ['text', 'image'],
                    },
                    {
                        id: 'jiaorong-fixture-unavailable',
                        displayName: 'Unavailable Fixture Model',
                        isDefault: false,
                        available: false,
                        inputTypes: ['text'],
                    },
                ],
            };
        },

        async prepare(request) {
            if (request.prompt === '__JIAORONG_FIXTURE_INTERNAL_ERROR__') {
                throw new Error(
                    'fixture-secret-token=must-not-escape\n    at privateFixtureStack',
                );
            }
            if (
                request.prompt.startsWith('__JIAORONG_FIXTURE_ERROR_CODE__:')
            ) {
                const code = request.prompt.slice(
                    '__JIAORONG_FIXTURE_ERROR_CODE__:'.length,
                );
                const exitCodes = new Map([
                    ['AUTH_REQUIRED', 1],
                    ['INVALID_ARGUMENT', 42],
                    ['UNSUPPORTED_PROTOCOL', 42],
                    ['MODEL_UNAVAILABLE', 1],
                    ['PERMISSION_DENIED', 1],
                    ['TOOL_FAILED', 1],
                    ['UNSUPPORTED_ATTACHMENT', 42],
                    ['TIMEOUT', 1],
                    ['TURN_LIMIT', 53],
                    ['CANCELLED', 130],
                    ['INTERNAL_ERROR', 1],
                ]);
                if (exitCodes.has(code))
                    throw new BackendFailure(
                        code,
                        `Stable code ${code}; display text is not an identifier.`,
                        exitCodes.get(code),
                    );
            }
            const failure = preflightFailures.get(request.prompt);
            if (failure) throw failure;
            if (
                request.modelId !== undefined &&
                request.modelId !== 'jiaorong-fixture'
            )
                throw new BackendFailure(
                    'MODEL_UNAVAILABLE',
                    'The selected model is unavailable.',
                );
            let sessionState;
            if (stateDirectory) {
                await mkdir(stateDirectory, { recursive: true });
                const statePath = resolve(
                    stateDirectory,
                    `${FIXTURE_SESSION_ID}.json`,
                );
                if (request.resume) {
                    if (request.resume !== FIXTURE_SESSION_ID)
                        throw new BackendFailure(
                            'INVALID_ARGUMENT',
                            'The JiaorongAI Session does not exist.',
                            42,
                        );
                    try {
                        sessionState = JSON.parse(
                            await readFile(statePath, 'utf8'),
                        );
                    } catch (error) {
                        if (error?.code === 'ENOENT')
                            throw new BackendFailure(
                                'INVALID_ARGUMENT',
                                'The JiaorongAI Session does not exist.',
                                42,
                            );
                        throw error;
                    }
                    if (
                        !sessionState ||
                        !Array.isArray(sessionState.prompts) ||
                        !sessionState.prompts.every(
                            (value) => typeof value === 'string',
                        )
                    )
                        throw new BackendFailure(
                            'INTERNAL_ERROR',
                            'The fixture Session state is invalid.',
                        );
                } else {
                    sessionState = { prompts: [] };
                    await writeFile(
                        statePath,
                        `${JSON.stringify(sessionState)}\n`,
                        'utf8',
                    );
                }
            }
            return {
                sessionId: FIXTURE_SESSION_ID,
                resumed: Boolean(request.resume),
                model: {
                    id: 'jiaorong-fixture',
                    displayName: modelDisplayName,
                },
                attachments: request.fileScope.attachments.map(
                    ({ id, name, mimeType, sizeBytes }) => ({
                        id,
                        name,
                        mimeType,
                        sizeBytes,
                    }),
                ),
                ...(stateDirectory
                    ? { stateDirectory, sessionState }
                    : {}),
            };
        },

        async *run(prepared, request) {
            let lock;
            let lockPath;
            if (prepared.stateDirectory) {
                lockPath = resolve(
                    prepared.stateDirectory,
                    `${FIXTURE_SESSION_ID}.lock`,
                );
                try {
                    lock = await open(lockPath, 'wx');
                } catch (error) {
                    if (error?.code === 'EEXIST')
                        throw new BackendFailure(
                            'INVALID_ARGUMENT',
                            'The JiaorongAI Session already has an active run.',
                            42,
                        );
                    throw error;
                }
            }
            try {
                if (
                    request.prompt ===
                        '__JIAORONG_FIXTURE_CONCURRENT_A__' ||
                    request.prompt === '__JIAORONG_FIXTURE_CONCURRENT_B__'
                )
                    await new Promise((resolveDelay) =>
                        setTimeout(resolveDelay, 150),
                    );
                if (request.prompt === '__JIAORONG_FIXTURE_TIMEOUT__') {
                    throw new BackendFailure('TIMEOUT', 'The run timed out.');
                }
                if (request.prompt === '__JIAORONG_FIXTURE_TURN_LIMIT__') {
                    yield {
                        kind: 'message',
                        messageId: 'msg_fixture',
                        delta: 'two turns completed',
                    };
                    yield { kind: 'complete', usage: null, turns: 2 };
                    return;
                }
                if (
                    request.prompt === '__JIAORONG_FIXTURE_CANCEL_MODEL__' ||
                    request.prompt === '__JIAORONG_FIXTURE_CANCEL_MULTI__' ||
                    request.prompt === '__JIAORONG_FIXTURE_CANCEL_RACE__'
                ) {
                    yield {
                        kind: 'message',
                        messageId: 'msg_fixture',
                        delta: 'stream-started',
                    };
                    await waitForAbort(request.signal);
                }
                if (request.prompt === '__JIAORONG_FIXTURE_CANCEL_TOOL__') {
                    yield fixtureToolUse('tool-active', 'read_file', {
                        path: 'tool-cancel-canary.txt',
                    });
                    try {
                        await waitForAbort(request.signal);
                    } catch (error) {
                        yield {
                            kind: 'tool_result',
                            toolCallId: 'tool-active',
                            status: 'cancelled',
                            output: null,
                            error: {
                                code: 'CANCELLED',
                                message: 'The tool request was cancelled.',
                            },
                        };
                        throw error;
                    }
                }
                if (
                    request.prompt === '__JIAORONG_FIXTURE_CANCEL_EDIT_BEFORE__'
                ) {
                    yield fixtureToolUse('tool-edit-before', 'edit_file', {
                        path: 'cancel-edit-before.txt',
                    });
                    try {
                        await waitForAbort(request.signal);
                    } catch (error) {
                        yield {
                            kind: 'tool_result',
                            toolCallId: 'tool-edit-before',
                            status: 'cancelled',
                            output: null,
                            error: {
                                code: 'CANCELLED',
                                message: 'The edit was cancelled before it started.',
                            },
                        };
                        throw error;
                    }
                }
                if (
                    request.prompt === '__JIAORONG_FIXTURE_CANCEL_EDIT_AFTER__'
                ) {
                    const path = resolve(request.cwd, 'cancel-edit-after.txt');
                    yield fixtureToolUse('tool-edit-after', 'edit_file', {
                        path: 'cancel-edit-after.txt',
                    });
                    await writeFile(path, 'committed-before-cancel', 'utf8');
                    yield fixtureToolSuccess(
                        'tool-edit-after',
                        'committed-before-cancel',
                    );
                    await waitForAbort(request.signal);
                }
                if (request.prompt === '__JIAORONG_FIXTURE_CANCEL_HANG__') {
                    yield {
                        kind: 'message',
                        messageId: 'msg_fixture',
                        delta: 'will-not-settle',
                    };
                    await new Promise(() => setInterval(() => {}, 1_000));
                }
                if (request.prompt === '__JIAORONG_FIXTURE_REASONING__') {
                    yield {
                        kind: 'reasoning_summary',
                        messageId: 'msg_fixture',
                        delta: 'Step 1.',
                    };
                    yield {
                        kind: 'reasoning_summary',
                        messageId: 'msg_fixture',
                        delta: 'Step 2.',
                    };
                    yield {
                        kind: 'message',
                        messageId: 'msg_fixture',
                        delta: 'Done.',
                    };
                } else if (
                    request.prompt === '__JIAORONG_FIXTURE_FRAGMENTED__'
                ) {
                    yield {
                        kind: 'message',
                        messageId: 'msg_fixture',
                        delta: 'fragment-',
                    };
                    yield {
                        kind: 'message',
                        messageId: 'msg_fixture',
                        delta: 'success',
                    };
                } else if (
                    request.prompt === '__JIAORONG_FIXTURE_TOOL_READ__'
                ) {
                    const path = resolve(request.cwd, 'tool-read-canary.txt');
                    yield fixtureToolUse('tool-read', 'read_file', {
                        path: 'tool-read-canary.txt',
                    });
                    const content = await readFile(path, 'utf8');
                    yield fixtureToolSuccess('tool-read', content);
                    yield {
                        kind: 'message',
                        messageId: 'msg_fixture',
                        delta: content,
                    };
                } else if (
                    request.prompt === '__JIAORONG_FIXTURE_TOOL_SEARCH__'
                ) {
                    const path = resolve(request.cwd, 'tool-search-canary.txt');
                    yield fixtureToolUse('tool-search', 'search', {
                        query: 'SEARCH_CANARY',
                        path: '.',
                    });
                    const content = await readFile(path, 'utf8');
                    const found = content.includes('SEARCH_CANARY');
                    yield fixtureToolSuccess('tool-search', {
                        path: 'tool-search-canary.txt',
                        found,
                    });
                    yield {
                        kind: 'message',
                        messageId: 'msg_fixture',
                        delta: `search:${found}`,
                    };
                } else if (
                    request.prompt === '__JIAORONG_FIXTURE_PERMISSION_DENIED__'
                ) {
                    yield fixtureToolUse('tool-denied', 'edit_file', {
                        path: 'must-not-exist.txt',
                    });
                    yield fixtureToolFailure(
                        'tool-denied',
                        'PERMISSION_DENIED',
                        'The tool request was denied by the headless permission policy.',
                    );
                    yield {
                        kind: 'message',
                        messageId: 'msg_fixture',
                        delta: 'Recovered safely.',
                    };
                } else if (
                    request.prompt === '__JIAORONG_FIXTURE_TOOL_EDIT__'
                ) {
                    const path = resolve(request.cwd, 'tool-edit-canary.txt');
                    yield fixtureToolUse('tool-edit-create', 'edit_file', {
                        path: 'tool-edit-canary.txt',
                        operation: 'create',
                    });
                    await writeFile(path, 'created', 'utf8');
                    yield fixtureToolSuccess('tool-edit-create', 'created');
                    yield fixtureToolUse('tool-edit-update', 'edit_file', {
                        path: 'tool-edit-canary.txt',
                        operation: 'update',
                    });
                    await writeFile(path, 'updated', 'utf8');
                    yield fixtureToolSuccess('tool-edit-update', 'updated');
                    yield fixtureToolUse('tool-edit-delete', 'edit_file', {
                        path: 'tool-edit-canary.txt',
                        operation: 'delete',
                    });
                    await unlink(path);
                    yield fixtureToolSuccess('tool-edit-delete', 'deleted');
                    yield {
                        kind: 'message',
                        messageId: 'msg_fixture',
                        delta: 'edit:create-update-delete',
                    };
                } else if (
                    request.prompt === '__JIAORONG_FIXTURE_TOOL_SHELL__'
                ) {
                    yield {
                        kind: 'message',
                        messageId: 'msg_fixture',
                        delta: 'SHELL_DISABLED',
                    };
                } else if (
                    request.prompt === '__JIAORONG_FIXTURE_TOOL_LARGE__'
                ) {
                    yield fixtureToolUse('tool-large', 'read_file', {
                        path: 'large.txt',
                    });
                    yield fixtureToolSuccess(
                        'tool-large',
                        'x'.repeat(16 * 1_024),
                        true,
                    );
                    yield {
                        kind: 'message',
                        messageId: 'msg_fixture',
                        delta: 'large:truncated',
                    };
                } else if (
                    request.prompt === '__JIAORONG_FIXTURE_TOOL_ALL__'
                ) {
                    for (const [id, name, input] of [
                        ['tool-all-read', 'read_file', { path: 'README.md' }],
                        ['tool-all-search', 'search', { query: 'canary' }],
                        ['tool-all-edit', 'edit_file', { path: 'safe.txt' }],
                    ]) {
                        yield fixtureToolUse(id, name, input);
                        yield fixtureToolSuccess(id, `${name}:ok`);
                    }
                    yield fixtureToolUse('tool-all-outside', 'read_file', {
                        path: '../outside.txt',
                    });
                    yield fixtureToolFailure(
                        'tool-all-outside',
                        'PERMISSION_DENIED',
                        'The file is outside the authorized directories.',
                    );
                    yield {
                        kind: 'message',
                        messageId: 'msg_fixture',
                        delta: 'all-tools:success',
                    };
                } else {
                    let content;
                    if (
                        request.prompt ===
                        '__JIAORONG_FIXTURE_RESUME_CONTEXT__'
                    ) {
                        content = `context:${prepared.sessionState?.prompts.join(' > ') ?? ''}`;
                    } else if (
                        request.prompt ===
                        '__JIAORONG_FIXTURE_ATTACHMENTS__'
                    ) {
                        const sources = await Promise.all(
                            request.fileScope.attachments.map((attachment) =>
                                readFile(attachment.path),
                            ),
                        );
                        const textCanaryVisible = sources.some((source) =>
                            source
                                .toString('utf8')
                                .includes('CONFORMANCE_ATTACHMENT_CANARY'),
                        );
                        content = `attachments:${prepared.attachments
                            .map(({ name, mimeType }) => `${name}:${mimeType}`)
                            .join(',')};text-canary:${textCanaryVisible}`;
                    } else {
                        content =
                            request.prompt ===
                            '__JIAORONG_FIXTURE_SUCCESS_TEXT__'
                                ? 'Hello, fixture.'
                                : `echo:${request.prompt}`;
                    }
                    yield {
                        kind: 'message',
                        messageId: 'msg_fixture',
                        delta: content,
                    };
                }
                yield {
                    kind: 'complete',
                    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
                    turns: 1,
                };
                if (prepared.stateDirectory) {
                    const nextState = {
                        prompts: [
                            ...prepared.sessionState.prompts,
                            request.prompt,
                        ],
                    };
                    await writeFile(
                        resolve(
                            prepared.stateDirectory,
                            `${FIXTURE_SESSION_ID}.json`,
                        ),
                        `${JSON.stringify(nextState)}\n`,
                        'utf8',
                    );
                }
            } finally {
                if (lock) {
                    await lock.close();
                    await unlink(lockPath).catch(() => {});
                }
            }
        },
    };
}
