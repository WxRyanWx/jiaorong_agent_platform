# macOS App Name Identity Spec

## Goal

On macOS, JiaorongAI should identify itself as the active application when its window is focused,
so the menu bar shows JiaorongAI instead of Finder or the generic Electron host identity.

## Acceptance Criteria

- JiaorongAI sets its user-visible application name during main-process startup before windows are created.
- JiaorongAI declares a regular foreground macOS activation policy before startup windows are shown.
- When a JiaorongAI window becomes the active foreground app on macOS, the menu bar app label resolves to
  JiaorongAI rather than Finder.
- The change does not alter Windows or Linux startup behavior.

## Non-Goals

- No app icon, bundle identifier, or code-signing changes.
- No renderer UI changes.
- No shortcut or menu structure refactor.
