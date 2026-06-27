# Spec delta: task-generation

## ADDED Requirements

### Requirement: Server-side generation boundary
The system SHALL generate the task menu through a single server-side function
that holds the NIM API key, so the secret is never delivered to the browser.

#### Scenario: Brain dump is generated server-side
- **WHEN** the client submits a brain-dump to `POST /api/untangle`
- **THEN** the function calls the NIM model using a server-only secret
- **AND** returns the generated menu as JSON to the client
- **AND** no NIM credential appears in any client bundle or network response

#### Scenario: Function is runtime-portable
- **WHEN** the function is deployed
- **THEN** it is implemented as a Web `Request → Response` handler
- **AND** runs unchanged on a serverless platform or a self-hosted Node process

### Requirement: Fast deterministic instruct generation
The system SHALL use a fast NIM instruct model with low temperature and
structured JSON output so responses are quick and near-deterministic.

#### Scenario: Generation completes within platform limits
- **WHEN** a brain-dump of up to 650 words is submitted
- **THEN** the model is an instruct (non-reasoning) model at temperature ≤ 0.3
- **AND** the response is returned within the host function timeout

#### Scenario: No reasoning trace leaks to output
- **WHEN** the model returns its completion
- **THEN** the parsed payload contains only schema fields
- **AND** no chain-of-thought or `<think>` content is present

### Requirement: Schema-validated output
The system SHALL validate model output against a Zod schema inside the function,
so the client only ever receives a shape that matched the schema.

#### Scenario: Valid output passes through
- **WHEN** the model returns JSON matching the menu schema
- **THEN** the function returns the parsed, typed menu to the client

#### Scenario: Invalid output never reaches the client
- **WHEN** the model returns malformed or schema-violating JSON
- **THEN** the function does not forward the raw payload
- **AND** returns a typed error response instead

### Requirement: Typed failure handling
The system SHALL model the NIM call, decode, retry, and timeout as a typed
pipeline so failures are handled explicitly rather than thrown loosely.

#### Scenario: Transient upstream failure is retried then surfaced
- **WHEN** the NIM call times out or returns a 5xx
- **THEN** the function retries within a bounded budget
- **AND** if still failing, returns a typed error the client renders gracefully

### Requirement: Source traceability preserved
The system SHALL include for each menu item an exact `sourceTrigger` substring
locatable in the original input, preserving bidirectional source highlighting.

#### Scenario: Each item is traceable to the input
- **WHEN** the menu is generated
- **THEN** every item's `sourceTrigger` is an exact substring of the input text
- **AND** the client can locate it via string search to highlight the source

### Requirement: Language matching
The system SHALL produce all generated copy in the same language as the input.

#### Scenario: Output matches input language
- **WHEN** the input is written in a given language
- **THEN** `dishName`, `quantity`, and `expertAdvice` are in that same language
