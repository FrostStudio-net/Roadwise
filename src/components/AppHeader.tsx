"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export default function AppHeader({
  title,
  subtitle,
  action,
  onBack,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  onBack?: () => void;
}) {
  const router = useRouter();

  return (
    <header className="app-header">
      <button type="button" onClick={onBack ?? (() => router.back())} aria-label={`Back from ${title}`} className="app-header-button motion-press glass">
        <ChevronLeft size={21} />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[17px] font-semibold tracking-[-0.025em]">{title}</h1>
        {subtitle ? <p className="mt-0.5 truncate text-[9px] uppercase tracking-[.11em] text-[#82908d]">{subtitle}</p> : null}
      </div>
      <div className="flex min-w-11 justify-end">{action ?? <span className="w-11" aria-hidden="true" />}</div>
    </header>
  );
}
