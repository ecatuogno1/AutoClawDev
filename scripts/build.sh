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

for arg in "$@"; do
  case "$arg" in
    --claude)     PROVIDER="claude" ;;
    --codex)      PROVIDER="codex" ;;
    --codex-fast) PROVIDER="codex-fast" ;;
    --phase)      shift; START_PHASE="${1:-}" ;;
    --help|-h)
      echo "Usage: build.sh <project-key> <plan-file> [--claude|--codex|--codex-fast] [--phase N]"
      echo ""
      echo "Executes a markdown build plan phase by phase."
      echo "Each ## Phase heading becomes a separate AI session."
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

# Resolve plan file (relative to project or absolute)
if [ ! -f "$PLAN_FILE" ]; then
  if [ -f "$PROJECT_PATH/$PLAN_FILE" ]; then
    PLAN_FILE="$PROJECT_PATH/$PLAN_FILE"
  else
    echo "ERROR: Plan file not found: $PLAN_FILE"
    exit 1
  fi
fi

PLAN_CONTENT="$(cat "$PLAN_FILE")"

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

LOG_DIR="$PROJECT_PATH/.autoclaw/builds"
mkdir -p "$LOG_DIR"

STAMP="$(date +"%Y%m%d-%H%M%S")"
PROGRESS_FILE="$LOG_DIR/build-progress.md"
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

# ── Execute phases ───────────────────────────────────────────────────────────

cd "$PROJECT_PATH"

for i in "${!PHASE_NAMES[@]}"; do
  PHASE_NUM=$((i + 1))
  PHASE_NAME="${PHASE_NAMES[$i]}"

  # Skip completed phases
  if [ "$PHASE_NUM" -le "$COMPLETED_PHASES" ]; then
    echo "[$PHASE_NUM/${#PHASE_NAMES[@]}] ${PHASE_NAME} — already done, skipping"
    continue
  fi

  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "  [$PHASE_NUM/${#PHASE_NAMES[@]}] ${PHASE_NAME}"
  echo "═══════════════════════════════════════════════════════════════"
  echo ""

  TTY_LOG="$LOG_DIR/build-phase${PHASE_NUM}-${STAMP}.typescript"

  # Build the prompt for this phase
  PROMPT="You are implementing ${PHASE_NAME} of a build plan for ${PROJECT_NAME}.

Working directory: ${PROJECT_PATH}
Test command: ${TEST_CMD}
Lint command: ${LINT_CMD}

## The Full Plan

${PLAN_CONTENT}

## Your Task

Implement ONLY ${PHASE_NAME}. Do not skip ahead to later phases.

Read the plan section for this phase carefully. It tells you exactly what to build, what files to create, and what to port/adapt.

${CONTEXT}

## Rules

1. Read any referenced source files before copying or adapting them.
2. Build incrementally — get each piece working before moving to the next.
3. Run ${TEST_CMD:-tests} and ${LINT_CMD:-lint} after completing the phase.
4. Create a git commit with a descriptive message when the phase is done.
5. If you run low on context, save progress to .autoclaw/builds/build-progress.md.
6. Do NOT implement other phases — only ${PHASE_NAME}.

## Progress So Far

$(cat "$PROGRESS_FILE" 2>/dev/null || echo "No previous progress — this is the first phase.")

Start implementing ${PHASE_NAME} now."

  # Build provider command
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

  # Execute the phase
  script -q "$TTY_LOG" "${CMD[@]}" "$PROMPT"
  EXIT_CODE=$?

  # Update progress
  if [ $EXIT_CODE -eq 0 ]; then
    # Check if this phase line already exists
    if ! grep -q "\[.\] ${PHASE_NAME}" "$PROGRESS_FILE" 2>/dev/null; then
      echo "- [x] ${PHASE_NAME} — completed $(date -Iseconds)" >> "$PROGRESS_FILE"
    else
      sed -i '' "s/\[ \] ${PHASE_NAME}.*/[x] ${PHASE_NAME} — completed $(date -Iseconds)/" "$PROGRESS_FILE" 2>/dev/null || true
    fi
    echo ""
    echo "Phase $PHASE_NUM completed (exit $EXIT_CODE)."
  else
    if ! grep -q "\[.\] ${PHASE_NAME}" "$PROGRESS_FILE" 2>/dev/null; then
      echo "- [ ] ${PHASE_NAME} — stopped $(date -Iseconds) (exit $EXIT_CODE)" >> "$PROGRESS_FILE"
    fi
    echo ""
    echo "Phase $PHASE_NUM stopped (exit $EXIT_CODE)."
    echo "Resume with: autoclaw build $PROJECT_KEY $PLAN_FILE --phase $PHASE_NUM"
    break
  fi
done

# ── Ingest findings into memory ──────────────────────────────────────────────
if command -v autoclaw >/dev/null 2>&1; then
  echo ""
  echo "Ingesting build results into memory..."
  "$SCRIPT_DIR/ingest-to-memory.sh" "$PROJECT_KEY" deep-review 2>&1 || true
fi

{
  echo "ended_at=$(date -Iseconds)"
  echo "exit_code=${EXIT_CODE:-0}"
  echo "phases_completed=$(grep -c "^\- \[x\]" "$PROGRESS_FILE" 2>/dev/null || echo 0)"
} | tee -a "$META_LOG"

echo ""
echo "Build session ended."
echo "Progress: $PROGRESS_FILE"
echo "Logs: $LOG_DIR/"
