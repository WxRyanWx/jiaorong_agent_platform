# Plan

1. Render the simple pin image in a dedicated lightweight HTML resource instead of booting the main Vue renderer.
2. Reveal the pin window only after Electron reports that document loading finished.
3. Render the OCR loading/result UI in a dedicated lightweight HTML resource and preserve copy/preview behavior.
4. Warm and cache one Tesseract worker, serialize recognition calls, and reset the cache after failures.
5. Add timing logs for feature document load and OCR worker initialization/recognition.
6. Load and cache `node-screenshots` directly from `jiaorong_src/screenShot` in the application
   process, removing helper cold-start and RGBA transfer latency without adding implementation to
   `src/main`.
7. Validate formatting, lint, types, and focused tests.

No IPC or persisted-data migration is required.
