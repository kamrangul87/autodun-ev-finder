// components/ui/TopBar.tsx
'use client';
export default function TopBar({
  heatOn, setHeatOn, markersOn, setMarkersOn, onFeedbackClick,
}: {
  heatOn: boolean; setHeatOn: (v:boolean)=>void;
  markersOn: boolean; setMarkersOn: (v:boolean)=>void;
  onFeedbackClick: ()=>void;
}) {
  return (
    <div className="w-full flex items-center justify-between gap-3 px-3 py-2 bg-white/90 backdrop-blur border-b">
      <div className="flex items-center gap-4">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={heatOn} onChange={e=>setHeatOn(e.target.checked)} />
          <span>Heatmap</span>
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={markersOn} onChange={e=>setMarkersOn(e.target.checked)} />
          <span>Markers</span>
        </label>
      </div>
      <button
        onClick={onFeedbackClick}
        className="px-4 py-1.5 rounded-lg bg-amber-500 text-white font-medium shadow"
      >
        Feedback
      </button>
    </div>
  );
}
