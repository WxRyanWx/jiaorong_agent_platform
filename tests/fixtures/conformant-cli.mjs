#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';

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

const fixtureBackend = createFixtureBackend({
    modelDisplayName:
        process.env.JIAORONG_CLI_FIXTURE_MODEL_DISPLAY_NAME ??
        'Jiaorong Fixture',
    stateDirectory: process.env.JIAORONG_CLI_FIXTURE_STATE_DIR,
});
if (process.env.JIAORONG_CLI_FIXTURE_DIAGNOSTIC === '1') {
    process.stderr.write('fixture diagnostic: safe and non-protocol\n');
}
const backendCanary = process.env.JIAORONG_CLI_TEST_BACKEND_CANARY;
if (
    backendCanary &&
    process.env.JIAORONG_CLI_TEST_FORCE_BACKEND_CANARY === '1'
) {
    await writeFile(backendCanary, 'forced-before-parse\n', { flag: 'wx' });
}
const backend = backendCanary
    ? {
          ...fixtureBackend,
          async prepare(request) {
              await writeFile(backendCanary, 'prepare\n', { flag: 'wx' });
              return fixtureBackend.prepare(request);
          },
      }
    : fixtureBackend;

process.exitCode = await runCli({
    argv: process.argv.slice(2),
    stdin: process.stdin,
    stdout,
    stderr: process.stderr,
    backend,
    ids: {
        requestId: () => 'req_fixture',
        messageId: () => 'msg_fixture',
    },
    now: () => (clockCall++ === 0 ? 0 : 10),
});
