"""Tests for the esbuild-backed TSX parser validator.

These tests are skipped gracefully when esbuild isn't available on PATH,
so they stay green in CI environments without Node + esbuild installed.
"""

from __future__ import annotations

import shutil

import pytest

from app.services.js_parser_validator import (
    _summarize_esbuild_error,
    validate_jsx_parseable,
)

_esbuild_available = shutil.which("esbuild") is not None
needs_esbuild = pytest.mark.skipif(
    not _esbuild_available,
    reason="esbuild binary not installed in this environment",
)


class TestSummarizeEsbuildError:
    """The summarizer is pure and should run everywhere."""

    def test_collapses_blocks_and_strips_box_drawing(self):
        stderr = (
            "✘ [ERROR] Expected \">\" but found end of file\n"
            "\n"
            "    <stdin>:2:0:\n"
            "      2 │ \n"
            "        │ ^\n"
            "        ╵ >\n"
        )
        summary = _summarize_esbuild_error(stderr)
        assert 'Expected ">"' in summary
        assert "end of file" in summary
        # No bare box-drawing lines should survive.
        assert "╵" not in summary
        assert len(summary) < 200

    def test_caps_length(self):
        huge = "error " * 500
        summary = _summarize_esbuild_error(huge)
        assert len(summary) <= 501  # 500 chars + ellipsis

    def test_takes_first_block_only(self):
        stderr = "first error block\n\nsecond error block"
        summary = _summarize_esbuild_error(stderr)
        assert "first error" in summary
        assert "second error" not in summary


@needs_esbuild
class TestValidateJsxParseable:
    def test_rejects_empty(self):
        ok, err = validate_jsx_parseable("")
        assert ok is False
        assert "Empty" in err

    def test_accepts_valid_tsx_component(self):
        code = """
export default function Page() {
  const users = 42
  return (
    <div className="p-4">
      <h1>Hello, {users} users</h1>
      <button onClick={() => console.log('hi')}>Click</button>
    </div>
  )
}
"""
        ok, err = validate_jsx_parseable(code)
        assert ok, f"esbuild rejected valid TSX: {err}"
        assert err == ""

    def test_accepts_typescript_generics(self):
        code = """
function identity<T extends { id: string }>(x: T): T { return x }
export const a = identity({ id: 'x' })
"""
        ok, err = validate_jsx_parseable(code)
        assert ok, f"esbuild rejected valid TS generics: {err}"

    def test_rejects_unterminated_jsx_tag(self):
        code = "export default () => <div><h1>hi</h1"
        ok, err = validate_jsx_parseable(code)
        assert ok is False
        assert err  # non-empty message

    def test_rejects_unterminated_string_inside_jsx_expression(self):
        code = 'export default () => <div>{"hello</div>'
        ok, err = validate_jsx_parseable(code)
        assert ok is False
        assert err

    def test_rejects_stray_python_style_f_string(self):
        # Lexically this should fail because `f"..."` isn't valid at that position.
        code = "const x = f\"hello {name}\""
        ok, err = validate_jsx_parseable(code)
        assert ok is False

    def test_error_message_is_reasonably_short(self):
        code = "const x = <div><span></div>"  # mismatched closing tag
        ok, err = validate_jsx_parseable(code)
        assert ok is False
        assert len(err) < 500
