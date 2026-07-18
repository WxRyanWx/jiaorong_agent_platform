#!/usr/bin/env node
import { createUnavailableBackend } from '../src/backends/unavailable-backend.mjs';
import { runCli } from '../src/cli/run-cli.mjs';

process.exitCode = await runCli({
    argv: process.argv.slice(2),
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
    backend: createUnavailableBackend(),
});
