"""
S3 client for Reform — stores screenshots and repo snapshots.

Bucket structure:
  screenshots/{run_id}/{page_path_slug}/before.png
  screenshots/{run_id}/{page_path_slug}/after.png
  snapshots/{project_id}/{snapshot_id}.json.gz
"""

import base64
import gzip
import json
import logging
import os
import re

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

_s3 = None


def _get_client():
    """Lazy-init the S3 client."""
    global _s3
    if _s3 is None:
        _s3 = boto3.client(
            "s3",
            region_name=os.environ.get("AWS_REGION", "us-east-2"),
            aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
        )
    return _s3


def _bucket():
    return os.environ.get("AWS_S3_BUCKET", "reform-storage")


def _slugify(path: str) -> str:
    """Convert a file path to a safe S3 key segment."""
    return re.sub(r"[^a-zA-Z0-9_\-.]", "_", path)


# ─── Screenshots ─────────────────────────────────────────────────────

def upload_screenshot(run_id: str, page_path: str, label: str, b64_data: str) -> str:
    """Upload a base64-encoded screenshot to S3.

    Returns the S3 key.
    """
    key = f"screenshots/{run_id}/{_slugify(page_path)}/{label}.png"
    try:
        png_bytes = base64.b64decode(b64_data)
        _get_client().put_object(
            Bucket=_bucket(),
            Key=key,
            Body=png_bytes,
            ContentType="image/png",
        )
        logger.info("Uploaded screenshot: %s (%d bytes)", key, len(png_bytes))
        return key
    except Exception as e:
        logger.error("Failed to upload screenshot %s: %s", key, e)
        return ""


def download_screenshot(key: str) -> str:
    """Download a screenshot from S3 and return as base64 string."""
    if not key:
        return ""
    try:
        response = _get_client().get_object(Bucket=_bucket(), Key=key)
        png_bytes = response["Body"].read()
        return base64.b64encode(png_bytes).decode("utf-8")
    except ClientError as e:
        logger.error("Failed to download screenshot %s: %s", key, e)
        return ""


# ─── Repo Snapshots ──────────────────────────────────────────────────

def upload_snapshot(project_id: str, snapshot_id: str, files: list[dict]) -> str:
    """Upload repo files as compressed JSON to S3.

    files: list of {path, content, size}
    Returns the S3 key.
    """
    key = f"snapshots/{project_id}/{snapshot_id}.json.gz"
    try:
        json_bytes = json.dumps(files).encode("utf-8")
        compressed = gzip.compress(json_bytes)
        _get_client().put_object(
            Bucket=_bucket(),
            Key=key,
            Body=compressed,
            ContentType="application/gzip",
        )
        logger.info("Uploaded snapshot: %s (%d files, %d bytes compressed)", key, len(files), len(compressed))
        return key
    except Exception as e:
        logger.error("Failed to upload snapshot %s: %s", key, e)
        return ""


def download_snapshot(key: str) -> list[dict]:
    """Download and decompress a repo snapshot from S3."""
    if not key:
        return []
    try:
        response = _get_client().get_object(Bucket=_bucket(), Key=key)
        compressed = response["Body"].read()
        json_bytes = gzip.decompress(compressed)
        return json.loads(json_bytes)
    except Exception as e:
        logger.error("Failed to download snapshot %s: %s", key, e)
        return []
