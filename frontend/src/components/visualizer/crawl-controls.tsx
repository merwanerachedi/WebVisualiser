"use client"

import { Play, Pause, RotateCcw, Settings, Loader2 } from "lucide-react"

interface CrawlControlsProps {
  url: string
  setUrl: (url: string) => void
  isCrawling: boolean
  isConnected: boolean
  isStopping: boolean
  isAnalyzing: boolean
  onStartCrawl: () => void
  onStopCrawl: () => void
  onReset: () => void
  showSettings: boolean
  setShowSettings: (show: boolean) => void
}

export function CrawlControls({
  url,
  setUrl,
  isCrawling,
  isConnected,
  isStopping,
  isAnalyzing,
  onStartCrawl,
  onStopCrawl,
  onReset,
  showSettings,
  setShowSettings,
}: CrawlControlsProps) {
  // Déterminer quel bouton afficher
  const renderActionButton = () => {
    // État: Analyzing (embeddings en cours)
    if (isAnalyzing) {
      return (
        <button
          disabled
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 font-medium text-white cursor-not-allowed opacity-80"
        >
          <Loader2 className="h-4 w-4 animate-spin" /> Analyzing...
        </button>
      )
    }

    if (!isCrawling) {
      // État: Pas de crawl en cours
      return (
        <button
          onClick={onStartCrawl}
          disabled={!url || isConnected}
          className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 font-medium text-black hover:bg-white/90 disabled:opacity-50"
        >
          <Play className="h-4 w-4" /> Start
        </button>
      )
    }

    if (isStopping) {
      // État: Finalisation en cours (après clic sur Stop)
      return (
        <button
          disabled
          className="flex items-center gap-2 rounded-lg bg-yellow-600 px-4 py-2 font-medium text-white cursor-not-allowed opacity-80"
        >
          <Loader2 className="h-4 w-4 animate-spin" /> Finalizing...
        </button>
      )
    }

    // État: Crawl en cours
    return (
      <button
        onClick={onStopCrawl}
        className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700"
      >
        <Pause className="h-4 w-4" /> Stop
      </button>
    )
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <input
          type="url"
          placeholder="Enter seed URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={isCrawling}
          className="w-80 rounded-lg border border-white/30 bg-white/10 px-4 py-2 font-mono text-sm text-white focus:outline-none"
        />
        {renderActionButton()}
        <button onClick={onReset} className="rounded-lg border border-white/30 p-2 text-white hover:bg-white/10">
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="rounded-lg border border-white/30 p-2 text-white hover:bg-white/10"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </>
  )
}
