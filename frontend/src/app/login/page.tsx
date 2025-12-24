"use client"

import { useState } from "react"
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
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
            {/* Starfield effect placeholder */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-900/10 via-transparent to-transparent" />
            </div>

            <div className="relative z-10 w-full max-w-md px-4">
                {/* Back link */}
                <Link
                    href="/"
                    className="mb-8 inline-flex items-center text-sm text-gray-400 transition-colors hover:text-cyan-400"
                >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to home
                </Link>

                {/* Card */}
                <div className="rounded-xl border border-white/10 bg-gray-900/50 p-8 backdrop-blur-xl">
                    {/* Header */}
                    <div className="mb-8 text-center">
                        <div className="mb-4 inline-flex items-center justify-center rounded-full bg-cyan-500/10 p-3">
                            <Globe className="h-8 w-8 text-cyan-400" />
                        </div>
                        <h1 className="text-2xl font-bold text-white">Welcome back</h1>
                        <p className="mt-2 text-gray-400">Sign in to access your crawl history</p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
                                {error}
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-gray-300">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="border-white/10 bg-gray-800/50 text-white placeholder:text-gray-500"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-gray-300">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="border-white/10 bg-gray-800/50 text-white placeholder:text-gray-500"
                            />
                        </div>

                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-600 hover:to-blue-600"
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
                        <Link href="/register" className="text-cyan-400 hover:underline">
                            Sign up
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    )
}
