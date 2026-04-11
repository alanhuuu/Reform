"""
Deterministic page discovery — finds all frontend pages in a repository
without any Claude calls. Detects Next.js App Router and Pages Router patterns.
"""

import re
import logging

from app.schemas.pipeline_v2 import DiscoveredPage

logger = logging.getLogger(__name__)


# ── Framework detection helpers ─────────────────────────────────────

def _is_app_router_page(path: str) -> bool:
    """Match app/**/page.[jt]sx? with any leading prefix (e.g. src/, frontend/)."""
    return bool(re.match(r'^(?:[^/]+/)*app/.*page\.[jt]sx?$', path))


def _is_pages_router_page(path: str) -> bool:
    """Match Next.js pages/**/*.[jt]sx? excluding _app, _document, api/.
    Only matches when pages/ is at root or one level deep (e.g. frontend/pages/),
    NOT when under src/ (that's SPA convention, not Next.js)."""
    if not re.search(r'\.[jt]sx?$', path):
        return False
    # Must have pages/ but NOT src/pages/ (that's CRA/Vite)
    if '/src/pages/' in path or path.startswith('src/pages/'):
        return False
    if not re.match(r'^(?:[^/]+/)?pages/.*\.[jt]sx?$', path):
        return False
    inner = re.sub(r'^(?:[^/]+/)?pages/', '', path)
    if inner.startswith('_app') or inner.startswith('_document'):
        return False
    if inner.startswith('api/'):
        return False
    return True


def _segment_label(seg: str) -> str:
    """Title-case a segment, replacing - and _ with spaces."""
    return seg.replace('-', ' ').replace('_', ' ').title()


def _app_router_label(path: str) -> tuple[str, str] | None:
    """Convert an App Router page path to a (label, route) tuple.
    Returns None for dynamic routes that can't be evaluated."""
    inner = re.sub(r'^(?:[^/]+/)*app/', '', path)
    inner = re.sub(r'/page\.[jt]sx?$', '', inner)
    inner = re.sub(r'^page\.[jt]sx?$', '', inner)

    if inner == '':
        return ('Home', '/')

    segments = inner.split('/')
    labels = []
    route_parts = []
    for seg in segments:
        # Strip route groups like (groupname)
        if re.match(r'^\(.*\)$', seg):
            continue
        # Skip dynamic segments — can't evaluate without real data
        if re.match(r'^\[.*\]$', seg):
            return None
        labels.append(_segment_label(seg))
        route_parts.append(seg)

    if not labels:
        return ('Home', '/')

    label = ' / '.join(labels)
    route = '/' + '/'.join(route_parts)
    return (label, route)


def _pages_router_label(path: str) -> tuple[str, str] | None:
    """Convert a Pages Router page path to a (label, route) tuple.
    Returns None for dynamic routes."""
    inner = re.sub(r'^(?:[^/]+/)*pages/', '', path)
    inner = re.sub(r'\.[jt]sx?$', '', inner)

    if inner == 'index':
        return ('Home', '/')

    segments = inner.split('/')
    labels = []
    route_parts = []
    for seg in segments:
        if seg == 'index':
            continue
        if re.match(r'^\[.*\]$', seg):
            return None
        labels.append(_segment_label(seg))
        route_parts.append(seg)

    if not labels:
        return ('Home', '/')

    label = ' / '.join(labels)
    route = '/' + '/'.join(route_parts)
    return (label, route)


def _is_spa_page(path: str) -> bool:
    """Match SPA page patterns.

    Two accepted paths:
    1. File lives in a conventional `pages/`, `views/`, `screens/`, or
       `routes/` directory (strong signal).
    2. File name ends in `Page`, `Screen`, `View`, or `Route` (PascalCase)
       — safe to match even without a conventional dir, since it's a clear
       naming convention that doesn't overlap with generic components.

    Entry-point files (App.*, main.*, index.*) are still excluded here —
    they're handled by the universal fallback in `discover_pages` so the
    whole repo collapses to a single Home page rather than treating the
    entry file as one of N pages.
    """
    if not re.search(r'\.[jt]sx?$', path):
        return False
    basename = path.split('/')[-1]
    if basename.startswith('_') or basename in ('index.js', 'index.jsx', 'index.ts', 'index.tsx'):
        return False
    if 'test' in basename.lower() or 'spec' in basename.lower():
        return False
    if basename in ('App.js', 'App.jsx', 'App.tsx', 'App.ts',
                    'main.tsx', 'main.jsx', 'main.ts', 'main.js'):
        return False
    if basename in ('setupTests.js', 'reportWebVitals.js', 'firebase.js', 'vite-env.d.ts'):
        return False

    # Path 1: conventional page directories
    page_dirs = re.compile(r'(?:^|/)(?:pages|views|screens|routes)/')
    if page_dirs.search(path):
        return True

    # Path 2: PascalCase file name ending in a page-like suffix
    name_no_ext = re.sub(r'\.[jt]sx?$', '', basename)
    if re.match(r'^[A-Z][A-Za-z0-9]*(Page|Screen|View|Route)$', name_no_ext):
        return True

    return False


def _spa_page_label(path: str) -> tuple[str, str] | None:
    """Convert a SPA page path to a (label, route) tuple.
    e.g. frontend/src/pages/Login.js → ('Login', '/Login')
    Route is based on filename — actual routing is client-side."""
    basename = path.split('/')[-1]
    name = re.sub(r'\.[jt]sx?$', '', basename)
    if name.startswith('[') or name.startswith('_'):
        return None
    # Split camelCase/PascalCase into words: TemplateForm → Template Form
    spaced = re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', name)
    label = _segment_label(spaced)
    # Use filename as route identifier (for dedup). Actual screenshot goes to /
    route = f"/{name}"
    if name.lower() in ('home', 'homepage', 'landing', 'main'):
        route = "/"
    return (label, route)


# ── Router detection ────────────────────────────────────────────────

_ROUTER_IMPORT_PATTERNS = (
    "react-router-dom",
    "react-router",
    "@tanstack/react-router",
    "wouter",
    "@reach/router",
)
_ROUTER_JSX_PATTERNS = (
    "<Route",
    "<Routes",
    "createBrowserRouter",
    "createHashRouter",
    "createMemoryRouter",
    "RouterProvider",
)


def _has_client_router(files: list[dict]) -> bool:
    """Return True if any file imports a client router or instantiates routes.
    Used to distinguish real multi-page SPAs from single-page sites whose
    src/screens or src/pages directories just hold stacked sections."""
    for f in files:
        content = f.get("content") or ""
        if not content:
            continue
        # Cheap substring checks — false positives here are acceptable, since
        # erring toward "has router" just keeps current behavior.
        for pat in _ROUTER_IMPORT_PATTERNS:
            if pat in content:
                return True
        for pat in _ROUTER_JSX_PATTERNS:
            if pat in content:
                return True
    return False


def _looks_like_react_entry(content: str) -> bool:
    """Heuristic: does this file look like a React entry point?

    Used to filter out `main.ts`/`index.ts` utility files that happen to share
    a name with a real entry point.
    """
    if not content:
        return False
    if "ReactDOM" in content or "createRoot" in content:
        return True
    if "render(" in content and "<" in content:
        return True
    if "export default" in content and "return" in content and "<" in content:
        return True
    return False


def _find_spa_entry(files: list[dict]) -> dict | None:
    """Locate the best SPA entry file for single-page fallback analysis.

    Preference order:
      1. App.{tsx,jsx,ts,js} — the conventional root component
      2. main.{tsx,jsx,ts,js} — Vite's conventional entry
      3. index.{tsx,jsx,ts,js} — CRA's conventional entry
    Within a tier, the file with the most content wins (prefer meaningful
    files over 3-line stubs). Tier 2 and 3 require a React-entry heuristic
    so we don't mistake utility `main.ts`/`index.ts` files for real entries.
    """

    def _basename(f: dict) -> str:
        return (f.get("path") or "").split("/")[-1]

    def _size(f: dict) -> int:
        return f.get("size") or len(f.get("content") or "")

    tier_1 = {"App.tsx", "App.jsx", "App.ts", "App.js"}
    tier_2 = {"main.tsx", "main.jsx", "main.ts", "main.js"}
    tier_3 = {"index.tsx", "index.jsx", "index.ts", "index.js"}

    app_files = [f for f in files if _basename(f) in tier_1]
    if app_files:
        app_files.sort(key=_size, reverse=True)
        return app_files[0]

    main_files = [
        f for f in files
        if _basename(f) in tier_2 and _looks_like_react_entry(f.get("content") or "")
    ]
    if main_files:
        main_files.sort(key=_size, reverse=True)
        return main_files[0]

    index_files = [
        f for f in files
        if _basename(f) in tier_3 and _looks_like_react_entry(f.get("content") or "")
    ]
    if index_files:
        index_files.sort(key=_size, reverse=True)
        return index_files[0]

    return None


# ── Import resolution ───────────────────────────────────────────────

def _resolve_imports(page_path: str, page_content: str, files: list[dict]) -> list[dict]:
    """Resolve import statements from a page file against the ingested files list.
    Returns list of {path, content} for imported files that exist in the repo."""
    # Build a lookup: normalized path → file dict
    file_lookup: dict[str, dict] = {}
    for f in files:
        file_lookup[f["path"]] = f
        # Also index without common prefixes for relative resolution
        for prefix in ("src/", "frontend/", "client/", "app/", "web/"):
            if f["path"].startswith(prefix):
                file_lookup[f["path"][len(prefix):]] = f

    # Extract import paths from the page source
    import_pattern = re.compile(
        r'''(?:import|from)\s+['"](@/|\.\.?/)([^'"]+)['"]''',
    )
    resolved = []
    seen = set()

    for match in import_pattern.finditer(page_content):
        prefix = match.group(1)
        import_path = match.group(2)

        # Normalize: @/ imports resolve from project root
        if prefix == '@/':
            candidates = [import_path]
        else:
            # Relative imports: resolve from page's directory
            page_dir = '/'.join(page_path.split('/')[:-1])
            candidates = [f"{page_dir}/{import_path}"]

        # Try with common extensions
        extensions = ['', '.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts']
        for candidate in candidates:
            for ext in extensions:
                full_path = candidate + ext
                if full_path in file_lookup and full_path not in seen:
                    seen.add(full_path)
                    resolved.append(file_lookup[full_path])
                    break

    return resolved


# ── Main discovery function ─────────────────────────────────────────

def discover_pages(
    files: list[dict],
    file_tree: list[str],
) -> tuple[list[DiscoveredPage], str, dict[str, list[dict]]]:
    """
    Scan file tree for all frontend pages.

    Returns:
        - pages: list of DiscoveredPage
        - framework: detected framework string
        - dependency_map: {page_path: [imported file dicts]}
    """
    seen_routes: set[str] = set()
    pages: list[DiscoveredPage] = []
    framework = "unknown"

    # Build content lookup for resolving page content
    content_lookup: dict[str, str] = {f["path"]: f["content"] for f in files}

    for path in file_tree:
        result = None
        page_framework = ""

        if _is_app_router_page(path):
            result = _app_router_label(path)
            page_framework = "app_router"
        elif _is_pages_router_page(path):
            result = _pages_router_label(path)
            page_framework = "pages_router"
        elif _is_spa_page(path):
            result = _spa_page_label(path)
            page_framework = "spa"

        if result is None:
            continue

        label, route = result
        if route in seen_routes:
            continue
        seen_routes.add(route)

        # Only include pages whose content was actually ingested
        if path not in content_lookup:
            logger.debug("Page %s found in tree but content not ingested, skipping", path)
            continue

        if not page_framework:
            continue

        if framework == "unknown":
            framework = page_framework

        pages.append(DiscoveredPage(
            name=label,
            path=path,
            route=route,
            framework=page_framework,
        ))

    # Single-page SPA collapse: if we matched SPA "pages" but the repo has no
    # client router, those matches are almost always sections stacked inside
    # one App.* file, not distinct routes. Treat the whole thing as one page.
    if framework == "spa" and not _has_client_router(files):
        entry = _find_spa_entry(files)
        if entry and entry["path"] in content_lookup:
            logger.info(
                "SPA has no router — collapsing %d matched screens into a "
                "single Home page at %s",
                len(pages), entry["path"],
            )
            pages = [DiscoveredPage(
                name="Home",
                path=entry["path"],
                route="/",
                framework="spa",
            )]

    # Universal fallback: if nothing matched at all (e.g. a Vite/CRA repo with
    # no pages/ dir, no Page-suffixed files, and no Next.js structure), treat
    # the whole repo as a single-page app rooted at the best entry file we
    # can find. This keeps the pipeline usable on any React-flavored frontend.
    if not pages:
        entry = _find_spa_entry(files)
        if entry and entry["path"] in content_lookup:
            logger.info(
                "No pages matched by any pattern — falling back to single-page "
                "analysis rooted at %s",
                entry["path"],
            )
            pages = [DiscoveredPage(
                name="Home",
                path=entry["path"],
                route="/",
                framework="spa",
            )]
            framework = "spa"
        else:
            logger.warning(
                "No pages detected. This repo may not use a traditional pages "
                "structure and no React entry file (App.*, main.*, index.*) was "
                "found either."
            )

    # Resolve dependencies for each page
    dependency_map: dict[str, list[dict]] = {}
    for page in pages:
        page_content = content_lookup.get(page.path, "")
        dependency_map[page.path] = _resolve_imports(page.path, page_content, files)

    logger.info(
        "Discovered %d pages (%s framework) across %d total files",
        len(pages), framework, len(file_tree),
    )

    return pages, framework, dependency_map
