# Do not expose raw chain of thought

Jiaorong CLI will not make a model's private raw chain of thought part of its public output contract. A Headless Run may emit an optional Reasoning Summary intended for user display; when none is available, consumers may show a generic in-progress state without treating missing reasoning text as a protocol failure.
