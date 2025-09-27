export const dynamic = 'force-dynamic';   // don't prerender/SSG the root either
export const viewport = { themeColor: '#0b1220' };

import dynamic from "next/dynamic";
const Model1HeatmapPage = dynamic(() => import("./model1-heatmap/page"), { ssr: false });

export default function HomePage() {
  return <Model1HeatmapPage />;
}
