export const dynamic = 'force-dynamic';
export const revalidate = false;

import nextDynamic from 'next/dynamic';

// Render the client-only map without SSR to avoid "window is not defined"
const Client = nextDynamic(() => import('./Client'), { ssr: false });

export default function Page() {
  return <Client />;
}
