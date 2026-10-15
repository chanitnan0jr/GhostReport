"""CLI: ContextPack → Stage A → Stage B → draft JSON for operator approval.

    uv run python -m engine.analyze app runs/draft.app.json --config ghostreport.yaml
    uv run python -m engine.analyze path/to/dapp runs/draft.partb.json --config partb.yaml

A config with `mode: code_only` (or --code-only) runs L0: no cohort stats.
"""

import argparse
import json
import time
from pathlib import Path

from engine.config import CANONICAL_EVENTS, TargetConfig, load_config
from engine.context_builder import build_context
from engine.llm import LLM
from engine.stages import run_stage_a, run_stage_b


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("repo", type=Path)
    parser.add_argument("out", type=Path)
    parser.add_argument("--code-only", action="store_true",
                        help="L0 mode: no cohort stats, never used for behavioral findings")
    parser.add_argument("--token-cap", type=int, default=30_000)
    parser.add_argument("--keywords", help="comma-separated; overrides the config")
    parser.add_argument("--config", type=Path,
                        help="ghostreport.yaml whose include/exclude/keywords to use")
    args = parser.parse_args()

    config = load_config(args.config) if args.config else TargetConfig()
    keywords = tuple(args.keywords.split(",")) if args.keywords else config.workflow.keywords
    code_only = args.code_only or config.mode == "code_only"
    pack = build_context(args.repo, keywords=keywords, include=config.repo.include,
                         exclude=config.repo.exclude, token_cap=args.token_cap,
                         analytics_calls=config.analytics.calls)
    print(f"ContextPack: {len(pack.scope.searched_files)} files, ~{pack.tokens()} tokens, "
          f"truncated={pack.scope.truncated}, commit={pack.scope.commit_sha}, "
          f"analytics_calls={len(pack.analytics_calls)}")
    llm = LLM()
    started = time.monotonic()
    workflow, rejected_a = run_stage_a(llm, pack, args.repo)
    print(f"\nStage A ({time.monotonic() - started:.1f}s) rejected={rejected_a}")
    for kind in ("states", "outcomes", "ui_facts"):
        for fact in getattr(workflow, kind):
            ref = fact.code_ref
            print(f"  [{kind}] {fact.id} {fact.instrumentation} "
                  f"{ref.file}:{ref.lines[0]}-{ref.lines[1]} — {fact.desc}")
    started = time.monotonic()
    stats = {"mode": "code_only"} if code_only else {"note": "no live data yet"}
    # With a config, rule checks need their event mapped or emitted under its canonical name.
    mapped = (frozenset(config.events.values())
              | {c.event for c in pack.analytics_calls if c.event in CANONICAL_EVENTS}
              if args.config else None)
    # A pinned remote repo is named by its URL, not by this machine's checkout path.
    draft = run_stage_b(llm, pack, workflow, stats, repo_root=config.repo.url or str(args.repo),
                        mapped_events=mapped, code_only=code_only)
    print(f"\nStage B ({time.monotonic() - started:.1f}s) rejected={draft.rejected}")
    for h in draft.hypotheses.hypotheses:
        print(f"  {h.id} [{h.class_id}] generic={h.generic} "
              f"evidence={list(h.code_evidence)} — {h.statement}")
    for action in draft.actions:
        print(f"  action {action['action_type']}: {action['note']}")
    for rec in draft.recommendations:
        print(f"  recommend {rec['params']}: {rec['note']}")
    for gap in draft.cannot_check:
        print(f"  cannot check {gap['rule_id']}: needs {gap['needs_event']} — {gap['rule']}")
    for point, options in draft.probe_options.items():
        print(f"  {point}: " + " | ".join(f"{o.label} → {','.join(o.hypothesis_ids)}"
                                          for o in options))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(draft.model_dump_json(indent=2) + "\n", encoding="utf-8")
    print(f"\nDraft written to {args.out}")
    for call in llm.stats()[-2:]:
        usage = json.loads(call["tokens"])
        print(f"  {call['prompt_id']}: {call['latency_ms']} ms, attempts={call['attempts']}, "
              f"prompt={sum(u.get('prompt_tokens', 0) for u in usage)} "
              f"completion={sum(u.get('completion_tokens', 0) for u in usage)} "
              f"cache_hit={sum(u.get('prompt_cache_hit_tokens', 0) for u in usage)}")


if __name__ == "__main__":
    main()
