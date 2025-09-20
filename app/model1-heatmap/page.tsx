export const dynamic = 'force-dynamic';
export const revalidate = false;

import dynamic from 'next/dynamic';

// Render the client-only map without SSR to avoid "window is not defined"
const Client = dynamic(() => import('./Client'), { ssr: false });

export default function Page() {
  return <Client />;
}
