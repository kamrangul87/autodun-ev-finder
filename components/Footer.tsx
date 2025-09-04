'use client';
// components/Footer.tsx
export function Footer() {
  return (
    <footer className="border-t mt-10">
      <div className="container py-8 text-xs text-gray-500 flex flex-col md:flex-row items-center justify-between gap-2">
        <p>© {new Date().getFullYear()} Autodun — EV Finder MVP</p>

        <p>
          Charging location data ©{' '}
          <a
            href="https://openchargemap.org"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Open Charge Map
          </a>{' '}
          (CC BY 4.0). Map ©{' '}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            OpenStreetMap
          </a>{' '}
          contributors.
        </p>
      </div>
    </footer>
  );
}

