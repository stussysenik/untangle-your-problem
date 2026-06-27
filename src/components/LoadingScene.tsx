import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import type { TemporalEventRow } from '../ai/machine';

type MachineState = 'starting' | 'loading' | 'success' | 'error';

type Props = {
  machineState: MachineState;
  workflowId: string | null;
  temporalEvents: TemporalEventRow[];
  reducedMotion: boolean;
};

// Map Temporal event types to GSAP timeline beat labels
function eventToBeat(eventType: string): string | null {
  const et = eventType.toUpperCase();
  if (et.includes('WORKFLOW EXECUTION STARTED')) return 'analyzing';
  if (et.includes('ACTIVITY TASK SCHEDULED')) return 'structuring';
  if (et.includes('ACTIVITY TASK STARTED')) return 'personalizing';
  if (et.includes('ACTIVITY TASK COMPLETED') || et.includes('WORKFLOW EXECUTION COMPLETED')) return 'done';
  return null;
}

// Temporal event type → human-friendly label for the panel
function friendlyType(eventType: string): string {
  const et = eventType.replace(/_/g, ' ');
  return et.length > 34 ? et.slice(0, 33) + '…' : et;
}

export default function LoadingScene({ machineState, workflowId, temporalEvents, reducedMotion }: Props) {
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const seenBeatsRef = useRef(new Set<string>());

  const svgRef = useRef<SVGSVGElement>(null);
  const layerSubmitRef = useRef<SVGGElement>(null);
  const layerAnalyzingRef = useRef<SVGGElement>(null);
  const layerStructuringRef = useRef<SVGGElement>(null);
  const layerPersonalizingRef = useRef<SVGGElement>(null);
  const layerDoneRef = useRef<SVGGElement>(null);

  // Build timeline once
  useEffect(() => {
    if (reducedMotion) return;

    const layers = {
      submit: layerSubmitRef.current,
      analyzing: layerAnalyzingRef.current,
      structuring: layerStructuringRef.current,
      personalizing: layerPersonalizingRef.current,
      done: layerDoneRef.current,
    };
    if (Object.values(layers).some((l) => !l)) return;

    gsap.set([layers.analyzing, layers.structuring, layers.personalizing, layers.done], { autoAlpha: 0, y: 10 });
    gsap.set(layers.submit, { autoAlpha: 1, y: 0 });

    const tl = gsap.timeline({ paused: true });

    tl.add('submit');
    tl.to(layers.submit, { scale: 1.06, duration: 0.7, yoyo: true, repeat: 1, ease: 'power1.inOut' });

    tl.add('analyzing');
    tl.to(layers.submit, { autoAlpha: 0, y: -10, duration: 0.25, ease: 'power2.in' }, 'analyzing');
    tl.to(layers.analyzing, { autoAlpha: 1, y: 0, duration: 0.35, ease: 'power2.out' }, 'analyzing+=0.15');
    tl.to(layers.analyzing, { x: 5, duration: 0.9, yoyo: true, repeat: 3, ease: 'sine.inOut' });

    tl.add('structuring');
    tl.to(layers.analyzing, { autoAlpha: 0, y: -10, duration: 0.25, ease: 'power2.in' }, 'structuring');
    tl.to(layers.structuring, { autoAlpha: 1, y: 0, duration: 0.35, ease: 'power2.out' }, 'structuring+=0.15');
    tl.to(layers.structuring, { x: -4, duration: 0.8, yoyo: true, repeat: 3, ease: 'sine.inOut' });

    tl.add('personalizing');
    tl.to(layers.structuring, { autoAlpha: 0, y: -10, duration: 0.25, ease: 'power2.in' }, 'personalizing');
    tl.to(layers.personalizing, { autoAlpha: 1, y: 0, duration: 0.35, ease: 'power2.out' }, 'personalizing+=0.15');
    tl.to(layers.personalizing, { scale: 1.04, duration: 1.1, yoyo: true, repeat: 5, ease: 'sine.inOut' });

    tl.add('done');
    tl.to([layers.personalizing, layers.structuring, layers.analyzing], { autoAlpha: 0, y: -10, duration: 0.2, ease: 'power2.in' }, 'done');
    tl.to(layers.done, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'back.out(1.4)' }, 'done+=0.15');

    tlRef.current = tl;

    // Start immediately at 'analyzing' — workflow is starting
    tl.tweenTo('analyzing');
  }, [reducedMotion]);

  // Advance GSAP timeline whenever a new real Temporal event arrives
  useEffect(() => {
    if (!tlRef.current || reducedMotion) return;

    for (const ev of temporalEvents) {
      const beat = eventToBeat(ev.eventType);
      if (beat && !seenBeatsRef.current.has(beat)) {
        seenBeatsRef.current.add(beat);
        tlRef.current.tweenTo(beat);
      }
    }
  }, [temporalEvents, reducedMotion]);

  // Force done when machine leaves loading
  useEffect(() => {
    if (!tlRef.current || reducedMotion) return;
    if (machineState === 'success' || machineState === 'error') {
      tlRef.current.tweenTo('done');
    }
  }, [machineState, reducedMotion]);

  const startTime = temporalEvents[0]
    ? new Date(temporalEvents[0].eventTime).getTime()
    : Date.now();

  return (
    <div className="flex flex-col h-full justify-center max-w-lg mx-auto w-full">
      {/* Header */}
      <div className="flex justify-between items-end border-b-2 border-black pb-2 mb-4">
        <div>
          <h2 className="text-base font-sans font-bold tracking-tighter uppercase leading-none">
            Workflow Execution
          </h2>
          {workflowId && (
            <p className="font-mono text-[9px] text-gray-400 mt-0.5 tracking-widest truncate max-w-[200px]">
              {workflowId}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-[9px] font-mono uppercase tracking-widest text-gray-500">Status</span>
          <span className="bg-insight text-black px-2 py-0.5 text-[10px] font-mono font-bold tracking-widest uppercase animate-pulse">
            {machineState === 'starting' ? 'STARTING' : 'RUNNING'}
          </span>
        </div>
      </div>

      {/* SVG beat layers — GSAP-driven by real Temporal events */}
      {reducedMotion ? (
        <div className="w-full h-20 flex items-center justify-center text-gray-400 font-mono text-xs tracking-widest uppercase">
          Processing…
        </div>
      ) : (
        <div className="w-full mb-5 flex items-center justify-center" style={{ height: 110 }}>
          <svg ref={svgRef} viewBox="0 0 320 110" width="320" height="110" aria-hidden="true" style={{ overflow: 'visible' }}>
            {/* submit */}
            <g ref={layerSubmitRef} transform="translate(160,55)">
              <circle cx="0" cy="0" r="26" fill="none" stroke="#000" strokeWidth="2" />
              <text textAnchor="middle" y="4" fontFamily="Space Mono,monospace" fontSize="8" fill="#000" letterSpacing="2">SUBMIT</text>
            </g>
            {/* WorkflowExecutionStarted */}
            <g ref={layerAnalyzingRef} transform="translate(160,55)">
              <rect x="-58" y="-19" width="116" height="38" fill="none" stroke="#000" strokeWidth="1.5" />
              <line x1="-38" y1="0" x2="38" y2="0" stroke="#CCFF00" strokeWidth="3" />
              <text textAnchor="middle" y="28" fontFamily="Space Mono,monospace" fontSize="7" fill="#666" letterSpacing="1">WORKFLOW STARTED</text>
            </g>
            {/* ActivityTaskScheduled */}
            <g ref={layerStructuringRef} transform="translate(160,55)">
              <rect x="-52" y="-17" width="34" height="34" fill="#CCFF00" />
              <rect x="-12" y="-17" width="34" height="34" fill="none" stroke="#000" strokeWidth="1.5" />
              <rect x="28" y="-17" width="24" height="34" fill="none" stroke="#000" strokeWidth="1.5" />
              <text textAnchor="middle" y="28" fontFamily="Space Mono,monospace" fontSize="7" fill="#666" letterSpacing="1">ACTIVITY SCHEDULED</text>
            </g>
            {/* ActivityTaskStarted */}
            <g ref={layerPersonalizingRef} transform="translate(160,55)">
              <circle cx="0" cy="0" r="28" fill="#CCFF00" />
              <circle cx="0" cy="0" r="17" fill="#fff" />
              <text textAnchor="middle" y="3" fontFamily="Space Mono,monospace" fontSize="7" fill="#000" letterSpacing="1">ACTIVITY</text>
              <text textAnchor="middle" y="28" fontFamily="Space Mono,monospace" fontSize="7" fill="#666" letterSpacing="1">STARTED</text>
            </g>
            {/* WorkflowExecutionCompleted */}
            <g ref={layerDoneRef} transform="translate(160,55)">
              <polyline points="-28,0 -8,20 28,-18" fill="none" stroke="#CCFF00" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
              <text textAnchor="middle" y="38" fontFamily="Space Mono,monospace" fontSize="7" fill="#666" letterSpacing="1">COMPLETED</text>
            </g>
          </svg>
        </div>
      )}

      {/* Temporal Workflow History panel */}
      <div className="border border-gray-100 rounded-none overflow-hidden">
        <div className="bg-black text-white px-3 py-1.5 flex justify-between items-center">
          <span className="font-mono text-[9px] uppercase tracking-widest">Workflow History</span>
          <span className="font-mono text-[9px] text-gray-400">{temporalEvents.length} events</span>
        </div>
        <div className="font-mono text-[10px] divide-y divide-gray-50 max-h-44 overflow-y-auto custom-scrollbar">
          {temporalEvents.length === 0 ? (
            <div className="px-3 py-2 text-gray-300 uppercase tracking-widest text-[9px]">
              Waiting for worker…
            </div>
          ) : (
            temporalEvents.map((ev) => {
              const elapsed = new Date(ev.eventTime).getTime() - startTime;
              return (
                <div key={ev.eventId} className="px-3 py-1.5 flex items-baseline gap-2 hover:bg-gray-50 transition-colors">
                  <span className="text-gray-300 w-4 flex-shrink-0 text-right">{ev.eventId}</span>
                  <span className="font-bold text-black flex-1 truncate">{friendlyType(ev.eventType)}</span>
                  {ev.detail && (
                    <span className="text-gray-400 text-[9px] truncate max-w-[90px]">{ev.detail}</span>
                  )}
                  <span className="text-gray-300 text-[9px] flex-shrink-0 ml-auto">
                    +{elapsed >= 1000 ? `${(elapsed / 1000).toFixed(1)}s` : `${elapsed}ms`}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
