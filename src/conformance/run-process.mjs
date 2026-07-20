import { spawn } from 'node:child_process';

export function runProcess(
    binary,
    args,
    { cwd, env, stdin = '', timeoutMs = 5_000, signals = [] } = {},
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
        const pendingSignals = signals.map((entry) => ({
            signal: entry.signal,
            afterStdout: entry.afterStdout,
            delayMs: entry.delayMs ?? 0,
            sent: false,
        }));
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill('SIGKILL');
        }, timeoutMs);

        child.stdout.on('data', (chunk) => {
            stdout.push(chunk);
            const text = Buffer.concat(stdout).toString('utf8');
            for (const entry of pendingSignals) {
                if (entry.sent || !text.includes(entry.afterStdout)) continue;
                entry.sent = true;
                setTimeout(() => child.kill(entry.signal), entry.delayMs);
            }
        });
        child.stderr.on('data', (chunk) => stderr.push(chunk));
        child.stdin.on('error', (error) => {
            if (error.code !== 'EPIPE') {
                clearTimeout(timer);
                child.kill('SIGKILL');
                reject(error);
            }
        });
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
