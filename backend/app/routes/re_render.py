"""Lightweight re-render endpoint: takes updated code and returns new screenshots
without re-running Claude transformation. Used after suggest-edit refinements."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.preview_renderer import render_previews

router = APIRouter()


class ReRenderRequest(BaseModel):
    repo_clone_url: str
    branch: str = "main"
    target_file: str
    updated_code: str
    access_token: str = ""


class ReRenderResponse(BaseModel):
    before_screenshot: str = ""
    after_screenshot: str = ""
    preview_route: str = "/"
    preview_error: str = ""


@router.post("/re-render", response_model=ReRenderResponse)
async def re_render_endpoint(req: ReRenderRequest):
    """Re-render before/after screenshots with updated code.
    Clones repo, patches the file, takes screenshots, cleans up."""
    try:
        result = await render_previews(
            repo_clone_url=req.repo_clone_url,
            branch=req.branch,
            target_file=req.target_file,
            updated_code=req.updated_code,
            access_token=req.access_token,
        )
        return ReRenderResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
