# Rearchitect: NIM generation + honest instrumentation + Lit/Uno design system

## Why

`untangle-your-problem` is a creative-coding exemplar headed for a ProductHunt
launch whose pitch is *innovating the style of user interaction*. The current
implementation undercuts that goal in three ways:

1. **Two AI providers, both client-side.** `geminiService.ts`, `glmService.ts`,
   and the `aiProvider` selector ship API keys to the browser via `VITE_*`
   env vars. A leaked key is a launch-day liability, and there is no secret
   boundary where validation or tracing can live.
2. **Fabricated telemetry.** `glmService.ts` emits fake `tensor buffer` /
   `MoE layer` / `rerouting packets` log lines on timers. The aesthetic is
   good; the dishonesty is a credibility risk for a portfolio piece.
3. **Ad-hoc styling.** Styling is inline utility soup inside an 786-line
   `App.tsx`. There is no design-system layer to show intent or reuse, and no
   typed boundary on the AI output (`any` JSON parsing).

We are re-platforming around a single thesis: **fast, validated, personalized
generation drives an adaptive motion layer**, served from a static client SPA
plus exactly one portable serverless function.

## What Changes

- **Collapse two providers to one NIM instruct model.** Remove
  `geminiService.ts`, `glmService.ts`, `aiProvider.ts`. Add a single
  framework-agnostic Web-handler function `api/untangle` that calls a fast
  NVIDIA NIM **instruct** model (Llama-3.3-70B-Instruct class, low temperature,
  JSON output) and holds the secret key server-side.
- **Zod at the boundary.** Replace `@google/genai` `Schema` and hand-rolled
  `JSON.parse` with Zod schemas validated inside the function. The client only
  ever receives a shape that matched the schema.
- **No Effect.ts.** The function's NIM-call + Zod-decode + retry + timeout is
  plain TypeScript (~20 lines). Effect's payoff is composing many effects; we
  have one, so it would be ~90% signal at the cost of bundle/complexity.
- **Choreographed, event-driven loading.** The loading state is a GSAP-timeline
  choreography whose beats are advanced by the *real* XState lifecycle events
  (via `tweenTo(label)`), not timers, with seamless holding loops between beats.
  Visual richness comes from Lottie and/or layered SVG. This is the primary
  polish surface and the clearest expression of "in charge of animation steps
  and layers."
- **XState lifecycle + honest instrumentation.** A state machine
  (`idle → loading → success | error`) drives the UI and **emits real
  timestamped events**. The existing "systems engineering" log panel is
  re-sourced from these events. Fabricated logs are deleted. A pluggable trace
  sink leaves a seam to add Langfuse later without touching call sites.
- **Lean adaptive personalization.** Generation also returns a small,
  Zod-validated signal block (`mood`, `energy`, `domain`, `language`) that
  deterministically drives the existing color generator and new motion params.
  Client-only; nothing is persisted.
- **Design-system layer.** Introduce UnoCSS (attributify) + CVA for variants,
  and extract core primitives (menu card, note, button) as **Lit components
  rendering to light DOM** so Uno utilities and CVA class strings apply.
- **Drop Lit-SSR.** No server-rendered Lit. The app stays a static SPA + one
  function so it remains free to host, portable, and self-hostable.

## Impact

- **Affected specs (new):** `task-generation`, `instrumentation`,
  `adaptive-motion`, `design-system`.
- **Affected code:**
  - Removed: `services/geminiService.ts`, `services/glmService.ts`,
    `services/aiProvider.ts`, fabricated log timers, `VITE_*` AI keys.
  - Added: `api/untangle.ts`, `src/ai/schema.ts`, `src/ai/machine.ts`,
    `src/ai/client.ts`, `src/creative/color.ts`, `src/ds/*` (Lit primitives,
    CVA variants, Uno config).
  - Modified: `App.tsx` (UI shell only — AI, color, and logging logic move out).
- **Dependencies:** add `zod`, `xstate`, `@xstate/react`, `lit`, `unocss`,
  `class-variance-authority`, `gsap`, plus a loading-asset path (Lottie player
  vs hand-built layered SVG — see design.md D9). Remove `@google/genai`.
  Effect.ts is intentionally **not** added.
- **Hosting:** secret `NIM_API_KEY` server-side only. Static bundle + one
  function deploys to Vercel Hobby (free, non-commercial) and self-hosts
  unchanged via a `Request → Response` handler.
- **Privacy:** brain-dump text is never persisted; analysis is request-scoped.
  This becomes an explicit launch claim.
