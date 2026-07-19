import { validateDocument } from '../protocol/validate-fixture.mjs';
import { failed, passed } from './case-result.mjs';
import { runProcess } from './run-process.mjs';
import { validateStreamRun } from './stream-run.mjs';

async function validateJsonProjection(binary, prompt, expectedExit) {
    const processResult = await runProcess(binary, [
        '-p',
        prompt,
        '--output-format',
        'json',
    ]);
    const errors = [];
    let document;
    if (processResult.exitCode !== expectedExit) {
        errors.push(
            `expected exit ${expectedExit}, got ${processResult.exitCode}`,
        );
    }
    if (processResult.stderr !== '') errors.push('stderr is not empty');
    try {
        document = JSON.parse(processResult.stdout);
    } catch (error) {
        errors.push(`stdout is not one JSON object: ${error.message}`);
    }
    if (document !== undefined) {
        const schema = await validateDocument(
            'json-result.schema.json',
            document,
        );
        errors.push(...schema.errors);
    }
    return { document, errors, processResult };
}

async function runStreamOutputCases(binary) {
    const { processResult, validation } = await validateStreamRun(
        binary,
        [
            '-p',
            '__JIAORONG_FIXTURE_SUCCESS_TEXT__',
            '--output-format',
            'stream-json',
        ],
        0,
    );
    const outputCase = validation.valid
        ? passed('OUT-005', { durationMs: processResult.durationMs })
        : failed('OUT-005', validation.errors, processResult);
    const newlineErrors = [];
    if (!processResult.stdout.endsWith('\n')) {
        newlineErrors.push('JSONL must end with a newline');
    }
    const newlineCase = newlineErrors.length === 0
        ? passed('OUT-010', { durationMs: processResult.durationMs })
        : failed('OUT-010', newlineErrors, processResult);
    return [outputCase, newlineCase];
}

export async function runOutputCases(binary) {
    const results = [];
    const textSuccessResult = await runProcess(binary, [
        '-p',
        '__JIAORONG_FIXTURE_SUCCESS_TEXT__',
        '--output-format',
        'text',
    ]);
    const textSuccessErrors = [];
    if (textSuccessResult.exitCode !== 0) {
        textSuccessErrors.push(
            `expected exit 0, got ${textSuccessResult.exitCode}`,
        );
    }
    if (textSuccessResult.stdout !== 'Hello, fixture.') {
        textSuccessErrors.push('stdout is not exactly the final response text');
    }
    if (textSuccessResult.stderr !== '') {
        textSuccessErrors.push('stderr is not empty');
    }
    results.push(
        textSuccessErrors.length === 0
            ? passed('OUT-001', { durationMs: textSuccessResult.durationMs })
            : failed('OUT-001', textSuccessErrors, textSuccessResult),
    );

    const textFailureResult = await runProcess(binary, [
        '-p',
        '__JIAORONG_FIXTURE_AUTH_REQUIRED__',
        '--output-format',
        'text',
    ]);
    const textFailureErrors = [];
    if (textFailureResult.exitCode === 0) {
        textFailureErrors.push('expected a non-zero exit');
    }
    if (textFailureResult.stdout !== '') {
        textFailureErrors.push('stdout is not empty');
    }
    if (textFailureResult.stderr.trim() === '') {
        textFailureErrors.push('stderr does not contain a safe error hint');
    }
    if (/Bearer|(?:access|refresh)?token\s*[:=]/i.test(textFailureResult.stderr)) {
        textFailureErrors.push('stderr contains credential-shaped data');
    }
    results.push(
        textFailureErrors.length === 0
            ? passed('OUT-002', { durationMs: textFailureResult.durationMs })
            : failed('OUT-002', textFailureErrors, textFailureResult),
    );

    const jsonSuccess = await validateJsonProjection(
        binary,
        '__JIAORONG_FIXTURE_SUCCESS_TEXT__',
        0,
    );
    if (jsonSuccess.document?.status !== 'success') {
        jsonSuccess.errors.push('JSON status is not success');
    }
    if (jsonSuccess.document?.content !== 'Hello, fixture.') {
        jsonSuccess.errors.push('JSON content is not the final response text');
    }
    if (jsonSuccess.document?.error !== null) {
        jsonSuccess.errors.push('successful JSON error is not null');
    }
    results.push(
        jsonSuccess.errors.length === 0
            ? passed('OUT-003', {
                  durationMs: jsonSuccess.processResult.durationMs,
              })
            : failed('OUT-003', jsonSuccess.errors, jsonSuccess.processResult),
    );

    const jsonFailure = await validateJsonProjection(
        binary,
        '__JIAORONG_FIXTURE_AUTH_REQUIRED__',
        1,
    );
    if (jsonFailure.document?.status !== 'failed') {
        jsonFailure.errors.push('JSON status is not failed');
    }
    if (jsonFailure.document?.error?.code !== 'AUTH_REQUIRED') {
        jsonFailure.errors.push('JSON error code is not AUTH_REQUIRED');
    }
    if (jsonFailure.document?.sessionId !== null) {
        jsonFailure.errors.push('preflight failure created a Session ID');
    }
    if (jsonFailure.document?.model !== null) {
        jsonFailure.errors.push('preflight failure selected a model');
    }
    results.push(
        jsonFailure.errors.length === 0
            ? passed('OUT-004', {
                  durationMs: jsonFailure.processResult.durationMs,
              })
            : failed('OUT-004', jsonFailure.errors, jsonFailure.processResult),
    );

    results.push(...(await runStreamOutputCases(binary)));
    return results;
}
