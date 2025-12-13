"use client"

interface StatsPanelProps {
  stats: {
    discovered: number
    crawled: number
    links: number
  }
  isConnected: boolean
}

export function StatsPanel({ stats, isConnected }: StatsPanelProps) {
  return (
    <div className="absolute right-8 top-8 z-20 pointer-events-none">
      <div className="rounded-xl border border-white/20 bg-black/80 p-4 backdrop-blur-sm pointer-events-auto">
        <div className="space-y-2 font-mono text-sm text-white">
          <div className="flex justify-between gap-6">
            <span>Discovered:</span>
            <span className="font-bold">{stats.discovered}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span>Crawled:</span>
            <span className="font-bold">{stats.crawled}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span>Links:</span>
            <span className="font-bold">{stats.links}</span>
          </div>
          <div className="mt-2 flex items-center gap-2 border-t border-white/20 pt-2">
            <div className={`h-2 w-2 rounded-full ${isConnected ? "animate-pulse bg-white" : "bg-white/30"}`} />
            <span className="text-xs text-white/60">{isConnected ? "Connected" : "Disconnected"}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
