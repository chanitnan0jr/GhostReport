"""Workflow Map data for the site: the validated WorkflowMap, never layout or edges.

The frontend lays nodes out deterministically (React Flow + dagre) and derives edges
from state order. Permalinks exist only when the map was built from a real commit.
"""

import json
import os
import re
from typing import Any, Literal

from engine.investigation import Investigation
from engine.partb import PARTB_DIR, permalink

SHA = re.compile(r"^[0-9a-f]{40}$")
KINDS = (("states", "state"), ("outcomes", "outcome"), ("ui_facts", "ui_fact"))
APP_REPO = os.getenv("GHOST_REPO_URL", "https://github.com/chanitnan0jr/GhostReport")


def _nodes(workflow: dict[str, Any], repo: str | None, prefix: str,
           verdicts: dict[str, dict[str, str]]) -> list[dict[str, Any]]:
    commit = workflow["scope"]["commit_sha"]
    linkable = repo is not None and SHA.match(commit) is not None
    nodes = []
    for key, kind in KINDS:
        for order, fact in enumerate(workflow[key]):
            ref = fact["code_ref"]
            check = verdicts.get(fact["id"])
            nodes.append({
                "id": fact["id"], "kind": kind, "order": order, "desc": fact["desc"],
                "instrumentation": fact["instrumentation"],
                "file": ref["file"], "lines": ref["lines"], "quote": ref["quote"],
                "permalink": (permalink(repo, commit, prefix + ref["file"], ref["lines"])
                              if linkable and repo else None),
                "ref_check": check["verdict"] if check else None,
                "ref_note": check["note"] if check else None,
            })
    return nodes


def workflow_view(target: Literal["app", "ens"], investigation: Investigation) -> dict[str, Any]:
    if target == "ens":
        draft = json.loads((PARTB_DIR / "draft.ens.json").read_text(encoding="utf-8"))
        review = json.loads((PARTB_DIR / "review.json").read_text(encoding="utf-8"))
        workflow, repo, prefix = draft["workflow"], review["target"]["repo"], ""
        verdicts = {c["id"]: c for c in review["ref_check"]["checks"]}
        label, mode = "ENS (real repo, code-only)", "code_only"
    else:
        workflow = investigation.workflow.model_dump(mode="json")
        repo, prefix, verdicts = APP_REPO, "app/", {}
        label, mode = "Our app (Micro Wallet Flow)", "behavioral"
    scope = workflow["scope"]
    commit = scope["commit_sha"]
    return {
        "target": target, "label": label, "mode": mode, "repo": repo, "commit": commit,
        "permalinks": None if SHA.match(commit) else
        f"not available: this map was built from {commit!r}, not a pushed commit",
        "scope": {"searched_files": len(scope["searched_files"]),
                  "truncated": scope["truncated"]},
        "legend": {"found_in_code": "event call found at this code",
                   "not_found_in_scope": "no event call in the searched files",
                   "unknown": "cannot tell from the searched files"},
        "nodes": _nodes(workflow, repo, prefix, verdicts),
    }

