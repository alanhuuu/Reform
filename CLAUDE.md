# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Reform?

Reform is an AI-powered UI/UX refactoring tool. Users connect a GitHub repo, Reform analyzes their frontend pages, discovers competitors, and generates structural UI transformations — not just cosmetic tweaks. The product name in code is also "RefineUI".

## Repository Structure

This is a monorepo with two independent apps:

- **`frontend/`** — Next.js 14 (App Router) + TypeScript + Tailwind CSS. Deployed on Vercel.
- **`backend/`** — FastAPI (Python 3.11). Deployed on Railway via Docker.
- **Root-level `vitest.config.ts` and `__tests__/`** — Frontend component/unit tests live at the repo root, NOT inside `frontend/`.

The frontend and backend communicate over HTTP. The frontend uses `NEXT_PUBLIC_API_URL` to point at the backend (defaults to `http://localhost:8000`).

## Development Commands

### Frontend (run from `frontend/`)
```bash
npm run dev          # Start Next.js dev server (port 3000)
npm run build        # Production build
npm run lint         # ESLint
```

### Frontend Tests (run from repo root)
```bash
npx vitest run                        # Run all tests
npx vitest run __tests__/components/UploadPanel.test.tsx  # Single test file
npx vitest                            # Watch mode
npx vitest run --coverage             # Coverage (thresholds: 80% lines/functions, 75% branches)
```

Tests use Vitest + React Testing Library + jsdom. Setup file at `__tests__/setup.ts` mocks Next.js navigation, `next/link`, and `next/font`.

### Backend (run from `backend/`)
```bash
pip install -r requirements.txt       # Install deps
uvicorn app.main:app --reload         # Start dev server (port 8000)
pytest                                # Run all tests
pytest tests/test_routes.py -k "test_health"  # Single test
```

Backend tests use pytest with httpx for async route testing. Config in `pytest.ini`.

## Architecture

### Backend Pipeline (the core)

The main flow is a multi-page transformation pipeline (`services/pipeline_orchestrator.py`):

1. **Ingest** (`code_ingestion.py`) — Clone GitHub repo, extract files
2. **Discover** (`page_discovery.py`) — Find all frontend pages/routes
3. **Evaluate** (`ui_evaluator.py`) — Score each page's UI/UX quality
4. **Plan** (`transformation_planner.py`) — Decide what structural changes to make
5. **Transform** (`pipeline_orchestrator.py`) — Call Claude API to rewrite page code with validation + retry
6. **Validate** (`transform_validator.py`) — Ensure transforms are structural, not just cosmetic
7. **Render** (`multi_page_renderer.py`) — Generate before/after screenshots via Playwright

Competitor analysis is a parallel flow:
- **Discover competitors** (`competitor_discovery.py`) — Uses Claude to find relevant competitors
- **Extract patterns** (`tinyfish_client.py`) — Uses TinyFish (external browser agent) to scrape competitor UIs
- **Aggregate** (`pattern_aggregator.py`) — Merge competitor patterns into design intelligence

All AI calls use the Anthropic Python SDK (`anthropic`). Prompts live in `app/prompts/`.

### Backend API Routes

Routes in `app/routes/` map 1:1 to pipeline stages. Key endpoints:
- `POST /transform-repo-v2` — Full pipeline (v2, primary)
- `POST /ingest-repo` / `POST /analyze-code` / `POST /transform-code` — Individual pipeline steps
- `POST /suggest-edit` — Apply a targeted edit to transformed code
- `POST /re-render` — Re-screenshot after an edit
- `POST /discover-competitors` / `POST /analyze-competitors` — Competitor flow
- `GET /repo-pages` — List pages in a repo

### Frontend Pages

- `/` — Landing page (marketing)
- `/new/*` — New project wizard: discovery, insights, design-system, simulation, transform
- `/dashboard` — Project dashboard with before/after views

### Frontend Patterns

- Path alias: `@/` maps to `frontend/` root
- Auth: NextAuth.js with GitHub OAuth (`app/api/auth/[...nextauth]`)
- API calls: All go through `lib/api.ts` → `apiUrl()` helper
- Components are organized by page: `components/dashboard/`, `components/landing/`, `components/demo/`, `components/layout/`

## Key External Services

- **Anthropic Claude API** — All AI reasoning (code transforms, analysis, planning)
- **TinyFish** — Browser automation agent for competitor site scraping
- **Playwright** — Server-side screenshot rendering (installed in Docker)
- **GitHub OAuth** — User authentication via NextAuth
