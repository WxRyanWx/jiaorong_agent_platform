# Jiaorong CLI

This context defines the product boundary for running real JiaorongAI capabilities from a terminal without modifying or reimplementing JiaorongAI.

## Language

**Jiaorong CLI**:
The independently executable command-line product whose command is `jiaorong-cli`. It owns public arguments, output formats, protocol validation, and error projection.
_Avoid_: desktop replacement, universal agent protocol

**JiaorongAI**:
The installed macOS application that owns account state, providers, models, sessions, tools, skills, and persistence. Version `0.5.6` is the only supported App Backend version in the first release.
_Avoid_: CLI runtime, fixture backend

**App Backend**:
The production adapter that safely connects Jiaorong CLI to a verified, loopback-only JiaorongAI bridge and projects application snapshots into the public CLI protocol.
_Avoid_: GUI automation, database adapter, copied agent runtime

**App Runtime**:
The component that checks application installation, process state, debugging endpoint ownership, supported version, and safe launch conditions. It never silently restarts a running application.
_Avoid_: application owner, updater

**Deepchat Bridge**:
The verified `window.deepchat` interface exposed by JiaorongAI. Jiaorong CLI invokes allowlisted routes and receives allowlisted events through CDP.
_Avoid_: arbitrary JavaScript evaluation, universal IPC API

**Agent Session**:
A durable conversation owned and persisted by JiaorongAI that preserves continuity across separate CLI invocations.
_Avoid_: UI chat tab, request, process

**Session ID**:
The stable identifier returned by Jiaorong CLI and supplied by a caller to continue the same Agent Session.
_Avoid_: process ID, request ID

**Permission Mode**:
The caller-selected policy applied through JiaorongAI for one Headless Run. The default mode must not wait for interactive terminal approval.
_Avoid_: user role, operating-system permission, prompt instruction

**Headless Run**:
One non-interactive Jiaorong CLI invocation that accepts a task, executes a real JiaorongAI agent turn, emits the selected output, and terminates.
_Avoid_: Agent Session, background service, independent agent runtime

**Reasoning Summary**:
An optional, user-displayable summary supplied by JiaorongAI that does not expose or promise private raw chain of thought.
_Avoid_: raw thinking, chain of thought, debug trace

**Terminal Result**:
The single final protocol event that states the outcome of a Headless Run and closes its event stream.
_Avoid_: last message, process close, tool result

**Model ID**:
The stable identifier discovered from JiaorongAI and supplied by a caller to select a model.
_Avoid_: display name, hard-coded menu label, provider nickname

**Protocol Version**:
The major compatibility number declared by Jiaorong CLI at the start of a machine-readable Headless Run.
_Avoid_: CLI package version, application version, model version

**Machine Error Code**:
A stable symbolic code that identifies a failure independently of localized or changing display text.
_Avoid_: exit code, error message, stack trace

**Deterministic Conformance Inventory**:
The active protocol cases executed without live model credentials through public process I/O and deterministic fixtures or a fake loopback bridge.
_Avoid_: live application smoke, deferred case list, total historical inventory

**Live JiaorongAI Inventory**:
Release-blocking cases that require the installed, supported JiaorongAI application and a usable real model.
_Avoid_: deterministic fixture suite, inferred compatibility

**Deferred Inventory**:
Historical or future-product cases that are retained for traceability but are not active requirements and must never count as missing deterministic coverage.
_Avoid_: skipped test, accepted failure

**Project Root**:
The working directory whose contents form the default file and command scope of one Agent Session.
_Avoid_: unrestricted filesystem

**Additional Directory**:
A caller-authorized directory outside the Project Root that may be accessed during a Headless Run.
_Avoid_: attachment, global file permission

**Attachment**:
A caller-selected file supplied explicitly to one Headless Run while remaining subject to Project Root and Additional Directory boundaries.
_Avoid_: Additional Directory, prompt path, embedded JSONL binary
