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


async def take_screenshot_b64_with_error_check(url: str) -> tuple[str, bool]:
    """Take a screenshot and check if the page shows a build/runtime error.

    Returns (base64_screenshot, has_error).
    """
    logger.info("Taking screenshot (with error check) of %s", url)
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        try:
            await page.goto(url, wait_until="networkidle", timeout=30000)
            await page.wait_for_timeout(1500)

            # Check for common error indicators in the page
            has_error = False
            try:
                page_text = await page.inner_text("body")
                error_signals = [
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
                ]
                for signal in error_signals:
                    if signal in page_text:
                        logger.warning("Error detected in page: '%s'", signal)
                        has_error = True
                        break
            except Exception:
                pass

            screenshot = await page.screenshot(type="png", full_page=True)
            return base64.b64encode(screenshot).decode("utf-8"), has_error
        finally:
            await browser.close()


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
