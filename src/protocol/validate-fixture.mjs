import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '../..');
const knownEventSchemas = new Map([
    ['init', 'init.schema.json'],
    ['message', 'message.schema.json'],
    ['reasoning_summary', 'reasoning-summary.schema.json'],
    ['tool_use', 'tool-use.schema.json'],
    ['tool_result', 'tool-result.schema.json'],
    ['error', 'error.schema.json'],
    ['result', 'result.schema.json'],
]);
const exitCodeByError = new Map([
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

export function fixturePath(name) {
    return resolve(packageRoot, 'fixtures/v1', name);
}

async function readSchema(name) {
    return JSON.parse(
        await readFile(resolve(packageRoot, 'protocol/v1', name), 'utf8'),
    );
}

let validatorsPromise;

async function validators() {
    validatorsPromise ??= (async () => {
        const ajv = new Ajv2020({ allErrors: true, strict: true });
        ajv.addSchema(await readSchema('common.schema.json'));
        const compiled = new Map();
        for (const [type, name] of knownEventSchemas) {
            compiled.set(type, ajv.compile(await readSchema(name)));
        }
        return { ajv, events: compiled, documents: new Map() };
    })();
    return validatorsPromise;
}

function parseJsonl(source, errors) {
    if (!source.endsWith('\n')) errors.push('JSONL must end with a newline');
    const lines = source.endsWith('\n')
        ? source.slice(0, -1).split('\n')
        : source.split('\n');
    const events = [];
    for (const [index, line] of lines.entries()) {
        try {
            events.push(JSON.parse(line));
        } catch (error) {
            errors.push(
                `line ${index + 1} is not one complete JSON object: ${error.message}`,
            );
        }
    }
    return events;
}

function validateTerminal(result, exitCode, errors) {
    if (!result) return;
    if (result.status === 'success') {
        if (exitCode !== 0) errors.push('success result requires exit 0');
        if (result.error !== null)
            errors.push('success result requires error null');
        if (result.sessionId === null)
            errors.push('success result requires a Session ID');
    } else if (result.status === 'cancelled') {
        if (exitCode !== 130) errors.push('cancelled result requires exit 130');
        if (result.error?.code !== 'CANCELLED')
            errors.push('cancelled result requires CANCELLED');
    } else {
        if (exitCode === 0)
            errors.push('failed result requires a non-zero exit');
        if (result.error === null)
            errors.push('failed result requires an error');
        if (result.error) {
            const expectedExit = exitCodeByError.get(result.error.code);
            if (exitCode !== expectedExit)
                errors.push(
                    `${result.error.code} requires exit ${expectedExit}`,
                );
            if (result.error.code === 'CANCELLED')
                errors.push('CANCELLED requires cancelled status');
        }
    }
}

export async function validateStream(source, { exitCode }) {
    const errors = [];
    const events = parseJsonl(source, errors);
    const compiled = await validators();
    const toolCalls = new Map();
    let messageContent = '';
    let init;
    let result;
    const terminalErrors = [];
    let terminalErrorIndex = -1;

    for (const [index, event] of events.entries()) {
        if (
            !event ||
            typeof event !== 'object' ||
            Array.isArray(event) ||
            typeof event.type !== 'string'
        ) {
            errors.push(
                `line ${index + 1} must contain an event object with a string type`,
            );
            continue;
        }

        const validate = compiled.events.get(event.type);
        if (validate && !validate(event)) {
            errors.push(
                `line ${index + 1} ${event.type} schema: ${JSON.stringify(validate.errors)}`,
            );
        }
        if (
            terminalErrorIndex >= 0 &&
            index === terminalErrorIndex + 1 &&
            event.type !== 'result'
        ) {
            errors.push(
                'non-recoverable error must be followed immediately by result',
            );
        }

        if (event.type === 'init') {
            if (index !== 0) errors.push('init must be the first event');
            if (init) errors.push('init must occur exactly once');
            init ??= event;
        } else if (event.type === 'result') {
            if (index !== events.length - 1)
                errors.push('result must be the last event');
            if (result) errors.push('result must occur exactly once');
            result ??= event;
        } else if (event.type === 'message') {
            messageContent += event.delta;
        } else if (event.type === 'tool_use') {
            if (toolCalls.has(event.toolCallId))
                errors.push(`duplicate tool_use ${event.toolCallId}`);
            else toolCalls.set(event.toolCallId, false);
        } else if (event.type === 'tool_result') {
            if (!toolCalls.has(event.toolCallId))
                errors.push(
                    `tool_result references unknown ${event.toolCallId}`,
                );
            else if (toolCalls.get(event.toolCallId))
                errors.push(`duplicate tool_result ${event.toolCallId}`);
            else toolCalls.set(event.toolCallId, true);
            if (event.status === 'success' && event.error !== null) {
                errors.push('successful tool_result requires error null');
            }
            if (event.status !== 'success' && event.error === null) {
                errors.push(`${event.status} tool_result requires an error`);
            }
            if (
                event.status === 'cancelled' &&
                event.error?.code !== 'CANCELLED'
            ) {
                errors.push('cancelled tool_result requires CANCELLED');
            }
        } else if (event.type === 'error' && event.recoverable === false) {
            terminalErrors.push(event.code);
            terminalErrorIndex = index;
        }
    }

    if (!init) errors.push('missing init');
    if (!result) errors.push('missing result');
    for (const [toolCallId, completed] of toolCalls) {
        if (!completed) errors.push(`missing tool_result ${toolCallId}`);
    }
    if (result && result.content !== messageContent)
        errors.push('message content does not equal result.content');
    if (init && result && init.requestId !== result.requestId)
        errors.push('init/result requestId mismatch');
    if (init && result && init.sessionId !== result.sessionId)
        errors.push('init/result sessionId mismatch');
    if (result && terminalErrors.length > 0) {
        if (result.status === 'success')
            errors.push('non-recoverable error requires a non-success result');
        const terminalCode = terminalErrors.at(-1);
        if (result.error?.code !== terminalCode)
            errors.push('terminal error/result code mismatch');
    }
    if (
        result?.status === 'success' &&
        (init?.sessionId === null || init?.model === null)
    ) {
        errors.push('success init requires Session ID and model');
    }
    validateTerminal(result, exitCode, errors);

    return { valid: errors.length === 0, errors, events };
}

export async function validateFixture(name, options) {
    return validateStream(await readFile(fixturePath(name), 'utf8'), options);
}

export async function validateDocument(schemaName, value) {
    const compiled = await validators();
    let validate = compiled.documents.get(schemaName);
    if (!validate) {
        validate = compiled.ajv.compile(await readSchema(schemaName));
        compiled.documents.set(schemaName, validate);
    }
    const valid = validate(value);
    return {
        valid,
        errors: valid ? [] : [JSON.stringify(validate.errors)],
    };
}
