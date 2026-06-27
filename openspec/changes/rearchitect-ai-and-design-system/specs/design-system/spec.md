# Spec delta: design-system

## ADDED Requirements

### Requirement: Utility + variant styling foundation
The system SHALL style components with UnoCSS (attributify mode) for utilities
and CVA for component variants.

#### Scenario: A primitive uses utilities and variants
- **WHEN** a design-system primitive is rendered
- **THEN** its base/layout styling is expressed with Uno attributify utilities
- **AND** its stateful variants are produced by a CVA variant function

### Requirement: Lit primitives render to light DOM
The system SHALL render Lit design-system components into light DOM so global
Uno utilities and CVA class strings apply inside them.

#### Scenario: Uno and CVA classes apply inside a Lit component
- **WHEN** a Lit primitive overrides its render root to light DOM
- **THEN** Uno utility attributes/classes on its template take effect
- **AND** CVA-generated class strings on its elements take effect

### Requirement: Single source of design tokens
The system SHALL define design tokens once and expose them so both React and
Lit components consume identical values.

#### Scenario: React and Lit share tokens
- **WHEN** the accent/spacing/type tokens are referenced
- **THEN** both React components and Lit components resolve them from one source
- **AND** changing a token updates both layers

### Requirement: React consumes Lit primitives
The system SHALL allow Lit custom-element primitives to be used within the React
tree with typed props.

#### Scenario: A Lit primitive is used inside React
- **WHEN** a React view renders a Lit design-system element
- **THEN** the element receives typed props/attributes
- **AND** renders correctly within the React-managed DOM

### Requirement: Core primitives are extracted
The system SHALL extract the core repeated UI pieces (menu card, sticky note,
primary button) into reusable design-system primitives.

#### Scenario: Repeated UI is componentized
- **WHEN** the menu list, notes, and primary action are rendered
- **THEN** each is produced by a named design-system primitive
- **AND** the same primitive is reused rather than re-implemented inline
