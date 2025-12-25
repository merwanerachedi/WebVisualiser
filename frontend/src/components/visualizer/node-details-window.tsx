"use client"

import { useState, useEffect } from "react"
import { ExternalLink, FileText, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface NodeDetailsWindowProps {
    nodeUrl: string
    nodeTitle?: string
    onClose: () => void
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export function NodeDetailsWindow({ nodeUrl, nodeTitle, onClose }: NodeDetailsWindowProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [summary, setSummary] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [displayedText, setDisplayedText] = useState("")
    const [isRevealing, setIsRevealing] = useState(false)

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
