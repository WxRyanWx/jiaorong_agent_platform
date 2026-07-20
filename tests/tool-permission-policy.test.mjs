import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';

import { shouldGrantToolPermission } from '../src/app/tool-permission-policy.mjs';

function fileInteraction({ toolName = 'read', inputPath, requestPath = inputPath }) {
    const permissionType = ['write', 'edit'].includes(toolName)
        ? 'write'
        : 'read';
    return {
        tool: { name: toolName, input: { path: inputPath } },
        permission: {
            toolName,
            serverName: 'agent-filesystem',
            permissionType,
            paths: [requestPath],
        },
    };
}

test('tool permission policy grants only correlated full-access file targets inside authorized roots', async () => {
    const projectRoot = await mkdtemp(
        resolve(tmpdir(), 'jiaorong-cli-policy-root-'),
    );
    const additionalDirectory = await mkdtemp(
        resolve(tmpdir(), 'jiaorong-cli-policy-additional-'),
    );
    const outsideDirectory = await mkdtemp(
        resolve(tmpdir(), 'jiaorong-cli-policy-outside-'),
    );
    const fileScope = { projectRoot, additionalDirectories: [additionalDirectory] };
    try {
        const authorized = resolve(additionalDirectory, 'authorized.txt');
        assert.equal(
            await shouldGrantToolPermission({
                permissionMode: 'full_access',
                interaction: fileInteraction({ inputPath: authorized }),
                fileScope,
            }),
            true,
        );
        assert.equal(
            await shouldGrantToolPermission({
                permissionMode: 'default',
                interaction: fileInteraction({ inputPath: authorized }),
                fileScope,
            }),
            false,
        );
        assert.equal(
            await shouldGrantToolPermission({
                permissionMode: 'full_access',
                interaction: {
                    tool: {
                        name: 'glob',
                        input: {
                            options: {
                                pathScope: [
                                    authorized,
                                    resolve(outsideDirectory, 'outside'),
                                ],
                            },
                        },
                    },
                    permission: {
                        toolName: 'glob',
                        serverName: 'agent-filesystem',
                        permissionType: 'read',
                        paths: [authorized],
                    },
                },
                fileScope,
            }),
            false,
        );
        assert.equal(
            await shouldGrantToolPermission({
                permissionMode: 'full_access',
                interaction: {
                    tool: {
                        name: 'grep',
                        input: {
                            pathScope: [authorized, '../outside'],
                        },
                    },
                    permission: {
                        toolName: 'grep',
                        serverName: 'agent-filesystem',
                        permissionType: 'read',
                        paths: [authorized],
                    },
                },
                fileScope,
            }),
            false,
        );
        assert.equal(
            await shouldGrantToolPermission({
                permissionMode: 'full_access',
                interaction: fileInteraction({
                    inputPath: resolve(outsideDirectory, 'outside.txt'),
                }),
                fileScope,
            }),
            false,
        );
        assert.equal(
            await shouldGrantToolPermission({
                permissionMode: 'full_access',
                interaction: fileInteraction({
                    inputPath: authorized,
                    requestPath: resolve(additionalDirectory, 'crossed.txt'),
                }),
                fileScope,
            }),
            false,
        );
    } finally {
        await Promise.all([
            rm(projectRoot, { recursive: true, force: true }),
            rm(additionalDirectory, { recursive: true, force: true }),
            rm(outsideDirectory, { recursive: true, force: true }),
        ]);
    }
});

test('tool permission policy never grants Shell or unknown tools', async () => {
    const projectRoot = await mkdtemp(
        resolve(tmpdir(), 'jiaorong-cli-policy-shell-'),
    );
    const fileScope = { projectRoot, additionalDirectories: [] };
    const shell = (command, cwd = projectRoot) => ({
        tool: { name: 'exec', input: { command, cwd } },
        permission: {
            toolName: 'exec',
            serverName: 'agent-filesystem',
            permissionType: 'command',
            command,
        },
    });
    try {
        assert.equal(
            await shouldGrantToolPermission({
                permissionMode: 'full_access',
                interaction: shell('cat /tmp/outside'),
                fileScope,
            }),
            false,
        );
        assert.equal(
            await shouldGrantToolPermission({
                permissionMode: 'full_access',
                interaction: {
                    tool: { name: 'unknown', input: {} },
                    permission: {
                        toolName: 'unknown',
                        serverName: 'plugin',
                        permissionType: 'write',
                    },
                },
                fileScope,
            }),
            false,
        );
    } finally {
        await rm(projectRoot, { recursive: true, force: true });
    }
});

test('tool permission policy denies unknown top-level and nested input fields', async () => {
    const projectRoot = await mkdtemp(
        resolve(tmpdir(), 'jiaorong-cli-policy-schema-'),
    );
    const target = resolve(projectRoot, 'target.txt');
    const fileScope = { projectRoot, additionalDirectories: [] };
    const permission = {
        toolName: 'read',
        serverName: 'agent-filesystem',
        permissionType: 'read',
        paths: [target],
    };
    try {
        for (const [name, input] of [
            ['read', { path: target, unexpected: true }],
            [
                'glob',
                {
                    query: 'target',
                    options: { pathScope: [target], unexpected: true },
                },
            ],
            [
                'grep',
                {
                    query: 'target',
                    pathScope: [target],
                    unexpected: true,
                },
            ],
        ]) {
            assert.equal(
                await shouldGrantToolPermission({
                    permissionMode: 'full_access',
                    interaction: {
                        tool: { name, input },
                        permission: {
                            ...permission,
                            toolName: name,
                        },
                    },
                    fileScope,
                }),
                false,
            );
        }
    } finally {
        await rm(projectRoot, { recursive: true, force: true });
    }
});
