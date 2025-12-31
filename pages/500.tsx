import Link from "next/link";

export default function Custom500() {
  return (
    <main style={{ padding: 24 }}>
      <h1>500 - Server Error</h1>
      <p>Something went wrong.</p>
      <p>
        <Link href="/">Go back home</Link>
      </p>
    </main>
  );
}
