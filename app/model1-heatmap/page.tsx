import dynamic from "next/dynamic";

export const metadata = {
  title: "Model 1 Heatmap — Autodun",
  description:
    "EV charging heatmap using Model-1 scoring with filters, markers and feedback.",
};

const Client = dynamic(() => import("./Client"), {
  ssr: false,
  loading: () => (
    <main style={{ padding: "1rem" }}>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: 8 }}>
        Model 1 — EV Heatmap
      </h1>
      <p>Loading map…</p>
    </main>
  ),
});

export default function Page() {
  return <Client />;
}
