import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
    fixturePath,
    validateFixture,
} from '../src/protocol/validate-fixture.mjs';

const expectedFixtures = [
    'success-text.jsonl',
    'success-reasoning.jsonl',
    'success-tool.jsonl',
    'tool-denied-then-success.jsonl',
    'tool-failed-terminal.jsonl',
    'auth-required.jsonl',
    'model-unavailable.jsonl',
    'timeout.jsonl',
    'turn-limit.jsonl',
    'cancelled.jsonl',
    'unknown-optional-field.jsonl',
    'unknown-nonterminal-event.jsonl',
    'unsupported-major.jsonl',
    'invalid-duplicate-init.jsonl',
    'invalid-missing-result.jsonl',
    'invalid-duplicate-result.jsonl',
    'invalid-tool-order.jsonl',
    'invalid-content-mismatch.jsonl',
];

test('the v1 golden fixture manifest covers the frozen conformance matrix', async () => {
    const manifest = JSON.parse(
        await readFile(fixturePath('manifest.json'), 'utf8'),
    );

    assert.deepEqual(
        Object.keys(manifest.fixtures).sort(),
        expectedFixtures.toSorted(),
    );

    for (const [name, expected] of Object.entries(manifest.fixtures)) {
        assert.match(
            expected.reason,
            /\S/,
            `${name} must explain its expected result`,
        );
        const result = await validateFixture(name, {
            exitCode: expected.exitCode,
        });
        assert.equal(
            result.valid,
            expected.accept,
            `${name}: ${result.errors.join('; ')}`,
        );
    }
});
