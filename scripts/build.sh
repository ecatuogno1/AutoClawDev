#!/usr/bin/env bash
set -uo pipefail
# NOTE: not using -Ee — grep returning 0 matches is normal in this script

# ──────────────────────────────────────────────────────────────────────────────
# build.sh — Execute a build plan phase by phase using Claude or Codex
#
# Usage:
#   build.sh <project-key> <plan-name> [--claude|--codex|--codex-fast] [--phase N]
#   build.sh <project-key> --list
# ──────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECTS_DIR="${AUTOCLAWDEV_PROJECTS_DIR:-$HOME/.local/lib/autoclawdev/projects}"

# ── Parse args ───────────────────────────────────────────────────────

PROJECT_KEY=""
PLAN_FILE=""
PROVIDER="claude"
START_PHASE=""
LIST_MODE=false

# Two-pass arg parsing: first grab flags, then positionals
ARGS=("$@")
i=0
while [ $i -lt ${#ARGS[@]} ]; do
  arg="${ARGS[$i]}"
  case "$arg" in
    --claude)     PROVIDER="claude" ;;
    --codex)      PROVIDER="codex" ;;
    --codex-fast) PROVIDER="codex-fast" ;;
    --phase)
      i=$((i + 1))
      [ $i -lt ${#ARGS[@]} ] && START_PHASE="${ARGS[$i]}"
      ;;
    --list|-l)    LIST_MODE=true ;;
    --help|-h)
      echo "Usage: build.sh <project-key> <plan-name> [--claude|--codex|--codex-fast] [--phase N]"
      echo "       build.sh <project-key> --list"
      echo ""
      echo "Options:"
      echo "  --list, -l     List build plans for the project"
      echo "  --phase N      Start from phase N"
      echo "  --claude       Use Claude Opus (default)"
      echo "  --codex        Use Codex GPT-5.4"
      echo "  --codex-fast   Use Codex GPT-5.4 fast"
      exit 0
      ;;
    -*)           ;;
    *)
      if [ -z "$PROJECT_KEY" ]; then
        PROJECT_KEY="$arg"
      elif [ -z "$PLAN_FILE" ]; then
        PLAN_FILE="$arg"
      fi
      ;;
  esac
  i=$((i + 1))
done

# ── List mode ────────────────────────────────────────────────────────

if [ "$LIST_MODE" = true ]; then
  if [ -z "$PROJECT_KEY" ]; then
    echo "Usage: build.sh <project-key> --list"
    exit 1
  fi

  PROJECT_FILE="$PROJECTS_DIR/${PROJECT_KEY}.json"
  if [ ! -f "$PROJECT_FILE" ]; then
    echo "ERROR: Project not found: $PROJECT_FILE"
    exit 1
  fi

  PROJECT_PATH=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['path'])" "$PROJECT_FILE")
  BUILDS_DIR="$PROJECT_PATH/.autoclaw/builds"
  DONE_DIR="$BUILDS_DIR/.done"

  if [ ! -d "$BUILDS_DIR" ]; then
    echo "No build plans for $PROJECT_KEY"
    exit 0
  fi

  active=0
  done_count=0

  echo ""
  echo "Build plans for $PROJECT_KEY:"
  echo ""

  for d in "$BUILDS_DIR"/*/; do
    [ -d "$d" ] || continue
    name=$(basename "$d")
    [ "$name" = ".done" ] && continue

    plan_file="$d/plan.md"
    progress_file="$d/progress.md"
    [ ! -f "$plan_file" ] && continue

    phases=$(grep -cE "^#{1,3} Phase [0-9]" "$plan_file" 2>/dev/null || echo 0)
    phase_files=$(ls "$d"/phase-*.md 2>/dev/null | wc -l | tr -d '[:space:]' || echo 0)
    [ "${phase_files:-0}" -gt "${phases:-0}" ] 2>/dev/null && phases="$phase_files"

    completed=0
    [ -f "$progress_file" ] && completed=$(grep -c "^\- \[x\]" "$progress_file" 2>/dev/null || echo 0)

    criteria=$(cat "$d"/*.md 2>/dev/null | grep -c "^\- \[ \]" || echo 0)

    if [ "$completed" -ge "$phases" ] && [ "$phases" -gt 0 ]; then
      status="✓ done"
    elif [ "$completed" -gt 0 ]; then
      status="◐ $completed/$phases"
    else
      status="○ not started"
    fi

    printf "  %-25s %s  (%d phases, %d criteria)\n" "$name" "$status" "$phases" "$criteria"
    active=$((active + 1))
  done

  if [ -d "$DONE_DIR" ]; then
    for d in "$DONE_DIR"/*/; do
      [ -d "$d" ] || continue
      done_count=$((done_count + 1))
    done
    if [ "$done_count" -gt 0 ]; then
      echo ""
      echo "  Completed ($done_count):"
      for d in "$DONE_DIR"/*/; do
        [ -d "$d" ] || continue
        printf "    ✓ %s\n" "$(basename "$d")"
      done
    fi
  fi

  [ "$active" -eq 0 ] && [ "$done_count" -eq 0 ] && echo "  No build plans found."
  echo ""
  exit 0
fi

# ── Validate required args ───────────────────────────────────────────

if [ -z "$PROJECT_KEY" ] || [ -z "$PLAN_FILE" ]; then
  echo "ERROR: project key and plan file required"
  echo "Usage: build.sh <project-key> <plan-name> [--claude|--codex|--codex-fast]"
  exit 1
fi

# ── Load project config ──────────────────────────────────────────────

PROJECT_FILE="$PROJECTS_DIR/${PROJECT_KEY}.json"
if [ ! -f "$PROJECT_FILE" ]; then
  echo "ERROR: Project not found: $PROJECT_FILE"
  exit 1
fi

PROJECT_NAME=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['name'])" "$PROJECT_FILE")
PROJECT_PATH=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['path'])" "$PROJECT_FILE")
TEST_CMD=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('test_cmd',''))" "$PROJECT_FILE")
LINT_CMD=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('lint_cmd',''))" "$PROJECT_FILE")

if [ ! -d "$PROJECT_PATH" ]; then
  echo "ERROR: Project path does not exist: $PROJECT_PATH"
  exit 1
fi

# ── Resolve plan file ────────────────────────────────────────────────

PLAN_DIR=""
if [ -f "$PLAN_FILE" ]; then
  : # absolute/relative path found
elif [ -f "$PROJECT_PATH/$PLAN_FILE" ]; then
  PLAN_FILE="$PROJECT_PATH/$PLAN_FILE"
elif [ -f "$PROJECT_PATH/.autoclaw/builds/$PLAN_FILE/plan.md" ]; then
  PLAN_DIR="$PROJECT_PATH/.autoclaw/builds/$PLAN_FILE"
  PLAN_FILE="$PLAN_DIR/plan.md"
elif [ -d "$PROJECT_PATH/.autoclaw/builds/$PLAN_FILE" ]; then
  PLAN_DIR="$PROJECT_PATH/.autoclaw/builds/$PLAN_FILE"
  PLAN_FILE="$PLAN_DIR/plan.md"
else
  echo "ERROR: Plan not found: $PLAN_FILE"
  echo ""
  echo "Looked in:"
  echo "  $PLAN_FILE"
  echo "  $PROJECT_PATH/$PLAN_FILE"
  echo "  $PROJECT_PATH/.autoclaw/builds/$PLAN_FILE/plan.md"
  local_plans="$PROJECT_PATH/.autoclaw/builds"
  if [ -d "$local_plans" ]; then
    echo ""
    echo "Available:"
    for d in "$local_plans"/*/; do
      [ -d "$d" ] && [ "$(basename "$d")" != ".done" ] && echo "  $(basename "$d")"
    done
  fi
  exit 1
fi

# ── Load plan content ────────────────────────────────────────────────

if [ -n "$PLAN_DIR" ] && [ -d "$PLAN_DIR" ]; then
  PLAN_CONTENT="$(cat "$PLAN_FILE")"
  for phase_file in "$PLAN_DIR"/phase-*.md; do
    [ -f "$phase_file" ] || continue
    PLAN_CONTENT="${PLAN_CONTENT}

---

$(cat "$phase_file")"
  done
  phase_file_count=$(ls "$PLAN_DIR"/phase-*.md 2>/dev/null | wc -l | tr -d ' ' || echo 0)
  echo "Loaded plan from $(basename "$PLAN_DIR")/ ($phase_file_count phase files)"
else
  PLAN_CONTENT="$(cat "$PLAN_FILE")"
fi

# ── Extract phase names ──────────────────────────────────────────────

PHASE_NAMES=()

# Try ## Phase, then ### Phase, then # Phase
for prefix in "##" "###" "#"; do
  if [ ${#PHASE_NAMES[@]} -eq 0 ]; then
    while IFS= read -r line; do
      if [[ "$line" =~ ^${prefix}[[:space:]]+(Phase[[:space:]]+[0-9]+[^$]*) ]]; then
        PHASE_NAMES+=("${BASH_REMATCH[1]}")
      fi
    done <<< "$PLAN_CONTENT"
  fi
done

if [ ${#PHASE_NAMES[@]} -eq 0 ]; then
  echo "ERROR: No phases found. Plan must have '## Phase 1: ...' headings."
  exit 1
fi

echo "Found ${#PHASE_NAMES[@]} phases:"
for i in "${!PHASE_NAMES[@]}"; do
  echo "  $((i + 1)). ${PHASE_NAMES[$i]}"
done
echo ""

# ── Setup ────────────────────────────────────────────────────────────

LOG_DIR="${PLAN_DIR:-$PROJECT_PATH/.autoclaw/builds}"
mkdir -p "$LOG_DIR"

STAMP="$(date +"%Y%m%d-%H%M%S")"
PROGRESS_FILE="$LOG_DIR/progress.md"
META_LOG="$LOG_DIR/build-${STAMP}.meta.txt"

# Record the git commit before we start (for verification later)
BASELINE_COMMIT=$(git -C "$PROJECT_PATH" rev-parse HEAD 2>/dev/null || echo "")

# Project context
CONTEXT=""
for ctx_file in "$PROJECT_PATH/CLAUDE.md" "$PROJECT_PATH/AGENTS.md" "$PROJECT_PATH/README.md"; do
  if [ -f "$ctx_file" ]; then
    CONTEXT="${CONTEXT}
--- $(basename "$ctx_file") (first 80 lines) ---
$(head -80 "$ctx_file")
..."
  fi
done

# ── Resume ───────────────────────────────────────────────────────────

COMPLETED_PHASES=0
if [ -f "$PROGRESS_FILE" ]; then
  COMPLETED_PHASES=$(grep -c "^\- \[x\]" "$PROGRESS_FILE" || echo 0)
  [ "$COMPLETED_PHASES" -gt 0 ] && echo "Resuming: $COMPLETED_PHASES phase(s) already completed."
fi

if [ -n "$START_PHASE" ]; then
  COMPLETED_PHASES=$((START_PHASE - 1))
  echo "Starting from phase $START_PHASE"
fi

# ── Metadata ─────────────────────────────────────────────────────────

{
  echo "provider=$PROVIDER"
  echo "project=$PROJECT_KEY"
  echo "plan=$(basename "${PLAN_DIR:-$PLAN_FILE}")"
  echo "total_phases=${#PHASE_NAMES[@]}"
  echo "started_at=$(date -Iseconds)"
  echo "baseline_commit=$BASELINE_COMMIT"
} | tee "$META_LOG"

# ── Checklist extraction ─────────────────────────────────────────────

extract_phase_checklist() {
  local phase_name=$1

  # Try specific phase file first
  if [ -n "${PLAN_DIR:-}" ]; then
    local phase_num
    phase_num=$(echo "$phase_name" | grep -oE '[0-9]+' | head -1 || echo "")
    if [ -n "$phase_num" ]; then
      local pfile
      pfile=$(ls "$PLAN_DIR"/phase-${phase_num}*.md 2>/dev/null | head -1 || echo "")
      if [ -n "$pfile" ] && [ -f "$pfile" ]; then
        python3 -c "
import re
content = open('$pfile').read()
in_criteria = False
for line in content.split('\n'):
    s = line.strip()
    if s.startswith('#') and ('acceptance' in s.lower() or 'criteria' in s.lower()):
        in_criteria = True; continue
    if in_criteria and s.startswith('#'): break
    if in_criteria and re.match(r'^-\s*\[[ x]\]', s):
        print(re.sub(r'^-\s*\[[ x]\]\s*', '', s))
" 2>/dev/null || true
        return
      fi
    fi
  fi

  # Fallback: search combined plan
  echo "$PLAN_CONTENT" | python3 -c "
import re, sys
phase = '$phase_name'.lower().split(':')[0].strip()
content = sys.stdin.read()
in_phase = in_criteria = False
for line in content.split('\n'):
    s = line.strip(); low = s.lower()
    if phase in low and s.startswith('#'): in_phase = True; in_criteria = False; continue
    if in_phase and ('acceptance' in low or 'criteria' in low) and s.startswith('#'): in_criteria = True; continue
    if in_criteria and s.startswith('#'): break
    if in_criteria and re.match(r'^-\s*\[[ x]\]', s):
        print(re.sub(r'^-\s*\[[ x]\]\s*', '', s))
" 2>/dev/null || true
}

# ── Verification ─────────────────────────────────────────────────────

verify_phase() {
  local phase_num=$1
  local phase_name=$2
  local checklist
  checklist=$(extract_phase_checklist "$phase_name")

  # If no checklist, just check build + commits since baseline
  if [ -z "$checklist" ]; then
    echo "  No acceptance criteria — checking build + commits."
    if [ -n "$LINT_CMD" ]; then
      if (cd "$PROJECT_PATH" && eval "$LINT_CMD" >/dev/null 2>&1); then
        echo "  ✓ Lint passed"
      else
        echo "  ✗ Lint failed"
        return 1
      fi
    fi
    local new_commits
    new_commits=$(git -C "$PROJECT_PATH" rev-list "${BASELINE_COMMIT}..HEAD" 2>/dev/null | wc -l | tr -d ' ' || echo 0)
    if [ "$new_commits" -gt 0 ]; then
      echo "  ✓ $new_commits new commit(s)"
      return 0
    else
      echo "  ✗ No new commits since baseline"
      return 1
    fi
  fi

  local total=0 passed=0
  VERIFY_FAILED_ITEMS=""

  echo ""
  echo "  Verifying acceptance criteria..."
  echo ""

  while IFS= read -r item; do
    [ -z "$item" ] && continue
    total=$((total + 1))
    local ok=false

    # Auto-verify by pattern
    if echo "$item" | grep -qi "build passes\|pnpm build" 2>/dev/null; then
      (cd "$PROJECT_PATH" && pnpm build >/dev/null 2>&1) && ok=true
    elif echo "$item" | grep -qi "lint" 2>/dev/null; then
      [ -n "$LINT_CMD" ] && (cd "$PROJECT_PATH" && eval "$LINT_CMD" >/dev/null 2>&1) && ok=true
    elif echo "$item" | grep -qi "test.*passes\|pnpm test" 2>/dev/null; then
      [ -n "$TEST_CMD" ] && (cd "$PROJECT_PATH" && eval "$TEST_CMD" >/dev/null 2>&1) && ok=true
    elif echo "$item" | grep -qi "typecheck" 2>/dev/null; then
      (cd "$PROJECT_PATH" && pnpm -r --if-present typecheck >/dev/null 2>&1) && ok=true
    else
      # Check for file path references
      local file_ref
      file_ref=$(echo "$item" | grep -oE '[a-zA-Z0-9_/.-]+\.(tsx?|jsx?|md|json|css|sql)' | head -1 || echo "")
      if [ -n "$file_ref" ]; then
        [ -f "$PROJECT_PATH/$file_ref" ] && ok=true
        # Also try finding by basename
        if [ "$ok" = false ]; then
          find "$PROJECT_PATH" -path "*/node_modules" -prune -o -name "$(basename "$file_ref")" -print 2>/dev/null | head -1 | grep -q . && ok=true
        fi
      else
        # Non-verifiable item — pass if commits were made since baseline
        local new_commits
        new_commits=$(git -C "$PROJECT_PATH" rev-list "${BASELINE_COMMIT}..HEAD" 2>/dev/null | wc -l | tr -d ' ' || echo 0)
        [ "$new_commits" -gt 0 ] && ok=true
      fi
    fi

    if [ "$ok" = true ]; then
      printf "    ✓ %s\n" "$item"
      passed=$((passed + 1))
    else
      printf "    ✗ %s\n" "$item"
      VERIFY_FAILED_ITEMS="${VERIFY_FAILED_ITEMS}${item}\n"
    fi
  done <<< "$checklist"

  echo ""
  echo "  Checklist: $passed/$total passed"

  if [ -n "$VERIFY_FAILED_ITEMS" ]; then
    echo ""
    echo "  Failed criteria:"
    while IFS= read -r failed_item; do
      [ -n "$failed_item" ] || continue
      echo "    - $failed_item"
    done <<< "$(printf "%b" "$VERIFY_FAILED_ITEMS")"
  fi

  [ "$passed" -ge "$total" ] && return 0
  return 1
}

# ── Execute phases ───────────────────────────────────────────────────

MAX_ATTEMPTS="${AUTOCLAW_BUILD_MAX_ATTEMPTS:-3}"
VERIFY_FAILED_ITEMS=""

cd "$PROJECT_PATH"

for i in "${!PHASE_NAMES[@]}"; do
  PHASE_NUM=$((i + 1))
  PHASE_NAME="${PHASE_NAMES[$i]}"

  if [ "$PHASE_NUM" -le "$COMPLETED_PHASES" ]; then
    echo "[$PHASE_NUM/${#PHASE_NAMES[@]}] ${PHASE_NAME} — done, skipping"
    continue
  fi

  # Record commit before this phase for verification
  BASELINE_COMMIT=$(git -C "$PROJECT_PATH" rev-parse HEAD 2>/dev/null || echo "")

  phase_done=false
  attempt=0

  while [ "$phase_done" = false ] && [ "$attempt" -lt "$MAX_ATTEMPTS" ]; do
    attempt=$((attempt + 1))

    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    [ "$attempt" -gt 1 ] && echo "  [$PHASE_NUM/${#PHASE_NAMES[@]}] ${PHASE_NAME} — retry $attempt/$MAX_ATTEMPTS" || echo "  [$PHASE_NUM/${#PHASE_NAMES[@]}] ${PHASE_NAME}"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""

    TTY_LOG="$LOG_DIR/build-phase${PHASE_NUM}-attempt${attempt}-${STAMP}.typescript"

    # Build checklist block for prompt
    CHECKLIST_TEXT=$(extract_phase_checklist "$PHASE_NAME")
    CHECKLIST_BLOCK=""
    if [ -n "$CHECKLIST_TEXT" ]; then
      CHECKLIST_BLOCK="
## ACCEPTANCE CRITERIA — MANDATORY

You MUST complete ALL of these before stopping. Do NOT exit until every item is done.

$(echo "$CHECKLIST_TEXT" | while IFS= read -r citem; do [ -n "$citem" ] && echo "- [ ] $citem"; done)

After implementing, verify EACH item. If any fails, fix it before committing."
    fi

    # Retry context
    RETRY_BLOCK=""
    if [ "$attempt" -gt 1 ] && [ -n "$VERIFY_FAILED_ITEMS" ]; then
      RETRY_BLOCK="
## RETRY — PREVIOUS ATTEMPT INCOMPLETE

Attempt $attempt of $MAX_ATTEMPTS. These items still need work:

$(echo -e "$VERIFY_FAILED_ITEMS" | while IFS= read -r fitem; do [ -n "$fitem" ] && echo "- ✗ $fitem"; done)

Check git log and git diff for what's done. Do NOT redo completed work. Fix ONLY the failing items."
    fi

    PROMPT="You are implementing ${PHASE_NAME} of a build plan for ${PROJECT_NAME}.

Working directory: ${PROJECT_PATH}
Test command: ${TEST_CMD}
Lint command: ${LINT_CMD}

## The Full Plan

${PLAN_CONTENT}

## Your Task

Implement ONLY ${PHASE_NAME}. Do not skip ahead.
${CONTEXT}
${CHECKLIST_BLOCK}
${RETRY_BLOCK}

## Rules

1. Read referenced source files before adapting them.
2. Build incrementally — each piece working before the next.
3. Run tests and lint after completing the phase.
4. Git commit with descriptive message when done.
5. Do NOT stop until ALL acceptance criteria are met.
6. Do NOT implement other phases.

## Progress

$(cat "$PROGRESS_FILE" 2>/dev/null || echo "First phase — no prior progress.")

Implement ${PHASE_NAME} now. Do not stop until all criteria pass."

    # Provider command — MUST use non-interactive mode so the process exits when done
    case "$PROVIDER" in
      claude)
        # Claude --print mode: sends prompt, prints response, exits
        CMD=(claude --print --model opus --effort max --dangerously-skip-permissions --verbose)
        ;;
      codex)
        # Codex exec mode: non-interactive, exits when done
        CMD=(codex exec -m gpt-5.4 -c "model_reasoning_effort=\"high\"" --dangerously-bypass-approvals-and-sandbox)
        ;;
      codex-fast)
        CMD=(codex exec -m gpt-5.4 -c "model_reasoning_effort=\"high\"" --dangerously-bypass-approvals-and-sandbox)
        ;;
    esac

    # Run the AI session (non-interactive — logs to file, exits when done)
    echo "  Running ${PROVIDER}..."
    "${CMD[@]}" "$PROMPT" 2>&1 | tee "$TTY_LOG"

    # Verify
    echo ""
    echo "  Session ended. Verifying..."

    if verify_phase "$PHASE_NUM" "$PHASE_NAME"; then
      phase_done=true
    else
      if [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
        echo ""
        echo "  Build verification failed for ${PHASE_NAME} after $MAX_ATTEMPTS attempt(s)."
        {
          echo "ended_at=$(date -Iseconds)"
          echo "failed_phase=$PHASE_NAME"
          echo "failed_attempts=$attempt"
        } | tee -a "$META_LOG"
        exit 1
      else
        echo ""
        echo "  Retrying ($((attempt + 1))/$MAX_ATTEMPTS)..."
      fi
    fi
  done

  # Record progress
  if [ ! -f "$PROGRESS_FILE" ]; then
    echo "# Build Progress" > "$PROGRESS_FILE"
    echo "" >> "$PROGRESS_FILE"
  fi
  if ! grep -q "${PHASE_NAME}" "$PROGRESS_FILE" 2>/dev/null; then
    echo "- [x] ${PHASE_NAME} — $(date -Iseconds) ($attempt attempt(s))" >> "$PROGRESS_FILE"
  else
    sed -i '' "s|\[ \] ${PHASE_NAME}.*|[x] ${PHASE_NAME} — $(date -Iseconds)|" "$PROGRESS_FILE" 2>/dev/null || true
  fi
  echo ""
  echo "  ✓ Phase $PHASE_NUM recorded ($attempt attempt(s))."
done

# ── Post-build ───────────────────────────────────────────────────────

# Ingest into memory
if command -v autoclaw >/dev/null 2>&1; then
  echo ""
  echo "Ingesting results into memory..."
  "$SCRIPT_DIR/ingest-to-memory.sh" "$PROJECT_KEY" deep-review 2>&1 || true
fi

# Metadata
{
  echo "ended_at=$(date -Iseconds)"
  echo "phases_completed=$(grep -c '^\- \[x\]' "$PROGRESS_FILE" 2>/dev/null || echo 0)"
  echo "total_phases=${#PHASE_NAMES[@]}"
} | tee -a "$META_LOG"

# Archive if all done
completed_count=$(grep -c '^\- \[x\]' "$PROGRESS_FILE" 2>/dev/null || echo 0)
if [ "$completed_count" -ge "${#PHASE_NAMES[@]}" ] && [ "${#PHASE_NAMES[@]}" -gt 0 ] && [ -n "${PLAN_DIR:-}" ]; then
  DONE_DIR="$(dirname "$PLAN_DIR")/.done"
  mkdir -p "$DONE_DIR"
  mv "$PLAN_DIR" "$DONE_DIR/$(basename "$PLAN_DIR")"
  echo ""
  echo "All ${#PHASE_NAMES[@]} phases done. Archived to .done/$(basename "$PLAN_DIR")"
fi

echo ""
echo "Build complete."
echo "Progress: $PROGRESS_FILE"
