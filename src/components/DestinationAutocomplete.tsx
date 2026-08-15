"use client";

import { ArrowUpRight, Building2, LoaderCircle, MapPin, Mountain, Navigation } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { DestinationSuggestion, GeocodedPlace } from "@/types/analysis";

type Props = {
  value: string;
  onValueChange: (value: string) => void;
  onSelect: (destination: GeocodedPlace) => void;
  onSubmit: () => void;
};

export default function DestinationAutocomplete({ value, onValueChange, onSelect, onSubmit }: Props) {
  const sessionToken = useRef<string>("");
  const skipQuery = useRef<string | undefined>(undefined);
  const [suggestions, setSuggestions] = useState<DestinationSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

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
          setOpen(true);
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
    setLoading(true);
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapboxId: suggestion.mapboxId, sessionToken: sessionToken.current }),
      });
      if (!response.ok) throw new Error("Destination lookup failed");
      const data = await response.json() as { destination: GeocodedPlace };
      skipQuery.current = data.destination.name;
      onSelect(data.destination);
      setSuggestions([]);
      setOpen(false);
      sessionToken.current = crypto.randomUUID();
    } catch {
      setUnavailable(true);
    } finally {
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
      const selected = suggestions[activeIndex];
      if (open && selected) void choose(selected);
      else onSubmit();
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return <div className="relative"><div className="glass card flex items-center gap-3 p-2.5 pl-4 transition-[border-color,background-color,box-shadow] duration-200 focus-within:border-[#4a8f8f]/60 focus-within:bg-[#2d6b6b]/[.08] focus-within:shadow-[0_0_0_3px_rgba(45,107,107,.16),0_22px_55px_rgba(0,0,0,.24),inset_0_1px_0_rgba(232,196,176,.09)]"><Navigation size={18} strokeWidth={1.6} className="text-[#d48c6b]" /><input aria-label="Destination" role="combobox" aria-expanded={open} aria-controls="destination-suggestions" value={value} onChange={(event) => { const next = event.target.value; skipQuery.current = undefined; onValueChange(next); setOpen(next.trim().length >= 2); if (next.trim().length < 2) setSuggestions([]); setUnavailable(false); }} onFocus={() => suggestions.length > 0 && setOpen(true)} onKeyDown={handleKeyDown} placeholder="Vík, Gullfoss, anywhere…" autoComplete="off" className="min-w-0 flex-1 border-0 bg-transparent py-3 text-[14px] outline-none ring-0 placeholder:text-[#65736f] focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0" />{loading ? <LoaderCircle size={18} className="animate-spin text-[#69a8a3]" /> : null}<button onClick={onSubmit} aria-label="Check this drive" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[17px] bg-[#d48c6b] text-[#21130e] shadow-[0_8px_22px_rgba(212,140,107,.2)] transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-0"><ArrowUpRight size={19} /></button></div>{open && (suggestions.length > 0 || unavailable) && <div id="destination-suggestions" className="glass absolute z-20 mt-2 w-full overflow-hidden rounded-[22px] p-2">{suggestions.map((item, index) => <button key={item.mapboxId} onMouseDown={(event) => event.preventDefault()} onClick={() => void choose(item)} className={`flex w-full items-center gap-3 rounded-[16px] px-3 py-3 text-left transition ${activeIndex === index ? "bg-white/[.07]" : "hover:bg-white/[.045]"}`}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-[#2d6b6b]/20 text-[#69a8a3]">{suggestionIcon(item.featureType)}</span><span className="min-w-0"><span className="block truncate text-[13px] font-medium">{item.name}</span><span className="mt-0.5 block truncate text-[10px] text-[#82908d]">{item.context || "Iceland"}</span></span></button>)}{unavailable && <div className="px-3 py-2 text-[10px] text-[#8e9b98]">Suggestions are temporarily unavailable. You can still check the typed destination.</div>}</div>}</div>;
}

function suggestionIcon(type: string) {
  if (type === "poi") return <MapPin size={17} />;
  if (type === "place" || type === "city" || type === "locality") return <Building2 size={17} />;
  return <Mountain size={17} />;
}
