"""Roles: permuted blocks of 4, idempotent per session, blind to the engine."""

import ast
from collections import Counter
from pathlib import Path

from fastapi.testclient import TestClient

from roles.service import block_roles, create_app

ROOT = Path(__file__).resolve().parent.parent


def test_blocks_are_balanced_and_assignment_is_idempotent(tmp_path: Path) -> None:
    app = create_app(db_path=tmp_path / "roles.sqlite", seed="s3cret", admin_token="t")
    with TestClient(app) as client:
        roles = [client.post("/roles/assign", json={"session_id": f"sess-{i:04d}"}).json()["role"]
                 for i in range(12)]
        for block in range(3):
            assert Counter(roles[block * 4:block * 4 + 4]) == {"A": 2, "B": 2}
        assert roles[:4] == block_roles("s3cret", 0)
        again = client.post("/roles/assign", json={"session_id": "sess-0005"}).json()["role"]
        assert again == roles[5]
        health = client.get("/roles/health").json()
        assert health["assigned"] == 12 and "s3cret" not in str(health)
        assert client.get("/roles/export").status_code == 401
        rows = client.get("/roles/export", headers={"Authorization": "Bearer t"}).json()
        assert [r["role"] for r in rows] == roles
        assert client.post("/roles/assign", json={"session_id": "x"}).status_code == 422


def test_engine_never_touches_roles() -> None:
    """Blinding guard (§6): no engine module imports roles or reads its database."""
    for path in (ROOT / "engine").glob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                assert not any(a.name.startswith("roles") for a in node.names), path
            if isinstance(node, ast.ImportFrom):
                assert not (node.module or "").startswith("roles"), path
        assert "roles.sqlite" not in path.read_text(encoding="utf-8"), path
