"""
Syntax validator for transformed JSX/TSX code produced by Claude.

Claude occasionally slips into Python syntax when generating a file
(tuples where arrays are expected, f-strings, dict literals, `def`/`print`),
or produces unbalanced braces. The dev server will happily run some of
these because they are *valid JavaScript* — for example `("alice", 142)`
is the comma operator and evaluates to `142`, which then crashes React
at runtime when destructured. A parser cannot catch that; targeted
heuristics can.

The validator runs on the model's output *before* the file is patched
into the cloned repo, so the dev server never sees bad code.
"""

from __future__ import annotations

import re


# ── Python-syntax smells ─────────────────────────────────────────────

# Python tuple literal used as an array element, e.g.
#     [("alice", 142), ("bob", 89)]
# which Claude sometimes emits when it means [["alice", 142], ...].
# Match an opening `[` or `,` followed by `("string", number)`.
_PY_TUPLE_IN_ARRAY = re.compile(
    r"""[\[,]\s*\(            # array/list start or element separator, then `(`
        \s*["'][^"'\n]*["']   # a string literal
        \s*,                  # comma inside parens → tuple-ish
        \s*[^)\n]+            # something that isn't `)` (value)
        \)""",
    re.VERBOSE,
)

# Python dict literal: {"key": value, "key2": value}. Distinguishing this
# from a JSX prop object is hard, so we only flag when it appears inside an
# array literal element: `[{"key": ...}, {"key": ...}]`. That's almost
# always Claude emitting Python-style data.
# Note: this ALSO matches valid JS object literals with string keys, which
# is legal JS — so we do NOT flag on its own. We rely on the other smells.

_PY_FSTRING = re.compile(r'''(?<![A-Za-z_$])f["'][^"'\n]*\{''')
_PY_PRINT = re.compile(r"(?<![A-Za-z_$.])print\s*\(")
_PY_DEF = re.compile(r"(?m)^\s*def\s+[A-Za-z_]\w*\s*\(")
_PY_TRUE_NONE = re.compile(r"(?<![A-Za-z_$.])(?:True|False|None)(?![A-Za-z_$])")
_PY_IMPORT = re.compile(r"(?m)^\s*from\s+[A-Za-z_][\w.]*\s+import\s+")


# ── JSX sanity checks ────────────────────────────────────────────────

def _is_balanced(code: str) -> tuple[bool, str]:
    """Quick balance check for `()`, `[]`, `{}` that ignores contents of
    strings and comments. Returns (is_balanced, reason)."""
    stack: list[tuple[str, int]] = []
    pairs = {")": "(", "]": "[", "}": "{"}
    i = 0
    n = len(code)
    line = 1
    while i < n:
        ch = code[i]

        if ch == "\n":
            line += 1
            i += 1
            continue

        # Line comment
        if ch == "/" and i + 1 < n and code[i + 1] == "/":
            while i < n and code[i] != "\n":
                i += 1
            continue

        # Block comment
        if ch == "/" and i + 1 < n and code[i + 1] == "*":
            i += 2
            while i + 1 < n and not (code[i] == "*" and code[i + 1] == "/"):
                if code[i] == "\n":
                    line += 1
                i += 1
            i += 2
            continue

        # String / template literal
        if ch in ("'", '"', "`"):
            quote = ch
            i += 1
            while i < n and code[i] != quote:
                if code[i] == "\\" and i + 1 < n:
                    i += 2
                    continue
                if code[i] == "\n":
                    line += 1
                i += 1
            i += 1
            continue

        if ch in "([{":
            stack.append((ch, line))
        elif ch in ")]}":
            if not stack or stack[-1][0] != pairs[ch]:
                return False, f"Unmatched '{ch}' at line {line}"
            stack.pop()

        i += 1

    if stack:
        opener, opener_line = stack[-1]
        return False, f"Unclosed '{opener}' opened at line {opener_line}"
    return True, ""


# ── Public API ───────────────────────────────────────────────────────

def validate_transformed_code(code: str) -> tuple[bool, str]:
    """Validate a transformed JSX/TSX file.

    Returns (is_valid, error_message). `error_message` is phrased so it
    can be handed back to the model verbatim as retry feedback.
    """
    if not code or not code.strip():
        return False, "Empty code."

    # 1. Python tuple literal inside an array — the exact class of bug
    #    that caused the "number is not iterable" runtime crash.
    m = _PY_TUPLE_IN_ARRAY.search(code)
    if m:
        snippet = m.group(0).strip().replace("\n", " ")[:100]
        return False, (
            f"Python tuple literal detected in an array: `{snippet}`. "
            f"JavaScript has no tuples. Use nested arrays like "
            f"`[['alice', 142], ['bob', 89]]` or objects like "
            f"`[{{ name: 'alice', value: 142 }}, ...]` instead."
        )

    # 2. Python f-strings.
    if _PY_FSTRING.search(code):
        return False, (
            "Python-style f-string detected (e.g., `f\"hello {name}\"`). "
            "Use a JavaScript template literal with backticks instead: "
            "`` `hello ${name}` ``."
        )

    # 3. Python print / def / from-import.
    if _PY_PRINT.search(code):
        return False, "Python `print(...)` call detected. Use `console.log(...)` in JavaScript."
    if _PY_DEF.search(code):
        return False, "Python `def` function definition detected. Use `function name(...) {}` or an arrow function in JavaScript."
    if _PY_IMPORT.search(code):
        return False, "Python `from X import Y` statement detected. Use `import { Y } from 'X'` in JavaScript."

    # 4. Python True/False/None where JS expects true/false/null.
    py_literal_match = _PY_TRUE_NONE.search(code)
    if py_literal_match:
        # Make sure we're not inside a JSDoc or string — balance check
        # already skips those, but this regex doesn't. Do a cheap
        # sanity pass: skip if the match is inside a line comment.
        line_start = code.rfind("\n", 0, py_literal_match.start()) + 1
        line = code[line_start:py_literal_match.end()]
        if "//" not in line[: py_literal_match.start() - line_start]:
            return False, (
                f"Python literal `{py_literal_match.group(0)}` detected. "
                f"Use lowercase `true`, `false`, or `null` in JavaScript."
            )

    # 5. Brace / paren balance.
    balanced, reason = _is_balanced(code)
    if not balanced:
        return False, f"Unbalanced brackets: {reason}."

    return True, ""
