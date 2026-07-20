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

    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.match(result.stdout, /\n$/);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.ok, true);
    assert.equal(summary.executedOk, true);
    assert.equal(summary.complete, true);
    assert.equal(summary.scope, 'deterministic');
    assert.equal(summary.protocolVersion, 1);
    assert.equal(summary.failed, 0);
    assert.deepEqual(summary.coverage, {
        required: 98,
        executed: 98,
        missing: 0,
    });
    assert.deepEqual(summary.missingCaseIds, []);
    assert.ok(!summary.missingCaseIds.some((id) => id.startsWith('LIVE-')));
    assert.ok(!summary.missingCaseIds.some((id) => id.startsWith('WB-')));
    assert.ok(!summary.missingCaseIds.includes('CLI-002'));
    assert.ok(!summary.missingCaseIds.includes('CLI-003'));
    const required = JSON.parse(
        await readFile(
            resolve(root, 'conformance/v1/deterministic-case-ids.json'),
            'utf8',
        ),
    );
    const executed = summary.cases
        .map(({ id }) => id)
        .filter((id) => required.includes(id));
    assert.deepEqual(executed.toSorted(), required.toSorted());
    assert.ok(summary.cases.every(({ status }) => status === 'pass'));
});

test('deterministic, live, and deferred inventories form an explicit disjoint partition', async () => {
    const matrix = await readFile(
        resolve(root, 'docs/jiaorong-cli-v1-conformance-matrix.md'),
        'utf8',
    );
    const documented = [...matrix.matchAll(/^\| ([A-Z]{2,4}-\d{3})/gm)].map(
        (match) => match[1],
    );
    const readInventory = async (name) =>
        JSON.parse(
            await readFile(resolve(root, `conformance/v1/${name}`), 'utf8'),
        );
    const deterministic = await readInventory('deterministic-case-ids.json');
    const live = await readInventory('live-case-ids.json');
    const deferred = await readInventory('deferred-case-ids.json');
    const allInventoryIds = [...deterministic, ...live, ...deferred];

    assert.equal(new Set(allInventoryIds).size, allInventoryIds.length);
    assert.deepEqual(allInventoryIds.toSorted(), documented.toSorted());
    assert.ok(deterministic.every((id) => !/^(LIVE|WB|DST)-/.test(id)));
    assert.deepEqual(live, [
        'DST-001',
        'DST-005',
        'DST-006',
        ...Array.from({ length: 11 }, (_, index) =>
            `LIVE-${String(index + 1).padStart(3, '0')}`,
        ),
    ]);
    assert.deepEqual(deferred, [
        'AUT-004',
        'AUT-005',
        'AUT-006',
        'DST-002',
        'DST-003',
        'DST-004',
        'DST-007',
        'DST-008',
        'FIL-006',
        'FIL-007',
        'LIVE-012',
        'TOL-004',
        'TOL-005',
        'TOL-006',
        'SES-004',
        'SES-007',
        'SES-008',
        'SES-009',
        ...Array.from({ length: 12 }, (_, index) =>
            `WB-${String(index + 1).padStart(3, '0')}`,
        ),
    ]);

    const requiredPermissionRows = [
        '| PER-001 | L2 | default + Read/Search |',
        '| PER-002 | L2 | default + 权限交互 |',
        '| PER-004 | L2 | full_access + Edit |',
        '| PER-005 | L2 | JiaorongAI 0.5.6 Shell 禁用 |',
        '| PER-006 | L2 | full_access + 三类文件工具 |',
        '| FIL-008 | L2 | full_access + 根外路径 |',
    ];
    for (const row of requiredPermissionRows) assert.ok(matrix.includes(row));
});

test('active product documents describe JiaorongAI users, not a downstream replacement', async () => {
    const activeDocuments = [
        'CONTEXT.md',
        'README.md',
        'docs/jiaorong-cli-v1-prd.md',
        'docs/jiaorong-cli-v1-protocol.md',
        'docs/jiaorong-cli-v1-conformance-matrix.md',
    ];
    const forbidden = /C4Workdian|Workbuddian|CodeBuddy|Replacement Readiness/;

    for (const name of activeDocuments) {
        const content = await readFile(resolve(root, name), 'utf8');
        assert.doesNotMatch(content, forbidden, name);
    }
});

test('the runner rejects a candidate that reaches the backend for an unknown argument', async () => {
    const result = await runProcess(
        runner,
        ['--binary', candidate, '--protocol', '1'],
        {
            cwd: root,
            env: { JIAORONG_CLI_TEST_FORCE_BACKEND_CANARY: '1' },
        },
    );

    assert.equal(result.exitCode, 1, result.stderr);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.executedOk, false);
    assert.equal(summary.failed, 1);
    const unknownArgument = summary.cases.find(({ id }) => id === 'CLI-008');
    assert.equal(unknownArgument.status, 'fail');
    assert.ok(unknownArgument.errors.includes('unknown argument started the backend'));
});
