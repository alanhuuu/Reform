"""Edit Lab workspace registry.

Keeps cloned repos and dev servers alive between calls so repeated edits in
one session avoid the full clone/install/boot cycle. A workspace = one
tmp dir + one dev server process, keyed by `session_id`.
"""

from __future__ import annotations

import atexit
import glob
import logging
import os
import shutil
import signal
import subprocess
import tempfile
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Optional

from app.services.preview_renderer import (
    _clone_repo,
    _detect_framework,
    _find_free_port,
    _find_frontend_root,
    _generate_dummy_env,
    _install_deps,
    _kill_server,
    _start_dev_server,
    _wait_for_server,
)

logger = logging.getLogger(__name__)

SESSION_TTL_SECONDS = 3600  # 60 minutes of idle before GC — gives demo users
                             # a full session's worth of thinking time before
                             # their warm workspace gets reaped.
WORKSPACE_PREFIX = "reform_editlab_ws_"


@dataclass
class EditLabSession:
    id: str
    github_url: str
    branch: str
    tmp_dir: str
    frontend_dir: str
    framework: str
    port: int
    server_proc: subprocess.Popen
    root_file: Optional[str]
    page_file_by_route: dict[str, str] = field(default_factory=dict)
    # One-level undo: stores the pre-edit file content from the most recent
    # apply_section_edit call. `revert_last_edit` writes this back to disk
    # and re-renders. Cleared after every successful revert and overwritten
    # on every subsequent apply.
    pending_revert: Optional[dict] = None  # {'target_file': str, 'original_code': str}
    # Set of file paths (relative to frontend_dir) the user has explicitly
    # accepted edits on in this session. Used by /edit-lab/publish to know
    # which files to include in the GitHub publish payload.
    accepted_files: set[str] = field(default_factory=set)
    last_used: float = field(default_factory=time.time)

    @property
    def base_url(self) -> str:
        return f"http://localhost:{self.port}/"

    def touch(self) -> None:
        self.last_used = time.time()

    def is_alive(self) -> bool:
        return self.server_proc.poll() is None

    def destroy(self) -> None:
        try:
            _kill_server(self.server_proc)
        except Exception as e:
            logger.warning("Edit Lab: kill server for %s failed: %s", self.id, e)
        try:
            shutil.rmtree(self.tmp_dir, ignore_errors=True)
        except Exception as e:
            logger.warning("Edit Lab: rmtree for %s failed: %s", self.id, e)


class _Registry:
    def __init__(self) -> None:
        self._sessions: dict[str, EditLabSession] = {}
        self._lock = threading.Lock()

    def sweep(self) -> None:
        """Destroy dead or idle sessions. Called before load/apply."""
        now = time.time()
        with self._lock:
            to_remove: list[str] = []
            for sid, sess in self._sessions.items():
                if (not sess.is_alive()) or (now - sess.last_used > SESSION_TTL_SECONDS):
                    to_remove.append(sid)
            removed = [self._sessions.pop(sid) for sid in to_remove]
        for sess in removed:
            logger.info(
                "Edit Lab: GC destroying session %s (alive=%s, idle=%ds)",
                sess.id,
                sess.is_alive(),
                int(now - sess.last_used),
            )
            sess.destroy()

    def get(self, session_id: str) -> Optional[EditLabSession]:
        with self._lock:
            sess = self._sessions.get(session_id)
            if sess and sess.is_alive():
                sess.touch()
                return sess
            if sess:
                self._sessions.pop(session_id, None)
        if sess and not sess.is_alive():
            logger.info("Edit Lab: session %s is dead, removing", session_id)
            sess.destroy()
        return None

    def register(self, sess: EditLabSession) -> None:
        with self._lock:
            self._sessions[sess.id] = sess

    def destroy(self, session_id: str) -> None:
        with self._lock:
            sess = self._sessions.pop(session_id, None)
        if sess:
            sess.destroy()

    def destroy_all(self) -> None:
        with self._lock:
            sessions = list(self._sessions.values())
            self._sessions.clear()
        for sess in sessions:
            sess.destroy()

    def destroy_by_repo(self, github_url: str, branch: str) -> None:
        """Destroy any session pinned to this repo+branch. Used when creating
        a new session for the same repo, so we don't leak old ones."""
        with self._lock:
            matches = [sid for sid, s in self._sessions.items()
                       if s.github_url == github_url and s.branch == branch]
            removed = [self._sessions.pop(sid) for sid in matches]
        for sess in removed:
            logger.info("Edit Lab: replacing session %s for %s#%s", sess.id, github_url, branch)
            sess.destroy()


_registry = _Registry()


def get_registry() -> _Registry:
    return _registry


def _locate_root_page_file(frontend_dir: str, framework: str) -> Optional[str]:
    """Find the source file that renders the root '/' route, relative to frontend_dir."""
    candidates: list[str] = []
    if framework == "next":
        for ext in ("tsx", "jsx", "ts", "js"):
            candidates += [
                f"app/page.{ext}",
                f"src/app/page.{ext}",
                f"pages/index.{ext}",
                f"src/pages/index.{ext}",
            ]
    for ext in ("tsx", "jsx", "ts", "js"):
        candidates += [
            f"src/App.{ext}",
            f"src/app.{ext}",
            f"src/routes/Home.{ext}",
            f"src/pages/Home.{ext}",
            f"src/pages/index.{ext}",
            f"App.{ext}",
        ]
    for rel in candidates:
        full = os.path.join(frontend_dir, rel)
        if os.path.isfile(full):
            return rel
    return None


def create_session(
    github_url: str,
    branch: str,
    access_token: str,
) -> EditLabSession:
    """Clone + install + boot a persistent dev server. Returns a registered session."""
    _registry.destroy_by_repo(github_url, branch)

    tmp_dir = tempfile.mkdtemp(prefix=WORKSPACE_PREFIX)
    proc: Optional[subprocess.Popen] = None
    try:
        _clone_repo(github_url, branch, tmp_dir, access_token)
        frontend_dir = _find_frontend_root(tmp_dir)
        _install_deps(frontend_dir)
        _generate_dummy_env(frontend_dir)
        framework = _detect_framework(frontend_dir)
        root_file = _locate_root_page_file(frontend_dir, framework)

        port = _find_free_port()
        proc = _start_dev_server(frontend_dir, port)
        if not _wait_for_server(port):
            raise RuntimeError("Dev server failed to start.")

        sess = EditLabSession(
            id=uuid.uuid4().hex[:12],
            github_url=github_url,
            branch=branch,
            tmp_dir=tmp_dir,
            frontend_dir=frontend_dir,
            framework=framework,
            port=port,
            server_proc=proc,
            root_file=root_file,
        )
        _registry.register(sess)
        logger.info(
            "Edit Lab: session %s ready (port=%d, framework=%s, root_file=%s)",
            sess.id, sess.port, sess.framework, sess.root_file,
        )
        return sess
    except Exception:
        if proc is not None:
            try:
                _kill_server(proc)
            except Exception:
                pass
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise


def _cleanup_orphan_workspaces() -> None:
    """On import, remove workspace dirs left behind by a previous process."""
    pattern = os.path.join(tempfile.gettempdir(), WORKSPACE_PREFIX + "*")
    for path in glob.glob(pattern):
        try:
            shutil.rmtree(path, ignore_errors=True)
        except Exception:
            pass


_cleanup_orphan_workspaces()


@atexit.register
def _atexit_cleanup() -> None:
    try:
        _registry.destroy_all()
    except Exception:
        pass


def _on_signal(signum, frame):  # noqa: ARG001
    try:
        _registry.destroy_all()
    finally:
        signal.signal(signum, signal.SIG_DFL)
        os.kill(os.getpid(), signum)


try:
    signal.signal(signal.SIGTERM, _on_signal)
except Exception:
    pass
