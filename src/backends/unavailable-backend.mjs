import { BackendFailure } from '../cli/failures.mjs';

export function createUnavailableBackend() {
    return {
        async prepare() {
            throw new BackendFailure(
                'INTERNAL_ERROR',
                'The real Jiaorong backend adapter is not configured in this build.',
            );
        },
        async *run() {},
    };
}
