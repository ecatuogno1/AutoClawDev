#!/usr/bin/env bash
set -Eeuo pipefail

# ──────────────────────────────────────────────────────────────────────────────
# deep-review.sh — Launch a deep code review for any AutoClawDev project
#
# Usage:
#   deep-review.sh <project-key> [--claude|--codex|--codex-fast]
#   deep-review.sh clawbuster                  # Claude Opus (default)
#   deep-review.sh clawbuster --codex          # Codex GPT-5.4
#   deep-review.sh clawbuster --codex-fast     # Codex GPT-5.4 fast
#   deep-review.sh esc-renovations --claude    # Claude Opus
#
# The project key must match a registered project in AutoClawDev.
# Project configs are in ~/.local/lib/autoclawdev/projects/<key>.json
# ──────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECTS_DIR="${AUTOCLAWDEV_PROJECTS_DIR:-$HOME/.local/lib/autoclawdev/projects}"
PROMPTS_DIR="$SCRIPT_DIR/prompts"

# ── Parse args ───────────────────────────────────────────────────────────────

PROJECT_KEY=""
PROVIDER="claude"

for arg in "$@"; do
  case "$arg" in
    --claude)     PROVIDER="claude" ;;
    --codex)      PROVIDER="codex" ;;
    --codex-fast) PROVIDER="codex-fast" ;;
    --help|-h)
      echo "Usage: deep-review.sh <project-key> [--claude|--codex|--codex-fast]"
      echo ""
      echo "Projects:"
      for f in "$PROJECTS_DIR"/*.json; do
        [ -f "$f" ] || continue
        key=$(basename "$f" .json)
        name=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['name'])" "$f" 2>/dev/null || echo "$key")
        path=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['path'])" "$f" 2>/dev/null || echo "?")
        printf "  %-25s %s (%s)\n" "$key" "$name" "$path"
      done
      exit 0
      ;;
    -*)           ;; # skip unknown flags
    *)
      [ -z "$PROJECT_KEY" ] && PROJECT_KEY="$arg"
      ;;
  esac
done

if [ -z "$PROJECT_KEY" ]; then
  echo "ERROR: Project key required."
  echo "Usage: deep-review.sh <project-key> [--claude|--codex|--codex-fast]"
  echo "Run with --help to see available projects."
  exit 1
fi

# ── Load project config ──────────────────────────────────────────────────────

PROJECT_FILE="$PROJECTS_DIR/${PROJECT_KEY}.json"
if [ ! -f "$PROJECT_FILE" ]; then
  echo "ERROR: Project not found: $PROJECT_FILE"
  echo "Run with --help to see available projects."
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

# ── Check for project-specific prompt override ───────────────────────────────

PROMPT_FILE=""
if [ -f "$PROJECT_PATH/scripts/deep-review-prompt.md" ]; then
  PROMPT_FILE="$PROJECT_PATH/scripts/deep-review-prompt.md"
  echo "Using project-specific prompt: $PROMPT_FILE"
else
  # Generate prompt from template
  PROMPT_FILE=$(mktemp /tmp/deep-review-prompt-XXXXXX.md)
  trap 'rm -f "$PROMPT_FILE"' EXIT

  AUDIT_TEMPLATE=$(cat "$PROMPTS_DIR/deep-review-audit.txt")

  # Read program.md if it exists in the project
  PROGRAM_CONTENT=""
  for pfile in "$PROJECT_PATH/CLAUDE.md" "$PROJECT_PATH/AGENTS.md" "$PROJECT_PATH/PRD.md"; do
    if [ -f "$pfile" ]; then
      PROGRAM_CONTENT="${PROGRAM_CONTENT}
--- $(basename "$pfile") ---
$(head -100 "$pfile")
..."
    fi
  done
  [ -z "$PROGRAM_CONTENT" ] && PROGRAM_CONTENT="No program file found."

  MEMORY_CONTEXT=""

  # Build the full prompt by combining audit + fix instructions
  cat > "$PROMPT_FILE" << PROMPT_EOF
You are performing a deep code review and stabilization pass on this repository.

Project: $PROJECT_NAME
Test command: $TEST_CMD
Lint command: $LINT_CMD

Context files found in this repo (read these first if they exist):
$([ -f "$PROJECT_PATH/CLAUDE.md" ] && echo "- CLAUDE.md" || true)
$([ -f "$PROJECT_PATH/AGENTS.md" ] && echo "- AGENTS.md" || true)
$([ -f "$PROJECT_PATH/PRD.md" ] && echo "- PRD.md" || true)
$([ -f "$PROJECT_PATH/README.md" ] && echo "- README.md" || true)

Phase 1 — AUDIT (use parallel subagents, max 15 minutes):

Launch ALL subagents simultaneously. Do NOT crawl the repo sequentially.

Subagent 1 — Backend / server code:
- Scan all server-side code for: bugs, missing error handling, dead code, race conditions, silent failures
- Check database layer for: monolithic files, unused exports, missing indexes, injection risks
- Return: issues with file:line, severity, fix

Subagent 2 — Frontend code:
- Scan all frontend code for: broken pages, missing API connections, stubs, dead imports, broken state
- Check routes vs implementations, API client error handling
- Return: issues with file:line, severity, fix

Subagent 3 — Integrations and infrastructure:
- Check external integrations, Docker, deploy scripts, CI, env vars
- Return: issues with file:line, severity, fix

Subagent 4 — Dead code and duplicates:
- Find unused files, exports, components across the repo
- Find duplicate implementations, competing patterns
- Return: list of files/exports to remove or consolidate

Synthesize all subagent findings into:
- \`.autoclaw/reviews/audit-report.md\` — all findings
- \`.autoclaw/reviews/execution-plan.md\` — phased fix plan

Phase 2 — FIX (the rest of the session):

Implement fixes from the execution plan:
- Phase 1: critical fixes (crashes, security, data integrity)
- Phase 2: consolidation / cleanup (dead code, duplicates)
- Phase 3: structural refactors
- Phase 4: feature completion

After each phase:
- Run: $TEST_CMD
- Run: $LINT_CMD
- Git commit with descriptive message
- Save progress to \`.autoclaw/reviews/progress.md\`

Rules:
- ALWAYS commit at phase boundaries
- Save progress to \`.autoclaw/reviews/progress.md\` before context runs out
- Do not make blind changes without tracing dependencies

Resuming:
- Check \`.autoclaw/reviews/progress.md\` for previous session state
- Check \`git log --oneline -10\` and \`git diff --stat HEAD\`
- If resuming, skip audit and continue from the next unfinished phase

Start by checking if this is fresh or a resume. If fresh: launch subagents for audit, then fix. If resuming: read progress.md and continue.
PROMPT_EOF

  echo "Generated prompt from AutoClawDev templates"
fi

PROMPT="$(cat "$PROMPT_FILE")"

# ── Setup provider and logs ──────────────────────────────────────────────────

LOG_DIR="$PROJECT_PATH/.autoclaw/reviews"
mkdir -p "$LOG_DIR"

STAMP="$(date +"%Y%m%d-%H%M%S")"
SESSION_NAME="${PROJECT_KEY}-deep-review"

case "$PROVIDER" in
  claude)
    MODEL="${CLAUDE_MODEL:-opus}"
    TTY_LOG="$LOG_DIR/${SESSION_NAME}-claude-${STAMP}.typescript"
    META_LOG="$LOG_DIR/${SESSION_NAME}-claude-${STAMP}.meta.txt"

    CMD=(
      claude
      --model "$MODEL"
      --effort max
      --dangerously-skip-permissions
      --verbose
      --chrome
      --name "$SESSION_NAME"
    )

    DISPLAY_MODEL="$MODEL"
    DISPLAY_EFFORT="max"
    DISPLAY_PERMS="bypass"
    RESUME_HINT="claude --resume \"$SESSION_NAME\""
    ;;

  codex)
    MODEL="gpt-5.4"
    TTY_LOG="$LOG_DIR/${SESSION_NAME}-codex-${STAMP}.typescript"
    META_LOG="$LOG_DIR/${SESSION_NAME}-codex-${STAMP}.meta.txt"

    CMD=(
      codex
      -m "$MODEL"
      -c "model_reasoning_effort=\"high\""
      --dangerously-bypass-approvals-and-sandbox
      -C "$PROJECT_PATH"
    )

    DISPLAY_MODEL="$MODEL"
    DISPLAY_EFFORT="high"
    DISPLAY_PERMS="bypass"
    RESUME_HINT="codex resume --last"
    ;;

  codex-fast)
    MODEL="gpt-5.4"
    TTY_LOG="$LOG_DIR/${SESSION_NAME}-codex-fast-${STAMP}.typescript"
    META_LOG="$LOG_DIR/${SESSION_NAME}-codex-fast-${STAMP}.meta.txt"

    CMD=(
      codex
      -m "$MODEL"
      -c "model_reasoning_effort=\"high\""
      --dangerously-bypass-approvals-and-sandbox
      -C "$PROJECT_PATH"
    )

    DISPLAY_MODEL="$MODEL (fast)"
    DISPLAY_EFFORT="high"
    DISPLAY_PERMS="bypass"
    RESUME_HINT="codex resume --last"
    ;;
esac

# ── Write metadata ───────────────────────────────────────────────────────────

{
  echo "provider=$PROVIDER"
  echo "project=$PROJECT_KEY"
  echo "project_name=$PROJECT_NAME"
  echo "project_path=$PROJECT_PATH"
  echo "session_name=$SESSION_NAME"
  echo "started_at=$(date -Iseconds)"
  echo "model=$MODEL"
  echo "tty_log=$TTY_LOG"
  echo "test_cmd=$TEST_CMD"
  echo "lint_cmd=$LINT_CMD"
} | tee "$META_LOG"

# ── Launch ───────────────────────────────────────────────────────────────────

echo
echo "AutoClawDev Deep Review"
echo "Project : $PROJECT_NAME ($PROJECT_KEY)"
echo "Path    : $PROJECT_PATH"
echo "Provider: $PROVIDER"
echo "Model   : $DISPLAY_MODEL"
echo "Effort  : $DISPLAY_EFFORT"
echo "Perms   : $DISPLAY_PERMS"
echo "Log     : $TTY_LOG"
echo

cd "$PROJECT_PATH"

# macOS script: captures all terminal I/O
script -q "$TTY_LOG" "${CMD[@]}" "$PROMPT"
EXIT_CODE=$?

{
  echo "ended_at=$(date -Iseconds)"
  echo "exit_code=$EXIT_CODE"
} | tee -a "$META_LOG"

# ── Ingest findings into memory ──────────────────────────────────────────────
if [ -f "$PROJECT_PATH/.autoclaw/reviews/audit-report.md" ] || [ -f "$PROJECT_PATH/.autoclaw/reviews/audit-report.md" ]; then
  echo
  echo "Ingesting deep review findings into AutoClawDev memory..."
  "$SCRIPT_DIR/ingest-to-memory.sh" "$PROJECT_KEY" deep-review 2>&1 || echo "Warning: memory ingestion failed (non-fatal)"
fi

echo
echo "Session ended with code: $EXIT_CODE"
echo "Resume: $RESUME_HINT"
echo "Logs:   $LOG_DIR/"

exit "$EXIT_CODE"
