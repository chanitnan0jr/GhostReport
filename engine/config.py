"""`ghostreport.yaml`: the one file a target repo adds (design §10, minimal reader).

Read here: repo path/include/exclude, workflow keywords, mode, and the event-name
mapping applied at ingest. Other keys in the file are documented for teams but
not yet enforced by the engine.
"""

from pathlib import Path
from typing import Literal, get_args

import yaml
from pydantic import BaseModel, ConfigDict, Field, model_validator

from engine.context_builder import DEFAULT_EXCLUDE, DEFAULT_INCLUDE, DEFAULT_KEYWORDS
from engine.models import EventName

CANONICAL_EVENTS = frozenset(get_args(EventName))


class RepoConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")

    path: Path = Path(".")
    url: str | None = None
    commit: str | None = None
    include: tuple[str, ...] = DEFAULT_INCLUDE
    exclude: tuple[str, ...] = DEFAULT_EXCLUDE


class WorkflowConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str = "wallet_onboarding"
    keywords: tuple[str, ...] = DEFAULT_KEYWORDS


class TargetConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")

    repo: RepoConfig = Field(default_factory=RepoConfig)
    workflow: WorkflowConfig = Field(default_factory=WorkflowConfig)
    mode: Literal["behavioral", "code_only"] = "behavioral"
    events: dict[str, str] = Field(default_factory=dict)

    @model_validator(mode="after")
    def canonical_targets(self) -> "TargetConfig":
        unknown = sorted(set(self.events.values()) - CANONICAL_EVENTS)
        if unknown:
            raise ValueError(f"events map to non-canonical names: {unknown}")
        return self

    def canonical_event(self, name: str) -> str | None:
        """Mapped name, or the name itself if already canonical; None = unmapped."""
        if name in self.events:
            return self.events[name]
        return name if name in CANONICAL_EVENTS else None


def load_config(path: Path) -> TargetConfig:
    """Relative repo paths resolve against the config file's directory."""
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    config = TargetConfig.model_validate(raw)
    if not config.repo.path.is_absolute():
        config.repo.path = (path.parent / config.repo.path).resolve()
    return config
