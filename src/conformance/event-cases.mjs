import { failed, passed } from './case-result.mjs';
import { validateStreamRun } from './stream-run.mjs';

function caseResult(id, processResult, errors) {
    return errors.length === 0
        ? passed(id, { durationMs: processResult.durationMs })
        : failed(id, errors, processResult);
}

function count(events, type) {
    return events.filter((event) => event.type === type).length;
}

async function runSuccessCases(binary) {
    const { processResult, validation } = await validateStreamRun(
        binary,
        [
            '-p',
            '__JIAORONG_FIXTURE_FRAGMENTED__',
            '--output-format',
            'stream-json',
        ],
        0,
    );
    const events = validation.events ?? [];
    const init = events[0];
    const result = events.at(-1);
    const messages = events.filter((event) => event.type === 'message');
    const base = [...validation.errors];
    return [
        caseResult(
            'EVT-001',
            processResult,
            base.concat(
                init?.type === 'init' && count(events, 'init') === 1
                    ? []
                    : ['init is not first and unique'],
            ),
        ),
        caseResult(
            'EVT-002',
            processResult,
            base.concat(
                result?.type === 'result' && count(events, 'result') === 1
                    ? []
                    : ['result is not last and unique'],
            ),
        ),
        caseResult(
            'EVT-008',
            processResult,
            base.concat(
                messages.length >= 2 &&
                    messages.map(({ delta }) => delta).join('') ===
                        result?.content
                    ? []
                    : ['message fragments do not reconstruct result content'],
            ),
        ),
        caseResult(
            'EVT-010',
            processResult,
            base.concat(
                count(events, 'reasoning_summary') === 0 &&
                    result?.status === 'success'
                    ? []
                    : ['run without reasoning summary did not succeed'],
            ),
        ),
        caseResult(
            'SES-001',
            processResult,
            base.concat(
                typeof init?.sessionId === 'string' &&
                    init.sessionId.length > 0 &&
                    init.sessionId === result?.sessionId
                    ? []
                    : ['init/result do not share one non-empty Session ID'],
            ),
        ),
        caseResult(
            'ERR-002',
            processResult,
            base.concat(
                processResult.exitCode === 0 &&
                    result?.status === 'success' &&
                    result.error === null
                    ? []
                    : ['success status, error, and exit code disagree'],
            ),
        ),
    ];
}

async function runReasoningCase(binary) {
    const { processResult, validation } = await validateStreamRun(
        binary,
        [
            '-p',
            '__JIAORONG_FIXTURE_REASONING__',
            '--output-format',
            'stream-json',
        ],
        0,
    );
    const events = validation.events ?? [];
    const reasoning = events
        .filter((event) => event.type === 'reasoning_summary')
        .map(({ delta }) => delta);
    const result = events.at(-1);
    const errors = [...validation.errors];
    if (
        JSON.stringify(reasoning) !== JSON.stringify(['Step 1.', 'Step 2.']) ||
        result?.content !== 'Done.'
    )
        errors.push('reasoning summaries are missing, reordered, or in content');
    return caseResult('EVT-011', processResult, errors);
}

async function runFailureCases(binary) {
    const { processResult, validation } = await validateStreamRun(
        binary,
        [
            '-p',
            '__JIAORONG_FIXTURE_TIMEOUT__',
            '--output-format',
            'stream-json',
        ],
        1,
    );
    const events = validation.events ?? [];
    const error = events.at(-2);
    const result = events.at(-1);
    const base = [...validation.errors];
    return [
        caseResult(
            'EVT-016',
            processResult,
            base.concat(
                error?.type === 'error' &&
                    result?.type === 'result' &&
                    result.status === 'failed' &&
                    error.code === result.error?.code
                    ? []
                    : ['terminal error is not followed by its failed result'],
            ),
        ),
        caseResult(
            'ERR-003',
            processResult,
            base.concat(
                processResult.exitCode !== 0 &&
                    result?.status === 'failed' &&
                    result.error !== null
                    ? []
                    : ['failed status, error, and exit code disagree'],
            ),
        ),
    ];
}

export async function runEventCases(binary) {
    return [
        ...(await runSuccessCases(binary)),
        await runReasoningCase(binary),
        ...(await runFailureCases(binary)),
    ];
}
