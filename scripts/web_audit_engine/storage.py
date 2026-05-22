from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from .models import (
    AuditEvent,
    AuditEvidence,
    AuditFinding,
    AuditHypothesis,
    AuditRun,
    OperatorCommandRecord,
    camelize,
    to_data,
    utc_now,
)


class FileAuditStore:
    def __init__(self, root: str | Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.run_path = self.root / "run.json"
        self.events_path = self.root / "events.jsonl"
        self.findings_path = self.root / "findings.json"
        self.evidence_path = self.root / "evidence.json"
        self.hypotheses_path = self.root / "hypotheses.json"
        self.operator_commands_path = self.root / "operator-commands.json"
        self.console_path = self.root / "console.log"

    def write_run(self, run: AuditRun) -> None:
        run.updated_at = utc_now()
        self.run_path.write_text(f"{json.dumps(camelize(to_data(run)), indent=2)}\n", encoding="utf-8")

    def read_run(self) -> dict:
        if not self.run_path.exists():
            return {}
        return json.loads(self.run_path.read_text(encoding="utf-8"))

    def append_event(self, event: AuditEvent) -> None:
        with self.events_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(camelize(to_data(event))))
            handle.write("\n")

    def write_findings(self, findings: Iterable[AuditFinding]) -> None:
        self.findings_path.write_text(
            f"{json.dumps(camelize([to_data(item) for item in findings]), indent=2)}\n",
            encoding="utf-8",
        )

    def write_evidence(self, evidence: Iterable[AuditEvidence]) -> None:
        self.evidence_path.write_text(
            f"{json.dumps(camelize([to_data(item) for item in evidence]), indent=2)}\n",
            encoding="utf-8",
        )

    def write_hypotheses(self, hypotheses: Iterable[AuditHypothesis]) -> None:
        self.hypotheses_path.write_text(
            f"{json.dumps(camelize([to_data(item) for item in hypotheses]), indent=2)}\n",
            encoding="utf-8",
        )

    def write_operator_commands(self, commands: Iterable[OperatorCommandRecord]) -> None:
        self.operator_commands_path.write_text(
            f"{json.dumps(camelize([to_data(item) for item in commands]), indent=2)}\n",
            encoding="utf-8",
        )

    def append_console(self, message: str) -> None:
        with self.console_path.open("a", encoding="utf-8") as handle:
            handle.write(message.rstrip())
            handle.write("\n")
