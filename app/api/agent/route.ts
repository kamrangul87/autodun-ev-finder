// app/api/agent/route.ts
import OpenAI from "openai";
import { NextResponse } from "next/server";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const { messages = [] } = await req.json();
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: "You are Smart Auto Assistant for Autodun." },
        ...messages,
      ],
    });
    const content = completion.choices?.[0]?.message?.content ?? "No reply.";
    return NextResponse.json({ content });
  } catch (e) {
    return NextResponse.json({ content: "Agent error." }, { status: 200 });
  }
}
