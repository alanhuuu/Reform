import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

function routeToLabel(route: string): string {
  if (route === '/') return 'Home'
  return route
    .replace(/^\//, '')
    .replace(/\//g, ' / ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function discoverPages(appDir: string, currentDir: string = appDir): { label: string; route: string }[] {
  const pages: { label: string; route: string }[] = []
  const entries = fs.readdirSync(currentDir, { withFileTypes: true })

  for (const entry of entries) {
    // Skip route groups (parenthesized), dynamic segments, and non-route dirs
    if (entry.name.startsWith('(') || entry.name.startsWith('[') || entry.name === 'api') {
      continue
    }

    const fullPath = path.join(currentDir, entry.name)

    if (entry.isDirectory()) {
      pages.push(...discoverPages(appDir, fullPath))
    } else if (entry.name === 'page.tsx' || entry.name === 'page.ts' || entry.name === 'page.jsx' || entry.name === 'page.js') {
      const relative = path.relative(appDir, currentDir)
      const route = relative === '' ? '/' : `/${relative.replace(/\\/g, '/')}`
      pages.push({ label: routeToLabel(route), route })
    }
  }

  return pages
}

export async function GET() {
  try {
    const appDir = path.join(process.cwd(), 'app')
    const pages = discoverPages(appDir)
    return NextResponse.json({ pages })
  } catch (error) {
    console.error('Failed to discover local pages:', error)
    return NextResponse.json({ pages: [] }, { status: 500 })
  }
}
