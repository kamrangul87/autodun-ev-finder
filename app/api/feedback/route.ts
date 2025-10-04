
// App Router API handler
export async function POST(request: Request) {
  const body = await request.json();
  const { stationId, vote, message } = body;
  if (!stationId || (vote && !['good', 'bad'].includes(vote))) {
    return Response.json({ error: 'Invalid input' }, { status: 400 });
  }
  // Accept and log feedback (no DB for MVP)
  return Response.json({ ok: true });
}
