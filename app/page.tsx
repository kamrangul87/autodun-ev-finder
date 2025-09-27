export const dynamic = 'force-dynamic';   // disable prerender/SSG on root
export const viewport = { themeColor: '#0b1220' };

import dynamicImport from "next/dynamic";

const Model1HeatmapPage = dynamicImport(() => import("./model1-heatmap/page"), { ssr: false });

export default function HomePage() {
  return <Model1HeatmapPage />;
}
