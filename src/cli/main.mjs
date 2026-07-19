import { createJiaorongAppBackend } from '../backends/jiaorong-app-backend.mjs';
import { runCli } from './run-cli.mjs';

export function runMain({
    argv = process.argv.slice(2),
    stdin = process.stdin,
    stdout = process.stdout,
    stderr = process.stderr,
    runtimeOptions,
} = {}) {
    return runCli({
        argv,
        stdin,
        stdout,
        stderr,
        backend: createJiaorongAppBackend({ runtimeOptions }),
    });
}
