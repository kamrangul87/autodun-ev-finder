import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
const FILE = '/tmp/feedback.json';
type Item = { stationId: string|number; rating: number; comment?: string|null; ts: number };
const read=()=>{ try{ return JSON.parse(fs.readFileSync(FILE,'utf8')); }catch{ return []; } };
const write=(arr:Item[])=>{ try{ fs.writeFileSync(FILE, JSON.stringify(arr,null,2),'utf8'); }catch{} };
export async function GET(){ return NextResponse.json({ items: read().slice(-50) }); }
export async function POST(req: NextRequest){
  const b = await req.json().catch(()=>({}));
  if (b.stationId===undefined || b.rating===undefined) return NextResponse.json({error:'stationId and rating required'},{status:400});
  const arr = read(); arr.push({ stationId:b.stationId, rating:Number(b.rating)||0, comment:b.comment??null, ts:Date.now() }); write(arr);
  return NextResponse.json({success:true});
}
