import Link from "next/link";

export default function Custom404() {
  return (
    <main style={{ padding: 24 }}>
      <h1>404 - Page Not Found</h1>
      <p>The page you are looking for does not exist.</p>
      <p>
        <Link href="/">Go back home</Link>
      </p>
    </main>
  );
}
