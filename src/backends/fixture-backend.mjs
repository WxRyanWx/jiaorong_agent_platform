import { BackendFailure } from '../cli/failures.mjs';

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
            return {
                sessionId: 'ses_fixture',
                resumed: Boolean(request.resume),
                model: {
                    id: 'jiaorong-fixture',
                    displayName: modelDisplayName,
                },
                attachments: [],
            };
        },

        async *run(_prepared, request) {
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
                const content =
                    request.prompt === '__JIAORONG_FIXTURE_SUCCESS_TEXT__'
                        ? 'Hello, fixture.'
                        : `echo:${request.prompt}`;
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
        },
    };
}
