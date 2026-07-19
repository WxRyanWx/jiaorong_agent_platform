import assert from 'node:assert/strict';
import { test } from 'node:test';

test('shell canary prompts exercise the native metacharacters on each platform', async () => {
    await assert.doesNotReject(async () => {
        const { buildShellCanaryPrompt } = await import(
            '../src/conformance/shell-canary.mjs'
        );
        const posix = buildShellCanaryPrompt('darwin', '/tmp/canary');
        assert.match(posix, /中文 line\nquotes "/);
        assert.match(posix, /\$\(touch '\/tmp\/canary'\)/);
        assert.match(posix, /`touch '\/tmp\/canary'`/);

        const windows = buildShellCanaryPrompt(
            'win32',
            'C:\\Temp\\canary',
        );
        assert.match(windows, /\$\(literal\)/);
        assert.match(windows, /`literal`/);
        assert.match(windows, /& type nul > "C:\\Temp\\canary" &/);
    });
});
