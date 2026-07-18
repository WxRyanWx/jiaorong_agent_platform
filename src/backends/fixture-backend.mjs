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

export function createFixtureBackend() {
    return {
        async prepare(request) {
            const failure = preflightFailures.get(request.prompt);
            if (failure) throw failure;
            return {
                sessionId: 'ses_fixture',
                resumed: Boolean(request.resume),
                model: {
                    id: 'jiaorong-fixture',
                    displayName: 'Jiaorong Fixture',
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
            const content =
                request.prompt === '__JIAORONG_FIXTURE_SUCCESS_TEXT__'
                    ? 'Hello, fixture.'
                    : `echo:${request.prompt}`;
            yield { kind: 'message', messageId: 'msg_fixture', delta: content };
            yield {
                kind: 'complete',
                usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
                turns: 1,
            };
        },
    };
}
