export default function Logo() {
  return (
    <div className="flex items-center gap-3.5" aria-label="RoadWise">
      <div className="glass relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-[17px] text-[#69a8a3]">
        <svg viewBox="0 0 44 44" className="h-8 w-8" fill="none" aria-hidden="true">
          <path d="M5 27.5 14.5 14l5 6.5L26 10l13 17.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8 31c7-3.5 9.2 3 14.3-.5 4.7-3.2 8.7-1.7 13.7 1.5M12 35c5.2-2.2 8.2 2.5 13 .2 3.8-1.8 6.5-.9 9 0" stroke="#D48C6B" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </div>
      <div>
        <div className="text-[19px] font-semibold tracking-[-0.045em]">RoadWise</div>
        <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-[#8e9b98]">Local road sense</div>
      </div>
    </div>
  );
}
