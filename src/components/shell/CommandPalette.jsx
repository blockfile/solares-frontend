import { useEffect, useMemo, useRef, useState } from "react";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";
import SidebarIcon from "./SidebarIcon";

export default function CommandPalette({ open, onClose, items = [], onSelect }) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const listRef = useRef(null);

  useBodyScrollLock(open);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      `${item.label} ${item.group} ${item.key}`.toLowerCase().includes(q)
    );
  }, [items, query]);

  useEffect(() => {
    if (!open) return undefined;
    setQuery("");
    setActiveIndex(0);
    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector('[data-active="true"]');
    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, open, filtered.length]);

  if (!open) return null;

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (filtered.length ? (index + 1) % filtered.length : 0));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (filtered.length ? (index - 1 + filtered.length) % filtered.length : 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item = filtered[activeIndex];
      if (item) onSelect(item.key);
      return;
    }
    if (event.key === "Tab") {
      // Focus trap: cycle between the panel's focusable elements.
      const focusables = panelRef.current?.querySelectorAll(
        'input, button, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  const activeItem = filtered[activeIndex];

  return (
    <div
      className="hx-cmdk-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="hx-cmdk"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        ref={panelRef}
        onKeyDown={handleKeyDown}
      >
        <div className="hx-cmdk-search">
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.6-3.6" />
          </svg>
          <input
            ref={inputRef}
            className="hx-cmdk-input"
            type="text"
            placeholder="Search modules…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-listbox"
            aria-activedescendant={activeItem ? `cmdk-option-${activeItem.key}` : undefined}
            aria-label="Search modules"
            autoComplete="off"
            spellCheck="false"
          />
          <kbd className="kbd">Esc</kbd>
        </div>
        <div className="hx-cmdk-list" role="listbox" id="cmdk-listbox" ref={listRef}>
          {filtered.length === 0 && (
            <p className="hx-cmdk-empty">No modules match “{query}”</p>
          )}
          {filtered.map((item, index) => (
            <button
              key={item.key}
              id={`cmdk-option-${item.key}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              data-active={index === activeIndex ? "true" : "false"}
              className={`hx-cmdk-item${index === activeIndex ? " active" : ""}`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => onSelect(item.key)}
            >
              <SidebarIcon icon={item.icon} />
              <span className="hx-cmdk-item-label">{item.label}</span>
              <span className="hx-cmdk-item-hint">{item.group}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
