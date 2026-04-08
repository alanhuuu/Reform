"""
Database models for Reform.

Project → RepoSnapshot → TransformRun → PageResult

Screenshots and large blobs are stored in S3.
Metadata, code, and results are stored in Postgres.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db import Base


def _utcnow():
    return datetime.now(timezone.utc)


def _uuid():
    return uuid.uuid4()


class Project(Base):
    """A user's project — one per repo."""
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    github_user_id = Column(String, nullable=False, index=True)
    github_username = Column(String, nullable=False)
    repo_name = Column(String, nullable=False)          # "owner/repo"
    repo_url = Column(String, nullable=False)            # "https://github.com/owner/repo"
    branch = Column(String, nullable=False, default="main")
    created_at = Column(DateTime(timezone=True), default=_utcnow)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    snapshots = relationship("RepoSnapshot", back_populates="project", cascade="all, delete-orphan")
    runs = relationship("TransformRun", back_populates="project", cascade="all, delete-orphan")


class RepoSnapshot(Base):
    """A snapshot of the repo's ingested files at a point in time."""
    __tablename__ = "repo_snapshots"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    file_tree = Column(JSON, nullable=False)              # list of file paths
    framework = Column(String, default="unknown")
    s3_key = Column(String, nullable=True)                # S3 key for compressed file contents
    file_count = Column(Integer, default=0)
    snapshot_at = Column(DateTime(timezone=True), default=_utcnow)

    project = relationship("Project", back_populates="snapshots")
    runs = relationship("TransformRun", back_populates="snapshot")


class TransformRun(Base):
    """A single run of the transformation pipeline."""
    __tablename__ = "transform_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    snapshot_id = Column(UUID(as_uuid=True), ForeignKey("repo_snapshots.id"), nullable=True)
    status = Column(String, nullable=False, default="running")   # running / complete / failed
    design_intelligence = Column(JSON, nullable=True)
    user_intent = Column(String, default="")
    total_pages_found = Column(Integer, default=0)
    total_transformed = Column(Integer, default=0)
    total_skipped = Column(Integer, default=0)
    global_summary = Column(JSON, default=list)
    pipeline_errors = Column(JSON, default=list)
    created_at = Column(DateTime(timezone=True), default=_utcnow)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    project = relationship("Project", back_populates="runs")
    snapshot = relationship("RepoSnapshot", back_populates="runs")
    page_results = relationship("PageResult", back_populates="run", cascade="all, delete-orphan")


class PageResult(Base):
    """Transform result for a single page within a run."""
    __tablename__ = "page_results"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    run_id = Column(UUID(as_uuid=True), ForeignKey("transform_runs.id"), nullable=False)
    page_path = Column(String, nullable=False)
    page_name = Column(String, nullable=False)
    route = Column(String, default="/")
    score = Column(Integer, default=0)
    status = Column(String, nullable=False)               # transformed / high_quality / error
    original_code = Column(Text, default="")
    updated_code = Column(Text, default="")
    diff_summary = Column(Text, default="")
    change_annotations = Column(JSON, default=list)
    change_summary = Column(JSON, default=list)
    before_screenshot_key = Column(String, nullable=True)  # S3 key
    after_screenshot_key = Column(String, nullable=True)   # S3 key
    error = Column(Text, default="")
    retries_used = Column(Integer, default=0)

    run = relationship("TransformRun", back_populates="page_results")


class UXLabSession(Base):
    """A UX analysis session: screenshot a URL, identify issues, generate CSS patches."""
    __tablename__ = "ux_lab_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    workspace_id = Column(String, nullable=False, index=True)  # github_user_id
    url = Column(String, nullable=False)
    page = Column(String, nullable=False, default="home")
    before_screenshot_key = Column(String, nullable=True)   # S3 key
    after_screenshot_key = Column(String, nullable=True)    # S3 key
    findings_json = Column(JSON, nullable=False, default=list)
    competitor_evidence_json = Column(JSON, nullable=False, default=dict)
    status = Column(String, nullable=False, default="pending")  # pending / complete / error
    created_at = Column(DateTime(timezone=True), default=_utcnow)
