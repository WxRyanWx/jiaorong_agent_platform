import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { validateStream } from '../protocol/validate-fixture.mjs';
import { failed, passed } from './case-result.mjs';
import { runProcess } from './run-process.mjs';

async function streamRun(binary, args, env) {
    const processResult = await runProcess(
        binary,
        [...args, '--output-format', 'stream-json'],
        { env },
    );
    const validation = await validateStream(processResult.stdout, {
        exitCode: processResult.exitCode,
    });
    if (processResult.stderr !== '') {
        validation.errors.push('stderr is not empty');
        validation.valid = false;
    }
    return { processResult, validation };
}

function result(id, run, errors = []) {
    const combined = [...run.validation.errors, ...errors];
    return combined.length === 0
        ? passed(id, { durationMs: run.processResult.durationMs })
        : failed(id, combined, run.processResult);
}

export async function runSessionCases(binary) {
    const stateDirectory = await mkdtemp(
        resolve(tmpdir(), 'jiaorong-cli-conformance-session-'),
    );
    const env = { JIAORONG_CLI_FIXTURE_STATE_DIR: stateDirectory };
    try {
        const first = await streamRun(
            binary,
            ['-p', 'CONTEXT_CANARY_719'],
            env,
        );
        const sessionId = first.validation.events?.[0]?.sessionId;
        const second = await streamRun(
            binary,
            [
                '-p',
                '__JIAORONG_FIXTURE_RESUME_CONTEXT__',
                '--resume',
                sessionId ?? 'missing-session',
            ],
            env,
        );
        const secondInit = second.validation.events?.[0];
        const secondResult = second.validation.events?.at(-1);
        const continuityErrors = [];
        if (first.processResult.exitCode !== 0)
            continuityErrors.push('first process did not create a Session');
        if (
            second.processResult.exitCode !== 0 ||
            secondInit?.resumed !== true ||
            secondInit?.sessionId !== sessionId ||
            secondResult?.sessionId !== sessionId ||
            !secondResult?.content?.includes('CONTEXT_CANARY_719')
        )
            continuityErrors.push(
                'second process did not resume the same Session with context',
            );

        const unknown = await streamRun(
            binary,
            ['-p', 'must fail', '--resume', 'missing-session'],
            env,
        );
        const unknownErrors = [];
        if (
            unknown.processResult.exitCode !== 42 ||
            unknown.validation.events?.at(-2)?.code !== 'INVALID_ARGUMENT' ||
            unknown.validation.events?.[0]?.sessionId !== null
        )
            unknownErrors.push('unknown Session was not rejected safely');
        const unknownAgain = await streamRun(
            binary,
            ['-p', 'must still fail', '--resume', 'missing-session'],
            env,
        );
        unknownErrors.push(...unknownAgain.validation.errors);
        if (
            unknownAgain.processResult.exitCode !== 42 ||
            unknownAgain.validation.events?.at(-2)?.code !==
                'INVALID_ARGUMENT'
        )
            unknownErrors.push('unknown Session created a replacement');

        const concurrent = await Promise.all([
            streamRun(
                binary,
                [
                    '-p',
                    '__JIAORONG_FIXTURE_CONCURRENT_A__',
                    '--resume',
                    sessionId ?? 'missing-session',
                ],
                env,
            ),
            streamRun(
                binary,
                [
                    '-p',
                    '__JIAORONG_FIXTURE_CONCURRENT_B__',
                    '--resume',
                    sessionId ?? 'missing-session',
                ],
                env,
            ),
        ]);
        const concurrentErrors = concurrent.flatMap(({ validation }) =>
            validation.valid ? [] : validation.errors,
        );
        if (
            JSON.stringify(
                concurrent
                    .map(({ processResult }) => processResult.exitCode)
                    .sort((left, right) => left - right),
            ) !== JSON.stringify([0, 42]) ||
            concurrent.filter(
                ({ validation }) =>
                    validation.events?.at(-2)?.code === 'INVALID_ARGUMENT',
            ).length !== 1
        )
            concurrentErrors.push(
                'concurrent resume did not enforce the published single-run Session policy',
            );
        const afterConcurrent = await streamRun(
            binary,
            [
                '-p',
                '__JIAORONG_FIXTURE_RESUME_CONTEXT__',
                '--resume',
                sessionId ?? 'missing-session',
            ],
            env,
        );
        const afterContent =
            afterConcurrent.validation.events?.at(-1)?.content ?? '';
        const persistedConcurrentPrompts = [
            '__JIAORONG_FIXTURE_CONCURRENT_A__',
            '__JIAORONG_FIXTURE_CONCURRENT_B__',
        ].filter((marker) => afterContent.includes(marker));
        if (
            afterConcurrent.processResult.exitCode !== 0 ||
            persistedConcurrentPrompts.length !== 1
        )
            concurrentErrors.push(
                'concurrent resume overwrote or corrupted later Session state',
            );

        await rm(resolve(stateDirectory, 'ses_fixture.json'));
        const deleted = await streamRun(
            binary,
            ['-p', 'must fail', '--resume', sessionId ?? 'ses_fixture'],
            env,
        );
        const deletedAgain = await streamRun(
            binary,
            ['-p', 'must still fail', '--resume', sessionId ?? 'ses_fixture'],
            env,
        );
        const deletedErrors = [];
        deletedErrors.push(...deletedAgain.validation.errors);
        for (const run of [deleted, deletedAgain]) {
            if (
                run.processResult.exitCode !== 42 ||
                run.validation.events?.at(-2)?.code !== 'INVALID_ARGUMENT'
            )
                deletedErrors.push(
                    'a deleted Session was restored or recreated',
                );
        }

        return [
            result('SES-002', second, continuityErrors),
            result('SES-003', second, continuityErrors),
            result('SES-005', unknown, unknownErrors),
            result('SES-006', deleted, deletedErrors),
            result('SES-010', afterConcurrent, concurrentErrors),
        ];
    } finally {
        await rm(stateDirectory, { recursive: true, force: true });
    }
}
