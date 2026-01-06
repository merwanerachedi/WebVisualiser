// frontend/src/lib/session-events.ts
// Promise-based event system for session expiry confirmation

type SessionConfirmCallback = () => Promise<boolean>

class SessionConfirmEmitter {
    private callback: SessionConfirmCallback | null = null

    // UI component registers its confirmation handler
    setHandler(handler: SessionConfirmCallback): () => void {
        this.callback = handler
        return () => {
            this.callback = null
        }
    }

    // API calls this and waits for user decision
    // Returns true if user wants to continue as anonymous, false if they want to login
    async confirm(): Promise<boolean> {
        if (!this.callback) {
            // No handler registered, default to continue
            return true
        }
        return this.callback()
    }
}

// Singleton for session expiry confirmation
export const sessionExpiredConfirm = new SessionConfirmEmitter()
