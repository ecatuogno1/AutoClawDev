from __future__ import annotations

import argparse
import asyncio
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

from .analysts import RuleEngine, build_analyst, build_risk_summary
from .browser import collect_browser_snapshot
from .collectors import AsyncRequestor, bootstrap_auth_session, collect_api_surface, collect_http_recon
from .deep_modules import (
    DEEP_MODULE_CONFIGS,
    run_deep_authz_suite,
    run_deep_injection_suite,
    run_deep_ssrf_suite,
    select_deep_modules,
)
from .models import (
    AuditEvent,
    AuditEvidence,
    AuditModuleRecord,
    AuditPolicy,
    AuditRun,
    AuditSession,
    AuditTarget,
    OperatorCommandRecord,
    normalize_url,
    slugify,
    utc_now,
)
from .reporting import (
    build_markdown_report,
    write_html_export,
    write_json_export,
    write_markdown_export,
    write_pdf_export,
)
from .storage import FileAuditStore


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def default_artifact_root(target_url: str) -> Path:
    parsed = urlparse(target_url)
    stamp = utc_now().replace(":", "-")
    return Path.home() / "Desktop" / f"web_audit_{slugify(parsed.netloc or parsed.path)}_{stamp}"


def normalize_mode(mode: str) -> str:
    return "deep" if mode in {"hacker", "deep"} else "triage"


def load_json_file(path: Path, fallback):
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return fallback


def build_policy(args: argparse.Namespace) -> AuditPolicy:
    mode = normalize_mode(args.mode)
    approvals = {}
    for gate in (args.approve_gate or []):
        approvals[gate] = True
    request_budget = 320 if mode == "deep" else 150
    concurrency = 12 if mode == "deep" else 8
    rate_limit = 10.0 if mode == "deep" else 6.0
    return AuditPolicy(
        target_scope=[args.target],
        max_concurrency=concurrency,
        request_budget=request_budget,
        rate_limit_per_second=rate_limit,
        escalation_approvals=approvals,
        owned_target=bool(getattr(args, "owned_target", False)),
        authorization_note=getattr(args, "authorization_note", None),
        operator_command_budget=int(getattr(args, "operator_command_budget", 5)),
        operator_allowed_commands=list(getattr(args, "operator_allowed_command", []) or ["curl", "python3", "node", "npx", "wget"]),
    )


def module_catalog() -> list[AuditModuleRecord]:
    return [
        AuditModuleRecord(id="auth-bootstrap", label="Auth Bootstrap", class_name="auth"),
        AuditModuleRecord(id="recon-http", label="HTTP Recon", class_name="recon"),
        AuditModuleRecord(id="browser-snapshot", label="Browser Snapshot", class_name="browser"),
        AuditModuleRecord(id="api-surface", label="API Surface", class_name="api"),
        AuditModuleRecord(id="advanced-http-probing", label="Advanced HTTP Orchestrator", class_name="advanced"),
        AuditModuleRecord(id="deep-injection-suite", label="Deep Injection Suite", class_name="advanced"),
        AuditModuleRecord(id="deep-authz-suite", label="Deep AuthZ Suite", class_name="advanced"),
        AuditModuleRecord(id="deep-ssrf-suite", label="Server-Side Trust Suite", class_name="advanced"),
        AuditModuleRecord(id="operator-shell", label="Operator Shell", class_name="operator"),
        AuditModuleRecord(id="reporting", label="Structured Reporting", class_name="reporting"),
    ]


def build_namespace_from_run_record(
    data: dict,
    *,
    llm_provider: str,
    llm_command: str | None,
    approve_gates: list[str] | None = None,
) -> argparse.Namespace:
    policy = data.get("policy", {})
    return argparse.Namespace(
        target=data["target"]["url"],
        project_key=data.get("projectKey"),
        output=data.get("artifactRoot"),
        mode=data.get("mode", "triage"),
        timeout=15,
        bearer_token=None,
        cookie=None,
        api_key=None,
        api_key_header="X-API-Key",
        login_config=None,
        browser_login_config=None,
        llm_provider=llm_provider,
        llm_command=llm_command,
        approve_gate=approve_gates or [],
        run_id=data["id"],
        owned_target=bool(policy.get("ownedTarget")),
        authorization_note=policy.get("authorizationNote"),
        operator_command_budget=policy.get("operatorCommandBudget", 5),
        operator_allowed_command=policy.get("operatorAllowedCommands", ["curl", "python3", "node", "npx", "wget"]),
    )


class AuditRuntime:
    def __init__(self, args: argparse.Namespace, *, run_id: str | None = None, artifact_root: Path | None = None):
        target_url = normalize_url(args.target)
        parsed = urlparse(target_url)
        self.args = args
        self.repo_root = repo_root()
        self.policy = build_policy(args)
        self.target = AuditTarget(
            url=target_url,
            hostname=parsed.hostname or target_url,
            project_key=args.project_key,
            label=args.project_key or parsed.hostname or target_url,
        )
        self.run_id = run_id or (args.run_id or f"wa-{slugify(self.target.label or 'target')}-{int(time.time() * 1000)}")
        self.artifact_root = artifact_root or Path(args.output or default_artifact_root(target_url))
        self.store = FileAuditStore(self.artifact_root)
        self.rule_engine = RuleEngine(self.run_id)
        self.analyst = build_analyst(args.llm_provider, args.llm_command)
        self.evidence: list[AuditEvidence] = []
        self.hypotheses = []
        self.operator_commands: list[OperatorCommandRecord] = []
        self.modules = module_catalog()
        self.run = AuditRun(
            id=self.run_id,
            project_key=args.project_key,
            target=self.target,
            policy=self.policy,
            mode=normalize_mode(args.mode),
            artifact_root=str(self.artifact_root),
            current_phase="queued",
            approvals_pending=[],
            approved_gates=[],
            auth_contexts=[],
            modules=self.modules,
        )
        self.hydrate_existing_state()

    def hydrate_existing_state(self) -> None:
        current = self.store.read_run()
        if not current:
            return

        self.evidence = [
            AuditEvidence(
                id=item["id"],
                run_id=item["runId"],
                timestamp=item["timestamp"],
                kind=item["kind"],
                module_id=item["moduleId"],
                title=item["title"],
                summary=item["summary"],
                data=item.get("data", {}),
                severity_hint=item.get("severityHint"),
                url=item.get("url"),
            )
            for item in load_json_file(self.store.evidence_path, [])
        ]
        for item in self.evidence:
            self.rule_engine.observe(item)

        self.hypotheses = load_json_file(self.store.hypotheses_path, [])
        self.operator_commands = [
            OperatorCommandRecord(
                id=item["id"],
                command=item["command"],
                module_id=item["moduleId"],
                started_at=item["startedAt"],
                completed_at=item.get("completedAt"),
                exit_code=item.get("exitCode"),
                status=item.get("status", "running"),
                stdout_excerpt=item.get("stdoutExcerpt"),
                stderr_excerpt=item.get("stderrExcerpt"),
            )
            for item in load_json_file(self.store.operator_commands_path, [])
        ]
        self.run.status = current.get("status", self.run.status)
        self.run.summary = current.get("summary")
        self.run.created_at = current.get("createdAt", self.run.created_at)
        self.run.updated_at = current.get("updatedAt", self.run.updated_at)
        self.run.started_at = current.get("startedAt")
        self.run.completed_at = current.get("completedAt")
        self.run.current_phase = current.get("currentPhase", self.run.current_phase)
        self.run.findings_count = int(current.get("findingsCount", len(self.rule_engine.findings)))
        self.run.evidence_count = int(current.get("evidenceCount", len(self.evidence)))
        self.run.approvals_pending = list(current.get("approvalsPending", []))
        self.run.approved_gates = list(current.get("approvedGates", []))
        self.run.exports = dict(current.get("exports", {}))
        self.run.risk.score = int(current.get("risk", {}).get("score", 0))
        self.run.risk.level = current.get("risk", {}).get("level", "info")
        self.run.risk.finding_counts = current.get("risk", {}).get("findingCounts", self.run.risk.finding_counts)
        self.run.auth_contexts = [
            AuditSession(
                id=item["id"],
                kind=item["kind"],
                label=item["label"],
                reused=bool(item.get("reused")),
                privilege_level=item.get("privilegeLevel"),
                browser_state_path=item.get("browserStatePath"),
                http_headers=item.get("httpHeaders", {}),
                cookies=item.get("cookies", []),
                observed_routes=item.get("observedRoutes", []),
                created_at=item.get("createdAt", utc_now()),
            )
            for item in current.get("authContexts", [])
        ]
        self.run.policy.escalation_approvals.update(current.get("policy", {}).get("escalationApprovals", {}))
        self.run.policy.owned_target = bool(current.get("policy", {}).get("ownedTarget", self.run.policy.owned_target))
        self.run.policy.authorization_note = current.get("policy", {}).get("authorizationNote", self.run.policy.authorization_note)
        self.run.policy.operator_command_budget = int(current.get("policy", {}).get("operatorCommandBudget", self.run.policy.operator_command_budget))
        self.run.policy.operator_allowed_commands = list(current.get("policy", {}).get("operatorAllowedCommands", self.run.policy.operator_allowed_commands))
        for module in self.modules:
            existing = next((item for item in current.get("modules", []) if item.get("id") == module.id), None)
            if existing:
                module.status = existing.get("status", module.status)
                module.started_at = existing.get("startedAt")
                module.completed_at = existing.get("completedAt")
                module.detail = existing.get("detail")

    def console(self, message: str) -> None:
        print(message)
        self.store.append_console(message)

    def emit(self, event_type: str, message: str, data: dict | None = None) -> None:
        event = AuditEvent(
            id=f"{self.run_id}-{slugify(event_type)}-{int(time.time() * 1000)}",
            run_id=self.run_id,
            project_key=self.run.project_key,
            timestamp=utc_now(),
            type=event_type,
            message=message,
            data=data,
        )
        self.store.append_event(event)
        self.console(f"[{event_type}] {message}")

    def persist(self) -> None:
        findings = self.rule_engine.findings
        self.run.findings_count = len(findings)
        self.run.evidence_count = len(self.evidence)
        self.run.risk = build_risk_summary(findings)
        self.run.latest_hypothesis = self.hypotheses[-1] if self.hypotheses else None
        self.store.write_run(self.run)
        self.store.write_findings(findings)
        self.store.write_evidence(self.evidence)
        self.store.write_hypotheses(self.hypotheses)
        self.store.write_operator_commands(self.operator_commands)

    def add_auth_context(self, session: AuditSession) -> None:
        if any(item.id == session.id for item in self.run.auth_contexts):
            return
        self.run.auth_contexts.append(session)
        self.persist()

    def update_module(self, module_id: str, status: str, detail: str | None = None) -> None:
        now = utc_now()
        for module in self.modules:
            if module.id != module_id:
                continue
            previous = module.status
            module.status = status
            if status == "running" and not module.started_at:
                module.started_at = now
            if status in {"completed", "failed", "skipped"}:
                module.completed_at = now
            module.detail = detail or module.detail
            if status == "running" and previous != "running":
                self.emit("module.started", module.label, {"moduleId": module_id})
            if status in {"completed", "failed", "skipped"} and previous != status:
                self.emit("module.completed", module.detail or module.label, {"moduleId": module_id, "status": status})
        self.run.current_phase = module_id
        self.persist()

    def should_run_module(self, module_id: str) -> bool:
        module = next((item for item in self.modules if item.id == module_id), None)
        if not module:
            return False
        if module_id == "reporting":
            return True
        if module_id == "advanced-http-probing":
            deep_modules = [item for item in self.modules if item.id in DEEP_MODULE_CONFIGS]
            return any(item.status != "completed" for item in deep_modules)
        if module.status == "completed":
            return False
        if module.status == "skipped" and module_id.startswith("deep-"):
            return True
        return True

    def absorb_evidence(self, items: list[AuditEvidence]) -> None:
        for item in items:
            self.evidence.append(item)
            self.emit("evidence.discovered", item.summary, {"kind": item.kind, "moduleId": item.module_id})
            new_findings = self.rule_engine.observe(item)
            for finding in new_findings:
                event_type = "finding.updated" if finding.status == "updated" else "finding.opened"
                self.emit(
                    event_type,
                    finding.title,
                    {"severity": finding.severity, "moduleId": finding.module_id, "ruleId": finding.rule_id},
                )
        self.persist()

    def maybe_analyze(self, module_id: str) -> None:
        recent = [item for item in self.evidence if item.module_id == module_id][-8:]
        hypothesis = self.analyst.analyze(module_id=module_id, evidence=recent, findings=self.rule_engine.findings)
        if not hypothesis:
            return
        self.hypotheses.append(hypothesis)
        self.emit(
            "run.note",
            hypothesis.hypothesis,
            {
                "provider": hypothesis.provider,
                "confidence": hypothesis.confidence,
                "nextModule": hypothesis.recommended_next_module,
            },
        )
        self.persist()

    def approved(self, gate: str) -> bool:
        return bool(self.run.policy.escalation_approvals.get(gate) or gate in self.run.approved_gates)

    def mark_gate_approved(self, gate: str) -> None:
        self.run.policy.escalation_approvals[gate] = True
        if gate not in self.run.approved_gates:
            self.run.approved_gates.append(gate)
        if gate in self.run.approvals_pending:
            self.run.approvals_pending.remove(gate)
        self.emit("escalation.approved", f"{gate} approved for this run.", {"gate": gate})
        self.persist()

    def request_gate(self, gate: str, rationale: str) -> None:
        if gate not in self.run.approvals_pending:
            self.run.approvals_pending.append(gate)
            self.emit("escalation.requested", rationale, {"gate": gate})
        self.run.status = "awaiting_approval"
        self.persist()

    def derive_discovered_routes(self) -> list[str]:
        routes: set[str] = set()
        for item in self.evidence:
            if item.kind in {"browser.api_discovery", "browser.authenticated_route", "api.public_json"}:
                route = item.data.get("route")
                if route:
                    routes.add(str(route))
            if item.kind == "path.exposed":
                path = item.data.get("path")
                if path:
                    routes.add(str(path))
        for session in self.run.auth_contexts:
            for route in session.observed_routes:
                routes.add(route)
        return sorted(routes)

    async def execute_deep_modules(self, requestor: AsyncRequestor, discovered_routes: list[str], audit_session: AuditSession) -> None:
        if not self.should_run_module("advanced-http-probing"):
            return

        self.update_module("advanced-http-probing", "running", "Selecting bounded deep modules from triage evidence")
        selected = select_deep_modules(
            evidence=self.evidence,
            routes=sorted(set(discovered_routes + audit_session.observed_routes)),
            auth_kinds=[item.kind for item in self.run.auth_contexts] or [audit_session.kind],
        )

        if self.run.mode != "deep":
            self.update_module("advanced-http-probing", "skipped", "Standard mode stays triage-only")
            for module_id in DEEP_MODULE_CONFIGS:
                self.update_module(module_id, "skipped", "Deep suites require --mode deep")
            return

        if not self.run.policy.owned_target:
            self.update_module("advanced-http-probing", "skipped", "Owned-target attestation required for deep suites")
            for module_id in DEEP_MODULE_CONFIGS:
                self.update_module(module_id, "skipped", "Deep suites require --owned-target")
            return

        if not selected:
            self.update_module("advanced-http-probing", "completed", "No deep suites selected from current evidence")
            for module_id in DEEP_MODULE_CONFIGS:
                self.update_module(module_id, "skipped", "No supporting evidence for this suite")
            return

        self.update_module("advanced-http-probing", "completed", f"Selected suites: {', '.join(selected)}")
        routes = sorted(set(discovered_routes + audit_session.observed_routes))
        for module_id in selected:
            config = DEEP_MODULE_CONFIGS[module_id]
            if not self.approved(config.gate):
                self.update_module(module_id, "skipped", f"Awaiting approval for {config.gate}")
                self.request_gate(config.gate, f"{config.label} has supporting evidence but requires explicit approval.")
                continue

            self.mark_gate_approved(config.gate)
            self.update_module(module_id, "running", f"Approved bounded probe: {config.label}")
            if module_id == "deep-injection-suite":
                items = await run_deep_injection_suite(
                    run_id=self.run_id,
                    module_id=module_id,
                    target_url=self.target.url,
                    requestor=requestor,
                    routes=routes,
                    mode=self.run.mode,
                )
            elif module_id == "deep-authz-suite":
                items = await run_deep_authz_suite(
                    run_id=self.run_id,
                    module_id=module_id,
                    target_url=self.target.url,
                    requestor=requestor,
                    routes=routes,
                    prior_evidence=self.evidence,
                )
            else:
                items = await run_deep_ssrf_suite(
                    run_id=self.run_id,
                    module_id=module_id,
                    target_url=self.target.url,
                    requestor=requestor,
                    routes=routes,
                )
            if items:
                self.absorb_evidence(items)
                self.maybe_analyze(module_id)
                self.update_module(module_id, "completed", f"{len(items)} deep evidence events recorded")
            else:
                self.update_module(module_id, "completed", "No deep validation signals observed")

    async def execute(self) -> int:
        self.run.status = "running"
        self.run.started_at = self.run.started_at or utc_now()
        self.persist()

        existing_session = self.run.auth_contexts[0] if self.run.auth_contexts else None
        session, audit_session, auth_metadata = bootstrap_auth_session(
            target_url=self.target.url,
            bearer_token=self.args.bearer_token,
            cookie=self.args.cookie,
            api_key=self.args.api_key,
            api_key_header=self.args.api_key_header,
            login_config_path=self.args.login_config,
            browser_login_config_path=self.args.browser_login_config,
            output_dir=self.artifact_root,
            repo_root=self.repo_root,
            timeout=self.args.timeout,
            existing_session=existing_session,
        )
        self.add_auth_context(audit_session)
        self.update_module("auth-bootstrap", "completed", audit_session.label)
        self.emit(
            "auth.session_ready",
            f"{audit_session.label} ready.",
            {
                "kind": audit_session.kind,
                "privilegeLevel": audit_session.privilege_level,
                "observedRoutes": audit_session.observed_routes,
                "metadata": auth_metadata or {},
            },
        )

        requestor = AsyncRequestor(
            session,
            concurrency=self.policy.max_concurrency,
            timeout=self.args.timeout,
            rate_limit_per_second=self.policy.rate_limit_per_second,
        )
        discovered_routes = self.derive_discovered_routes()

        try:
            if self.should_run_module("recon-http"):
                self.update_module("recon-http", "running", "Reconnaissance and safe path discovery")
                recon_evidence, recon_routes = await collect_http_recon(
                    run_id=self.run_id,
                    module_id="recon-http",
                    target_url=self.target.url,
                    requestor=requestor,
                )
                discovered_routes.extend(recon_routes)
                self.absorb_evidence(recon_evidence)
                self.maybe_analyze("recon-http")
                self.update_module("recon-http", "completed", f"Discovered {len(recon_routes)} candidate routes")

            if self.policy.browser_enabled and self.should_run_module("browser-snapshot"):
                self.update_module("browser-snapshot", "running", "Browser capture, HAR parsing, and client-side review")
                browser_evidence, browser_routes, browser_result = collect_browser_snapshot(
                    run_id=self.run_id,
                    module_id="browser-snapshot",
                    target_url=self.target.url,
                    output_dir=self.artifact_root / "browser",
                    repo_root=self.repo_root,
                    browser_state_path=audit_session.browser_state_path,
                    auth_kind=audit_session.kind,
                )
                discovered_routes.extend(browser_routes)
                self.absorb_evidence(browser_evidence)
                self.maybe_analyze("browser-snapshot")
                detail = f"{len(browser_routes)} browser-discovered routes"
                if browser_result.get("assessment", {}).get("status"):
                    detail = f"{detail}; browser assessment {browser_result['assessment']['status']}"
                self.update_module("browser-snapshot", "completed", detail)
            elif not self.policy.browser_enabled:
                self.update_module("browser-snapshot", "skipped", "Browser collection disabled by policy")

            if self.policy.api_enabled and self.should_run_module("api-surface"):
                self.update_module("api-surface", "running", "API discovery and exposure validation")
                api_evidence = await collect_api_surface(
                    run_id=self.run_id,
                    module_id="api-surface",
                    target_url=self.target.url,
                    requestor=requestor,
                    routes=sorted(set(discovered_routes + audit_session.observed_routes)),
                    auth_kind=audit_session.kind,
                )
                self.absorb_evidence(api_evidence)
                self.maybe_analyze("api-surface")
                self.update_module("api-surface", "completed", f"Evaluated {min(len(discovered_routes), 30)} routes")
            elif not self.policy.api_enabled:
                self.update_module("api-surface", "skipped", "API collection disabled by policy")

            await self.execute_deep_modules(requestor, discovered_routes, audit_session)

            self.update_module("reporting", "running", "Writing canonical JSON and human-readable exports")
            self.run.summary = self.build_summary(audit_session.label)
            self.write_exports()
            self.update_module("reporting", "completed", "Exports generated")

            if self.run.status != "awaiting_approval":
                self.run.status = "completed"
            self.run.completed_at = utc_now()
            self.persist()
            self.emit("run.completed", self.run.summary or "Audit completed")
            return 0
        except Exception as exc:  # pragma: no cover
            self.run.status = "failed"
            self.run.summary = f"Audit failed: {exc}"
            self.run.completed_at = utc_now()
            self.persist()
            self.emit("run.failed", str(exc))
            return 1
        finally:
            requestor.close()

    def build_summary(self, session_label: str) -> str:
        findings = self.rule_engine.findings
        if not findings:
            return f"{session_label}: no high-signal findings detected during the current audit pass."
        top = findings[:3]
        titles = ", ".join(item.title for item in top)
        return (
            f"{session_label}: {len(findings)} findings from {len(self.evidence)} evidence events. "
            f"Highest-risk issues: {titles}."
        )

    def write_exports(self) -> None:
        findings = self.rule_engine.findings
        json_path = self.artifact_root / "export.json"
        markdown_path = self.artifact_root / "report.md"
        html_path = self.artifact_root / "report.html"
        pdf_path = self.artifact_root / "report.pdf"
        markdown = build_markdown_report(self.run, findings, self.evidence, self.hypotheses)
        write_json_export(json_path, self.run, findings, self.evidence, self.hypotheses)
        write_markdown_export(markdown_path, markdown)
        write_html_export(html_path, markdown)
        write_pdf_export(pdf_path, markdown)
        exports = {
            "json": str(json_path),
            "markdown": str(markdown_path),
            "html": str(html_path),
        }
        if pdf_path.exists():
            exports["pdf"] = str(pdf_path)
        self.run.exports = exports
        self.persist()


def load_run_context(run_root: Path) -> dict:
    run_path = run_root / "run.json"
    if not run_path.exists():
        raise SystemExit(f"Run metadata not found: {run_path}")
    return json.loads(run_path.read_text(encoding="utf-8"))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Structured AutoClawDev web audit engine")
    subparsers = parser.add_subparsers(dest="command")

    def add_run_args(target_parser: argparse.ArgumentParser) -> None:
        target_parser.add_argument("target", help="Target URL")
        target_parser.add_argument("--project-key", default=None)
        target_parser.add_argument("--output", default=None)
        target_parser.add_argument("--mode", choices=["standard", "hacker", "triage", "deep"], default="standard")
        target_parser.add_argument("--timeout", type=int, default=15)
        target_parser.add_argument("--bearer-token", default=None)
        target_parser.add_argument("--cookie", default=None)
        target_parser.add_argument("--api-key", default=None)
        target_parser.add_argument("--api-key-header", default="X-API-Key")
        target_parser.add_argument("--login-config", default=None)
        target_parser.add_argument("--browser-login-config", default=None)
        target_parser.add_argument("--owned-target", action="store_true")
        target_parser.add_argument("--authorization-note", default=None)
        target_parser.add_argument("--llm-provider", default="auto")
        target_parser.add_argument("--llm-command", default=None)
        target_parser.add_argument("--approve-gate", action="append", default=[])
        target_parser.add_argument("--run-id", default=None)
        target_parser.add_argument("--operator-command-budget", type=int, default=5)
        target_parser.add_argument("--operator-allowed-command", action="append", default=[])

    run_parser = subparsers.add_parser("run", help="Start a new structured web audit")
    add_run_args(run_parser)

    resume_parser = subparsers.add_parser("resume", help="Resume a run using its existing artifact directory")
    resume_parser.add_argument("run_root", help="Path to .autoclaw/web-audits/<run-id>")
    resume_parser.add_argument("--llm-provider", default="auto")
    resume_parser.add_argument("--llm-command", default=None)
    resume_parser.add_argument("--approve-gate", action="append", default=[])

    approve_parser = subparsers.add_parser("approve", help="Approve a gated escalation for an existing run")
    approve_parser.add_argument("run_root", help="Path to .autoclaw/web-audits/<run-id>")
    approve_parser.add_argument("gate", help="Gate name to approve")

    export_parser = subparsers.add_parser("export", help="Rebuild exports for an existing run")
    export_parser.add_argument("run_root", help="Path to .autoclaw/web-audits/<run-id>")

    operator_parser = subparsers.add_parser("operator", help="Run an approved operator command inside a run context")
    operator_parser.add_argument("run_root", help="Path to .autoclaw/web-audits/<run-id>")
    operator_parser.add_argument("command_args", nargs=argparse.REMAINDER)

    return parser


def run_from_existing(run_root: Path, *, llm_provider: str, llm_command: str | None, approve_gates: list[str]) -> int:
    data = load_run_context(run_root)
    args = build_namespace_from_run_record(
        data,
        llm_provider=llm_provider,
        llm_command=llm_command,
        approve_gates=approve_gates,
    )
    runtime = AuditRuntime(args, run_id=data["id"], artifact_root=run_root)
    for gate in approve_gates:
        runtime.mark_gate_approved(gate)
    return asyncio.run(runtime.execute())


def handle_approve(run_root: Path, gate: str) -> int:
    data = load_run_context(run_root)
    approvals = data.get("policy", {}).get("escalationApprovals", {})
    approvals[gate] = True
    pending = [item for item in data.get("approvalsPending", []) if item != gate]
    approved = list(data.get("approvedGates", []))
    if gate not in approved:
        approved.append(gate)
    data["policy"]["escalationApprovals"] = approvals
    data["approvalsPending"] = pending
    data["approvedGates"] = approved
    data["status"] = "running"
    (run_root / "run.json").write_text(f"{json.dumps(data, indent=2)}\n", encoding="utf-8")
    print(json.dumps({"ok": True, "runRoot": str(run_root), "gate": gate}))
    return 0


def handle_export(run_root: Path) -> int:
    data = load_run_context(run_root)
    findings = load_json_file(run_root / "findings.json", [])
    evidence = load_json_file(run_root / "evidence.json", [])
    hypotheses = load_json_file(run_root / "hypotheses.json", [])

    args = build_namespace_from_run_record(data, llm_provider="off", llm_command=None)
    runtime = AuditRuntime(args, run_id=data["id"], artifact_root=run_root)
    runtime.run.summary = data.get("summary")
    runtime.run.status = data.get("status", "completed")
    runtime.run.exports = data.get("exports", {})
    runtime.run.approvals_pending = data.get("approvalsPending", [])
    runtime.run.approved_gates = data.get("approvedGates", [])
    markdown = build_markdown_report(runtime.run, findings, evidence, hypotheses)
    json_path = run_root / "export.json"
    markdown_path = run_root / "report.md"
    html_path = run_root / "report.html"
    pdf_path = run_root / "report.pdf"
    write_json_export(json_path, runtime.run, findings, evidence, hypotheses)
    write_markdown_export(markdown_path, markdown)
    write_html_export(html_path, markdown)
    write_pdf_export(pdf_path, markdown)
    exports = {
        "json": str(json_path),
        "markdown": str(markdown_path),
        "html": str(html_path),
    }
    if pdf_path.exists():
        exports["pdf"] = str(pdf_path)
    print(json.dumps(exports, indent=2))
    return 0


def handle_operator(run_root: Path, command_args: list[str]) -> int:
    data = load_run_context(run_root)
    args = build_namespace_from_run_record(data, llm_provider="off", llm_command=None)
    runtime = AuditRuntime(args, run_id=data["id"], artifact_root=run_root)

    if not runtime.run.policy.owned_target:
        print(json.dumps({"ok": False, "error": "operator-shell requires owned-target attestation"}))
        return 1
    if not runtime.approved("operator-shell"):
        print(json.dumps({"ok": False, "error": "operator-shell gate is not approved for this run"}))
        return 1

    argv = list(command_args)
    if argv and argv[0] == "--":
        argv = argv[1:]
    if not argv:
        print(json.dumps({"ok": False, "error": "operator command is required"}))
        return 1

    binary = Path(argv[0]).name
    if binary not in set(runtime.run.policy.operator_allowed_commands):
        print(json.dumps({"ok": False, "error": f"command {binary} is not in the operator allowlist"}))
        return 1

    completed_commands = sum(1 for item in runtime.operator_commands if item.status in {"completed", "failed"})
    if completed_commands >= runtime.run.policy.operator_command_budget:
        print(json.dumps({"ok": False, "error": "operator command budget exhausted for this run"}))
        return 1

    record = OperatorCommandRecord(
        id=f"{runtime.run_id}-operator-{int(time.time() * 1000)}",
        command=" ".join(argv),
        module_id="operator-shell",
        started_at=utc_now(),
        status="running",
    )
    runtime.operator_commands.append(record)
    runtime.update_module("operator-shell", "running", f"Executing operator command: {' '.join(argv)}")
    runtime.emit("operator.command_started", record.command, {"commandId": record.id})
    runtime.persist()

    env = {
        **os.environ,
        "AUTOCLAW_AUDIT_TARGET_URL": runtime.target.url,
        "AUTOCLAW_AUDIT_TARGET_HOSTNAME": runtime.target.hostname,
        "AUTOCLAW_AUDIT_RUN_ROOT": str(run_root),
    }
    proc = subprocess.run(argv, cwd=run_root, capture_output=True, text=True, env=env, check=False)
    record.completed_at = utc_now()
    record.exit_code = proc.returncode
    record.status = "completed" if proc.returncode == 0 else "failed"
    record.stdout_excerpt = proc.stdout[:4000] if proc.stdout else None
    record.stderr_excerpt = proc.stderr[:4000] if proc.stderr else None

    new_evidence: list[AuditEvidence] = []
    for line in proc.stdout.splitlines():
        if not line.startswith("AUTOCLAW_EVIDENCE:"):
            continue
        try:
            payload = json.loads(line.split("AUTOCLAW_EVIDENCE:", 1)[1].strip())
        except json.JSONDecodeError:
            continue
        new_evidence.append(
            AuditEvidence(
                id=f"{runtime.run_id}-operator-evidence-{int(time.time() * 1000)}",
                run_id=runtime.run_id,
                timestamp=utc_now(),
                kind=str(payload.get("kind") or "operator.command_result"),
                module_id="operator-shell",
                title=str(payload.get("title") or "Operator command evidence"),
                summary=str(payload.get("summary") or f"Operator command emitted evidence: {record.command}"),
                data=payload,
                severity_hint=str(payload.get("severityHint") or "info"),
                url=str(payload.get("url")) if payload.get("url") else runtime.target.url,
            )
        )

    runtime.emit(
        "operator.command_completed",
        record.command,
        {"commandId": record.id, "exitCode": record.exit_code, "status": record.status},
    )
    if new_evidence:
        runtime.absorb_evidence(new_evidence)
    runtime.update_module("operator-shell", "completed", f"Command exited with {record.exit_code}")
    runtime.persist()
    print(
        json.dumps(
            {
                "ok": proc.returncode == 0,
                "exitCode": proc.returncode,
                "stdout": proc.stdout[:4000],
                "stderr": proc.stderr[:4000],
                "evidenceCount": len(new_evidence),
            },
            indent=2,
        )
    )
    return 0 if proc.returncode == 0 else 1


def run_cli(argv: list[str] | None = None) -> int:
    parser = build_parser()
    raw_args = list(argv or sys.argv[1:])
    if raw_args and raw_args[0] not in {"run", "resume", "approve", "export", "operator"}:
        raw_args = ["run", *raw_args]
    args = parser.parse_args(raw_args)

    if args.command == "resume":
        return run_from_existing(Path(args.run_root), llm_provider=args.llm_provider, llm_command=args.llm_command, approve_gates=args.approve_gate)
    if args.command == "approve":
        return handle_approve(Path(args.run_root), args.gate)
    if args.command == "export":
        return handle_export(Path(args.run_root))
    if args.command == "operator":
        return handle_operator(Path(args.run_root), args.command_args)

    runtime = AuditRuntime(args)
    return asyncio.run(runtime.execute())
