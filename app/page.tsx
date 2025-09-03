import Link from "next/link";

export default function Home() {
  return (
    <div className="container py-12">
      <div className="card">
        <h1 className="text-4xl font-extrabold mb-3">Autodun — EV Charging Finder</h1>
        <p className="text-gray-700 mb-6">Quickly locate EV charging points across the UK using postcode search or your current location.</p>
        <Link href="/ev" className="btn bg-autodun-green text-white hover:opacity-90">Open EV Finder</Link>
      </div>
    </div>
  );
}
