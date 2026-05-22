from __future__ import annotations

import json
from html import escape
from pathlib import Path

from .models import AuditEvidence, AuditFinding, AuditHypothesis, AuditRun, camelize, to_data

try:
    from fpdf import FPDF
except Exception:  # pragma: no cover - optional dependency
    FPDF = None


def write_json_export(path: Path, run: AuditRun, findings, evidence, hypotheses) -> None:
    payload = {
        "run": to_data(run),
        "findings": [to_data(item) for item in findings],
        "evidence": [to_data(item) for item in evidence],
        "hypotheses": [to_data(item) for item in hypotheses],
    }
    path.write_text(f"{json.dumps(camelize(payload), indent=2)}\n", encoding="utf-8")


def build_markdown_report(
    run: AuditRun,
    findings: list[AuditFinding],
    evidence: list[AuditEvidence],
    hypotheses: list[AuditHypothesis],
) -> str:
    def get(item, key, default=None):
        if isinstance(item, dict):
            return item.get(key, default)
        return getattr(item, key, default)

    lines = [
        f"# Web Audit Report: {run.target.url}",
        "",
        f"- Status: `{run.status}`",
        f"- Mode: `{run.mode}`",
        f"- Risk: `{run.risk.level}` ({run.risk.score}/100)",
        f"- Findings: `{len(findings)}`",
        f"- Evidence events: `{len(evidence)}`",
        "",
        "## Summary",
        "",
        run.summary or "No summary recorded.",
        "",
    ]

    if hypotheses:
        lines.extend(["## Analyst Hypotheses", ""])
        for item in hypotheses[-5:]:
            lines.append(
                f"- **{get(item, 'provider')}** | confidence `{float(get(item, 'confidence', 0)):.2f}` | "
                f"{get(item, 'hypothesis')} | next `{get(item, 'recommended_next_module') or get(item, 'recommendedNextModule') or 'none'}`"
            )
        lines.append("")

    lines.extend(["## Findings", ""])
    if not findings:
        lines.append("- No findings recorded.")
    else:
        for item in findings:
            lines.extend(
                [
                    f"### {str(get(item, 'severity', 'info')).upper()} - {get(item, 'title')}",
                    "",
                    str(get(item, "summary", "")),
                    "",
                    f"Remediation: {get(item, 'remediation', '')}",
                    "",
                ]
            )

    lines.extend(["## Evidence", ""])
    for item in evidence[:40]:
        lines.append(f"- `{get(item, 'kind', '')}` | {get(item, 'title', '')} | {get(item, 'summary', '')}")
    lines.append("")
    return "\n".join(lines)


def write_markdown_export(path: Path, markdown: str) -> None:
    path.write_text(markdown, encoding="utf-8")


def write_html_export(path: Path, markdown: str) -> None:
    body = escape(markdown).replace("\n", "<br/>\n")
    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Web Audit Report</title>
  <style>
    body {{ background:#0d1117; color:#e6edf3; font:15px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace; margin:0; padding:32px; }}
    main {{ max-width:1080px; margin:0 auto; background:#161b22; border:1px solid #30363d; border-radius:16px; padding:24px; }}
    h1 {{ font-size:28px; margin-top:0; }}
  </style>
</head>
<body><main>{body}</main></body>
</html>
"""
    path.write_text(html, encoding="utf-8")


def write_pdf_export(path: Path, markdown: str) -> None:
    if FPDF is None:
        return
    try:
        pdf = FPDF()
        pdf.set_auto_page_break(auto=True, margin=12)
        pdf.add_page()
        pdf.set_font("Helvetica", size=11)
        for line in markdown.splitlines():
            safe_line = line.encode("ascii", "replace").decode("ascii")
            pdf.multi_cell(0, 6, safe_line)
        pdf.output(str(path))
    except Exception:
        return
