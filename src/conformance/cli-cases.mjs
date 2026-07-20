import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import {
    validateDocument,
    validateStream,
} from '../protocol/validate-fixture.mjs';
import {
    addValidationError,
    caseFromValidation,
    failed,
    passed,
} from './case-result.mjs';
import { runProcess } from './run-process.mjs';
import { buildShellCanaryPrompt } from './shell-canary.mjs';

async function validateEchoPrompt(binary, args, prompt, { stdin = '' } = {}) {
    const processResult = await runProcess(binary, args, { stdin });
    const validation = await validateStream(processResult.stdout, {
        exitCode: processResult.exitCode,
    });
    if (processResult.exitCode !== 0) {
        addValidationError(
            validation,
            `expected exit 0, got ${processResult.exitCode}`,
        );
    }
    if (processResult.stderr !== '') {
        addValidationError(validation, 'stderr is not empty');
    }
    const expectedContent = `echo:${prompt}`;
    const messageContent = validation.events
        ?.filter(({ type }) => type === 'message')
        .map(({ delta }) => delta)
        .join('');
    const resultContent = validation.events?.find(
        ({ type }) => type === 'result',
    )?.content;
    if (messageContent !== expectedContent) {
        addValidationError(validation, 'backend did not preserve the prompt');
    }
    if (resultContent !== expectedContent) {
        addValidationError(validation, 'result did not preserve the prompt');
    }
    return { processResult, validation };
}

async function validateInvalidArgument(binary, args, { stdin = '' } = {}) {
    const processResult = await runProcess(binary, args, { stdin });
    const validation = await validateStream(processResult.stdout, {
        exitCode: processResult.exitCode,
    });
    const events = validation.events ?? [];
    if (processResult.exitCode !== 42) {
        addValidationError(
            validation,
            `expected exit 42, got ${processResult.exitCode}`,
        );
    }
    if (processResult.stderr !== '') {
        addValidationError(validation, 'stderr is not empty');
    }
    if (
        events.find(({ type }) => type === 'error')?.code !==
        'INVALID_ARGUMENT'
    ) {
        addValidationError(validation, 'expected INVALID_ARGUMENT error');
    }
    const init = events.find(({ type }) => type === 'init');
    if (init?.sessionId !== null || init?.model !== null) {
        addValidationError(validation, 'argument failure started the backend');
    }
    return { processResult, validation };
}

async function validateInvalidNumbers(binary, flag, values) {
    const errors = [];
    const evidence = [];
    let durationMs = 0;
    for (const value of values) {
        const { processResult, validation } = await validateInvalidArgument(
            binary,
            [
                '-p',
                'hello',
                flag,
                value,
                '--output-format',
                'stream-json',
            ],
        );
        durationMs += processResult.durationMs;
        evidence.push(`${flag} ${value}\n${processResult.stdout}`);
        errors.push(
            ...validation.errors.map(
                (error) => `${flag} ${value}: ${error}`,
            ),
        );
    }
    return { durationMs, errors, stdout: evidence.join('\n'), stderr: '' };
}

async function removeExistingCanary(canaryPath) {
    try {
        await readFile(canaryPath);
        await unlink(canaryPath);
        return true;
    } catch (error) {
        if (error.code === 'ENOENT') return false;
        throw error;
    }
}

async function runVersionCase(binary) {
    const processResult = await runProcess(binary, ['--version']);
    const versionText = processResult.stdout.trim();
    const errors = [];
    if (processResult.exitCode !== 0) {
        errors.push(`expected exit 0, got ${processResult.exitCode}`);
    }
    if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(versionText)) {
        errors.push('stdout is not one SemVer');
    }
    if (processResult.stdout !== `${versionText}\n`) {
        errors.push('stdout contains extra version text');
    }
    if (processResult.stderr !== '') errors.push('stderr is not empty');
    if (errors.length === 0) return passed('CLI-001', { cliVersion: versionText });
    return failed('CLI-001', errors, processResult);
}

async function runDoctorCase(binary) {
    const processResult = await runProcess(binary, [
        'doctor',
        '--output-format',
        'json',
    ]);
    const errors = [];
    let document;
    try {
        document = JSON.parse(processResult.stdout);
    } catch {
        errors.push('stdout is not one JSON document');
    }
    if (document) {
        const validation = await validateDocument(
            'doctor.schema.json',
            document,
        );
        errors.push(...validation.errors);
        if ((processResult.exitCode === 0) !== document.ok)
            errors.push('exit code does not agree with doctor ok');
    }
    if (processResult.stderr !== '') errors.push('stderr is not empty');
    return errors.length === 0
        ? passed('CLI-002', { durationMs: processResult.durationMs })
        : failed('CLI-002', errors, processResult);
}

export async function runCliCases(binary) {
    const results = [await runVersionCase(binary), await runDoctorCase(binary)];

    const prompt = '__JIAORONG_CONFORMANCE_CLI_003__';
    const promptCase = await validateEchoPrompt(
        binary,
        ['-p', prompt, '--output-format', 'stream-json'],
        prompt,
    );
    results.push(
        caseFromValidation(
            'CLI-003',
            promptCase.processResult,
            promptCase.validation,
        ),
    );

    const stdinPrompt = 'Jiaorong stdin 中文 prompt';
    const stdinCase = await validateEchoPrompt(
        binary,
        ['--output-format', 'stream-json'],
        stdinPrompt,
        { stdin: stdinPrompt },
    );
    results.push(
        caseFromValidation(
            'CLI-004',
            stdinCase.processResult,
            stdinCase.validation,
        ),
    );

    const conflictingPromptCase = await validateInvalidArgument(
        binary,
        ['-p', 'argv prompt', '--output-format', 'stream-json'],
        { stdin: 'stdin prompt' },
    );
    results.push(
        caseFromValidation(
            'CLI-005',
            conflictingPromptCase.processResult,
            conflictingPromptCase.validation,
        ),
    );

    const emptyPromptCase = await validateInvalidArgument(binary, [
        '-p',
        '',
        '--output-format',
        'stream-json',
    ]);
    results.push(
        caseFromValidation(
            'CLI-006',
            emptyPromptCase.processResult,
            emptyPromptCase.validation,
        ),
    );

    const shellCanaryPath = resolve(
        tmpdir(),
        `jiaorong-cli-conformance-${crypto.randomUUID()}`,
    );
    const specialPrompt = buildShellCanaryPrompt(
        process.platform,
        shellCanaryPath,
    );
    const specialPromptCase = await validateEchoPrompt(
        binary,
        ['-p', specialPrompt, '--output-format', 'stream-json'],
        specialPrompt,
    );
    if (await removeExistingCanary(shellCanaryPath)) {
        addValidationError(
            specialPromptCase.validation,
            'prompt executed a shell command',
        );
    }
    results.push(
        caseFromValidation(
            'CLI-007',
            specialPromptCase.processResult,
            specialPromptCase.validation,
        ),
    );

    const backendCanaryPath = resolve(
        tmpdir(),
        `jiaorong-cli-backend-${crypto.randomUUID()}`,
    );
    const unknownArgumentResult = await runProcess(binary, ['--unknown'], {
        env: { JIAORONG_CLI_TEST_BACKEND_CANARY: backendCanaryPath },
    });
    const unknownArgumentErrors = [];
    if (unknownArgumentResult.exitCode !== 42) {
        unknownArgumentErrors.push(
            `expected exit 42, got ${unknownArgumentResult.exitCode}`,
        );
    }
    if (unknownArgumentResult.stdout !== '') {
        unknownArgumentErrors.push('stdout is not empty');
    }
    if (!/Usage: jiaorong-cli/.test(unknownArgumentResult.stderr)) {
        unknownArgumentErrors.push('stderr does not include usage');
    }
    if (await removeExistingCanary(backendCanaryPath)) {
        unknownArgumentErrors.push('unknown argument started the backend');
    }
    results.push(
        unknownArgumentErrors.length === 0
            ? passed('CLI-008', {
                  durationMs: unknownArgumentResult.durationMs,
              })
            : failed(
                  'CLI-008',
                  unknownArgumentErrors,
                  unknownArgumentResult,
              ),
    );

    const maxTurns = await validateInvalidNumbers(binary, '--max-turns', [
        '0',
        '-1',
        '1.5',
    ]);
    results.push(
        maxTurns.errors.length === 0
            ? passed('CLI-009', { durationMs: maxTurns.durationMs })
            : failed('CLI-009', maxTurns.errors, maxTurns),
    );

    const timeout = await validateInvalidNumbers(binary, '--timeout', [
        '0',
        'not-a-number',
    ]);
    results.push(
        timeout.errors.length === 0
            ? passed('CLI-010', { durationMs: timeout.durationMs })
            : failed('CLI-010', timeout.errors, timeout),
    );

    return results;
}
