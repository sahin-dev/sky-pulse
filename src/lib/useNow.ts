"use client";

import { useEffect, useState } from "react";

/**
 * Ticking clock. Starts from the server-provided timestamp so the first client
 * render matches the server HTML, then advances every `interval` ms.
 */
export function useNow(initial: number, interval = 1000) {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    // Correct any server/client clock drift on the first tick.
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, interval);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(id);
      clearTimeout(first);
    };
  }, [interval]);
  return now;
}
