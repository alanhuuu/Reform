"""Integration tests for FastAPI routes.

External dependencies (TinyFish, Anthropic) are mocked at the module boundary.
The real FastAPI request/response cycle, schema validation, and status codes are
all exercised through Starlette's TestClient.
"""
import json
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.schemas.competitors import CompetitorAnalysisResponse
from app.schemas.ui_transform import UITransformResponse
from app.services.mock_competitors import MOCK_RESPONSE
from tests.conftest import VALID_INTELLIGENCE_BODY, make_design_intelligence


VALID_COMPETITOR_BODY = {
    "urls": ["https://github.com"],
    "style_goal": "railway_style",
}

VALID_MULTI_COMPETITOR_BODY = {
    "urls": ["https://github.com", "https://railway.app"],
    "style_goal": "hybrid",
}


# ─── GET /health ──────────────────────────────────────────────────────────────

class TestHealthEndpoint:
    def test_health_returns_200(self, client):
        response = client.get("/health")
        assert response.status_code == 200

    def test_health_body(self, client):
        response = client.get("/health")
        assert response.json() == {"status": "ok"}


# ─── POST /analyze-competitors ────────────────────────────────────────────────

class TestAnalyzeCompetitorsEndpoint:
    def test_valid_request_returns_200(self, client, mock_competitor_response):
        with patch("app.routes.analyze_competitors.analyze_competitors",
                   return_value=mock_competitor_response):
            response = client.post("/analyze-competitors", json=VALID_COMPETITOR_BODY)
        assert response.status_code == 200

    def test_valid_request_response_shape(self, client, mock_competitor_response):
        with patch("app.routes.analyze_competitors.analyze_competitors",
                   return_value=mock_competitor_response):
            response = client.post("/analyze-competitors", json=VALID_COMPETITOR_BODY)
        data = response.json()
        assert "meta" in data
        assert "sources" in data
        assert "global_patterns" in data
        assert "components" in data
        assert "design_tokens" in data
        assert "flows" in data
        assert "recommendations" in data
        assert "avoid" in data

    def test_empty_urls_returns_400(self, client):
        response = client.post("/analyze-competitors", json={"urls": [], "style_goal": ""})
        assert response.status_code == 400
        assert "URL" in response.json()["detail"]

    def test_too_many_urls_returns_400(self, client):
        urls = [f"https://site{i}.com" for i in range(6)]  # 6 > MAX_URLS=5
        response = client.post("/analyze-competitors", json={"urls": urls})
        assert response.status_code == 400
        assert "Maximum" in response.json()["detail"]

    def test_exactly_five_urls_accepted(self, client, mock_competitor_response):
        urls = [f"https://site{i}.com" for i in range(5)]
        with patch("app.routes.analyze_competitors.analyze_competitors",
                   return_value=mock_competitor_response):
            response = client.post("/analyze-competitors", json={"urls": urls})
        assert response.status_code == 200

    def test_invalid_url_format_returns_422(self, client):
        response = client.post("/analyze-competitors", json={"urls": ["not-a-url"]})
        assert response.status_code == 422

    def test_missing_urls_field_returns_422(self, client):
        response = client.post("/analyze-competitors", json={"style_goal": "test"})
        assert response.status_code == 422

    def test_missing_body_returns_422(self, client):
        response = client.post("/analyze-competitors")
        assert response.status_code == 422

    def test_style_goal_forwarded_to_service(self, client, mock_competitor_response):
        with patch("app.routes.analyze_competitors.analyze_competitors",
                   return_value=mock_competitor_response) as mock_service:
            client.post("/analyze-competitors", json={
                "urls": ["https://github.com"],
                "style_goal": "custom_goal",
            })
        call_args = mock_service.call_args
        assert "custom_goal" in call_args.args

    def test_design_tokens_in_response_have_typography(self, client, mock_competitor_response):
        with patch("app.routes.analyze_competitors.analyze_competitors",
                   return_value=mock_competitor_response):
            response = client.post("/analyze-competitors", json=VALID_COMPETITOR_BODY)
        tokens = response.json()["design_tokens"]
        assert "typography" in tokens
        assert "font_family" in tokens["typography"]

    def test_design_tokens_shadow_structured(self, client, mock_competitor_response):
        with patch("app.routes.analyze_competitors.analyze_competitors",
                   return_value=mock_competitor_response):
            response = client.post("/analyze-competitors", json=VALID_COMPETITOR_BODY)
        shadow = response.json()["design_tokens"]["shadow"]
        assert "sm" in shadow
        assert "md" in shadow
        assert "lg" in shadow


# ─── POST /extract-raw ────────────────────────────────────────────────────────

class TestExtractRawEndpoint:
    MOCK_SITE_DATA = {
        "url": "https://github.com",
        "raw_analysis": {
            "page_type": "developer_platform",
            "layout": ["sticky_nav"],
            "visual_style": ["dark"],
            "components": {},
            "typography": {"font_family": "Inter"},
            "design_tokens": {"theme": "dark"},
            "ux_flow": ["browse"],
            "ux_quality": ["clean"],
        },
    }

    def test_valid_request_returns_200(self, client):
        with patch("app.routes.analyze_competitors.extract_site_data",
                   return_value=self.MOCK_SITE_DATA):
            response = client.post("/extract-raw", json=VALID_COMPETITOR_BODY)
        assert response.status_code == 200

    def test_response_has_results_key(self, client):
        with patch("app.routes.analyze_competitors.extract_site_data",
                   return_value=self.MOCK_SITE_DATA):
            response = client.post("/extract-raw", json=VALID_COMPETITOR_BODY)
        assert "results" in response.json()

    def test_result_has_field_coverage(self, client):
        with patch("app.routes.analyze_competitors.extract_site_data",
                   return_value=self.MOCK_SITE_DATA):
            response = client.post("/extract-raw", json=VALID_COMPETITOR_BODY)
        result = response.json()["results"][0]
        assert result["status"] == "ok"
        assert "field_coverage" in result
        coverage = result["field_coverage"]
        assert "present" in coverage
        assert "missing" in coverage
        assert "/" in coverage["coverage"]

    def test_field_coverage_counts_expected_fields(self, client):
        """Coverage should report out of all expected fields."""
        from app.services.tinyfish_client import EXPECTED_FIELDS
        with patch("app.routes.analyze_competitors.extract_site_data",
                   return_value=self.MOCK_SITE_DATA):
            response = client.post("/extract-raw", json=VALID_COMPETITOR_BODY)
        coverage_str = response.json()["results"][0]["field_coverage"]["coverage"]
        total = int(coverage_str.split("/")[1])
        assert total == len(EXPECTED_FIELDS)

    def test_extraction_failure_returns_error_in_results(self, client):
        with patch("app.routes.analyze_competitors.extract_site_data",
                   side_effect=RuntimeError("TinyFish unavailable")):
            response = client.post("/extract-raw", json=VALID_COMPETITOR_BODY)
        assert response.status_code == 200  # outer response is still 200
        result = response.json()["results"][0]
        assert result["status"] == "error"
        assert "TinyFish unavailable" in result["error"]

    def test_partial_failure_mixed_results(self, client):
        """When one URL fails and another succeeds, both appear in results."""
        def side_effect(url):
            if "fail" in url:
                raise RuntimeError("failed")
            return {"url": url, "raw_analysis": {**self.MOCK_SITE_DATA["raw_analysis"]}}

        with patch("app.routes.analyze_competitors.extract_site_data",
                   side_effect=side_effect):
            response = client.post("/extract-raw", json={
                "urls": ["https://success.com", "https://fail.com"],
            })
        results = response.json()["results"]
        statuses = {r["status"] for r in results}
        assert "ok" in statuses
        assert "error" in statuses

    def test_empty_urls_returns_400(self, client):
        response = client.post("/extract-raw", json={"urls": []})
        assert response.status_code == 400

    def test_too_many_urls_returns_400(self, client):
        urls = [f"https://site{i}.com" for i in range(6)]
        response = client.post("/extract-raw", json={"urls": urls})
        assert response.status_code == 400

    def test_invalid_url_returns_422(self, client):
        response = client.post("/extract-raw", json={"urls": ["not-a-url"]})
        assert response.status_code == 422


# ─── POST /transform-ui ───────────────────────────────────────────────────────

class TestTransformUIEndpoint:
    def test_valid_request_returns_200(self, client, valid_intelligence_body, monkeypatch):
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        response = client.post("/transform-ui", json=valid_intelligence_body)
        assert response.status_code == 200

    def test_response_has_refined_ui_and_code(self, client, valid_intelligence_body, monkeypatch):
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        response = client.post("/transform-ui", json=valid_intelligence_body)
        data = response.json()
        assert "refined_ui" in data
        assert "code" in data

    def test_refined_ui_has_required_fields(self, client, valid_intelligence_body, monkeypatch):
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        response = client.post("/transform-ui", json=valid_intelligence_body)
        refined = response.json()["refined_ui"]
        assert "layout" in refined
        assert "components" in refined
        assert "design_tokens" in refined
        assert "applied_patterns" in refined

    def test_layout_type_in_response(self, client, valid_intelligence_body, monkeypatch):
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        response = client.post("/transform-ui", json=valid_intelligence_body)
        assert response.json()["refined_ui"]["layout"]["type"] == "three_panel_workspace"

    def test_three_panels_in_response(self, client, valid_intelligence_body, monkeypatch):
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        response = client.post("/transform-ui", json=valid_intelligence_body)
        panels = response.json()["refined_ui"]["layout"]["panels"]
        assert "sidebar" in panels
        assert "canvas" in panels
        assert "controls" in panels

    def test_code_is_placeholder_without_api_key(self, client, valid_intelligence_body, monkeypatch):
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        response = client.post("/transform-ui", json=valid_intelligence_body)
        assert response.json()["code"] == "// ANTHROPIC_API_KEY not configured"

    def test_applied_patterns_nonempty(self, client, valid_intelligence_body, monkeypatch):
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        response = client.post("/transform-ui", json=valid_intelligence_body)
        assert len(response.json()["refined_ui"]["applied_patterns"]) > 0

    def test_invalid_theme_returns_422(self, client, valid_intelligence_body):
        import copy
        body = copy.deepcopy(valid_intelligence_body)
        body["design_tokens"]["theme"] = "mixed"  # not dark|light
        response = client.post("/transform-ui", json=body)
        assert response.status_code == 422

    def test_missing_meta_returns_422(self, client, valid_intelligence_body):
        import copy
        body = copy.deepcopy(valid_intelligence_body)
        del body["meta"]
        response = client.post("/transform-ui", json=body)
        assert response.status_code == 422

    def test_missing_body_returns_422(self, client):
        response = client.post("/transform-ui")
        assert response.status_code == 422

    def test_transform_service_exception_returns_500(self, client, valid_intelligence_body):
        with patch("app.routes.transform_ui.transform_ui",
                   side_effect=ValueError("internal transform error")):
            response = client.post("/transform-ui", json=valid_intelligence_body)
        assert response.status_code == 500
        assert "Transform error" in response.json()["detail"]

    def test_spacing_scale_must_be_ints(self, client, valid_intelligence_body):
        import copy
        body = copy.deepcopy(valid_intelligence_body)
        body["design_tokens"]["spacing_scale"] = ["4px", "8px"]  # wrong type
        response = client.post("/transform-ui", json=body)
        assert response.status_code == 422
