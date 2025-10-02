import { NextResponse } from "next/server";

function score(reg: string) {
  const hash = Array.from(reg).reduce((a, c) => (a * 33 + c.charCodeAt(0)) % 997, 7);
  return Math.min(0.45 + (hash % 30) / 100, 0.96);
}

export async function POST(req: Request) {
  const { message } = await req.json().catch(() => ({}));
  const text = (message ?? "").toString().toLowerCase();

  if (!text) return NextResponse.json({ reply: "Say 'predict MOT AB12CDE' or 'nearest stations' (demo)." });

  if (text.startsWith("predict mot")) {
    const parts = text.trim().split(/\s+/);
    const reg = parts[parts.length - 1].toUpperCase();
    const prob = Math.round(score(reg) * 100);
    return NextResponse.json({ reply: `MOT pass probability for ${reg}: ${prob}% (demo)` });
  }

  if (text.includes("nearest") || text.includes("stations")) {
    return NextResponse.json({ reply: "Nearest stations: Camden, Holborn, Shoreditch (demo)." });
  }

  return NextResponse.json({ reply: "I can: predict MOT (e.g. 'predict MOT AB12CDE') or list nearest EV stations (demo)." });
}
