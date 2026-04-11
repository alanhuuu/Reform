from __future__ import annotations

from typing import Optional
from pydantic import BaseModel


class AnalyzeRequest(BaseModel):
    repo_url: str
    branch: str = "main"
    page: str = "/"
    access_token: str = ""
    workspace_id: str = "anonymous"
    analysis_only: bool = False


class FindingOut(BaseModel):
    id: str
    type: str                   # ISSUE | WARNING | POSITIVE
    severity: str               # critical | major | minor
    status: str                 # open | patched | dismissed
    component: str
    title: str
    description: str
    principle: str
    principle_explanation: str
    recommendation: str
    annotation: dict            # {xPercent, yPercent}


class SessionOut(BaseModel):
    id: str
    url: str
    page: str
    before_screenshot_url: str
    after_screenshot_url: str
    after_preview_message: Optional[str] = None
    findings: list[FindingOut]
    created_at: str
    status: str

    class Config:
        from_attributes = True


class ApplyFindingRequest(BaseModel):
    finding_id: str
