import assert from 'node:assert/strict';
import { chmod, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { runProcess } from '../src/conformance/run-process.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runner = resolve(root, 'bin/jiaorong-cli-conformance.mjs');
const candidate = resolve(root, 'tests/fixtures/conformant-cli.mjs');

test('the public runner validates a fixture-backed CLI through real process I/O', async () => {
    await chmod(runner, 0o755);
    await chmod(candidate, 0o755);

    const result = await runProcess(
        runner,
        ['--binary', candidate, '--protocol', '1'],
        { cwd: root },
    );

    assert.equal(result.exitCode, 1, result.stderr);
    assert.equal(result.stderr, '');
    assert.match(result.stdout, /\n$/);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.ok, false);
    assert.equal(summary.executedOk, true);
    assert.equal(summary.complete, false);
    assert.equal(summary.protocolVersion, 1);
    assert.equal(summary.failed, 0);
    assert.deepEqual(summary.coverage, {
        required: 142,
        executed: 6,
        missing: 136,
    });
    assert.ok(summary.missingCaseIds.includes('CLI-002'));
    assert.deepEqual(
        summary.cases.map(({ id }) => id),
        [
            'ASSET-001',
            'CLI-001',
            'OUT-005',
            'AUT-002',
            'MOD-003',
            'TIM-001',
            'TUR-001',
        ],
    );
    assert.ok(summary.cases.every(({ status }) => status === 'pass'));
});

test('the runner inventory cannot drift from the frozen conformance matrix', async () => {
    const matrix = await readFile(
        resolve(root, '../docs/jiaorong-cli-v1-conformance-matrix.md'),
        'utf8',
    );
    const documented = [...matrix.matchAll(/^\| ([A-Z]{2,4}-\d{3})/gm)]
        .map((match) => match[1])
        .toSorted();
    const required = JSON.parse(
        await readFile(
            resolve(root, 'conformance/v1/required-case-ids.json'),
            'utf8',
        ),
    ).toSorted();

    assert.deepEqual(required, [...new Set(documented)].toSorted());
});
