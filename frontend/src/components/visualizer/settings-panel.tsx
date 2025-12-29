"use client"

import type { CrawlConfig } from "./types"

interface SettingsPanelProps {
  config: CrawlConfig
  setConfig: (config: CrawlConfig) => void
}

export function SettingsPanel({ config, setConfig }: SettingsPanelProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-white/60 mb-1.5 block font-medium">Max Depth</label>
          <input
            type="number"
            min="1"
            value={config.max_depth}
            onChange={(e) => setConfig({ ...config, max_depth: +e.target.value })}
            className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all"
          />
        </div>
        <div>
          <label className="text-xs text-white/60 mb-1.5 block font-medium">Max Pages</label>
          <input
            type="number"
            min="1"
            value={config.max_pages}
            onChange={(e) => setConfig({ ...config, max_pages: +e.target.value })}
            className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-white/60 mb-1.5 block font-medium">Crawl Mode</label>
          <select
            value={config.crawl_mode}
            onChange={(e) => setConfig({ ...config, crawl_mode: e.target.value as "INTERNAL" | "EXTERNAL" | "ALL" })}
            className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all appearance-none cursor-pointer"
          >
            <option value="INTERNAL" className="bg-gray-900">
              INTERNAL
            </option>
            <option value="EXTERNAL" className="bg-gray-900">
              EXTERNAL
            </option>
            <option value="ALL" className="bg-gray-900">
              ALL
            </option>
          </select>
        </div>
        <div>
          <label className="text-xs text-white/60 mb-1.5 block font-medium">Algorithm</label>
          <select
            value={config.algorithm}
            onChange={(e) => setConfig({ ...config, algorithm: e.target.value as "BFS" | "DFS" })}
            className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all appearance-none cursor-pointer"
          >
            <option value="BFS" className="bg-gray-900">
              BFS
            </option>
            <option value="DFS" className="bg-gray-900">
              DFS
            </option>
          </select>
        </div>
      </div>
    </div>
  )
}
