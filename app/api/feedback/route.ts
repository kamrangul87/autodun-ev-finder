import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, message } = body;

    // Log feedback (in production, save to database)
    console.log('Feedback received:', {
      email: email || 'anonymous',
      message,
      timestamp: new Date().toISOString(),
      ip: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Feedback error:', error);
    return NextResponse.json(
      { error: 'Failed to process feedback' },
      { status: 500 }
    );
  }
}
