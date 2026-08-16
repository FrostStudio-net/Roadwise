export default function RouteLoadingScene() {
  return (
    <div className="drive-loading-scene" aria-hidden="true">
      <svg className="drive-loading-terrain" viewBox="0 0 296 84" preserveAspectRatio="none" focusable="false">
        <g className="drive-loading-ridge drive-loading-ridge-distant">
          <TerrainTile variant="distant" />
          <g transform="translate(296 0)"><TerrainTile variant="distant" /></g>
        </g>
        <g className="drive-loading-ridge drive-loading-ridge-near">
          <TerrainTile variant="near" />
          <g transform="translate(296 0)"><TerrainTile variant="near" /></g>
        </g>
      </svg>

      <div className="drive-loading-car-anchor">
        <svg viewBox="0 0 220 90" role="presentation" focusable="false">
          <ellipse cx="111" cy="84" rx="87" ry="4" fill="rgba(0,0,0,.25)" />
          <g className="drive-loading-car-suspension">
            <path d="M18 63 20 51q1-7 9-9l29-6 12-16q5-7 15-8h42q14 0 24 11l16 15 27 5q9 2 11 10l2 10-9 6h-17c-2-13-10-20-22-20s-21 8-23 20H73c-2-13-10-20-22-20s-21 8-23 20H17Z" fill="#234d4d" stroke="#69a8a3" strokeOpacity=".58" strokeWidth="1.4" />
            <path d="M29 42 58 36l12-16q5-7 15-8h42q14 0 24 11l16 15" fill="none" stroke="#a9c9c5" strokeOpacity=".24" strokeWidth="1.2" />

            <path d="m72 20-10 17h43V18H85q-9 0-13 2Z" fill="#132424" stroke="#69a8a3" strokeOpacity=".28" />
            <path d="M112 18v19h46l-13-13q-8-6-18-6Z" fill="#152929" stroke="#69a8a3" strokeOpacity=".3" />
            <path d="M105 18v19" stroke="#0a1111" strokeOpacity=".75" strokeWidth="3" />
            <path d="M112 18v42M61 38l-4 23M159 38l7 23" fill="none" stroke="#a9c9c5" strokeOpacity=".2" strokeWidth="1" />
            <path d="M79 45h13M124 45h13" stroke="#b9d4d0" strokeOpacity=".45" strokeLinecap="round" strokeWidth="1.4" />
            <path d="m158 35 9-2 7 4-3 5-11-2Z" fill="#1c3c3c" stroke="#69a8a3" strokeOpacity=".52" />
            <path d="m192 45 9 3 2 5-13-1Z" fill="#e8c4b0" fillOpacity=".82" />
            <path d="m21 49 8-3 1 9-10 2Z" fill="#d48c6b" fillOpacity=".74" />
            <path d="M184 62h21M18 63h13" stroke="#091111" strokeOpacity=".7" strokeWidth="2" strokeLinecap="round" />
            <path d="M74 69c-2-13-10-20-22-20s-21 8-23 20M190 69c-2-13-10-20-22-20s-21 8-23 20" fill="none" stroke="#071010" strokeOpacity=".72" strokeWidth="2.5" />
            <path d="M77 58h65" stroke="#69a8a3" strokeOpacity=".17" strokeWidth="1" />

            <Wheel cx={52} />
            <Wheel cx={168} />
          </g>
        </svg>
      </div>

      <div className="drive-loading-road"><span className="drive-loading-road-line" /></div>
    </div>
  );
}

function TerrainTile({ variant }: { variant: "distant" | "near" }) {
  if (variant === "distant") {
    return <path d="M0 72 24 62 44 65 70 48 91 57 114 42 143 60 169 50 195 61 224 45 249 58 273 52 296 72V84H0Z" fill="#2d6b6b" fillOpacity=".11" stroke="#69a8a3" strokeOpacity=".12" strokeWidth="1" />;
  }
  return <path d="M0 78 29 68 55 71 82 61 109 72 137 58 164 69 191 63 219 73 248 60 274 70 296 78V84H0Z" fill="#142a2a" fillOpacity=".92" stroke="#69a8a3" strokeOpacity=".1" strokeWidth="1" />;
}

function Wheel({ cx }: { cx: number }) {
  return (
    <g>
      <circle cx={cx} cy="69" r="19" fill="#091111" stroke="#365c59" strokeWidth="1.5" />
      <circle cx={cx} cy="69" r="15.5" fill="none" stroke="#9ab7b3" strokeOpacity=".5" strokeWidth="1.4" strokeDasharray="3 5" className="drive-loading-tread" />
      <circle cx={cx} cy="69" r="10.5" fill="#1b3131" stroke="#69a8a3" strokeOpacity=".48" strokeWidth="1.2" />
      <path d={`M${cx - 7} 69h14M${cx} 62v14`} stroke="#9ab7b3" strokeOpacity=".22" strokeWidth="1" />
      <circle cx={cx} cy="69" r="3.3" fill="#69a8a3" fillOpacity=".62" />
    </g>
  );
}
