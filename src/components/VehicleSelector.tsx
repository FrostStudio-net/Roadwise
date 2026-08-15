"use client";

import {
  BatteryCharging,
  BusFront,
  Car,
  Caravan,
  CarFront,
  Check,
  ChevronDown,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import type { VehicleType } from "@/types/analysis";

type Props = { vehicle: VehicleType; onChange?: (vehicle: VehicleType) => void };

const vehicles: Array<{
  label: VehicleType;
  icon: typeof CarFront;
}> = [
  { label: "Small car (2WD)", icon: Car },
  { label: "SUV / 4x4", icon: CarFront },
  { label: "Campervan", icon: Caravan },
  { label: "Motorhome", icon: BusFront },
  { label: "Electric vehicle", icon: BatteryCharging },
];

export default function VehicleSelector({ vehicle, onChange }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => selectedIndex(vehicle));

  useEffect(() => {
    if (!open) return;

    function closeOnOutsidePress(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function closeAndReturnFocus() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function choose(nextVehicle: VehicleType) {
    onChange?.(nextVehicle);
    setActiveIndex(selectedIndex(nextVehicle));
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      closeAndReturnFocus();
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => {
        const direction = event.key === "ArrowDown" ? 1 : -1;
        return (index + direction + vehicles.length) % vehicles.length;
      });
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(event.key === "Home" ? 0 : vehicles.length - 1);
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && open) {
      event.preventDefault();
      choose(vehicles[activeIndex].label);
    }
  }

  const SelectedIcon = vehicles[selectedIndex(vehicle)].icon;

  return (
    <div ref={rootRef} className={`vehicle-selector relative ${open ? "z-[80]" : ""}`}>
      <div className="roadwise-focus-shell glass card transition-[border-color,background-color,box-shadow] duration-200">
        <button
          ref={triggerRef}
          type="button"
          role="combobox"
          aria-label={`Your vehicle: ${vehicle}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={open ? `${listboxId}-option-${activeIndex}` : undefined}
          onClick={() => {
            setOpen((isOpen) => !isOpen);
            setActiveIndex(selectedIndex(vehicle));
          }}
          onKeyDown={handleKeyDown}
          className="flex min-h-[72px] w-full items-center gap-3 rounded-[26px] p-4 text-left outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#d48c6b]/10 text-[#d48c6b]">
            <SelectedIcon size={19} strokeWidth={1.7} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[9px] font-semibold uppercase tracking-[0.17em] text-[#82908d]">Your vehicle</span>
            <span className="mt-1 block truncate text-[14px] font-medium text-[#f5f1eb]">{vehicle}</span>
          </span>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={`shrink-0 text-[#8e9b98] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Choose your vehicle"
          className="vehicle-options glass absolute bottom-full left-0 z-[80] mb-2 w-full overflow-y-auto overscroll-contain rounded-[24px] border-white/[.11] bg-[#111a1a]/95 p-2 shadow-[0_24px_65px_rgba(0,0,0,.46),inset_0_1px_0_rgba(255,255,255,.06)]"
        >
          {vehicles.map(({ label, icon: Icon }, index) => {
            const selected = label === vehicle;
            const active = index === activeIndex;
            return (
              <button
                key={label}
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={selected}
                onPointerMove={() => setActiveIndex(index)}
                onClick={() => choose(label)}
                className={`flex min-h-13 w-full items-center gap-3 rounded-[17px] px-3 py-2.5 text-left outline-none transition-[background-color,color] focus:outline-none ${
                  selected
                    ? "bg-[#2d6b6b]/25 text-[#f5f1eb]"
                    : active
                      ? "bg-white/[.065] text-[#f5f1eb]"
                      : "text-[#b8c1be] hover:bg-white/[.045]"
                }`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] ${selected ? "bg-[#69a8a3]/15 text-[#78b5b0]" : "bg-white/[.045] text-[#82908d]"}`}>
                  <Icon size={17} strokeWidth={1.65} />
                </span>
                <span className="min-w-0 flex-1 text-[13px] font-medium">{label}</span>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[#e8c4b0]">
                  {selected ? <Check size={15} strokeWidth={2.2} /> : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function selectedIndex(vehicle: VehicleType): number {
  return Math.max(0, vehicles.findIndex(({ label }) => label === vehicle));
}
