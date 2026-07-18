# Separate deterministic conformance from live-model tests

Every change to Jiaorong CLI will be blocked by the deterministic Protocol Conformance Suite, including schema, event ordering, process behavior, exit and error codes, cancellation, boundaries, and Workbuddian-adapter fixtures using fake model and tool backends. Live-model tests will run on a schedule and before release, will assert protocol behavior, session continuity, and observable tool effects rather than exact natural-language output, and will block releases but not every pull request.
