import React, { useState, useRef, useEffect, useMemo } from 'react';
import { generateMenuFromDump } from './services/aiProvider';
import { MenuItem, UsageStats, AppState } from './types';

// --- Icons ---
const ArrowRightIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);

const DownloadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const InfoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="12" y1="16" x2="12" y2="12"></line>
    <line x1="12" y1="8" x2="12.01" y2="8"></line>
  </svg>
);

const MAX_WORDS = 650;

// --- Types ---
type TextChunk = {
  text: string;
  type: 'normal' | 'highlight';
  itemIndex?: number;
  itemId?: string;
};

// --- Helpers ---
const generateSessionId = () => {
  // Generate a random batch ID
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const randomHex = Math.floor(Math.random() * 16777215).toString(16).toUpperCase().substring(0, 4);
  return `BATCH-${randomHex}`;
};

export default function App() {
  const [appState, setAppState] = useState<AppState>(AppState.INPUT);
  const [inputText, setInputText] = useState('');
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingLogs, setLoadingLogs] = useState<string[]>([]);
  const [loadingDots, setLoadingDots] = useState('');
  const [sessionId, setSessionId] = useState<string>('');

  // Navigation State
  const [viewMode, setViewMode] = useState<'FORM' | 'RESULT'>('FORM');

  // Focus management
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    // Only focus on desktop or when explicitly intended to avoid jarring mobile jumps
    if (viewMode === 'FORM' && appState === AppState.INPUT && textareaRef.current && window.innerWidth > 768) {
      textareaRef.current.focus();
    }
  }, [viewMode, appState]);

  // Loading Animation
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (appState === AppState.LOADING) {
      interval = setInterval(() => {
        setLoadingDots(prev => prev.length >= 3 ? '' : prev + '.');
      }, 350);
    } else {
      setLoadingDots('');
    }
    return () => clearInterval(interval);
  }, [appState]);

  const wordCount = inputText.trim().split(/\s+/).filter(Boolean).length;
  const isInputValid = wordCount > 0 && wordCount <= MAX_WORDS;

  const appendLog = (msg: string) => {
    setLoadingLogs(prev => [...prev, `> ${msg}`]);
  };

  const handleDeconstruct = async () => {
    if (!inputText.trim()) return;
    if (wordCount > MAX_WORDS) {
      setError(`Text exceeds ${MAX_WORDS} words.`);
      return;
    }

    setAppState(AppState.LOADING);
    setLoadingLogs(['> Booting system...', '> Awaiting input buffer analysis...']);
    setError(null);

    try {
      const { items, usage } = await generateMenuFromDump(inputText, appendLog);
      setMenuItems(items);
      setUsageStats(usage);
      setSessionId(generateSessionId());
      setAppState(AppState.MENU);
      setViewMode('RESULT');
    } catch (e: any) {
      setError(e.message || "Failed to deconstruct.");
      setAppState(AppState.INPUT);
      setViewMode('FORM');
    }
  };

  const handleNavToResult = () => {
    if (menuItems.length > 0) setViewMode('RESULT');
  };

  const handleNavToForm = () => {
    setViewMode('FORM');
  };

  // --- Chunking Logic for Source Trace ---
  const textChunks: TextChunk[] = useMemo(() => {
    if (!inputText || menuItems.length === 0) return [{ text: inputText, type: 'normal' }];

    const matches: { start: number; end: number; itemIndex: number; itemId: string }[] = [];
    menuItems.forEach((item, idx) => {
      const start = inputText.indexOf(item.sourceTrigger);
      if (start !== -1) {
        matches.push({
          start,
          end: start + item.sourceTrigger.length,
          itemIndex: idx + 1,
          itemId: item.id
        });
      }
    });
    matches.sort((a, b) => a.start - b.start);

    const uniqueMatches: typeof matches = [];
    let lastEnd = 0;
    for (const m of matches) {
      if (m.start >= lastEnd) {
        uniqueMatches.push(m);
        lastEnd = m.end;
      }
    }

    const chunks: TextChunk[] = [];
    let currentCursor = 0;
    for (const m of uniqueMatches) {
      if (m.start > currentCursor) {
        chunks.push({ text: inputText.slice(currentCursor, m.start), type: 'normal' });
      }
      chunks.push({
        text: inputText.slice(m.start, m.end),
        type: 'highlight',
        itemIndex: m.itemIndex,
        itemId: m.itemId
      });
      currentCursor = m.end;
    }
    if (currentCursor < inputText.length) {
      chunks.push({ text: inputText.slice(currentCursor), type: 'normal' });
    }
    return chunks;
  }, [inputText, menuItems]);

  // --- Exports ---
  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportJSON = () => {
    const data = JSON.stringify({
      sessionId,
      menuItems,
      originalText: inputText,
      meta: usageStats
    }, null, 2);
    downloadFile(data, `describe-your-problem-${sessionId}.json`, 'application/json');
  };

  const exportMarkdown = () => {
    let annotatedText = "";
    textChunks.forEach(chunk => {
      if (chunk.type === 'highlight') {
        annotatedText += `**${chunk.text}** [${chunk.itemIndex}]`;
      } else {
        annotatedText += chunk.text;
      }
    });

    let md = `# ITINERARY: ${sessionId}\nGenerated: ${new Date().toLocaleDateString()}\n\n`;
    menuItems.forEach((item, idx) => {
      md += `## ${idx + 1}. ${item.dishName.toUpperCase()}\n`;
      md += `**QTY:** ${item.quantity}\n`;
      md += `> "${item.expertAdvice}"\n\n`;
    });
    md += `---\n## ORIGINAL SOURCE (TRACEABLE)\n\n${annotatedText}`;
    downloadFile(md, `describe-your-problem-${sessionId}.md`, 'text/markdown');
  };

  const triggerPrint = () => {
    window.print();
  };

  // --- Render Helpers ---

  const renderTransparencyReport = () => {
    if (!usageStats) return null;
    return (
      <div className="mt-auto pt-8 border-t border-black font-mono text-[10px] uppercase tracking-widest text-gray-400 no-print flex justify-between items-center opacity-60">
        <span>GEMINI-3-FLASH</span>
        <span>{usageStats.totalTokenCount} TOKENS / ${usageStats.estimatedCost.toFixed(6)}</span>
      </div>
    );
  };

  const renderLeftPanel = () => {
    // LOADING
    if (appState === AppState.LOADING) {
      return (
        <div className="flex flex-col h-full justify-center max-w-lg mx-auto w-full">
          <div className="mb-8 border-b border-black pb-2 flex justify-between items-baseline">
            <span className="uppercase tracking-widest font-bold font-mono text-xs animate-pulse">Processing</span>
            {/* Animated Dots */}
            <span className="font-mono text-xs w-6 text-right">{loadingDots}</span>
          </div>
          <div className="w-full font-mono text-[10px] text-gray-500 flex flex-col gap-1.5">
            {loadingLogs.map((log, i) => (
              <div key={i} className="animate-in fade-in slide-in-from-left-2 duration-300">
                {log}
                {i === loadingLogs.length - 1 && <span className="typewriter-caret ml-1">&nbsp;</span>}
              </div>
            ))}
          </div>
        </div>
      )
    }

    // FORM
    if (viewMode === 'FORM') {
      return (
        <div className="flex flex-col h-full relative">
          <header className="mb-8 lg:mb-12">
            <h1 className="text-4xl lg:text-5xl font-mono font-bold tracking-tighter uppercase leading-[0.9] mb-8 lg:mb-12">
              Untangle<br />Your<br />Problem...
            </h1>
            <div className="font-mono text-xs text-gray-800 space-y-6 max-w-sm leading-loose">
              <p className="leading-relaxed">
                <span className="bg-insight box-decoration-clone px-1 text-black">
                  This tool deconstructs complex "brain dumps" into an actionable itinerary.
                </span>
              </p>
              <ol className="list-decimal list-inside space-y-3 text-gray-500">
                <li><span className="text-black">Type your stream of consciousness below.</span></li>
                <li>Do not worry about structure, grammar, or content.</li>
                <li>Write it out first.</li>
                <li className="text-black leading-relaxed pt-2">
                  Press "GET MENU" to get your set of tasks to start with - we will help you untangle this! 🐙
                </li>
              </ol>
            </div>
          </header>

          <div className="mt-auto mb-8">
            {menuItems.length > 0 && (
              <button
                onClick={handleNavToResult}
                className="mb-6 text-xs font-mono underline hover:text-gray-500 transition-colors block"
              >
                View Previous Menu &rarr;
              </button>
            )}

            <button
              onClick={handleDeconstruct}
              disabled={!isInputValid}
              className={`
                            w-full flex items-center justify-between py-4 lg:py-6 border-b-2 transition-all font-mono font-bold text-xl lg:text-2xl uppercase group
                            ${isInputValid ? 'border-black text-black' : 'border-gray-100 text-gray-200'}
                        `}
            >
              <span>Get Menu</span>
              <span className={`transition-transform duration-300 ${isInputValid ? 'group-hover:translate-x-2' : ''}`}>
                <ArrowRightIcon />
              </span>
            </button>

            {error && (
              <div className="mt-6 pt-4 border-t border-red-100 w-full animate-in fade-in slide-in-from-bottom-2">
                <div className="text-red-600 font-mono text-[10px] flex items-center gap-2 font-bold uppercase mb-3">
                  <InfoIcon /> Processing Halted: {error}
                </div>
                <div className="font-mono text-[9px] text-gray-500 space-y-1 max-h-40 overflow-y-auto custom-scrollbar bg-gray-50 p-3 rounded border border-gray-100 shadow-inner">
                  {loadingLogs.map((log, i) => (
                    <div key={i} className="break-words border-b border-gray-100 pb-1 mb-1 last:border-0">{log}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    // RESULT (ITINERARY)
    const totalCount = menuItems.reduce((acc, item) => {
      // Try to parse "N x ..."
      const match = item.quantity.match(/^(\d+)/);
      return acc + (match ? parseInt(match[0], 10) : 0);
    }, 0);

    const equationParts = menuItems.map(i => i.quantity).join(' + ');

    return (
      <div className="flex flex-col h-full relative">
        <header className="mb-6 lg:mb-8 flex justify-between items-baseline pt-2 pb-4 lg:pb-6 border-b border-gray-100 bg-white z-20">
          <div className="flex flex-col gap-1">
            <h2 className="text-xs font-mono font-bold tracking-widest uppercase text-black">Itinerary_</h2>
            <span className="text-[10px] font-mono tracking-wider text-gray-400">ID: {sessionId}</span>
          </div>
          <button
            onClick={handleNavToForm}
            className="no-print font-mono text-[10px] uppercase tracking-widest hover:text-gray-500 transition-colors"
          >
            [ Back ]
          </button>
        </header>

        <div className="flex-grow overflow-y-auto custom-scrollbar pr-1 lg:pr-4 pb-12">
          <div className="flex flex-col gap-8 lg:gap-10">
            {menuItems.map((item, index) => {
              const isActive = activeItemId === item.id;
              return (
                <div
                  key={item.id}
                  id={`menu-item-${item.id}`}
                  onMouseEnter={() => setActiveItemId(item.id)}
                  onMouseLeave={() => setActiveItemId(null)}
                  onClick={() => {
                    setActiveItemId(item.id);
                    document.getElementById(`source-chunk-${item.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                  className="group transition-colors cursor-pointer"
                >
                  <div className="flex flex-row gap-4 lg:gap-6 items-baseline relative">
                    {/* MANIFESTO NUMBERING - MINIMALIST */}
                    <div className="flex flex-col items-start flex-shrink-0 w-12 lg:w-16">
                      <span className="font-mono text-2xl lg:text-4xl font-light tracking-tighter leading-none text-black opacity-80 lg:opacity-100">
                        {(index + 1).toString().padStart(2, '0')}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 space-y-1.5 pt-0">
                      <div className="flex flex-row justify-between items-baseline gap-2 border-b border-gray-100 pb-1 mb-1 lg:border-none lg:pb-0 lg:mb-0">
                        {/* DISH NAME - The primary highlight target */}
                        <h3 className={`font-mono font-bold text-sm lg:text-lg uppercase tracking-tight transition-colors duration-200 inline-block ${isActive ? 'bg-insight text-black' : 'text-black'}`}>
                          {item.dishName}
                        </h3>

                        {/* POLISHED QUANTITY PILL */}
                        <span className={`font-mono text-[9px] lg:text-[10px] whitespace-nowrap px-2 py-1 rounded-sm transition-colors ${isActive ? 'bg-black text-white' : 'bg-gray-100 text-gray-600'}`}>
                          {item.quantity}
                        </span>
                      </div>
                      {/* Advice - Scaled down for "Menu" feel */}
                      <p className="font-serif text-sm lg:text-base leading-relaxed text-gray-700 max-w-2xl text-justify lg:text-left">
                        &ldquo;{item.expertAdvice}&rdquo;
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
            {/* TOTAL SUMMARY */}
            <div className="mt-6 pt-6 border-t-2 border-dashed border-gray-100">
              <div className="font-mono text-[10px] text-gray-400 mb-4 uppercase tracking-widest">
                Conclusion (Total Output)
              </div>
              <div className="font-mono text-xs lg:text-sm text-gray-500 leading-relaxed break-words bg-gray-50 p-4 lg:p-6 rounded-sm">
                <span className="opacity-75">= {equationParts}</span>
                <div className="mt-4 pt-4 border-t border-gray-200 text-black text-xl lg:text-2xl font-bold tracking-tight">
                  = {totalCount} x things
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Exports */}
        <div className="mt-auto pt-6 lg:pt-8 border-t border-black no-print flex flex-wrap justify-between items-center font-mono text-[10px] uppercase tracking-widest gap-4">
          <div className="flex gap-6">
            <button onClick={exportJSON} className="hover:underline">JSON</button>
            <button onClick={exportMarkdown} className="hover:underline">Markdown</button>
          </div>
          <button onClick={triggerPrint} className="flex items-center gap-2 hover:bg-insight hover:text-black px-3 py-1 -mr-3 transition-colors">
            <span>Save PDF</span>
            <DownloadIcon />
          </button>
        </div>
      </div>
    );
  };

  const renderRightPanel = () => {
    return (
      <div className="h-full flex flex-col relative">
        {/* Header - Minimal */}
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

        {/* Content Area */}
        <div className="flex-grow overflow-y-auto custom-scrollbar relative pr-2">
          {viewMode === 'FORM' ? (
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Begin typing stream of consciousness..."
              className="w-full h-full bg-transparent text-base lg:text-lg font-mono leading-relaxed resize-none focus:outline-none placeholder-gray-300 p-0 border-none min-h-[50vh]"
              spellCheck={false}
            />
          ) : (
            <div className="font-mono text-xs lg:text-sm leading-loose whitespace-pre-wrap text-justify pb-8 pt-4 lg:pt-0">
              {textChunks.map((chunk, idx) => {
                const isActive = chunk.type === 'highlight' && chunk.itemId === activeItemId;
                const isHighlighted = chunk.type === 'highlight';

                // Logic:
                // - Active (Hovered either side): Neon BG, Black text.
                // - Highlighted (Part of a menu item but not hovered): Bold Black text, bottom border.
                // - Normal: Gray
                return (
                  <span
                    key={idx}
                    id={chunk.itemId ? `source-chunk-${chunk.itemId}` : undefined}
                    className={`transition-all duration-200 cursor-pointer ${isActive
                      ? 'bg-insight text-black font-bold px-0.5 decoration-clone shadow-sm'
                      : isHighlighted
                        ? 'text-black font-semibold border-b border-gray-200 decoration-clone hover:bg-gray-100'
                        : 'text-gray-400'
                      }`}
                    onMouseEnter={() => isHighlighted && chunk.itemId && setActiveItemId(chunk.itemId)}
                    onClick={() => {
                      if (chunk.itemId) {
                        setActiveItemId(chunk.itemId);
                        document.getElementById(`menu-item-${chunk.itemId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }
                    }}
                  >
                    {chunk.text}
                    {/* Footnote Visual Signifier - Subtle */}
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

        {renderTransparencyReport()}
      </div>
    )
  }

  return (
    // Mobile: Flex Col (stacked), auto height. Desktop: Flex Row, screen height.
    <div className="min-h-screen w-full bg-white text-black selection:bg-insight selection:text-black flex flex-col lg:flex-row lg:h-screen lg:overflow-hidden">

      {/* LEFT PANEL */}
      {/* Mobile order: Top (Form mode: Info), Top (Result mode: Itinerary) */}
      <div className="left-panel-container w-full lg:w-1/2 flex-shrink-0 h-auto lg:h-full p-4 lg:p-16 border-b lg:border-b-0 lg:border-r border-gray-100 bg-white z-20 lg:overflow-hidden flex flex-col">
        {renderLeftPanel()}
      </div>

      {/* RIGHT PANEL */}
      {/* Mobile order: Bottom. Needs min-height for typing comfortably on mobile */}
      <div className="right-panel-container w-full lg:w-1/2 flex-shrink-0 min-h-[50vh] lg:h-full bg-gray-50 p-4 lg:p-16 relative z-10 lg:overflow-hidden flex flex-col">
        {renderRightPanel()}
      </div>

    </div>
  );
}