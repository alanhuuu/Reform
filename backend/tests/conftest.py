"""Shared fixtures and factories for the Reform test suite."""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.competitors import CompetitorAnalysisResponse
from app.schemas.ui_transform import DesignIntelligence
from app.services.mock_competitors import MOCK_RESPONSE

# ---------------------------------------------------------------------------
# Canonical valid DesignIntelligence payload (matches the Pydantic schema in
# app/schemas/ui_transform.py exactly — note spacing_scale uses ints).
# ---------------------------------------------------------------------------
VALID_INTELLIGENCE_BODY = {
    "meta": {
        "project_style_goal": "railway_style",
        "description": "dark premium dev tool",
        "confidence": {
            "layout_patterns": 0.85,
            "visual_style": 0.90,
            "ux_flow": 0.75,
        },
    },
    "sources": [
        {
            "url": "https://railway.app",
            "page_type": "devtool_marketing",
            "summary": "dark_premium_surfaces",
        }
    ],
    "global_patterns": {
        "layout": [
            "three_panel_workspace_sidebar_canvas_controls",
            "card_based_section_segmentation",
        ],
        "visual_style": ["dark_graphite_surfaces"],
        "ux_principles": ["information_density_without_clutter"],
    },
    "components": {
        "navbar": {"patterns": ["logo_left_nav_center_cta_right"]},
        "hero": {"patterns": ["left_aligned_hero"]},
        "cards": {"patterns": ["rounded_8px_with_border"]},
        "buttons": {"patterns": ["filled_accent_primary"]},
        "workspace": {"patterns": ["three_panel_sidebar_canvas_controls"]},
        "forms_controls": {"patterns": ["minimal_input"]},
    },
    "design_tokens": {
        "theme": "dark",
        "colors": {
            "background": "#0d1117",
            "panel": "#161b22",
            "border": "rgba(240,246,252,0.1)",
            "text_primary": "#f0f6fc",
            "text_secondary": "#8b949e",
            "accent": "#58a6ff",
        },
        "border_radius": "12px",
        "spacing_scale": [4, 8, 12, 16, 24, 32],
        "shadow_style": "subtle_soft",
        "border_style": "thin_opacity",
        "density": "compact",
    },
    "flows": {
        "primary_user_flow": ["land_on_hero", "scroll_features"],
        "interaction_patterns": ["hover_reveal"],
        "layout_flow_mapping": {
            "sidebar": "navigation_panel",
            "main_canvas": "visual_output_area",
            "right_panel": "controls_panel",
        },
    },
    "recommendations": [
        {"priority": "high", "target": "layout", "action": "use_three_panel"},
        {"priority": "medium", "target": "spacing", "action": "enforce_8px_grid"},
        {"priority": "low", "target": "interaction", "action": "add_hover_states"},
    ],
    "avoid": ["pill_buttons", "light_theme"],
}


def make_design_intelligence(**overrides) -> DesignIntelligence:
    """Factory: build a DesignIntelligence from the valid body, applying any overrides."""
    import copy
    data = copy.deepcopy(VALID_INTELLIGENCE_BODY)
    data.update(overrides)
    return DesignIntelligence(**data)


@pytest.fixture(autouse=True)
def _clear_tinyfish_cache():
    """Clear TinyFish URL cache before each test."""
    from app.services.tinyfish_client import clear_cache
    clear_cache()
    yield
    clear_cache()


@pytest.fixture()
def client():
    return TestClient(app)


@pytest.fixture()
def valid_intelligence_body():
    import copy
    return copy.deepcopy(VALID_INTELLIGENCE_BODY)


@pytest.fixture()
def valid_intelligence():
    return make_design_intelligence()


@pytest.fixture()
def mock_competitor_response():
    return CompetitorAnalysisResponse(**MOCK_RESPONSE)
