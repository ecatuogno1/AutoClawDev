from __future__ import annotations

import json
import subprocess
from typing import Iterable

from .models import AuditEvidence, AuditFinding, AuditHypothesis, RiskSummary, slugify, utc_now

SEVERITY_WEIGHT = {
    "critical": 40,
    "high": 24,
    "medium": 12,
    "low": 6,
    "info": 2,
}

DEEP_RULES = {
    "injection.sqli": {
        "severity": "critical",
        "title": "SQL injection signal",
        "remediation": "Use parameterized queries and reject direct string concatenation into SQL statements.",
        "exploitability": 94,
        "confidence": 0.94,
        "auth_context": "authenticated",
    },
    "injection.sqli_blind": {
        "severity": "high",
        "title": "Blind SQL injection signal",
        "remediation": "Eliminate attacker-controlled SQL execution paths and compare timing regressions against known-safe baselines.",
        "exploitability": 82,
        "confidence": 0.78,
        "auth_context": "authenticated",
    },
    "injection.xss": {
        "severity": "high",
        "title": "Reflected XSS signal",
        "remediation": "Contextually encode user input and backstop with a strict CSP.",
        "exploitability": 78,
        "confidence": 0.86,
        "auth_context": "authenticated",
    },
    "injection.command": {
        "severity": "critical",
        "title": "Command injection signal",
        "remediation": "Stop passing user input to shell contexts. Use fixed argv lists or native library APIs.",
        "exploitability": 96,
        "confidence": 0.93,
        "auth_context": "authenticated",
    },
    "injection.path_traversal": {
        "severity": "high",
        "title": "Path traversal signal",
        "remediation": "Restrict file access to an allowlist and canonicalize paths before use.",
        "exploitability": 80,
        "confidence": 0.89,
        "auth_context": "authenticated",
    },
    "injection.ssti": {
        "severity": "high",
        "title": "Server-side template injection signal",
        "remediation": "Keep user input out of template expressions and use sandboxed rendering when templating is unavoidable.",
        "exploitability": 83,
        "confidence": 0.84,
        "auth_context": "authenticated",
    },
    "injection.crlf": {
        "severity": "medium",
        "title": "CRLF injection signal",
        "remediation": "Strip CR/LF characters from header-bound values and centralize header construction.",
        "exploitability": 52,
        "confidence": 0.76,
        "auth_context": "authenticated",
    },
    "injection.open_redirect": {
        "severity": "high",
        "title": "Open redirect signal",
        "remediation": "Validate redirect destinations against a strict allowlist and reject absolute external URLs.",
        "exploitability": 68,
        "confidence": 0.85,
        "auth_context": "anonymous",
    },
    "injection.host_header": {
        "severity": "high",
        "title": "Host header injection signal",
        "remediation": "Ignore untrusted host override headers and construct absolute URLs from fixed server configuration.",
        "exploitability": 72,
        "confidence": 0.82,
        "auth_context": "anonymous",
    },
    "authz.auth_bypass": {
        "severity": "critical",
        "title": "Authentication bypass signal",
        "remediation": "Add strict server-side schema validation and treat non-string auth inputs as invalid.",
        "exploitability": 96,
        "confidence": 0.91,
        "auth_context": "authenticated",
    },
    "authz.idor": {
        "severity": "high",
        "title": "IDOR signal",
        "remediation": "Enforce ownership and authorization checks before every object fetch and mutation.",
        "exploitability": 86,
        "confidence": 0.8,
        "auth_context": "authenticated",
    },
    "authz.mass_assignment": {
        "severity": "high",
        "title": "Mass assignment signal",
        "remediation": "Move to field allowlists and never bind request bodies directly onto privileged models.",
        "exploitability": 80,
        "confidence": 0.81,
        "auth_context": "authenticated",
    },
    "ssrf.metadata_access": {
        "severity": "critical",
        "title": "SSRF signal",
        "remediation": "Block requests to private and metadata address ranges and validate outbound destinations with a real URL parser.",
        "exploitability": 95,
        "confidence": 0.92,
        "auth_context": "authenticated",
    },
    "api.graphql_introspection": {
        "severity": "high",
        "title": "GraphQL introspection exposed",
        "remediation": "Disable introspection in production or gate it behind authentication and administrative authorization.",
        "exploitability": 61,
        "confidence": 0.88,
        "auth_context": "anonymous",
    },
    "api.upload_abuse": {
        "severity": "critical",
        "title": "Unauthenticated upload capability signal",
        "remediation": "Require authorization before issuing upload tokens and validate uploaded content after write.",
        "exploitability": 90,
        "confidence": 0.87,
        "auth_context": "authenticated",
    },
    "api.dangerous_method": {
        "severity": "medium",
        "title": "Dangerous HTTP methods exposed",
        "remediation": "Restrict routes to the smallest required method set and disable TRACE/CONNECT globally.",
        "exploitability": 44,
        "confidence": 0.81,
        "auth_context": "anonymous",
    },
    "operator.command_result": {
        "severity": "info",
        "title": "Operator command evidence",
        "remediation": "Review operator output and promote confirmed issues into permanent built-in checks where possible.",
        "exploitability": 5,
        "confidence": 0.5,
        "auth_context": "authenticated",
    },
}


class RuleEngine:
    def __init__(self, run_id: str):
        self.run_id = run_id
        self._findings: dict[str, AuditFinding] = {}

    def observe(self, evidence: AuditEvidence) -> list[AuditFinding]:
        finding = None
        if evidence.kind == "header.missing_security_headers":
            missing = evidence.data.get("missing", [])
            severity = "high" if any(item in {"content-security-policy", "strict-transport-security"} for item in missing) else "medium"
            finding = self._upsert(
                rule_id="missing-security-headers",
                module_id=evidence.module_id,
                severity=severity,
                title="Missing security headers",
                summary=f"The target is missing recommended security headers: {', '.join(missing)}.",
                remediation="Add CSP, HSTS, X-Frame-Options, Referrer-Policy, and related browser hardening headers at the edge or application layer.",
                evidence_id=evidence.id,
                auth_context="anonymous",
                exploitability=72 if severity == "high" else 45,
                confidence=0.92,
            )
        elif evidence.kind == "cookie.insecure":
            finding = self._upsert(
                rule_id=f"insecure-cookie-{slugify(str(evidence.data.get('cookie_name', 'cookie')))}",
                module_id=evidence.module_id,
                severity="medium",
                title="Cookie missing hardening attributes",
                summary=evidence.summary,
                remediation="Mark session cookies as HttpOnly and Secure, and prefer SameSite=Lax or SameSite=Strict unless cross-site behavior is required.",
                evidence_id=evidence.id,
                auth_context="authenticated" if evidence.data.get("auth") else "anonymous",
                exploitability=38,
                confidence=0.88,
            )
        elif evidence.kind == "path.exposed":
            path = str(evidence.data.get("path", ""))
            severity = "critical" if any(token in path for token in [".env", ".git", "actuator/env"]) else "high"
            finding = self._upsert(
                rule_id=f"exposed-path-{slugify(path)}",
                module_id=evidence.module_id,
                severity=severity,
                title="Sensitive path exposed",
                summary=evidence.summary,
                remediation="Remove public exposure for internal files and debug endpoints, enforce authz, and block access at the application and reverse proxy layers.",
                evidence_id=evidence.id,
                auth_context="anonymous",
                exploitability=84 if severity == "critical" else 66,
                confidence=0.95,
            )
        elif evidence.kind == "api.public_json":
            contains_pii = bool(evidence.data.get("contains_pii"))
            record_count = int(evidence.data.get("record_count", 0) or 0)
            severity = "critical" if contains_pii else "high"
            finding = self._upsert(
                rule_id=f"public-api-{slugify(str(evidence.data.get('route', 'route')))}",
                module_id=evidence.module_id,
                severity=severity,
                title="Unauthenticated API exposure",
                summary=evidence.summary,
                remediation="Require authentication and authorization on non-public routes, and return 401/403 for unauthorized access.",
                evidence_id=evidence.id,
                auth_context="anonymous",
                exploitability=90 if contains_pii else 70 + min(record_count, 20),
                confidence=0.9,
            )
        elif evidence.kind == "browser.client_sink":
            finding = self._upsert(
                rule_id=f"browser-sink-{slugify(str(evidence.data.get('signal', 'signal')))}",
                module_id=evidence.module_id,
                severity="medium",
                title="Client-side security sink detected",
                summary=evidence.summary,
                remediation="Review the referenced client-side sink and ensure attacker-controlled values cannot flow into redirects, DOM injection, or script execution paths.",
                evidence_id=evidence.id,
                auth_context="anonymous",
                exploitability=42,
                confidence=0.72,
            )
        elif evidence.kind in {"browser.api_discovery", "browser.authenticated_route", "browser.snapshot", "browser.capture_error"}:
            finding = None
        elif evidence.kind in DEEP_RULES:
            config = DEEP_RULES[evidence.kind]
            finding = self._upsert(
                rule_id=f"{slugify(evidence.kind)}-{slugify(str(evidence.url or evidence.data.get('route') or evidence.id))}",
                module_id=evidence.module_id,
                severity=config["severity"],
                title=config["title"],
                summary=evidence.summary,
                remediation=config["remediation"],
                evidence_id=evidence.id,
                auth_context=config["auth_context"],
                exploitability=config["exploitability"],
                confidence=config["confidence"],
            )

        return [finding] if finding else []

    def _upsert(
        self,
        *,
        rule_id: str,
        module_id: str,
        severity: str,
        title: str,
        summary: str,
        remediation: str,
        evidence_id: str,
        auth_context: str,
        exploitability: int,
        confidence: float,
    ) -> AuditFinding:
        now = utc_now()
        existing = self._findings.get(rule_id)
        if existing:
            existing.updated_at = now
            existing.status = "updated"
            if evidence_id not in existing.evidence_ids:
                existing.evidence_ids.append(evidence_id)
            return existing

        finding = AuditFinding(
            id=f"{self.run_id}-{rule_id}",
            run_id=self.run_id,
            rule_id=rule_id,
            created_at=now,
            updated_at=now,
            severity=severity,
            confidence=confidence,
            exploitability=max(0, min(100, int(exploitability))),
            module_id=module_id,
            title=title,
            summary=summary,
            remediation=remediation,
            evidence_ids=[evidence_id],
            auth_context=auth_context,
        )
        self._findings[rule_id] = finding
        return finding

    @property
    def findings(self) -> list[AuditFinding]:
        order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
        return sorted(
            self._findings.values(),
            key=lambda item: (order.get(item.severity, 99), -item.exploitability, item.created_at),
        )


def build_risk_summary(findings: Iterable[AuditFinding]) -> RiskSummary:
    counts = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
    score = 0
    for finding in findings:
        counts[finding.severity] = counts.get(finding.severity, 0) + 1
        score += SEVERITY_WEIGHT.get(finding.severity, 0)

    if score >= 80:
        level = "critical"
    elif score >= 45:
        level = "high"
    elif score >= 20:
        level = "medium"
    elif score > 0:
        level = "low"
    else:
        level = "info"

    return RiskSummary(
        score=min(score, 100),
        level=level,
        finding_counts=counts,
    )


class BaseAnalyst:
    provider = "heuristic"
    model = "local-rules"

    def analyze(
        self,
        *,
        module_id: str,
        evidence: list[AuditEvidence],
        findings: list[AuditFinding],
    ) -> AuditHypothesis | None:
        raise NotImplementedError


class HeuristicAnalyst(BaseAnalyst):
    def analyze(
        self,
        *,
        module_id: str,
        evidence: list[AuditEvidence],
        findings: list[AuditFinding],
    ) -> AuditHypothesis | None:
        if not evidence:
            return None

        top_findings = findings[:3]
        if top_findings:
            hypothesis = "; ".join(f"{item.severity}: {item.title}" for item in top_findings)
            rationale = "Recent evidence clusters around externally reachable surfaces with weak controls."
            next_module = "advanced-http-probing" if any(item.severity in {"critical", "high"} for item in top_findings) else "browser-network-review"
            confidence = 0.68 if any(item.severity in {"critical", "high"} for item in top_findings) else 0.48
        else:
            hypothesis = evidence[-1].summary
            rationale = "The current evidence is discovery-heavy; deeper validation should focus on newly discovered routes."
            next_module = "api-surface"
            confidence = 0.35

        return AuditHypothesis(
            id=f"hyp-{module_id}-{slugify(evidence[-1].id)}",
            created_at=utc_now(),
            provider=self.provider,
            model=self.model,
            hypothesis=hypothesis,
            correlation_group=slugify(module_id),
            confidence=confidence,
            rationale=rationale,
            recommended_next_module=next_module,
        )


class ShellAnalyst(BaseAnalyst):
    def __init__(self, command: list[str], provider: str = "shell", model: str = "external"):
        self.command = command
        self.provider = provider
        self.model = model

    def analyze(
        self,
        *,
        module_id: str,
        evidence: list[AuditEvidence],
        findings: list[AuditFinding],
    ) -> AuditHypothesis | None:
        payload = {
            "module_id": module_id,
            "evidence": [item.data | {"kind": item.kind, "title": item.title, "summary": item.summary} for item in evidence[-12:]],
            "findings": [
                {
                    "severity": item.severity,
                    "title": item.title,
                    "summary": item.summary,
                    "exploitability": item.exploitability,
                }
                for item in findings[:8]
            ],
            "task": (
                "Return compact JSON with keys hypothesis, correlation_group, confidence, "
                "recommended_next_module, rationale. Do not include markdown."
            ),
        }

        try:
            proc = subprocess.run(
                self.command,
                input=json.dumps(payload),
                capture_output=True,
                text=True,
                timeout=20,
                check=False,
            )
        except Exception:
            return None

        if proc.returncode != 0 or not proc.stdout.strip():
            return None

        try:
            data = json.loads(proc.stdout.strip())
        except json.JSONDecodeError:
            return None

        return AuditHypothesis(
            id=f"hyp-{module_id}-{slugify(str(data.get('correlation_group', module_id)))}",
            created_at=utc_now(),
            provider=self.provider,
            model=self.model,
            hypothesis=str(data.get("hypothesis", "")).strip() or "External analyst returned no hypothesis.",
            correlation_group=str(data.get("correlation_group", module_id)).strip() or module_id,
            confidence=float(data.get("confidence", 0.4) or 0.4),
            rationale=str(data.get("rationale", "")).strip() or "External analyst supplied no rationale.",
            recommended_next_module=str(data.get("recommended_next_module", "")).strip() or None,
        )


def build_analyst(provider: str = "auto", command: str | None = None) -> BaseAnalyst:
    if provider == "off":
        return HeuristicAnalyst()

    if command:
        pieces = command.split()
        detected_provider = pieces[0] if pieces else "shell"
        return ShellAnalyst(
            pieces,
            provider=detected_provider if detected_provider in {"claude", "codex"} else "shell",
            model=detected_provider if detected_provider else "external",
        )

    return HeuristicAnalyst()
