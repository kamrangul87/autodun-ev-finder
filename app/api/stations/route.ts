import { NextRequest, NextResponse } from 'next/server';

const stations = [
  // London
  { id: 1, name: "ChargePoint London", lat: 51.5074, lng: -0.1278, address: "Oxford St, London", type: "Fast", power: "50kW" },
  { id: 2, name: "Tesla Supercharger", lat: 51.5155, lng: -0.0922, address: "City Road, London", type: "Rapid", power: "150kW" },
  
  // Birmingham
  { id: 3, name: "BP Pulse Birmingham", lat: 52.4862, lng: -1.8904, address: "High St, Birmingham", type: "Fast", power: "50kW" },
  
  // Manchester
  { id: 4, name: "Shell Recharge Manchester", lat: 53.4808, lng: -2.2426, address: "Market St, Manchester", type: "Rapid", power: "100kW" },
  
  // Leeds
  { id: 5, name: "Ionity Leeds", lat: 53.8008, lng: -1.5491, address: "Wellington St, Leeds", type: "Ultra-Rapid", power: "350kW" },
  
  // Liverpool
  { id: 6, name: "Pod Point Liverpool", lat: 53.4084, lng: -2.9916, address: "Lime St, Liverpool", type: "Fast", power: "50kW" },
  
  // Bristol
  { id: 7, name: "Gridserve Bristol", lat: 51.4545, lng: -2.5879, address: "Broad St, Bristol", type: "Rapid", power: "150kW" },
  
  // Edinburgh
  { id: 8, name: "Osprey Edinburgh", lat: 55.9533, lng: -3.1883, address: "Princes St, Edinburgh", type: "Rapid", power: "120kW" },
  
  // Glasgow
  { id: 9, name: "InstaVolt Glasgow", lat: 55.8642, lng: -4.2518, address: "Buchanan St, Glasgow", type: "Rapid", power: "125kW" },
  
  // Cardiff
  { id: 10, name: "Ecotricity Cardiff", lat: 51.4816, lng: -3.1791, address: "Queen St, Cardiff", type: "Fast", power: "50kW" },
  
  // Newcastle
  { id: 11, name: "ChargePlace Newcastle", lat: 54.9783, lng: -1.6178, address: "Northumberland St, Newcastle", type: "Fast", power: "50kW" },
  
  // Sheffield
  { id: 12, name: "GeniePoint Sheffield", lat: 53.3811, lng: -1.4701, address: "Fargate, Sheffield", type: "Rapid", power: "100kW" },
  
  // Nottingham
  { id: 13, name: "Mer Nottingham", lat: 52.9548, lng: -1.1581, address: "Market Square, Nottingham", type: "Fast", power: "50kW" },
  
  // Oxford
  { id: 14, name: "Allego Oxford", lat: 51.7520, lng: -1.2577, address: "High St, Oxford", type: "Rapid", power: "150kW" },
  
  // Cambridge
  { id: 15, name: "Fastned Cambridge", lat: 52.2053, lng: 0.1218, address: "Market Hill, Cambridge", type: "Rapid", power: "175kW" },
];

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({ stations });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch stations' }, { status: 500 });
  }
}
