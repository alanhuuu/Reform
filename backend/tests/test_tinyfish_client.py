"""Tests for tinyfish_client.py — private helpers and the async extract_site_data."""
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tinyfish import RunStatus

from app.services.tinyfish_client import (
    BORDER_DEFAULTS,
    EXPECTED_FIELDS,
    MOTION_DEFAULTS,
    REQUIRED_COLOR_KEYS,
    SHADOW_DEFAULTS,
    TYPOGRAPHY_DEFAULTS,
    _ensure_design_tokens,
    _ensure_typography,
    _get_api_key,
    _normalize,
    clear_cache,
    extract_site_data,
)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _make_async_tinyfish_mock(
    result=None,
    status=RunStatus.COMPLETED,
    error=None,
    steps: int = 7,
):
    """Build a mock AsyncTinyFish whose agent.run() returns a configured response."""
    response = MagicMock()
    response.status = status
    response.result = result
    response.error = error
    response.num_of_steps = steps

    run_mock = AsyncMock(return_value=response)

    client = MagicMock()
    client.agent = MagicMock()
    client.agent.run = run_mock
    return client, run_mock


@pytest.fixture(autouse=True)
def _reset_tinyfish_state(monkeypatch):
    """Each test gets a fresh cache and a sanitised module state so the
    lazily-built AsyncTinyFish singleton can't leak across tests."""
    import app.services.tinyfish_client as tf
    tf._client = None
    tf._semaphore = None
    clear_cache()
    # Point S3 cache helpers at no-op stubs so we never hit the real bucket.
    monkeypatch.setattr(tf, "download_tinyfish_cache", lambda *a, **kw: None)
    monkeypatch.setattr(tf, "upload_tinyfish_cache", lambda *a, **kw: None)
    yield
    tf._client = None
    tf._semaphore = None
    clear_cache()


FULL_ANALYSIS = {
    "page_type": "dashboard",
    "layout": ["sticky_nav"],
    "visual_style": ["dark_theme"],
    "components": {
        "navbar": ["fixed_top"], "hero": ["not_present"], "cards": ["rounded"],
        "buttons": ["primary"], "workspace": ["three_panel"], "forms_controls": ["minimal"],
    },
    "typography": {
        "font_family": "Inter, sans-serif",
        "font_mono": "JetBrains Mono, monospace",
        "scale": ["12px", "14px", "16px", "20px", "24px", "32px", "48px"],
        "weight_normal": "400",
        "weight_medium": "500",
        "weight_bold": "700",
    },
    "design_tokens": {
        "theme": "dark",
        "colors": {
            "background": "#000",
            "surface": "#111",
            "text_primary": "#fff",
            "text_secondary": "#888",
            "accent_primary": "#5555ff",
            "border": "rgba(255,255,255,0.1)",
        },
        "shadow": {"sm": "0 1px 2px rgba(0,0,0,0.3)", "md": "0 4px 8px rgba(0,0,0,0.3)", "lg": "0 8px 24px rgba(0,0,0,0.4)"},
        "border": {"default": "1px solid rgba(255,255,255,0.1)"},
        "motion": {"duration_fast": "150ms", "duration_normal": "200ms", "easing": "ease-out"},
        "density": "compact",
    },
    "ux_flow": ["land_on_hero"],
    "ux_quality": ["clean_layout"],
}


# ─── _get_api_key ─────────────────────────────────────────────────────────────

class TestGetApiKey:
    def test_returns_key_when_set(self, monkeypatch):
        monkeypatch.setenv("TINYFISH_API_KEY", "test-key-123")
        assert _get_api_key() == "test-key-123"

    def test_raises_when_missing(self, monkeypatch):
        monkeypatch.delenv("TINYFISH_API_KEY", raising=False)
        with pytest.raises(RuntimeError, match="TINYFISH_API_KEY"):
            _get_api_key()


# ─── _ensure_typography ───────────────────────────────────────────────────────

class TestEnsureTypography:
    def test_string_input_converted_to_dict(self):
        data = {"typography": "Inter, system-ui"}
        _ensure_typography(data, "https://example.com")
        assert isinstance(data["typography"], dict)
        assert data["typography"]["font_family"] == "Inter, system-ui"
        # Other defaults filled in
        for key in TYPOGRAPHY_DEFAULTS:
            if key != "font_family":
                assert key in data["typography"]

    def test_none_input_injects_defaults(self):
        data = {}
        _ensure_typography(data, "https://example.com")
        assert data["typography"] == TYPOGRAPHY_DEFAULTS

    def test_non_dict_non_string_injects_defaults(self):
        data = {"typography": 42}
        _ensure_typography(data, "https://example.com")
        assert data["typography"] == TYPOGRAPHY_DEFAULTS

    def test_partial_dict_fills_missing_keys(self):
        data = {"typography": {"font_family": "Roboto, sans-serif"}}
        _ensure_typography(data, "https://example.com")
        typo = data["typography"]
        assert typo["font_family"] == "Roboto, sans-serif"
        assert typo["font_mono"] == TYPOGRAPHY_DEFAULTS["font_mono"]
        assert typo["scale"] == TYPOGRAPHY_DEFAULTS["scale"]
        assert typo["weight_normal"] == TYPOGRAPHY_DEFAULTS["weight_normal"]

    def test_complete_dict_unchanged(self):
        complete = {
            "font_family": "Custom Font",
            "font_mono": "Custom Mono",
            "scale": ["10px", "12px"],
            "weight_normal": "300",
            "weight_medium": "400",
            "weight_bold": "600",
        }
        data = {"typography": complete.copy()}
        _ensure_typography(data, "https://example.com")
        assert data["typography"] == complete


# ─── _ensure_design_tokens ────────────────────────────────────────────────────

class TestEnsureDesignTokens:
    def test_missing_design_tokens_injects_minimal_defaults(self):
        data = {}
        _ensure_design_tokens(data, "https://example.com")
        tokens = data["design_tokens"]
        assert tokens["theme"] == "dark"
        assert isinstance(tokens["colors"], dict)
        assert "shadow" in tokens
        assert "border" in tokens
        assert "motion" in tokens

    def test_non_dict_design_tokens_replaced(self):
        data = {"design_tokens": "some string value"}
        _ensure_design_tokens(data, "https://example.com")
        assert isinstance(data["design_tokens"], dict)

    def test_non_dict_colors_replaced_with_empty_dict(self):
        data = {"design_tokens": {"colors": "red, blue", "density": "compact"}}
        _ensure_design_tokens(data, "https://example.com")
        assert isinstance(data["design_tokens"]["colors"], dict)

    # --- accent migration (regression) ---
    def test_accent_migrated_to_accent_primary(self):
        data = {
            "design_tokens": {
                "colors": {"accent": "#5555ff"},
                "density": "compact",
            }
        }
        _ensure_design_tokens(data, "https://example.com")
        colors = data["design_tokens"]["colors"]
        assert "accent_primary" in colors
        assert colors["accent_primary"] == "#5555ff"
        assert "accent" not in colors

    def test_accent_not_migrated_when_accent_primary_already_exists(self):
        data = {
            "design_tokens": {
                "colors": {"accent": "#old", "accent_primary": "#new"},
                "density": "compact",
            }
        }
        _ensure_design_tokens(data, "https://example.com")
        colors = data["design_tokens"]["colors"]
        assert colors["accent_primary"] == "#new"
        assert colors["accent"] == "#old"  # not consumed

    # --- shadow handling (regression: TinyFish SDK result field issue) ---
    def test_string_shadow_replaced_with_css_structured_defaults(self):
        data = {"design_tokens": {"colors": {}, "shadow": "subtle", "density": "compact"}}
        _ensure_design_tokens(data, "https://example.com")
        shadow = data["design_tokens"]["shadow"]
        assert isinstance(shadow, dict)
        assert shadow == SHADOW_DEFAULTS

    def test_shadow_dict_missing_lg_key_replaced(self):
        # Regression test: incomplete shadow dict must be fully replaced
        data = {
            "design_tokens": {
                "colors": {},
                "shadow": {"sm": "0 1px 2px rgba(0,0,0,0.3)", "md": "0 4px 8px rgba(0,0,0,0.3)"},
                "density": "compact",
            }
        }
        _ensure_design_tokens(data, "https://example.com")
        shadow = data["design_tokens"]["shadow"]
        assert "lg" in shadow

    def test_complete_shadow_dict_preserved(self):
        custom = {"sm": "custom_sm", "md": "custom_md", "lg": "custom_lg"}
        data = {"design_tokens": {"colors": {}, "shadow": custom, "density": "compact"}}
        _ensure_design_tokens(data, "https://example.com")
        assert data["design_tokens"]["shadow"] == custom

    def test_shadow_style_key_consumed_when_shadow_missing(self):
        # Old format: "shadow_style" string key instead of "shadow" dict
        data = {
            "design_tokens": {
                "colors": {},
                "shadow_style": "subtle_soft",
                "density": "compact",
            }
        }
        _ensure_design_tokens(data, "https://example.com")
        tokens = data["design_tokens"]
        assert "shadow_style" not in tokens
        assert isinstance(tokens["shadow"], dict)
        assert set(tokens["shadow"].keys()) == {"sm", "md", "lg"}

    # --- border handling ---
    def test_string_border_replaced_with_defaults(self):
        data = {"design_tokens": {"colors": {}, "border": "1px solid gray", "density": "compact"}}
        _ensure_design_tokens(data, "https://example.com")
        border = data["design_tokens"]["border"]
        assert isinstance(border, dict)
        assert "default" in border

    def test_border_dict_missing_default_key_replaced(self):
        data = {
            "design_tokens": {
                "colors": {},
                "border": {"some_other_key": "value"},
                "density": "compact",
            }
        }
        _ensure_design_tokens(data, "https://example.com")
        assert "default" in data["design_tokens"]["border"]

    def test_complete_border_preserved(self):
        custom = {"default": "1px solid rgba(0,0,0,0.2)"}
        data = {"design_tokens": {"colors": {}, "border": custom, "density": "compact"}}
        _ensure_design_tokens(data, "https://example.com")
        assert data["design_tokens"]["border"] == custom

    def test_border_style_key_consumed_when_border_missing(self):
        data = {
            "design_tokens": {
                "colors": {},
                "border_style": "thin_opacity",
                "density": "compact",
            }
        }
        _ensure_design_tokens(data, "https://example.com")
        tokens = data["design_tokens"]
        assert "border_style" not in tokens
        assert isinstance(tokens["border"], dict)
        assert "default" in tokens["border"]

    # --- motion ---
    def test_missing_motion_injected(self):
        data = {"design_tokens": {"colors": {}, "density": "compact"}}
        _ensure_design_tokens(data, "https://example.com")
        motion = data["design_tokens"]["motion"]
        assert motion == MOTION_DEFAULTS

    def test_existing_motion_preserved(self):
        custom = {"duration_fast": "100ms", "duration_normal": "300ms", "easing": "linear"}
        data = {"design_tokens": {"colors": {}, "motion": custom, "density": "compact"}}
        _ensure_design_tokens(data, "https://example.com")
        assert data["design_tokens"]["motion"] == custom

    def test_non_dict_motion_replaced(self):
        data = {"design_tokens": {"colors": {}, "motion": "fast", "density": "compact"}}
        _ensure_design_tokens(data, "https://example.com")
        assert data["design_tokens"]["motion"] == MOTION_DEFAULTS


# ─── _normalize ───────────────────────────────────────────────────────────────

class TestNormalize:
    def test_valid_json_string_parsed(self):
        payload = json.dumps({"page_type": "test", "typography": {**TYPOGRAPHY_DEFAULTS}, "design_tokens": {"theme": "dark", "colors": {}, "shadow": SHADOW_DEFAULTS, "border": BORDER_DEFAULTS, "motion": MOTION_DEFAULTS, "density": "compact"}})
        result = _normalize(payload, "https://example.com")
        assert result["page_type"] == "test"

    def test_markdown_fenced_json_stripped_and_parsed(self):
        inner = {"page_type": "fenced"}
        raw = f"```json\n{json.dumps(inner)}\n```"
        result = _normalize(raw, "https://example.com")
        assert result["page_type"] == "fenced"
        # normalization applied (design_tokens injected)
        assert "design_tokens" in result

    def test_markdown_fence_without_language_tag(self):
        inner = {"page_type": "no_lang"}
        raw = f"```\n{json.dumps(inner)}\n```"
        result = _normalize(raw, "https://example.com")
        assert result["page_type"] == "no_lang"

    def test_plain_text_wrapped_in_fallback(self):
        result = _normalize("Some descriptive text output", "https://example.com")
        assert result["page_type"] == "unknown"
        assert result["raw_text"] == "Some descriptive text output"
        assert "typography" in result
        assert "design_tokens" in result

    def test_json_list_falls_through_to_fallback(self):
        # JSON that is valid but not a dict → fallback
        result = _normalize(json.dumps([1, 2, 3]), "https://example.com")
        assert result["page_type"] == "unknown"

    def test_normalization_applied_to_parsed_json(self):
        # JSON missing typography and design_tokens → normalization injects them
        payload = json.dumps({"page_type": "minimal"})
        result = _normalize(payload, "https://example.com")
        assert "typography" in result
        assert isinstance(result["typography"], dict)
        assert "design_tokens" in result

    def test_accent_migration_applied_during_normalization(self):
        payload = json.dumps({
            "page_type": "test",
            "design_tokens": {
                "colors": {"accent": "#aabbcc"},
                "density": "compact",
            },
        })
        result = _normalize(payload, "https://example.com")
        colors = result["design_tokens"]["colors"]
        assert "accent_primary" in colors
        assert "accent" not in colors

    def test_whitespace_stripped_before_parsing(self):
        raw = '   {"page_type": "spaced"}   '
        result = _normalize(raw, "https://example.com")
        assert result["page_type"] == "spaced"


# ─── extract_site_data ────────────────────────────────────────────────────────

class TestExtractSiteData:
    URL = "https://example.com"

    @pytest.mark.asyncio
    async def test_success_with_dict_result(self, monkeypatch):
        monkeypatch.setenv("TINYFISH_API_KEY", "test-key")
        mock_client, run_mock = _make_async_tinyfish_mock(result=FULL_ANALYSIS)
        with patch(
            "app.services.tinyfish_client.AsyncTinyFish",
            return_value=mock_client,
        ):
            result = await extract_site_data(self.URL)
        assert result["url"] == self.URL
        assert isinstance(result["raw_analysis"], dict)
        assert result["raw_analysis"]["page_type"] == "dashboard"
        # Verify agent.run was called with the right kwargs
        run_mock.assert_awaited_once()
        kwargs = run_mock.await_args.kwargs
        assert kwargs["url"] == self.URL
        assert "goal" in kwargs

    @pytest.mark.asyncio
    async def test_success_with_string_result(self, monkeypatch):
        """TinyFish returned a string — it should get wrapped in raw_text fallback."""
        monkeypatch.setenv("TINYFISH_API_KEY", "test-key")
        # SDK type says dict|None but the code handles stringy payloads too.
        mock_client, _ = _make_async_tinyfish_mock(result=json.dumps(FULL_ANALYSIS))
        with patch(
            "app.services.tinyfish_client.AsyncTinyFish",
            return_value=mock_client,
        ):
            result = await extract_site_data(self.URL)
        # The string gets treated as raw text → fallback path (not parsed)
        assert result["url"] == self.URL
        assert "raw_analysis" in result

    @pytest.mark.asyncio
    async def test_cancelled_run_raises_runtime_error(self, monkeypatch):
        monkeypatch.setenv("TINYFISH_API_KEY", "test-key")
        mock_client, _ = _make_async_tinyfish_mock(
            status=RunStatus.CANCELLED,
            error="timeout",
        )
        with patch(
            "app.services.tinyfish_client.AsyncTinyFish",
            return_value=mock_client,
        ):
            with pytest.raises(RuntimeError, match="did not complete"):
                await extract_site_data(self.URL)

    @pytest.mark.asyncio
    async def test_failed_run_raises_runtime_error(self, monkeypatch):
        monkeypatch.setenv("TINYFISH_API_KEY", "test-key")
        mock_client, _ = _make_async_tinyfish_mock(
            status=RunStatus.FAILED,
            error="captcha",
        )
        with patch(
            "app.services.tinyfish_client.AsyncTinyFish",
            return_value=mock_client,
        ):
            with pytest.raises(RuntimeError, match="did not complete"):
                await extract_site_data(self.URL)

    @pytest.mark.asyncio
    async def test_empty_result_raises_runtime_error(self, monkeypatch):
        monkeypatch.setenv("TINYFISH_API_KEY", "test-key")
        mock_client, _ = _make_async_tinyfish_mock(result=None)
        with patch(
            "app.services.tinyfish_client.AsyncTinyFish",
            return_value=mock_client,
        ):
            with pytest.raises(RuntimeError, match="no result"):
                await extract_site_data(self.URL)

    @pytest.mark.asyncio
    async def test_missing_api_key_raises_before_call(self, monkeypatch):
        monkeypatch.delenv("TINYFISH_API_KEY", raising=False)
        with pytest.raises(RuntimeError, match="TINYFISH_API_KEY"):
            await extract_site_data(self.URL)

    @pytest.mark.asyncio
    async def test_api_error_propagates(self, monkeypatch):
        """Any exception from the SDK should bubble up to the caller."""
        monkeypatch.setenv("TINYFISH_API_KEY", "test-key")
        mock_client = MagicMock()
        mock_client.agent = MagicMock()
        mock_client.agent.run = AsyncMock(side_effect=RuntimeError("403 Forbidden"))
        with patch(
            "app.services.tinyfish_client.AsyncTinyFish",
            return_value=mock_client,
        ):
            with pytest.raises(RuntimeError, match="403"):
                await extract_site_data(self.URL)

    @pytest.mark.asyncio
    async def test_result_shape_is_url_plus_raw_analysis(self, monkeypatch):
        monkeypatch.setenv("TINYFISH_API_KEY", "test-key")
        mock_client, _ = _make_async_tinyfish_mock(result=FULL_ANALYSIS)
        with patch(
            "app.services.tinyfish_client.AsyncTinyFish",
            return_value=mock_client,
        ):
            result = await extract_site_data(self.URL)
        assert "url" in result
        assert "raw_analysis" in result
        assert len(result) == 2  # only two keys
