# Spec delta: adaptive-motion

## ADDED Requirements

### Requirement: Personalization signal block
The system SHALL return a small, schema-validated personalization signal block
alongside the menu, capturing `mood`, `energy`, `domain`, and `language`.

#### Scenario: Signals accompany the menu
- **WHEN** a brain-dump is generated
- **THEN** the response includes a signal block validated by the same boundary
- **AND** each signal is constrained to a known enumerated or bounded value

### Requirement: Signals deterministically drive motion
The system SHALL map personalization signals to motion parameters via a pure,
deterministic function.

#### Scenario: Energy modulates motion intensity
- **WHEN** the signal `energy` is high
- **THEN** animation parameters resolve to faster, bolder motion
- **AND** when `energy` is low they resolve to slower, calmer motion
- **AND** the same signals always produce the same motion parameters

### Requirement: Signals seed the color system
The system SHALL feed personalization signals into the existing color generator
so the result palette reflects detected mood and domain.

#### Scenario: Mood and domain seed color
- **WHEN** the menu is rendered
- **THEN** the header/accent color is derived from the signal block
- **AND** the existing contrast guarantee against the previous color is preserved

### Requirement: Reduced-motion is respected
The system SHALL clamp motion intensity when the user prefers reduced motion.

#### Scenario: Reduced-motion preference clamps animation
- **WHEN** the user's environment reports `prefers-reduced-motion: reduce`
- **THEN** motion parameters are clamped to a minimal, non-distracting level

### Requirement: Step-based loading choreography
The system SHALL render the loading state as a single GSAP timeline with labeled
beats that are advanced by the real lifecycle events from the `instrumentation`
capability, not by timers.

#### Scenario: Beats advance on real events
- **WHEN** a lifecycle event fires (e.g. structuring, validated)
- **THEN** the timeline tweens to the corresponding labeled beat
- **AND** a seamless holding loop plays while awaiting the next event

#### Scenario: Fast and slow responses both stay smooth
- **WHEN** the response returns quickly
- **THEN** remaining beats catch up without hard cuts
- **AND WHEN** the response is slow, the holding loop covers the wait without
  displaying fabricated progress

### Requirement: Layered SVG step visuals
The system SHALL build the per-step loading visuals as hand-authored layered
inline SVG animated by GSAP, adding no runtime art-player weight.

#### Scenario: Each step animates distinct SVG layers
- **WHEN** the choreography reaches a step
- **THEN** GSAP animates that step's SVG layer(s) (e.g. draw, stagger, morph)

### Requirement: Lottie hero on success
The system SHALL play a single Lottie hero animation at the success moment,
loaded lazily so it does not weigh the initial bundle.

#### Scenario: Hero plays on completion
- **WHEN** the machine transitions to success
- **THEN** the Lottie hero animation plays once
- **AND** its player is loaded only for that view, not in the initial bundle

### Requirement: Reduced-motion fallback for loading
The system SHALL collapse the loading choreography to a minimal low-motion
indicator when reduced motion is preferred.

#### Scenario: Reduced motion simplifies loading
- **WHEN** the user's environment reports `prefers-reduced-motion: reduce`
- **THEN** the timeline and Lottie hero are replaced by a minimal cross-fade or
  static indicator

### Requirement: Personalization is client-only and unstored
The system SHALL keep personalization request-scoped and SHALL NOT persist
signals or brain-dump content server-side.

#### Scenario: No server-side persistence
- **WHEN** a generation request completes
- **THEN** neither the brain-dump nor the derived signals are stored on the server
