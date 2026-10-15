"""Prepare ENS definitions offline; approval is an explicit review command.

python -m engine.journey_cli generate --out runs/journeys.ens.draft.json
python -m engine.journey_cli approve runs/journeys.ens.draft.json \
    --digest <reviewed digest> --approved-by <reviewer> --out fixtures/partb/journeys.ens.json
"""

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path

from engine.investigation import DEFAULT_FIXTURE, load_investigation
from engine.journey_api import vocabulary
from engine.llm import LLM
from engine.segment_spec import SegmentSpec, digest, generate, validate
from engine.workflow_view import workflow_view


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("generate")
    create.add_argument("--out", type=Path, required=True)
    approve = commands.add_parser("approve")
    approve.add_argument("draft", type=Path)
    approve.add_argument("--digest", required=True)
    approve.add_argument("--approved-by", required=True)
    approve.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if args.out.exists():
        parser.exit(1, "Output already exists; reviewed ENS fixtures are immutable.\n")
    workflow = workflow_view("ens", load_investigation(DEFAULT_FIXTURE))
    if args.command == "generate":
        context = {"project": "ens", "workflow": workflow,
                   "workflow_sha256": digest(workflow), "event_vocabulary": vocabulary(workflow),
                   "eligible_evidence_ids": [n["id"] for n in workflow["nodes"]
                                             if n.get("ref_check") != "wrong"],
                   "vocabulary_scope": "literal analytics calls in checked Workflow Map quotes",
                   "observations": None}
        llm = LLM()
        try:
            result = generate(llm, context)
        finally:
            llm.db.close()
        if result["draft"] is None:
            parser.exit(1, "No validated draft: " + "; ".join(result["validation"]) + "\n")
        record = {"project": "ens", "kind": "draft", "spec": result["draft"],
                  "digest": result["digest"], "workflow_sha256": digest(workflow),
                  "context_sha256": digest(context), "validation": [],
                  "created_at": datetime.now(UTC).isoformat()}
    else:
        record = json.loads(args.draft.read_text(encoding="utf-8"))
        spec = SegmentSpec.model_validate(record["spec"])
        problems = validate(spec, workflow, vocabulary(workflow))
        if (problems or spec.project != "ens" or not args.approved_by.strip()
                or args.digest != record["digest"] or args.digest != digest(record["spec"])
                or record["workflow_sha256"] != digest(workflow)):
            parser.exit(1, "Approval refused: invalid definitions or stale digest/reference.\n")
        record.update(kind="approved", approved_by=args.approved_by.strip(),
                      approved_at=datetime.now(UTC).isoformat())
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{record['kind']}: {args.out}\nsha256: {record['digest']}")


if __name__ == "__main__":
    main()
