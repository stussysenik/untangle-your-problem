import React, { useState, useRef, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { useMachine } from '@xstate/react';
import { untangleMachine } from './src/ai/machine';
import { generateSessionColor } from './src/creative/color';
import { signalsToMotion } from './src/creative/motion';
import LoadingScene from './src/components/LoadingScene';
import { buttonVariants } from './src/ds/variants';
import './src/ds/components'; // register Lit custom elements

const SuccessHero = lazy(() => import('./src/components/SuccessHero'));

// --- Icons ---
const ArrowRightIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);
const DownloadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);
const InfoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

const MAX_WORDS = 650;

// One sheet of the "folding paper" deck. Each sheet demands exactly one action.
type Panel = 'brief' | 'compose' | 'working' | 'itinerary' | 'source' | 'error';
const PANEL_LABEL: Record<Panel, string> = {
  brief: 'Brief', compose: 'Compose', working: 'Working',
  itinerary: 'Itinerary', source: 'Source', error: 'Error',
};

type TextChunk = { text: string; type: 'normal' | 'highlight'; itemIndex?: number; itemId?: string };

const generateSessionId = () => {
  const hex = Math.floor(Math.random() * 0xFFFFFF).toString(16).toUpperCase().padStart(6, '0').slice(0, 4);
  return `BATCH-0x${hex}`;
};

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const SUBMIT_HINT = `${isMac ? '⌘' : 'Ctrl'} + Enter`;

const downloadFile = (content: string, filename: string, mime: string) => {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([content], { type: mime })),
    download: filename,
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

export default function App() {
  const [state, send] = useMachine(untangleMachine);
  const { menu, temporalEvents, workflowId, error } = state.context;
  const machineState = state.value as string;

  const [inputText, setInputText] = useState('');
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [fold, setFold] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [sessionId, setSessionId] = useState('');
  const [headerColor, setHeaderColor] = useState('#000000');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const wordCount = inputText.trim().split(/\s+/).filter(Boolean).length;
  const isInputValid = wordCount > 0 && wordCount <= MAX_WORDS;
  const isBusy = machineState === 'loading' || machineState === 'starting';

  // The deck for the current phase — derived from the machine, one action per sheet.
  const deck: Panel[] = useMemo(() => {
    if (machineState === 'success') return ['itinerary', 'source'];
    if (isBusy) return ['working'];
    if (machineState === 'error') return ['error'];
    return ['brief', 'compose'];
  }, [machineState, isBusy]);
  const deckKey = deck.join('|');

  const currentFold = Math.min(fold, deck.length - 1);
  const panel = deck[currentFold];

  const handleDeconstruct = useCallback(() => {
    if (!isInputValid || isBusy) return;
    send({ type: 'SUBMIT', text: inputText });
  }, [isInputValid, isBusy, inputText, send]);

  // Reset to the first sheet whenever the phase (deck) changes.
  useEffect(() => { setFold(0); }, [deckKey]);

  // On success, mint the session identity.
  useEffect(() => {
    if (machineState === 'success' && menu) {
      setSessionId(generateSessionId());
      setHeaderColor(generateSessionColor(menu.signals));
    }
  }, [machineState, menu]);

  // Elapsed timer while the workflow runs — so it never looks stuck.
  useEffect(() => {
    if (!isBusy) { setElapsed(0); return; }
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 250);
    return () => clearInterval(id);
  }, [isBusy]);

  // Move focus to the active sheet (or its primary input) on fold — keyboard + SR friendly.
  useEffect(() => {
    if (panel === 'compose') textareaRef.current?.focus();
    else sheetRef.current?.focus();
  }, [panel]);

  // Global keyboard shortcuts: ←/→ to fold, ⌘/Ctrl+Enter to untangle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && panel === 'compose') {
        e.preventDefault();
        handleDeconstruct();
        return;
      }
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return; // let the caret move
      if (e.key === 'ArrowRight') setFold((f) => Math.min(f + 1, deck.length - 1));
      else if (e.key === 'ArrowLeft') setFold((f) => Math.max(f - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel, deck.length, handleDeconstruct]);

  const motionParams = useMemo(() => signalsToMotion(menu?.signals ?? null), [menu?.signals]);

  // Source-trace chunking: map each menu item back to its verbatim trigger in the input.
  const textChunks: TextChunk[] = useMemo(() => {
    if (!inputText || !menu?.items.length) return [{ text: inputText, type: 'normal' }];
    const matches: { start: number; end: number; itemIndex: number; itemId: string }[] = [];
    menu.items.forEach((item, idx) => {
      const start = inputText.indexOf(item.sourceTrigger);
      if (start !== -1) matches.push({ start, end: start + item.sourceTrigger.length, itemIndex: idx + 1, itemId: (item as Record<string, string>).id ?? String(idx) });
    });
    matches.sort((a, b) => a.start - b.start);
    const unique: typeof matches = [];
    let last = 0;
    for (const m of matches) { if (m.start >= last) { unique.push(m); last = m.end; } }
    const chunks: TextChunk[] = [];
    let cursor = 0;
    for (const m of unique) {
      if (m.start > cursor) chunks.push({ text: inputText.slice(cursor, m.start), type: 'normal' });
      chunks.push({ text: inputText.slice(m.start, m.end), type: 'highlight', itemIndex: m.itemIndex, itemId: m.itemId });
      cursor = m.end;
    }
    if (cursor < inputText.length) chunks.push({ text: inputText.slice(cursor), type: 'normal' });
    return chunks;
  }, [inputText, menu?.items]);

  // --- Export helpers ---
  const exportJSON = () => {
    downloadFile(
      JSON.stringify({ sessionId, menuItems: menu?.items, originalText: inputText, meta: menu?.usage, signals: menu?.signals }, null, 2),
      `untangle-${sessionId}.json`,
      'application/json',
    );
  };

  const exportMarkdown = () => {
    let annotated = '';
    textChunks.forEach((c) => { annotated += c.type === 'highlight' ? `**${c.text}** [${c.itemIndex}]` : c.text; });
    let md = `# ITINERARY: ${sessionId}\nGenerated: ${new Date().toLocaleDateString()}\n\n`;
    menu?.items.forEach((item, idx) => {
      md += `## ${idx + 1}. ${item.dishName.toUpperCase()}\n**QTY:** ${item.quantity}\n> "${item.expertAdvice}"\n\n`;
    });
    md += `---\n## ORIGINAL SOURCE (TRACEABLE)\n\n${annotated}`;
    downloadFile(md, `untangle-${sessionId}.md`, 'text/markdown');
  };

  // ---------------------------------------------------------------- sheets ---

  const renderBrief = () => (
    <div className="sheet-flow">
      <header>
        <h1 className="font-mono font-bold tracking-tighter uppercase leading-[0.9] text-[clamp(1.75rem,9cqi,3.25rem)]">
          Untangle<br />Your<br />Problem…
        </h1>
      </header>
      <p className="font-typewriter text-[clamp(0.8rem,3.6cqi,1rem)] leading-relaxed">
        <span className="bg-insight box-decoration-clone px-1 text-black">
          Deconstruct a messy brain dump into an actionable itinerary via a Temporal workflow.
        </span>
      </p>
      <ol className="font-typewriter text-[clamp(0.75rem,3.2cqi,0.95rem)] list-decimal list-inside space-y-1.5 text-black/80">
        <li>Write your stream of consciousness.</li>
        <li>Don't worry about structure or grammar.</li>
        <li>We untangle it into a checklist. 🐙</li>
      </ol>
      <div className="mt-auto pt-4">
        <button onClick={() => setFold(1)} className={buttonVariants({ enabled: true })}>
          <span>Start</span>
          <span className="transition-transform duration-200 group-hover:translate-x-1"><ArrowRightIcon /></span>
        </button>
      </div>
    </div>
  );

  const renderCompose = () => (
    <div className="sheet-flow">
      <div className="flex justify-between items-baseline">
        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-gray-400">{'// Brain Dump'}</span>
        <span className={`text-[10px] font-mono font-bold ${wordCount > MAX_WORDS ? 'text-red-500' : 'text-gray-400'}`}>
          {wordCount}/{MAX_WORDS}
        </span>
      </div>
      <textarea
        ref={textareaRef}
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        placeholder="Begin typing your stream of consciousness…"
        aria-label="Your brain dump"
        className="flex-grow min-h-0 w-full bg-transparent text-[clamp(0.9rem,3.6cqi,1.1rem)] font-typewriter leading-loose resize-none focus:outline-none placeholder-gray-300 custom-scrollbar"
        spellCheck={false}
      />
      <div className="mt-auto pt-3 flex items-center justify-between gap-3 border-t border-black/10">
        <span className="text-[10px] font-mono uppercase tracking-widest text-gray-400 hidden sm:inline">{SUBMIT_HINT}</span>
        <button onClick={handleDeconstruct} disabled={!isInputValid} className={buttonVariants({ enabled: isInputValid })}>
          <span>Untangle</span>
          <span className={`transition-transform duration-200 ${isInputValid ? 'group-hover:translate-x-1' : ''}`}><ArrowRightIcon /></span>
        </button>
      </div>
    </div>
  );

  const renderWorking = () => (
    <div className="sheet-flow">
      <div className="flex justify-between items-baseline" aria-live="polite">
        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-gray-400">{'// Untangling'}</span>
        <span className="text-[10px] font-mono font-bold tabular-nums text-gray-400">{elapsed}s · usually ~30s</span>
      </div>
      <div className="flex-grow min-h-0 overflow-hidden">
        <LoadingScene
          machineState={machineState as 'loading' | 'starting' | 'success' | 'error'}
          workflowId={workflowId}
          temporalEvents={temporalEvents}
          reducedMotion={reducedMotion}
        />
      </div>
    </div>
  );

  const renderItinerary = () => {
    if (!menu) return null;
    const motionStyle = motionParams.reducedMotion ? undefined : {
      transition: `opacity ${0.3 * motionParams.durationScale}s ${motionParams.easing}`,
    };
    return (
      <div className="sheet-flow">
        <header className="flex justify-between items-end pb-3 border-b-2 border-black">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-typewriter font-bold tracking-tight leading-none">Itinerary_</h2>
            <span className="text-[10px] font-mono tracking-widest text-black/40 uppercase">Batch: {sessionId}</span>
          </div>
          <button onClick={() => send({ type: 'RESET' })} className="no-print font-mono text-[10px] uppercase tracking-widest hover:text-gray-500 transition-colors">
            [ New ]
          </button>
        </header>

        <Suspense fallback={null}><SuccessHero /></Suspense>

        <div className="select-none">
          <span className="inline-block bg-white border-4 border-black px-4 py-2 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] -rotate-1">
            <span className="font-rubik-spray tracking-wide leading-none text-[clamp(2rem,11cqi,3.5rem)]" style={{ color: headerColor }}>
              = {menu.items.length} {menu.items.length === 1 ? 'thing' : 'things'}
            </span>
          </span>
        </div>

        <div className="flex-grow min-h-0 overflow-y-auto custom-scrollbar pr-1 pb-4 print-expand">
          <div className="flex flex-col gap-6">
            {menu.items.map((item, index) => {
              const itemId = (item as Record<string, string>).id ?? String(index);
              return (
                <div
                  key={itemId}
                  id={`menu-item-${itemId}`}
                  onMouseEnter={() => setActiveItemId(itemId)}
                  onMouseLeave={() => setActiveItemId(null)}
                  style={motionStyle}
                >
                  <menu-card
                    active={activeItemId === itemId}
                    item-index={index + 1}
                    dish-name={item.dishName}
                    quantity={item.quantity}
                    expert-advice={item.expertAdvice}
                  />
                </div>
              );
            })}
            {menu.signals && (
              <div className="pt-3 border-t border-gray-100 font-mono text-[9px] uppercase tracking-widest text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
                <span>Mood: {menu.signals.mood}</span>
                <span>Energy: {menu.signals.energy}</span>
                <span>Domain: {menu.signals.domain}</span>
                <span>Lang: {menu.signals.language}</span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-auto pt-3 border-t border-black no-print flex flex-wrap justify-between items-center font-mono text-[10px] uppercase tracking-widest gap-3">
          <div className="flex gap-5">
            <button onClick={exportJSON} className="hover:underline">JSON</button>
            <button onClick={exportMarkdown} className="hover:underline">Markdown</button>
          </div>
          <button onClick={() => window.print()} className="flex items-center gap-2 hover:bg-insight hover:text-black px-3 py-1 -mr-3 transition-colors">
            <span>Save PDF</span><DownloadIcon />
          </button>
        </div>
      </div>
    );
  };

  const renderSource = () => (
    <div className="sheet-flow">
      <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-gray-400">{'// Source Trace'}</span>
      <div className="flex-grow min-h-0 overflow-y-auto custom-scrollbar pr-1 print-expand">
        <div className="font-typewriter text-[clamp(0.8rem,3.4cqi,1rem)] leading-loose whitespace-pre-wrap">
          {textChunks.map((chunk, idx) => {
            const isActive = chunk.type === 'highlight' && chunk.itemId === activeItemId;
            const isHighlighted = chunk.type === 'highlight';
            return (
              <span
                key={chunk.itemId ?? `chunk-${idx}-${chunk.text.length}`}
                className={`cursor-pointer ${
                  isActive ? 'bg-insight text-black font-bold px-0.5' :
                  isHighlighted ? 'text-black font-semibold border-b-2 border-black hover:bg-gray-100' :
                  'text-gray-400'
                }`}
                onMouseEnter={() => isHighlighted && chunk.itemId && setActiveItemId(chunk.itemId)}
              >
                {chunk.text}
                {isHighlighted && chunk.itemIndex && (
                  <sup className={`text-[9px] font-bold ml-0.5 align-super ${isActive ? 'text-black' : 'text-gray-500'}`}>[{chunk.itemIndex}]</sup>
                )}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );

  const renderError = () => (
    <div className="sheet-flow items-start justify-center">
      <div className="text-red-600 font-mono text-sm flex items-center gap-2 font-bold uppercase">
        <InfoIcon /> Workflow Failed
      </div>
      <p className="font-mono text-xs text-gray-500 break-words">{error ?? 'Something went wrong.'}</p>
      <button onClick={() => send({ type: 'RESET' })} className={buttonVariants({ enabled: true })}>
        <span>Try Again</span>
      </button>
    </div>
  );

  const SHEETS: Record<Panel, () => React.ReactNode> = {
    brief: renderBrief, compose: renderCompose, working: renderWorking,
    itinerary: renderItinerary, source: renderSource, error: renderError,
  };

  return (
    <div className="untangle-stage font-sans bg-white text-black selection:bg-insight selection:text-black">
      <section
        className="paper"
        aria-roledescription="Sheet"
        aria-label={`${PANEL_LABEL[panel]} — sheet ${currentFold + 1} of ${deck.length}`}
      >
        <div
          ref={sheetRef}
          key={panel}
          tabIndex={-1}
          className={`paper__sheet ${reducedMotion ? '' : 'paper__sheet--folding'}`}
        >
          {SHEETS[panel]()}
        </div>
      </section>

      {deck.length > 1 && (
        <nav className="fold-nav no-print" aria-label="Fold between sheets">
          <button onClick={() => setFold((f) => Math.max(f - 1, 0))} disabled={currentFold === 0} aria-label="Previous sheet">&larr;</button>
          <span>
            {deck.map((p, i) => (
              <span key={p} className={i === currentFold ? 'fold-nav__active' : 'fold-nav__dim'}>
                {PANEL_LABEL[p]}{i < deck.length - 1 && <span className="fold-nav__sep"> / </span>}
              </span>
            ))}
          </span>
          <button onClick={() => setFold((f) => Math.min(f + 1, deck.length - 1))} disabled={currentFold === deck.length - 1} aria-label="Next sheet">&rarr;</button>
        </nav>
      )}
    </div>
  );
}
