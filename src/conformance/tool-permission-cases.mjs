import {
    access,
    mkdtemp,
    readFile,
    realpath,
    rm,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import {
    fixturePath,
    validateFixture,
    validateStream,
} from '../protocol/validate-fixture.mjs';
import { failed, passed } from './case-result.mjs';
import { validateStreamRun } from './stream-run.mjs';

function caseResult(id, processResult, errors) {
    return errors.length === 0
        ? passed(id, { durationMs: processResult?.durationMs ?? 0 })
        : failed(id, errors, processResult);
}

function toolEvents(validation, type) {
    return (validation.events ?? []).filter((event) => event.type === type);
}

async function runMarker(binary, cwd, marker, permissionMode = 'default') {
    return validateStreamRun(
        binary,
        [
            '-p',
            marker,
            '--permission-mode',
            permissionMode,
            '--output-format',
            'stream-json',
        ],
        0,
        { cwd },
    );
}

async function pathMissing(path) {
    try {
        await access(path);
        return false;
    } catch (error) {
        if (error?.code === 'ENOENT') return true;
        throw error;
    }
}

async function eventOrderCases() {
    const invalidOrder = await validateFixture('invalid-tool-order.jsonl', {
        exitCode: 1,
    });
    const source = await readFile(fixturePath('success-tool.jsonl'), 'utf8');
    const events = source
        .trimEnd()
        .split('\n')
        .map((line) => JSON.parse(line));
    const resultIndex = events.findIndex(({ type }) => type === 'result');
    const toolResult = events.find(({ type }) => type === 'tool_result');
    events.splice(resultIndex, 0, structuredClone(toolResult));
    const duplicate = await validateStream(
        `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
        { exitCode: 0 },
    );
    return [
        invalidOrder.valid === false &&
        invalidOrder.errors.some((error) => error.includes('unknown'))
            ? passed('EVT-013')
            : failed('EVT-013', [
                  'tool_result before tool_use was not rejected',
              ]),
        duplicate.valid === false &&
        duplicate.errors.some((error) => error.includes('duplicate tool_result'))
            ? passed('EVT-014')
            : failed('EVT-014', ['duplicate tool_result was not rejected']),
    ];
}

export async function runToolPermissionCases(binary) {
    const directory = await realpath(
        await mkdtemp(resolve(tmpdir(), 'jiaorong-cli-tools-conformance-')),
    );
    try {
        await writeFile(
            resolve(directory, 'tool-read-canary.txt'),
            'READ_CANARY',
            'utf8',
        );
        await writeFile(
            resolve(directory, 'tool-search-canary.txt'),
            'SEARCH_CANARY',
            'utf8',
        );

        const read = await runMarker(
            binary,
            directory,
            '__JIAORONG_FIXTURE_TOOL_READ__',
        );
        const search = await runMarker(
            binary,
            directory,
            '__JIAORONG_FIXTURE_TOOL_SEARCH__',
        );
        const denied = await runMarker(
            binary,
            directory,
            '__JIAORONG_FIXTURE_PERMISSION_DENIED__',
        );
        const edit = await runMarker(
            binary,
            directory,
            '__JIAORONG_FIXTURE_TOOL_EDIT__',
            'full_access',
        );
        const shell = await runMarker(
            binary,
            directory,
            '__JIAORONG_FIXTURE_TOOL_SHELL__',
            'full_access',
        );
        const large = await runMarker(
            binary,
            directory,
            '__JIAORONG_FIXTURE_TOOL_LARGE__',
        );
        const all = await runMarker(
            binary,
            directory,
            '__JIAORONG_FIXTURE_TOOL_ALL__',
            'full_access',
        );
        const invalidMode = await validateStreamRun(
            binary,
            [
                '-p',
                'must fail',
                '--permission-mode',
                'unknown',
                '--output-format',
                'stream-json',
            ],
            42,
            { cwd: directory },
        );

        const readUses = toolEvents(read.validation, 'tool_use');
        const readResults = toolEvents(read.validation, 'tool_result');
        const searchResults = toolEvents(search.validation, 'tool_result');
        const deniedResults = toolEvents(denied.validation, 'tool_result');
        const editUses = toolEvents(edit.validation, 'tool_use');
        const editResults = toolEvents(edit.validation, 'tool_result');
        const shellUses = toolEvents(shell.validation, 'tool_use');
        const shellResults = toolEvents(shell.validation, 'tool_result');
        const largeResults = toolEvents(large.validation, 'tool_result');
        const allNames = new Set(
            toolEvents(all.validation, 'tool_use').map(({ name }) => name),
        );
        const allResults = toolEvents(all.validation, 'tool_result');

        const readErrors = [...read.validation.errors];
        if (
            readUses.length !== 1 ||
            readResults.length !== 1 ||
            readUses[0]?.toolCallId !== readResults[0]?.toolCallId
        )
            readErrors.push('Read tool events are not one correlated pair');
        const permissionReadErrors = [
            ...read.validation.errors,
            ...search.validation.errors,
        ];
        if (
            readResults[0]?.status !== 'success' ||
            searchResults[0]?.status !== 'success'
        )
            permissionReadErrors.push('default Read/Search did not succeed');

        const deniedErrors = [...denied.validation.errors];
        if (
            deniedResults[0]?.status !== 'failed' ||
            deniedResults[0]?.error?.code !== 'PERMISSION_DENIED' ||
            denied.validation.events?.at(-1)?.status !== 'success' ||
            !(await pathMissing(resolve(directory, 'must-not-exist.txt')))
        )
            deniedErrors.push(
                'default permission denial was not structured, side-effect-free, and recoverable',
            );

        const editErrors = [...edit.validation.errors];
        if (
            editUses.length !== 3 ||
            editResults.some(({ status }) => status !== 'success') ||
            !(await pathMissing(resolve(directory, 'tool-edit-canary.txt')))
        )
            editErrors.push('full-access edit lifecycle was not proven');

        const shellErrors = [...shell.validation.errors];
        if (
            shellUses.length !== 0 ||
            shellResults.length !== 0 ||
            shell.validation.events?.at(-1)?.content !== 'SHELL_DISABLED'
        )
            shellErrors.push('JiaorongAI 0.5.6 Shell was not disabled');

        const largeErrors = [...large.validation.errors];
        if (
            largeResults[0]?.output?.truncated !== true ||
            Buffer.byteLength(
                largeResults[0]?.output?.content ?? '',
                'utf8',
            ) >
                16 * 1_024
        )
            largeErrors.push('large tool output did not honor the public limit');

        const allErrors = [...all.validation.errors];
        for (const name of ['read_file', 'search', 'edit_file']) {
            if (!allNames.has(name)) allErrors.push(`missing ${name}`);
        }
        if (allNames.has('shell')) allErrors.push('Shell must be absent');
        if (
            !allResults.some(
                (event) =>
                    event.toolCallId === 'tool-all-outside' &&
                    event.status === 'failed' &&
                    event.error?.code === 'PERMISSION_DENIED',
            )
        )
            allErrors.push('full_access did not preserve the path boundary');

        const invalidModeErrors = [...invalidMode.validation.errors];
        if (
            invalidMode.validation.events?.at(-2)?.code !==
            'INVALID_ARGUMENT'
        )
            invalidModeErrors.push('unknown Permission Mode was not rejected');

        return [
            caseResult('EVT-012', read.processResult, readErrors),
            ...(await eventOrderCases()),
            caseResult('EVT-015', denied.processResult, deniedErrors),
            caseResult(
                'PER-001',
                read.processResult,
                permissionReadErrors,
            ),
            caseResult('PER-002', denied.processResult, deniedErrors),
            caseResult('PER-003', denied.processResult, deniedErrors),
            caseResult('PER-004', edit.processResult, editErrors),
            caseResult('PER-005', shell.processResult, shellErrors),
            caseResult('PER-006', all.processResult, allErrors),
            caseResult(
                'PER-007',
                invalidMode.processResult,
                invalidModeErrors,
            ),
            caseResult('TOL-001', read.processResult, readErrors),
            caseResult(
                'TOL-002',
                search.processResult,
                search.validation.errors.concat(
                    searchResults[0]?.status === 'success' &&
                        searchResults[0]?.output?.content?.found === true
                        ? []
                        : ['Search did not return its deterministic canary'],
                ),
            ),
            caseResult('TOL-003', edit.processResult, editErrors),
            caseResult('TOL-007', large.processResult, largeErrors),
        ];
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}
