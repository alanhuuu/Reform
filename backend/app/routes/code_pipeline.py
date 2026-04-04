import base64
import logging

import httpx
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel

from app.schemas.code_transform import (
    RepoIngestRequest, RepoIngestResponse, FileEntry,
    CodeAnalysisRequest, CodeAnalysisResponse,
    CodeTransformRequest, CodeTransformResponse,
    CommitRequest, CommitResponse,
)
from app.services.code_ingestion import ingest_github_repo
from app.services.code_analyzer import analyze_code
from app.services.code_transformer import transform_code

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/ingest-repo", response_model=RepoIngestResponse)
async def ingest_repo_endpoint(req: RepoIngestRequest):
    try:
        result = await ingest_github_repo(
            github_url=req.github_url, branch=req.branch, access_token=req.access_token,
        )
        return RepoIngestResponse(
            repo_name=result["repo_name"], branch=result["branch"],
            files=[FileEntry(**f) for f in result["files"]],
            file_tree=result["file_tree"], total_files=result["total_files"],
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.error("Repo ingestion failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {e}") from e


@router.post("/analyze-code", response_model=CodeAnalysisResponse)
async def analyze_code_endpoint(req: CodeAnalysisRequest):
    try:
        result = await analyze_code([f.model_dump() for f in req.files], req.focus)
        return CodeAnalysisResponse(**result)
    except Exception as e:
        logger.error("Code analysis failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {e}") from e


@router.post("/transform-code", response_model=CodeTransformResponse)
async def transform_code_endpoint(req: CodeTransformRequest):
    try:
        result = await transform_code(
            files=[f.model_dump() for f in req.files],
            target_file=req.target_file,
            design_intelligence=req.design_intelligence,
            user_intent=req.user_intent,
            repo_clone_url=req.repo_clone_url,
            branch=req.branch,
            access_token=req.access_token,
        )
        return CodeTransformResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.error("Code transformation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Transformation failed: {e}") from e


class UploadResponse(BaseModel):
    files: list[FileEntry]
    total_files: int


@router.post("/upload-files", response_model=UploadResponse)
async def upload_files_endpoint(files: list[UploadFile] = File(...)):
    result_files = []
    for upload in files:
        filename = upload.filename or "unknown"
        if not any(filename.endswith(ext) for ext in (".tsx", ".jsx", ".ts", ".js", ".css", ".scss", ".json", ".mjs")):
            continue
        content = await upload.read()
        decoded = content.decode("utf-8", errors="replace")
        result_files.append(FileEntry(path=filename, content=decoded, size=len(decoded)))
    if not result_files:
        raise HTTPException(status_code=400, detail="No valid frontend files found")
    return UploadResponse(files=result_files, total_files=len(result_files))


@router.post("/commit-to-github", response_model=CommitResponse)
async def commit_to_github_endpoint(req: CommitRequest):
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "Authorization": f"Bearer {req.access_token}",
        "User-Agent": "RefineUI-Bot/1.0",
    }
    target_branch = req.create_branch or req.branch

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            if req.create_branch:
                ref_res = await client.get(
                    f"https://api.github.com/repos/{req.repo_name}/git/ref/heads/{req.branch}",
                    headers=headers,
                )
                if ref_res.status_code != 200:
                    raise ValueError(f"Could not find base branch '{req.branch}'")
                base_sha = ref_res.json()["object"]["sha"]
                create_res = await client.post(
                    f"https://api.github.com/repos/{req.repo_name}/git/refs",
                    headers=headers,
                    json={"ref": f"refs/heads/{req.create_branch}", "sha": base_sha},
                )
                if create_res.status_code not in (200, 201) and "already exists" not in create_res.text:
                    raise ValueError(f"Failed to create branch: {create_res.text}")

            # Get current file SHA
            file_url = f"https://api.github.com/repos/{req.repo_name}/contents/{req.file_path}?ref={target_branch}"
            file_res = await client.get(file_url, headers=headers)
            file_sha = file_res.json().get("sha") if file_res.status_code == 200 else None

            # Commit
            encoded_content = base64.b64encode(req.new_content.encode("utf-8")).decode("utf-8")
            put_body: dict = {
                "message": req.commit_message,
                "content": encoded_content,
                "branch": target_branch,
            }
            if file_sha:
                put_body["sha"] = file_sha

            put_res = await client.put(
                f"https://api.github.com/repos/{req.repo_name}/contents/{req.file_path}",
                headers=headers, json=put_body,
            )
            if put_res.status_code not in (200, 201):
                raise ValueError(f"Commit failed: {put_res.text[:300]}")

            commit_data = put_res.json().get("commit", {})
            commit_sha = commit_data.get("sha", "unknown")
            commit_url = commit_data.get("html_url", f"https://github.com/{req.repo_name}/commit/{commit_sha}")

            # Trigger deploy webhook (Contents API commits don't fire push webhooks)
            try:
                owner, repo = req.repo_name.split("/", 1)
                await client.post(
                    f"https://api.github.com/repos/{req.repo_name}/dispatches",
                    headers=headers,
                    json={"event_type": "reform-deploy", "client_payload": {"source": "reform"}},
                )
                logger.info("Triggered deploy webhook for %s", req.repo_name)
            except Exception as e:
                logger.warning("Deploy webhook failed (non-fatal): %s", e)

            return CommitResponse(
                success=True, commit_sha=commit_sha,
                commit_url=commit_url, branch=target_branch,
            )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.error("GitHub commit failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Commit failed: {e}") from e
