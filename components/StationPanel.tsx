'use client';

type Station = {
  id: string | number | null;
  name: string | null;
  addr: string | null;
  postcode: string | null;
  lat: number;
  lon: number;
  connectors: number;
  reports: number;
  downtime: number;
  source: string;
};

export default function StationPanel({
  station,
  onClose,
}: {
  station: Station | null;
  onClose: () => void;
}) {
  if (!station) return null;

  const fields: Array<[string, React.ReactNode]> = [
    ['Name', station.name || '—'],
    ['Address', station.addr || '—'],
    ['Postcode', station.postcode || '—'],
    ['Source', station.source || '—'],
    ['Connectors', Number.isFinite(station.connectors) ? String(station.connectors) : '—'],
    ['Reports', Number.isFinite(station.reports) ? String(station.reports) : '—'],
    ['Downtime (mins)', Number.isFinite(station.downtime) ? String(station.downtime) : '—'],
    ['Coordinates', `${station.lat.toFixed(6)}, ${station.lon.toFixed(6)}`],
  ];

  return (
    <div className="absolute right-3 top-16 z-[1100] w-[320px] max-w-[85vw] rounded-xl bg-white/95 shadow-xl border border-black/5">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="text-sm font-semibold">Station details</div>
        <button
          onClick={onClose}
          className="rounded px-2 py-1 text-xs bg-neutral-100 hover:bg-neutral-200"
        >
          Close
        </button>
      </div>

      <div className="p-4 space-y-3 text-sm">
        {fields.map(([label, val]) => (
          <div key={label} className="flex gap-2">
            <div className="w-32 shrink-0 text-neutral-500">{label}</div>
            <div className="font-medium break-words">{val}</div>
          </div>
        ))}

        <div className="pt-2 flex gap-2">
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${station.lat},${station.lon}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded bg-blue-600 text-white px-3 py-1 text-xs hover:bg-blue-700"
          >
            Open in Google Maps
          </a>
          {station.postcode && (
            <a
              href={`https://www.google.com/maps/search/${encodeURIComponent(station.postcode)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded bg-neutral-800 text-white px-3 py-1 text-xs hover:bg-neutral-900"
            >
              Route to postcode
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
