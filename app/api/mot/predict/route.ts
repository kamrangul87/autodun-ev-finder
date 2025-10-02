import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { reg } = await req.json().catch(() => ({}));
  if (!reg || typeof reg !== "string") {
    return NextResponse.json({ error: "reg is required" }, { status: 400 });
  }
  // deterministic demo score
  const hash = Array.from(reg).reduce((a, c) => (a * 33 + c.charCodeAt(0)) % 997, 7);
  const passProbability = Math.min(0.45 + (hash % 30) / 100, 0.96);
  const topSignals = [
    "Age-adjusted failure rate",
    "Mileage trend vs segment",
    "Fault categories in last test",
    "Manufacturer reliability bucket",
  ];
  return NextResponse.json({ reg, passProbability, topSignals });
}
