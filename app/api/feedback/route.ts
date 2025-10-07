export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    // TODO: write to your store/webhook; for MVP just log
    console.log('feedback', body);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
}
