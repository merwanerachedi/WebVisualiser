"use client"

import { Search } from "lucide-react"

interface SearchPanelProps {
  searchQuery: string
  setSearchQuery: (query: string) => void
  isSearching: boolean
  onSearch: () => void
  crawlCompleted: boolean
}

export function SearchPanel({ searchQuery, setSearchQuery, isSearching, onSearch, crawlCompleted }: SearchPanelProps) {
  if (!crawlCompleted) return null

  return (
    <>
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Search for content..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          disabled={isSearching}
          className="w-80 rounded-lg border border-white/30 bg-white/10 px-4 py-2 font-mono text-sm text-white focus:outline-none placeholder:text-white/50"
        />
        <button
          onClick={onSearch}
          disabled={!searchQuery.trim() || isSearching}
          className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          <Search className="h-4 w-4" />
          {isSearching ? "Searching..." : "Search"}
        </button>
      </div>
      <div className="mt-3 text-xs text-white/60 text-center">
        High relevance: <span className="inline-block w-3 h-3 rounded-full bg-[#8b5cf6] align-middle"></span> Purple
        <span className="mx-3">•</span>
        Medium relevance: <span className="inline-block w-3 h-3 rounded-full bg-[#ec4899] align-middle ml-1"></span>{" "}
        Pink
      </div>
    </>
  )
}
