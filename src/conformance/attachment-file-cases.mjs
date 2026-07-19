import {
    access,
    mkdtemp,
    open,
    readFile,
    rm,
    stat,
    symlink,
    utimes,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

import { MAX_ATTACHMENT_BYTES } from '../files/attachment-preflight.mjs';
import { validateStream } from '../protocol/validate-fixture.mjs';
import { failed, passed } from './case-result.mjs';
import { runProcess } from './run-process.mjs';

async function exists(path) {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}

async function streamRun(binary, cwd, args, stateRoot, ordinal) {
    const stateDirectory = resolve(stateRoot, `state-${ordinal}`);
    const processResult = await runProcess(
        binary,
        [...args, '--output-format', 'stream-json'],
        {
            cwd,
            env: { JIAORONG_CLI_FIXTURE_STATE_DIR: stateDirectory },
        },
    );
    const validation = await validateStream(processResult.stdout, {
        exitCode: processResult.exitCode,
    });
    if (processResult.stderr !== '') {
        validation.errors.push('stderr is not empty');
        validation.valid = false;
    }
    return {
        processResult,
        validation,
        sessionCreated: await exists(resolve(stateDirectory, 'ses_fixture.json')),
    };
}

function caseResult(id, run, errors = []) {
    const combined = [...run.validation.errors, ...errors];
    return combined.length === 0
        ? passed(id, { durationMs: run.processResult.durationMs })
        : failed(id, combined, run.processResult);
}

function failureErrors(run, code, exitCode) {
    const errors = [];
    if (run.processResult.exitCode !== exitCode)
        errors.push(`expected exit ${exitCode}, got ${run.processResult.exitCode}`);
    if (run.validation.events?.at(-2)?.code !== code)
        errors.push(`expected ${code}`);
    if (run.validation.events?.[0]?.sessionId !== null)
        errors.push('preflight failure reported a Session ID');
    if (run.sessionCreated) errors.push('preflight failure created a Session');
    return errors;
}

export async function runAttachmentFileCases(binary) {
    const projectRoot = await mkdtemp(
        resolve(tmpdir(), 'jiaorong-cli-conformance-files-'),
    );
    const outsideRoot = await mkdtemp(
        resolve(tmpdir(), 'jiaorong-cli-conformance-outside-'),
    );
    const stateRoot = await mkdtemp(
        resolve(tmpdir(), 'jiaorong-cli-conformance-file-state-'),
    );
    let ordinal = 0;
    const run = (args) =>
        streamRun(binary, projectRoot, args, stateRoot, ordinal++);
    try {
        const textPath = join(projectRoot, 'canary.md');
        const secondPath = join(projectRoot, 'second.json');
        const outsidePath = join(outsideRoot, 'outside.txt');
        const unsupportedPath = join(projectRoot, 'unsupported.pdf');
        const oversizedPath = join(projectRoot, 'oversized.md');
        const readProbePath = join(projectRoot, 'read-probe.md');
        await writeFile(
            textPath,
            'CONFORMANCE_ATTACHMENT_CANARY\n',
            'utf8',
        );
        await writeFile(secondPath, '{"fixture":true}\n', 'utf8');
        await writeFile(outsidePath, 'OUTSIDE\n', 'utf8');
        await writeFile(unsupportedPath, '%PDF-1.7\n', 'utf8');
        const oversized = await open(oversizedPath, 'w');
        await oversized.truncate(MAX_ATTACHMENT_BYTES + 1);
        await oversized.close();
        const readCanaryAtime = new Date('2000-01-01T00:00:00.000Z');
        await utimes(oversizedPath, readCanaryAtime, new Date());
        await writeFile(readProbePath, 'READ_PROBE\n', 'utf8');
        await utimes(readProbePath, readCanaryAtime, new Date());
        await readFile(readProbePath);
        const readCanaryObservable =
            (await stat(readProbePath)).atimeMs > readCanaryAtime.getTime();
        const symlinkPath = join(projectRoot, 'escape.md');
        await symlink(outsidePath, symlinkPath);

        const imageFixtures = [
            ['pixel.png', Buffer.from('89504e470d0a1a0a00000000', 'hex')],
            ['pixel.jpg', Buffer.from('ffd8ffd9', 'hex')],
            ['pixel.webp', Buffer.from('524946460400000057454250', 'hex')],
            ['pixel.gif', Buffer.from('47494638396100000000', 'hex')],
        ];
        for (const [name, content] of imageFixtures)
            await writeFile(join(projectRoot, name), content);

        const inside = await run([
            '-p',
            '__JIAORONG_FIXTURE_ATTACHMENTS__',
            '--file',
            './canary.md',
        ]);
        const insideErrors = [];
        const insideInit = inside.validation.events?.[0];
        const insideResult = inside.validation.events?.at(-1);
        if (inside.processResult.exitCode !== 0 || !inside.sessionCreated)
            insideErrors.push('Project Root Attachment was not accepted');
        if (
            insideInit?.attachments?.[0]?.name !== 'canary.md' ||
            insideInit?.attachments?.[0]?.mimeType !== 'text/markdown'
        )
            insideErrors.push('text Attachment metadata is incorrect');
        if (!insideResult?.content?.includes('text-canary:true'))
            insideErrors.push('fixture model did not observe the text canary');

        const outside = await run([
            '-p',
            'must fail',
            '--file',
            outsidePath,
        ]);
        const outsideErrors = failureErrors(outside, 'PERMISSION_DENIED', 1);

        const additional = await run([
            '-p',
            '__JIAORONG_FIXTURE_ATTACHMENTS__',
            '--add-dir',
            outsideRoot,
            '--file',
            outsidePath,
        ]);
        const additionalErrors = [];
        if (
            additional.processResult.exitCode !== 0 ||
            additional.validation.events?.[0]?.attachments?.[0]?.name !==
                'outside.txt'
        )
            additionalErrors.push('Additional Directory Attachment was rejected');

        const traversal = await run([
            '-p',
            'must fail',
            '--file',
            relative(projectRoot, outsidePath),
        ]);
        const traversalErrors = failureErrors(
            traversal,
            'PERMISSION_DENIED',
            1,
        );
        const symlinkEscape = await run([
            '-p',
            'must fail',
            '--file',
            symlinkPath,
        ]);
        const symlinkErrors = failureErrors(
            symlinkEscape,
            'PERMISSION_DENIED',
            1,
        );
        const fullAccess = await run([
            '-p',
            'must fail',
            '--permission-mode',
            'full_access',
            '--file',
            outsidePath,
        ]);
        const fullAccessErrors = failureErrors(
            fullAccess,
            'PERMISSION_DENIED',
            1,
        );

        const multiple = await run([
            '-p',
            '__JIAORONG_FIXTURE_ATTACHMENTS__',
            '--file',
            textPath,
            '--file',
            secondPath,
        ]);
        const multipleErrors = [];
        if (
            JSON.stringify(
                multiple.validation.events?.[0]?.attachments?.map(
                    ({ name }) => name,
                ),
            ) !== JSON.stringify(['canary.md', 'second.json'])
        )
            multipleErrors.push('Attachment order changed');

        const imageArgs = [
            '-p',
            '__JIAORONG_FIXTURE_ATTACHMENTS__',
        ];
        for (const [name] of imageFixtures)
            imageArgs.push('--file', `./${name}`);
        const images = await run(imageArgs);
        const imageErrors = [];
        const expectedMimes = [
            'image/png',
            'image/jpeg',
            'image/webp',
            'image/gif',
        ];
        if (
            JSON.stringify(
                images.validation.events?.[0]?.attachments?.map(
                    ({ mimeType }) => mimeType,
                ),
            ) !== JSON.stringify(expectedMimes) ||
            !expectedMimes.every((mime) =>
                images.validation.events?.at(-1)?.content?.includes(mime),
            )
        )
            imageErrors.push('supported image inputs were not model-visible');

        const missing = await run([
            '-p',
            'must fail',
            '--file',
            './missing.md',
        ]);
        const unsupported = await run([
            '-p',
            'must fail',
            '--file',
            unsupportedPath,
        ]);
        const oversizedRun = await run([
            '-p',
            'must fail',
            '--file',
            oversizedPath,
        ]);
        const oversizedErrors = failureErrors(
            oversizedRun,
            'UNSUPPORTED_ATTACHMENT',
            42,
        );
        if (!readCanaryObservable) {
            oversizedErrors.push(
                'filesystem cannot observe the oversized-file read canary',
            );
        } else if (
            (await stat(oversizedPath)).atimeMs > readCanaryAtime.getTime()
        ) {
            oversizedErrors.push(
                'oversized Attachment body was read before rejection',
            );
        }

        const metadataErrors = [...insideErrors];
        const metadata = insideInit?.attachments?.[0];
        if (
            !metadata ||
            JSON.stringify(Object.keys(metadata).sort()) !==
                JSON.stringify(['id', 'mimeType', 'name', 'sizeBytes']) ||
            inside.processResult.stdout.includes(textPath) ||
            inside.processResult.stdout.includes(
                'CONFORMANCE_ATTACHMENT_CANARY',
            )
        )
            metadataErrors.push('init exposed unsafe Attachment data');

        return [
            caseResult('FIL-001', inside, insideErrors),
            caseResult('FIL-002', outside, outsideErrors),
            caseResult('FIL-003', additional, additionalErrors),
            caseResult('FIL-004', traversal, traversalErrors),
            caseResult('FIL-005', symlinkEscape, symlinkErrors),
            caseResult('FIL-008', fullAccess, fullAccessErrors),
            caseResult('ATT-001', inside, insideErrors),
            caseResult('ATT-002', multiple, multipleErrors),
            caseResult('ATT-003', images, imageErrors),
            caseResult(
                'ATT-004',
                missing,
                failureErrors(missing, 'INVALID_ARGUMENT', 42),
            ),
            caseResult(
                'ATT-005',
                unsupported,
                failureErrors(unsupported, 'UNSUPPORTED_ATTACHMENT', 42),
            ),
            caseResult(
                'ATT-006',
                oversizedRun,
                oversizedErrors,
            ),
            caseResult('ATT-007', outside, outsideErrors),
            caseResult('ATT-008', inside, metadataErrors),
        ];
    } finally {
        await rm(projectRoot, { recursive: true, force: true });
        await rm(outsideRoot, { recursive: true, force: true });
        await rm(stateRoot, { recursive: true, force: true });
    }
}
