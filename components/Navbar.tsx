import Image from "next/image";
import Link from "next/link";

export function Navbar() {
  return (
    <header className="border-b bg-white/80 backdrop-blur">
      <div className="container flex items-center justify-between py-4">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/logo.svg" alt="Autodun" width={32} height={32} priority className="h-8 w-8" />
          <span className="text-xl font-extrabold">Autodun</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm font-semibold">
          <Link href="/ev" className="hover:text-autodun-green">EV Finder</Link>
          <a href="mailto:info@autodun.com" className="px-4 py-2 rounded-2xl bg-autodun-green text-white shadow-soft">Contact</a>
        </nav>
      </div>
    </header>
  );
}
