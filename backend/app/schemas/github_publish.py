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
    # When True (default), create a new branch off base_branch and commit
    # there. When False, commit directly to base_branch — used when the
    # user explicitly picks an existing branch as the push target.
    create_new_branch: bool = True
    approved_files: list[ApprovedFile]
    transform_summary: TransformSummary
    access_token: str
    github_user_id: str


class PublishBranchResponse(BaseModel):
    success: bool
    branch_name: str
    branch_url: str
    files_changed: list[str]


class ListBranchesRequest(BaseModel):
    owner: str
    repo: str
    # OAuth fallback token. Optional now that the GitHub App can mint a
    # per-repo installation token; absent when the user has installed the
    # App and the frontend doesn't have an OAuth token to send.
    access_token: str = ""
    github_user_id: str = ""


class BranchInfo(BaseModel):
    name: str
    protected: bool = False


class ListBranchesResponse(BaseModel):
    default_branch: str
    branches: list[BranchInfo]
