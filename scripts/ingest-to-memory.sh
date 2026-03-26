#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────────
# ingest-to-memory.sh — Feed deep review / QA findings into AutoClawDev memory
#
# Usage:
#   ingest-to-memory.sh <project-key> [--source deep-review|qa-audit|profile]
#
# Reads findings from:
#   deep-review: .deep-review-logs/audit-report.md → finding-memory.jsonl
#   qa-audit:    QA output files → finding-memory.jsonl
#   profile:     Profile validation results → finding-memory.jsonl
#
# Also updates project-memory.json with summary and hotspots.
# ──────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MEMORY_SCRIPT="$SCRIPT_DIR/memory_cache.py"
PROJECTS_DIR="${AUTOCLAWDEV_PROJECTS_DIR:-$HOME/.local/lib/autoclawdev/projects}"
MEMORY_DIR="${AUTOCLAWDEV_MEMORY_DIR:-$HOME/.openclaw/workspace/autoresearch/memory}"

PROJECT_KEY=""
SOURCE="deep-review"

for arg in "$@"; do
  case "$arg" in
    --source)    shift; SOURCE="${1:-deep-review}" ;;
    deep-review|qa-audit|profile) SOURCE="$arg" ;;
    --help|-h)
      echo "Usage: ingest-to-memory.sh <project-key> [--source deep-review|qa-audit|profile]"
      exit 0
      ;;
    -*)          ;;
    *)           [ -z "$PROJECT_KEY" ] && PROJECT_KEY="$arg" ;;
  esac
done

if [ -z "$PROJECT_KEY" ]; then
  echo "ERROR: project key required"
  exit 1
fi

PROJECT_FILE="$PROJECTS_DIR/${PROJECT_KEY}.json"
if [ ! -f "$PROJECT_FILE" ]; then
  echo "ERROR: project not found: $PROJECT_FILE"
  exit 1
fi

PROJECT_PATH=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['path'])" "$PROJECT_FILE")
PROGRAM_FILE="$PROJECT_PATH/CLAUDE.md"
[ -f "$PROGRAM_FILE" ] || PROGRAM_FILE="$PROJECT_PATH/AGENTS.md"
[ -f "$PROGRAM_FILE" ] || PROGRAM_FILE="$PROJECT_PATH/README.md"
[ -f "$PROGRAM_FILE" ] || { echo "No program file found"; PROGRAM_FILE="/dev/null"; }

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
COMMIT=$(git -C "$PROJECT_PATH" rev-parse HEAD 2>/dev/null || echo "unknown")

PROJECT_MEM_DIR="$MEMORY_DIR/$PROJECT_KEY"
mkdir -p "$PROJECT_MEM_DIR/locks" "$PROJECT_MEM_DIR/snapshots"

FINDINGS_FILE="$PROJECT_MEM_DIR/finding-memory.jsonl"

echo "Ingesting $SOURCE findings for $PROJECT_KEY..."

case "$SOURCE" in
  deep-review)
    AUDIT_REPORT="$PROJECT_PATH/.deep-review-logs/audit-report.md"
    EXEC_PLAN="$PROJECT_PATH/.deep-review-logs/execution-plan.md"
    PROGRESS="$PROJECT_PATH/.deep-review-logs/progress.md"

    if [ ! -f "$AUDIT_REPORT" ]; then
      echo "No audit report found at $AUDIT_REPORT"
      echo "Run a deep review first: autoclawdev deep-review $PROJECT_KEY"
      exit 1
    fi

    echo "Parsing audit report: $AUDIT_REPORT"

    # Use Python to parse the audit report and extract findings into JSONL
    python3 - "$AUDIT_REPORT" "$PROJECT_KEY" "$COMMIT" "$FINDINGS_FILE" "$TIMESTAMP" <<'PYEOF'
import sys, json, re, hashlib

audit_file = sys.argv[1]
project = sys.argv[2]
commit = sys.argv[3]
findings_file = sys.argv[4]
timestamp = sys.argv[5]

with open(audit_file) as f:
    content = f.read()

# Load existing findings to avoid duplicates
existing_keys = set()
try:
    with open(findings_file) as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    row = json.loads(line)
                    existing_keys.add(row.get("finding_key", ""))
                except json.JSONDecodeError:
                    pass
except FileNotFoundError:
    pass

# Parse markdown for findings — look for patterns like:
# - **file.ts**: description (severity)
# - file.ts:123 — description
# - CRITICAL/HIGH/MEDIUM/LOW: description
findings = []
severity_map = {"critical": "critical", "high": "high", "medium": "medium", "low": "low"}

lines = content.split("\n")
current_section = ""
current_severity = "medium"

for line in lines:
    stripped = line.strip()
    if not stripped:
        continue

    # Track section headers for severity context
    lower = stripped.lower()
    if stripped.startswith("#"):
        current_section = stripped.lstrip("#").strip().lower()
        if "critical" in current_section:
            current_severity = "critical"
        elif "bug" in current_section:
            current_severity = "high"
        elif "dead code" in current_section or "duplicate" in current_section:
            current_severity = "medium"
        elif "quick win" in current_section:
            current_severity = "low"
        continue

    # Skip non-finding lines
    if not stripped.startswith("-") and not stripped.startswith("*"):
        continue

    # Clean the line
    text = re.sub(r"^[-*]\s*", "", stripped)
    if len(text) < 15:
        continue

    # Extract file paths
    file_matches = re.findall(r'[`*]*([a-zA-Z0-9_/.-]+\.[a-zA-Z]{1,4}(?::\d+)?)[`*]*', text)
    target_files = [f.split(":")[0] for f in file_matches if "/" in f and not f.startswith("http")]

    # Extract inline severity
    sev_match = re.search(r'\b(critical|high|medium|low)\b', text, re.IGNORECASE)
    severity = sev_match.group(1).lower() if sev_match else current_severity

    # Determine directive
    directive = "bug-fix"
    if any(w in lower for w in ["dead", "unused", "remove", "delete", "orphan"]):
        directive = "refactor"
    elif any(w in lower for w in ["security", "injection", "xss", "auth"]):
        directive = "security"
    elif any(w in lower for w in ["performance", "slow", "optimize", "cache"]):
        directive = "performance"

    # Create stable key
    key_terms = " ".join(sorted(set(
        t for t in re.sub(r"[^a-z0-9_]+", " ", text.lower()).split()
        if len(t) > 2
    )))
    paths_str = "\n".join(sorted(target_files))
    digest = hashlib.sha1(paths_str.encode()).hexdigest()[:12]
    finding_key = f"{key_terms}::{digest}"

    if finding_key in existing_keys:
        continue

    findings.append({
        "finding_key": finding_key,
        "title": text[:200],
        "directive": directive,
        "domain": "backend" if any("server" in f or "api" in f or "db" in f for f in target_files) else "frontend" if any("web" in f or "app" in f or "component" in f for f in target_files) else "unknown",
        "target_files": target_files[:5],
        "first_seen_exp": "deep-review",
        "last_seen_exp": "deep-review",
        "status": "open",
        "source_commit": commit,
        "resolution_commit": "",
        "notes": f"From deep review audit report. Section: {current_section}",
        "updated_at": timestamp,
    })
    existing_keys.add(finding_key)

# Append new findings
if findings:
    with open(findings_file, "a") as f:
        for finding in findings:
            f.write(json.dumps(finding) + "\n")
    print(f"Added {len(findings)} findings to memory")
else:
    print("No new findings extracted from audit report")
PYEOF
    ;;

  qa-audit)
    # Look for QA checklist results
    QA_DIR="$PROJECT_PATH/scripts/qa"
    if [ -d "$QA_DIR" ]; then
      echo "Scanning QA output for findings..."
      # Look for latest QA output
      QA_OUTPUT=$(find "$QA_DIR/output" -name "*.json" -type f 2>/dev/null | sort | tail -1)
      if [ -n "$QA_OUTPUT" ] && [ -f "$QA_OUTPUT" ]; then
        python3 - "$QA_OUTPUT" "$PROJECT_KEY" "$COMMIT" "$FINDINGS_FILE" "$TIMESTAMP" <<'PYEOF'
import sys, json, hashlib

qa_file = sys.argv[1]
project = sys.argv[2]
commit = sys.argv[3]
findings_file = sys.argv[4]
timestamp = sys.argv[5]

with open(qa_file) as f:
    data = json.load(f)

existing_keys = set()
try:
    with open(findings_file) as f:
        for line in f:
            if line.strip():
                try:
                    existing_keys.add(json.loads(line).get("finding_key", ""))
                except json.JSONDecodeError:
                    pass
except FileNotFoundError:
    pass

findings = []
# Handle QA checklist format with pass/fail items
items = data if isinstance(data, list) else data.get("results", data.get("items", []))
for item in items:
    if not isinstance(item, dict):
        continue
    status = item.get("status", item.get("result", ""))
    if status in ("pass", "passed", "ok"):
        continue
    title = item.get("title", item.get("description", item.get("id", "")))
    if not title:
        continue
    route = item.get("route", "")
    key_text = " ".join(sorted(set(t for t in title.lower().split() if len(t) > 2)))
    digest = hashlib.sha1(route.encode()).hexdigest()[:12]
    finding_key = f"{key_text}::{digest}"
    if finding_key in existing_keys:
        continue
    findings.append({
        "finding_key": finding_key,
        "title": title[:200],
        "directive": "bug-fix",
        "domain": "frontend",
        "target_files": [route] if route else [],
        "first_seen_exp": "qa-audit",
        "last_seen_exp": "qa-audit",
        "status": "open",
        "source_commit": commit,
        "resolution_commit": "",
        "notes": f"From QA audit. Severity: {item.get('severity', 'unknown')}",
        "updated_at": timestamp,
    })
    existing_keys.add(finding_key)

if findings:
    with open(findings_file, "a") as f:
        for finding in findings:
            f.write(json.dumps(finding) + "\n")
    print(f"Added {len(findings)} QA findings to memory")
else:
    print("No new QA findings to add")
PYEOF
      else
        echo "No QA output files found in $QA_DIR/output/"
      fi
    else
      echo "No QA directory found at $QA_DIR"
    fi
    ;;

  profile)
    echo "Ingesting profile results..."
    # Read profile validation commands from project config and check for cached results
    python3 - "$PROJECT_FILE" "$PROJECT_KEY" "$COMMIT" "$FINDINGS_FILE" "$TIMESTAMP" "$PROJECT_PATH" <<'PYEOF'
import sys, json, subprocess, hashlib

config_file = sys.argv[1]
project = sys.argv[2]
commit = sys.argv[3]
findings_file = sys.argv[4]
timestamp = sys.argv[5]
project_path = sys.argv[6]

with open(config_file) as f:
    config = json.load(f)

profiles = config.get("profile_validation", {})
if not profiles:
    for key in ("security_cmd", "performance_cmd"):
        if config.get(key):
            profiles[key.replace("_cmd", "")] = {"command": config[key]}

if not profiles:
    print("No profile validation commands configured")
    sys.exit(0)

existing_keys = set()
try:
    with open(findings_file) as f:
        for line in f:
            if line.strip():
                try:
                    existing_keys.add(json.loads(line).get("finding_key", ""))
                except json.JSONDecodeError:
                    pass
except FileNotFoundError:
    pass

findings = []
for profile_name, profile_config in profiles.items():
    cmd = profile_config if isinstance(profile_config, str) else profile_config.get("command", "")
    if not cmd:
        continue
    print(f"  Running profile: {profile_name} → {cmd}")
    try:
        result = subprocess.run(
            cmd, shell=True, cwd=project_path,
            capture_output=True, text=True, timeout=120
        )
        if result.returncode != 0:
            title = f"Profile '{profile_name}' failed (exit {result.returncode})"
            stderr_summary = result.stderr.strip()[-200:] if result.stderr else ""
            key_text = f"profile {profile_name} failed"
            digest = hashlib.sha1(profile_name.encode()).hexdigest()[:12]
            finding_key = f"{key_text}::{digest}"
            if finding_key not in existing_keys:
                findings.append({
                    "finding_key": finding_key,
                    "title": title,
                    "directive": "security" if "security" in profile_name else "performance" if "performance" in profile_name else "bug-fix",
                    "domain": "unknown",
                    "target_files": [],
                    "first_seen_exp": f"profile-{profile_name}",
                    "last_seen_exp": f"profile-{profile_name}",
                    "status": "open",
                    "source_commit": commit,
                    "resolution_commit": "",
                    "notes": stderr_summary[:260] if stderr_summary else f"Profile {profile_name} exited with code {result.returncode}",
                    "updated_at": timestamp,
                })
                existing_keys.add(finding_key)
        else:
            print(f"    ✓ {profile_name} passed")
            # Mark any existing open findings for this profile as fixed
            key_text = f"profile {profile_name} failed"
            digest = hashlib.sha1(profile_name.encode()).hexdigest()[:12]
            finding_key = f"{key_text}::{digest}"
            # We'd need to update the file to mark fixed, but for now just log
    except subprocess.TimeoutExpired:
        print(f"    ✗ {profile_name} timed out")
    except Exception as e:
        print(f"    ✗ {profile_name} error: {e}")

if findings:
    with open(findings_file, "a") as f:
        for finding in findings:
            f.write(json.dumps(finding) + "\n")
    print(f"Added {len(findings)} profile findings to memory")
else:
    print("All profiles passed or no new findings")
PYEOF
    ;;
esac

# Update project-memory.json summary
echo "Updating project memory summary..."
python3 "$MEMORY_SCRIPT" seed-memory \
  --project "$PROJECT_KEY" \
  --repo "$PROJECT_PATH" \
  --memory-dir "$MEMORY_DIR" \
  --program "$PROGRAM_FILE" \
  --project-config "$PROJECT_FILE" < /dev/null 2>/dev/null || true

echo "Done. Memory updated for $PROJECT_KEY"
