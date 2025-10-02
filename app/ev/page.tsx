import dynamic from "next/dynamic";

const Client = dynamic(() => import("../model1-heatmap/Client"), { ssr: false });

export const metadata = {
  title: "EV Finder",
  description: "Autodun EV Charging Finder",
};

export default function Page() {
  return <Client />;
}
