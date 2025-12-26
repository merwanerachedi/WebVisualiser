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
    <div className="absolute right-8 top-24 z-20 pointer-events-none">
      <div className="relative rounded-xl border border-violet-500/20 bg-black/90 p-4 backdrop-blur-xl pointer-events-auto overflow-hidden">
        {/* Subtle violet gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 via-transparent to-purple-500/5 pointer-events-none" />

        <div className="relative space-y-2 font-mono text-sm text-white">
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
          <div className="mt-2 flex items-center gap-2 border-t border-violet-500/20 pt-2">
            <div className={`h-2 w-2 rounded-full ${isConnected ? "animate-pulse bg-violet-400" : "bg-white/30"}`} />
            <span className="text-xs text-white/60">{isConnected ? "Connected" : "Disconnected"}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
