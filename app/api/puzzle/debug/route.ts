import { NextResponse } from "next/server"

// Temporary debug endpoint to inspect raw NYT API response
function getTodayET(): string {
  const now = new Date()
  const etOptions: Intl.DateTimeFormatOptions = { 
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }
  return new Intl.DateTimeFormat("en-CA", etOptions).format(now)
}

export async function GET() {
  const today = getTodayET()
  const url = `https://www.nytimes.com/svc/connections/v2/${today}.json`
  
  try {
    const response = await fetch(url)
    const rawData = await response.json()
    
    return NextResponse.json({
      fetchedUrl: url,
      date: today,
      rawResponse: rawData
    }, {
      headers: { 'Cache-Control': 'no-store' }
    })
  } catch (error) {
    return NextResponse.json({
      fetchedUrl: url,
      date: today,
      error: String(error)
    }, { status: 500 })
  }
}
