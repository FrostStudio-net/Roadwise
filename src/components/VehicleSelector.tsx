"use client";

import { CarFront, ChevronDown } from "lucide-react";
import type { VehicleType } from "@/types/analysis";

type Props = { vehicle: VehicleType; onChange?: (vehicle: VehicleType) => void };
const vehicles: VehicleType[] = ["Small car (2WD)", "SUV / 4x4", "Campervan", "Motorhome", "Electric vehicle"];

export default function VehicleSelector({ vehicle, onChange }: Props) {
  return (
    <label className="glass card flex items-center gap-3 p-4">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#d48c6b]/10 text-[#d48c6b]"><CarFront size={19} strokeWidth={1.7} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[9px] font-semibold uppercase tracking-[0.17em] text-[#82908d]">Your vehicle</span>
        <span className="relative mt-1 block">
          <select aria-label="Your vehicle" value={vehicle} onChange={(e) => onChange?.(e.target.value as VehicleType)} className="w-full appearance-none bg-transparent pr-8 text-[14px] font-medium text-[#f5f1eb] outline-none">
            {vehicles.map((item) => <option key={item} value={item} className="bg-[#141c1c]">{item}</option>)}
          </select>
          <ChevronDown size={16} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-[#8e9b98]" />
        </span>
      </span>
    </label>
  );
}
