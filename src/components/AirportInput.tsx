"use client";

import { AnimatePresence, motion } from "motion/react";
import { MapPin } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";

interface Suggestion {
  iata: string;
  name: string;
  city: string;
  country: string;
}

export function AirportInput({
  value,
  onChange,
  placeholder,
  label,
  icon,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
  icon?: React.ReactNode;
  autoFocus?: boolean;
}) {
  const text = value;
  const [fetched, setFetched] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);
  const items = text.trim().length >= 2 ? fetched : [];

  useEffect(() => {
    const q = text.trim();
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/airports?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        setFetched(await res.json());
        setActive(0);
      } catch {
        /* aborted */
      }
    }, 140);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [text]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (s: Suggestion) => {
    onChange(s.iata);
    setOpen(false);
  };

  return (
    <div ref={box} className="relative flex-1">
      <label className="flex items-center gap-3 rounded-xl px-4 py-3 transition-colors focus-within:bg-white/[0.04]">
        <span className="text-sky-300">{icon ?? <MapPin className="size-5" />}</span>
        <span className="flex flex-1 flex-col">
          <span className="text-[11px] font-medium tracking-wider text-slate-400 uppercase">{label}</span>
          <input
            role="combobox"
            aria-expanded={open && items.length > 0}
            aria-controls={listId}
            autoFocus={autoFocus}
            value={text}
            placeholder={placeholder}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              onChange(e.target.value);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (!open || !items.length) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => (a + 1) % items.length);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => (a - 1 + items.length) % items.length);
              } else if (e.key === "Enter" && text.trim().length !== 3) {
                e.preventDefault();
                pick(items[active]);
              } else if (e.key === "Escape") setOpen(false);
            }}
            className="w-full bg-transparent text-base font-medium text-white placeholder:text-slate-500 focus:outline-none"
          />
        </span>
      </label>
      <AnimatePresence>
        {open && items.length > 0 && (
          <motion.ul
            id={listId}
            role="listbox"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="glass-strong absolute top-full right-0 left-0 z-50 mt-2 max-h-80 overflow-auto rounded-2xl p-1.5 shadow-2xl"
          >
            {items.map((s, i) => (
              <li
                key={s.iata}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
                className={clsx(
                  "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors",
                  i === active ? "bg-sky-400/10" : "hover:bg-white/5",
                )}
              >
                <span className="w-12 rounded-lg bg-white/5 py-1 text-center font-mono text-sm font-semibold text-sky-300">
                  {s.iata}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm text-white">{s.city || s.name}</span>
                  <span className="block truncate text-xs text-slate-400">
                    {s.name} · {s.country}
                  </span>
                </span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
