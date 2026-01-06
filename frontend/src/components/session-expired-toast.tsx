"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { sessionExpiredConfirm } from "@/lib/session-events"

export function SessionExpiredModal() {
    const router = useRouter()
    const [show, setShow] = useState(false)
    const [resolvePromise, setResolvePromise] = useState<((value: boolean) => void) | null>(null)

    const handleContinue = useCallback(() => {
        setShow(false)
        if (resolvePromise) {
            resolvePromise(true) // Continue as anonymous
        }
    }, [resolvePromise])

    const handleLogin = useCallback(() => {
        setShow(false)
        if (resolvePromise) {
            resolvePromise(false) // Don't continue, redirect to login
        }
        // Save current URL to return after login
        if (typeof window !== "undefined") {
            sessionStorage.setItem("returnUrl", window.location.pathname)
        }
        router.push("/login")
    }, [resolvePromise, router])

    useEffect(() => {
        const unsubscribe = sessionExpiredConfirm.setHandler(
            () =>
                new Promise<boolean>((resolve) => {
                    setResolvePromise(() => resolve)
                    setShow(true)
                }),
        )

        return unsubscribe
    }, [])

    if (!show) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-xl animate-in fade-in duration-300" />

            <div className="relative animate-in fade-in zoom-in-95 duration-500">
                {/* Outer glow effect */}
                <div className="absolute -inset-4 bg-gradient-to-r from-cyan-500/20 via-violet-500/20 to-pink-500/20 rounded-3xl blur-2xl animate-pulse" />

                <div className="relative w-[480px] rounded-2xl bg-gradient-to-br from-slate-900/90 via-slate-800/90 to-slate-900/90 backdrop-blur-2xl border border-white/10 shadow-2xl overflow-hidden">
                    {/* Animated gradient top border */}
                    <div className="h-[2px] bg-gradient-to-r from-cyan-400 via-violet-500 via-purple-500 to-pink-500 animate-[shimmer_3s_ease-in-out_infinite]" />

                    <div className="p-8">
                        {/* Icon with enhanced cosmic effects */}
                        <div className="flex justify-center mb-6">
                            <div className="relative">
                                {/* Multiple layered glow effects */}
                                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500 to-violet-500 rounded-full blur-3xl opacity-40 animate-pulse" />
                                <div
                                    className="absolute inset-0 bg-gradient-to-tr from-violet-500 to-pink-500 rounded-full blur-2xl opacity-30 animate-pulse"
                                    style={{ animationDelay: "1s" }}
                                />

                                {/* Icon container */}
                                <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-violet-600/30 to-purple-600/30 border-2 border-violet-400/40 flex items-center justify-center shadow-lg shadow-violet-500/50 backdrop-blur-sm">
                                    <div className="absolute inset-[2px] rounded-full bg-gradient-to-br from-violet-500/10 to-transparent" />
                                    <svg
                                        className="w-10 h-10 text-violet-300 relative z-10 drop-shadow-[0_0_8px_rgba(139,92,246,0.8)]"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <circle cx="12" cy="12" r="10" />
                                        <polyline points="12 6 12 12 16 14" />
                                    </svg>
                                </div>
                            </div>
                        </div>

                        {/* Title with gradient text */}
                        <h2 className="text-2xl font-bold text-center mb-3 bg-gradient-to-r from-white via-violet-200 to-white bg-clip-text text-transparent">
                            Session Expired
                        </h2>

                        {/* Description with enhanced styling */}
                        <p className="text-white/60 text-center text-[15px] mb-8 leading-relaxed">
                            Your session has expired. If you continue without logging back in,{" "}
                            <span className="text-cyan-400 font-semibold">this crawl won't be saved</span> to your history.
                        </p>

                        {/* Buttons with enhanced design */}
                        <div className="flex gap-3">
                            {/* Continue button */}
                            <button
                                onClick={handleContinue}
                                className="flex-1 px-5 py-3.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 hover:border-white/20 text-white/60 hover:text-white font-medium transition-all duration-300 hover:shadow-lg hover:shadow-white/5 group relative overflow-hidden"
                            >
                                <span className="relative z-10">Continue Anyway</span>
                            </button>

                            {/* Login button with cosmic gradient */}
                            <button
                                onClick={handleLogin}
                                className="relative flex-1 px-5 py-3.5 rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-violet-600 hover:from-violet-500 hover:via-purple-500 hover:to-violet-500 text-white font-semibold transition-all duration-300 shadow-xl shadow-violet-500/40 hover:shadow-2xl hover:shadow-violet-500/50 overflow-hidden group"
                            >
                                {/* Animated shimmer overlay */}
                                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                                </div>

                                {/* Subtle inner glow */}
                                <div className="absolute inset-[1px] rounded-[11px] bg-gradient-to-b from-white/10 to-transparent opacity-50" />

                                <span className="relative z-10 flex items-center justify-center gap-2">
                                    Login
                                    <svg
                                        className="w-4 h-4 transition-transform group-hover:translate-x-0.5"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        strokeWidth="2.5"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                    </svg>
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
