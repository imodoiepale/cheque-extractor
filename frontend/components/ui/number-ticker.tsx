"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface NumberTickerProps {
  value: number;
  direction?: "up" | "down";
  delay?: number;
  decimalPlaces?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export function NumberTicker({
  value,
  direction = "up",
  delay = 0,
  decimalPlaces = 0,
  prefix = "",
  suffix = "",
  className,
}: NumberTickerProps) {
  const [displayValue, setDisplayValue] = useState(direction === "down" ? value : 0);
  const ref = useRef<HTMLSpanElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setInView(true); },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;
    const timeout = setTimeout(() => {
      const start = direction === "down" ? value : 0;
      const end = direction === "down" ? 0 : value;
      const duration = 2000;
      const startTime = performance.now();

      const animate = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = start + (end - start) * eased;
        setDisplayValue(current);
        if (progress < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    }, delay);
    return () => clearTimeout(timeout);
  }, [inView, value, direction, delay]);

  return (
    <span ref={ref} className={cn("tabular-nums tracking-tight", className)}>
      {prefix}
      {displayValue.toFixed(decimalPlaces)}
      {suffix}
    </span>
  );
}
