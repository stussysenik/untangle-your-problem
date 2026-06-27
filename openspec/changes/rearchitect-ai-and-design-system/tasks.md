# Tasks: rearchitect-ai-and-design-system

## 1. Foundation & dependencies
- [x] 1.1 Add deps: `zod`, `xstate`, `@xstate/react`, `lit`, `unocss`,
      `class-variance-authority`, `gsap`, `@temporalio/client`, `@temporalio/worker`,
      `@temporalio/workflow`, `@temporalio/activity`; remove `@google/genai`. No `effect`.
- [x] 1.2 Wire UnoCSS into `vite.config.ts` (attributify + wind presets) and port the
      existing `insight` accent + type/spacing into Uno theme tokens + CSS custom properties.
- [x] 1.3 Dev server boots; existing UI renders under Uno (visual parity, no behavior change).

## 2. AI boundary (task-generation)
- [x] 2.1 Define `src/ai/schema.ts`: Zod schemas for `MenuItem`, `Menu`,
      `PersonalizationSignals`, `UsageStats`; derive types via `z.infer`.
- [x] 2.2 Write `api/untangle.ts` as a Node.js Request→Response handler: reads brain-dump,
      starts a Temporal workflow, returns `{ workflowId }` immediately (202).
- [x] 2.3 Write `api/status.ts`: polls Temporal handle for description + full event history;
      returns `WorkflowStatus` (status + events array + result when COMPLETED).
- [x] 2.4 Add single `trace(event)` hook (console sink) in activities; seam for Langfuse.
- [x] 2.5 Write `src/ai/client.ts`: `startWorkflow` (POST /api/untangle) +
      `getWorkflowStatus` (GET /api/status) + convenience `fetchMenu` (poll-until-done).
- [x] 2.6 Remove `services/geminiService.ts`, `services/glmService.ts`,
      `services/aiProvider.ts`, and all `VITE_*` AI keys.
- [x] 2.7 TypeScript clean (`npx tsc --noEmit` → 0 errors); `vite build` succeeds.

## 3. Lifecycle & honest instrumentation (instrumentation)
- [x] 3.1 Write `temporal/workflow.ts`: `untangleWorkflow(text)` calls `callNIM` activity
      with 45 s startToClose timeout + 3 retry attempts.
- [x] 3.2 Write `temporal/activities.ts`: `callNIM` → NIM call + Zod decode + heartbeat.
- [x] 3.3 Write `temporal/worker.ts`: `Worker.create` on task queue `untangle`.
- [x] 3.4 Write `src/ai/machine.ts`: XState v5 machine `idle → starting → loading →
      success | error`; `fromCallback` polling actor streams real Temporal events into
      `temporalEvents[]` context while loading.
- [x] 3.5 Replace `App.tsx` AI/loading state with `@xstate/react` `useMachine`.
- [x] 3.6 Delete fabricated log timers — no fake lines anywhere; all trace lines map to
      real Temporal workflow history events.

## 4. Adaptive motion (adaptive-motion)
- [x] 4.1 Extract `src/creative/color.ts` (Fibonacci + contrast) out of `App.tsx`;
      seed it from `menu.signals`.
- [x] 4.2 Add `src/creative/motion.ts`: pure `signalsToMotion(signals)` → `MotionParams`
      (durationScale/easing/revealDistance/reducedMotion).
- [x] 4.3 Apply motion params to result reveal transitions.
- [x] 4.4 `prefers-reduced-motion` collapses GSAP choreography to cross-fade.

## 4b. Loading choreography (adaptive-motion)
- [x] 4b.1 Author layered inline SVG in `LoadingScene.tsx` with named beat layers:
      `submit → WorkflowExecutionStarted → ActivityTaskScheduled → ActivityTaskStarted →
      Completed`.
- [x] 4b.2 Build GSAP timeline with matching beat labels + seamless holding loops between
      beats.
- [x] 4b.3 Wire `timeline.tweenTo(beat)` to real Temporal event types arriving via
      `temporalEvents`; seenBeats set prevents double-advance.
- [x] 4b.4 Lazy-loaded `SuccessHero` (CSS SVG checkmark animation) on success transition —
      player imported only for that view via `React.lazy`.
- [x] 4b.5 `prefers-reduced-motion` → LoadingScene shows plain text, GSAP skipped.
- [x] 4b.6 Dev: Vite middleware simulates Temporal event sequence so loading choreography
      is testable without a real Temporal server.

## 5. Design system (design-system)
- [x] 5.1 Set up `src/ds/variants.ts`: CVA variant functions for card/note/button using
      Uno utilities + tokens.
- [x] 5.2 Implement Lit primitives (`menu-card`, `sticky-note`, `primary-button`) in
      `src/ds/components.ts` with `createRenderRoot() { return this }` (light DOM).
- [x] 5.3 Replace inline note rendering in `App.tsx` with `noteVariants()`; replace menu
      item rendering with `<menu-card>` Lit component.
- [x] 5.4 `src/ds/declarations.d.ts` extends `React.JSX.IntrinsicElements` so Lit custom
      elements type-check cleanly in TSX.

## 6. Ship readiness
- [x] 6.1 Update `README.md` / docs to reflect new architecture + privacy claim.
- [x] 6.2 Document `NIM_API_KEY`, `TEMPORAL_ADDRESS`, and self-host path in `.env.local`.
- [x] 6.3 TypeScript: 0 errors. Build: clean. End-to-end: Vite dev middleware covers the
      NIM + Temporal event sequence without a running Temporal server.
