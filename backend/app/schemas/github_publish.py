from pydantic import BaseModel


class ApprovedFile(BaseModel):
    path: str
    content: str


class TransformSummary(BaseModel):
    pages_transformed: list[str]
    ux_score_before: float | None = None
    ux_score_after: float | None = None
    summary_text: str | None = None


class PublishBranchRequest(BaseModel):
    owner: str
    repo: str
    base_branch: str | None = None
    approved_files: list[ApprovedFile]
    transform_summary: TransformSummary
    access_token: str


class PublishBranchResponse(BaseModel):
    success: bool
    branch_name: str
    branch_url: str
    files_changed: list[str]
