from __future__ import annotations

import json
import subprocess
from pathlib import Path
from urllib.parse import urlparse

from .models import AuditEvidence, AuditSession, slugify, utc_now


def parse_har_api_routes(har_path: Path, target_host: str) -> list[str]:
    if not har_path.exists():
        return []

    try:
        data = json.loads(har_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []

    entries = data.get("log", {}).get("entries", [])
    routes: set[str] = set()
    for entry in entries:
        request = entry.get("request", {})
        url = request.get("url", "")
        parsed = urlparse(url)
        if parsed.hostname != target_host:
            continue
        path = parsed.path or "/"
        if any(token in path for token in ["/api/", "/graphql", "/auth", "/v1/", "/v2/"]):
            routes.add(path)
    return sorted(routes)


def _run_node_playwright_script(repo_root: Path, script_name: str, args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["npx", "--yes", "-p", "playwright", "node", str(repo_root / "scripts" / script_name), *args],
        capture_output=True,
        text=True,
        check=False,
    )


def run_browser_login_flow(
    *,
    target_url: str,
    config_path: str | Path,
    output_dir: str | Path,
    repo_root: str | Path,
    browser: str = "chromium",
    timeout: int = 30_000,
) -> tuple[AuditSession | None, dict]:
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    repo_root = Path(repo_root)

    proc = _run_node_playwright_script(
        repo_root,
        "browser_login_flow.mjs",
        [
            str(config_path),
            "--output-dir",
            str(output_path),
            "--browser",
            browser,
            "--timeout",
            str(timeout),
        ],
    )
    if proc.returncode != 0 or not proc.stdout.strip():
        return None, {
            "ok": False,
            "error": proc.stderr.strip() or "Browser login flow returned no output.",
            "stdout": proc.stdout.strip(),
        }

    try:
        result = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return None, {"ok": False, "error": "Browser login flow output was not valid JSON."}

    if not result.get("ok"):
        return None, result

    cookies = result.get("cookies") or []
    cookie_header = "; ".join(
        f"{item.get('name')}={item.get('value')}"
        for item in cookies
        if item.get("name") and item.get("value") is not None
    )
    session = AuditSession(
        id=f"browser-session-{slugify(urlparse(target_url).hostname or 'target')}",
        kind="browser_agent",
        label=str(result.get("label") or "Browser-authenticated session"),
        reused=True,
        privilege_level=str(result.get("privilegeLevel") or "authenticated"),
        browser_state_path=result.get("statePath"),
        http_headers={key: str(value) for key, value in (result.get("authHeaders") or {}).items()},
        cookies=[cookie_header] if cookie_header else [],
        observed_routes=[str(item) for item in (result.get("observedRoutes") or []) if item],
    )
    return session, result


def collect_browser_snapshot(
    *,
    run_id: str,
    module_id: str,
    target_url: str,
    output_dir: str | Path,
    repo_root: str | Path,
    browser_state_path: str | None = None,
    auth_kind: str = "anonymous",
) -> tuple[list[AuditEvidence], list[str], dict]:
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    repo_root = Path(repo_root)

    command = [
        target_url,
        "--output-dir",
        str(output_path),
        "--name",
        f"web-audit-{slugify(target_url)}",
        "--save-har",
        "--full-page",
    ]
    if browser_state_path:
        command.extend(["--storage-state", browser_state_path])
    proc = _run_node_playwright_script(repo_root, "browser_snapshot.mjs", command)
    if proc.returncode != 0 or not proc.stdout.strip():
        return (
            [
                AuditEvidence(
                    id=f"{run_id}-{module_id}-browser-error",
                    run_id=run_id,
                    timestamp=utc_now(),
                    kind="browser.capture_error",
                    module_id=module_id,
                    title="Browser snapshot failed",
                    summary=proc.stderr.strip() or "Browser snapshot script returned no output.",
                    data={"stderr": proc.stderr.strip(), "stdout": proc.stdout.strip()},
                    severity_hint="low",
                    url=target_url,
                )
            ],
            [],
            {},
        )

    try:
        result = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return [], [], {}

    artifact = result.get("artifact", {})
    page = result.get("page", {})
    assessment = result.get("assessment", {})
    evidences = [
        AuditEvidence(
            id=f"{run_id}-{module_id}-page",
            run_id=run_id,
            timestamp=utc_now(),
            kind="browser.snapshot",
            module_id=module_id,
            title="Browser page snapshot",
            summary=f"Captured browser snapshot for {page.get('finalUrl') or target_url} with status {page.get('httpStatus')}.",
            data=result,
            severity_hint="info",
            url=target_url,
        )
    ]

    text_sample = str(page.get("visibleTextSample", "")).lower()
    client_signals = []
    for signal in ["window.location", "redirect", "innerhtml", "dangerouslysetinnerhtml"]:
        if signal in text_sample:
            client_signals.append(signal)
    if client_signals:
        evidences.append(
            AuditEvidence(
                id=f"{run_id}-{module_id}-client-sink",
                run_id=run_id,
                timestamp=utc_now(),
                kind="browser.client_sink",
                module_id=module_id,
                title="Potential client-side sink",
                summary=f"Browser capture surfaced client-side sink indicators: {', '.join(client_signals)}.",
                data={"signal": ",".join(client_signals), "assessment": assessment},
                severity_hint="medium",
                url=target_url,
            )
        )

    har_path = Path(artifact.get("harPath") or "")
    target_host = urlparse(target_url).hostname or ""
    discovered_routes = parse_har_api_routes(har_path, target_host)

    for request in result.get("browser", {}).get("observedRequests", [])[:50]:
        try:
            parsed = urlparse(str(request.get("url", "")))
        except ValueError:
            continue
        if parsed.hostname != target_host:
            continue
        path = parsed.path or "/"
        if path not in discovered_routes and any(token in path for token in ["/api/", "/graphql", "/auth", "/v1/", "/v2/"]):
            discovered_routes.append(path)

    evidence_kind = "browser.authenticated_route" if auth_kind != "anonymous" else "browser.api_discovery"
    evidence_title = "Authenticated browser route discovery" if auth_kind != "anonymous" else "Browser-discovered API route"
    for index, route in enumerate(sorted(set(discovered_routes))[:25], start=1):
        evidences.append(
            AuditEvidence(
                id=f"{run_id}-{module_id}-api-{index}",
                run_id=run_id,
                timestamp=utc_now(),
                kind=evidence_kind,
                module_id=module_id,
                title=evidence_title,
                summary=f"Captured browser network traffic referencing {route} under the {auth_kind} context.",
                data={"route": route, "source": "browser", "auth_kind": auth_kind},
                severity_hint="info",
                url=target_url,
            )
        )

    return evidences, sorted(set(discovered_routes)), result
