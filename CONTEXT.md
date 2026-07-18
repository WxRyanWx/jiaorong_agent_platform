# Jiaorong CLI Integration

This context defines the product boundaries involved in connecting Jiaorong CLI to Workbuddian without treating either product's private protocol as a universal standard.

## Language

**Jiaorong CLI**:
The independently executable Agent CLI intended to serve as a future agent backend for Workbuddian. Its command name is `jiaorong-cli`.
_Avoid_: Workbuddian CLI, universal agent CLI

**Workbuddian**:
The Obsidian plugin that presents agent capabilities to users and consumes an external agent interface.
_Avoid_: Jiaorong CLI, agent backend

**CodeBuddy CLI**:
The existing agent interface currently consumed by Workbuddian and used as the baseline for required capability coverage.
_Avoid_: Workbuddian protocol, universal protocol

**Replacement Readiness**:
The condition in which Jiaorong CLI covers the agreed agent capabilities and behavioral guarantees required for Workbuddian to switch from CodeBuddy in a later release.
_Avoid_: byte-for-byte compatibility, immediate migration

**Agent Session**:
A durable conversation owned by one agent backend that preserves continuity across separate CLI invocations and machine restarts.
_Avoid_: UI chat tab, request, process

**Session ID**:
The stable identifier returned by Jiaorong CLI and supplied by a consumer to continue the same Agent Session.
_Avoid_: conversation ID, process ID, request ID

**Permission Mode**:
The caller-selected policy that determines which categories of agent action may execute during one Headless Run without interactive approval.
_Avoid_: user role, operating-system permission, prompt instruction

**Headless Run**:
One non-interactive Jiaorong CLI invocation that accepts a task, executes an agent turn, emits machine-readable output, and terminates.
_Avoid_: Agent Session, background service, desktop automation

**Reasoning Summary**:
An optional, user-displayable summary of the agent's reasoning that does not expose or promise the model's private raw chain of thought.
_Avoid_: raw thinking, chain of thought, debug trace

**Terminal Result**:
The single final protocol event that states the outcome of a Headless Run and closes its event stream.
_Avoid_: last message, process close, tool result

**Model ID**:
The stable identifier advertised by Jiaorong CLI and supplied by a consumer to select a model for a Headless Run.
_Avoid_: display name, hard-coded menu label, provider nickname

**Protocol Version**:
The major compatibility number declared by Jiaorong CLI at the start of a machine-readable Headless Run.
_Avoid_: CLI package version, model version, schema revision

**Machine Error Code**:
A stable symbolic code that identifies a failure condition independently of localized or changing display text.
_Avoid_: exit code, error message, stack trace

**Protocol Conformance Suite**:
The deterministic tests and fixtures that decide whether a Jiaorong CLI build satisfies the published machine protocol and Workbuddian integration contract.
_Avoid_: live-model evaluation, UI snapshot suite, manual checklist

**Project Root**:
The working directory whose contents form the default file and command scope of one Agent Session.
_Avoid_: Vault, repository, unrestricted filesystem

**Additional Directory**:
A caller-authorized directory outside the Project Root that may be accessed during a Headless Run.
_Avoid_: attachment, global file permission

**Attachment**:
A caller-selected file supplied explicitly to one Headless Run as agent input while remaining subject to the Project Root and Additional Directory boundaries.
_Avoid_: Additional Directory, prompt path, embedded JSONL binary
