import os
import re
import json
import urllib.request
import urllib.error
from fastapi import APIRouter, Header, HTTPException, Query

router = APIRouter()


def _parse_owner_repo(repo_url: str):
    match = re.match(r'https?://github\.com/([^/]+)/([^/]+?)(?:\.git)?(?:/.*)?$', repo_url)
    if not match:
        raise HTTPException(status_code=400, detail="Invalid GitHub URL. Expected https://github.com/owner/repo")
    return match.group(1), match.group(2)


def _fetch_tree(owner: str, repo: str, access_token: str | None = None, branch: str = "HEAD"):
    url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1"
    req = urllib.request.Request(url)
    req.add_header("Accept", "application/vnd.github.v3+json")
    req.add_header("User-Agent", "RefineUI/1.0")
    token = access_token or os.environ.get("GITHUB_TOKEN")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise HTTPException(status_code=404, detail="Repository not found")
        raise HTTPException(status_code=502, detail=f"GitHub API error: {e.code}")
    except urllib.error.URLError as e:
        raise HTTPException(status_code=502, detail=f"GitHub API unreachable: {e.reason}")


def _is_app_router_page(path: str) -> bool:
    """Match app/**/page.[jt]sx? with any leading prefix (e.g. src/, frontend/)"""
    return bool(re.match(r'^(?:[^/]+/)*app/.*page\.[jt]sx?$', path))


def _is_pages_router_page(path: str) -> bool:
    """Match pages/**/*.[jt]sx? with any leading prefix, excluding _app, _document, api/"""
    if not re.match(r'^(?:[^/]+/)*pages/.*\.[jt]sx?$', path):
        return False
    inner = re.sub(r'^(?:[^/]+/)*pages/', '', path)
    if inner.startswith('_app') or inner.startswith('_document'):
        return False
    if inner.startswith('api/'):
        return False
    return True


_EXCLUDED_ROUTES = {
    '/signin', '/signup', '/login', '/register', '/logout',
    '/auth', '/callback', '/verify', '/reset-password', '/forgot-password',
    '/settings', '/account', '/subscription', '/billing', '/checkout',
    '/404', '/500', '/not-found',
}

_EXCLUDED_PREFIXES = ('/api/', '/auth/')


def _is_excluded_route(route: str) -> bool:
    if route in _EXCLUDED_ROUTES:
        return True
    return any(route.startswith(p) for p in _EXCLUDED_PREFIXES)


def _segment_label(seg: str) -> str:
    """Title-case a segment, replacing - and _ with spaces."""
    return seg.replace('-', ' ').replace('_', ' ').title()


def _app_router_label(path: str) -> tuple:
    """Convert an App Router page path to a (label, route) tuple."""
    # Strip any leading prefix up to and including app/, then strip /page.[jt]sx?
    inner = re.sub(r'^(?:[^/]+/)*app/', '', path)
    inner = re.sub(r'/page\.[jt]sx?$', '', inner)
    inner = re.sub(r'^page\.[jt]sx?$', '', inner)
    # inner is now the directory path (empty string for root)
    if inner == '':
        return ('Home', '/')
    # Split into segments and process
    segments = inner.split('/')
    labels = []
    route_parts = []
    for seg in segments:
        # Strip route groups like (groupname) entirely from both label and route
        if re.match(r'^\(.*\)$', seg):
            continue
        # Skip dynamic segments like [param] — can't iframe without real ID
        if re.match(r'^\[.*\]$', seg):
            return None
        labels.append(_segment_label(seg))
        route_parts.append(seg)
    if not labels:
        return ('Home', '/')
    label = ' / '.join(labels)
    route = '/' + '/'.join(route_parts)
    return (label, route)


def _pages_router_label(path: str) -> tuple:
    """Convert a Pages Router page path to a (label, route) tuple."""
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
    """Match SPA page patterns: files in pages/views/screens/routes dirs,
    or PascalCase files ending in Page/Screen/View/Route."""
    if not re.search(r'\.[jt]sx?$', path):
        return False
    basename = path.split('/')[-1]
    if basename.startswith('_') or basename in ('index.js', 'index.jsx', 'index.ts', 'index.tsx'):
        return False
    if 'test' in basename.lower() or 'spec' in basename.lower():
        return False
    if basename in ('App.js', 'App.jsx', 'App.tsx', 'App.ts',
                    'main.tsx', 'main.jsx', 'main.ts', 'main.js',
                    'setupTests.js', 'reportWebVitals.js', 'firebase.js', 'vite-env.d.ts'):
        return False
    # Next.js src/pages/ is handled by _is_pages_router_page — skip here
    if '/src/pages/' not in path and not path.startswith('src/pages/'):
        page_dirs = re.compile(r'(?:^|/)(?:pages|views|screens|routes)/')
        if page_dirs.search(path):
            return True
    name_no_ext = re.sub(r'\.[jt]sx?$', '', basename)
    if re.match(r'^[A-Z][A-Za-z0-9]*(Page|Screen|View|Route)$', name_no_ext):
        return True
    return False


def _spa_page_label(path: str) -> tuple | None:
    """Convert a SPA page path to a (label, route) tuple."""
    basename = path.split('/')[-1]
    name = re.sub(r'\.[jt]sx?$', '', basename)
    if name.startswith('[') or name.startswith('_'):
        return None
    spaced = re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', name)
    label = _segment_label(spaced)
    route = f"/{name}"
    if name.lower() in ('home', 'homepage', 'landing', 'main'):
        route = "/"
    return (label, route)


@router.get("/repo-pages")
def get_repo_pages(
    repo_url: str = Query(..., alias="repo_url"),
    branch: str = Query(default="HEAD"),
    authorization: str | None = Header(default=None),
):
    access_token: str | None = None
    if authorization and authorization.startswith("Bearer "):
        access_token = authorization[len("Bearer "):]
    owner, repo = _parse_owner_repo(repo_url)
    tree_data = _fetch_tree(owner, repo, access_token, branch)

    tree = tree_data.get("tree", [])
    seen_routes = set()
    pages = []

    for item in tree:
        if item.get("type") != "blob":
            continue
        path = item.get("path", "")

        if _is_app_router_page(path):
            result = _app_router_label(path)
        elif _is_pages_router_page(path):
            result = _pages_router_label(path)
        elif _is_spa_page(path):
            result = _spa_page_label(path)
        else:
            continue

        if result is None:
            continue

        label, route = result
        if route not in seen_routes and not _is_excluded_route(route):
            seen_routes.add(route)
            pages.append({"label": label, "route": route})

    if not pages:
        raise HTTPException(status_code=404, detail="No pages found in this repository")

    return {"pages": pages}
