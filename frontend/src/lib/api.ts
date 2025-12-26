import axios, { AxiosError, InternalAxiosRequestConfig } from "axios"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

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

                if (typeof window !== "undefined") {
                    window.location.href = "/login"
                }

                return Promise.reject(refreshError)
            }
        }

        return Promise.reject(error)
    }
)

export default api
