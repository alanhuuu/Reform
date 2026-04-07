import type { Metadata } from 'next'
import { IBM_Plex_Mono, Manrope } from 'next/font/google'
import './globals.css'
import Providers from './providers'

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-sans',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'Reform — Upgrade ugly frontends into polished UI',
  description:
    'AI-powered frontend refactoring tool. Upload a screenshot, get a production-ready redesign. Refactor the UI, not the logic.',
  keywords: ['UI refactor', 'frontend AI', 'design tool', 'developer tool'],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${plexMono.variable}`}>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-zinc-950 text-zinc-100 antialiased font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
