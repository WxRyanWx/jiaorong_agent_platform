# Screenshot action latency

## User story

As a Windows user, I want pin and OCR actions to respond promptly after selecting a screenshot.

## Acceptance criteria

- Pin images no longer load the full application renderer bundle.
- A pin window remains hidden until its image document is ready, then appears in the selected location.
- OCR reuses the initialized Chinese/English Tesseract worker across sequential requests.
- OCR initialization begins in the background when a screenshot session opens.
- Concurrent OCR requests are serialized safely.
- Existing screenshot IPC payloads and visible behavior remain compatible.

## Non-goals

- Replacing Tesseract or changing recognition languages.
- Redesigning the pin or OCR result UI.
- Changing screenshot capture/export behavior.

## Constraints

- Pin content must not execute untrusted image data as markup or script.
- Failed OCR worker instances must be discarded so a later request can recover.
