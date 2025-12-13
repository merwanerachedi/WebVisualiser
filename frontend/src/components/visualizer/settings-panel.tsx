"use client"

import type { CrawlConfig } from "./types"

interface SettingsPanelProps {
  config: CrawlConfig
  setConfig: (config: CrawlConfig) => void
}

export function SettingsPanel({ config, setConfig }: SettingsPanelProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-white/70">Max Depth</label>
          <input
            type="number"
            min="1"
            value={config.max_depth}
            onChange={(e) => setConfig({ ...config, max_depth: +e.target.value })}
            className="w-full bg-white/10 text-white rounded px-2 py-1"
          />
        </div>
        <div>
          <label className="text-xs text-white/70">Max Pages</label>
          <input
            type="number"
            min="1"
            value={config.max_pages}
            onChange={(e) => setConfig({ ...config, max_pages: +e.target.value })}
            className="w-full bg-white/10 text-white rounded px-2 py-1"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-white/70">Crawl Mode</label>
          <select
            value={config.crawl_mode}
            onChange={(e) => setConfig({ ...config, crawl_mode: e.target.value as "INTERNAL" | "EXTERNAL" })}
            className="w-full bg-white/10 text-white rounded px-2 py-1"
          >
            <option value="INTERNAL">INTERNAL</option>
            <option value="EXTERNAL">EXTERNAL</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-white/70">Algorithm</label>
          <select
            value={config.algorithm}
            onChange={(e) => setConfig({ ...config, algorithm: e.target.value as "BFS" | "DFS" })}
            className="w-full bg-white/10 text-white rounded px-2 py-1"
          >
            <option value="BFS">BFS</option>
            <option value="DFS">DFS</option>
          </select>
        </div>
      </div>
    </div>
  )
}
