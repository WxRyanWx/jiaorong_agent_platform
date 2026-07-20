import { realpath, stat } from 'node:fs/promises';
import {
    basename,
    dirname,
    isAbsolute,
    relative,
    resolve,
    sep,
} from 'node:path';

const MAX_PERMISSION_PATHS = 16;
const MAX_PATH_BYTES = 4_096;
const FILE_TOOL_PERMISSIONS = new Map([
    ['read', 'read'],
    ['write', 'write'],
    ['edit', 'write'],
    ['glob', 'read'],
    ['grep', 'read'],
]);

function validPath(value) {
    return (
        typeof value === 'string' &&
        value.length > 0 &&
        Buffer.byteLength(value, 'utf8') <= MAX_PATH_BYTES &&
        !/[\u0000-\u001f\u007f]/u.test(value)
    );
}

function hasOnlyKeys(value, keys) {
    const allowed = new Set(keys);
    return Object.keys(value).every((key) => allowed.has(key));
}

function validOptionalInteger(value, { minimum = 0, maximum } = {}) {
    return (
        value === undefined ||
        (Number.isInteger(value) &&
            value >= minimum &&
            (maximum === undefined || value <= maximum))
    );
}

function validFileToolInput(toolName, input) {
    const keys = {
        read: ['path', 'offset', 'limit', 'base_directory'],
        write: ['path', 'content', 'base_directory'],
        edit: [
            'path',
            'oldText',
            'newText',
            'replaceAll',
            'base_directory',
        ],
    }[toolName];
    if (!hasOnlyKeys(input, keys) || !validPath(input.path)) return false;
    if (
        input.base_directory !== undefined &&
        !validPath(input.base_directory)
    )
        return false;
    if (toolName === 'read')
        return (
            validOptionalInteger(input.offset) &&
            validOptionalInteger(input.limit, { minimum: 1 })
        );
    if (toolName === 'write') return typeof input.content === 'string';
    return (
        typeof input.oldText === 'string' &&
        Buffer.byteLength(input.oldText, 'utf8') <= 10_000 &&
        typeof input.newText === 'string' &&
        Buffer.byteLength(input.newText, 'utf8') <= 10_000 &&
        (input.replaceAll === undefined || typeof input.replaceAll === 'boolean')
    );
}

function validSearchToolInput(toolName, input) {
    if (toolName === 'glob') {
        if (!hasOnlyKeys(input, ['query', 'options'])) return false;
        if (typeof input.query !== 'string' || input.query.length === 0)
            return false;
        if (
            input.options === null ||
            typeof input.options !== 'object' ||
            Array.isArray(input.options) ||
            !hasOnlyKeys(input.options, [
                'pathScope',
                'maxResults',
                'currentFile',
            ])
        )
            return false;
        return (
            validOptionalInteger(input.options.maxResults, {
                minimum: 1,
                maximum: 200,
            }) &&
            (input.options.currentFile === undefined ||
                typeof input.options.currentFile === 'string')
        );
    }
    return (
        hasOnlyKeys(input, [
            'query',
            'pathScope',
            'contextLines',
            'maxResults',
            'mode',
        ]) &&
        typeof input.query === 'string' &&
        input.query.length > 0 &&
        validOptionalInteger(input.contextLines, { maximum: 5 }) &&
        validOptionalInteger(input.maxResults, { minimum: 1, maximum: 200 }) &&
        (input.mode === undefined ||
            ['plain', 'regex', 'fuzzy'].includes(input.mode))
    );
}

function contains(root, target) {
    const pathFromRoot = relative(root, target);
    return (
        pathFromRoot === '' ||
        (!pathFromRoot.startsWith(`..${sep}`) &&
            pathFromRoot !== '..' &&
            !isAbsolute(pathFromRoot))
    );
}

async function canonicalTarget(target) {
    const absolute = resolve(target);
    try {
        return await realpath(absolute);
    } catch {
        let ancestor = dirname(absolute);
        const suffix = [basename(absolute)];
        while (ancestor !== dirname(ancestor)) {
            try {
                const canonicalAncestor = await realpath(ancestor);
                const ancestorStat = await stat(canonicalAncestor);
                if (!ancestorStat.isDirectory()) return null;
                return resolve(canonicalAncestor, ...suffix.reverse());
            } catch {
                suffix.push(basename(ancestor));
                ancestor = dirname(ancestor);
            }
        }
        return null;
    }
}

async function canonicalRoots(fileScope) {
    const roots = await Promise.all(
        [
            fileScope.projectRoot,
            ...fileScope.additionalDirectories,
        ].map(canonicalTarget),
    );
    return roots.some((root) => root === null) ? null : roots;
}

function inputTargets(toolName, input, projectRoot) {
    if (input === null || typeof input !== 'object' || Array.isArray(input))
        return null;
    if (
        ['read', 'write', 'edit'].includes(toolName)
            ? !validFileToolInput(toolName, input)
            : !validSearchToolInput(toolName, input)
    )
        return null;
    const baseDirectory = input.base_directory ?? projectRoot;
    if (!validPath(baseDirectory)) return null;
    if (['read', 'write', 'edit'].includes(toolName)) {
        if (!validPath(input.path)) return null;
        return [resolve(baseDirectory, input.path)];
    }
    const pathScope =
        toolName === 'glob' ? input.options?.pathScope : input.pathScope;
    if (!Array.isArray(pathScope)) return null;
    const targets = [];
    for (const scope of pathScope) {
        if (!validPath(scope) || /[*?[{]/u.test(scope) || scope.includes('..'))
            return null;
        targets.push(resolve(baseDirectory, scope));
    }
    return targets;
}

async function filePermissionAllowed({ interaction, fileScope }) {
    const { tool, permission } = interaction;
    const expectedPermission = FILE_TOOL_PERMISSIONS.get(tool.name);
    if (
        permission.serverName !== 'agent-filesystem' ||
        permission.permissionType !== expectedPermission ||
        !Array.isArray(permission.paths) ||
        permission.paths.length === 0 ||
        permission.paths.length > MAX_PERMISSION_PATHS ||
        !permission.paths.every(
            (target) => validPath(target) && isAbsolute(target),
        )
    )
        return false;

    const targets = inputTargets(tool.name, tool.input, fileScope.projectRoot);
    if (targets === null || targets.length === 0) return false;
    const canonicalInputs = await Promise.all(targets.map(canonicalTarget));
    const canonicalRequests = await Promise.all(
        permission.paths.map(canonicalTarget),
    );
    if (
        canonicalInputs.some((target) => target === null) ||
        canonicalRequests.some((target) => target === null)
    )
        return false;

    const authorizedRoots = await canonicalRoots(fileScope);
    if (authorizedRoots === null) return false;
    const inputSet = new Set(canonicalInputs);
    const requestSet = new Set(canonicalRequests);
    return (
        inputSet.size === requestSet.size &&
        [...inputSet].every(
            (target) =>
                requestSet.has(target) &&
                authorizedRoots.some((root) => contains(root, target)),
        ) &&
        [...requestSet].every((target) =>
            authorizedRoots.some((root) => contains(root, target)),
        )
    );
}

export async function shouldGrantToolPermission({
    permissionMode,
    interaction,
    fileScope,
}) {
    if (permissionMode !== 'full_access') return false;
    if (FILE_TOOL_PERMISSIONS.has(interaction.tool.name))
        return filePermissionAllowed({ interaction, fileScope });
    return false;
}
