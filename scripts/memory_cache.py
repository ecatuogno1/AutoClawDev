#!/usr/bin/env python3
from __future__ import annotations

import argparse
import contextlib
import hashlib
import json
import os
import re
import sys
import tempfile
import time
from collections import Counter
from pathlib import Path
from typing import Any


STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "because", "been", "before",
    "being", "but", "by", "can", "causing", "could", "do", "does", "during",
    "each", "every", "for", "from", "had", "has", "have", "if", "in", "instead",
    "into", "is", "it", "its", "just", "may", "might", "no", "not", "of", "on",
    "only", "or", "should", "silently", "so", "still", "than", "that", "the",
    "their", "them", "then", "these", "this", "those", "to", "two", "upon",
    "uses", "was", "were", "when", "which", "will", "with", "would",
}


def utc_timestamp() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", value.lower())).strip()


def extract_key_terms(title: str) -> str:
    """Extract order-independent meaningful tokens from a finding title.

    Strips stopwords, short tokens, and sorts alphabetically so that
    'NaN from JSONB quantity' and 'JSONB values for quantity NaN'
    produce the same key.
    """
    tokens = re.sub(r"[^a-z0-9_]+", " ", title.lower()).split()
    meaningful = sorted(set(t for t in tokens if t not in STOPWORDS and len(t) > 1))
    return " ".join(meaningful)


def key_term_jaccard(a: str, b: str) -> float:
    """Jaccard similarity between two sets of key terms."""
    set_a = set(extract_key_terms(a).split())
    set_b = set(extract_key_terms(b).split())
    if not set_a or not set_b:
        return 0.0
    return len(set_a & set_b) / len(set_a | set_b)


def stable_key(title: str, target_files: list[str]) -> str:
    key_terms = extract_key_terms(title)
    normalized_paths = sorted(normalize_path(path) for path in target_files if normalize_path(path))
    digest = hashlib.sha1("\n".join(normalized_paths).encode("utf-8")).hexdigest()[:12]
    return f"{key_terms}::{digest}"


def shorten(text: str, max_chars: int) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 3].rstrip() + "..."


def truncate_block(text: str, max_chars: int) -> str:
    lines = [line.rstrip() for line in text.strip().splitlines()]
    rendered = "\n".join(lines).strip()
    if len(rendered) <= max_chars:
        return rendered
    return rendered[: max_chars - 3].rstrip() + "..."


def split_paths(raw: str) -> list[str]:
    if not raw:
        return []
    items: list[str] = []
    for line in raw.replace(",", "\n").splitlines():
        value = line.strip().strip('"').strip("'")
        if not value or value.lower() in {"none", "unknown", "?"}:
            continue
        items.append(value)
    return items


def normalize_path(path: str) -> str:
    value = path.strip().strip('"').strip("'")
    if not value:
        return ""
    value = value.replace("\\", "/")
    value = re.sub(r"^\./", "", value)
    value = re.sub(r"/+", "/", value)
    return value.strip("/")


def read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return default


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    try:
        with path.open(encoding="utf-8") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line:
                    continue
                try:
                    item = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(item, dict):
                    rows.append(item)
    except FileNotFoundError:
        return []
    except OSError:
        return []
    return rows


def atomic_write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False, dir=str(path.parent)) as tmp:
        tmp.write(content)
        temp_name = tmp.name
    os.replace(temp_name, path)


def write_json(path: Path, payload: Any) -> None:
    atomic_write_text(path, json.dumps(payload, indent=2, sort_keys=False) + "\n")


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    atomic_write_text(path, "".join(json.dumps(row, separators=(",", ":")) + "\n" for row in rows))


def parse_line_jsonl(path: Path, limit: int) -> list[dict[str, Any]]:
    items = read_jsonl(path)
    return items[-limit:]


def parse_field(text: str, label: str) -> str:
    pattern = re.compile(rf"^\s*{re.escape(label)}:\s*(.*)$", re.IGNORECASE)
    lines = text.splitlines()
    for index, line in enumerate(lines):
        match = pattern.match(line)
        if not match:
            continue
        inline = match.group(1).strip()
        if inline:
            return inline
        collected: list[str] = []
        for follow in lines[index + 1 :]:
            if re.match(r"^\s*[A-Z][A-Z0-9_ -]*:\s*", follow):
                break
            collected.append(follow.rstrip())
        return "\n".join(part for part in collected if part.strip()).strip()
    return ""


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def git_head(repo: Path) -> str:
    head = run_git(repo, ["rev-parse", "HEAD"])
    return head.strip()


def git_blob_sha(repo: Path, rel_path: str) -> str:
    path = normalize_path(rel_path)
    if not path:
        return ""
    output = run_git(repo, ["rev-parse", f"HEAD:{path}"], check=False)
    return output.strip()


def run_git(repo: Path, args: list[str], check: bool = True) -> str:
    import subprocess

    try:
        completed = subprocess.run(
            ["git", "-C", str(repo), *args],
            check=check,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        return ""
    return completed.stdout


def find_lockfile(repo: Path) -> Path | None:
    for name in ("pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lockb", "bun.lock", "npm-shrinkwrap.json"):
        candidate = repo / name
        if candidate.is_file():
            return candidate
    return None


def manifest_fingerprint(repo: Path, program: Path, project_config: Path) -> tuple[str, str]:
    digest = hashlib.sha256()
    program_hash = file_sha256(program) if program.is_file() else ""
    fingerprint_inputs: list[tuple[str, Path]] = []

    package_json = repo / "package.json"
    if package_json.is_file():
        fingerprint_inputs.append(("repo:package.json", package_json))

    lockfile = find_lockfile(repo)
    if lockfile and lockfile.is_file():
        fingerprint_inputs.append((f"repo:{lockfile.name}", lockfile))

    for path in sorted(repo.glob("tsconfig*.json")):
        if path.is_file():
            fingerprint_inputs.append((f"repo:{path.name}", path))

    if program.is_file():
        fingerprint_inputs.append(("workspace:program", program))

    if project_config.is_file():
        fingerprint_inputs.append((f"project-config:{project_config.name}", project_config))

    for label, path in fingerprint_inputs:
        digest.update(label.encode("utf-8"))
        digest.update(b"\0")
        digest.update(file_sha256(path).encode("utf-8"))
        digest.update(b"\0")
    return digest.hexdigest(), program_hash


def ensure_project_paths(memory_dir: Path, project: str) -> dict[str, Path]:
    root = memory_dir / project
    paths = {
        "root": root,
        "project": root / "project-memory.json",
        "files": root / "file-memory.jsonl",
        "findings": root / "finding-memory.jsonl",
        "locks": root / "locks",
        "snapshots": root / "snapshots",
    }
    paths["locks"].mkdir(parents=True, exist_ok=True)
    paths["snapshots"].mkdir(parents=True, exist_ok=True)
    return paths


@contextlib.contextmanager
def project_lock(lock_dir: Path, timeout_seconds: int = 5):
    acquired = False
    started = time.time()
    while time.time() - started < timeout_seconds:
        try:
            lock_dir.mkdir()
            acquired = True
            break
        except FileExistsError:
            time.sleep(0.1)
    if not acquired:
        raise RuntimeError(f"timed out waiting for memory lock {lock_dir}")
    try:
        yield
    finally:
        with contextlib.suppress(OSError):
            lock_dir.rmdir()


def latest_by_key(rows: list[dict[str, Any]], key_name: str) -> dict[str, dict[str, Any]]:
    latest: dict[str, dict[str, Any]] = {}
    for row in rows:
        key = str(row.get(key_name, "")).strip()
        if not key:
            continue
        current = latest.get(key)
        if current is None or str(row.get("updated_at", "")) >= str(current.get("updated_at", "")):
            latest[key] = row
    return latest


def list_related_tests(repo: Path, rel_path: str) -> list[str]:
    path = repo / normalize_path(rel_path)
    if not path.exists():
        return []

    candidates: list[Path] = []
    stem = path.stem
    parent = path.parent
    exact_names = [
        parent / f"{stem}.test.ts",
        parent / f"{stem}.test.tsx",
        parent / f"{stem}.spec.ts",
        parent / f"{stem}.spec.tsx",
        parent / "__tests__" / f"{stem}.test.ts",
        parent / "__tests__" / f"{stem}.test.tsx",
        parent / "__tests__" / f"{stem}.spec.ts",
        parent / "__tests__" / f"{stem}.spec.tsx",
    ]
    for candidate in exact_names:
        if candidate.is_file():
            candidates.append(candidate)

    search_roots = [parent]
    if parent.parent != parent:
        search_roots.append(parent.parent)
    for root in search_roots:
        for pattern in ("*.test.ts", "*.test.tsx", "*.spec.ts", "*.spec.tsx"):
            for candidate in sorted(root.glob(pattern)):
                if candidate.is_file():
                    candidates.append(candidate)
            tests_dir = root / "__tests__"
            if tests_dir.is_dir():
                for candidate in sorted(tests_dir.glob(pattern)):
                    if candidate.is_file():
                        candidates.append(candidate)

    seen: set[str] = set()
    results: list[str] = []
    for candidate in candidates:
        rel = normalize_path(os.path.relpath(candidate, repo))
        if not rel or rel in seen:
            continue
        seen.add(rel)
        results.append(rel)
        if len(results) >= 5:
            break
    return results


def extract_keywords(titles: list[str]) -> list[str]:
    counter: Counter[str] = Counter()
    for title in titles:
        for token in normalize_text(title).split():
            if len(token) < 4 or token in STOPWORDS:
                continue
            counter[token] += 1
    return [token for token, _ in counter.most_common(6)]


def build_project_memory(
    project: str,
    repo: Path,
    program: Path,
    project_config: Path,
    finding_rows: list[dict[str, Any]],
    file_rows: list[dict[str, Any]],
    previous: dict[str, Any],
    source_commit: str,
) -> dict[str, Any]:
    fingerprint, program_hash = manifest_fingerprint(repo, program, project_config)
    active_findings = [row for row in finding_rows if row.get("status") == "open"]
    non_stale_findings = [row for row in finding_rows if row.get("status") != "stale"]

    hotspot_counter: Counter[str] = Counter()
    directives: Counter[str] = Counter()
    titles: list[str] = []
    for row in non_stale_findings:
        directives[str(row.get("directive", "unknown"))] += 1
        titles.append(str(row.get("title", "")))
        for path in row.get("target_files", []) or []:
            if path:
                hotspot_counter[path] += 1

    top_files = [{"path": path, "count": count} for path, count in hotspot_counter.most_common(6)]
    recurring_themes = extract_keywords(titles)

    hotspot_list = ", ".join(item["path"] for item in top_files[:3]) or "none yet"
    directives_list = ", ".join(name for name, _ in directives.most_common(3)) or "bug-fix"
    open_count = len(active_findings)
    summary = shorten(
        f"Recent work on {project} focused on {directives_list}. Main hotspots: {hotspot_list}. "
        f"There are {open_count} tracked open findings in memory.",
        320,
    )

    remembered_tests: list[str] = []
    for row in sorted(file_rows, key=lambda item: str(item.get("updated_at", "")), reverse=True):
        for test_path in row.get("related_tests", []) or []:
            if test_path not in remembered_tests:
                remembered_tests.append(test_path)
            if len(remembered_tests) >= 4:
                break
        if len(remembered_tests) >= 4:
            break

    validation_hints = []
    if remembered_tests:
        validation_hints.append(f"Recent related tests: {', '.join(remembered_tests[:4])}")
    if top_files:
        validation_hints.append(f"Prefer narrow fixes around hotspots: {', '.join(item['path'] for item in top_files[:3])}")
    if not validation_hints:
        validation_hints.append("No focused memory hints yet; prefer the narrowest relevant validation.")

    known_open_findings = [
        {
            "title": row.get("title", ""),
            "target_files": row.get("target_files", []),
            "directive": row.get("directive", "unknown"),
        }
        for row in active_findings[:10]
    ]

    return {
        "project": project,
        "updated_at": utc_timestamp(),
        "source_commit": source_commit,
        "program_hash": program_hash,
        "manifest_fingerprint": fingerprint,
        "summary": summary,
        "hotspots": top_files,
        "recurring_themes": recurring_themes,
        "validation_hints": validation_hints,
        "known_open_findings": known_open_findings,
        "top_files": top_files,
        "previous_summary": previous.get("summary", ""),
    }


def parse_recent_experiment_descriptions(experiments_path: Path, limit: int = 5) -> list[str]:
    descriptions: list[str] = []
    for entry in parse_line_jsonl(experiments_path, limit):
        description = str(entry.get("description", "")).strip()
        if description:
            descriptions.append(description)
    return descriptions[-limit:]


def project_memory_is_valid(project_memory: dict[str, Any], repo: Path, program: Path, project_config: Path) -> bool:
    if not project_memory:
        return False
    fingerprint, program_hash = manifest_fingerprint(repo, program, project_config)
    return (
        project_memory.get("manifest_fingerprint") == fingerprint
        and project_memory.get("program_hash") == program_hash
    )


def validate_file_entry(repo: Path, entry: dict[str, Any]) -> bool:
    path = normalize_path(str(entry.get("path", "")))
    blob_sha = str(entry.get("blob_sha", "")).strip()
    if not path or not blob_sha:
        return False
    absolute = repo / path
    if not absolute.exists():
        return False
    current_blob = git_blob_sha(repo, path)
    return bool(current_blob and current_blob == blob_sha)


def render_project_context(args: argparse.Namespace) -> int:
    repo = Path(args.repo).resolve()
    program = Path(args.program).resolve()
    project_config = Path(args.project_config).resolve()
    paths = ensure_project_paths(Path(args.memory_dir).resolve(), args.project)
    project_memory = read_json(paths["project"], {})
    if not project_memory_is_valid(project_memory, repo, program, project_config):
        return 0

    recent_descriptions = parse_recent_experiment_descriptions(Path(args.experiments).resolve(), limit=5)
    recent_normalized = [normalize_text(item) for item in recent_descriptions]

    lines: list[str] = []
    summary = str(project_memory.get("summary", "")).strip()
    if summary:
        lines.append("Project memory:")
        lines.append(f"- Summary: {summary}")

    hotspots = project_memory.get("hotspots", []) or []
    if hotspots:
        formatted = ", ".join(f"{item.get('path')} ({item.get('count')})" for item in hotspots[:4] if item.get("path"))
        if formatted:
            lines.append(f"- Hotspots: {formatted}")

    recurring = project_memory.get("recurring_themes", []) or []
    if recurring:
        lines.append(f"- Recurring themes: {', '.join(str(item) for item in recurring[:6])}")

    open_findings = []
    for item in project_memory.get("known_open_findings", []) or []:
        title = str(item.get("title", "")).strip()
        if not title:
            continue
        normalized_title = normalize_text(title)
        if any(normalized_title and (normalized_title in recent or recent in normalized_title) for recent in recent_normalized if recent):
            continue
        files = [normalize_path(path) for path in item.get("target_files", []) or [] if normalize_path(path)]
        suffix = f" [{', '.join(files[:2])}]" if files else ""
        open_findings.append(f"{title}{suffix}")
        if len(open_findings) >= 4:
            break
    if open_findings:
        lines.append("- Open findings:")
        lines.extend(f"  - {item}" for item in open_findings)

    validation_hints = project_memory.get("validation_hints", []) or []
    if validation_hints:
        lines.append("- Validation hints:")
        lines.extend(f"  - {str(item)}" for item in validation_hints[:3])

    rendered = "\n".join(lines).strip()
    if not rendered:
        return 0
    print(truncate_block(rendered, args.max_chars))
    return 0


def render_file_context(args: argparse.Namespace) -> int:
    repo = Path(args.repo).resolve()
    paths = ensure_project_paths(Path(args.memory_dir).resolve(), args.project)
    targets = [normalize_path(path) for path in split_paths(args.targets_text) if normalize_path(path)]
    if not targets:
        return 0

    file_rows = latest_by_key(read_jsonl(paths["files"]), "path")
    finding_rows = read_jsonl(paths["findings"])
    lines: list[str] = ["File memory:"]
    for target in targets:
        entry = file_rows.get(target)
        if not entry or not validate_file_entry(repo, entry):
            continue
        lines.append(f"- {target}: {str(entry.get('summary', '')).strip()}")
        related_tests = entry.get("related_tests", []) or []
        if related_tests:
            lines.append(f"  - Related tests: {', '.join(str(item) for item in related_tests[:4])}")
        related_files = entry.get("related_files", []) or []
        confidence = float(entry.get("confidence", 0.0) or 0.0)
        if related_files and confidence >= 0.7:
            lines.append(f"  - Nearby files: {', '.join(str(item) for item in related_files[:3])}")
        open_risks = [str(item) for item in entry.get("known_risks", []) or [] if str(item).strip()]
        if open_risks:
            lines.append(f"  - Known risks: {'; '.join(open_risks[:2])}")
        recent_findings = [str(item) for item in entry.get("recent_findings", []) or [] if str(item).strip()]
        if recent_findings:
            lines.append(f"  - Recent findings: {'; '.join(recent_findings[:2])}")

        matching_open = []
        for finding in finding_rows:
            if finding.get("status") != "open":
                continue
            if target in (finding.get("target_files", []) or []):
                matching_open.append(str(finding.get("title", "")).strip())
        if matching_open:
            lines.append(f"  - Open memory: {'; '.join(item for item in matching_open[:2] if item)}")

    rendered = "\n".join(lines).strip()
    if rendered == "File memory:":
        return 0
    print(truncate_block(rendered, args.max_chars))
    return 0


def update_file_entries(
    repo: Path,
    file_rows: list[dict[str, Any]],
    changed_files: list[str],
    target_files: list[str],
    finding_title: str,
    goal: str,
    exp_id: str,
    result: str,
    timestamp: str,
) -> list[dict[str, Any]]:
    latest = latest_by_key(file_rows, "path")
    if result != "pass":
        rows = list(latest.values())
        rows.sort(key=lambda item: str(item.get("updated_at", "")), reverse=True)
        return rows

    target_set = set(target_files)
    changed_set = set(changed_files)
    for path in sorted(target_set & changed_set):
        absolute = repo / path
        if not absolute.exists():
            continue
        blob_sha = git_blob_sha(repo, path)
        if not blob_sha:
            continue
        previous = latest.get(path, {})
        related_files = sorted(item for item in target_set if item != path)[:4]
        related_tests = list_related_tests(repo, path)
        recent_findings = [finding_title] if finding_title else []
        existing_recent = [str(item) for item in previous.get("recent_findings", []) or [] if str(item).strip()]
        for item in existing_recent:
            if item not in recent_findings:
                recent_findings.append(item)
            if len(recent_findings) >= 3:
                break

        known_risks = []
        if result != "pass" and finding_title:
            known_risks.append(finding_title)
        for item in previous.get("known_risks", []) or []:
            value = str(item).strip()
            if value and value not in known_risks:
                known_risks.append(value)
            if len(known_risks) >= 3:
                break

        summary = shorten(
            f"Last touched in {exp_id}: {finding_title or goal or 'targeted improvement'}. "
            f"{'Resolved in a passing cycle.' if result == 'pass' else 'Still unresolved after a failed cycle.'}",
            240,
        )
        latest[path] = {
            "path": path,
            "blob_sha": blob_sha,
            "updated_at": timestamp,
            "last_seen_commit": git_head(repo),
            "summary": summary,
            "related_files": related_files,
            "related_tests": related_tests,
            "known_risks": known_risks[:3],
            "recent_findings": recent_findings[:3],
            "confidence": 0.85 if result == "pass" else 0.65,
        }

    rows = list(latest.values())
    rows.sort(key=lambda item: str(item.get("updated_at", "")), reverse=True)
    return rows


def parse_cycle_fields(cycle_log: dict[str, Any]) -> dict[str, str]:
    fields = {
        "finding": "",
        "target_files_text": "",
        "directive": "",
        "domain": "",
        "goal": "",
        "acceptance": "",
    }
    for phase in cycle_log.get("phases", []) or []:
        name = str(phase.get("name", ""))
        output = str(phase.get("output", ""))
        if name == "Olivia":
            fields["finding"] = parse_field(output, "FINDING") or fields["finding"]
            fields["target_files_text"] = parse_field(output, "FILE") or fields["target_files_text"]
            fields["directive"] = parse_field(output, "DIRECTIVE") or fields["directive"]
            fields["domain"] = parse_field(output, "DOMAIN") or fields["domain"]
        elif name == "Jessica":
            fields["goal"] = parse_field(output, "GOAL") or fields["goal"]
            fields["acceptance"] = parse_field(output, "ACCEPTANCE") or fields["acceptance"]
    return fields


def record_cycle(args: argparse.Namespace) -> int:
    repo = Path(args.repo).resolve()
    program = Path(args.program).resolve()
    project_config = Path(args.project_config).resolve()
    paths = ensure_project_paths(Path(args.memory_dir).resolve(), args.project)
    cycle_log = read_json(Path(args.cycle_log).resolve(), {})
    timestamp = utc_timestamp()
    source_commit = args.merged_commit or git_head(repo)

    parsed = parse_cycle_fields(cycle_log)
    finding_title = parsed["finding"].strip()
    target_files = [normalize_path(path) for path in split_paths(args.target_files_text or parsed["target_files_text"]) if normalize_path(path)]
    changed_files = [normalize_path(path) for path in split_paths(args.changed_files_text) if normalize_path(path)]
    directive = (args.directive or parsed["directive"] or "unknown").strip() or "unknown"
    domain = (args.domain or parsed["domain"] or "unknown").strip() or "unknown"
    goal = parsed["goal"].strip()
    acceptance = parsed["acceptance"].strip()

    with project_lock(paths["locks"] / "write.lock"):
        existing_project = read_json(paths["project"], {})
        file_rows = read_jsonl(paths["files"])
        finding_rows = read_jsonl(paths["findings"])

        dedup_files = latest_by_key(file_rows, "path")
        file_rows = list(dedup_files.values())
        dedup_findings = latest_by_key(finding_rows, "finding_key")
        finding_rows = list(dedup_findings.values())

        if finding_title:
            finding_key = stable_key(finding_title, target_files)
            existing = next((row for row in finding_rows if row.get("finding_key") == finding_key), None)
            # Fuzzy dedup: if no exact match, check for similar findings on same files.
            # Use lower threshold (0.4) when target files overlap, higher (0.6) otherwise.
            if existing is None and target_files:
                target_set = set(target_files)
                best_sim = 0.0
                best_row = None
                for row in finding_rows:
                    row_targets = {normalize_path(p) for p in row.get("target_files", []) or [] if normalize_path(p)}
                    file_overlap = bool(row_targets.intersection(target_set))
                    if not file_overlap:
                        continue
                    similarity = key_term_jaccard(finding_title, row.get("title", ""))
                    threshold = 0.4 if file_overlap else 0.6
                    if similarity >= threshold and similarity > best_sim:
                        best_sim = similarity
                        best_row = row
                if best_row is not None:
                    finding_key = best_row["finding_key"]
                    existing = best_row
            notes = shorten(" ".join(part for part in [goal, acceptance] if part), 260)
            if args.result == "pass" and target_files:
                updated_rows: list[dict[str, Any]] = []
                for row in finding_rows:
                    row_targets = {normalize_path(path) for path in row.get("target_files", []) or [] if normalize_path(path)}
                    if row.get("status") == "open" and (
                        row.get("finding_key") == finding_key or row_targets.intersection(target_files)
                    ):
                        row = dict(row)
                        row["status"] = "fixed"
                        row["resolution_commit"] = args.merged_commit
                        row["updated_at"] = timestamp
                    updated_rows.append(row)
                finding_rows = updated_rows
            updated = {
                "finding_key": finding_key,
                "title": finding_title,
                "directive": directive,
                "domain": domain,
                "target_files": target_files,
                "first_seen_exp": existing.get("first_seen_exp", args.exp_id) if existing else args.exp_id,
                "last_seen_exp": args.exp_id,
                "status": "fixed" if args.result == "pass" else "open",
                "source_commit": source_commit,
                "resolution_commit": args.merged_commit if args.result == "pass" else "",
                "notes": notes,
                "updated_at": timestamp,
            }
            finding_rows = [row for row in finding_rows if row.get("finding_key") != finding_key]
            finding_rows.append(updated)

        file_rows = update_file_entries(repo, file_rows, changed_files, target_files, finding_title, goal, args.exp_id, args.result, timestamp)
        project_memory = build_project_memory(
            project=args.project,
            repo=repo,
            program=program,
            project_config=project_config,
            finding_rows=finding_rows,
            file_rows=file_rows,
            previous=existing_project,
            source_commit=source_commit,
        )
        project_memory["_program"] = str(program)
        project_memory["_project_config"] = str(project_config)

        write_jsonl(paths["files"], file_rows)
        write_jsonl(paths["findings"], finding_rows)
        write_json(paths["project"], project_memory)

    prune_after_record(args)
    return 0


def prune_after_record(args: argparse.Namespace) -> None:
    with contextlib.suppress(Exception):
        prune(args)


def prune(args: argparse.Namespace) -> int:
    repo = Path(args.repo).resolve()
    program = Path(args.program).resolve()
    project_config = Path(args.project_config).resolve()
    paths = ensure_project_paths(Path(args.memory_dir).resolve(), args.project)
    with project_lock(paths["locks"] / "write.lock"):
        file_rows = [entry for entry in latest_by_key(read_jsonl(paths["files"]), "path").values() if validate_file_entry(repo, entry)]
        finding_rows = list(latest_by_key(read_jsonl(paths["findings"]), "finding_key").values())
        for finding in finding_rows:
            targets = [normalize_path(path) for path in finding.get("target_files", []) or [] if normalize_path(path)]
            finding["target_files"] = targets
            if targets and all(not (repo / path).exists() for path in targets):
                finding["status"] = "stale"

        existing = read_json(paths["project"], {})
        project_memory = build_project_memory(
            project=args.project,
            repo=repo,
            program=program,
            project_config=project_config,
            finding_rows=finding_rows,
            file_rows=file_rows,
            previous=existing,
            source_commit=existing.get("source_commit", git_head(repo)),
        )

        write_jsonl(paths["files"], file_rows)
        write_jsonl(paths["findings"], finding_rows)
        write_json(paths["project"], project_memory)
    return 0


def seed_memory(args: argparse.Namespace) -> int:
    """Seed project memory from a Claude codebase scan (JSON on stdin)."""
    repo = Path(args.repo).resolve()
    program = Path(args.program).resolve()
    project_config = Path(args.project_config).resolve()
    paths = ensure_project_paths(Path(args.memory_dir).resolve(), args.project)
    timestamp = utc_timestamp()
    source_commit = git_head(repo)

    raw = sys.stdin.read().strip()
    # Extract JSON from potential markdown fences
    if "```" in raw:
        match = re.search(r"```(?:json)?\s*\n(.*?)```", raw, re.DOTALL)
        if match:
            raw = match.group(1).strip()

    try:
        scan = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"ERROR: Could not parse scan output as JSON: {exc}", file=sys.stderr)
        return 1

    file_rows: list[dict[str, Any]] = []
    for entry in scan.get("files", []):
        path = normalize_path(entry.get("path", ""))
        if not path:
            continue
        blob_sha = git_blob_sha(repo, path)
        related_tests = [normalize_path(t) for t in entry.get("related_tests", []) if normalize_path(t)]
        file_rows.append({
            "path": path,
            "blob_sha": blob_sha,
            "updated_at": timestamp,
            "last_seen_commit": source_commit,
            "summary": shorten(entry.get("summary", ""), 240),
            "related_files": [normalize_path(f) for f in entry.get("related_files", [])[:4] if normalize_path(f)],
            "related_tests": related_tests[:5],
            "known_risks": [shorten(r, 80) for r in entry.get("known_risks", [])[:3]],
            "recent_findings": [],
            "confidence": 0.7,
        })

    finding_rows: list[dict[str, Any]] = []
    for entry in scan.get("findings", []):
        title = entry.get("title", "").strip()
        if not title:
            continue
        target_files = [normalize_path(f) for f in entry.get("target_files", []) if normalize_path(f)]
        finding_key = stable_key(title, target_files)
        finding_rows.append({
            "finding_key": finding_key,
            "title": title,
            "directive": entry.get("directive", "unknown"),
            "domain": entry.get("domain", "unknown"),
            "target_files": target_files,
            "first_seen_exp": "seed",
            "last_seen_exp": "seed",
            "status": entry.get("status", "open"),
            "source_commit": source_commit,
            "resolution_commit": "",
            "notes": "Seeded by memory-init scan",
            "updated_at": timestamp,
        })

    with project_lock(paths["locks"] / "write.lock"):
        # Merge with existing memory if any
        existing_files = read_jsonl(paths["files"])
        existing_findings = read_jsonl(paths["findings"])

        merged_files = list(latest_by_key(existing_files + file_rows, "path").values())
        merged_findings = list(latest_by_key(existing_findings + finding_rows, "finding_key").values())

        project_memory = build_project_memory(
            project=args.project,
            repo=repo,
            program=program,
            project_config=project_config,
            finding_rows=merged_findings,
            file_rows=merged_files,
            previous=read_json(paths["project"], {}),
            source_commit=source_commit,
        )
        project_memory["_program"] = str(program)
        project_memory["_project_config"] = str(project_config)

        write_jsonl(paths["files"], merged_files)
        write_jsonl(paths["findings"], merged_findings)
        write_json(paths["project"], project_memory)

    themes = scan.get("themes", [])
    print(f"Seeded memory for {args.project}: {len(file_rows)} files, {len(finding_rows)} findings, {len(themes)} themes")
    return 0


def render_fixed_findings(args: argparse.Namespace) -> int:
    """Print recently-fixed findings as compact lines for research prompt injection."""
    paths = ensure_project_paths(Path(args.memory_dir).resolve(), args.project)
    finding_rows = list(latest_by_key(read_jsonl(paths["findings"]), "finding_key").values())
    fixed = [row for row in finding_rows if row.get("status") == "fixed"]
    # Sort by updated_at descending, take last N
    fixed.sort(key=lambda r: r.get("updated_at", ""), reverse=True)
    limit = getattr(args, "limit", 15)
    lines: list[str] = []
    for row in fixed[:limit]:
        title = shorten(str(row.get("title", "")), 100)
        files = [normalize_path(p) for p in row.get("target_files", []) or [] if normalize_path(p)]
        file_hint = f" [{', '.join(f.split('/')[-1] for f in files[:2])}]" if files else ""
        exp = row.get("last_seen_exp", "")
        lines.append(f"- {title}{file_hint} (fixed in {exp})")
    if lines:
        print("\n".join(lines))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="AutoClawDev project memory helper")
    subparsers = parser.add_subparsers(dest="command", required=True)

    def add_common(subparser: argparse.ArgumentParser) -> None:
        subparser.add_argument("--project", required=True)
        subparser.add_argument("--repo", required=True)
        subparser.add_argument("--memory-dir", required=True)
        subparser.add_argument("--program", required=True)
        subparser.add_argument("--project-config", required=True)

    render_project = subparsers.add_parser("render-project-context")
    add_common(render_project)
    render_project.add_argument("--experiments", required=True)
    render_project.add_argument("--max-chars", type=int, default=2200)
    render_project.set_defaults(func=render_project_context)

    render_file = subparsers.add_parser("render-file-context")
    add_common(render_file)
    render_file.add_argument("--targets-text", default="")
    render_file.add_argument("--max-chars", type=int, default=2600)
    render_file.set_defaults(func=render_file_context)

    record = subparsers.add_parser("record-cycle")
    add_common(record)
    record.add_argument("--cycle-log", required=True)
    record.add_argument("--exp-id", required=True)
    record.add_argument("--result", required=True, choices=["pass", "fail"])
    record.add_argument("--target-files-text", default="")
    record.add_argument("--changed-files-text", default="")
    record.add_argument("--merged-commit", default="")
    record.add_argument("--directive", default="")
    record.add_argument("--domain", default="")
    record.set_defaults(func=record_cycle)

    prune_parser = subparsers.add_parser("prune")
    add_common(prune_parser)
    prune_parser.set_defaults(func=prune)

    seed = subparsers.add_parser("seed-memory")
    add_common(seed)
    seed.set_defaults(func=seed_memory)

    fixed_findings = subparsers.add_parser("render-fixed-findings")
    fixed_findings.add_argument("--project", required=True)
    fixed_findings.add_argument("--memory-dir", required=True)
    fixed_findings.add_argument("--limit", type=int, default=15)
    fixed_findings.set_defaults(func=render_fixed_findings)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        return int(args.func(args) or 0)
    except BrokenPipeError:
        return 0
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
