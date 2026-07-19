import { spawn } from 'node:child_process';

export function runProcess(
    binary,
    args,
    { cwd, env, stdin = '', timeoutMs = 5_000 } = {},
) {
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const child = spawn(binary, args, {
            shell: false,
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
            cwd,
            env: env === undefined ? undefined : { ...process.env, ...env },
        });
        const stdout = [];
        const stderr = [];
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill('SIGKILL');
        }, timeoutMs);

        child.stdout.on('data', (chunk) => stdout.push(chunk));
        child.stderr.on('data', (chunk) => stderr.push(chunk));
        child.on('error', (error) => {
            clearTimeout(timer);
            reject(error);
        });
        child.on('close', (exitCode, signal) => {
            clearTimeout(timer);
            resolve({
                exitCode,
                signal,
                timedOut,
                durationMs: Date.now() - startedAt,
                stdout: Buffer.concat(stdout).toString('utf8'),
                stderr: Buffer.concat(stderr).toString('utf8'),
            });
        });

        child.stdin.end(stdin);
    });
}
