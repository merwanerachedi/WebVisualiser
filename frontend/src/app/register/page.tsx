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

export default function RegisterPage() {
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [error, setError] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const { register } = useAuth()
    const router = useRouter()

    // Memoize stars so they don't regenerate on each keystroke
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

        if (password !== confirmPassword) {
            setError("Passwords do not match")
            return
        }

        if (password.length < 6) {
            setError("Password must be at least 6 characters")
            return
        }

        setIsLoading(true)

        const result = await register(email, password)

        if (result.success) {
            router.push("/")
        } else {
            setError(result.error || "Registration failed")
        }
        setIsLoading(false)
    }

    return (
        <div className="min-h-screen relative overflow-hidden">
            {/* Animated starfield background matching main app */}
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
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-950/20 via-transparent to-transparent" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-blue-950/20 via-transparent to-transparent" />
            </div>

            {/* Content with pt-24 for navbar spacing */}
            <div className="relative z-10 flex flex-col min-h-screen items-center justify-center pt-24 w-full max-w-md mx-auto px-4">
                <div className="w-full rounded-2xl border border-white/10 bg-gray-900/70 p-8 backdrop-blur-2xl shadow-2xl shadow-purple-500/10 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    {/* Header */}
                    <div className="mb-8 text-center">
                        <div className="mb-6 inline-flex items-center justify-center rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 p-4 shadow-lg shadow-purple-500/20">
                            <Globe className="h-10 w-10 text-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]" />
                        </div>
                        <h1 className="text-3xl font-bold text-white mb-2">Create an account</h1>
                        <p className="text-gray-400 text-balance">Save your crawls and access them anytime</p>
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
                                className="h-11 border-white/10 bg-gray-800/50 text-white placeholder:text-gray-500 focus:border-purple-500/50 focus:ring-purple-500/20"
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
                                className="h-11 border-white/10 bg-gray-800/50 text-white placeholder:text-gray-500 focus:border-purple-500/50 focus:ring-purple-500/20"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword" className="text-gray-300 text-sm font-medium">
                                Confirm Password
                            </Label>
                            <Input
                                id="confirmPassword"
                                type="password"
                                placeholder="••••••••"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                className="h-11 border-white/10 bg-gray-800/50 text-white placeholder:text-gray-500 focus:border-purple-500/50 focus:ring-purple-500/20"
                            />
                        </div>

                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="w-full h-11 mt-6 bg-gradient-to-r from-blue-500 to-purple-500 text-white font-medium hover:from-blue-600 hover:to-purple-600 shadow-lg shadow-purple-500/20 transition-all hover:shadow-purple-500/30 hover:scale-[1.02]"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Creating account...
                                </>
                            ) : (
                                "Create account"
                            )}
                        </Button>
                    </form>

                    {/* Footer */}
                    <p className="mt-6 text-center text-sm text-gray-400">
                        Already have an account?{" "}
                        <Link
                            href="/login"
                            className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors hover:underline"
                        >
                            Sign in
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
