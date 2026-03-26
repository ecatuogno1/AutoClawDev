#!/usr/bin/env bash
set -Eeuo pipefail

# ──────────────────────────────────────────────────────────────────────────────
# build.sh — Execute a build plan phase by phase using Claude or Codex
#
# Usage:
#   build.sh <project-key> <plan-file> [--claude|--codex|--codex-fast] [--phase N]
#   build.sh clawbuster docs/T3CODE-PORT-PLAN.md
#   build.sh clawbuster docs/T3CODE-PORT-PLAN.md --codex --phase 2
#
# The plan file is a markdown doc with ## Phase headings.
# Each phase is executed as a separate AI session that:
#   1. Reads the plan
#   2. Reads project context (CLAUDE.md, AGENTS.md, etc.)
#   3. Implements the current phase
#   4. Validates (lint + test)
#   5. Commits
#   6. Saves progress
#   7. Moves to next phase
# ──────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECTS_DIR="${AUTOCLAWDEV_PROJECTS_DIR:-$HOME/.local/lib/autoclawdev/projects}"

# ── Parse args ───────────────────────────────────────────────────────────────

PROJECT_KEY=""
PLAN_FILE=""
PROVIDER="claude"
START_PHASE=""

LIST_MODE=false

for arg in "$@"; do
  case "$arg" in
    --claude)     PROVIDER="claude" ;;
    --codex)      PROVIDER="codex" ;;
    --codex-fast) PROVIDER="codex-fast" ;;
    --phase)      shift; START_PHASE="${1:-}" ;;
    --list|-l)    LIST_MODE=true ;;
    --help|-h)
      echo "Usage: build.sh <project-key> <plan-file> [--claude|--codex|--codex-fast] [--phase N]"
      echo "       build.sh <project-key> --list"
      echo ""
      echo "Executes a markdown build plan phase by phase."
      echo "Each ## Phase heading becomes a separate AI session."
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

  set +e  # disable strict mode for list — greps returning 0 matches are fine
  for d in "$BUILDS_DIR"/*/; do
    [ -d "$d" ] || continue
    name=$(basename "$d")
    [ "$name" = ".done" ] && continue

    plan_file="$d/plan.md"
    progress_file="$d/progress.md"

    if [ ! -f "$plan_file" ]; then
      continue
    fi

    # Count phases and completed phases
    phases=$(grep -cE "^#{1,3} Phase [0-9]" "$plan_file" 2>/dev/null || true)
    [ -z "$phases" ] && phases=0
    # Also check phase-*.md files
    phase_files=$(ls "$d"/phase-*.md 2>/dev/null | wc -l | tr -d ' ')
    [ "$phase_files" -gt "$phases" ] && phases="$phase_files"

    completed=0
    if [ -f "$progress_file" ]; then
      completed=$(grep -c "^\- \[x\]" "$progress_file" 2>/dev/null || true)
      [ -z "$completed" ] && completed=0
    fi

    criteria=$(cat "$d"/*.md 2>/dev/null | grep -c "^\- \[ \]" || true)
    [ -z "$criteria" ] && criteria=0

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

  # Show done plans
  if [ -d "$DONE_DIR" ]; then
    for d in "$DONE_DIR"/*/; do
      [ -d "$d" ] || continue
      name=$(basename "$d")
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

  set -e  # re-enable strict mode
  [ "$active" -eq 0 ] && [ "$done_count" -eq 0 ] && echo "  No build plans found."
  echo ""
  exit 0
fi

# Handle --phase with next arg
for i in $(seq 1 $#); do
  if [ "${!i}" = "--phase" ]; then
    next=$((i + 1))
    START_PHASE="${!next:-}"
  fi
done

if [ -z "$PROJECT_KEY" ] || [ -z "$PLAN_FILE" ]; then
  echo "ERROR: project key and plan file required"
  echo "Usage: build.sh <project-key> <plan-file> [--claude|--codex|--codex-fast]"
  exit 1
fi

# ── Load project config ──────────────────────────────────────────────────────

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

# Resolve plan file — check multiple locations:
# 1. Exact path as given
# 2. Relative to project root
# 3. As a build plan folder name in .autoclaw/builds/<name>/plan.md
# 4. As a build plan folder in .autoclaw/builds/<name>/ (concatenate all .md files)
PLAN_DIR=""
if [ -f "$PLAN_FILE" ]; then
  : # found as-is
elif [ -f "$PROJECT_PATH/$PLAN_FILE" ]; then
  PLAN_FILE="$PROJECT_PATH/$PLAN_FILE"
elif [ -f "$PROJECT_PATH/.autoclaw/builds/$PLAN_FILE/plan.md" ]; then
  PLAN_DIR="$PROJECT_PATH/.autoclaw/builds/$PLAN_FILE"
  PLAN_FILE="$PLAN_DIR/plan.md"
elif [ -d "$PROJECT_PATH/.autoclaw/builds/$PLAN_FILE" ]; then
  PLAN_DIR="$PROJECT_PATH/.autoclaw/builds/$PLAN_FILE"
  PLAN_FILE="$PLAN_DIR/plan.md"
else
  echo "ERROR: Plan file not found: $PLAN_FILE"
  echo ""
  echo "Looked in:"
  echo "  $PLAN_FILE"
  echo "  $PROJECT_PATH/$PLAN_FILE"
  echo "  $PROJECT_PATH/.autoclaw/builds/$PLAN_FILE/plan.md"
  echo ""
  # List available build plans
  local_plans="$PROJECT_PATH/.autoclaw/builds"
  if [ -d "$local_plans" ]; then
    echo "Available build plans:"
    for d in "$local_plans"/*/; do
      [ -d "$d" ] || continue
      echo "  $(basename "$d")"
    done
  fi
  exit 1
fi

# If we have a plan directory, concatenate all phase files into the plan
if [ -n "$PLAN_DIR" ] && [ -d "$PLAN_DIR" ]; then
  # Build a combined plan: plan.md first, then phase-*.md files in order
  PLAN_CONTENT="$(cat "$PLAN_FILE")"
  for phase_file in "$PLAN_DIR"/phase-*.md; do
    [ -f "$phase_file" ] || continue
    PLAN_CONTENT="${PLAN_CONTENT}

---

$(cat "$phase_file")"
  done
  echo "Loaded plan from $PLAN_DIR/ ($(ls "$PLAN_DIR"/phase-*.md 2>/dev/null | wc -l | tr -d ' ') phase files)"
else
  PLAN_CONTENT="$(cat "$PLAN_FILE")"
fi

# ── Extract phases from plan ─────────────────────────────────────────────────

PHASES=()
PHASE_NAMES=()

# Parse ## Phase headings from the plan
while IFS= read -r line; do
  if [[ "$line" =~ ^##[[:space:]]+(Phase[[:space:]]+[0-9]+|Phase[[:space:]]+[0-9]+:.*)$ ]]; then
    PHASE_NAMES+=("${BASH_REMATCH[1]}")
  fi
done <<< "$PLAN_CONTENT"

if [ ${#PHASE_NAMES[@]} -eq 0 ]; then
  # Try ### Phase headings
  while IFS= read -r line; do
    if [[ "$line" =~ ^###[[:space:]]+(Phase[[:space:]]+[0-9]+|Phase[[:space:]]+[0-9]+:.*)$ ]]; then
      PHASE_NAMES+=("${BASH_REMATCH[1]}")
    fi
  done <<< "$PLAN_CONTENT"
fi

if [ ${#PHASE_NAMES[@]} -eq 0 ]; then
  echo "ERROR: No phases found in plan file."
  echo "Plan must contain '## Phase 1: ...' headings."
  exit 1
fi

echo "Found ${#PHASE_NAMES[@]} phases in plan:"
for i in "${!PHASE_NAMES[@]}"; do
  echo "  $((i + 1)). ${PHASE_NAMES[$i]}"
done
echo ""

# ── Setup ────────────────────────────────────────────────────────────────────

# Use plan directory for logs if available, otherwise generic builds dir
if [ -n "$PLAN_DIR" ]; then
  LOG_DIR="$PLAN_DIR"
else
  LOG_DIR="$PROJECT_PATH/.autoclaw/builds"
fi
mkdir -p "$LOG_DIR"

STAMP="$(date +"%Y%m%d-%H%M%S")"
PROGRESS_FILE="$LOG_DIR/progress.md"
META_LOG="$LOG_DIR/build-${STAMP}.meta.txt"

# Read project context files
CONTEXT=""
for ctx_file in "$PROJECT_PATH/CLAUDE.md" "$PROJECT_PATH/AGENTS.md" "$PROJECT_PATH/README.md"; do
  if [ -f "$ctx_file" ]; then
    CONTEXT="${CONTEXT}
--- $(basename "$ctx_file") (first 80 lines) ---
$(head -80 "$ctx_file")
..."
  fi
done

# ── Check for resume ─────────────────────────────────────────────────────────

COMPLETED_PHASES=0
if [ -f "$PROGRESS_FILE" ]; then
  COMPLETED_PHASES=$(grep -c "^- \[x\]" "$PROGRESS_FILE" 2>/dev/null || echo 0)
  echo "Resuming: $COMPLETED_PHASES phase(s) already completed."
fi

# Allow --phase to override
if [ -n "$START_PHASE" ]; then
  COMPLETED_PHASES=$((START_PHASE - 1))
  echo "Starting from phase $START_PHASE (--phase override)"
fi

# ── Write metadata ───────────────────────────────────────────────────────────

{
  echo "provider=$PROVIDER"
  echo "project=$PROJECT_KEY"
  echo "plan_file=$PLAN_FILE"
  echo "total_phases=${#PHASE_NAMES[@]}"
  echo "started_at=$(date -Iseconds)"
} | tee "$META_LOG"


# ── Checklist extraction ─────────────────────────────────────────────

extract_phase_checklist() {
  local phase_name=$1

  # Try to find the specific phase file first (most reliable)
  if [ -n "$PLAN_DIR" ]; then
    local phase_num
    phase_num=$(echo "$phase_name" | grep -oE '[0-9]+' | head -1)
    if [ -n "$phase_num" ]; then
      local phase_file
      phase_file=$(ls "$PLAN_DIR"/phase-${phase_num}*.md 2>/dev/null | head -1)
      if [ -n "$phase_file" ] && [ -f "$phase_file" ]; then
        python3 -c "
import re, sys
content = open(sys.argv[1]).read()
lines = content.split('\n')
in_criteria = False
for line in lines:
    stripped = line.strip()
    low = stripped.lower()
    if ('acceptance' in low or 'criteria' in low or 'checklist' in low) and stripped.startswith('#'):
        in_criteria = True
        continue
    if in_criteria and stripped.startswith('#'):
        break
    if in_criteria and re.match(r'^-\s*\[[ x]\]', stripped):
        item = re.sub(r'^-\s*\[[ x]\]\s*', '', stripped)
        if item:
            print(item)
" "$phase_file"
        return
      fi
    fi
  fi

  # Fallback: search the combined plan content
  python3 -c "
import re, sys
phase_name = sys.argv[1]
content = sys.stdin.read()
lines = content.split('\n')
in_phase = False
in_criteria = False
for line in lines:
    stripped = line.strip()
    low = stripped.lower()
    phase_key = phase_name.lower().split(':')[0].strip()
    if phase_key in low and stripped.startswith('#'):
        in_phase = True
        in_criteria = False
        continue
    if in_phase and ('acceptance' in low or 'criteria' in low) and stripped.startswith('#'):
        in_criteria = True
        continue
    if in_criteria and stripped.startswith('#'):
        break
    if in_criteria and re.match(r'^-\s*\[[ x]\]', stripped):
        item = re.sub(r'^-\s*\[[ x]\]\s*', '', stripped)
        if item:
            print(item)
" "$phase_name" <<< "$PLAN_CONTENT"
}

verify_phase() {
  local phase_num=$1
  local phase_name=$2

  local checklist
  checklist=$(extract_phase_checklist "$phase_name")

  if [ -z "$checklist" ]; then
    echo "  No acceptance criteria found — checking build + lint only."
    # At minimum, verify the project builds
    if [ -n "$LINT_CMD" ]; then
      echo "  Running: $LINT_CMD"
      if ! (cd "$PROJECT_PATH" && eval "$LINT_CMD" >/dev/null 2>&1); then
        echo "  ✗ Lint failed"
        return 1
      fi
      echo "  ✓ Lint passed"
    fi
    # Check for commits in the last hour
    local recent=$(git -C "$PROJECT_PATH" log --oneline --since="1 hour ago" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$recent" -eq 0 ]; then
      echo "  ✗ No commits made (the AI may not have done anything)"
      return 1
    fi
    echo "  ✓ $recent commit(s) made"
    return 0
  fi

  local total=0
  local passed=0
  local failed_items=""

  echo ""
  echo "  Verifying acceptance criteria..."
  echo ""

  while IFS= read -r item; do
    [ -z "$item" ] && continue
    total=$((total + 1))
    local ok=false

    # Pattern-based verification
    if echo "$item" | grep -qi "build passes\|pnpm build"; then
      if (cd "$PROJECT_PATH" && pnpm build >/dev/null 2>&1); then ok=true; fi
    elif echo "$item" | grep -qi "lint\|pnpm lint"; then
      if [ -n "$LINT_CMD" ] && (cd "$PROJECT_PATH" && eval "$LINT_CMD" >/dev/null 2>&1); then ok=true; fi
    elif echo "$item" | grep -qi "test\|pnpm test"; then
      if [ -n "$TEST_CMD" ] && (cd "$PROJECT_PATH" && eval "$TEST_CMD" >/dev/null 2>&1); then ok=true; fi
    else
      # Check for file existence patterns
      local file_ref
      file_ref=$(echo "$item" | grep -oE '[a-zA-Z0-9_/.]+\.(tsx?|jsx?|md|json|css|vue|svelte)' | head -1)
      if [ -n "$file_ref" ]; then
        if [ -f "$PROJECT_PATH/$file_ref" ]; then
          ok=true
        else
          # Try finding it anywhere in the project
          if find "$PROJECT_PATH" -path "*/node_modules" -prune -o -name "$(basename "$file_ref")" -print 2>/dev/null | head -1 | grep -q .; then
            ok=true
          fi
        fi
      else
        # Can't auto-verify — check if there are recent commits (work was done)
        local recent=$(git -C "$PROJECT_PATH" log --oneline --since="30 minutes ago" 2>/dev/null | wc -l | tr -d ' ')
        if [ "$recent" -gt 0 ]; then ok=true; fi
      fi
    fi

    if [ "$ok" = true ]; then
      printf "    ✓ %s\n" "$item"
      passed=$((passed + 1))
    else
      printf "    ✗ %s\n" "$item"
      failed_items="${failed_items}${item}\n"
    fi
  done <<< "$checklist"

  echo ""
  echo "  Checklist: $passed/$total passed"

  # Export failed items for retry prompt
  VERIFY_FAILED_ITEMS="$failed_items"

  if [ "$passed" -lt "$total" ]; then
    return 1
  fi
  return 0
}

# ── Execute phases with verification loop ────────────────────────────

MAX_ATTEMPTS="${AUTOCLAW_BUILD_MAX_ATTEMPTS:-3}"
VERIFY_FAILED_ITEMS=""

cd "$PROJECT_PATH"

for i in "${!PHASE_NAMES[@]}"; do
  PHASE_NUM=$((i + 1))
  PHASE_NAME="${PHASE_NAMES[$i]}"

  # Skip completed phases
  if [ "$PHASE_NUM" -le "$COMPLETED_PHASES" ]; then
    echo "[$PHASE_NUM/${#PHASE_NAMES[@]}] ${PHASE_NAME} — already done, skipping"
    continue
  fi

  phase_done=false
  attempt=0

  while [ "$phase_done" = false ] && [ "$attempt" -lt "$MAX_ATTEMPTS" ]; do
    attempt=$((attempt + 1))

    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    if [ "$attempt" -gt 1 ]; then
      echo "  [$PHASE_NUM/${#PHASE_NAMES[@]}] ${PHASE_NAME} — retry $attempt/$MAX_ATTEMPTS"
    else
      echo "  [$PHASE_NUM/${#PHASE_NAMES[@]}] ${PHASE_NAME}"
    fi
    echo "═══════════════════════════════════════════════════════════════"
    echo ""

    TTY_LOG="$LOG_DIR/build-phase${PHASE_NUM}-attempt${attempt}-${STAMP}.typescript"

    # Get checklist items for the prompt
    CHECKLIST_TEXT=$(extract_phase_checklist "$PHASE_NAME")
    CHECKLIST_BLOCK=""
    if [ -n "$CHECKLIST_TEXT" ]; then
      CHECKLIST_BLOCK="
## ACCEPTANCE CRITERIA — MANDATORY

You MUST complete ALL of these before stopping. Do NOT exit until every item is done.
If you are unsure, re-read the plan. If something is blocked, explain why in a commit message.

$(echo "$CHECKLIST_TEXT" | while IFS= read -r item; do [ -n "$item" ] && echo "- [ ] $item"; done)

After implementing, verify EACH item. If any fails, fix it before committing."
    fi

    # Retry context
    RETRY_BLOCK=""
    if [ "$attempt" -gt 1 ] && [ -n "$VERIFY_FAILED_ITEMS" ]; then
      RETRY_BLOCK="
## RETRY — PREVIOUS ATTEMPT WAS INCOMPLETE

This is attempt $attempt of $MAX_ATTEMPTS. The previous attempt failed these checks:

$(echo -e "$VERIFY_FAILED_ITEMS" | while IFS= read -r line; do [ -n "$line" ] && echo "- ✗ $line"; done)

Check git log and git diff to see what was already done. Do NOT redo completed work.
Focus ONLY on the items above that are still failing."
    fi

    PROMPT="You are implementing ${PHASE_NAME} of a build plan for ${PROJECT_NAME}.

Working directory: ${PROJECT_PATH}
Test command: ${TEST_CMD}
Lint command: ${LINT_CMD}

## The Full Plan

${PLAN_CONTENT}

## Your Task

Implement ONLY ${PHASE_NAME}. Do not skip ahead to later phases.
Read the plan section for this phase carefully.

${CONTEXT}
${CHECKLIST_BLOCK}
${RETRY_BLOCK}

## Rules

1. Read any referenced source files before copying or adapting them.
2. Build incrementally — get each piece working before moving to the next.
3. Run the test and lint commands after completing the phase.
4. Create a git commit with a descriptive message when the phase is done.
5. Do NOT stop until ALL acceptance criteria are satisfied.
6. Do NOT implement other phases — ONLY ${PHASE_NAME}.

## Progress So Far

$(cat "$PROGRESS_FILE" 2>/dev/null || echo "No previous progress — this is the first phase.")

Implement ${PHASE_NAME} now. Complete every acceptance criterion before stopping."

    # Provider command
    case "$PROVIDER" in
      claude)
        CMD=(claude --model opus --effort max --dangerously-skip-permissions --verbose --chrome --name "build-${PROJECT_KEY}-phase${PHASE_NUM}")
        ;;
      codex)
        CMD=(codex -m gpt-5.4 -c "model_reasoning_effort=\"high\"" --dangerously-bypass-approvals-and-sandbox)
        ;;
      codex-fast)
        CMD=(codex -m gpt-5.4 -c "model_reasoning_effort=\"high\"" --dangerously-bypass-approvals-and-sandbox)
        ;;
    esac

    # Execute
    script -q "$TTY_LOG" "${CMD[@]}" "$PROMPT"

    # ── Verify ───────────────────────────────────────────────────────
    echo ""
    echo "  Session ended. Running verification..."

    if verify_phase "$PHASE_NUM" "$PHASE_NAME"; then
      phase_done=true
    else
      if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
        echo ""
        echo "  Some criteria not met. Retrying ($((attempt + 1))/$MAX_ATTEMPTS)..."
      else
        echo ""
        echo "  ✗ Max attempts ($MAX_ATTEMPTS) reached. Moving on."
        echo "    Some items may need manual attention."
        phase_done=true  # move to next phase anyway after max retries
      fi
    fi
  done

  # Update progress
  if [ "$phase_done" = true ]; then
    if ! grep -q "\[.\] ${PHASE_NAME}" "$PROGRESS_FILE" 2>/dev/null; then
      echo "- [x] ${PHASE_NAME} — verified $(date -Iseconds) ($attempt attempt(s))" >> "$PROGRESS_FILE"
    else
      sed -i '' "s|\[ \] ${PHASE_NAME}.*|[x] ${PHASE_NAME} — verified $(date -Iseconds)|" "$PROGRESS_FILE" 2>/dev/null || true
    fi
    echo ""
    echo "  ✓ Phase $PHASE_NUM complete ($attempt attempt(s))."
  fi
done

# ── Ingest into memory ───────────────────────────────────────────────
if command -v autoclaw >/dev/null 2>&1; then
  echo ""
  echo "Ingesting build results into memory..."
  "$SCRIPT_DIR/ingest-to-memory.sh" "$PROJECT_KEY" deep-review 2>&1 || true
fi

{
  echo "ended_at=$(date -Iseconds)"
  echo "exit_code=${EXIT_CODE:-0}"
  echo "phases_completed=$(grep -c '^\- \[x\]' "$PROGRESS_FILE" 2>/dev/null || echo 0)"
  echo "total_phases=${#PHASE_NAMES[@]}"
} | tee -a "$META_LOG"

# ── Archive if all phases done ────────────────────────────────────────

completed_count=$(grep -c '^\- \[x\]' "$PROGRESS_FILE" 2>/dev/null || echo 0)
if [ "$completed_count" -ge "${#PHASE_NAMES[@]}" ] && [ "${#PHASE_NAMES[@]}" -gt 0 ] && [ -n "$PLAN_DIR" ]; then
  DONE_DIR="$(dirname "$PLAN_DIR")/.done"
  PLAN_NAME="$(basename "$PLAN_DIR")"
  mkdir -p "$DONE_DIR"
  mv "$PLAN_DIR" "$DONE_DIR/$PLAN_NAME"
  echo ""
  echo "All ${#PHASE_NAMES[@]} phases verified. Plan archived to .done/$PLAN_NAME"
fi

echo ""
echo "Build complete."
echo "Progress: $PROGRESS_FILE"
echo "Logs: $LOG_DIR/"
