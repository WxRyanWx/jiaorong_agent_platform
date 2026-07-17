# Plan

1. Add a root-level `auxiliary-runtime` module with a small request/response/event protocol.
2. Bundle its entry separately and launch it through Electron `utilityProcess`.
3. Expose a main-process client for isolated display capture.
4. Keep display capture isolated on every platform.
5. Load the global input hook from the private highlighted-text module in the application process
   on every platform. The isolation goal is to keep implementation out of `src/main`, not to force
   the hook across a process boundary.
6. Add focused protocol/client tests and run formatting, lint, type checking, and relevant tests.

The utility process is lazy-started. A crash rejects pending calls, clears hook subscriptions, and
allows the next operation to start a fresh host.
