import { mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { BackendFailure } from '../cli/failures.mjs';

const FIXTURE_SESSION_ID = 'ses_fixture';

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
                    throw new BackendFailure(
                        'TURN_LIMIT',
                        'The run reached its turn limit.',
                        53,
                    );
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
