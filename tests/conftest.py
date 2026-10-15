import pytest


@pytest.fixture(autouse=True)
def no_network_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    """Tests never reach DeepSeek; a test that needs the LLM injects a scripted one."""
    monkeypatch.setenv("GHOST_NARRATIVE", "template")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "")
