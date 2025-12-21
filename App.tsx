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
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const InfoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
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

type Note = {
  id: string;
  text: string;
  x: number;
  y: number;
  rotation: number;
  type: 'quote' | 'minimal' | 'scribble';
};

// --- Helpers ---
const generateSessionId = () => {
  // Generate a cryptographic-style batch ID
  // e.g., BATCH-0xAF31
  const hex = Math.floor(Math.random() * 0xFFFFFF).toString(16).toUpperCase().padStart(6, '0').slice(0, 4);
  return `BATCH-0x${hex}`;
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
  const [headerColor, setHeaderColor] = useState<string>('text-black');

  // Navigation State
  const [viewMode, setViewMode] = useState<'FORM' | 'RESULT'>('FORM');

  // --- Sticky Notes State ---
  const [notes, setNotes] = useState<Note[]>([
    {
      id: 'quote-1',
      text: `"Everything feels stuck. I have 40 unread emails, the kitchen sink is leaking, I wanted to write a book this year but I haven't started... Also, I'm out of milk."`,
      x: 480, // Top Right area
      y: 60,
      rotation: -1,
      type: 'quote'
    },
    {
      id: 'quote-2',
      text: `"There is a specific kind of joy in seeing a messy mind mapped onto a clean sheet of paper. It’s like watching a storm turn into an irrigation system. Suddenly, the flood is useful."`,
      x: 80, // Bottom Left area
      y: 520,
      rotation: 1,
      type: 'quote'
    },
    {
      id: 'quote-3',
      text: `"I spent 3 hours worrying about the 10 minutes of work I had to do. Never again."`,
      x: 520, // Middle Right area
      y: 380,
      rotation: -2,
      type: 'quote'
    },
    {
      id: 'stamp-1',
      text: "UNTANGLED",
      x: 650,
      y: 580,
      rotation: -8,
      type: 'minimal' // Keeping one small distinct stamp as a signature
    }
  ]);
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Focus management
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Only focus on desktop or when explicitly intended to avoid jarring mobile jumps
    if (viewMode === 'FORM' && appState === AppState.INPUT && textareaRef.current && window.innerWidth > 768) {
      textareaRef.current.focus();
    }
  }, [viewMode, appState]);

  // --- Drag Logic ---
  const handleNoteMouseDown = (e: React.MouseEvent, noteId: string, noteX: number, noteY: number) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent text selection
    setDraggedNoteId(noteId);

    // Calculate offset relative to the note's current position
    // We want to know where within the note the user clicked
    setDragOffset({
      x: e.clientX - noteX,
      y: e.clientY - noteY
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggedNoteId) {
        setNotes(prev => prev.map(n => {
          if (n.id === draggedNoteId) {
            return {
              ...n,
              x: e.clientX - dragOffset.x,
              y: e.clientY - dragOffset.y
            };
          }
          return n;
        }));
      }
    };

    const handleMouseUp = () => {
      setDraggedNoteId(null);
    };

    if (draggedNoteId) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggedNoteId, dragOffset]);


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

      // Fibonacci-based RGB Color Generator with Contrast Guarantee
      // Creates a rhythmic "footstep" cadence through color space

      const generateFibonacciColor = (seed: number, previousColor?: string): string => {
        // Generate Fibonacci sequence for RGB channels
        const fib = (n: number): number => {
          if (n <= 1) return n;
          let a = 0, b = 1;
          for (let i = 2; i <= n; i++) {
            [a, b] = [b, a + b];
          }
          return b;
        };

        // Use seed to generate three different Fibonacci positions
        const seedOffset = seed * 7; // Prime multiplier for distribution
        const r = fib((seedOffset + 5) % 20) * 15 % 256; // Red channel
        const g = fib((seedOffset + 11) % 20) * 13 % 256; // Green channel  
        const b = fib((seedOffset + 17) % 20) * 11 % 256; // Blue channel

        // Ensure vibrant colors by boosting intensity
        const vibrance = 1.5;
        const rVibrant = Math.min(255, Math.floor(r * vibrance));
        const gVibrant = Math.min(255, Math.floor(g * vibrance));
        const bVibrant = Math.min(255, Math.floor(b * vibrance));

        return `rgb(${rVibrant}, ${gVibrant}, ${bVibrant})`;
      };

      // Calculate color contrast (perceptual difference)
      const getContrast = (color1: string, color2: string): number => {
        const parseRGB = (color: string): [number, number, number] => {
          const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
          if (match) {
            return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
          }
          return [0, 0, 0];
        };

        const [r1, g1, b1] = parseRGB(color1);
        const [r2, g2, b2] = parseRGB(color2);

        // Euclidean distance in RGB space
        return Math.sqrt(
          Math.pow(r2 - r1, 2) +
          Math.pow(g2 - g1, 2) +
          Math.pow(b2 - b1, 2)
        );
      };

      // Get color history
      const colorHistoryKey = 'untangle_color_history';
      const seedKey = 'untangle_color_seed';
      let lastColor: string | null = null;
      let currentSeed = Math.floor(Math.random() * 100);

      try {
        const stored = localStorage.getItem(colorHistoryKey);
        const storedSeed = localStorage.getItem(seedKey);
        if (stored) {
          const history = JSON.parse(stored);
          lastColor = history[history.length - 1] || null;
        }
        if (storedSeed) {
          currentSeed = parseInt(storedSeed) + 1; // Step forward
        }
      } catch (e) {
        // Start fresh
      }

      // Generate color with contrast guarantee
      const MIN_CONTRAST = 200; // Minimum perceptual difference
      let selectedColor = generateFibonacciColor(currentSeed, lastColor || undefined);
      let attempts = 0;

      // Keep generating until we find a contrasting color
      while (lastColor && getContrast(selectedColor, lastColor) < MIN_CONTRAST && attempts < 50) {
        currentSeed += 3; // Step by 3 for varied sequence
        selectedColor = generateFibonacciColor(currentSeed, lastColor);
        attempts++;
      }

      setHeaderColor(selectedColor);

      // Update history (keep last 2 for contrast checking)
      try {
        const history = [lastColor, selectedColor].filter(Boolean);
        localStorage.setItem(colorHistoryKey, JSON.stringify(history.slice(-2)));
        localStorage.setItem(seedKey, currentSeed.toString());
      } catch (e) {
        console.warn('Could not save color history');
      }

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

  const renderDraggableNotes = () => {
    return notes.map(note => (
      <div
        key={note.id}
        onMouseDown={(e) => handleNoteMouseDown(e, note.id, note.x, note.y)}
        style={{
          top: note.y,
          left: note.x,
          transform: `rotate(${note.rotation}deg)`,
          cursor: draggedNoteId === note.id ? 'grabbing' : 'grab',
          zIndex: draggedNoteId === note.id ? 50 : 10,
          position: 'absolute', // Ensure absolute
        }}
        className={`select-none transition-shadow duration-200 origin-center ${note.type === 'quote'
          ? 'max-w-md p-6 bg-[#fffdf5] border border-blue-200 shadow-xl text-blue-800' // Sticky Note / Stamp feel
          : 'p-2 border-2 border-blue-700 text-blue-700 font-bold uppercase tracking-widest text-xs mix-blend-multiply opacity-80 rounded-sm' // Minimal Stamp
          } hover:shadow-2xl hover:scale-[1.01] active:scale-[1.02]`}
      >
        {note.type === 'quote' ? (
          <>
            <div className="absolute top-0 right-0 p-2 opacity-20 pointer-events-none text-blue-900">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z" /></svg>
            </div>
            <p className="font-hand text-xl lg:text-3xl leading-relaxed font-bold opacity-90 pointer-events-none">
              {note.text}
            </p>
            <div className="mt-2 flex justify-end pointer-events-none">
              <span className="font-typewriter text-[9px] uppercase tracking-widest text-blue-400 opacity-60">Est. Previous User</span>
            </div>
          </>
        ) : (
          <span className="font-typewriter pointer-events-none">{note.text}</span>
        )}
      </div>
    ));
  };


  const renderTransparencyReport = () => {
    if (!usageStats) return null;
    return (
      <div className="mt-auto pt-8 border-t border-black font-mono text-[10px] uppercase tracking-widest text-gray-400 no-print flex justify-between items-center opacity-60">
        <span>STOCHASTIC PARROT 🦜</span>
        <span>{usageStats.totalTokenCount} TOKENS / ${usageStats.estimatedCost.toFixed(6)}</span>
      </div>
    );
  };

  const renderLeftPanel = () => {
    // LOADING
    if (appState === AppState.LOADING) {
      return (
        <div className="flex flex-col h-full justify-center max-w-lg mx-auto w-full">
          {/* Technical Header */}
          <div className="flex justify-between items-end border-b-2 border-black pb-2 mb-6">
            <h2 className="text-xl font-sans font-bold tracking-tighter uppercase leading-none">System<br />Processing</h2>
            <div className="flex flex-col items-end">
              <span className="text-[9px] font-mono uppercase tracking-widest text-gray-500 mb-1">Status</span>
              <span className="bg-insight text-black px-2 py-0.5 text-[10px] font-mono font-bold tracking-widest uppercase animate-pulse">Executable</span>
            </div>
          </div>

          {/* Progress Indicator - Thin Line */}
          <div className="w-full h-[1px] bg-gray-200 mb-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 h-full w-1/3 bg-black animate-[spin_1.5s_linear_infinite]" style={{ animation: 'shimmer 1s infinite linear' }}></div>
            <div className="h-full bg-black w-full origin-left animate-[scale-x_2s_ease-in-out_infinite]"></div>
          </div>

          <div className="w-full font-mono text-[10px] uppercase tracking-wider text-gray-600 flex flex-col gap-2 pl-4 border-l border-gray-100">
            {loadingLogs.map((log, i) => (
              <div key={i} className="animate-in fade-in slide-in-from-left-2 duration-300 flex items-baseline gap-2">
                <span className="text-gray-300 text-[8px]">0{i + 1}</span>
                <span>{log.replace('> ', '')}</span>
                {i === loadingLogs.length - 1 && <span className="typewriter-caret ml-1 bg-insight h-2 w-1.5 inline-block align-middle">&nbsp;</span>}
              </div>
            ))}
          </div>
        </div>
      )
    }

    // FORM
    if (viewMode === 'FORM') {
      return (
        <div className="flex flex-col h-full relative overflow-hidden" ref={leftPanelRef}>
          {renderDraggableNotes()}

          <header className="mb-8 lg:mb-12 relative z-0 pointer-events-none">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-mono font-bold tracking-tighter uppercase leading-[0.9] mb-8 lg:mb-10 pointer-events-auto">
              Untangle<br />Your<br />Problem...
            </h1>
            <div className="font-typewriter text-sm text-black space-y-6 max-w-md leading-relaxed pointer-events-auto">
              <p>
                <span className="bg-insight box-decoration-clone px-1 text-black">
                  This tool deconstructs complex "brain dumps" a.k.a the kind that leads to decision paralysis into an actionable itinerary.
                </span>
              </p>

              {/* Spacer removed for tighter layout */}

              <ol className="list-decimal list-inside space-y-4 text-black">
                <li><span>Type your stream of consciousness below.</span></li>
                <li>Do not worry about structure, grammar, or content.</li>
                <li>Write it out first.</li>
                <li className="pt-2">
                  Press "GET MENU" to get your set of tasks to start with - we will help you untangle this! 🐙
                </li>
              </ol>
            </div>
          </header>

          <div className="mt-auto mb-8 relative z-20">
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
                            w-full py-8 border-4 border-black transition-all duration-75 ease-out font-mono font-bold text-4xl uppercase group relative overflow-hidden active:scale-[0.99] flex items-center justify-center gap-6
                            ${isInputValid ? 'bg-white text-black hover:bg-black hover:text-white hover:border-black' : 'opacity-50 cursor-not-allowed bg-gray-50 text-gray-400 border-gray-200'}
                        `}
            >
              <span>Get Menu</span>
              <span className={`transition-transform duration-300 transform scale-150 ${isInputValid ? 'group-hover:translate-x-4' : ''}`}>
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
    // Counting logic fix: Count items, not quantity sums (which confuses duration with count)
    const totalCount = menuItems.length;

    return (
      <div className="flex flex-col h-full relative">
        <header className="mb-6 lg:mb-8 flex justify-between items-end pb-4 border-b-2 border-black bg-white z-20">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-typewriter font-bold tracking-tight text-gray-900 leading-none">Itinerary_</h2>
            <span className="text-[10px] font-mono tracking-widest text-black/40 uppercase">Batch: {sessionId}</span>
          </div>
          <button
            onClick={handleNavToForm}
            className="no-print font-mono text-[10px] uppercase tracking-widest hover:text-gray-500 transition-colors"
          >
            [ Back ]
          </button>
        </header>

        {/* BIG TOTAL HEADER - BRUTALIST STICKER */}
        <div className="mb-12 lg:mb-16 pointer-events-none select-none relative inline-block group">
          <div className="relative z-10 bg-white border-4 border-black px-6 py-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transform -rotate-1 transition-transform group-hover:rotate-0 group-hover:translate-x-1 group-hover:translate-y-1 group-hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <h1 className="font-rubik-spray text-5xl md:text-6xl lg:text-7xl xl:text-8xl tracking-wide leading-none max-w-full" style={{ color: headerColor }}>
              = {totalCount} {totalCount === 1 ? 'thing' : 'things'}
            </h1>
          </div>
          {/* Decorative 'tape' or anchor visual if needed, but brutalist prefers raw block */}
        </div>

        <div className="flex-grow overflow-y-auto custom-scrollbar pr-1 lg:pr-4 pb-12 print-expand">
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
                    document.getElementById(`source-chunk-${item.id}`)?.scrollIntoView({ behavior: 'auto', block: 'center' }); // Auto = Snap
                  }}
                  className="group transition-none cursor-pointer"
                >
                  <div className="flex flex-row gap-4 lg:gap-8 items-baseline relative group/item">
                    {/* MANIFESTO NUMBERING - RAW & PRECISE */}
                    <div className="flex flex-col items-start flex-shrink-0 w-12 lg:w-16 pt-1">
                      <span className="font-mono text-[10px] text-gray-400 opacity-0 group-hover/item:opacity-100 transition-opacity absolute -left-4 top-2">NO.</span>
                      <span className="font-mono text-2xl lg:text-3xl font-bold tracking-tighter text-black leading-none">
                        {(index + 1).toString().padStart(2, '0')}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 space-y-3 pt-0">
                      <div className="flex flex-col items-start gap-1 border-b border-gray-100 pb-4 mb-2 lg:border-none lg:pb-0 lg:mb-0">
                        {/* DISH NAME - HELVETICA BOLD - HIGH CONTRAST */}
                        <div className="flex flex-row justify-between items-baseline w-full gap-4">
                          <h3 className={`font-sans font-black text-lg md:text-xl lg:text-2xl xl:text-3xl uppercase leading-none tracking-tight transition-colors duration-200 ${isActive ? 'bg-insight text-black' : 'text-black'}`}>
                            {item.dishName}
                          </h3>

                          {/* ORGANIC QUANTITY - RIGHT ALIGNED */}
                          <span className="font-serif italic text-lg lg:text-xl text-gray-500 lowercase leading-none whitespace-nowrap flex-shrink-0 text-right">
                            &mdash; {item.quantity}
                          </span>
                        </div>
                      </div>
                      {/* Advice - Typewriter */}
                      <p className="font-typewriter text-xs lg:text-sm leading-relaxed text-gray-600 max-w-2xl text-justify lg:text-left mt-2 pl-1 border-l-2 border-transparent group-hover:border-insight transition-colors duration-0">
                        <span className="font-bold text-black mr-2">ADVICE📚:</span>
                        {item.expertAdvice}
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
                {/* Detailed Breakdown */}
                <div className="opacity-75 mb-4">
                  = {menuItems.map((item, idx) => (
                    <span key={item.id}>
                      {item.quantity} x {item.dishName.toLowerCase()}
                      {idx < menuItems.length - 1 ? ' + ' : ''}
                    </span>
                  ))}
                </div>

                {/* Final Count */}
                <div className="text-black text-xl lg:text-2xl font-bold tracking-tight border-t border-black/10 pt-4">
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
        <div className="flex-grow overflow-y-auto custom-scrollbar relative pr-2 print-expand">
          {viewMode === 'FORM' ? (
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Begin typing stream of consciousness..."
              className="w-full h-full bg-transparent text-base lg:text-lg font-typewriter leading-loose resize-none focus:outline-none placeholder-gray-300 p-0 border-none min-h-[50vh] print-expand"
              spellCheck={false}
            />
          ) : (
            <div className="font-typewriter text-xs lg:text-sm leading-loose whitespace-pre-wrap text-justify pb-8 pt-4 lg:pt-0">
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
                    className={`transition-none duration-0 cursor-pointer font-typewriter leading-loose ${isActive
                      ? 'bg-insight text-black font-bold px-0.5 decoration-clone shadow-none'
                      : isHighlighted
                        ? 'text-black font-semibold border-b-2 border-black decoration-clone hover:bg-gray-100'
                        : 'text-gray-400'
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
    <div className="min-h-screen w-full bg-white text-black selection:bg-insight selection:text-black flex flex-col lg:flex-row lg:h-screen lg:overflow-hidden font-sans">

      {/* LEFT PANEL */}
      {/* Mobile order: Top (Form mode: Info), Top (Result mode: Itinerary) */}
      <div className="left-panel-container w-full lg:w-1/2 flex-shrink-0 h-auto lg:h-full p-6 md:p-8 lg:p-12 xl:p-16 border-b lg:border-b-0 lg:border-r border-gray-200 bg-white/50 z-20 lg:overflow-hidden flex flex-col relative grid-line-r">
        {renderLeftPanel()}
      </div>

      {/* RIGHT PANEL */}
      {/* Mobile order: Bottom. Needs min-height for typing comfortably on mobile */}
      <div className="right-panel-container w-full lg:w-1/2 flex-shrink-0 min-h-[50vh] lg:h-full bg-gray-50/30 p-6 md:p-8 lg:p-12 xl:p-16 relative z-10 lg:overflow-hidden flex flex-col">
        {renderRightPanel()}
      </div>

    </div>
  );
}