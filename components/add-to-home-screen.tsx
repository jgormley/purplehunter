"use client"

import { useState, useEffect } from "react"
import { Download, Share, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent
  }
}

export function AddToHomeScreen() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showButton, setShowButton] = useState(false)
  const [showIOSInstructions, setShowIOSInstructions] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    // Check if already installed (standalone mode)
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    setIsStandalone(standalone)

    if (standalone) return

    // Check if iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream
    setIsIOS(iOS)

    if (iOS) {
      // Show button for iOS after a short delay
      const timer = setTimeout(() => setShowButton(true), 2000)
      return () => clearTimeout(timer)
    }

    // Listen for the beforeinstallprompt event (Chrome, Edge, etc.)
    const handleBeforeInstall = (e: BeforeInstallPromptEvent) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowButton(true)
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstall)

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall)
    }
  }, [])

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSInstructions(true)
      return
    }

    if (!deferredPrompt) return

    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    
    if (outcome === "accepted") {
      setShowButton(false)
    }
    setDeferredPrompt(null)
  }

  const closeIOSInstructions = () => {
    setShowIOSInstructions(false)
  }

  // Don't render if already installed or not showing
  if (isStandalone || !showButton) return null

  return (
    <>
      {/* Floating Install Button */}
      <button
        onClick={handleInstallClick}
        className={cn(
          "fixed bottom-4 right-4 z-40",
          "h-11 px-4 rounded-full",
          "bg-purple-600 hover:bg-purple-500",
          "shadow-lg shadow-purple-900/30",
          "flex items-center gap-2",
          "transition-all duration-200",
          "active:scale-95"
        )}
        aria-label="Install app"
      >
        <Download className="w-5 h-5 text-white" />
        <span className="text-white font-medium text-sm">Install App</span>
      </button>

      {/* iOS Instructions Modal */}
      {showIOSInstructions && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm bg-[#1e1e1e] rounded-2xl p-5 space-y-4 animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Add to Home Screen</h3>
              <button 
                onClick={closeIOSInstructions}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <div className="space-y-3 text-sm text-gray-300">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-xs font-bold">1</span>
                </div>
                <p>
                  Tap the <Share className="w-4 h-4 inline-block mx-1 text-blue-400" /> Share button in Safari&apos;s toolbar
                </p>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-xs font-bold">2</span>
                </div>
                <p>
                  Scroll down and tap <strong className="text-white">&quot;Add to Home Screen&quot;</strong>
                </p>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-xs font-bold">3</span>
                </div>
                <p>
                  Tap <strong className="text-white">&quot;Add&quot;</strong> in the top right corner
                </p>
              </div>
            </div>

            <button
              onClick={closeIOSInstructions}
              className="w-full h-11 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  )
}
