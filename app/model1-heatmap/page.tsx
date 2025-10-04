// app/model1-heatmap/page.tsx
export const dynamic = 'force-dynamic'; // ensure this route is always dynamic on Vercel

import Client from './Client';

export default function Page() {
  return <Client />;
}
