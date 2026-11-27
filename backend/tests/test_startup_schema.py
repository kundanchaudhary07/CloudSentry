from contextlib import contextmanager
from types import SimpleNamespace
from typing import Any

import pytest

import app.database.session as database_session
from app.main import _ensure_aws_credential_validity_column


def test_startup_repairs_aws_credential_column_only_on_postgresql(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    executed: list[str] = []

    class FakeConnection:
        def execute(self, statement: Any) -> None:
            executed.append(str(statement))

    class FakeEngine:
        def __init__(self, dialect_name: str) -> None:
            self.dialect = SimpleNamespace(name=dialect_name)

        @contextmanager
        def begin(self):
            yield FakeConnection()

    class FakeSession:
        def __init__(self, engine: FakeEngine) -> None:
            self.engine = engine

        def get_bind(self) -> FakeEngine:
            return self.engine

        def close(self) -> None:
            pass

    for dialect_name, expected_count in (("postgresql", 1), ("sqlite", 0)):
        previous_count = len(executed)
        monkeypatch.setattr(
            database_session,
            "SessionLocal",
            lambda dialect_name=dialect_name: FakeSession(FakeEngine(dialect_name)),
        )
        _ensure_aws_credential_validity_column()
        assert len(executed) - previous_count == expected_count

    assert "ADD COLUMN IF NOT EXISTS is_valid BOOLEAN NOT NULL DEFAULT TRUE" in executed[0]
