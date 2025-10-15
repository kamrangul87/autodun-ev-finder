import React, { useEffect, useRef } from "react";

type Station = any;

type Props = {
  station: Station | null;
  isOpen?: boolean; // open when station is truthy
  onClose?: () => void; // only via ✕ button or Esc
};

const StationDrawer: React.FC<Props> = ({ station, onClose }) => {
  const drawerRef = useRef<HTMLDivElement>(null);

  // Focus when opened
  useEffect(() => {
    if (!station) return;
    const id = setTimeout(() => drawerRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [station]);

  // Close on Esc (explicit)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!station) return null;

  return (
    <div className="fixed z-[9999] pointer-events-none">
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Charging station details"
        tabIndex={-1}
        className={[
          // floating card position
          "pointer-events-auto fixed right-4 bottom-4",
          // size constraints
          "w-[min(420px,calc(100vw-1rem))]",
          "max-h-[min(80vh,calc(100vh-6rem))]",
          // style
          "rounded-xl border border-gray-200 bg-white shadow-xl overflow-auto",
          // desktop: sit under top nav (~70px) on the right
          "lg:top-[70px] lg:bottom-auto lg:right-4 lg:left-auto",
          "lg:w-[420px] lg:max-h-[calc(100vh-90px)]",
        ].join(" ")}
        style={{ boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-gray-200 bg-white px-4 py-3">
          <h2 className="text-base font-semibold truncate">{station?.name || "Station"}</h2>
          <button
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 hover:bg-gray-50"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body (simple fallback; your real fields still render) */}
        <div className="p-4 space-y-3">
          {station?.address && (
            <div>
              <div className="text-sm text-gray-500">Address</div>
              <div className="text-sm">{station.address}</div>
            </div>
          )}
          {Array.isArray(station?.connectors) && station.connectors.length > 0 && (
            <div>
              <div className="text-sm text-gray-500 mb-1">Connectors</div>
              <ul className="list-disc pl-5 text-sm">
                {station.connectors.map((c: any, idx: number) => (
                  <li key={idx}>{c?.type || String(c)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StationDrawer;
