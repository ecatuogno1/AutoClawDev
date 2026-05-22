from __future__ import annotations

import asyncio
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import requests

from .models import AuditEvidence, AuditSession, slugify, utc_now

COMMON_RECON_PATHS = [
    "/robots.txt",
    "/sitemap.xml",
    "/.well-known/security.txt",
    "/security.txt",
    "/openapi.json",
    "/swagger.json",
    "/api/openapi.json",
    "/graphql",
    "/graphiql",
    "/actuator/health",
    "/actuator/env",
    "/debug",
    "/admin",
    "/api",
    "/api/v1",
    "/api/v2",
    "/.env",
    "/.git/config",
]

SECURITY_HEADERS = [
    "content-security-policy",
    "strict-transport-security",
    "x-content-type-options",
    "x-frame-options",
    "referrer-policy",
    "permissions-policy",
]


def create_session(
    *,
    bearer_token: str | None = None,
    cookie: str | None = None,
    api_key: str | None = None,
    api_key_header: str = "X-API-Key",
    user_agent: str = "AutoClawDev-WebAudit/2.0",
) -> requests.Session:
    session = requests.Session()
    session.headers.update({"User-Agent": user_agent})
    if bearer_token:
        session.headers["Authorization"] = f"Bearer {bearer_token}"
    if cookie:
        session.headers["Cookie"] = cookie
    if api_key:
        session.headers[api_key_header] = api_key
    return session


def _apply_session_context(session: requests.Session, audit_session: AuditSession) -> None:
    for key, value in (audit_session.http_headers or {}).items():
        if key.lower() == "cookie":
            continue
        session.headers[key] = value
    if audit_session.cookies:
        session.headers["Cookie"] = audit_session.cookies[0]


def bootstrap_auth_session(
    *,
    target_url: str,
    bearer_token: str | None,
    cookie: str | None,
    api_key: str | None,
    api_key_header: str,
    login_config_path: str | None,
    browser_login_config_path: str | None,
    output_dir: str | Path,
    repo_root: str | Path,
    timeout: int,
    existing_session: AuditSession | None = None,
) -> tuple[requests.Session, AuditSession, dict | None]:
    if existing_session:
        session = create_session()
        _apply_session_context(session, existing_session)
        return session, existing_session, {"source": "existing"}

    session = create_session(
        bearer_token=bearer_token,
        cookie=cookie,
        api_key=api_key,
        api_key_header=api_key_header,
    )
    auth_kind = "anonymous"
    label = "Anonymous browser + API session"
    privilege_level = "anonymous"
    browser_state_path = None
    observed_routes: list[str] = []
    metadata: dict[str, Any] | None = None

    if bearer_token:
        auth_kind = "token"
        label = "Bearer token session"
        privilege_level = "authenticated"
    elif cookie:
        auth_kind = "cookie"
        label = "Cookie session"
        privilege_level = "authenticated"
    elif api_key:
        auth_kind = "api_key"
        label = f"API key session ({api_key_header})"
        privilege_level = "authenticated"

    if login_config_path:
        config = json.loads(Path(login_config_path).read_text(encoding="utf-8"))
        url = config.get("url") or target_url
        if not str(url).startswith("http"):
            url = urljoin(target_url, str(url))
        method = str(config.get("method", "POST")).upper()
        headers = dict(config.get("headers") or {})
        payload = config.get("json")
        data = config.get("data")
        response = session.request(method, url, headers=headers, json=payload, data=data, timeout=timeout)
        if response.ok:
            auth_kind = "login_recipe"
            label = f"Reusable login recipe session ({url})"
            privilege_level = "authenticated"
            token_path = config.get("token_json_path")
            token_prefix = config.get("token_prefix", "Bearer ")
            if token_path:
                parsed = response.json()
                token_value: Any = parsed
                for key in str(token_path).split("."):
                    if isinstance(token_value, dict):
                        token_value = token_value.get(key)
                if token_value:
                    session.headers["Authorization"] = f"{token_prefix}{token_value}"
            if config.get("cookie_passthrough") and response.headers.get("Set-Cookie"):
                session.headers["Cookie"] = response.headers["Set-Cookie"]

    if browser_login_config_path:
        from .browser import run_browser_login_flow

        browser_session, metadata = run_browser_login_flow(
            target_url=target_url,
            config_path=browser_login_config_path,
            output_dir=Path(output_dir) / "auth",
            repo_root=repo_root,
            timeout=timeout * 1000,
        )
        if browser_session:
            _apply_session_context(session, browser_session)
            auth_kind = browser_session.kind
            label = browser_session.label
            privilege_level = browser_session.privilege_level or "authenticated"
            browser_state_path = browser_session.browser_state_path
            observed_routes = browser_session.observed_routes

    audit_session = AuditSession(
        id=f"session-{int(time.time())}",
        kind=auth_kind,
        label=label,
        reused=auth_kind != "anonymous",
        privilege_level=privilege_level,
        browser_state_path=browser_state_path,
        http_headers={key: str(value) for key, value in session.headers.items()},
        cookies=[session.headers.get("Cookie")] if session.headers.get("Cookie") else [],
        observed_routes=observed_routes,
    )
    return session, audit_session, metadata


class AsyncRequestor:
    def __init__(self, session: requests.Session, *, concurrency: int, timeout: int, rate_limit_per_second: float):
        self.session = session
        self.timeout = timeout
        self.executor = ThreadPoolExecutor(max_workers=max(2, concurrency))
        self.semaphore = asyncio.Semaphore(max(1, concurrency))
        self._request_interval = 1.0 / max(rate_limit_per_second, 0.5)
        self._last_request = 0.0
        self._lock = asyncio.Lock()

    async def request(self, method: str, url: str, **kwargs):
        async with self.semaphore:
            async with self._lock:
                wait_for = self._request_interval - (time.monotonic() - self._last_request)
                if wait_for > 0:
                    await asyncio.sleep(wait_for)
                self._last_request = time.monotonic()

            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(
                self.executor,
                lambda: self.session.request(method, url, timeout=self.timeout, **kwargs),
            )

    def close(self):
        self.executor.shutdown(wait=False, cancel_futures=True)


async def collect_http_recon(
    *,
    run_id: str,
    module_id: str,
    target_url: str,
    requestor: AsyncRequestor,
) -> tuple[list[AuditEvidence], list[str]]:
    evidences: list[AuditEvidence] = []
    discovered_routes: set[str] = set()

    response = await requestor.request("GET", target_url)
    headers = {key.lower(): value for key, value in response.headers.items()}
    missing = [header for header in SECURITY_HEADERS if header not in headers]
    if missing:
        evidences.append(
            AuditEvidence(
                id=f"{run_id}-{module_id}-missing-headers",
                run_id=run_id,
                timestamp=utc_now(),
                kind="header.missing_security_headers",
                module_id=module_id,
                title="Missing security headers",
                summary=f"Missing recommended response headers: {', '.join(missing)}.",
                data={"missing": missing, "headers": headers},
                severity_hint="medium",
                url=target_url,
            )
        )

    set_cookie = response.headers.get("Set-Cookie", "")
    if set_cookie and ("HttpOnly" not in set_cookie or "Secure" not in set_cookie):
        cookie_name = set_cookie.split("=", 1)[0]
        evidences.append(
            AuditEvidence(
                id=f"{run_id}-{module_id}-cookie",
                run_id=run_id,
                timestamp=utc_now(),
                kind="cookie.insecure",
                module_id=module_id,
                title="Cookie missing hardening flags",
                summary=f"Cookie {cookie_name} is missing HttpOnly and/or Secure.",
                data={"cookie_name": cookie_name, "set_cookie": set_cookie},
                severity_hint="medium",
                url=target_url,
            )
        )

    html = response.text[:250_000]
    for match in re.findall(r'["\'](/api/[^"\']+)["\']', html):
        discovered_routes.add(match)
    for match in re.findall(r'["\'](/graphql[^"\']*)["\']', html):
        discovered_routes.add(match)

    async def probe(path: str):
        url = urljoin(target_url, path)
        try:
            resp = await requestor.request("GET", url, allow_redirects=False)
        except Exception:
            return None
        if resp.status_code >= 400:
            return None
        body = (resp.text or "")[:300]
        return AuditEvidence(
            id=f"{run_id}-{module_id}-{abs(hash(path))}",
            run_id=run_id,
            timestamp=utc_now(),
            kind="path.exposed",
            module_id=module_id,
            title="Interesting path exposed",
            summary=f"{path} returned HTTP {resp.status_code}.",
            data={"path": path, "status": resp.status_code, "body": body, "content_type": resp.headers.get("Content-Type", "")},
            severity_hint="high" if any(token in path for token in [".env", ".git", "actuator"]) else "info",
            url=url,
        )

    probed = await asyncio.gather(*(probe(path) for path in COMMON_RECON_PATHS))
    for item in probed:
        if item:
            evidences.append(item)
            path = str(item.data.get("path", ""))
            if any(token in path for token in ["/api", "/graphql"]):
                discovered_routes.add(path)

    return evidences, sorted(discovered_routes)


async def collect_api_surface(
    *,
    run_id: str,
    module_id: str,
    target_url: str,
    requestor: AsyncRequestor,
    routes: list[str],
    auth_kind: str,
) -> list[AuditEvidence]:
    evidences: list[AuditEvidence] = []
    unique_routes = []
    seen = set()
    for route in routes:
        if route not in seen:
            seen.add(route)
            unique_routes.append(route)

    async def probe(route: str):
        url = route if route.startswith("http") else urljoin(target_url, route)
        try:
            resp = await requestor.request("GET", url, allow_redirects=False)
        except Exception:
            return None
        content_type = resp.headers.get("Content-Type", "")
        if resp.status_code >= 400 or "json" not in content_type.lower():
            return None
        try:
            payload = resp.json()
        except ValueError:
            return None

        record_count = 0
        contains_pii = False
        keys: list[str] = []
        sample_ids: list[int] = []
        sample_fields: dict[str, Any] = {}
        if isinstance(payload, list):
            record_count = len(payload)
            if payload and isinstance(payload[0], dict):
                sample_fields = {key: value for key, value in payload[0].items() if isinstance(value, (str, int, float, bool))}
                keys = list(payload[0].keys())
        elif isinstance(payload, dict):
            keys = list(payload.keys())
            sample_fields = {key: value for key, value in payload.items() if isinstance(value, (str, int, float, bool))}
            for value in payload.values():
                if isinstance(value, list):
                    record_count = max(record_count, len(value))

        for field_name, field_value in sample_fields.items():
            if field_name.lower() in {"id", "user_id", "userid", "customer_id", "customerid"}:
                try:
                    sample_ids.append(int(field_value))
                except (TypeError, ValueError):
                    continue

        pii_tokens = {"email", "phone", "address", "ssn", "token"}
        contains_pii = any(token in key.lower() for key in keys for token in pii_tokens)
        return AuditEvidence(
            id=f"{run_id}-{module_id}-{slugify(route)}",
            run_id=run_id,
            timestamp=utc_now(),
            kind="api.public_json",
            module_id=module_id,
            title="Public JSON API response",
            summary=f"{route} returned JSON over {auth_kind} context with {record_count} discovered records.",
            data={
                "route": route,
                "status": resp.status_code,
                "keys": keys[:25],
                "record_count": record_count,
                "contains_pii": contains_pii,
                "auth_kind": auth_kind,
                "sample_ids": sample_ids[:3],
                "sample_fields": sample_fields,
            },
            severity_hint="critical" if contains_pii else "high",
            url=url,
        )

    results = await asyncio.gather(*(probe(route) for route in unique_routes[:30]))
    for item in results:
        if item:
            evidences.append(item)
    return evidences
