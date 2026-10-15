"""CLI: ContextPack → Stage A → Stage B → draft JSON for operator approval.

    uv run python -m engine.analyze app runs/draft.app.json
    uv run python -m engine.analyze path/to/dapp runs/draft.partb.json --code-only
"""

import argparse
import json
import time
from pathlib import Path

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
    parser.add_argument("--keywords", default="wallet,connect,signer,account,requireWallet")
    args = parser.parse_args()

    pack = build_context(args.repo, keywords=tuple(args.keywords.split(",")),
                         token_cap=args.token_cap)
    print(f"ContextPack: {len(pack.scope.searched_files)} files, ~{pack.tokens()} tokens, "
          f"truncated={pack.scope.truncated}, commit={pack.scope.commit_sha}")
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
    stats = {"mode": "code_only"} if args.code_only else {"note": "no live data yet"}
    draft = run_stage_b(llm, pack, workflow, stats, repo_root=str(args.repo))
    print(f"\nStage B ({time.monotonic() - started:.1f}s) rejected={draft.rejected}")
    for h in draft.hypotheses.hypotheses:
        print(f"  {h.id} [{h.class_id}] generic={h.generic} "
              f"evidence={list(h.code_evidence)} — {h.statement}")
    for action in draft.actions:
        print(f"  action {action['action_type']}: {action['note']}")
    for rec in draft.recommendations:
        print(f"  recommend {rec['params']}: {rec['note']}")
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
