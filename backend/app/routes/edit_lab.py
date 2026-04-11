"""Edit Lab routes — section-level AI editing on the current (untransformed)
website preview from an uploaded repo. Uses a persistent workspace keyed by
session_id so repeated edits skip the clone/install/boot cycle.
"""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.edit_lab_service import (
    apply_section_edit,
    load_current_preview,
    navigate_to_page,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/edit-lab")


class LoadRequest(BaseModel):
    github_url: str
    branch: str = "main"
    access_token: str = ""


class SectionRect(BaseModel):
    x: int
    y: int
    width: int
    height: int


class SectionPayload(BaseModel):
    id: str
    tag: str
    label: str
    rect: SectionRect
    heading: str = ""
    paragraph: str = ""
    text: str = ""
    classes: str = ""
    role: str = ""
    aria_label: str = ""
    element_id: str = ""
    source_file: str | None = None


class DocumentSize(BaseModel):
    width: int = 1440
    height: int = 900


class AvailablePage(BaseModel):
    name: str
    route: str
    path: str = ""


class LoadResponse(BaseModel):
    session_id: str = ""
    screenshot: str = ""
    sections: list[SectionPayload] = []
    document_size: DocumentSize = DocumentSize()
    root_file: str | None = None
    root_code: str = ""
    framework: str = "unknown"
    available_pages: list[AvailablePage] = []
    current_page: str = "/"
    error: str | None = None


@router.post("/load", response_model=LoadResponse)
async def load_endpoint(req: LoadRequest):
    try:
        result = await load_current_preview(
            github_url=req.github_url,
            branch=req.branch,
            access_token=req.access_token,
        )
        if result.get("error"):
            return LoadResponse(
                session_id=result.get("session_id", ""),
                error=result["error"],
            )
        return LoadResponse(**result)
    except Exception as e:
        logger.error("edit-lab/load failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e)) from e


class NavigateRequest(BaseModel):
    session_id: str
    page_path: str = "/"


class NavigateResponse(BaseModel):
    session_id: str = ""
    screenshot: str = ""
    sections: list[SectionPayload] = []
    document_size: DocumentSize = DocumentSize()
    current_page: str = "/"
    target_page_file: str | None = None
    session_expired: bool = False
    error: str | None = None


@router.post("/navigate", response_model=NavigateResponse)
async def navigate_endpoint(req: NavigateRequest):
    try:
        result = await navigate_to_page(req.session_id, req.page_path)
        if result.get("error"):
            return NavigateResponse(
                session_id=result.get("session_id", ""),
                error=result["error"],
                session_expired=bool(result.get("session_expired")),
            )
        return NavigateResponse(**result)
    except Exception as e:
        logger.error("edit-lab/navigate failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e)) from e


class ApplyRequest(BaseModel):
    session_id: str
    target_file: str
    section_label: str
    section_heading: str = ""
    section_paragraph: str = ""
    section_text: str = ""
    section_tag: str = ""
    section_classes: str = ""
    section_role: str = ""
    section_aria_label: str = ""
    prompt: str


class ApplyResponse(BaseModel):
    session_id: str = ""
    screenshot: str = ""
    sections: list[SectionPayload] = []
    document_size: DocumentSize = DocumentSize()
    updated_code: str = ""
    summary: str = ""
    target_file: str | None = None
    updated_section_id: str | None = None
    session_expired: bool = False
    error: str | None = None


@router.post("/apply", response_model=ApplyResponse)
async def apply_endpoint(req: ApplyRequest):
    try:
        result = await apply_section_edit(
            session_id=req.session_id,
            target_file=req.target_file,
            section_label=req.section_label,
            section_heading=req.section_heading,
            section_paragraph=req.section_paragraph,
            section_text=req.section_text,
            section_tag=req.section_tag,
            section_classes=req.section_classes,
            section_role=req.section_role,
            section_aria_label=req.section_aria_label,
            user_prompt=req.prompt,
        )
        if result.get("error"):
            return ApplyResponse(
                session_id=result.get("session_id", ""),
                error=result["error"],
                session_expired=bool(result.get("session_expired")),
            )
        return ApplyResponse(**result)
    except Exception as e:
        logger.error("edit-lab/apply failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e)) from e
