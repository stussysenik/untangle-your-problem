import React, { useState, useRef, useEffect, useMemo, lazy, Suspense } from 'react';
import { useMachine } from '@xstate/react';
import { untangleMachine } from './src/ai/machine';
import { generateSessionColor } from './src/creative/color';
import { signalsToMotion } from './src/creative/motion';
import LoadingScene from './src/components/LoadingScene';
import { noteVariants } from './src/ds/variants';
import './src/ds/components'; // register Lit custom elements

const SuccessHero = lazy(() => import('./src/components/SuccessHero'));

// --- Icons ---
const ArrowRightIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);
const DownloadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);
const InfoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

const MAX_WORDS = 650;

type TextChunk = { text: string; type: 'normal' | 'highlight'; itemIndex?: number; itemId?: string };
type Note = { id: string; text: string; dx: number; dy: number; rotation: number; type: 'quote' | 'minimal'; gridArea: string };

const generateSessionId = () => {
  const hex = Math.floor(Math.random() * 0xFFFFFF).toString(16).toUpperCase().padStart(6, '0').slice(0, 4);
  return `BATCH-0x${hex}`;
};


export default function App() {
  const [state, send] = useMachine(untangleMachine);
  const { menu, temporalEvents, workflowId, error } = state.context;
  const machineState = state.value as string;

  const [inputText, setInputText] = useState('');
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'FORM' | 'RESULT'>('FORM');
  const [sessionId, setSessionId] = useState('');
  const [headerColor, setHeaderColor] = useState('text-black');

  const [notes] = useState<Note[]>([
    {
      id: 'quote-1',
      text: '"Everything feels stuck. I have 40 unread emails, the kitchen sink is leaking, I wanted to write a book this year but I haven\'t started... Also, I\'m out of milk."',
      dx: 0, dy: 0, rotation: -1, type: 'quote', gridArea: 'note1',
    },
    {
      id: 'quote-2',
      text: '"I spent 3 hours worrying about the 10 minutes of work I had to do. Never again."',
      dx: 0, dy: 0, rotation: 2, type: 'quote', gridArea: 'note2',
    },
  ]);

  const [dragState, setDragState] = useState<{
    noteId: string; startX: number; startY: number; origDx: number; origDy: number;
  } | null>(null);
  const [notePositions, setNotePositions] = useState<Record<string, { dx: number; dy: number }>>({});

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // When machine reaches success, generate session color + ID
  useEffect(() => {
    if (machineState === 'success' && menu) {
      setSessionId(generateSessionId());
      setHeaderColor(generateSessionColor(menu.signals));
      setViewMode('RESULT');
    }
  }, [machineState, menu]);

  // Focus textarea on form view
  useEffect(() => {
    if (viewMode === 'FORM' && machineState === 'idle' && textareaRef.current && window.innerWidth > 768) {
      textareaRef.current.focus();
    }
  }, [viewMode, machineState]);

  // Drag logic
  const handleNoteMouseDown = (e: React.MouseEvent, noteId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = notePositions[noteId] ?? { dx: 0, dy: 0 };
    setDragState({ noteId, startX: e.clientX, startY: e.clientY, origDx: pos.dx, origDy: pos.dy });
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragState) return;
      setNotePositions((prev) => ({
        ...prev,
        [dragState.noteId]: {
          dx: dragState.origDx + e.clientX - dragState.startX,
          dy: dragState.origDy + e.clientY - dragState.startY,
        },
      }));
    };
    const onUp = () => setDragState(null);
    if (dragState) {
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragState]);

  const wordCount = inputText.trim().split(/\s+/).filter(Boolean).length;
  const isInputValid = wordCount > 0 && wordCount <= MAX_WORDS;

  const handleDeconstruct = () => {
    if (!isInputValid) return;
    send({ type: 'SUBMIT', text: inputText });
  };

  const motionParams = useMemo(
    () => signalsToMotion(menu?.signals ?? null),
    [menu?.signals],
  );

  // Source trace chunking
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

  // Export helpers
  const downloadFile = (content: string, filename: string, mime: string) => {
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([content], { type: mime })),
      download: filename,
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const exportJSON = () => {
    downloadFile(
      JSON.stringify({ sessionId, menuItems: menu?.items, originalText: inputText, meta: menu?.usage, signals: menu?.signals }, null, 2),
      `untangle-${sessionId}.json`,
      'application/json',
    );
  };

  const exportMarkdown = () => {
    let annotated = '';
    textChunks.forEach((c) => {
      annotated += c.type === 'highlight' ? `**${c.text}** [${c.itemIndex}]` : c.text;
    });
    let md = `# ITINERARY: ${sessionId}\nGenerated: ${new Date().toLocaleDateString()}\n\n`;
    menu?.items.forEach((item, idx) => {
      md += `## ${idx + 1}. ${item.dishName.toUpperCase()}\n**QTY:** ${item.quantity}\n> "${item.expertAdvice}"\n\n`;
    });
    md += `---\n## ORIGINAL SOURCE (TRACEABLE)\n\n${annotated}`;
    downloadFile(md, `untangle-${sessionId}.md`, 'text/markdown');
  };

  // --- Render helpers ---

  const renderNote = (note: Note) => {
    const pos = notePositions[note.id] ?? { dx: 0, dy: 0 };
    return (
      <div
        key={note.id}
        onMouseDown={(e) => handleNoteMouseDown(e, note.id)}
        style={{
          gridArea: note.gridArea,
          transform: `translate3d(${pos.dx}px, ${pos.dy}px, 0) rotate(${note.rotation}deg)`,
          cursor: dragState?.noteId === note.id ? 'grabbing' : 'grab',
          zIndex: dragState?.noteId === note.id ? 50 : 10,
        }}
        className={noteVariants({ noteType: note.type })}
      >
        {note.type === 'quote' ? (
          <>
            <div className="absolute top-0 right-0 p-2 opacity-20 pointer-events-none text-blue-900">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z" />
              </svg>
            </div>
            <p className="font-hand text-lg lg:text-2xl xl:text-3xl leading-relaxed font-bold opacity-90 pointer-events-none">{note.text}</p>
            <div className="mt-2 flex justify-end pointer-events-none">
              <span className="font-typewriter text-[9px] uppercase tracking-widest text-blue-400 opacity-60">Est. Previous User</span>
            </div>
          </>
        ) : (
          <span className="font-typewriter pointer-events-none">{note.text}</span>
        )}
      </div>
    );
  };

  const renderLeftPanel = () => {
    // LOADING / STARTING
    if (machineState === 'loading' || machineState === 'starting') {
      return (
        <LoadingScene
          machineState={machineState as 'loading' | 'starting' | 'success' | 'error'}
          workflowId={workflowId}
          temporalEvents={temporalEvents}
          reducedMotion={reducedMotion}
        />
      );
    }

    // RESULT
    if (viewMode === 'RESULT' && menu) {
      const motionStyle = motionParams.reducedMotion ? {} : {
        transition: `opacity ${0.3 * motionParams.durationScale}s ${motionParams.easing}`,
      };
      return (
        <div className="flex flex-col h-full relative">
          <header className="mb-6 lg:mb-8 flex justify-between items-end pb-4 border-b-2 border-black bg-white z-20">
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-typewriter font-bold tracking-tight text-gray-900 leading-none">Itinerary_</h2>
              <span className="text-[10px] font-mono tracking-widest text-black/40 uppercase">Batch: {sessionId}</span>
            </div>
            <button
              onClick={() => { send({ type: 'RESET' }); setViewMode('FORM'); }}
              className="no-print font-mono text-[10px] uppercase tracking-widest hover:text-gray-500 transition-colors"
            >
              [ New ]
            </button>
          </header>

          {/* Success hero — lazy-loaded */}
          <Suspense fallback={null}>
            <SuccessHero />
          </Suspense>

          {/* Big count sticker */}
          <div className="mb-8 pointer-events-none select-none relative inline-block group">
            <div className="relative z-10 bg-white border-4 border-black px-6 py-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transform -rotate-1 transition-transform group-hover:rotate-0">
              <h1 className="font-rubik-spray text-5xl md:text-6xl lg:text-7xl tracking-wide leading-none" style={{ color: headerColor }}>
                = {menu.items.length} {menu.items.length === 1 ? 'thing' : 'things'}
              </h1>
            </div>
          </div>

          <div className="flex-grow overflow-y-auto custom-scrollbar pr-1 lg:pr-4 pb-12 print-expand">
            <div className="flex flex-col gap-8 lg:gap-10">
              {menu.items.map((item, index) => {
                const itemId = (item as Record<string, string>).id ?? String(index);
                const isActive = activeItemId === itemId;
                return (
                  <div
                    key={itemId}
                    id={`menu-item-${itemId}`}
                    onMouseEnter={() => setActiveItemId(itemId)}
                    onMouseLeave={() => setActiveItemId(null)}
                    onClick={() => {
                      setActiveItemId(itemId);
                      document.getElementById(`source-chunk-${itemId}`)?.scrollIntoView({ behavior: 'auto', block: 'center' });
                    }}
                    style={motionStyle}
                  >
                    <menu-card
                      active={isActive}
                      item-index={index + 1}
                      dish-name={item.dishName}
                      quantity={item.quantity}
                      expert-advice={item.expertAdvice}
                    />
                  </div>
                );
              })}

              <div className="mt-6 pt-6 border-t-2 border-dashed border-gray-100">
                <div className="font-mono text-[10px] text-gray-400 mb-4 uppercase tracking-widest">Conclusion (Total Output)</div>
                <div className="font-mono text-xs lg:text-sm text-gray-500 leading-relaxed break-words bg-gray-50 p-4 lg:p-6 rounded-sm">
                  <div className="opacity-75 mb-4">
                    = {menu.items.map((item, idx) => (
                      <span key={idx}>{item.quantity} x {item.dishName.toLowerCase()}{idx < menu.items.length - 1 ? ' + ' : ''}</span>
                    ))}
                  </div>
                  <div className="text-black text-xl lg:text-2xl font-bold tracking-tight border-t border-black/10 pt-4">
                    = {menu.items.length} x things
                  </div>
                </div>
              </div>

              {/* Signals panel */}
              {menu.signals && (
                <div className="mt-2 pt-4 border-t border-gray-100 font-mono text-[9px] uppercase tracking-widest text-gray-400">
                  <span className="mr-4">Mood: {menu.signals.mood}</span>
                  <span className="mr-4">Energy: {menu.signals.energy}</span>
                  <span className="mr-4">Domain: {menu.signals.domain}</span>
                  <span>Lang: {menu.signals.language}</span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-auto pt-6 lg:pt-8 border-t border-black no-print flex flex-wrap justify-between items-center font-mono text-[10px] uppercase tracking-widest gap-4">
            <div className="flex gap-6">
              <button onClick={exportJSON} className="hover:underline">JSON</button>
              <button onClick={exportMarkdown} className="hover:underline">Markdown</button>
            </div>
            <button onClick={() => window.print()} className="flex items-center gap-2 hover:bg-insight hover:text-black px-3 py-1 -mr-3 transition-colors">
              <span>Save PDF</span><DownloadIcon />
            </button>
          </div>

          {/* Transparency footer */}
          {menu.usage && (
            <div className="mt-auto pt-6 border-t border-black font-mono text-[10px] uppercase tracking-widest text-gray-400 no-print flex justify-between items-center opacity-60">
              <span>NIM · Llama-3.3-70B</span>
              <span>{menu.usage.totalTokenCount} tokens / ${menu.usage.estimatedCost.toFixed(6)}</span>
            </div>
          )}
        </div>
      );
    }

    // FORM
    return (
      <div
        className="h-full w-full max-w-5xl mx-auto relative"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr minmax(200px, 280px)',
          gridTemplateRows: 'auto auto auto',
          gridTemplateAreas: `"header note1" "header note2" "action action"`,
          gap: '1rem',
          alignContent: 'start',
        }}
      >
        <header style={{ gridArea: 'header' }} className="z-0 self-start">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-mono font-bold tracking-tighter uppercase leading-[0.9] mb-6 lg:mb-8">
            Untangle<br />Your<br />Problem...
          </h1>
          <div className="font-typewriter text-sm text-black space-y-4 max-w-md leading-relaxed">
            <p>
              <span className="bg-insight box-decoration-clone px-1 text-black">
                This tool deconstructs complex "brain dumps" into an actionable itinerary via a Temporal workflow.
              </span>
            </p>
            <ol className="list-decimal list-inside space-y-3 text-black">
              <li>Type your stream of consciousness below.</li>
              <li>Do not worry about structure, grammar, or content.</li>
              <li>Write it out first.</li>
              <li className="pt-1">Press "GET MENU" — we'll untangle this! 🐙</li>
            </ol>
          </div>
        </header>

        {notes.map(renderNote)}

        <div style={{ gridArea: 'action' }} className="z-20 pt-8">
          {menu && (
            <button
              onClick={() => setViewMode('RESULT')}
              className="mb-4 text-xs font-mono underline hover:text-gray-500 transition-colors block"
            >
              View Previous Menu &rarr;
            </button>
          )}

          <button
            onClick={handleDeconstruct}
            disabled={!isInputValid || machineState === 'loading' || machineState === 'starting'}
            className={`w-full py-6 lg:py-8 border-4 border-black transition-all duration-75 ease-out font-mono font-bold text-2xl lg:text-4xl uppercase group relative overflow-hidden active:scale-[0.99] flex items-center justify-center gap-4 lg:gap-6 ${isInputValid ? 'bg-white text-black hover:bg-black hover:text-white' : 'opacity-50 cursor-not-allowed bg-gray-50 text-gray-400 border-gray-200'}`}
          >
            <span>Get Menu</span>
            <span className={`transition-transform duration-300 transform scale-125 lg:scale-150 ${isInputValid ? 'group-hover:translate-x-4' : ''}`}>
              <ArrowRightIcon />
            </span>
          </button>

          {(machineState === 'error' || error) && (
            <div className="mt-4 pt-3 border-t border-red-100 w-full">
              <div className="text-red-600 font-mono text-[10px] flex items-center gap-2 font-bold uppercase mb-2">
                <InfoIcon /> Error: {error}
              </div>
              <button
                onClick={() => send({ type: 'RESET' })}
                className="text-[10px] font-mono underline text-gray-500 hover:text-black"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderRightPanel = () => (
    <div className="h-full flex flex-col relative">
      <div className="pb-4 lg:pb-6 mb-2 z-10 flex justify-between items-baseline no-print border-b lg:border-none border-gray-100 lg:border-transparent">
        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-gray-300">
          {viewMode === 'FORM' ? '// Input Stream' : '// Source Trace'}
        </span>
        {viewMode === 'FORM' && (
          <span className={`text-[10px] font-mono font-bold ${wordCount > MAX_WORDS ? 'text-red-500' : 'text-gray-300'}`}>
            {wordCount}/{MAX_WORDS}
          </span>
        )}
      </div>

      <div className="flex-grow overflow-y-auto custom-scrollbar relative pr-2 print-expand">
        {viewMode === 'FORM' ? (
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Begin typing stream of consciousness..."
            className="w-full h-full bg-transparent text-base lg:text-lg font-typewriter leading-loose resize-none focus:outline-none placeholder-gray-300 p-0 border-none min-h-[50vh] print-expand"
            spellCheck={false}
          />
        ) : (
          <div className="font-typewriter text-xs lg:text-sm leading-loose whitespace-pre-wrap text-justify pb-8 pt-4 lg:pt-0">
            {textChunks.map((chunk, idx) => {
              const isActive = chunk.type === 'highlight' && chunk.itemId === activeItemId;
              const isHighlighted = chunk.type === 'highlight';
              return (
                <span
                  key={idx}
                  id={chunk.itemId ? `source-chunk-${chunk.itemId}` : undefined}
                  className={`transition-none duration-0 cursor-pointer font-typewriter leading-loose ${
                    isActive ? 'bg-insight text-black font-bold px-0.5' :
                    isHighlighted ? 'text-black font-semibold border-b-2 border-black hover:bg-gray-100' :
                    'text-gray-400'
                  }`}
                  onMouseEnter={() => isHighlighted && chunk.itemId && setActiveItemId(chunk.itemId)}
                  onClick={() => {
                    if (chunk.itemId) {
                      setActiveItemId(chunk.itemId);
                      document.getElementById(`menu-item-${chunk.itemId}`)?.scrollIntoView({ behavior: 'auto', block: 'center' });
                    }
                  }}
                >
                  {chunk.text}
                  {isHighlighted && chunk.itemIndex && (
                    <sup className={`text-[9px] font-bold ml-0.5 align-super ${isActive ? 'text-black' : 'text-gray-500'}`}>
                      [{chunk.itemIndex}]
                    </sup>
                  )}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen w-full bg-white text-black selection:bg-insight selection:text-black flex flex-col lg:flex-row lg:h-screen lg:overflow-hidden font-sans">
      <div className="left-panel-container w-full lg:w-1/2 flex-shrink-0 h-auto lg:h-full p-6 md:p-8 lg:p-12 xl:p-16 border-b lg:border-b-0 lg:border-r border-gray-200 bg-white/50 z-20 lg:overflow-hidden flex flex-col relative grid-line-r">
        {renderLeftPanel()}
      </div>
      <div className="right-panel-container w-full lg:w-1/2 flex-shrink-0 min-h-[50vh] lg:h-full bg-gray-50/30 p-6 md:p-8 lg:p-12 xl:p-16 relative z-10 lg:overflow-hidden flex flex-col">
        {renderRightPanel()}
      </div>
    </div>
  );
}
