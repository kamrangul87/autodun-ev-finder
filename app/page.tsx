'use client'
import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'

const ClientMap = dynamic(() => import('@/components/ClientMap'), { 
  ssr: false,
  loading: () => <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',fontSize:'18px'}}>Loading map...</div>
})

export default function Page() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh'}}>Loading...</div>
  return <ClientMap />
}
