"""Lightweight re-render endpoint: takes updated code and returns new screenshots
without re-running Claude transformation. Used after suggest-edit refinements."""

import asyncio
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.preview_renderer import render_previews
from app.services.s3_client import upload_screenshot_and_presign

router = APIRouter()


class ReRenderRequest(BaseModel):
    repo_clone_url: str
    branch: str = "main"
    target_file: str
    updated_code: str
    access_token: str = ""


class ReRenderResponse(BaseModel):
    # before_screenshot / after_screenshot are presigned S3 URLs (not base64).
    # The *_key fields are the underlying S3 object keys, forwarded so the
    # frontend can persist them via /projects/save-run without re-uploading.
    before_screenshot: str = ""
    after_screenshot: str = ""
    before_screenshot_key: str = ""
    after_screenshot_key: str = ""
    preview_route: str = "/"
    preview_error: str = ""


@router.post("/re-render", response_model=ReRenderResponse)
async def re_render_endpoint(req: ReRenderRequest):
    """Re-render before/after screenshots with updated code.
    Clones repo, patches the file, takes screenshots, uploads to S3, cleans up.

    Returns presigned URLs instead of base64 so the response stays small
    and the frontend can render the images via <img src> directly.
    """
    try:
        result = await render_previews(
            repo_clone_url=req.repo_clone_url,
            branch=req.branch,
            target_file=req.target_file,
            updated_code=req.updated_code,
            access_token=req.access_token,
        )
        run_id = str(uuid.uuid4())
        before_key, before_url = await asyncio.to_thread(
            upload_screenshot_and_presign, run_id, req.target_file, "before",
            result.get("before_screenshot", "") or "",
        )
        after_key, after_url = await asyncio.to_thread(
            upload_screenshot_and_presign, run_id, req.target_file, "after",
            result.get("after_screenshot", "") or "",
        )
        return ReRenderResponse(
            before_screenshot=before_url,
            after_screenshot=after_url,
            before_screenshot_key=before_key,
            after_screenshot_key=after_key,
            preview_route=result.get("preview_route", "/"),
            preview_error=result.get("preview_error", "") or "",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
