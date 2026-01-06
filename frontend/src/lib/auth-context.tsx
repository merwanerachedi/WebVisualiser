"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react"
import { publicApi } from "./api"

interface User {
    user_id: string
    email: string
    created_at: string
}

interface AuthContextType {
    user: User | null
    isLoading: boolean
    isAuthenticated: boolean
    login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
    register: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
    logout: () => Promise<void>
    checkAuth: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    const checkAuth = useCallback(async () => {
        try {
            // Use publicApi - no interceptor, no redirect loop
            const response = await publicApi.get("/api/auth/me")
            setUser(response.data)
        } catch {
            setUser(null)
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        checkAuth()
    }, [checkAuth])

    const login = async (email: string, password: string) => {
        try {
            await publicApi.post("/api/auth/login", { email, password })
            await checkAuth()
            // Set flag for session expiry detection
            localStorage.setItem("wasLoggedIn", "true")
            return { success: true }
        } catch (error) {
            const errorMessage =
                (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Login failed"
            return { success: false, error: errorMessage }
        }
    }

    const register = async (email: string, password: string) => {
        try {
            await publicApi.post("/api/auth/register", { email, password })
            return await login(email, password)
        } catch (error) {
            const errorMessage =
                (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
                "Registration failed"
            return { success: false, error: errorMessage }
        }
    }

    const logout = async () => {
        try {
            await publicApi.post("/api/auth/logout")
        } catch {
            // Ignore errors
        }
        // Clear session flag
        localStorage.removeItem("wasLoggedIn")
        setUser(null)
    }

    return (
        <AuthContext.Provider
            value={{
                user,
                isLoading,
                isAuthenticated: !!user,
                login,
                register,
                logout,
                checkAuth,
            }}
        >
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider")
    }
    return context
}
