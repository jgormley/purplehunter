import { NextResponse } from "next/server"

// NYT official API - uses date-based endpoint like Wordle
function getNYTApiUrl(date: string) {
  return `https://www.nytimes.com/svc/connections/v2/${date}.json`
}

// Fallback: Community-maintained archive on GitHub
const GITHUB_ARCHIVE = "https://raw.githubusercontent.com/Eyefyre/NYT-Connections-Answers/main/connections.json"

interface NYTCard {
  content?: string
  image_url?: string
  image_alt_text?: string
  position: number
}

interface NYTCategory {
  title: string
  cards: NYTCard[]
}

interface NYTPuzzleResponse {
  id: number
  print_date: string
  categories: NYTCategory[]
}

interface GitHubPuzzle {
  id: number
  date: string
  answers: {
    level: number
    group: string
    members: string[]
  }[]
}

export interface PuzzleData {
  id: number
  date: string
  words: string[]
  imageMap?: Record<string, string> // maps word (alt text) to image URL
}

// Get today's date in ET timezone (where NYT publishes)
function getTodayET(): string {
  const now = new Date()
  const etOptions: Intl.DateTimeFormatOptions = { 
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }
  const etParts = new Intl.DateTimeFormat("en-CA", etOptions).format(now)
  return etParts // Returns YYYY-MM-DD format
}

// Calculate the actual puzzle number based on days since launch
// Connections launched on June 12, 2023 (puzzle #1)
function calculatePuzzleNumber(dateStr: string): number {
  const launchDate = new Date("2023-06-12")
  const puzzleDate = new Date(dateStr)
  const diffTime = puzzleDate.getTime() - launchDate.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  return diffDays + 1 // +1 because launch day was puzzle #1
}

// Try NYT official API first (has position data for correct order)
async function fetchFromNYT(date: string): Promise<PuzzleData | null> {
  try {
    const response = await fetch(getNYTApiUrl(date), {
      next: { revalidate: 3600 },
    })

    if (!response.ok) {
      return null
    }

    const data: NYTPuzzleResponse = await response.json()

    // Collect all cards and sort by position for correct grid order
    const allCards: NYTCard[] = []
    for (const category of data.categories) {
      allCards.push(...category.cards)
    }
    
    allCards.sort((a, b) => a.position - b.position)

    // Check if this is a picture puzzle (cards have image_url instead of content)
    const isPicturePuzzle = allCards.some(card => card.image_url)

    const words = allCards.map((card) => {
      if (isPicturePuzzle && card.image_alt_text) {
        return card.image_alt_text.toUpperCase()
      }
      return (card.content || card.image_alt_text || "").toUpperCase()
    })

    // Build image map for picture puzzles
    let imageMap: Record<string, string> | undefined
    if (isPicturePuzzle) {
      imageMap = {}
      for (const card of allCards) {
        if (card.image_url && card.image_alt_text) {
          imageMap[card.image_alt_text.toUpperCase()] = card.image_url
        }
      }
    }

    return {
      id: calculatePuzzleNumber(data.print_date),
      date: data.print_date,
      words,
      imageMap,
    }
  } catch {
    return null
  }
}

// Fallback to GitHub archive (no position data, uses interleaved order)
async function fetchFromGitHub(today: string): Promise<PuzzleData | null> {
  try {
    const response = await fetch(GITHUB_ARCHIVE, {
      next: { revalidate: 3600 },
    })

    if (!response.ok) {
      return null
    }

    const puzzles: GitHubPuzzle[] = await response.json()
    
    let puzzle = puzzles.find(p => p.date === today)
    
    if (!puzzle && puzzles.length > 0) {
      const sorted = [...puzzles].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      puzzle = sorted[0]
    }

    if (!puzzle) {
      return null
    }

    // Without position data, interleave words from categories
    const sortedAnswers = [...puzzle.answers].sort((a, b) => a.level - b.level)
    const words: string[] = []
    
    for (let i = 0; i < 4; i++) {
      for (const answer of sortedAnswers) {
        if (answer.members[i]) {
          words.push(answer.members[i].toUpperCase())
        }
      }
    }

    return {
      id: calculatePuzzleNumber(puzzle.date),
      date: puzzle.date,
      words,
    }
  } catch {
    return null
  }
}

export async function GET() {
  const today = getTodayET()
  
  // Try NYT API first for correct position order
  let puzzleData = await fetchFromNYT(today)
  
  // Fallback to GitHub archive
  if (!puzzleData) {
    puzzleData = await fetchFromGitHub(today)
  }

  if (puzzleData) {
    return NextResponse.json(puzzleData)
  }

  return NextResponse.json(
    {
      error: "Failed to fetch today's puzzle",
      message: "Please enter words manually using the Edit button",
    },
    { status: 500 }
  )
}
