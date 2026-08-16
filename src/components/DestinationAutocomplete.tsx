"use client";

import { ArrowUpRight, Building2, LoaderCircle, MapPin, Mountain, Navigation } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { DestinationSuggestion, GeocodedPlace } from "@/types/analysis";

type Props = {
  value: string;
  onValueChange: (value: string) => void;
  onSelect: (destination: GeocodedPlace) => void | Promise<void>;
  onSubmit: () => void;
  disabled?: boolean;
  error?: string;
  onInteractionChange?: (active: boolean) => void;
};

export default function DestinationAutocomplete({ value, onValueChange, onSelect, onSubmit, disabled = false, error, onInteractionChange }: Props) {
  const sessionToken = useRef<string>("");
  const skipQuery = useRef<string | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusedRef = useRef(false);
  const selectionPending = useRef(false);
  const [suggestions, setSuggestions] = useState<DestinationSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [selectionError, setSelectionError] = useState<string>();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    onInteractionChange?.(focused || open);
  }, [focused, onInteractionChange, open]);

  useEffect(() => {
    sessionToken.current ||= crypto.randomUUID();
    const query = value.trim();
    if (skipQuery.current === query) {
      skipQuery.current = undefined;
      return;
    }
    if (query.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetch(`/api/search?q=${encodeURIComponent(query)}&sessionToken=${encodeURIComponent(sessionToken.current)}`, { signal: controller.signal })
        .then((response) => response.json() as Promise<{ suggestions?: DestinationSuggestion[]; unavailable?: boolean }>)
        .then((data) => {
          setSuggestions(data.suggestions ?? []);
          setUnavailable(Boolean(data.unavailable));
          setOpen(focusedRef.current);
          setActiveIndex(-1);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setUnavailable(true);
          setSuggestions([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 320);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  async function choose(suggestion: DestinationSuggestion) {
    if (disabled || selectionPending.current) return;
    selectionPending.current = true;
    setLoading(true);
    setSelectionError(undefined);
    let destinationRetrieved = false;
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapboxId: suggestion.mapboxId, sessionToken: sessionToken.current }),
      });
      if (!response.ok) throw new Error("Destination lookup failed");
      const data = await response.json() as { destination: GeocodedPlace };
      destinationRetrieved = true;
      skipQuery.current = data.destination.name;
      setSuggestions([]);
      setOpen(false);
      inputRef.current?.blur();
      await onSelect(data.destination);
      sessionToken.current = crypto.randomUUID();
    } catch {
      if (destinationRetrieved) {
        setSelectionError("Couldn’t open the route check. Try the arrow button.");
      } else {
        setUnavailable(true);
      }
    } finally {
      selectionPending.current = false;
      setLoading(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(suggestions.length - 1, index + 1));
    } else if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (disabled) return;
      const selected = suggestions[activeIndex];
      if (open && selected) void choose(selected);
      else onSubmit();
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const visibleError = selectionError ?? error;
  const hasSuggestionContent = suggestions.length > 0 || unavailable;
  return (
    <div className="relative z-[60]">
      <div className="roadwise-focus-shell glass card flex items-center gap-3 p-2.5 pl-4 transition-[border-color,background-color,box-shadow] duration-200">
        <Navigation size={18} strokeWidth={1.6} className="text-[#d48c6b]" />
        <input
          ref={inputRef}
          aria-label="Destination"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-busy={loading}
          aria-controls="destination-suggestions"
          aria-activedescendant={open && activeIndex >= 0 ? `destination-suggestion-${activeIndex}` : undefined}
          value={value}
          onChange={(event) => {
            const next = event.target.value;
            const hasSearchQuery = next.trim().length >= 2;
            skipQuery.current = undefined;
            onValueChange(next);
            setSelectionError(undefined);
            setOpen(hasSearchQuery);
            if (!hasSearchQuery) {
              setSuggestions([]);
              setActiveIndex(-1);
              setLoading(false);
            }
            setUnavailable(false);
          }}
          onFocus={() => {
            focusedRef.current = true;
            setFocused(true);
            if (suggestions.length > 0) setOpen(true);
          }}
          onBlur={() => {
            focusedRef.current = false;
            setFocused(false);
            setOpen(false);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Town, landmark, anywhere…"
          autoComplete="off"
          className="destination-input roadwise-focus-scroll min-w-0 flex-1 border-0 bg-transparent py-3 text-[14px] outline-none ring-0 placeholder:text-[#65736f] focus:border-transparent focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
        />
        {loading ? <LoaderCircle size={18} className="animate-spin text-[#69a8a3]" aria-hidden="true" /> : null}
        <button type="button" onClick={onSubmit} disabled={disabled} aria-label="Check this drive" className="motion-press flex h-11 w-11 shrink-0 items-center justify-center rounded-[17px] bg-[#d48c6b] text-[#21130e] shadow-[0_8px_22px_rgba(212,140,107,.2)] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-0 disabled:cursor-wait disabled:opacity-60 disabled:hover:translate-y-0"><ArrowUpRight size={19} /></button>
      </div>
      {hasSuggestionContent ? (
        <div id="destination-suggestions" role="listbox" aria-label="Destination suggestions" aria-hidden={!open} inert={!open || undefined} data-state={open ? "open" : "closed"} className="autocomplete-panel destination-suggestions glass absolute z-[70] mt-2 w-full overflow-y-auto overscroll-contain rounded-[22px] p-2">
          {suggestions.map((item, index) => (
            <button id={`destination-suggestion-${index}`} key={item.mapboxId} type="button" role="option" aria-selected={activeIndex === index} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => void choose(item)} className={`motion-press flex w-full items-center gap-3 rounded-[16px] px-3 py-3 text-left disabled:cursor-wait disabled:opacity-60 ${activeIndex === index ? "bg-white/[.07]" : "hover:bg-white/[.045]"}`}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-[#2d6b6b]/20 text-[#69a8a3]">{suggestionIcon(item.featureType)}</span>
              <span className="min-w-0"><span className="block truncate text-[13px] font-medium">{item.name}</span><span className="mt-0.5 block truncate text-[10px] text-[#82908d]">{item.context || "Iceland"}</span></span>
            </button>
          ))}
          {unavailable ? <div className="px-3 py-2 text-[10px] text-[#8e9b98]">Suggestions are temporarily unavailable. You can still check the typed destination.</div> : null}
        </div>
      ) : null}
      {visibleError ? <p role="status" className="mt-2 px-2 text-[10px] leading-4 text-[#d9a68d]">{visibleError}</p> : null}
    </div>
  );
}

function suggestionIcon(type: string) {
  if (type === "poi") return <MapPin size={17} />;
  if (type === "place" || type === "city" || type === "locality") return <Building2 size={17} />;
  return <Mountain size={17} />;
}
