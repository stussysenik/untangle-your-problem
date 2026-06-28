/**
 * Live generation harness. Runs the prompt dataset through the generation core,
 * validates the contracts that the UI relies on, and prints a report.
 *
 *   npx tsx src/ai/__tests__/run-generation.ts            # all cases
 *   npx tsx src/ai/__tests__/run-generation.ts anxious-work   # one case by id
 *
 * Requires NIM_API_KEY (loaded from .env.local automatically).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { untangle } from '../generate';
import { PROMPT_CASES, type PromptCase } from './prompts';
import type { Menu } from '../schema';

// --- minimal .env.local loader (no dependency on dotenv) ---
function loadEnv(): void {
  try {
    const raw = readFileSync(new URL('../../../.env.local', import.meta.url), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* env file optional — key may already be in the environment */
  }
}

type Check = { ok: boolean; label: string; detail?: string };

function checkMenu(c: PromptCase, menu: Menu): Check[] {
  const checks: Check[] = [];
  const n = menu.items.length;

  checks.push({
    ok: n >= c.expect.minItems && n <= c.expect.maxItems,
    label: `item count in [${c.expect.minItems}, ${c.expect.maxItems}]`,
    detail: `got ${n}`,
  });

  // HARD contract: every sourceTrigger must be a verbatim substring of the input —
  // the source-trace highlighting in the UI depends on indexOf() finding it.
  const orphans = menu.items.filter((it) => !c.text.includes(it.sourceTrigger));
  checks.push({
    ok: orphans.length === 0,
    label: 'every sourceTrigger is a verbatim substring',
    detail: orphans.length ? `${orphans.length} orphan(s): ${orphans.map((o) => JSON.stringify(o.sourceTrigger.slice(0, 40))).join(', ')}` : 'all matched',
  });

  checks.push({
    ok: menu.items.every((it) => it.dishName.trim() && it.quantity.trim() && it.expertAdvice.trim()),
    label: 'all fields non-empty',
  });

  if (c.expect.domain) {
    checks.push({ ok: menu.signals.domain === c.expect.domain, label: `domain == ${c.expect.domain}`, detail: `got ${menu.signals.domain}`, });
  }
  if (c.expect.language) {
    checks.push({ ok: menu.signals.language === c.expect.language, label: `language == ${c.expect.language}`, detail: `got ${menu.signals.language}`, });
  }
  return checks;
}

const isTransient = (err: unknown): boolean =>
  err instanceof Error && /abort|timed? ?out|ECONNRESET|fetch failed/i.test(err.message);

async function runCase(c: PromptCase): Promise<{ id: string; ok: boolean; ms: number; menu?: Menu; error?: string; checks: Check[] }> {
  const t0 = Date.now();
  // Retry once on a transient network/timeout error — the production activity retries 3×.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const menu = await untangle(c.text);
      const ms = Date.now() - t0;
      const checks = checkMenu(c, menu);
      return { id: c.id, ok: checks.every((k) => k.ok), ms, menu, checks };
    } catch (err) {
      if (attempt === 1 && isTransient(err)) continue;
      return { id: c.id, ok: false, ms: Date.now() - t0, error: err instanceof Error ? err.message : String(err), checks: [] };
    }
  }
  return { id: c.id, ok: false, ms: Date.now() - t0, error: 'unreachable', checks: [] };
}

async function main(): Promise<void> {
  loadEnv();
  const filter = process.argv[2];
  const cases = filter ? PROMPT_CASES.filter((c) => c.id === filter) : PROMPT_CASES;
  if (cases.length === 0) {
    console.error(`No case matching "${filter}". Ids: ${PROMPT_CASES.map((c) => c.id).join(', ')}`);
    process.exit(1);
  }

  console.log(`\n🐙 Untangle generation harness — ${cases.length} case(s)\n${'─'.repeat(60)}`);

  const results = [];
  for (const c of cases) {
    process.stdout.write(`▶ ${c.label.padEnd(34)} `);
    const r = await runCase(c);
    results.push({ ...r, label: c.label });
    if (r.error) {
      console.log(`✗ ERROR (${r.ms}ms) — ${r.error}`);
      continue;
    }
    const failed = r.checks.filter((k) => !k.ok);
    console.log(`${r.ok ? '✓' : '⚠'} ${r.menu!.items.length} items · ${(r.ms / 1000).toFixed(1)}s · $${r.menu!.usage.estimatedCost.toFixed(5)}`);
    for (const k of r.checks) {
      console.log(`    ${k.ok ? '✓' : '✗'} ${k.label}${k.detail ? ` — ${k.detail}` : ''}`);
    }
    if (failed.length === 0) {
      console.log(`    ↳ ${r.menu!.items.map((it) => it.dishName).join(' · ')}`);
    }
  }

  // Persist full output for inspection.
  const outPath = new URL('../../../scratch-generation-results.json', import.meta.url);
  try {
    writeFileSync(outPath, JSON.stringify(results, null, 2));
  } catch { /* best-effort */ }

  console.log(`${'─'.repeat(60)}`);
  const passed = results.filter((r) => r.ok).length;
  const errored = results.filter((r) => r.error).length;
  const avgMs = Math.round(results.reduce((s, r) => s + r.ms, 0) / results.length);
  console.log(`Passed ${passed}/${results.length} · errors ${errored} · avg ${(avgMs / 1000).toFixed(1)}s\n`);
  process.exit(passed === results.length ? 0 : 1);
}

main();
