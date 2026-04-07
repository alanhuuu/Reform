"""Tests for competitor_analyzer.py — parallel execution, fallback behavior."""
from unittest.mock import MagicMock, call, patch

import pytest

from app.schemas.competitors import CompetitorAnalysisResponse
from app.services.competitor_analyzer import analyze_competitors
from app.services.mock_competitors import MOCK_RESPONSE, mock_site_analysis


MOCK_SITE_RESULT_A = {
    "url": "https://github.com",
    "raw_analysis": {"page_type": "developer_platform", "layout": ["sticky_nav"]},
}
MOCK_SITE_RESULT_B = {
    "url": "https://railway.app",
    "raw_analysis": {"page_type": "devtool", "layout": ["hero_section"]},
}


class TestAnalyzeCompetitors:
    def test_all_urls_succeed_calls_aggregate(self, mock_competitor_response):
        """All TinyFish calls succeed → aggregate_patterns is called with all results."""
        with (
            patch("app.services.competitor_analyzer.extract_site_data") as mock_extract,
            patch("app.services.competitor_analyzer.aggregate_patterns") as mock_aggregate,
        ):
            mock_extract.side_effect = [MOCK_SITE_RESULT_A, MOCK_SITE_RESULT_B]
            mock_aggregate.return_value = mock_competitor_response

            result = analyze_competitors(
                ["https://github.com", "https://railway.app"], "railway_style"
            )

        assert isinstance(result, CompetitorAnalysisResponse)
        mock_aggregate.assert_called_once()
        # The style_goal is passed through
        _, call_kwargs = mock_aggregate.call_args
        args = mock_aggregate.call_args.args
        assert args[1] == "railway_style"

    def test_all_results_passed_to_aggregate(self, mock_competitor_response):
        """All site analyses (in any order) reach aggregate_patterns."""
        with (
            patch("app.services.competitor_analyzer.extract_site_data") as mock_extract,
            patch("app.services.competitor_analyzer.aggregate_patterns") as mock_aggregate,
        ):
            mock_extract.side_effect = [MOCK_SITE_RESULT_A, MOCK_SITE_RESULT_B]
            mock_aggregate.return_value = mock_competitor_response

            analyze_competitors(["https://github.com", "https://railway.app"], "")

        site_analyses = mock_aggregate.call_args.args[0]
        urls_in_analyses = {s["url"] for s in site_analyses}
        assert urls_in_analyses == {"https://github.com", "https://railway.app"}

    def test_partial_failure_skips_failed_site(self, mock_competitor_response):
        """When one URL fails, analysis continues with only the successful site."""
        def side_effect(url):
            if "github" in url:
                raise RuntimeError("TinyFish timeout")
            return MOCK_SITE_RESULT_B

        with (
            patch("app.services.competitor_analyzer.extract_site_data", side_effect=side_effect),
            patch("app.services.competitor_analyzer.aggregate_patterns") as mock_aggregate,
        ):
            mock_aggregate.return_value = mock_competitor_response

            result = analyze_competitors(["https://github.com", "https://railway.app"], "")

        # aggregate called with only the 1 successful analysis
        site_analyses = mock_aggregate.call_args.args[0]
        assert len(site_analyses) == 1

    def test_all_failures_raises_error(self, mock_competitor_response):
        """All extractions fail → raises RuntimeError (no mock fallback)."""
        with (
            patch("app.services.competitor_analyzer.extract_site_data",
                  side_effect=RuntimeError("failed")),
        ):
            with pytest.raises(RuntimeError, match="All competitor sites failed"):
                analyze_competitors(["https://github.com", "https://railway.app"], "")

    def test_single_url_success(self, mock_competitor_response):
        with (
            patch("app.services.competitor_analyzer.extract_site_data",
                  return_value=MOCK_SITE_RESULT_A),
            patch("app.services.competitor_analyzer.aggregate_patterns",
                  return_value=mock_competitor_response),
        ):
            result = analyze_competitors(["https://github.com"], "test_goal")

        assert isinstance(result, CompetitorAnalysisResponse)

    def test_parallel_results_not_corrupted(self, mock_competitor_response):
        """Each URL's result maps back to the correct URL (no thread-level corruption)."""
        def slow_extract(url):
            import time
            time.sleep(0.001)  # tiny sleep to encourage interleaving
            return {"url": url, "raw_analysis": {"page_type": f"type_for_{url}"}}

        urls = [f"https://site{i}.com" for i in range(4)]

        with (
            patch("app.services.competitor_analyzer.extract_site_data",
                  side_effect=slow_extract),
            patch("app.services.competitor_analyzer.aggregate_patterns") as mock_aggregate,
        ):
            mock_aggregate.return_value = mock_competitor_response
            analyze_competitors(urls, "")

        site_analyses = mock_aggregate.call_args.args[0]
        result_urls = {s["url"] for s in site_analyses}
        # Every URL must appear exactly once
        assert result_urls == set(urls)

    def test_returns_competitor_analysis_response(self, mock_competitor_response):
        with (
            patch("app.services.competitor_analyzer.extract_site_data",
                  return_value=MOCK_SITE_RESULT_A),
            patch("app.services.competitor_analyzer.aggregate_patterns",
                  return_value=mock_competitor_response),
        ):
            result = analyze_competitors(["https://github.com"], "")

        assert isinstance(result, CompetitorAnalysisResponse)

    def test_style_goal_forwarded_to_aggregate(self, mock_competitor_response):
        with (
            patch("app.services.competitor_analyzer.extract_site_data",
                  return_value=MOCK_SITE_RESULT_A),
            patch("app.services.competitor_analyzer.aggregate_patterns") as mock_aggregate,
        ):
            mock_aggregate.return_value = mock_competitor_response
            analyze_competitors(["https://github.com"], "custom_goal")

        assert mock_aggregate.call_args.args[1] == "custom_goal"


# ─── mock_site_analysis factory ───────────────────────────────────────────────

class TestMockSiteAnalysis:
    def test_returns_url_and_raw_analysis_keys(self):
        result = mock_site_analysis("https://example.com")
        assert "url" in result
        assert "raw_analysis" in result

    def test_url_matches_input(self):
        result = mock_site_analysis("https://my-site.io")
        assert result["url"] == "https://my-site.io"

    def test_raw_analysis_has_page_type(self):
        result = mock_site_analysis("https://example.com")
        assert "page_type" in result["raw_analysis"]

    def test_raw_analysis_has_design_tokens(self):
        result = mock_site_analysis("https://example.com")
        assert "design_tokens" in result["raw_analysis"]

    def test_raw_analysis_has_typography(self):
        result = mock_site_analysis("https://example.com")
        assert "typography" in result["raw_analysis"]

    def test_raw_analysis_has_all_expected_fields(self):
        from app.services.tinyfish_client import EXPECTED_FIELDS
        result = mock_site_analysis("https://example.com")
        analysis = result["raw_analysis"]
        for field in EXPECTED_FIELDS:
            assert field in analysis, f"Expected field '{field}' missing from mock"
