#!/usr/bin/env node
import { createFixtureBackend } from '../../src/backends/fixture-backend.mjs';
import { runCli } from '../../src/cli/run-cli.mjs';

let clockCall = 0;
const stdout = {
    write(value) {
        const text = String(value);
        const sizes = [1, 7, 2, 13, 3];
        let offset = 0;
        let index = 0;
        while (offset < text.length) {
            process.stdout.write(
                text.slice(offset, offset + sizes[index % sizes.length]),
            );
            offset += sizes[index % sizes.length];
            index += 1;
        }
    },
};

process.exitCode = await runCli({
    argv: process.argv.slice(2),
    stdin: process.stdin,
    stdout,
    stderr: process.stderr,
    backend: createFixtureBackend(),
    ids: {
        requestId: () => 'req_fixture',
        messageId: () => 'msg_fixture',
    },
    now: () => (clockCall++ === 0 ? 0 : 10),
});
