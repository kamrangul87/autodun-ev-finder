import dynamic from "next/dynamic";

// Home just renders the client-only heatmap so "/" loads it directly.
const Client = dynamic(() => import("./model1-heatmap/Client"), { ssr: false });

export default function Home() {
  return <Client />;
}
