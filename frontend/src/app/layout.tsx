import type React from "react"
import type { Metadata } from "next"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"
import { AuthProvider } from "@/lib/auth-context"
import { Navbar } from "@/components/navbar"



export const metadata: Metadata = {
  title: "Web Visualizer",
  description: "Real-time web crawler visualization",
  generator: "v0.app",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fr" className="dark">
      <body className="font-sans antialiased">
        <AuthProvider>
          <Navbar />
          <main className="pt-14">
            {children}
          </main>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  )
}

