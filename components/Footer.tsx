export function Footer() {
  return (
    <footer className="border-t mt-10">
      <div className="container py-8 text-sm text-gray-600 flex flex-col md:flex-row gap-2 md:items-center justify-between">
        <p>© {new Date().getFullYear()} Autodun — EV Finder MVP</p>
        <p>Made for UK drivers</p>
      </div>
    </footer>
  );
}
