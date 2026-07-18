#!/usr/bin/env node
import { resolve } from 'node:path';

import { runSuite } from '../src/conformance/run-suite.mjs';

function usage(message) {
    if (message) process.stderr.write(`${message}\n`);
    process.stderr.write(
        'Usage: jiaorong-cli-conformance --binary <path> --protocol 1\n',
    );
    process.exitCode = 42;
}

function parseArgs(argv) {
    if (argv.length !== 4 || argv[0] !== '--binary' || argv[2] !== '--protocol')
        return null;
    const protocolVersion = Number(argv[3]);
    if (!argv[1] || protocolVersion !== 1) return null;
    return { binary: resolve(argv[1]), protocolVersion };
}

const options = parseArgs(process.argv.slice(2));
if (!options) {
    usage('Invalid conformance runner arguments.');
} else {
    try {
        const summary = await runSuite(options);
        process.stdout.write(`${JSON.stringify(summary)}\n`);
        process.exitCode = summary.ok ? 0 : 1;
    } catch (error) {
        usage(`Unable to run candidate: ${error.message}`);
    }
}
