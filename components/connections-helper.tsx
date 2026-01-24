"use client"

import React from "react"
import { useState, useCallback, useEffect } from "react"
import Script from "next/script"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Shuffle, RotateCcw, RefreshCw, Calendar, Info } from "lucide-react"
import { cn } from "@/lib/utils" // Import the useLongPress hook

declare global {
  interface Window {
    kofiWidgetOverlay?: {
      draw: (username: string, options: Record<string, unknown>) => void
    }
  }
}

const CATEGORY_COLORS = {
  yellow: { bg: "#f9df6d", text: "#1a1a1a", label: "Yellow (Easiest)", oneAwayDot: "#b8860b", oneAwayText: "#8b6914", oneAwayRing: "#d4a017" },
  green: { bg: "#a0c35a", text: "#1a1a1a", label: "Green (Medium)", oneAwayDot: "#2d5a27", oneAwayText: "#2d5a27", oneAwayRing: "#3d7a37" },
  blue: { bg: "#b0c4ef", text: "#1a1a1a", label: "Blue (Hard)", oneAwayDot: "#1e4d8c", oneAwayText: "#1e4d8c", oneAwayRing: "#2e6dbc" },
  purple: { bg: "#ba81c5", text: "#1a1a1a", label: "Purple (Tricky)", oneAwayDot: "#6b2d7b", oneAwayText: "#6b2d7b", oneAwayRing: "#8b4d9b" },
} as const

type CategoryColor = keyof typeof CATEGORY_COLORS

const DEFAULT_WORDS = [
  "QUOTE", "PECK", "PRICE", "TOTAL",
  "DAMAGE", "TITLE", "BILL", "GRANT",
  "AUTHOR", "WINGS", "COOPER", "BREAK",
  "WEBBING", "WRECK", "SYNOPSIS", "FEATHERS"
]

interface PuzzleData {
  id: number
  date: string
  words: string[]
}

function ColorButton({ 
  color, 
  selectedColor, 
  setSelectedColor, 
  count, 
  isOneAway,
  canLongPress,
  onLongPress 
}: { 
  color: CategoryColor
  selectedColor: CategoryColor
  setSelectedColor: (color: CategoryColor) => void
  count: number
  isOneAway: boolean
  canLongPress: boolean
  onLongPress: () => void
}) {
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null)
  const [didLongPress, setDidLongPress] = useState(false)
  const isComplete = count === 4
  const colorConfig = CATEGORY_COLORS[color]

  const handleTouchStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault()
    setDidLongPress(false)
    const timer = setTimeout(() => {
      setDidLongPress(true)
      // Only trigger if canLongPress (4 tiles selected) or if already one-away (to toggle off)
      if (canLongPress || isOneAway) {
        // Haptic feedback
        if (navigator.vibrate) {
          navigator.vibrate(50)
        }
        onLongPress()
      }
    }, 500)
    setLongPressTimer(timer)
  }, [onLongPress, canLongPress, isOneAway])

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      setLongPressTimer(null)
    }
    if (!didLongPress) {
      setSelectedColor(color)
    }
  }, [longPressTimer, didLongPress, setSelectedColor, color])

  const handleTouchCancel = useCallback(() => {
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      setLongPressTimer(null)
    }
  }, [longPressTimer])

  return (
    <button
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      onMouseDown={handleTouchStart}
      onMouseUp={handleTouchEnd}
      onMouseLeave={handleTouchCancel}
      onContextMenu={(e) => e.preventDefault()}
      className={cn(
        "w-14 h-14 rounded-lg transition-all flex flex-col items-center justify-center relative select-none touch-none",
        selectedColor === color && !isOneAway && !isComplete && "ring-2 ring-white ring-offset-2 ring-offset-[#121212]",
        isComplete && "ring-2 ring-green-400 ring-offset-2 ring-offset-[#121212]"
      )}
      style={{ 
        backgroundColor: colorConfig.bg,
        WebkitUserSelect: "none",
        userSelect: "none",
        WebkitTouchCallout: "none",
        boxShadow: isOneAway && !isComplete ? `0 0 0 2px #121212, 0 0 0 4px ${colorConfig.oneAwayRing}` : undefined,
      }}
      aria-label={`Select ${colorConfig.label}${isOneAway ? " (one away)" : ""}`}
    >
      {isOneAway && !isComplete && (
        <span 
          className="absolute top-1 right-1 w-2 h-2 rounded-full pointer-events-none" 
          style={{ backgroundColor: colorConfig.oneAwayDot }}
        />
      )}
      <span 
        className={cn(
          "text-sm font-bold pointer-events-none",
          isComplete && "text-green-800"
        )}
        style={{ color: isComplete ? undefined : colorConfig.text }}
      >
        {count}/4
      </span>
      {isOneAway && (
        <span 
          className="text-[10px] font-semibold pointer-events-none"
          style={{ color: colorConfig.oneAwayText }}
        >
          1 away
        </span>
      )}
    </button>
  )
}

export function ConnectionsHelper() {
  const [words, setWords] = useState<string[]>(DEFAULT_WORDS)
  const [wordColors, setWordColors] = useState<Record<string, CategoryColor | null>>({})
  const [selectedColor, setSelectedColor] = useState<CategoryColor>("yellow")
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(DEFAULT_WORDS.join("\n"))
  const [isLoading, setIsLoading] = useState(false)
  const [puzzleDate, setPuzzleDate] = useState<string | null>(null)
  const [puzzleId, setPuzzleId] = useState<number | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [showInfo, setShowInfo] = useState(false)
  // Track one-away words with their original color for unique indicators
  const [oneAwayWords, setOneAwayWords] = useState<Map<string, CategoryColor>>(new Map())

  const fetchTodaysPuzzle = useCallback(async () => {
    setIsLoading(true)
    setFetchError(null)
    
    try {
      const response = await fetch("/api/puzzle")
      
      if (!response.ok) {
        throw new Error("Failed to fetch puzzle")
      }
      
      const data: PuzzleData = await response.json()
      
      if (data.words && data.words.length === 16) {
        setWords(data.words)
        setWordColors({})
        setPuzzleDate(data.date)
        setPuzzleId(data.id)
        setEditText(data.words.join("\n"))
      } else {
        throw new Error("Invalid puzzle data")
      }
    } catch (error) {
      console.error("Error fetching puzzle:", error)
      setFetchError("Could not fetch today's puzzle. Use Edit to enter words manually.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Auto-fetch today's puzzle on mount
  useEffect(() => {
    fetchTodaysPuzzle()
  }, [fetchTodaysPuzzle])

  const handleWordClick = useCallback((word: string) => {
    setWordColors(prev => {
      const currentColor = prev[word]
      if (currentColor === selectedColor) {
        const { [word]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [word]: selectedColor }
    })
  }, [selectedColor])

  const shuffleWords = useCallback(() => {
    setWords(prev => {
      const shuffled = [...prev]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      return shuffled
    })
  }, [])

  const clearAll = useCallback(() => {
    setWordColors({})
  }, [])

  const handleSaveWords = useCallback(() => {
    const newWords = editText
      .split(/[\n,]+/)
      .map(w => w.trim().toUpperCase())
      .filter(w => w.length > 0)
      .slice(0, 16)
    
    while (newWords.length < 16) {
      newWords.push(`WORD${newWords.length + 1}`)
    }
    
    setWords(newWords)
    setWordColors({})
    setPuzzleDate(null)
    setPuzzleId(null)
    setIsEditing(false)
  }, [editText])

  const getColorCount = (color: CategoryColor) => {
    return Object.values(wordColors).filter(c => c === color).length
  }

  const toggleOneAway = useCallback((color: CategoryColor) => {
    // Get words currently assigned to this color
    const wordsWithColor = Object.entries(wordColors)
      .filter(([_, c]) => c === color)
      .map(([word]) => word)
    
    // Check if this color already has one-away words
    const existingOneAwayForColor = Array.from(oneAwayWords.entries())
      .filter(([_, c]) => c === color)
      .map(([word]) => word)
    
    // If there are existing one-away words for this color, remove them
    if (existingOneAwayForColor.length > 0) {
      setOneAwayWords(prev => {
        const newMap = new Map(prev)
        existingOneAwayForColor.forEach(word => newMap.delete(word))
        return newMap
      })
      return
    }
    
    // Only allow adding one-away if exactly 4 tiles are selected for this color
    if (wordsWithColor.length !== 4) {
      return
    }
    
    setOneAwayWords(prev => {
      const newMap = new Map(prev)
      // Add these words to one-away with their color
      wordsWithColor.forEach(word => newMap.set(word, color))
      return newMap
    })
  }, [wordColors, oneAwayWords])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00")
    return date.toLocaleDateString("en-US", { 
      weekday: "short", 
      month: "short", 
      day: "numeric" 
    })
  }

  

  if (isEditing) {
    return (
      <div className="min-h-screen bg-[#121212] text-white p-4 flex flex-col">
        <h1 className="text-xl font-bold text-center mb-4">Edit Words</h1>
        <p className="text-sm text-gray-400 text-center mb-4">
          Enter 16 words, one per line or comma-separated
        </p>
        <textarea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          className="flex-1 min-h-[300px] bg-[#2a2a2a] text-white p-4 rounded-lg text-base font-mono resize-none focus:outline-none focus:ring-2 focus:ring-white/30"
          placeholder="Enter words here..."
          autoFocus
        />
        <div className="flex gap-3 mt-4">
          <Button
            onClick={() => setIsEditing(false)}
            variant="outline"
            className="flex-1 h-12 border-white/30 text-white hover:bg-white/10 bg-transparent"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveWords}
            className="flex-1 h-12 bg-white text-black hover:bg-gray-200"
          >
            Save Words
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#121212] text-white p-4 flex flex-col items-center">
      <div className="w-full max-w-md flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setShowInfo(true)}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
          aria-label="How to use"
        >
          <Info className="w-5 h-5 text-gray-400" />
        </button>
        
        <div className="text-center flex-1">
          <h1 className="text-xl font-bold mb-0.5">Purple Hunter</h1>
          {puzzleDate && puzzleId ? (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
              <Calendar className="w-3.5 h-3.5" />
              <span>{formatDate(puzzleDate)} • Puzzle #{puzzleId}</span>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Create four groups of four!</p>
          )}
        </div>
        
        <button
          onClick={fetchTodaysPuzzle}
          disabled={isLoading}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors disabled:opacity-50"
          aria-label="Refresh today's puzzle"
        >
          <RefreshCw className={cn("w-5 h-5 text-gray-400", isLoading && "animate-spin")} />
        </button>
      </div>

      {/* Error Message */}
      {fetchError && (
        <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3 mb-3 text-center">
          <p className="text-sm text-red-300">{fetchError}</p>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center gap-2 mb-3 text-gray-400">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading today&apos;s puzzle...</span>
        </div>
      )}

      {/* Color Selector with Counts */}
      <div className="flex justify-center gap-2 mb-3">
        <ColorButton 
          color="yellow" 
          selectedColor={selectedColor} 
          setSelectedColor={setSelectedColor}
          count={getColorCount("yellow")}
          isOneAway={Array.from(oneAwayWords.values()).includes("yellow")}
          canLongPress={getColorCount("yellow") === 4}
          onLongPress={() => toggleOneAway("yellow")}
        />
        <ColorButton 
          color="green" 
          selectedColor={selectedColor} 
          setSelectedColor={setSelectedColor}
          count={getColorCount("green")}
          isOneAway={Array.from(oneAwayWords.values()).includes("green")}
          canLongPress={getColorCount("green") === 4}
          onLongPress={() => toggleOneAway("green")}
        />
        <ColorButton 
          color="blue" 
          selectedColor={selectedColor} 
          setSelectedColor={setSelectedColor}
          count={getColorCount("blue")}
          isOneAway={Array.from(oneAwayWords.values()).includes("blue")}
          canLongPress={getColorCount("blue") === 4}
          onLongPress={() => toggleOneAway("blue")}
        />
        <ColorButton 
          color="purple" 
          selectedColor={selectedColor} 
          setSelectedColor={setSelectedColor}
          count={getColorCount("purple")}
          isOneAway={Array.from(oneAwayWords.values()).includes("purple")}
          canLongPress={getColorCount("purple") === 4}
          onLongPress={() => toggleOneAway("purple")}
        />
      </div>

      {/* Word Grid */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        {words.map((word, index) => {
          const color = wordColors[word]
          const bgColor = color ? CATEGORY_COLORS[color].bg : "#d4d4c8"
          const textColor = color ? CATEGORY_COLORS[color].text : "#1a1a1a"
          const oneAwayColor = oneAwayWords.get(word)
          const oneAwayConfig = oneAwayColor ? CATEGORY_COLORS[oneAwayColor] : null
          
          return (
            <button
              key={`${word}-${index}`}
              onClick={() => handleWordClick(word)}
              className="aspect-square rounded-lg font-bold text-xs sm:text-sm flex items-center justify-center p-1 transition-all active:scale-95 select-none relative"
              style={{ 
                backgroundColor: bgColor, 
                color: textColor,
                minHeight: "70px",
                boxShadow: oneAwayConfig ? `inset 0 0 0 2px ${oneAwayConfig.oneAwayRing}` : undefined,
              }}
            >
              <span className="text-center break-words leading-tight">{word}</span>
              {oneAwayConfig && (
                <span 
                  className="absolute top-1 right-1 w-2 h-2 rounded-full" 
                  style={{ backgroundColor: oneAwayConfig.oneAwayDot }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button
          onClick={shuffleWords}
          variant="outline"
          className="flex-1 h-12 border-white/30 text-white hover:bg-white/10 bg-transparent"
        >
          <Shuffle className="w-4 h-4 mr-2" />
          Shuffle
        </Button>
        <Button
          onClick={clearAll}
          variant="outline"
          className="flex-1 h-12 border-white/30 text-white hover:bg-white/10 bg-transparent"
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Clear Colors
        </Button>
      </div>

      {/* Info Bottom Sheet */}
      <Sheet open={showInfo} onOpenChange={setShowInfo}>
        <SheetContent side="bottom" className="bg-[#1e1e1e] border-gray-700 rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className="text-white">Welcome, Hunter</SheetTitle>
            <SheetDescription asChild>
              <div className="text-gray-300 space-y-4">
                <p className="text-base">
                  The purple category is the trickiest in Connections. This app helps you hunt it down through process of elimination.
                </p>
                <div className="space-y-2 text-sm">
                  <p><span className="text-yellow-400">Yellow</span> is usually straightforward.</p>
                  <p><span className="text-green-400">Green</span> and <span className="text-blue-400">Blue</span> require more thought.</p>
                  <p><span className="text-purple-400">Purple</span> is the sneaky one - puns, wordplay, misdirection.</p>
                </div>
                <p className="text-sm text-gray-400 border-t border-gray-700 pt-3">
                  Tap colors to select, tap words to mark, and shuffle to spot new patterns. <span className="text-orange-400">Long-press a color</span> to mark it as "one away" - the indicator stays on those tiles to help you remember. Happy hunting!
                </p>
              </div>
            </SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>

      {/* Ko-fi Widget Styles */}
      <style jsx global>{`
        iframe[id^="kofi-wo-container"] {
          left: 50% !important;
          right: auto !important;
          transform: translateX(-50%) scale(0.85) !important;
          transform-origin: bottom center !important;
          opacity: ${showInfo ? 0 : 1} !important;
          pointer-events: ${showInfo ? "none" : "auto"} !important;
          transition: opacity 0.2s ease !important;
        }
      `}</style>

      {/* Ko-fi Floating Button */}
      <Script 
        id="kofi-widget"
        src="https://storage.ko-fi.com/cdn/scripts/overlay-widget.js"
        strategy="afterInteractive"
        onLoad={() => {
          if (window.kofiWidgetOverlay) {
            window.kofiWidgetOverlay.draw("dudenhaufer", {
              "type": "floating-chat",
              "floating-chat.donateButton.text": "Support",
              "floating-chat.donateButton.background-color": "#794bc4",
              "floating-chat.donateButton.text-color": "#fff"
            })
          }
        }}
      />
      </div>
    </div>
  )
}
