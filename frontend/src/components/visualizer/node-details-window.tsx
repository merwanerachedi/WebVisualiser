"use client"

import { useState, useEffect } from "react"
import { ExternalLink, FileText, Loader2, Target } from "lucide-react"
import { Button } from "@/components/ui/button"

interface SimilarPage {
    url: string
    title: string | null
    score: number
}

interface NodeDetailsWindowProps {
    nodeUrl: string
    nodeTitle?: string
    onClose: () => void
    onSimilarPagesFound?: (pages: SimilarPage[]) => void
    onHoverSimilarPage?: (url: string | null) => void
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export function NodeDetailsWindow({
    nodeUrl,
    nodeTitle,
    onClose,
    onSimilarPagesFound,
    onHoverSimilarPage,
}: NodeDetailsWindowProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [isFindingSimilar, setIsFindingSimilar] = useState(false)
    const [summary, setSummary] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [displayedText, setDisplayedText] = useState("")
    const [isRevealing, setIsRevealing] = useState(false)
    const [similarPages, setSimilarPages] = useState<SimilarPage[]>([])

    const truncateUrl = (url: string, maxLength = 60) => {
        if (url.length <= maxLength) return url
        return url.substring(0, maxLength) + "..."
    }

    const handleVisit = () => {
        window.open(nodeUrl, "_blank", "noopener,noreferrer")
    }

    const handleSummarize = async () => {
        setIsLoading(true)
        setError(null)
        setSummary(null)
        setDisplayedText("")
        setSimilarPages([]) // Clear similar pages when summarizing
        if (onSimilarPagesFound) onSimilarPagesFound([]) // Reset graph highlighting

        try {
            const response = await fetch(`${API_URL}/api/page/summarize?url=${encodeURIComponent(nodeUrl)}`, {
                method: "POST",
            })

            if (!response.ok) {
                throw new Error("Failed to fetch summary")
            }

            const data = await response.json()
            const fullSummary = data.summary || "No summary available"
            setSummary(fullSummary)
            setIsRevealing(true)
        } catch (err) {
            console.error("[v0] Error fetching summary:", err)
            setError("Failed to generate summary. Please try again.")
        } finally {
            setIsLoading(false)
        }
    }

    const handleFindSimilar = async () => {
        setIsFindingSimilar(true)
        setError(null)
        setSimilarPages([])
        setSummary(null) // Clear summary when finding similar
        setDisplayedText("")

        try {
            const response = await fetch(`${API_URL}/api/page/similar?url=${encodeURIComponent(nodeUrl)}&limit=10`, {
                credentials: "include",
            })

            if (!response.ok) {
                throw new Error("Failed to find similar pages")
            }

            const data: SimilarPage[] = await response.json()
            setSimilarPages(data)

            // Notify parent to highlight similar nodes on the graph
            if (onSimilarPagesFound) {
                onSimilarPagesFound(data)
            }
        } catch (err) {
            console.error("[v0] Error finding similar pages:", err)
            setError("Failed to find similar pages. Please try again.")
        } finally {
            setIsFindingSimilar(false)
        }
    }

    // Progressive text reveal effect
    useEffect(() => {
        if (!summary || !isRevealing) return

        let currentIndex = 0
        const revealInterval = setInterval(() => {
            if (currentIndex <= summary.length) {
                setDisplayedText(summary.substring(0, currentIndex))
                currentIndex += 2 // Reveal 2 characters at a time
            } else {
                setIsRevealing(false)
                clearInterval(revealInterval)
            }
        }, 20) // Adjust speed here (lower = faster)

        return () => clearInterval(revealInterval)
    }, [summary, isRevealing])

    return (
        <div className="space-y-4">
            {/* Page info */}
            <div>
                <h3 className="text-sm font-semibold text-white leading-tight mb-2">{nodeTitle || "Untitled Page"}</h3>
                <p className="text-xs text-slate-400 break-all">{truncateUrl(nodeUrl)}</p>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
                <Button
                    variant="ghost"
                    onClick={handleVisit}
                    className="flex-1 text-white border border-violet-500/30 hover:bg-violet-500/20 hover:border-violet-500/50 transition-all"
                >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Visit
                </Button>
                <Button
                    onClick={handleSummarize}
                    disabled={isLoading}
                    className="flex-1 bg-gradient-to-r from-violet-600/90 to-purple-600/90 hover:from-violet-500 hover:to-purple-500 text-white font-medium transition-all"
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Loading...
                        </>
                    ) : (
                        <>
                            <FileText className="w-4 h-4 mr-2" />
                            Summarize
                        </>
                    )}
                </Button>
            </div>

            {/* Similar Pages button */}
            <Button
                onClick={handleFindSimilar}
                disabled={isFindingSimilar}
                className="w-full bg-gradient-to-r from-cyan-600/90 to-teal-600/90 hover:from-cyan-500 hover:to-teal-500 text-white font-medium transition-all"
            >
                {isFindingSimilar ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Finding similar...
                    </>
                ) : (
                    <>
                        <Target className="w-4 h-4 mr-2" />
                        Find Similar Pages
                    </>
                )}
            </Button>

            {/* Similar pages results */}
            {similarPages.length > 0 && (
                <div className="bg-cyan-950/30 border border-cyan-500/20 rounded-lg p-3 backdrop-blur-sm max-h-[200px] overflow-y-auto">
                    <p className="text-xs text-cyan-300 mb-2 font-medium">
                        {similarPages.length} similar page{similarPages.length > 1 ? "s" : ""} found
                    </p>
                    <div className="space-y-2">
                        {similarPages.map((page, index) => (
                            <div
                                key={page.url}
                                className="flex items-start gap-2 text-xs p-2 rounded bg-cyan-500/10 hover:bg-cyan-500/20 transition-colors cursor-pointer"
                                onMouseEnter={() => onHoverSimilarPage?.(page.url)}
                                onMouseLeave={() => onHoverSimilarPage?.(null)}
                            >
                                <span className="text-cyan-400 font-mono">{(page.score * 100).toFixed(0)}%</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-white truncate">{page.title || "Untitled"}</p>
                                    <p className="text-slate-400 truncate text-[10px]">{page.url}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Summary display with progressive reveal */}
            {summary && (
                <div className="bg-violet-950/30 border border-violet-500/20 rounded-lg p-4 backdrop-blur-sm max-h-[400px] overflow-y-auto">
                    <div className="relative">
                        {/* Display the revealed text */}
                        <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{displayedText}</p>

                        {/* Blur effect on unrevealed portion */}
                        {isRevealing && (
                            <div className="absolute inset-0 pointer-events-none">
                                <div
                                    className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-violet-950/30 to-transparent backdrop-blur-sm"
                                    style={{
                                        maskImage: "linear-gradient(to top, black, transparent)",
                                        WebkitMaskImage: "linear-gradient(to top, black, transparent)",
                                    }}
                                />
                            </div>
                        )}

                        {/* Cursor effect while revealing */}
                        {isRevealing && <span className="inline-block w-0.5 h-4 bg-violet-400 animate-pulse ml-0.5" />}
                    </div>
                </div>
            )}

            {/* Error display */}
            {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    <p className="text-sm text-red-300">{error}</p>
                </div>
            )}
        </div>
    )
}
