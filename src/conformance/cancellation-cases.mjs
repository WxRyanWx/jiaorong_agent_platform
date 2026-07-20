import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { validateStream } from '../protocol/validate-fixture.mjs';
import { failed, passed } from './case-result.mjs';
import { runProcess } from './run-process.mjs';

function result(id, processResult, errors) {
    return errors.length === 0
        ? passed(id, { durationMs: processResult.durationMs })
        : failed(id, errors, processResult);
}

async function streamRun(binary, marker, {
    args = [],
    cwd,
    expectedExit,
    signals = [],
    timeoutMs,
} = {}) {
    const processResult = await runProcess(
        binary,
        ['-p', marker, '--output-format', 'stream-json', ...args],
        { cwd, signals, timeoutMs },
    );
    const validation = processResult.timedOut
        ? { valid: false, errors: ['candidate exceeded the wall-clock timeout'] }
        : await validateStream(processResult.stdout, {
              exitCode: processResult.exitCode,
          });
    const errors = [...validation.errors];
    if (processResult.exitCode !== expectedExit)
        errors.push(
            `expected exit ${expectedExit}, got ${processResult.exitCode}`,
        );
    return {
        processResult,
        events: validation.events ?? [],
        errors,
    };
}

function cancelledErrors(events) {
    const terminal = events.at(-1);
    return terminal?.type === 'result' &&
        terminal.status === 'cancelled' &&
        terminal.error?.code === 'CANCELLED'
        ? []
        : ['run did not produce one verified CANCELLED Terminal Result'];
}

export async function runCancellationCases(binary) {
    const directory = await mkdtemp(join(tmpdir(), 'jiaorong-cancel-'));
    try {
        const model = await streamRun(
            binary,
            '__JIAORONG_FIXTURE_CANCEL_MODEL__',
            {
                cwd: directory,
                expectedExit: 130,
                signals: [
                    {
                        signal: 'SIGINT',
                        afterStdout: 'stream-started',
                        delayMs: 20,
                    },
                ],
            },
        );

        const tool = await streamRun(
            binary,
            '__JIAORONG_FIXTURE_CANCEL_TOOL__',
            {
                cwd: directory,
                expectedExit: 130,
                signals: [
                    {
                        signal: 'SIGINT',
                        afterStdout: '"type":"tool_use"',
                        delayMs: 20,
                    },
                ],
            },
        );
        const toolTerminal = tool.events.find(
            ({ type }) => type === 'tool_result',
        );

        const editBefore = await streamRun(
            binary,
            '__JIAORONG_FIXTURE_CANCEL_EDIT_BEFORE__',
            {
                cwd: directory,
                expectedExit: 130,
                signals: [
                    {
                        signal: 'SIGINT',
                        afterStdout: '"type":"tool_use"',
                        delayMs: 20,
                    },
                ],
            },
        );
        const beforeExists = await stat(
            join(directory, 'cancel-edit-before.txt'),
        )
            .then(() => true)
            .catch((error) => {
                if (error?.code === 'ENOENT') return false;
                throw error;
            });

        const editAfter = await streamRun(
            binary,
            '__JIAORONG_FIXTURE_CANCEL_EDIT_AFTER__',
            {
                cwd: directory,
                expectedExit: 130,
                signals: [
                    {
                        signal: 'SIGINT',
                        afterStdout: 'committed-before-cancel',
                        delayMs: 20,
                    },
                ],
            },
        );
        const afterContent = await readFile(
            join(directory, 'cancel-edit-after.txt'),
            'utf8',
        );
        const editTerminal = editAfter.events.find(
            ({ type }) => type === 'tool_result',
        );

        const multiple = await streamRun(
            binary,
            '__JIAORONG_FIXTURE_CANCEL_MULTI__',
            {
                cwd: directory,
                expectedExit: 130,
                signals: [
                    {
                        signal: 'SIGINT',
                        afterStdout: 'stream-started',
                        delayMs: 20,
                    },
                    {
                        signal: 'SIGINT',
                        afterStdout: 'stream-started',
                        delayMs: 25,
                    },
                ],
            },
        );

        const hung = await runProcess(
            binary,
            [
                '-p',
                '__JIAORONG_FIXTURE_CANCEL_HANG__',
                '--output-format',
                'stream-json',
            ],
            {
                cwd: directory,
                timeoutMs: 250,
                signals: [
                    {
                        signal: 'SIGINT',
                        afterStdout: 'will-not-settle',
                        delayMs: 20,
                    },
                ],
            },
        );
        const hungLines = hung.stdout
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line));

        const race = await streamRun(
            binary,
            '__JIAORONG_FIXTURE_CANCEL_RACE__',
            {
                cwd: directory,
                args: ['--timeout', '0.03'],
                expectedExit: 1,
                signals: [
                    {
                        signal: 'SIGINT',
                        afterStdout: 'stream-started',
                        delayMs: 60,
                    },
                ],
            },
        );
        const raceResults = race.events.filter(
            ({ type }) => type === 'result',
        );

        const belowLimit = await streamRun(
            binary,
            '__JIAORONG_FIXTURE_SUCCESS_TEXT__',
            {
                cwd: directory,
                args: ['--max-turns', '1'],
                expectedExit: 0,
            },
        );

        return [
            result(
                'CAN-001',
                model.processResult,
                model.errors.concat(cancelledErrors(model.events)),
            ),
            result(
                'CAN-002',
                tool.processResult,
                tool.errors.concat(
                    cancelledErrors(tool.events),
                    toolTerminal?.status === 'cancelled' &&
                        toolTerminal.error?.code === 'CANCELLED'
                        ? []
                        : ['active file tool did not terminate as cancelled'],
                ),
            ),
            result(
                'CAN-003',
                editBefore.processResult,
                editBefore.errors.concat(
                    cancelledErrors(editBefore.events),
                    beforeExists ? ['edit side effect occurred before approval'] : [],
                ),
            ),
            result(
                'CAN-004',
                editAfter.processResult,
                editAfter.errors.concat(
                    cancelledErrors(editAfter.events),
                    afterContent === 'committed-before-cancel' &&
                        editTerminal?.status === 'success'
                        ? []
                        : ['committed edit was missing or falsely rolled back'],
                ),
            ),
            result(
                'CAN-005',
                multiple.processResult,
                multiple.errors.concat(
                    multiple.events.filter(({ type }) => type === 'result')
                        .length <= 1 && !multiple.processResult.timedOut
                        ? []
                        : ['multiple SIGINTs hung or emitted duplicate results'],
                ),
            ),
            result(
                'CAN-006',
                hung,
                hung.timedOut &&
                    hung.signal === 'SIGKILL' &&
                    !hungLines.some(({ type }) => type === 'result')
                    ? []
                    : [
                          'caller force-kill was not observable as an incomplete protocol',
                      ],
            ),
            result(
                'TIM-002',
                race.processResult,
                race.errors.concat(
                    raceResults.length === 1 &&
                        raceResults[0].error?.code === 'TIMEOUT'
                        ? []
                        : ['timeout/SIGINT race had no deterministic winner'],
                ),
            ),
            result(
                'TUR-002',
                belowLimit.processResult,
                belowLimit.errors.concat(
                    belowLimit.events.at(-1)?.status === 'success' &&
                        belowLimit.events.at(-1)?.turns === 1
                        ? []
                        : ['max-turns stopped a run below the configured limit'],
                ),
            ),
        ];
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}
