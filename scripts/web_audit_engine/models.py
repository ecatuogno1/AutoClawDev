from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field, is_dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def slugify(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9._-]+", "-", value.strip().lower()).strip("-")
    return cleaned or "audit"


def normalize_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme:
        return url
    return f"https://{url}"


def to_data(value: Any) -> Any:
    if is_dataclass(value):
        return {key: to_data(item) for key, item in asdict(value).items()}
    if isinstance(value, list):
        return [to_data(item) for item in value]
    if isinstance(value, dict):
        return {key: to_data(item) for key, item in value.items()}
    return value


def camelize(value: Any) -> Any:
    if isinstance(value, list):
        return [camelize(item) for item in value]
    if isinstance(value, dict):
        converted = {}
        for key, item in value.items():
            parts = str(key).split("_")
            camel_key = parts[0] + "".join(part[:1].upper() + part[1:] for part in parts[1:])
            converted[camel_key] = camelize(item)
        return converted
    return value


@dataclass
class AuditTarget:
    url: str
    hostname: str
    project_key: str | None = None
    label: str | None = None


@dataclass
class AuditPolicy:
    version: int = 1
    target_scope: list[str] = field(default_factory=list)
    allowed_module_classes: list[str] = field(
        default_factory=lambda: ["recon", "browser", "api", "auth", "analysis", "advanced", "operator", "reporting"]
    )
    browser_enabled: bool = True
    api_enabled: bool = True
    owned_target: bool = False
    authorization_note: str | None = None
    max_concurrency: int = 8
    request_budget: int = 150
    rate_limit_per_second: float = 6.0
    allow_destructive_actions: bool = False
    operator_command_budget: int = 5
    operator_allowed_commands: list[str] = field(
        default_factory=lambda: ["curl", "python3", "node", "npx", "wget"]
    )
    approval_required_for: list[str] = field(
        default_factory=lambda: [
            "deep-injection-suite",
            "deep-authz-suite",
            "deep-ssrf-suite",
            "operator-shell",
        ]
    )
    escalation_approvals: dict[str, bool] = field(default_factory=dict)


@dataclass
class AuditSession:
    id: str
    kind: str
    label: str
    reused: bool
    privilege_level: str | None = None
    browser_state_path: str | None = None
    http_headers: dict[str, str] = field(default_factory=dict)
    cookies: list[str] = field(default_factory=list)
    observed_routes: list[str] = field(default_factory=list)
    created_at: str = field(default_factory=utc_now)


@dataclass
class AuditEvidence:
    id: str
    run_id: str
    timestamp: str
    kind: str
    module_id: str
    title: str
    summary: str
    data: dict[str, Any]
    severity_hint: str | None = None
    url: str | None = None


@dataclass
class AuditFinding:
    id: str
    run_id: str
    rule_id: str
    created_at: str
    updated_at: str
    severity: str
    confidence: float
    exploitability: int
    module_id: str
    title: str
    summary: str
    remediation: str
    evidence_ids: list[str]
    auth_context: str
    status: str = "open"


@dataclass
class AuditHypothesis:
    id: str
    created_at: str
    provider: str
    model: str
    hypothesis: str
    correlation_group: str
    confidence: float
    rationale: str
    recommended_next_module: str | None = None


@dataclass
class AuditModuleRecord:
    id: str
    label: str
    class_name: str
    status: str = "queued"
    started_at: str | None = None
    completed_at: str | None = None
    detail: str | None = None


@dataclass
class RiskSummary:
    score: int = 0
    level: str = "info"
    finding_counts: dict[str, int] = field(
        default_factory=lambda: {
            "critical": 0,
            "high": 0,
            "medium": 0,
            "low": 0,
            "info": 0,
        }
    )


@dataclass
class AuditRun:
    id: str
    target: AuditTarget
    policy: AuditPolicy
    mode: str
    artifact_root: str
    status: str = "queued"
    project_key: str | None = None
    created_at: str = field(default_factory=utc_now)
    updated_at: str = field(default_factory=utc_now)
    started_at: str | None = None
    completed_at: str | None = None
    current_phase: str = "queued"
    summary: str | None = None
    findings_count: int = 0
    evidence_count: int = 0
    approvals_pending: list[str] = field(default_factory=list)
    approved_gates: list[str] = field(default_factory=list)
    auth_contexts: list[AuditSession] = field(default_factory=list)
    risk: RiskSummary = field(default_factory=RiskSummary)
    exports: dict[str, str] = field(default_factory=dict)
    modules: list[AuditModuleRecord] = field(default_factory=list)
    latest_hypothesis: AuditHypothesis | None = None


@dataclass
class OperatorCommandRecord:
    id: str
    command: str
    module_id: str
    started_at: str
    completed_at: str | None = None
    exit_code: int | None = None
    status: str = "running"
    stdout_excerpt: str | None = None
    stderr_excerpt: str | None = None


@dataclass
class AuditEvent:
    id: str
    run_id: str
    timestamp: str
    type: str
    message: str
    project_key: str | None = None
    data: dict[str, Any] | None = None
