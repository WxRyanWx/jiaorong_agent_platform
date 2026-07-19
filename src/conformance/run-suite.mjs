import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { fixturePath, validateFixture } from '../protocol/validate-fixture.mjs';
import { failed, passed } from './case-result.mjs';
import { runCliCases } from './cli-cases.mjs';
import { runOutputCases } from './output-cases.mjs';
import { validateStreamRun } from './stream-run.mjs';

const terminalStreamCases = [
    {
        id: 'AUT-002',
        marker: '__JIAORONG_FIXTURE_AUTH_REQUIRED__',
        exitCode: 1,
    },
    {
        id: 'MOD-003',
        marker: '__JIAORONG_FIXTURE_MODEL_UNAVAILABLE__',
        exitCode: 1,
    },
    { id: 'TIM-001', marker: '__JIAORONG_FIXTURE_TIMEOUT__', exitCode: 1 },
    { id: 'TUR-001', marker: '__JIAORONG_FIXTURE_TURN_LIMIT__', exitCode: 53 },
];

function redact(value) {
    return value
        .replaceAll(process.cwd(), '<cwd>')
        .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, 'Bearer <redacted>')
        .replace(
            /("?(?:access|refresh)?token"?\s*[:=]\s*")[^"]+/gi,
            '$1<redacted>',
        );
}

function resultHasProcessOutput(value) {
    return (
        typeof value?.stdout === 'string' && typeof value?.stderr === 'string'
    );
}

async function saveFailureEvidence(results) {
    const evidenceDir = resolve(
        process.cwd(),
        'test-results/jiaorong-cli-conformance/protocol-v1',
    );
    await mkdir(evidenceDir, { recursive: true });
    for (const result of results.filter(
        (value) => value.status === 'fail' && resultHasProcessOutput(value),
    )) {
        await writeFile(
            resolve(evidenceDir, `${result.id}-stdout.txt`),
            redact(result.stdout),
            'utf8',
        );
        await writeFile(
            resolve(evidenceDir, `${result.id}-stderr.txt`),
            redact(result.stderr),
            'utf8',
        );
    }
}

async function validateAssets() {
    const manifest = JSON.parse(
        await readFile(fixturePath('manifest.json'), 'utf8'),
    );
    const errors = [];
    for (const [name, expectation] of Object.entries(manifest.fixtures)) {
        const result = await validateFixture(name, {
            exitCode: expectation.exitCode,
        });
        if (result.valid !== expectation.accept) {
            errors.push(`${name}: ${result.errors.join('; ')}`);
        }
    }
    return errors.length === 0
        ? passed('ASSET-001')
        : failed('ASSET-001', errors);
}

async function runTerminalStreamCases(binary) {
    const results = [];
    for (const definition of terminalStreamCases) {
        const { processResult, validation } = await validateStreamRun(
            binary,
            [
                '-p',
                definition.marker,
                '--output-format',
                'stream-json',
            ],
            definition.exitCode,
        );
        results.push(
            validation.valid
                ? passed(definition.id, {
                      durationMs: processResult.durationMs,
                  })
                : failed(definition.id, validation.errors, processResult),
        );
    }
    return results;
}

export async function runSuite({ binary, protocolVersion }) {
    const requiredCaseIds = JSON.parse(
        await readFile(
            resolve(
                import.meta.dirname,
                '../../conformance/v1/deterministic-case-ids.json',
            ),
            'utf8',
        ),
    );
    const results = [
        await validateAssets(),
        ...(await runCliCases(binary)),
        ...(await runOutputCases(binary)),
        ...(await runTerminalStreamCases(binary)),
    ];

    if (results.some(({ status }) => status === 'fail')) {
        await saveFailureEvidence(results);
    }
    const failedCount = results.filter(
        ({ status }) => status === 'fail',
    ).length;
    const executedCaseIds = results
        .map(({ id }) => id)
        .filter((id) => requiredCaseIds.includes(id));
    const missingCaseIds = requiredCaseIds.filter(
        (id) => !executedCaseIds.includes(id),
    );
    const executedOk = failedCount === 0;
    const complete = missingCaseIds.length === 0;
    return {
        ok: executedOk && complete,
        executedOk,
        complete,
        scope: 'deterministic',
        suiteVersion: '0.1.0',
        protocolVersion,
        platform: `${process.platform}-${process.arch}`,
        generatedAt: new Date().toISOString(),
        passed: results.length - failedCount,
        failed: failedCount,
        coverage: {
            required: requiredCaseIds.length,
            executed: executedCaseIds.length,
            missing: missingCaseIds.length,
        },
        missingCaseIds,
        cases: results.map(
            ({ stdout: _stdout, stderr: _stderr, ...result }) => result,
        ),
    };
}
