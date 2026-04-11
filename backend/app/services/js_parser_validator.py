"""
Real TypeScript/JSX parser validation using esbuild.

The regex-based `syntax_validator` catches obvious Python-style slips
(tuples, f-strings, `print`/`def`) and unbalanced braces. It does NOT
catch a large class of real JavaScript / JSX parse errors: malformed
tags, unterminated strings inside JSX expressions, invalid TypeScript
generics, stray operators, mismatched JSX closing tags, etc.

This validator subprocesses to the installed `esbuild` binary and asks
it to transform the code as TSX with no bundling. If esbuild's parser
accepts the input, the code is guaranteed to at least *parse* — which
is all we need before handing it to the Next.js dev server. If esbuild
rejects the input, its stderr is a concise, line-numbered error message
that we feed straight back to the model as retry feedback.

esbuild is installed globally in the backend Docker image alongside
Node 20. Locally, install via `npm install -g esbuild`.
"""

from __future__ import annotations

import logging
import shutil
import subprocess

logger = logging.getLogger(__name__)

_ESBUILD_TIMEOUT_SECONDS = 8

_warned_missing = False


def _resolve_esbuild() -> str | None:
    """Return the esbuild binary path, or None if not installed.

    shutil.which is fast enough (<1ms) that caching the lookup isn't worth
    the correctness risk of a stale module-level sentinel.
    """
    global _warned_missing
    path = shutil.which("esbuild")
    if not path and not _warned_missing:
        logger.warning(
            "esbuild binary not found on PATH — JSX parser validation will "
            "be skipped. Install with `npm install -g esbuild`."
        )
        _warned_missing = True
    return path


def validate_jsx_parseable(code: str) -> tuple[bool, str]:
    """Parse-check TSX/JSX code with esbuild.

    Returns (is_valid, error_message). On missing esbuild binary or
    subprocess failures unrelated to parse errors, this is intentionally
    lenient — it returns (True, "") so the upstream regex validator and
    the downstream dev-server build remain the last line of defense.
    Only returns False when esbuild actually runs and reports a parse
    error.
    """
    if not code or not code.strip():
        return False, "Empty code."

    esbuild = _resolve_esbuild()
    if not esbuild:
        return True, ""  # lenient — missing binary is an env problem, not a code problem

    try:
        proc = subprocess.run(
            [
                esbuild,
                "--loader=tsx",
                "--log-level=error",
                # Transform mode (no --bundle) — esbuild still runs its full
                # parser and reports syntax errors on stderr, which is all we
                # need. --bundle=false is not a valid transform flag.
            ],
            input=code,
            capture_output=True,
            text=True,
            timeout=_ESBUILD_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        logger.warning("esbuild parser timed out after %ds — treating as valid", _ESBUILD_TIMEOUT_SECONDS)
        return True, ""
    except (OSError, ValueError) as e:
        logger.warning("esbuild parser subprocess failed: %s — treating as valid", e)
        return True, ""

    if proc.returncode == 0:
        return True, ""

    # Non-zero exit: esbuild found errors. stderr is the authoritative source.
    stderr = (proc.stderr or "").strip()
    if not stderr:
        # Fell through to a non-zero exit without a message. Unusual, but
        # don't block on it.
        return True, ""

    summary = _summarize_esbuild_error(stderr)
    return False, summary


def _summarize_esbuild_error(stderr: str) -> str:
    """Collapse esbuild's multi-line error output into a compact,
    model-feedable summary. Keeps the first error block (esbuild can emit
    many), trims ANSI-ish markers, and caps length so prompt tokens stay sane.
    """
    # esbuild error blocks are separated by blank lines. Take the first.
    blocks = [b.strip() for b in stderr.split("\n\n") if b.strip()]
    first = blocks[0] if blocks else stderr

    # Strip purely decorative lines (all spaces + box drawing characters).
    cleaned_lines: list[str] = []
    for line in first.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        # Drop lines that are just box-drawing / caret markers with no text.
        if all(ch in "│╵▲ ^~" for ch in stripped):
            continue
        cleaned_lines.append(stripped)

    cleaned = " ".join(cleaned_lines)
    if len(cleaned) > 500:
        cleaned = cleaned[:500] + "…"
    return cleaned
