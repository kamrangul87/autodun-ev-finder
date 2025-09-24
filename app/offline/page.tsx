export const viewport = {
  themeColor: '#0b1220',
};
// An offline fallback page.  When a user goes offline or visits a route
// that has not been cached by the service worker, Next.js (via
// next‑pwa) will serve this page.  Keeping the markup simple
// minimises bundle size and ensures a graceful fallback when
// connectivity is lost.

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold mb-4">You’re offline</h1>
      <p className="text-center text-gray-600 max-w-md">
        It looks like you’ve lost your internet connection.  Cached
        information may still be available, but live data such as
        station availability cannot be loaded until you reconnect.
      </p>
    </div>
  );
}