import { validateDocument, validateStream } from '../protocol/validate-fixture.mjs';
import { failed, passed } from './case-result.mjs';
import { runProcess } from './run-process.mjs';

const credentialPattern = /Bearer|sk-[A-Za-z0-9]|(?:access|refresh)?token\s*[:=]/i;

async function readJsonCommand(binary, args, env) {
    const processResult = await runProcess(binary, args, { env });
    const errors = [];
    let document;
    if (processResult.exitCode !== 0)
        errors.push(`expected exit 0, got ${processResult.exitCode}`);
    if (processResult.stderr !== '') errors.push('stderr is not empty');
    try {
        document = JSON.parse(processResult.stdout);
    } catch (error) {
        errors.push(`stdout is not one JSON document: ${error.message}`);
    }
    return { processResult, errors, document };
}

async function runAuthCases(binary) {
    const results = [];
    const doctor = await readJsonCommand(binary, [
        'doctor',
        '--output-format',
        'json',
    ]);
    if (doctor.document) {
        const schema = await validateDocument(
            'doctor.schema.json',
            doctor.document,
        );
        doctor.errors.push(...schema.errors);
        if (
            !doctor.document.checks?.some(
                ({ name, status }) =>
                    name === 'authentication' &&
                    (status === 'pass' || status === 'warn'),
            )
        )
            doctor.errors.push('doctor did not report authentication readiness');
    }
    if (credentialPattern.test(doctor.processResult.stdout))
        doctor.errors.push('doctor exposed credential-shaped output');
    results.push(
        doctor.errors.length === 0
            ? passed('AUT-001', { durationMs: doctor.processResult.durationMs })
            : failed('AUT-001', doctor.errors, doctor.processResult),
    );

    const expired = await runProcess(binary, [
        '-p',
        '__JIAORONG_FIXTURE_AUTH_REQUIRED__',
        '--output-format',
        'stream-json',
    ]);
    const expiredValidation = await validateStream(expired.stdout, {
        exitCode: expired.exitCode,
    });
    if (expired.exitCode !== 1)
        expiredValidation.errors.push(
            `expected exit 1, got ${expired.exitCode}`,
        );
    if (expired.stderr !== '')
        expiredValidation.errors.push('stderr is not empty');
    if (credentialPattern.test(expired.stdout + expired.stderr))
        expiredValidation.errors.push('auth failure exposed credentials');
    results.push(
        expiredValidation.valid && expiredValidation.errors.length === 0
            ? passed('AUT-003', { durationMs: expired.durationMs })
            : failed('AUT-003', expiredValidation.errors, expired),
    );
    return results;
}

async function validateModelRun(binary, modelId, expectedExit, env) {
    const processResult = await runProcess(
        binary,
        [
            '-p',
            'model selection check',
            '--model',
            modelId,
            '--output-format',
            'stream-json',
        ],
        { env },
    );
    const validation = await validateStream(processResult.stdout, {
        exitCode: processResult.exitCode,
    });
    if (processResult.exitCode !== expectedExit)
        validation.errors.push(
            `expected exit ${expectedExit}, got ${processResult.exitCode}`,
        );
    if (processResult.stderr !== '')
        validation.errors.push('stderr is not empty');
    return { processResult, validation };
}

async function runModelCases(binary) {
    const results = [];
    const catalog = await readJsonCommand(binary, [
        'models',
        'list',
        '--output-format',
        'json',
    ]);
    if (catalog.document) {
        const schema = await validateDocument(
            'models-list.schema.json',
            catalog.document,
        );
        catalog.errors.push(...schema.errors);
        const ids = catalog.document.models?.map(({ id }) => id) ?? [];
        if (new Set(ids).size !== ids.length)
            catalog.errors.push('model IDs are not unique');
        const available =
            catalog.document.models?.filter(({ available }) => available) ?? [];
        const defaults =
            catalog.document.models?.filter(({ isDefault }) => isDefault) ?? [];
        if (available.length === 1 && defaults.length !== 1)
            catalog.errors.push('the sole available model is not the default');
    }
    results.push(
        catalog.errors.length === 0
            ? passed('MOD-001', { durationMs: catalog.processResult.durationMs })
            : failed('MOD-001', catalog.errors, catalog.processResult),
    );

    const selected = await validateModelRun(
        binary,
        'jiaorong-fixture',
        0,
    );
    const selectedInit = selected.validation.events?.find(
        ({ type }) => type === 'init',
    );
    if (selectedInit?.model?.id !== 'jiaorong-fixture')
        selected.validation.errors.push('init did not preserve the Model ID');
    results.push(
        selected.validation.valid && selected.validation.errors.length === 0
            ? passed('MOD-002', {
                  durationMs: selected.processResult.durationMs,
              })
            : failed('MOD-002', selected.validation.errors, selected.processResult),
    );

    const unavailable = await validateModelRun(
        binary,
        'jiaorong-fixture-unavailable',
        1,
    );
    const unavailableEvents = unavailable.validation.events ?? [];
    if (
        unavailableEvents.find(({ type }) => type === 'error')?.code !==
        'MODEL_UNAVAILABLE'
    )
        unavailable.validation.errors.push(
            'unavailable model did not return MODEL_UNAVAILABLE',
        );
    if (
        unavailableEvents.find(({ type }) => type === 'init')?.sessionId !==
        null
    )
        unavailable.validation.errors.push('unavailable model created a Session');
    results.push(
        unavailable.validation.valid &&
        unavailable.validation.errors.length === 0
            ? passed('MOD-004', {
                  durationMs: unavailable.processResult.durationMs,
              })
            : failed(
                  'MOD-004',
                  unavailable.validation.errors,
                  unavailable.processResult,
              ),
    );

    const renamedEnv = {
        JIAORONG_CLI_FIXTURE_MODEL_DISPLAY_NAME: 'Renamed Fixture Model',
    };
    const renamedCatalog = await readJsonCommand(
        binary,
        ['models', 'list', '--output-format', 'json'],
        renamedEnv,
    );
    const renamedModel = renamedCatalog.document?.models?.find(
        ({ id }) => id === 'jiaorong-fixture',
    );
    if (renamedModel?.displayName !== 'Renamed Fixture Model')
        renamedCatalog.errors.push('display name did not change');
    const renamedRun = await validateModelRun(
        binary,
        'jiaorong-fixture',
        0,
        renamedEnv,
    );
    if (
        renamedRun.validation.events?.find(({ type }) => type === 'init')?.model
            ?.id !== 'jiaorong-fixture'
    )
        renamedCatalog.errors.push('display-name change altered the Model ID');
    renamedCatalog.errors.push(...renamedRun.validation.errors);
    results.push(
        renamedCatalog.errors.length === 0
            ? passed('MOD-005', {
                  durationMs:
                      renamedCatalog.processResult.durationMs +
                      renamedRun.processResult.durationMs,
              })
            : failed('MOD-005', renamedCatalog.errors, renamedCatalog.processResult),
    );
    return results;
}

export async function runModelAuthCases(binary) {
    return [...(await runAuthCases(binary)), ...(await runModelCases(binary))];
}
