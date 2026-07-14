# Plan

1. Render the simple pin image in a self-contained data document instead of booting the main Vue renderer.
2. Reveal the pin window only after Electron reports that document loading finished.
3. Warm and cache one Tesseract worker, serialize recognition calls, and reset the cache after failures.
4. Add timing logs for pin document load and OCR worker initialization/recognition.
5. Validate formatting, lint, types, and focused tests.

No IPC or persisted-data migration is required.
