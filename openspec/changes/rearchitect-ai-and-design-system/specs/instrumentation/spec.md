# Spec delta: instrumentation

## ADDED Requirements

### Requirement: Lifecycle is driven by a state machine
The system SHALL drive the generation lifecycle with a state machine spanning
`idle`, `loading`, `success`, and `error` states.

#### Scenario: Submission transitions through real states
- **WHEN** the user submits a brain-dump
- **THEN** the machine transitions `idle → loading`
- **AND** on a validated response transitions `loading → success`
- **AND** on a typed failure transitions `loading → error`

### Requirement: Honest, real-time trace events
The system SHALL render the on-screen trace panel from real, timestamped events
emitted by the state machine and the generation pipeline.

#### Scenario: Trace lines correspond to real events
- **WHEN** the trace panel displays a log line
- **THEN** that line corresponds to an actual state transition or pipeline step
- **AND** carries the timestamp at which the event occurred

#### Scenario: No fabricated telemetry exists
- **WHEN** the codebase is inspected
- **THEN** no timer-driven or hard-coded fake log lines (e.g. "tensor buffer",
  "MoE layer", "rerouting packets") are present

### Requirement: Guards and context are visible
The system SHALL surface validation guard outcomes and detected personalization
context in the trace panel.

#### Scenario: Validation guard outcome is shown
- **WHEN** schema validation passes or fails
- **THEN** the panel shows the guard outcome as a trace line

#### Scenario: Detected context is shown
- **WHEN** the response includes personalization signals
- **THEN** the panel shows the detected signals as "context"

### Requirement: Pluggable trace sink
The system SHALL expose a single trace hook in the generation function so an
external sink (e.g. Langfuse) can be added without changing call sites.

#### Scenario: Trace sink is swappable
- **WHEN** an external observability backend is later adopted
- **THEN** it is wired by implementing the single trace hook
- **AND** no generation call sites require modification
