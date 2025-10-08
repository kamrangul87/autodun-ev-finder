import { NextRequest, NextResponse } from 'next/server'
import { feedbackSchema } from '@/lib/validation'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validation = feedbackSchema.safeParse(body)
    
    if (!validation.success) {
      return NextResponse.json({ ok: true })
    }
    
    const { stationId, vote } = validation.data
    console.log('Feedback:', { stationId, vote, timestamp: new Date().toISOString() })
    
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ ok: true })
  }
}
