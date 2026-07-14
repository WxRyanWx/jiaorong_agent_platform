# Plan

1. Add a typed boolean setting with an enabled-by-default snapshot fallback.
2. Expose the setting through the existing UI settings store and General Settings toggle row.
3. Let the main process apply startup state and react to setting-change events.
4. Make highlighted-text shutdown safe for later reinitialization.
5. Add focused contract/store tests and run quality checks.

