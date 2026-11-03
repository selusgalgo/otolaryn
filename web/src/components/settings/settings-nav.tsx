"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { SETTINGS_SECTIONS } from "./settings-sections";

const LAST_ID = SETTINGS_SECTIONS[SETTINGS_SECTIONS.length - 1].id;

// Configuración is one scrolling page of blocks (each saves on its own);
// this menu jumps to a block and highlights whichever one is being read —
// a vertical list on desktop, a sticky row of pills on mobile.
export function SettingsNav() {
  const [activeId, setActiveId] = useState(SETTINGS_SECTIONS[0].id);
  const pillsRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    // Scroll-spy: the active block is the last one whose top has crossed a
    // line 30% down the viewport. At the very bottom the last block wins
    // even when it's too short to ever reach that line.
    function update() {
      const line = window.innerHeight * 0.3;
      let current = SETTINGS_SECTIONS[0].id;
      for (const { id } of SETTINGS_SECTIONS) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      setActiveId(atBottom ? LAST_ID : current);
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  // Keep the active pill visible in the mobile row — scrolls only that
  // row horizontally, never the page.
  useEffect(() => {
    const row = pillsRef.current;
    const pill = row?.querySelector<HTMLElement>(`[data-section="${activeId}"]`);
    if (row && pill) {
      row.scrollTo({ left: pill.offsetLeft - 16, behavior: "smooth" });
    }
  }, [activeId]);

  function jumpTo(event: React.MouseEvent<HTMLAnchorElement>, id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    event.preventDefault();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
    setActiveId(id);
  }

  return (
    // Sticky on the <nav> itself (a grid item spanning the whole page), not
    // on an inner wrapper — sticky only holds within its parent's box.
    // min-w-0: as a grid item, the pill row's full width would otherwise
    // stretch the single mobile column past the viewport.
    <nav aria-label="Secciones de configuración" className="sticky top-0 z-30 min-w-0 lg:top-6">
      {/* Mobile / tablet: row of pills */}
      <div className="-mx-4 bg-surface/95 px-4 py-2 backdrop-blur lg:hidden">
        <ul ref={pillsRef} className="flex gap-2 overflow-x-auto">
          {SETTINGS_SECTIONS.map(({ id, title, icon: Icon }) => {
            const active = id === activeId;
            return (
              <li key={id} data-section={id} className="shrink-0">
                <a
                  href={`#${id}`}
                  onClick={(e) => jumpTo(e, id)}
                  aria-current={active ? "location" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {title}
                </a>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Desktop: vertical list. Padding inside the card keeps each item —
          and the active item's indicator — clear of the rounded corners. */}
      <ul className="hidden space-y-1 rounded-xl border border-border/60 bg-card p-2 shadow-sm lg:block">
        {SETTINGS_SECTIONS.map(({ id, title, icon: Icon }) => {
          const active = id === activeId;
          return (
            <li key={id}>
              <a
                href={`#${id}`}
                onClick={(e) => jumpTo(e, id)}
                aria-current={active ? "location" : undefined}
                className={cn(
                  "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-primary-tint font-semibold text-primary before:absolute before:top-1/2 before:left-0 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-primary"
                    : "text-foreground hover:bg-muted/60",
                )}
              >
                <Icon className={cn("size-5 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                {title}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
