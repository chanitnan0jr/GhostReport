"""Part B (design §10, L0): the committed code-only run on a repo the team did not write.

Served read-only from fixtures/partb. Hypotheses are left out on purpose: their
classes come from catalog mvp-v1, which is worded for the grant app.
"""

import json
from collections import Counter
from pathlib import Path
from typing import Any
from urllib.parse import quote

PARTB_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "partb"


def permalink(repo: str, commit: str, file: str, lines: list[int]) -> str:
    start, end = lines
    anchor = f"#L{start}" if start == end else f"#L{start}-L{end}"
    return f"{repo}/blob/{commit}/{quote(file)}{anchor}"


def load_partb(folder: Path = PARTB_DIR) -> dict[str, Any]:
    draft = json.loads((folder / "draft.ens.json").read_text(encoding="utf-8"))
    review = json.loads((folder / "review.json").read_text(encoding="utf-8"))
    repo, commit = review["target"]["repo"], review["target"]["commit"]
    scope = draft["workflow"]["scope"]
    if scope["commit_sha"] != commit:
        raise ValueError(f"draft commit {scope['commit_sha']} is not the reviewed {commit}")
    verdicts = {c["id"]: c for c in review["ref_check"]["checks"]}
    flow_map = []
    for kind in ("states", "outcomes", "ui_facts"):
        for fact in draft["workflow"][kind]:
            ref = fact["code_ref"]
            check = verdicts[fact["id"]]
            flow_map.append({
                "id": fact["id"], "kind": kind, "desc": fact["desc"],
                "instrumentation": fact["instrumentation"],
                "file": ref["file"], "lines": ref["lines"],
                "permalink": permalink(repo, commit, ref["file"], ref["lines"]),
                "ref_check": check["verdict"], "ref_note": check["note"],
            })
    counts = Counter(c["verdict"] for c in review["ref_check"]["checks"])
    return {
        "label": "Tested on a real repo: ENS",
        "mode": draft["mode"],
        "target": review["target"],
        "finding": {**review["finding"], "refs": [
            {**ref, "permalink": permalink(repo, commit, ref["file"], ref["lines"])}
            for ref in review["finding"]["refs"]]},
        "flow_map": flow_map,
        "cannot_check": draft["cannot_check"],
        "recommendations": draft["recommendations"],
        "ref_check": {"method": review["ref_check"]["method"], "checked": sum(counts.values()),
                      "correct": counts["correct"], "wrong": counts["wrong"],
                      "partial": counts["partial"]},
        "scope": {"searched_files": len(scope["searched_files"]), "truncated": scope["truncated"],
                  "token_cap": 30_000, "commit_sha": scope["commit_sha"]},
        "limits": review["limits"],
        "llm": draft["llm"],
        "review_md": (folder / "REVIEW.md").read_text(encoding="utf-8"),
    }
