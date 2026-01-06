import axios, { AxiosError, InternalAxiosRequestConfig } from "axios"
import { sessionExpiredConfirm } from "./session-events"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

// Helper to check if user was logged in (using localStorage flag set by auth-context)
function wasUserLoggedIn(): boolean {
    if (typeof localStorage === "undefined") return false
    return localStorage.getItem("wasLoggedIn") === "true"
}

// Clear the logged in flag when session expires
function clearLoggedInFlag(): void {
    if (typeof localStorage !== "undefined") {
        localStorage.removeItem("wasLoggedIn")
    }
}

// ====================
// PUBLIC API CLIENT
// ====================
// Pour les endpoints auth (login, register, me, refresh, logout)
// Sans intercepteur, sans auto-redirection
export const publicApi = axios.create({
    baseURL: API_URL,
    withCredentials: true,
    headers: {
        "Content-Type": "application/json",
    },
})

// ====================
// AUTHENTICATED API CLIENT
// ====================
// Pour les endpoints protégés (crawls, etc.)
// Avec intercepteur pour les tokens refresh
export const api = axios.create({
    baseURL: API_URL,
    withCredentials: true,
    headers: {
        "Content-Type": "application/json",
    },
})

// Response interceptor pour les tokens refresh
api.interceptors.response.use(
    (response) => response,

    async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

        // If 401 with "token_expired", try to refresh
        if (
            error.response?.status === 401 &&
            (error.response?.data as { detail?: string })?.detail === "token_expired" &&
            !originalRequest._retry
        ) {
            originalRequest._retry = true

            try {
                // Use publicApi for refresh (no interceptor loop)
                await publicApi.post("/api/auth/refresh")

                // Retry the original request with new token
                return api(originalRequest)
            } catch (refreshError) {
                console.error("[API] Refresh failed, redirecting to login")
                clearLoggedInFlag() // Clear flag since session is no longer valid

                if (typeof window !== "undefined") {
                    window.location.href = "/login"
                }

                return Promise.reject(refreshError)
            }
        }

        return Promise.reject(error)
    }
)

// ====================
// OPTIONAL AUTH API CLIENT
// ====================
// Pour les endpoints avec auth optionnelle (crawl, etc.)
// Tente de refresh le token AVANT chaque requête
// Si le refresh échoue pour un user connecté, demande confirmation via modal
export const optionalAuthApi = axios.create({
    baseURL: API_URL,
    withCredentials: true,
    headers: {
        "Content-Type": "application/json",
    },
})

// Variable pour éviter les refresh multiples en parallèle
let isRefreshing = false
let refreshPromise: Promise<boolean> | null = null // true = continue, false = cancelled

// Request interceptor - refresh proactif AVANT chaque requête
optionalAuthApi.interceptors.request.use(
    async (config) => {
        // Éviter les refresh en parallèle
        if (isRefreshing && refreshPromise) {
            const shouldContinue = await refreshPromise
            if (!shouldContinue) {
                // User chose to login, cancel this request
                throw new axios.Cancel("User chose to login instead")
            }
            return config
        }

        // Vérifier si l'utilisateur était connecté (via localStorage flag)
        const wasLoggedIn = wasUserLoggedIn()

        // Tenter un refresh silencieux avant la requête
        isRefreshing = true
        refreshPromise = (async () => {
            try {
                await publicApi.post("/api/auth/refresh")
                console.log("[OptionalAuthAPI] Token refreshed successfully")
                return true // Continue with request
            } catch {
                // Si l'utilisateur ÉTAIT connecté mais le refresh échoue → demander confirmation
                if (wasLoggedIn) {
                    console.log("[OptionalAuthAPI] Session expired, asking user...")
                    clearLoggedInFlag() // Éviter les confirmations répétées

                    // Attendre la décision de l'utilisateur
                    const continueAsAnonymous = await sessionExpiredConfirm.confirm()
                    return continueAsAnonymous
                } else {
                    console.log("[OptionalAuthAPI] No valid session, continuing as anonymous")
                    return true // Continue with request
                }
            }
        })()

        const shouldContinue = await refreshPromise
        isRefreshing = false
        refreshPromise = null

        if (!shouldContinue) {
            // User chose to login, cancel this request
            throw new axios.Cancel("User chose to login instead")
        }

        return config
    },
    (error) => Promise.reject(error)
)

export default api


