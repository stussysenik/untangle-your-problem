# Design: rearchitect-ai-and-design-system

## Context

A 250-line creative-coding SPA is being re-platformed to support a ProductHunt
launch whose differentiator is interaction style. Seven technologies were
requested (NIM, Zod, deterministic prompting, Langfuse-or-lean observability,
Effect.ts, XState, Lit). Several conflict on a browser-only app. This document
records how each was resolved so the spec deltas stay grounded.

## Goals / Non-Goals

**Goals**
- Keep the app a static client SPA + exactly one serverless function.
- Hold the NIM key server-side; validate all model output before it reaches
  the client.
- Make the existing "systems" log aesthetic honest (real events, not timers).
- Let detected content signals drive motion/color cheaply and deterministically.
- Show a deliberate, reusable design-system layer.

**Non-Goals**
- No SSR (no Lit-SSR-into-React). It would force a persistent server and kill
  the static-SPA portability that makes hosting free and self-hostable.
- No cross-session memory or live/streaming personalization (deferred —
  "don't over-do it").
- No full Langfuse integration now — only a seam for it.

## Key Decisions

### D1 — One portable server function, not a backend
The browser cannot hold the NIM secret. We add a single Web-handler
(`Request → Response`, e.g. Hono or a plain fetch handler) at `api/untangle`.
The same file runs on Vercel functions, Cloudflare Workers, or `node server.js`.
This is the minimum that satisfies "client-side dream" while keeping the key
secret, and it is where Zod validation, Effect error handling, and the trace
seam live.

### D2 — Fast instruct model, not a reasoning model
"Best reasoning model" conflicts with "deterministic," "super fast," and the
Vercel Hobby function timeout. Turning a brain-dump into a task menu is a
structuring/styling job, not multi-step reasoning. We use a fast NIM **instruct**
model (Llama-3.3-70B-Instruct class) at `temperature ≈ 0.2–0.3` with JSON
output. Determinism lives in the schema + prompt; dynamism lives in how signals
map to UI. A reasoning model would add 10–40s latency, risk timeout failures,
and inject a `<think>` trace that must be stripped before parsing — for no gain
on this task.

### D3 — Single call returns menu + personalization signals
The function returns both the task menu and a small signal block
(`mood`, `energy`, `domain`, `language`). One round-trip feeds five concerns:
NIM (call) → Zod (typed signals) → XState (consumes) → motion layer (reads) →
trace panel (shows as "detected context"). No extra latency or API calls.

### D4 — Plain TypeScript pipeline, Effect.ts rejected
The function's NIM-call + Zod-decode + retry + timeout is plain async TypeScript
(a bounded retry loop + `AbortController` timeout + a `Result`-style return).
Effect.ts was considered and rejected: its payoff is composing *many* effects,
and we have exactly one pipeline. On an app this size it would be ~90% portfolio
signal at the cost of bundle weight and an extra mental model. The capability
spec ("typed failure handling") is implementation-agnostic, so this choice does
not weaken the contract.

### D5 — XState as the lifecycle + event source
The generation lifecycle (`idle → loading → success | error`) is an XState
machine. Its transitions and actions **emit timestamped events** that feed the
on-screen trace panel. This replaces fabricated `glmService` log timers with
real telemetry and makes the "systems engineering" aesthetic honest.

### D6 — Lean observability now, Langfuse seam later
A full Langfuse integration needs an account and server lifecycle that fight the
static-SPA model and "don't over-do it." We ship the lean path: in-app trace
panel from XState events, plus a single `trace(event)` hook in `api/untangle`
that currently no-ops/console-logs. Adding Langfuse later means implementing
that one hook — no call-site changes. Foresight without weight.

### D7 — Lit in light DOM to reconcile with Uno + CVA
UnoCSS attributify and CVA emit global utility class/attribute strings; Lit's
default Shadow DOM is isolated from global styles, so they would not reach
inside a component. Resolution: Lit primitives override `createRenderRoot()` to
render to **light DOM**. One styling system (Uno + CVA) then governs both React
and Lit. We forgo style encapsulation deliberately — a utility-CSS design
system does not want it.

```ts
class MenuCard extends LitElement {
  createRenderRoot() { return this; }      // light DOM — Uno/CVA apply
  render() {
    return html`<article class=${cardVariants({ active: this.active })}
      grid items-baseline gap-4>...</article>`;
  }
}
```

### D8 — Design tokens as the single source
Tokens (the `insight` accent, spacing, type scale) are defined once in the Uno
config and exported as CSS custom properties so both React and Lit consume the
same values. Prevents the two-styling-system drift that the Shadow-DOM
alternative would have caused.

### D9 — Loading is a GSAP timeline advanced by real events
The loading experience is the primary polish surface. It is a single GSAP
timeline with labeled beats (`submit → analyzing → structuring → personalizing
→ done`). Between beats a seamless holding loop plays. Real XState lifecycle
events drive progression via `timeline.tweenTo(label)` rather than autoplay, so
the choreography stays smooth when the response is slow and catches up when it
is fast — honest (event-driven) and polished (never hard-cuts). Reduced-motion
collapses the timeline to a minimal cross-fade.

Asset strategy is **both**: hand-authored **layered inline SVG** drives the
per-step beats (full control, ~0kb runtime, the "I coded this" signal), and a
single **Lottie hero** plays the success/done flourish (lazy-loaded so its
player never weighs the initial bundle). Both bind to the same timeline labels,
so the contract is asset-independent. Trade-off accepted: two asset pipelines
(SVG-in-code + an After Effects/dotLottie export) to maintain.

## Risks / Trade-offs

- **No style encapsulation (D7).** Acceptable for a utility-first system; global
  class collisions are mitigated by Uno's deterministic class names + CVA scoping.
- **Vercel Hobby is non-commercial.** A monetized launch needs Pro (~$20/mo).
  Flagged, not blocking.
- **Single function is a cold-start dependency.** Mitigated by the model being
  fast and the rest of the app being static and instantly interactive.
- **XState/Lit/GSAP each add a dependency.** Justified individually above;
  each is scoped to one job to avoid "complexity for its own sake." Effect.ts
  was cut for exactly this reason (D4).
- **Lottie runtime weight.** If the asset path is Lottie, the player adds
  bundle (mitigated by a lightweight/dotLottie player and lazy-loading it only
  for the loading view). Layered SVG avoids this at the cost of building the art.

## Migration Notes

`MenuItem` shape (`dishName`, `quantity`, `sourceTrigger`, `expertAdvice`) is
preserved so the source-trace highlighting in `App.tsx` keeps working. The Zod
schema is the new source of truth for that shape; `types.ts` interfaces are
derived from it via `z.infer`.
