"use client"

import type React from "react"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Globe, Loader2, ArrowLeft } from "lucide-react"

export default function LoginPage() {
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [error, setError] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const { login } = useAuth()
    const router = useRouter()

    // Memoize stars pour qu'il ne se regenere pas a chaque frappe
    const stars = useMemo(() =>
        [...Array(50)].map((_, i) => ({
            id: i,
            top: Math.random() * 100,
            left: Math.random() * 100,
            delay: Math.random() * 3,
            duration: 2 + Math.random() * 3,
            opacity: Math.random() * 0.7 + 0.3,
        })),
        [])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError("")
        setIsLoading(true)

        const result = await login(email, password)

        if (result.success) {
            router.push("/")
        } else {
            setError(result.error || "Login failed")
        }
        setIsLoading(false)
    }

    return (
        <div className="min-h-screen relative overflow-hidden">
            {/* Background - covers entire screen including behind navbar */}
            <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-slate-900 to-gray-950">
                {/* Animated stars */}
                <div className="absolute inset-0">
                    {stars.map((star) => (
                        <div
                            key={star.id}
                            className="absolute h-0.5 w-0.5 bg-white rounded-full animate-pulse"
                            style={{
                                top: `${star.top}%`,
                                left: `${star.left}%`,
                                animationDelay: `${star.delay}s`,
                                animationDuration: `${star.duration}s`,
                                opacity: star.opacity,
                            }}
                        />
                    ))}
                </div>
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-950/20 via-transparent to-transparent" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-purple-950/20 via-transparent to-transparent" />
            </div>

            {/* Content with pt-24 for navbar spacing */}
            <div className="relative z-10 flex flex-col min-h-screen items-center justify-center pt-24 w-full max-w-md mx-auto px-4">
                {/* Card */}
                <div className="w-full rounded-2xl border border-white/10 bg-gray-900/70 p-8 backdrop-blur-2xl shadow-2xl shadow-cyan-500/10 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    {/* Header */}
                    <div className="mb-8 text-center">
                        <div className="mb-6 inline-flex items-center justify-center rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 p-4 shadow-lg shadow-cyan-500/20">
                            <Globe className="h-10 w-10 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
                        </div>
                        <h1 className="text-3xl font-bold text-white mb-2">Welcome back</h1>
                        <p className="text-gray-400 text-balance">Sign in to access your crawl history</p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {error && (
                            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">{error}</div>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-gray-300 text-sm font-medium">
                                Email
                            </Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="h-11 border-white/10 bg-gray-800/50 text-white placeholder:text-gray-500 focus:border-cyan-500/50 focus:ring-cyan-500/20"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-gray-300 text-sm font-medium">
                                Password
                            </Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="h-11 border-white/10 bg-gray-800/50 text-white placeholder:text-gray-500 focus:border-cyan-500/50 focus:ring-cyan-500/20"
                            />
                        </div>

                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="w-full h-11 mt-6 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium hover:from-cyan-600 hover:to-blue-600 shadow-lg shadow-cyan-500/20 transition-all hover:shadow-cyan-500/30 hover:scale-[1.02]"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Signing in...
                                </>
                            ) : (
                                "Sign in"
                            )}
                        </Button>
                    </form>

                    {/* Footer */}
                    <p className="mt-6 text-center text-sm text-gray-400">
                        Don&apos;t have an account?{" "}
                        <Link
                            href="/register"
                            className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors hover:underline"
                        >
                            Sign up
                        </Link>
                    </p>
                </div>
                {/* Back link */}
                <Link
                    href="/"
                    className="mt-8 inline-flex items-center text-sm text-gray-400 transition-colors hover:text-cyan-400"
                >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to home
                </Link>
            </div>
        </div>
    )
}
