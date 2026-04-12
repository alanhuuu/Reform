"""
S3 client for Reform — stores screenshots and repo snapshots.

Bucket structure:
  screenshots/{run_id}/{page_path_slug}/before.png
  screenshots/{run_id}/{page_path_slug}/after.png
  snapshots/{project_id}/{snapshot_id}.json.gz
"""

import base64
import gzip
import hashlib
import json
import logging
import os
import re
import time
from datetime import datetime, timedelta, timezone

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

_s3 = None

# In-memory cache of the URL list under the tinyfish-cache/ prefix. Refreshed
# every 5 minutes via a single ListObjectsV2 + HeadObject fan-out. Used by the
# discovery prompt so Claude prefers URLs we've already cached.
_tinyfish_url_list: list[str] = []
_tinyfish_url_list_fetched_at: float = 0.0
_TINYFISH_URL_LIST_TTL = 300  # 5 minutes


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


# Default presign TTL: 7 days. Long enough that any reasonable browser
# session can keep displaying screenshots without re-fetching, short enough
# that the bucket policy doesn't have to be public. AWS caps this at 7d
# (604800s) for SigV4, so we sit just under the ceiling.
_PRESIGN_TTL_SECONDS = 7 * 24 * 60 * 60


def presign_screenshot_url(key: str, expires_seconds: int = _PRESIGN_TTL_SECONDS) -> str:
    """Generate a presigned GET URL for a screenshot key.

    Returns "" on failure or if key is empty so callers can treat the absence
    of a URL as "no preview" without a try/except at every site.
    """
    if not key:
        return ""
    try:
        return _get_client().generate_presigned_url(
            "get_object",
            Params={"Bucket": _bucket(), "Key": key},
            ExpiresIn=expires_seconds,
        )
    except Exception as e:
        logger.warning("Failed to presign screenshot %s: %s", key, e)
        return ""


def upload_screenshot_and_presign(
    run_id: str,
    page_path: str,
    label: str,
    b64_data: str,
) -> tuple[str, str]:
    """Upload a base64 screenshot and return (key, presigned_url).

    Used by the live pipeline so screenshots never round-trip through
    the frontend as base64 — they go S3 → presigned URL → <img src>.
    Empty input → ("", ""), and a failed upload → ("", "") so callers
    can treat both as "no preview".
    """
    if not b64_data:
        return "", ""
    key = upload_screenshot(run_id, page_path, label, b64_data)
    if not key:
        return "", ""
    url = presign_screenshot_url(key)
    return key, url


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


# ─── TinyFish analysis cache ─────────────────────────────────────────
# Persisted across deploys so we stop paying TinyFish + wall-clock time for
# sites we've already analyzed recently. Key: tinyfish-cache/{sha1(url)}.json

def _tinyfish_key(url: str) -> str:
    digest = hashlib.sha1(url.encode("utf-8")).hexdigest()
    return f"tinyfish-cache/{digest}.json"


def upload_tinyfish_cache(url: str, data: dict) -> None:
    """Persist a TinyFish analysis result for this URL."""
    key = _tinyfish_key(url)
    try:
        _get_client().put_object(
            Bucket=_bucket(),
            Key=key,
            Body=json.dumps(data).encode("utf-8"),
            ContentType="application/json",
            Metadata={"source_url": url},
        )
    except Exception as e:
        logger.warning("TinyFish cache upload failed for %s: %s", url, e)


def download_tinyfish_cache(url: str, max_age_days: int = 7) -> dict | None:
    """Return cached TinyFish data if it exists and isn't older than max_age_days."""
    key = _tinyfish_key(url)
    try:
        response = _get_client().get_object(Bucket=_bucket(), Key=key)
    except ClientError as e:
        # NoSuchKey is expected on a miss — stay quiet.
        if e.response.get("Error", {}).get("Code") not in ("NoSuchKey", "404"):
            logger.warning("TinyFish cache fetch failed for %s: %s", url, e)
        return None
    except Exception as e:
        logger.warning("TinyFish cache fetch failed for %s: %s", url, e)
        return None

    last_modified = response.get("LastModified")
    if last_modified:
        age = datetime.now(timezone.utc) - last_modified
        if age > timedelta(days=max_age_days):
            return None

    try:
        return json.loads(response["Body"].read().decode("utf-8"))
    except Exception as e:
        logger.warning("TinyFish cache parse failed for %s: %s", url, e)
        return None


def list_cached_tinyfish_urls(force_refresh: bool = False) -> list[str]:
    """Return every URL we currently have cached under tinyfish-cache/.

    Used by the discovery prompt to steer Claude toward already-cached
    competitors so the hackathon audience maximizes cache-hit rate.
    Refreshes from S3 at most once every 5 minutes; subsequent calls
    return the in-memory list.
    """
    global _tinyfish_url_list, _tinyfish_url_list_fetched_at

    now = time.time()
    if (
        not force_refresh
        and _tinyfish_url_list
        and (now - _tinyfish_url_list_fetched_at) < _TINYFISH_URL_LIST_TTL
    ):
        return _tinyfish_url_list

    try:
        client = _get_client()
        paginator = client.get_paginator("list_objects_v2")
        keys: list[str] = []
        for page in paginator.paginate(Bucket=_bucket(), Prefix="tinyfish-cache/"):
            for obj in page.get("Contents", []) or []:
                keys.append(obj["Key"])
        if not keys:
            _tinyfish_url_list = []
            _tinyfish_url_list_fetched_at = now
            return []

        # Fetch source_url metadata from each object. For a few dozen keys
        # this is a fast sequential loop; boto3's underlying urllib3 pool
        # handles the ~50-100ms round trips efficiently enough.
        urls: list[str] = []
        for key in keys:
            try:
                head = client.head_object(Bucket=_bucket(), Key=key)
                source_url = (head.get("Metadata") or {}).get("source_url")
                if source_url:
                    urls.append(source_url)
            except Exception as e:
                logger.debug("head_object failed for %s: %s", key, e)
                continue

        _tinyfish_url_list = urls
        _tinyfish_url_list_fetched_at = now
        logger.info("TinyFish cache manifest refreshed: %d URLs", len(urls))
        return urls
    except Exception as e:
        logger.warning("list_cached_tinyfish_urls failed: %s", e)
        return _tinyfish_url_list  # fall through to the last-known list


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
