// utils/debug.ts
export function debugLog(...args: unknown[]) {
  if (process.env.NODE_ENV !== "production") {
    // Only print in dev / preview, never in production
    // eslint-disable-next-line no-console
    console.log(...args);
  }
}
