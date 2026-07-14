# Highlighted text toggle

## User story

As a user, I can enable or disable the global highlighted-text component from General Settings.

## Acceptance criteria

- General Settings contains an "Enable highlighted-text component" toggle.
- The setting is persisted and defaults to enabled for existing and new users.
- Disabling stops global selection listeners and closes associated popup windows immediately.
- Enabling restores the selection listeners without restarting the application.

## Non-goals

- Changing selection, translation, or explanation behavior while the feature is enabled.

