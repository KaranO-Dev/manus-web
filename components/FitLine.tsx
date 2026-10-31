"use client";

import { useLayoutEffect, useRef, type CSSProperties } from "react";

/** Back to the stylesheet's size, then down to whatever fits the box's width */
function fit(el: HTMLElement) {
  el.style.fontSize = "";
  const room = el.clientWidth;
  const need = el.scrollWidth;
  if (need > room && room > 0) el.style.fontSize = `${(parseFloat(getComputedStyle(el).fontSize) * room * 0.98) / need}px`;
}

/**
 * One line of display type that shrinks to fit its box and never grows past its CSS size. The OLED's
 * note changes with every chord and its width axis follows the hand, so it is measured again when the
 * text changes, when the box changes width, and when the axes finish easing to a new value.
 */
export function FitLine({ text, className, style }: { text: string; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const axes = style?.fontVariationSettings;

  // Watched once for the life of the line, and only its width counts. Its height is fixed in CSS, so the
  // size the fit sets never changes the box and never feeds back into the observer
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let width = el.clientWidth;
    const watch = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === width) return;
      width = entry.contentRect.width;
      fit(el);
    });
    watch.observe(el);
    // The axes ease to their new values (a CSS transition), so the line is measured once they arrive
    const onEased = (e: TransitionEvent) => {
      if (e.propertyName === "font-variation-settings") fit(el);
    };
    el.addEventListener("transitionend", onEased);
    return () => {
      watch.disconnect();
      el.removeEventListener("transitionend", onEased);
    };
  }, []);

  // A new text is measured before it paints. New axes wait for the end of their transition, unless
  // there is none to wait for
  useLayoutEffect(() => {
    if (ref.current) fit(ref.current);
  }, [text]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && parseFloat(getComputedStyle(el).transitionDuration) === 0) fit(el);
  }, [axes]);

  return (
    <div ref={ref} className={className} style={style}>
      {text}
    </div>
  );
}
