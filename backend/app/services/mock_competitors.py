def mock_site_analysis(url: str) -> dict:
    """Return a mock TinyFish analysis for a single site."""
    return {
        "url": url,
        "raw_analysis": {
            "page_type": "developer_platform_marketing",
            "layout": [
                "sticky_top_nav_with_cta",
                "left_aligned_hero_with_product_preview",
                "three_column_feature_grid",
                "full_width_social_proof_strip",
                "dense_footer_with_column_links",
            ],
            "visual_style": [
                "dark_graphite_background",
                "layered_surface_depth_via_opacity",
                "subtle_accent_glow_on_interactive",
                "minimal_premium_gradients",
                "muted_secondary_text",
            ],
            "components": {
                "navbar": ["logo_left_links_center_cta_right", "transparent_to_solid_on_scroll"],
                "hero": ["left_copy_right_product_screenshot", "primary_cta_with_ghost_secondary"],
                "cards": ["icon_led_feature_cards", "rounded_8px_with_border"],
                "buttons": ["filled_accent_primary", "ghost_outline_secondary", "subtle_glow_on_hover"],
                "workspace": ["three_panel_sidebar_canvas_controls"],
                "forms_controls": ["minimal_input_with_bottom_border", "toggle_switches"],
            },
            "typography": {
                "font_family": "Inter, system-ui, sans-serif",
                "font_mono": "JetBrains Mono, monospace",
                "scale": ["12px", "14px", "16px", "20px", "24px", "32px", "48px"],
                "weight_normal": "400",
                "weight_medium": "500",
                "weight_bold": "700",
            },
            "design_tokens": {
                "theme": "dark",
                "colors": {
                    "background": "#0d1117",
                    "surface": "#161b22",
                    "text_primary": "#f0f6fc",
                    "text_secondary": "#8b949e",
                    "accent_primary": "#58a6ff",
                    "accent_secondary": "#7c3aed",
                    "success": "#238636",
                    "warning": "#d29922",
                    "error": "#f85149",
                    "border": "rgba(240,246,252,0.1)",
                },
                "border_radius": "6px",
                "spacing_scale": ["4px", "8px", "12px", "16px", "24px", "32px"],
                "shadow": {
                    "sm": "0 1px 2px rgba(0,0,0,0.3)",
                    "md": "0 4px 8px rgba(0,0,0,0.3)",
                    "lg": "0 8px 24px rgba(0,0,0,0.4)",
                },
                "border": {
                    "default": "1px solid rgba(240,246,252,0.1)",
                },
                "motion": {
                    "duration_fast": "150ms",
                    "duration_normal": "200ms",
                    "easing": "ease-out",
                },
                "density": "compact",
            },
            "ux_flow": [
                "land_on_hero",
                "scan_value_prop",
                "scroll_feature_grid",
                "click_primary_cta",
            ],
            "ux_quality": [
                "strong_f_pattern_scanning",
                "clear_interactive_affordances",
                "consistent_spacing_rhythm",
                "high_information_density_without_clutter",
            ],
            "user_goal": "start_using_platform_quickly",
            "why_it_works": [
                "single_clear_primary_action",
                "low_competition_around_cta",
                "clear_value_prop_above_fold",
                "strong_visual_hierarchy",
            ],
            "problems": [
                "dense_footer_may_overwhelm",
                "secondary_paths_not_immediately_visible",
            ],
            "cta_analysis": {
                "primary_cta_label": "Sign up for GitHub",
                "primary_cta_location": "hero_above_fold",
                "cta_prominence": "high",
                "cta_clarity": "high",
                "cta_competition": "low",
            },
            "post_click_experience": {
                "destination_type": "signup_form",
                "next_step_clarity": "high",
                "friction_level": "low",
                "notes": "clean_single_step_email_signup",
            },
            "flows": [
                {
                    "flow_name": "landing_to_signup",
                    "steps": ["see_hero", "click_signup_cta", "enter_email", "complete_setup"],
                    "clarity": "high",
                    "friction": "low",
                },
                {
                    "flow_name": "landing_to_explore_features",
                    "steps": ["scroll_past_hero", "scan_feature_grid", "click_feature_link"],
                    "clarity": "medium",
                    "friction": "low",
                },
            ],
        },
    }


MOCK_RESPONSE = {
    "meta": {
        "project_style_goal": "github_railway_hybrid",
        "description": "dark_premium_developer_tool_with_github_structure_and_railway_polish",
        "confidence": {
            "layout_patterns": 0.85,
            "visual_style": 0.90,
            "ux_flow": 0.75,
        },
    },
    "sources": [
        {
            "url": "https://github.com",
            "page_type": "developer_platform_dashboard",
            "summary": "high_density_structural_layout_muted_palette_strong_typographic_hierarchy",
        },
        {
            "url": "https://railway.app",
            "page_type": "devtool_marketing_site",
            "summary": "dark_premium_surfaces_polished_gradients_developer_focused_density",
        },
    ],
    "global_patterns": {
        "layout": [
            "sticky_top_nav_with_restrained_links",
            "left_aligned_hero_with_product_preview",
            "dense_readable_dashboard_panels",
            "card_grid_with_consistent_gap",
            "two_column_feature_sections",
        ],
        "visual_style": [
            "dark_graphite_layered_surfaces",
            "border_hierarchy_via_opacity_variation",
            "soft_accent_glow_on_interactive_elements",
            "minimal_premium_hero_gradients",
            "high_contrast_primary_muted_secondary_text",
        ],
        "ux_principles": [
            "information_density_without_clutter",
            "f_pattern_scanning_optimization",
            "consistent_8px_spacing_rhythm",
            "clear_interactive_affordances",
            "progressive_disclosure_of_complexity",
        ],
    },
    "components": {
        "navbar": {
            "patterns": [
                "logo_left_nav_center_cta_right",
                "transparent_blur_background",
                "max_5_nav_items",
                "single_primary_cta_button",
            ]
        },
        "hero": {
            "patterns": [
                "left_aligned_copy_right_product_visual",
                "headline_subhead_dual_cta",
                "dark_gradient_background_treatment",
                "product_screenshot_with_subtle_shadow",
            ]
        },
        "cards": {
            "patterns": [
                "rounded_8px_with_1px_opacity_border",
                "icon_or_emoji_led_title",
                "compact_16px_internal_padding",
                "hover_border_accent_highlight",
            ]
        },
        "buttons": {
            "patterns": [
                "filled_accent_primary_with_glow",
                "ghost_outline_secondary",
                "small_compact_tertiary_text_only",
                "rounded_6px_consistent",
            ]
        },
        "workspace": {
            "patterns": [
                "three_panel_sidebar_canvas_inspector",
                "collapsible_left_sidebar",
                "tabbed_content_panels",
                "terminal_style_output_panel",
            ]
        },
        "forms_controls": {
            "patterns": [
                "minimal_bordered_inputs",
                "toggle_switches_for_binary",
                "dropdown_with_search",
                "inline_validation_messages",
            ]
        },
    },
    "design_tokens": {
        "theme": "dark",
        "colors": {
            "background": "#0d1117",
            "surface": "#161b22",
            "text_primary": "#f0f6fc",
            "text_secondary": "#8b949e",
            "accent_primary": "#58a6ff",
            "accent_secondary": "#7c3aed",
            "success": "#238636",
            "warning": "#d29922",
            "error": "#f85149",
            "border": "rgba(240,246,252,0.1)",
        },
        "typography": {
            "font_family": "Inter, system-ui, sans-serif",
            "font_mono": "JetBrains Mono, monospace",
            "scale": ["12px", "14px", "16px", "20px", "24px", "32px", "48px"],
            "weight_normal": "400",
            "weight_medium": "500",
            "weight_bold": "700",
        },
        "border_radius": "6px",
        "spacing_scale": ["4px", "8px", "12px", "16px", "24px", "32px"],
        "shadow": {
            "sm": "0 1px 2px rgba(0,0,0,0.3)",
            "md": "0 4px 8px rgba(0,0,0,0.3)",
            "lg": "0 8px 24px rgba(0,0,0,0.4)",
        },
        "border": {
            "default": "1px solid rgba(240,246,252,0.1)",
        },
        "motion": {
            "duration_fast": "150ms",
            "duration_normal": "200ms",
            "easing": "ease-out",
        },
        "density": "compact",
    },
    "flows": {
        "primary_user_flow": [
            "land_on_hero",
            "scan_value_proposition",
            "scroll_feature_grid",
            "click_primary_cta",
            "enter_onboarding_flow",
        ],
        "interaction_patterns": [
            "hover_reveal_secondary_actions",
            "click_to_expand_detail_panels",
            "keyboard_shortcut_power_user_layer",
            "drag_to_reorder_workspace_panels",
        ],
        "layout_flow_mapping": {
            "navbar": "global_navigation_anchor",
            "hero": "value_prop_entry_point",
            "feature_grid": "capability_scanning",
            "workspace": "primary_task_execution",
            "footer": "secondary_navigation_escape",
        },
    },
    "ux_intelligence": {
        "common_user_goals": [
            "start_using_platform_quickly",
            "explore_product_capabilities",
        ],
        "effective_patterns": [
            "single_clear_primary_action",
            "progressive_disclosure_of_complexity",
            "strong_visual_hierarchy_guides_eye",
            "clear_value_prop_above_fold",
        ],
        "common_problems": [
            "dense_footer_may_overwhelm",
            "secondary_paths_not_immediately_visible",
        ],
        "cta_insights": {
            "dominant_location": "hero_above_fold",
            "dominant_prominence": "high",
            "common_labels": ["Sign up", "Get Started", "Start Free"],
            "best_practice_notes": "single_prominent_cta_in_hero_with_ghost_secondary",
        },
        "post_click_quality": "high",
        "strongest_flows": [
            {
                "flow_name": "landing_to_signup",
                "seen_in_sites": 2,
                "avg_clarity": "high",
                "avg_friction": "low",
            },
        ],
    },
    "recommendations": [
        {
            "priority": "high",
            "target": "layout_structure",
            "action": "adopt_github_two_column_density_with_railway_surface_layering",
        },
        {
            "priority": "high",
            "target": "spacing_system",
            "action": "enforce_8px_base_grid_with_16px_component_gaps_24px_section_gaps",
        },
        {
            "priority": "high",
            "target": "color_system",
            "action": "use_github_neutral_palette_with_railway_accent_glow_treatment",
        },
        {
            "priority": "medium",
            "target": "component_cards",
            "action": "rounded_8px_cards_with_opacity_border_and_hover_accent_highlight",
        },
        {
            "priority": "medium",
            "target": "typography",
            "action": "inter_sans_serif_with_monospace_accents_for_code_elements",
        },
        {
            "priority": "low",
            "target": "interaction_layer",
            "action": "add_keyboard_shortcuts_and_hover_reveal_secondary_actions",
        },
    ],
    "avoid": [
        "consumer_app_playful_gradients",
        "rounded_pill_buttons_over_16px_radius",
        "light_theme_without_dark_mode_default",
        "excessive_whitespace_low_density_layouts",
        "decorative_illustrations_over_product_screenshots",
    ],
}
