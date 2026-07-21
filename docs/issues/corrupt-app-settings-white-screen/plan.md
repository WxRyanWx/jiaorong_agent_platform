# Plan: recover from corrupt JSON stores at config init

## Approach

1. Add a small helper that validates a JSON store file before `ElectronStore` construction.
2. On `JSON.parse` failure: rename to `<name>.json.corrupt-<iso-timestamp>`, then allow `ElectronStore` to create defaults.
3. Also set `clearInvalidConfig: true` on critical stores as a belt-and-suspenders guard if a race recreates a bad parse path.
4. Call the helper for stores created in `ConfigPresenter` constructor: `app-settings`, `custom_prompts`, `system_prompts`.

## Data flow

```
configInitHook
  → new ConfigPresenter()
    → prepareJsonStoreFile(userData, name)  // quarantine if needed
    → new ElectronStore({ name, clearInvalidConfig: true, defaults })
```

## Compatibility

- Existing valid installs: no behavior change.
- Corrupt installs: lose in-memory settings from that file (providers may fall back to defaults / SQLite-backed stores where already migrated). Quarantine keeps the broken file for support.
- Does not wipe `app_db`, Local Storage, or other userData directories.

## Test strategy

- Unit-test `quarantineInvalidJsonFile` / `prepareJsonStoreFile` with temp dirs (vitest + fs).
- No Electron app launch required for the helper tests.
