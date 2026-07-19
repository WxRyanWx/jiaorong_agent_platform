import { CliFailure } from './failures.mjs';

const outputFormats = new Set(['text', 'json', 'stream-json']);
const permissionModes = new Set([
    'plan',
    'default',
    'acceptEdits',
    'bypassPermissions',
]);

function takeValue(argv, index, flag) {
    const value = argv[index + 1];
    if (value === undefined) {
        throw new CliFailure(
            'INVALID_ARGUMENT',
            `${flag} requires a value.`,
            42,
        );
    }
    return value;
}

function positiveNumber(value, flag) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) {
        throw new CliFailure(
            'INVALID_ARGUMENT',
            `${flag} must be greater than zero.`,
            42,
            { protocolEligible: true },
        );
    }
    return number;
}

export function parseArgs(argv) {
    if (argv.length === 1 && argv[0] === '--version')
        return { command: 'version' };

    if (argv[0] === 'doctor') {
        const remaining = argv.slice(1);
        if (remaining.length === 0)
            return { command: 'doctor', outputFormat: 'text' };
        if (
            remaining.length === 2 &&
            remaining[0] === '--output-format' &&
            ['text', 'json'].includes(remaining[1])
        )
            return { command: 'doctor', outputFormat: remaining[1] };
        throw new CliFailure(
            'INVALID_ARGUMENT',
            'doctor accepts only --output-format text|json.',
            42,
        );
    }

    if (argv[0] === 'models') {
        const remaining = argv.slice(1);
        if (remaining.length === 1 && remaining[0] === 'list')
            return { command: 'models-list', outputFormat: 'text' };
        if (
            remaining.length === 3 &&
            remaining[0] === 'list' &&
            remaining[1] === '--output-format' &&
            ['text', 'json'].includes(remaining[2])
        )
            return { command: 'models-list', outputFormat: remaining[2] };
        throw new CliFailure(
            'INVALID_ARGUMENT',
            'models accepts only: models list [--output-format text|json].',
            42,
        );
    }

    const options = {
        command: 'run',
        prompt: undefined,
        outputFormat: 'text',
        modelId: undefined,
        permissionMode: 'default',
        resume: undefined,
        maxTurns: undefined,
        timeoutSeconds: undefined,
        additionalDirectories: [],
        files: [],
    };

    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        if (flag === '-p' || flag === '--prompt') {
            options.prompt = takeValue(argv, index, flag);
            index += 1;
        } else if (flag === '--output-format') {
            options.outputFormat = takeValue(argv, index, flag);
            index += 1;
            if (!outputFormats.has(options.outputFormat)) {
                throw new CliFailure(
                    'INVALID_ARGUMENT',
                    'Unknown output format.',
                    42,
                );
            }
        } else if (flag === '--model') {
            options.modelId = takeValue(argv, index, flag);
            index += 1;
        } else if (flag === '--permission-mode') {
            options.permissionMode = takeValue(argv, index, flag);
            index += 1;
            if (!permissionModes.has(options.permissionMode)) {
                throw new CliFailure(
                    'INVALID_ARGUMENT',
                    'Unknown permission mode.',
                    42,
                    { protocolEligible: true },
                );
            }
        } else if (flag === '--resume') {
            options.resume = takeValue(argv, index, flag);
            index += 1;
        } else if (flag === '--max-turns') {
            options.maxTurns = positiveNumber(
                takeValue(argv, index, flag),
                flag,
            );
            index += 1;
        } else if (flag === '--timeout') {
            options.timeoutSeconds = positiveNumber(
                takeValue(argv, index, flag),
                flag,
            );
            index += 1;
        } else if (flag === '--add-dir') {
            options.additionalDirectories.push(takeValue(argv, index, flag));
            index += 1;
        } else if (flag === '--file') {
            options.files.push(takeValue(argv, index, flag));
            index += 1;
        } else {
            throw new CliFailure(
                'INVALID_ARGUMENT',
                `Unknown argument: ${flag}`,
                42,
            );
        }
    }
    return options;
}

export function detectOutputFormat(argv) {
    const index = argv.lastIndexOf('--output-format');
    if (index < 0) return 'text';
    const format = argv[index + 1];
    return outputFormats.has(format) ? format : null;
}
