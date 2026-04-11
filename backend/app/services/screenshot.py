import base64
import io
import logging

logger = logging.getLogger(__name__)

_MAX_IMAGE_BYTES = 4 * 1024 * 1024   # 4 MB — stay safely under Claude's 5 MB limit
_MAX_DIMENSION   = 7000               # stay under Claude's 8000 px per-dimension limit


def _compress_to_jpeg(png_bytes: bytes, quality: int = 85) -> bytes:
    """Convert PNG bytes to JPEG, downscaling if needed to stay within Claude limits."""
    from PIL import Image
    img = Image.open(io.BytesIO(png_bytes)).convert("RGB")

    # Downscale if either dimension exceeds the limit
    w, h = img.size
    if w > _MAX_DIMENSION or h > _MAX_DIMENSION:
        ratio = min(_MAX_DIMENSION / w, _MAX_DIMENSION / h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)

    # Encode as JPEG, reducing quality until under the byte limit
    for q in (quality, 75, 60, 45):
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=q, optimize=True)
        data = buf.getvalue()
        if len(data) <= _MAX_IMAGE_BYTES:
            return data

    # Last resort: scale down to half size
    img = img.resize((img.width // 2, img.height // 2), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=45, optimize=True)
    return buf.getvalue()



async def take_screenshot_b64(url: str) -> str:
    """Take a screenshot of a URL and return base64-encoded PNG."""
    logger.info("Taking screenshot of %s", url)
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        try:
            await page.goto(url, wait_until="networkidle", timeout=30000)
            await page.wait_for_timeout(2000)

            # Check if the page is blank (white/empty body)
            body_html = await page.inner_html("body")
            if len(body_html.strip()) < 50:
                logger.warning("Page body is nearly empty (%d chars) — app may need env vars to render", len(body_html.strip()))

            screenshot = await page.screenshot(type="png", full_page=True)
            return base64.b64encode(screenshot).decode("utf-8")
        finally:
            await browser.close()


_ERROR_SIGNALS = (
    "Build Error",
    "Failed to compile",
    "Syntax Error",
    "SyntaxError",
    "Unexpected token",
    "Module not found",
    "Cannot find module",
    "Unhandled Runtime Error",
    "Application error",
    "Internal Server Error",
    "TypeError:",
    "ReferenceError:",
)


async def take_screenshot_b64_with_error_check(url: str) -> tuple[str, bool]:
    """Take a screenshot and check if the page shows a build/runtime error.

    Next.js renders its dev error overlay inside a `<nextjs-portal>` web
    component that uses a *closed* shadow root — `inner_text('body')` cannot
    see the overlay text, so we combine four signals:

      1. Browser console errors (pageerror + console.error listeners).
      2. Playwright text locators, which pierce most shadow roots.
      3. Direct body innerText (for non-overlay runtime errors).
      4. Document title (Next.js sets it to "Build Error" on compile failure).

    Returns (base64_screenshot, has_error).
    """
    logger.info("Taking screenshot (with error check) of %s", url)
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 900})

        console_errors: list[str] = []

        def _on_console(msg):
            try:
                if msg.type == "error":
                    console_errors.append(msg.text or "")
            except Exception:
                pass

        def _on_page_error(err):
            try:
                console_errors.append(str(err))
            except Exception:
                pass

        page.on("console", _on_console)
        page.on("pageerror", _on_page_error)

        try:
            await page.goto(url, wait_until="networkidle", timeout=30000)
            # Give the dev server time to surface the overlay after HMR.
            await page.wait_for_timeout(2500)

            has_error = await _detect_dev_overlay_error(page, console_errors)

            screenshot = await page.screenshot(type="png", full_page=True)
            return base64.b64encode(screenshot).decode("utf-8"), has_error
        finally:
            await browser.close()


async def _detect_dev_overlay_error(page, console_errors: list[str]) -> bool:
    """Return True if the page shows a Next.js / Vite build or runtime error."""
    # 1. Console errors captured during navigation — Next.js always logs
    #    "Failed to compile" / "SyntaxError" to the browser console before
    #    rendering the overlay, so this is the most reliable signal.
    for text in console_errors:
        if any(sig in text for sig in _ERROR_SIGNALS):
            logger.warning("Build error detected via console: %s", text[:200])
            return True

    # 2. Playwright text locator — pierces open shadow roots and iframes.
    for sig in _ERROR_SIGNALS:
        try:
            if await page.get_by_text(sig, exact=False).count() > 0:
                logger.warning("Build error detected via text locator: '%s'", sig)
                return True
        except Exception:
            pass

    # 3. Document title — Next.js sets this on compilation failure.
    try:
        title = await page.title()
        if title and any(sig in title for sig in _ERROR_SIGNALS):
            logger.warning("Build error detected via document title: '%s'", title)
            return True
    except Exception:
        pass

    # 4. Last-resort body innerText.
    try:
        body_text = await page.inner_text("body")
        if any(sig in body_text for sig in _ERROR_SIGNALS):
            logger.warning("Build error detected via body innerText")
            return True
    except Exception:
        pass

    return False


async def take_screenshot_with_css_b64(url: str, css_patch: str) -> str:
    """Load a URL, inject a CSS patch, and return a base64-encoded PNG screenshot."""
    logger.info("Taking CSS-patched screenshot of %s (%d chars CSS)", url, len(css_patch))
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        try:
            await page.goto(url, wait_until="networkidle", timeout=30000)
            await page.wait_for_timeout(1500)
            await page.add_style_tag(content=css_patch)
            await page.wait_for_timeout(500)
            screenshot = await page.screenshot(type="png", full_page=True)
            return base64.b64encode(screenshot).decode("utf-8")
        finally:
            await browser.close()
