import { readFile } from 'node:fs/promises';

import {
    fixturePath,
    validateFixture,
    validateStream,
} from '../protocol/validate-fixture.mjs';
import { failed, passed } from './case-result.mjs';
import { runProcess } from './run-process.mjs';

function result(id, errors, extra = {}) {
    return errors.length === 0
        ? passed(id, extra)
        : failed(id, errors, extra);
}

function jsonl(events) {
    return `${events.map((event) => JSON.stringify(event)).join('\n')}\n`;
}

async function fixtureCase(id, name, exitCode, expectedValid) {
    const validation = await validateFixture(name, { exitCode });
    return result(
        id,
        validation.valid === expectedValid
            ? []
            : [
                  `${name} expected valid=${expectedValid}: ${validation.errors.join('; ')}`,
              ],
    );
}

async function stateMachineCases() {
    const successSource = await readFile(fixturePath('success-text.jsonl'), 'utf8');
    const successEvents = successSource
        .trimEnd()
        .split('\n')
        .map((line) => JSON.parse(line));
    const withoutInit = await validateStream(jsonl(successEvents.slice(1)), {
        exitCode: 0,
    });
    const afterResult = await validateStream(
        jsonl([
            ...successEvents,
            {
                type: 'message',
                messageId: 'msg_late',
                role: 'assistant',
                delta: 'late',
            },
        ]),
        { exitCode: 0 },
    );
    return [
        await fixtureCase(
            'EVT-003',
            'invalid-duplicate-init.jsonl',
            0,
            false,
        ),
        result('EVT-004', withoutInit.valid ? ['missing init accepted'] : []),
        await fixtureCase(
            'EVT-005',
            'invalid-duplicate-result.jsonl',
            0,
            false,
        ),
        await fixtureCase(
            'EVT-006',
            'invalid-missing-result.jsonl',
            0,
            false,
        ),
        result(
            'EVT-007',
            afterResult.valid ? ['event after result accepted'] : [],
        ),
        await fixtureCase(
            'EVT-009',
            'invalid-content-mismatch.jsonl',
            0,
            false,
        ),
    ];
}

async function compatibilityCases() {
    const optional = await validateFixture('unknown-optional-field.jsonl', {
        exitCode: 0,
    });
    const optionalEvents = optional.events ?? [];
    const unknownEvent = await validateFixture(
        'unknown-nonterminal-event.jsonl',
        { exitCode: 0 },
    );
    const unsupported = await validateFixture('unsupported-major.jsonl', {
        exitCode: 42,
    });
    const successSource = await readFile(fixturePath('success-text.jsonl'), 'utf8');
    const successEvents = successSource
        .trimEnd()
        .split('\n')
        .map((line) => JSON.parse(line));
    const missingRequired = structuredClone(successEvents);
    delete missingRequired[0].attachments;
    const missingValidation = await validateStream(jsonl(missingRequired), {
        exitCode: 0,
    });
    const changedType = structuredClone(successEvents);
    changedType.at(-1).status = 'done';
    const typeValidation = await validateStream(jsonl(changedType), {
        exitCode: 0,
    });
    return [
        result(
            'CMP-001',
            optional.valid && optionalEvents[0]?.futureCapability === true
                ? []
                : ['unknown optional init field was not accepted'],
        ),
        result(
            'CMP-002',
            optional.valid &&
                optionalEvents[1]?.futureField?.enabled === true &&
                optionalEvents[2]?.futureMetric === 7
                ? []
                : ['unknown optional message/result fields were not accepted'],
        ),
        result(
            'CMP-003',
            unknownEvent.valid &&
                unknownEvent.events?.some(({ type }) => type === 'progress')
                ? []
                : ['unknown non-terminal event was not safely skipped'],
        ),
        result(
            'CMP-004',
            unsupported.valid
                ? ['protocolVersion 2 was accepted by the v1 consumer']
                : [],
        ),
        result(
            'CMP-005',
            missingValidation.valid
                ? ['deleted required v1 field was accepted']
                : [],
        ),
        result(
            'CMP-006',
            typeValidation.valid
                ? ['changed v1 enum/type was accepted']
                : [],
        ),
    ];
}

async function errorCases(binary) {
    const codes = new Map([
        ['AUTH_REQUIRED', 1],
        ['INVALID_ARGUMENT', 42],
        ['UNSUPPORTED_PROTOCOL', 42],
        ['MODEL_UNAVAILABLE', 1],
        ['PERMISSION_DENIED', 1],
        ['TOOL_FAILED', 1],
        ['UNSUPPORTED_ATTACHMENT', 42],
        ['TIMEOUT', 1],
        ['TURN_LIMIT', 53],
        ['CANCELLED', 130],
        ['INTERNAL_ERROR', 1],
    ]);
    const codeErrors = [];
    let durationMs = 0;
    for (const [code, exitCode] of codes) {
        const processResult = await runProcess(binary, [
            '-p',
            `__JIAORONG_FIXTURE_ERROR_CODE__:${code}`,
            '--output-format',
            'stream-json',
        ]);
        durationMs += processResult.durationMs;
        const validation = await validateStream(processResult.stdout, {
            exitCode: processResult.exitCode,
        });
        const terminal = validation.events?.at(-1);
        if (
            !validation.valid ||
            processResult.exitCode !== exitCode ||
            terminal?.error?.code !== code
        ) {
            codeErrors.push(
                `${code}: exit=${processResult.exitCode}; ${validation.errors.join('; ')}`,
            );
        }
    }

    const cancelled = await validateFixture('cancelled.jsonl', {
        exitCode: 130,
    });
    const successSource = await readFile(fixturePath('success-text.jsonl'), 'utf8');
    const conflicting = await validateStream(successSource, { exitCode: 1 });
    const internal = await runProcess(binary, [
        '-p',
        '__JIAORONG_FIXTURE_INTERNAL_ERROR__',
        '--output-format',
        'stream-json',
    ]);
    const internalValidation = await validateStream(internal.stdout, {
        exitCode: internal.exitCode,
    });
    const internalText = `${internal.stdout}\n${internal.stderr}`;
    return [
        result('ERR-001', codeErrors, { durationMs }),
        result(
            'ERR-004',
            cancelled.valid &&
                cancelled.events?.at(-1)?.status === 'cancelled' &&
                cancelled.events?.at(-1)?.error?.code === 'CANCELLED'
                ? []
                : ['cancelled status/code/exit contract was rejected'],
        ),
        result(
            'ERR-005',
            conflicting.valid ? ['status/exit conflict was accepted'] : [],
        ),
        result(
            'ERR-006',
            internalValidation.valid &&
                internal.exitCode === 1 &&
                internalValidation.events?.at(-1)?.error?.code ===
                    'INTERNAL_ERROR' &&
                !/fixture-secret-token|privateFixtureStack/.test(internalText)
                ? []
                : ['internal failure leaked details or lost INTERNAL_ERROR'],
            { durationMs: internal.durationMs },
        ),
    ];
}

async function preflightCase(binary) {
    const processResult = await runProcess(binary, [
        '-p',
        '__JIAORONG_FIXTURE_AUTH_REQUIRED__',
        '--output-format',
        'stream-json',
    ]);
    const validation = await validateStream(processResult.stdout, {
        exitCode: processResult.exitCode,
    });
    const init = validation.events?.at(0);
    const terminal = validation.events?.at(-1);
    const errors = [...validation.errors];
    if (
        processResult.exitCode !== 1 ||
        init?.type !== 'init' ||
        init.sessionId !== null ||
        init.model !== null ||
        terminal?.type !== 'result' ||
        terminal.sessionId !== null
    ) {
        errors.push('preflight failure created a Session or incomplete stream');
    }
    return result('EVT-017', errors, {
        durationMs: processResult.durationMs,
    });
}

export async function runProtocolCases(binary) {
    return [
        ...(await stateMachineCases()),
        await preflightCase(binary),
        ...(await compatibilityCases()),
        ...(await errorCases(binary)),
    ];
}
