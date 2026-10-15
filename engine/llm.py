"""Thin LLM harness: versioned prompts, schema validation, one repair, cache, replay.

The repository context opens the user turn, so system + context is a stable prefix
that Stage A and Stage B share in DeepSeek's prefix cache; instructions come last.
"""

import hashlib
import json
import os
import sqlite3
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, TypeVar, cast

from pydantic import BaseModel, ValidationError

ROOT = Path(__file__).resolve().parent.parent
PROMPTS = ROOT / "prompts"
BASE_URL = "https://api.deepseek.com"
T = TypeVar("T", bound=BaseModel)
Message = dict[str, str]
Completion = Callable[[list[Message], str, bool], tuple[str, dict[str, Any]]]


class LLMError(RuntimeError):
    """The stage produced no valid output; callers fall back to templates."""


def api_key() -> str:
    """Environment first, then the repo's .env (never logged)."""
    key = os.getenv("DEEPSEEK_API_KEY")
    if not key and (ROOT / ".env").exists():
        for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
            name, _, value = line.partition("=")
            if name.strip() == "DEEPSEEK_API_KEY":
                key = value.strip().strip("'\"")
    if not key:
        raise LLMError("DEEPSEEK_API_KEY is not set")
    return key


def deepseek_completion(timeout: float = 180.0) -> Completion:
    from openai import OpenAI

    client = OpenAI(api_key=api_key(), base_url=BASE_URL, timeout=timeout, max_retries=2)

    def complete(messages: list[Message], model: str, thinking: bool) -> tuple[str, dict[str, Any]]:
        response = client.chat.completions.create(
            model=model, messages=cast(Any, messages),
            response_format={"type": "json_object"},
            extra_body={} if thinking else {"thinking": {"type": "disabled"}},
        )
        usage = response.usage.model_dump() if response.usage else {}
        return response.choices[0].message.content or "", usage

    return complete


def load_prompt(stage: str, version: int) -> str:
    return (PROMPTS / f"{stage}.v{version}.md").read_text(encoding="utf-8")


@dataclass
class LLM:
    """Every stage calls through here. REPLAY=1 serves cached outputs only."""

    cache_path: Path = field(default_factory=lambda: Path(
        os.getenv("GHOST_LLM_CACHE", str(ROOT / "runs" / "llm_cache.sqlite"))))
    model: str = field(default_factory=lambda: os.getenv("GHOST_MODEL", "deepseek-flash"))
    thinking: bool = field(default_factory=lambda: os.getenv("GHOST_THINKING", "0") == "1")
    replay: bool = field(default_factory=lambda: os.getenv("REPLAY", "0") == "1")
    complete: Completion | None = None

    def __post_init__(self) -> None:
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(str(self.cache_path))
        self.db.execute("""
            CREATE TABLE IF NOT EXISTS llm_calls (
                cache_key TEXT PRIMARY KEY, prompt_id TEXT NOT NULL,
                prompt_version INTEGER NOT NULL,
                input_hash TEXT NOT NULL, model TEXT NOT NULL, thinking INTEGER NOT NULL,
                output_json TEXT NOT NULL, latency_ms INTEGER NOT NULL, tokens TEXT NOT NULL,
                attempts INTEGER NOT NULL, created_at REAL NOT NULL
            )""")
        self.db.commit()

    def call(
        self, stage: str, version: int, schema: type[T], *, context: str, instructions: str,
        system: tuple[str, int] = ("system", 1),
    ) -> T:
        """Validate against `schema`; send the error back once, then fail."""
        system_prompt = load_prompt(*system)
        task = load_prompt(stage, version)
        schema_text = json.dumps(schema.model_json_schema(), ensure_ascii=False)
        messages: list[Message] = [
            {"role": "system", "content": system_prompt},
            # One user turn: DeepSeek keeps only one of consecutive user messages.
            {"role": "user", "content": f"{context}\n\n{task}\n\n## Input\n{instructions}"
                                        f"\n\n## Output JSON schema\n{schema_text}"},
        ]
        input_hash = hashlib.sha256(json.dumps(messages).encode()).hexdigest()
        key = hashlib.sha256(
            f"{self.model}|{self.thinking}|{stage}.v{version}|{input_hash}".encode()
        ).hexdigest()
        row = self.db.execute(
            "SELECT output_json FROM llm_calls WHERE cache_key = ?", (key,),
        ).fetchone()
        if row is not None:
            return schema.model_validate_json(row[0])
        if self.replay:
            raise LLMError(f"REPLAY=1 and no cached output for {stage}.v{version}")
        complete = self.complete or deepseek_completion()
        started, usage_total, last_error = time.monotonic(), [], ""
        for attempt in (1, 2):
            content, usage = complete(messages, self.model, self.thinking)
            usage_total.append(usage)
            try:
                result = schema.model_validate_json(content)
            except ValidationError as error:
                last_error = str(error)[:2000]
                messages = [*messages, {"role": "assistant", "content": content}, {
                    "role": "user",
                    "content": f"Your JSON failed validation:\n{last_error}\n"
                               "Return the corrected JSON object only.",
                }]
                continue
            with self.db:
                self.db.execute(
                    "INSERT OR REPLACE INTO llm_calls VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    (key, stage, version, input_hash, self.model, int(self.thinking),
                     result.model_dump_json(), int((time.monotonic() - started) * 1000),
                     json.dumps(usage_total), attempt, time.time()),
                )
            return result
        raise LLMError(f"{stage}.v{version} output failed validation twice: {last_error[:300]}")

    def stats(self) -> list[dict[str, Any]]:
        """Latency and tokens per call, for the cost-per-investigation question."""
        rows = self.db.execute(
            "SELECT prompt_id, prompt_version, model, thinking, latency_ms, tokens, attempts "
            "FROM llm_calls ORDER BY created_at")
        names = ("prompt_id", "prompt_version", "model", "thinking", "latency_ms", "tokens",
                 "attempts")
        return [dict(zip(names, row, strict=True)) for row in rows]
