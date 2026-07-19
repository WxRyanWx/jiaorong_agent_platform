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
    assert.equal(summary.scope, 'deterministic');
    assert.equal(summary.protocolVersion, 1);
    assert.equal(summary.failed, 0);
    assert.deepEqual(summary.coverage, {
        required: 101,
        executed: 35,
        missing: 66,
    });
    assert.ok(!summary.missingCaseIds.some((id) => id.startsWith('LIVE-')));
    assert.ok(!summary.missingCaseIds.some((id) => id.startsWith('WB-')));
    assert.ok(!summary.missingCaseIds.includes('CLI-002'));
    assert.ok(!summary.missingCaseIds.includes('CLI-003'));
    assert.deepEqual(
        summary.cases.map(({ id }) => id),
        [
            'ASSET-001',
            'CLI-001',
            'CLI-002',
            'CLI-003',
            'CLI-004',
            'CLI-005',
            'CLI-006',
            'CLI-007',
            'CLI-008',
            'CLI-009',
            'CLI-010',
            'OUT-001',
            'OUT-002',
            'OUT-003',
            'OUT-004',
            'OUT-005',
            'OUT-010',
            'EVT-001',
            'EVT-002',
            'EVT-008',
            'EVT-010',
            'SES-001',
            'ERR-002',
            'EVT-011',
            'EVT-016',
            'ERR-003',
            'AUT-001',
            'AUT-003',
            'MOD-001',
            'MOD-002',
            'MOD-004',
            'MOD-005',
            'AUT-002',
            'MOD-003',
            'TIM-001',
            'TUR-001',
        ],
    );
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
        '| PER-005 | L2 | full_access + Shell |',
        '| PER-006 | L2 | full_access + 四类工具 |',
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
