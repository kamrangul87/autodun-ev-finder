"use client";

// Borough gap index page for the app router.  This wrapper imports
// the existing implementation from the pages directory and renders
// it as a client component so that React hooks execute on the client.

import BoroughGapPage from '../../pages/borough-gap';

export default function AppBoroughGapPage() {
  return <BoroughGapPage />;
}