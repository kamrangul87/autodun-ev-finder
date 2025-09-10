// pages/ev.tsx
import React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import type { Point } from "../components/HeatmapWithScaling";

const HeatmapWithScaling = dynamic(() => import("../components/HeatmapWithScaling"), { ssr: false });

// helpers to read/write query
const parseBool = (v: any, def=false)=> v===undefined?def:(v==='1'||v===1||v==='true');
const num = (v:any, d:number)=> { const n=Number(v); return Number.isFinite(n)?n:d; };
const str = (v:any, d:string)=> (typeof v==='string'&&v.length?v:d);

// simple country presets (center & zoom)
const COUNTRY_PRESETS: Record<string, {lat:number; lng:number; z:number; radius:number}> = {
  GB: { lat: 52.5, lng: -1.5, z: 7, radius: 400 },
  IE: { lat: 53.4, lng: -8.1, z: 7, radius: 350 },
  FR: { lat: 46.7, lng: 2.5,  z: 6, radius: 550 },
  DE: { lat: 51.2, lng: 10.5, z: 6, radius: 550 },
  NL: { lat: 52.3, lng: 5.3,  z: 7, radius: 300 },
  BE: { lat: 50.8, lng: 4.6,  z: 7, radius: 300 },
  ES: { lat: 40.3, lng: -3.7, z: 6, radius: 700 },
  IT: { lat: 42.9, lng: 12.5, z: 6, radius: 600 },
};

function radiusForZoom(z:number){
  const table = [
    {z:5, r:1200},{z:6, r:700},{z:7, r:400},{z:8, r:250},
    {z:9, r:150},{z:10, r:90},{z:11, r:45},{z:12, r:22},{z:13, r:12}
  ];
  let r = 400;
  for(const row of table){ if(z<=row.z){ r=row.r; break; } r=row.r; }
  return r;
}

export default function EVPage() {
  const router = useRouter();
  const q = router.query;

  // URL-backed states
  const [cc, setCC] = React.useState<string>((str(q.cc, "GB")).toUpperCase());
  const [halfReports, setHalfReports] = React.useState<number>(num(q.hr, 90));
  const [halfDown,   setHalfDown]   = React.useState<number>(num(q.hd, 60));
  const [ui, setUI] = React.useState<{scale: "robust"|"linear"|"log";
