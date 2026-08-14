export default function DataAttribution({ includeImo = false }: { includeImo?: boolean }) {
  return (
    <footer className="surface-panel section-block px-4 py-3 text-[9px] leading-4 text-[#74817e]">
      <p>Based on information provided by the Icelandic Road and Coastal Administration (IRCA).</p>
      {includeImo && <p className="mt-1">Weather data/warnings: Icelandic Meteorological Office (IMO), CC BY 4.0.</p>}
      <p className="mt-1">Roadwise interprets third-party official data. Conditions can change rapidly; no endorsement is implied.</p>
    </footer>
  );
}
