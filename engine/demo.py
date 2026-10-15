"""Operator CLI for demo, E2E and judging runs. No LLM call happens in any subcommand.

    uv run python -m engine.demo verify
    uv run python -m engine.demo prepare --approved-by "<name>"
    uv run python -m engine.demo serve --run-id e2e --fresh --port 18000
"""

import argparse
import json
import logging
import subprocess
import sys
import tempfile
from datetime import UTC, datetime
from pathlib import Path

import uvicorn

from engine.api import Settings, create_app, load_verifications
from engine.context_builder import git_commit
from engine.guards import validate_workflow
from engine.investigation import load_investigation
from engine.models import Verification
from engine.stages import InvestigationDraft, approve

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app"
RUNS = ROOT / "runs"
VERIFICATION = RUNS / "verification.json"
INVESTIGATION = ROOT / "fixtures" / "investigation.app.json"
JUDGING_ENDS_AT = "2026-10-16T17:00:00+07:00"
# Instrumentation tests that reviewed rules depend on: event -> (test file, test name).
EVENT_TESTS = {
    "wallet_gate_shown": ("src/ApplyModal.test.tsx", "fires gate exposure once per display"),
}


def _passed(report: dict[str, object], name: str) -> bool:
    """At least one assertion named `name` passed and nothing in the report failed."""
    results = [a for f in report.get("testResults", []) or []  # type: ignore[attr-defined]
               for a in f.get("assertionResults", [])]
    return (report.get("numFailedTests", 1) == 0
            and any(name in a.get("fullName", "") and a.get("status") == "passed"
                    for a in results))


def verify(app_dir: Path, out: Path, from_report: Path | None = None) -> list[Verification]:
    """Run (or read) each rule event's test on the current code; record only passing ones.

    `from_report` reads a vitest JSON report produced earlier in the same build
    (Docker), where GHOST_COMMIT names the commit being deployed.
    """
    commit = git_commit(app_dir)
    results: list[Verification] = []
    if commit in ("uncommitted", ""):
        print("no commit identity (set GHOST_COMMIT); recording no verification")
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text("[]\n")
        return results
    for event, (file, name) in EVENT_TESTS.items():
        if from_report is not None:
            try:
                report = json.loads(from_report.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                report = {}
        else:
            with tempfile.TemporaryDirectory() as tmp:
                output = Path(tmp) / "vitest.json"
                subprocess.run(
                    ["npx", "vitest", "run", file, "-t", name, "--reporter=json",
                     f"--outputFile={output}"], cwd=app_dir,
                    capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=300,
                )
                try:
                    report = json.loads(output.read_text(encoding="utf-8"))
                except (OSError, ValueError):
                    report = {}
        passed = _passed(report, name)
        print(f"{event}: {'PASS' if passed else 'FAIL'}  {file} › {name}  @ {commit}")
        if passed:
            results.append(Verification(event=event, test=f"app/{file} › {name}",
                                        commit=commit, passed_at=datetime.now(UTC)))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps([v.model_dump(mode="json") for v in results], indent=2) + "\n")
    if commit.endswith("-dirty") or commit == "uncommitted":
        print("warning: app/ has uncommitted changes; commit before verifying a deploy build")
    return results


def prepare(draft_path: Path, out: Path, approved_by: str, ends_at: datetime) -> None:
    """Approve a reviewed Stage A/B draft into the committed investigation file."""
    draft = InvestigationDraft.model_validate_json(draft_path.read_text(encoding="utf-8"))
    investigation = approve(draft, approved_by=approved_by, now=datetime.now(UTC),
                            ends_at=ends_at)
    out.write_text(json.dumps(investigation.dump(), indent=2, ensure_ascii=False) + "\n",
                   encoding="utf-8")
    print(f"Approved {draft.investigation_id} by {approved_by}: "
          f"{len(investigation.class_mappings)} class mappings, "
          f"questions {[q.question_version for q in investigation.questions]} → {out}")


def serve(args: argparse.Namespace) -> None:
    investigation_path: Path = args.investigation
    if not investigation_path.exists():
        sys.exit(f"{investigation_path} not found: run `prepare` first")
    investigation = load_investigation(investigation_path)
    _, stale = validate_workflow(args.repo, investigation.workflow)
    if stale:
        print(f"warning: {len(stale)} code refs no longer match {args.repo}: {stale}. "
              "Re-run engine.analyze + prepare before deploying.")
    if args.fresh:
        for suffix in (".sqlite", ".investigation.json", ".draft.json"):
            (args.db_dir / f"{args.run_id}{suffix}").unlink(missing_ok=True)
    verifications = load_verifications(args.verification)
    settings = Settings(
        run_id=args.run_id, mode=args.mode, db_dir=args.db_dir, fixture=investigation_path,
        target_repo=args.repo, verifications=verifications, autolock=True,
        collection_minutes=args.collection_minutes, seed=args.seed,
        sandbox_root=None if args.no_sandbox else args.db_dir / "sandboxes",
    )
    run = settings.run()
    print(f"run={run.run_id} mode={run.mode} commit={run.code_commit} "
          f"build_verified={run.build_verified} "
          f"({', '.join(f'{v.event} by {v.test} @ {v.commit}' for v in verifications) or 'none'})")
    logging.basicConfig(level=logging.INFO)
    uvicorn.run(create_app(settings), host=args.host, port=args.port)


def main() -> None:
    sys.stdout.reconfigure(line_buffering=True)  # type: ignore[union-attr]
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    v = commands.add_parser("verify", help="run rule-event instrumentation tests")
    v.add_argument("--app", type=Path, default=APP)
    v.add_argument("--out", type=Path, default=VERIFICATION)
    v.add_argument("--from-report", type=Path, help="vitest JSON report from this build")
    p = commands.add_parser("prepare", help="approve a draft into fixtures/")
    p.add_argument("--draft", type=Path, default=RUNS / "draft.app.json")
    p.add_argument("--out", type=Path, default=INVESTIGATION)
    p.add_argument("--approved-by", required=True)
    p.add_argument("--ends-at", type=datetime.fromisoformat,
                   default=datetime.fromisoformat(JUDGING_ENDS_AT))
    s = commands.add_parser("serve", help="start a run with v1 locked")
    s.add_argument("--run-id", required=True)
    s.add_argument("--mode", default="demo", choices=["live", "demo", "seed", "pilot"])
    s.add_argument("--fresh", action="store_true", help="delete this run's files first")
    s.add_argument("--port", type=int, default=18000)
    s.add_argument("--host", default="127.0.0.1")
    s.add_argument("--db-dir", type=Path, default=RUNS)
    s.add_argument("--repo", type=Path, default=APP)
    s.add_argument("--investigation", type=Path, default=INVESTIGATION)
    s.add_argument("--verification", type=Path, default=VERIFICATION)
    s.add_argument("--seed", action="store_true",
                   help="add ~20 synthetic seed-* sessions once, after the lock")
    s.add_argument("--collection-minutes", type=float,
                   help="live run: close every plan this long after the lock (e.g. 12)")
    s.add_argument("--no-sandbox", action="store_true",
                   help="do not host visitor sandboxes (simulated runs) beside this run")
    args = parser.parse_args()
    if args.command == "verify":
        verify(args.app, args.out, args.from_report)
    elif args.command == "prepare":
        prepare(args.draft, args.out, args.approved_by, args.ends_at)
    else:
        serve(args)


if __name__ == "__main__":
    main()
