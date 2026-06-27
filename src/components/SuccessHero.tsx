import React, { useEffect, useRef } from 'react';

// Lazy-loaded on success transition — the player is never included in the initial bundle.
// Replace the CSS SVG animation below with a .lottie export when the motion design is final.
export default function SuccessHero() {
  const circleRef = useRef<SVGCircleElement>(null);
  const checkRef = useRef<SVGPolylineElement>(null);

  useEffect(() => {
    const circle = circleRef.current;
    const check = checkRef.current;
    if (!circle || !check) return;

    // Animate circle draw
    circle.style.transition = 'stroke-dashoffset 0.6s cubic-bezier(0.22, 1, 0.36, 1)';
    circle.style.strokeDashoffset = '0';

    // Animate checkmark after circle
    const t = setTimeout(() => {
      check.style.transition = 'stroke-dashoffset 0.4s cubic-bezier(0.22, 1, 0.36, 1)';
      check.style.strokeDashoffset = '0';
    }, 500);

    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex items-center justify-center py-6" aria-label="Success">
      <svg viewBox="0 0 100 100" width="80" height="80" aria-hidden="true">
        <circle
          ref={circleRef}
          cx="50"
          cy="50"
          r="44"
          fill="none"
          stroke="#CCFF00"
          strokeWidth="5"
          strokeDasharray="276"
          strokeDashoffset="276"
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
        />
        <polyline
          ref={checkRef}
          points="26,52 42,68 74,34"
          fill="none"
          stroke="#CCFF00"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="80"
          strokeDashoffset="80"
        />
      </svg>
    </div>
  );
}
