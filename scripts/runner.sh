#!/bin/bash
# ╔══════════════════════════════════════════════════════════════╗
# ║  AutoClawDev Runner v3 — Multi-LLM Autoresearch Engine     ║
# ║  Opus (research/plan/review) + Codex 5.4 (implement)       ║
# ║  + CodeRabbit (review) + direct test/lint validation        ║
# ╚══════════════════════════════════════════════════════════════╝
set -uo pipefail

# ── Portability ──────────────────────────────────────────────────────
TMPDIR="${TMPDIR:-/tmp}"

# ── Config ───────────────────────────────────────────────────────────
REPO="${AUTOCLAWDEV_REPO:-}"
WORKSPACE="${AUTOCLAWDEV_WORKSPACE:-$HOME/.openclaw/workspace/autoresearch}"
PROJECTS_DIR="${AUTOCLAWDEV_PROJECTS_DIR:-$HOME/.local/lib/autoclawdev/projects}"
PROJECT_KEY="${3:-${AUTOCLAWDEV_PROJECT:-clawbuster}}"
PROGRAM="${AUTOCLAWDEV_PROGRAM:-$WORKSPACE/program.md}"
EXPERIMENTS="${AUTOCLAWDEV_EXPERIMENTS:-$WORKSPACE/experiments-${PROJECT_KEY}.jsonl}"
PROJECT_NAME="${AUTOCLAWDEV_NAME:-$PROJECT_KEY}"
TEST_CMD="${AUTOCLAWDEV_TEST_CMD:-}"
LINT_CMD="${AUTOCLAWDEV_LINT_CMD:-}"
SECURITY_CMD="${AUTOCLAWDEV_SECURITY_CMD:-}"
SECURITY_DEPENDENCY_CMD="${AUTOCLAWDEV_SECURITY_DEPENDENCY_CMD:-}"
PERFORMANCE_CMD="${AUTOCLAWDEV_PERFORMANCE_CMD:-}"
PROFILE_VALIDATION_JSON="${AUTOCLAWDEV_PROFILE_VALIDATION_JSON:-}"
DEV_SERVER_URL="${AUTOCLAWDEV_DEV_URL:-}"
BASE_BRANCH="${AUTOCLAWDEV_BASE_BRANCH:-}"
INTEGRATION_BRANCH="${AUTOCLAWDEV_INTEGRATION_BRANCH:-}"
MAX_PARALLEL_CYCLES="${AUTOCLAWDEV_MAX_PARALLEL_CYCLES:-1}"
GH_CONTEXT_REFRESH_SECONDS="${AUTOCLAWDEV_GH_CONTEXT_REFRESH_SECONDS:-30}"
RUNNER_MODE="${AUTOCLAWDEV_RUNNER_MODE:-parent}"
TEAM_PROFILE="${AUTOCLAWDEV_TEAM_PROFILE:-reliability}"
SPEED_PROFILE="${AUTOCLAWDEV_SPEED_PROFILE:-balanced}"
WORKFLOW_TYPE="${AUTOCLAWDEV_WORKFLOW_TYPE:-standard}"
BATCH_RESEARCH_COUNT="${AUTOCLAWDEV_BATCH_RESEARCH_COUNT:-3}"
BATCH_RESEARCH_AUTO="${AUTOCLAWDEV_BATCH_RESEARCH_AUTO:-0}"
MEMORY_ENABLED="${AUTOCLAWDEV_MEMORY_ENABLED:-1}"
ASSIGNED_EXP_ID="${AUTOCLAWDEV_ASSIGNED_EXP_ID:-}"
ASSIGNED_CYCLE_NUMBER="${AUTOCLAWDEV_ASSIGNED_CYCLE_NUMBER:-}"
INITIAL_BASELINE_JSON="${AUTOCLAWDEV_BASELINE_JSON:-}"
RECENT_CONTEXT_OVERRIDE="${AUTOCLAWDEV_RECENT_CONTEXT:-}"
GH_ISSUES_CONTEXT_OVERRIDE="${AUTOCLAWDEV_GH_ISSUES_CONTEXT:-}"
SKIP_PROJECT_LOCK="${AUTOCLAWDEV_SKIP_PROJECT_LOCK:-0}"
MAX_CYCLES=${1:-5}
DRY_RUN="${2:-}"
SOURCE_REPO=""
LANDING_REPO="${AUTOCLAWDEV_LANDING_REPO:-}"
CURRENT_WORKTREE=""
INTEGRATION_WORKTREE=""
CURRENT_BRANCH=""
CURRENT_RESERVATION_FILE=""
PRESERVE_CURRENT_WORKTREE=0
STOP_AFTER_CURRENT_CYCLE=0
AGENT_TIMEOUT_DEFAULT="${AUTOCLAWDEV_AGENT_TIMEOUT_DEFAULT:-900}"
AGENT_TIMEOUT_CODEX="${AUTOCLAWDEV_AGENT_TIMEOUT_CODEX:-1800}"
AGENT_TIMEOUT_OPUS="${AUTOCLAWDEV_AGENT_TIMEOUT_OPUS:-1200}"
AGENT_TIMEOUT_CODERABBIT="${AUTOCLAWDEV_AGENT_TIMEOUT_CODERABBIT:-600}"
AGENT_TIMEOUT_FIX="${AUTOCLAWDEV_AGENT_TIMEOUT_FIX:-600}"
# ── Per-phase model overrides (empty = use default agent) ────────────
MODEL_RESEARCH="${AUTOCLAWDEV_RESEARCH_MODEL:-sonnet}"
MODEL_PLANNING="${AUTOCLAWDEV_PLANNING_MODEL:-sonnet}"
MODEL_IMPL="${AUTOCLAWDEV_IMPL_MODEL:-}"          # empty = use Codex (default)
MODEL_REVIEW="${AUTOCLAWDEV_REVIEW_MODEL:-sonnet}"
MODEL_FIX="${AUTOCLAWDEV_FIX_MODEL:-}"            # empty = codex-spark (default)
CODEX_MODEL="${AUTOCLAWDEV_CODEX_MODEL:-gpt-5.3-codex-spark}" # codex model for Terry/Jerry
CODEX_FIX_MODEL="${AUTOCLAWDEV_CODEX_FIX_MODEL:-gpt-5.3-codex-spark}" # codex model for fix agent
VALIDATION_TIMEOUT="${AUTOCLAWDEV_VALIDATION_TIMEOUT:-1200}"
DEPENDENCY_BOOTSTRAP_TIMEOUT="${AUTOCLAWDEV_DEPENDENCY_BOOTSTRAP_TIMEOUT:-1800}"
VALIDATION_MODE="${AUTOCLAWDEV_VALIDATION_MODE:-serial}"
ALLOW_PREEXISTING_TEST_FAILURES="${AUTOCLAWDEV_ALLOW_PREEXISTING_TEST_FAILURES:-0}"
CODERABBIT_MAX_ROUNDS="${AUTOCLAWDEV_CODERABBIT_MAX_ROUNDS:-3}"
VALIDATION_FIX_ATTEMPTS="${AUTOCLAWDEV_VALIDATION_FIX_ATTEMPTS:-2}"
CAPTURE_VALIDATION_BASELINE="${AUTOCLAWDEV_CAPTURE_VALIDATION_BASELINE:-1}"
CYCLE_COOLDOWN_SECONDS="${AUTOCLAWDEV_CYCLE_COOLDOWN_SECONDS:-0}"
SKIP_PENNY_ON_CLEAN_CODERABBIT="${AUTOCLAWDEV_SKIP_PENNY_ON_CLEAN_CODERABBIT:-}"
# Review depth: none | validation-only | penny | full (coderabbit+penny)
# Default is "validation-only" — tests/lint only, no CR or Penny.
# Profiles can override: security/quality get "penny" by default.
REVIEW_DEPTH="${AUTOCLAWDEV_REVIEW_DEPTH:-}"
CODERABBIT_AVAILABLE=1
LOCKFILE=""
MERGE_LOCK_DIR=""
EXPERIMENTS_LOCK_DIR=""
RESERVATIONS_DIR=""
RESERVATIONS_LOCK_DIR=""
HALT_FILE=""
VALIDATION_BASELINES_DIR="${AUTOCLAWDEV_VALIDATION_BASELINES_DIR:-$WORKSPACE/validation-baselines}"
MEMORY_DIR="${AUTOCLAWDEV_MEMORY_DIR:-$WORKSPACE/memory}"
CURRENT_VALIDATION_SUMMARY=""
PROJECT_CONFIG_FILE="${AUTOCLAWDEV_PROJECT_CONFIG_FILE:-}"
RUNNER_PATH="$(python3 - "${BASH_SOURCE[0]}" <<'PY'
import os, sys
print(os.path.realpath(sys.argv[1]))
PY
)"
RUNNER_DIR="$(cd "$(dirname "$RUNNER_PATH")" && pwd)"
BROWSER_SNAPSHOT_SCRIPT="${AUTOCLAWDEV_BROWSER_SNAPSHOT:-$RUNNER_DIR/browser_snapshot.mjs}"
MEMORY_SCRIPT="${AUTOCLAWDEV_MEMORY_SCRIPT:-$RUNNER_DIR/memory_cache.py}"
PROMPTS_DIR="${AUTOCLAWDEV_PROMPTS_DIR:-$RUNNER_DIR/prompts}"

# ── Colors ───────────────────────────────────────────────────────────
RST="\033[0m"; B="\033[1m"; D="\033[2m"
FG_W="\033[97m"; FG_G="\033[38;5;114m"; FG_Y="\033[38;5;221m"
FG_R="\033[38;5;203m"; FG_C="\033[38;5;117m"; FG_M="\033[38;5;176m"
FG_B="\033[38;5;75m"; FG_O="\033[38;5;215m"; FG_D="\033[38;5;242m"
FG_DD="\033[38;5;238m"; FG_P="\033[38;5;141m"
BG_BAR="\033[48;5;236m"; BG_CARD="\033[48;5;235m"; BG_HEAD="\033[48;5;234m"

W=64

# ── UI Helpers ───────────────────────────────────────────────────────
section() { printf "${BG_HEAD}${B}${FG_W} %s %-$((W-3))s ${RST}\n" "$1" "$2"; }
cline()   { printf "${BG_CARD} %-${W}s ${RST}\n" "$1"; }
cblank()  { printf "${BG_CARD} %${W}s ${RST}\n" ""; }
hr()      { printf "${BG_HEAD}%$((W+2))s${RST}\n" ""; }
sbar() {
  local pct=$1 width=${2:-20} fg=$3
  [ "$pct" -lt 0 ] 2>/dev/null && pct=0; [ "$pct" -gt 100 ] 2>/dev/null && pct=100
  local full=$((pct*width/100)) empty=$((width-full))
  local blk=("░" "▏" "▎" "▍" "▌" "▋" "▊" "▉" "█")
  printf "${BG_BAR}${fg}"; for ((i=0;i<full;i++)); do printf "█"; done
  printf "${FG_DD}"; for ((i=0;i<empty;i++)); do printf "░"; done; printf "${RST}"
}

phase_detail() {
  printf "${BG_CARD}   ${FG_DD}%s${RST}${BG_CARD}%*s${RST}\n" "${1:0:$((W-5))}" 1 ""
}

memory_enabled() {
  [ "$MEMORY_ENABLED" = "1" ] && [ -f "$MEMORY_SCRIPT" ]
}

# ── LLM Calls (direct CLI — no OpenClaw overhead) ───────────────────

agent_timeout_for_label() {
  local label=$1
  case "$label" in
    */codex) printf "%s" "$AGENT_TIMEOUT_CODEX" ;;
    */opus|*/visual) printf "%s" "$AGENT_TIMEOUT_OPUS" ;;
    */sonnet|*/haiku) printf "%s" "$AGENT_TIMEOUT_OPUS" ;;
    CodeRabbit) printf "%s" "$AGENT_TIMEOUT_CODERABBIT" ;;
    Fix/sonnet|Fix/codex-spark|Fix/haiku) printf "%s" "$AGENT_TIMEOUT_FIX" ;;
    *) printf "%s" "$AGENT_TIMEOUT_DEFAULT" ;;
  esac
}

run_command_with_timeout() {
  local timeout_secs=$1 output_file=$2 cmd=$3
  : > "$output_file"

  python3 - "$output_file" "$cmd" <<'PY' &
import os
import sys

output_path = sys.argv[1]
command = sys.argv[2]

with open(output_path, "ab", buffering=0) as output_file:
    os.setsid()
    os.dup2(output_file.fileno(), 1)
    os.dup2(output_file.fileno(), 2)
    os.execvp("bash", ["bash", "-lc", command])
PY
  local cmd_pid=$!
  local timed_out=false
  local started_at=$(date +%s)

  while kill -0 "$cmd_pid" 2>/dev/null; do
    if [ $(( $(date +%s) - started_at )) -ge "$timeout_secs" ]; then
      timed_out=true
      kill -TERM -- "-$cmd_pid" 2>/dev/null || kill -TERM "$cmd_pid" 2>/dev/null || true
      sleep 2
      kill -KILL -- "-$cmd_pid" 2>/dev/null || kill -KILL "$cmd_pid" 2>/dev/null || true
      break
    fi
    sleep 1
  done

  wait "$cmd_pid" 2>/dev/null
  local cmd_exit=$?

  if [ "$timed_out" = true ]; then
    printf "\n[AUTOCLAWDEV] Command timed out after %ss.\n" "$timeout_secs" >> "$output_file"
    return 124
  fi

  return "$cmd_exit"
}

review_indicates_preexisting_failures() {
  local review_text=$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')
  echo "$review_text" | grep -qiE "pre-existing|preexisting|unrelated to this change|not from this patch|not due to this patch|not related to this change"
}

validation_output_is_environment_issue() {
  local combined
  combined=$(printf '%s\n' "$@")
  echo "$combined" | grep -qiE "unsupported package manager specification|command not found|missing package.json|local package\\.json exists, but node_modules missing|sh: (tsc|vitest|eslint|semgrep): command not found|could you approve the command|i need your approval|approval to run|requires approval|eperm.*node_modules/.vite/vitest/results.json|permission denied.*node_modules/.vite/vitest/results.json"
}

validation_output_is_broad_repo_failure() {
  local combined
  combined=$(printf '%s\n' "$@")
  local scope_count
  scope_count=$(
    printf '%s\n' "$combined" \
      | grep -oE '(^|[[:space:]])((packages|apps)/[A-Za-z0-9._-]+)' \
      | sed -E 's/^.*((packages|apps)\/[A-Za-z0-9._-]+)$/\1/' \
      | sort -u \
      | wc -l \
      | tr -d ' '
  )
  [ "${scope_count:-0}" -ge 3 ]
}

profile_validation_is_blocking_failure() {
  local profile_name=${1:-}
  local profile_output=${2:-}
  [ -n "$profile_name" ] || return 1
  printf '%s\n' "$profile_output" | grep -qiE 'command "profile:[^"]+" not found|no such file or directory|cannot find module|ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL|missing package\.json|node_modules missing'
}

review_fixes_indicate_actual_changes() {
  local fixes="${1:-}"
  [ -n "$fixes" ] || return 1
  case "$fixes" in
    none|None|NONE)
      return 1
      ;;
    none\ *|None\ *|NONE\ *)
      return 1
      ;;
  esac
  return 0
}

extract_response_field() {
  local label=${1:-}
  [ -n "$label" ] || return 0
  FIELD_LABEL="$label" python3 -c '
import os, re, sys
label = os.environ.get("FIELD_LABEL", "")
if not label:
    raise SystemExit(0)
pattern = re.compile(r"^\s*[*_\-]*" + re.escape(label) + r":[*_\-\s]*(.*)$", re.IGNORECASE)
next_field = re.compile(r"^\s*[*_\-]*[A-Z][A-Z0-9_ -]*:\s*(.*)$")
lines = sys.stdin.read().splitlines()
for idx, line in enumerate(lines):
    match = pattern.match(line)
    if not match:
        continue
    inline = match.group(1).strip()
    if inline:
        print(inline)
        break

    block = []
    for follow in lines[idx + 1:]:
        if next_field.match(follow):
            break
        block.append(follow.rstrip())

    while block and not block[0].strip():
        block.pop(0)
    while block and not block[-1].strip():
        block.pop()
    if block:
        print("\n".join(block))
    break
'
}

repo_has_node_modules_tree() {
  local repo=${1:-}
  [ -n "$repo" ] || return 1
  find "$repo" -mindepth 1 -maxdepth 3 -type d -name node_modules -print -quit 2>/dev/null | grep -q .
}

detect_repo_package_manager() {
  local repo=${1:-}
  if [ -f "$repo/pnpm-lock.yaml" ]; then
    printf "pnpm"
  elif [ -f "$repo/bun.lockb" ] || [ -f "$repo/bun.lock" ]; then
    printf "bun"
  elif [ -f "$repo/yarn.lock" ]; then
    printf "yarn"
  elif [ -f "$repo/package-lock.json" ] || [ -f "$repo/package.json" ]; then
    printf "npm"
  fi
}

dependency_install_command_for_repo() {
  local repo=${1:-}
  case "$(detect_repo_package_manager "$repo")" in
    pnpm)
      printf "pnpm install --frozen-lockfile || pnpm install"
      ;;
    npm)
      printf "npm install"
      ;;
    yarn)
      printf "yarn install --frozen-lockfile || yarn install"
      ;;
    bun)
      printf "bun install"
      ;;
  esac
}

bootstrap_validation_dependencies() {
  local repo=${1:-}
  [ "$(validation_command_count)" -gt 0 ] || return 0
  [ -n "$repo" ] || return 0
  [ -f "$repo/package.json" ] || return 0
  if repo_has_node_modules_tree "$repo"; then
    return 0
  fi

  local install_cmd
  install_cmd=$(dependency_install_command_for_repo "$repo")
  [ -n "$install_cmd" ] || return 0

  local install_file
  install_file=$(mktemp "$TMPDIR/autoresearch-bootstrap-XXXXXX")
  printf "[AUTOCLAWDEV] Bootstrapping validation dependencies in %s\n" "$repo" >&2
  run_command_with_timeout "$DEPENDENCY_BOOTSTRAP_TIMEOUT" "$install_file" "cd '$repo' && $install_cmd"
  local install_exit=$?
  local install_output
  install_output=$(cat "$install_file" 2>/dev/null)
  rm -f "$install_file"

  if [ $install_exit -ne 0 ] || ! repo_has_node_modules_tree "$repo"; then
    printf "ERROR: dependency bootstrap failed for %s\n" "$repo" >&2
    [ -n "$install_output" ] && printf "%s\n" "$install_output" >&2
    return 1
  fi

  return 0
}

dependency_link_source_repo() {
  if [ -n "$LANDING_REPO" ] && repo_has_node_modules_tree "$LANDING_REPO"; then
    printf "%s" "$LANDING_REPO"
  elif repo_has_node_modules_tree "$SOURCE_REPO"; then
    printf "%s" "$SOURCE_REPO"
  fi
}

repo_changed_files() {
  local repo=${1:-}
  [ -n "$repo" ] || return 0
  # First try: uncommitted changes vs HEAD (covers unstaged + staged)
  local files
  files=$(git -C "$repo" diff --name-only --diff-filter=ACMRTUXB HEAD -- 2>/dev/null || true)
  if [ -n "$files" ]; then
    printf '%s' "$files"
    return 0
  fi
  # Fallback: if Codex auto-committed, compare HEAD against the fork point
  # (where the cycle branch diverged from integration). Use merge-base to
  # handle the case where integration moved forward from other workers.
  local base_ref="${INTEGRATION_BRANCH:-}"
  if [ -n "$base_ref" ]; then
    local fork_point
    fork_point=$(git -C "$repo" merge-base "$base_ref" HEAD 2>/dev/null || true)
    if [ -n "$fork_point" ]; then
      files=$(git -C "$repo" diff --name-only --diff-filter=ACMRTUXB "$fork_point" HEAD -- 2>/dev/null || true)
      if [ -n "$files" ]; then
        printf '%s' "$files"
        return 0
      fi
    fi
    # Direct comparison as last attempt
    files=$(git -C "$repo" diff --name-only --diff-filter=ACMRTUXB "$base_ref" HEAD -- 2>/dev/null || true)
    if [ -n "$files" ]; then
      printf '%s' "$files"
      return 0
    fi
  fi
  # Fallback: check git log for recent commits and show their changed files
  local recent_commits
  recent_commits=$(git -C "$repo" log --format="%H" -5 HEAD 2>/dev/null || true)
  if [ -n "$recent_commits" ]; then
    for commit_sha in $recent_commits; do
      local commit_msg
      commit_msg=$(git -C "$repo" log -1 --format="%s" "$commit_sha" 2>/dev/null || true)
      # Only include commits that look like they were made by Codex/autoresearch
      case "$commit_msg" in
        *codex*|*Codex*|*autoresearch*|*Applied*|*Implement*|*Fix*|*Add*|*Update*)
          files=$(git -C "$repo" diff-tree --no-commit-id --name-only -r "$commit_sha" 2>/dev/null || true)
          if [ -n "$files" ]; then
            printf '%s' "$files"
            return 0
          fi
          ;;
      esac
    done
  fi
  # Last resort: show status including untracked
  git -C "$repo" status --porcelain 2>/dev/null | awk '{print $2}' || true
}

repo_has_dependency_manifest_changes() {
  local repo=${1:-}
  repo_changed_files "$repo" | grep -qE '(^|/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|npm-shrinkwrap\.json)$'
}

quote_command_args_from_lines() {
  python3 - <<'PY'
import shlex
import sys

items = [line.strip() for line in sys.stdin.read().splitlines() if line.strip()]
print(" ".join(shlex.quote(item) for item in items))
PY
}

join_commands_with_and() {
  python3 - <<'PY'
import sys

parts = [line.strip() for line in sys.stdin.read().splitlines() if line.strip()]
print(" && ".join(parts))
PY
}

effective_test_command_for_repo() {
  local repo=${1:-}
  [ -n "$repo" ] || return 0
  [ -n "$TEST_CMD" ] || return 0

  local changed_files
  changed_files=$(repo_changed_files "$repo")
  [ -n "$changed_files" ] || {
    printf "%s" "$TEST_CMD"
    return 0
  }

  case "$PROJECT_KEY" in
    clawbuster)
      if printf '%s\n' "$changed_files" | grep -qE '(^|/)(package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?|npm-shrinkwrap\.json|tsconfig.*\.json|vitest.*|eslint.*|scripts/)'; then
        printf "%s" "$TEST_CMD"
        return 0
      fi
      if printf '%s\n' "$changed_files" | grep -qE '^apps/server/|^packages/types/'; then
        printf "pnpm --filter @clawbuster/server test"
        return 0
      fi
      return 0
      ;;
    esc-renovations)
      if printf '%s\n' "$changed_files" | grep -qE '(^|/)(package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?|npm-shrinkwrap\.json|vitest.*|scripts/qa/|scripts/test|scripts/run-|playwright\.config|turbo\.json|tsconfig.*\.json)'; then
        printf "%s" "$TEST_CMD"
        return 0
      fi

      local commands=()
      if printf '%s\n' "$changed_files" | grep -qE '^packages/domain/'; then
        commands+=("pnpm --filter @repo/domain test")
      fi
      if printf '%s\n' "$changed_files" | grep -qE '^packages/data/'; then
        commands+=("pnpm --filter @repo/data test")
      fi
      if printf '%s\n' "$changed_files" | grep -qE '^apps/macos/'; then
        commands+=("pnpm --filter macos test")
      fi
      if printf '%s\n' "$changed_files" | grep -qE '^apps/web/'; then
        commands+=("pnpm --filter web test")
      fi

      if printf '%s\n' "$changed_files" | grep -qE '^supabase/functions/approveAIAction/'; then
        commands+=("pnpm test:approve-ai-action")
      elif printf '%s\n' "$changed_files" | grep -qE '^supabase/functions/rejectAIAction/'; then
        commands+=("pnpm test:reject-ai-action")
      elif printf '%s\n' "$changed_files" | grep -qE '^supabase/functions/twilioReceptionist/'; then
        commands+=("pnpm test:twilio-receptionist")
      elif printf '%s\n' "$changed_files" | grep -qE '^supabase/functions/twilioSmsReceptionist/'; then
        commands+=("pnpm test:twilio-sms-receptionist")
      elif printf '%s\n' "$changed_files" | grep -qE '^supabase/functions/'; then
        commands+=("pnpm --filter @repo/data test")
      fi

      if [ ${#commands[@]} -eq 0 ]; then
        return 0
      fi
      printf '%s\n' "${commands[@]}" | awk '!seen[$0]++' | join_commands_with_and
      return 0
      ;;
    *)
      printf "%s" "$TEST_CMD"
      return 0
      ;;
  esac
}

effective_lint_command_for_repo() {
  local repo=${1:-}
  [ -n "$repo" ] || return 0
  [ -n "$LINT_CMD" ] || return 0

  local changed_files
  changed_files=$(repo_changed_files "$repo")
  [ -n "$changed_files" ] || {
    printf "%s" "$LINT_CMD"
    return 0
  }

  case "$PROJECT_KEY" in
    clawbuster)
      if printf '%s\n' "$changed_files" | grep -qE '(^|/)(package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?|npm-shrinkwrap\.json|tsconfig.*\.json|eslint.*|scripts/)'; then
        printf "%s" "$LINT_CMD"
        return 0
      fi
      local packages=()
      printf '%s\n' "$changed_files" | grep -qE '^packages/types/' && packages+=("@clawbuster/types")
      printf '%s\n' "$changed_files" | grep -qE '^apps/server/' && packages+=("@clawbuster/server")
      printf '%s\n' "$changed_files" | grep -qE '^apps/web/' && packages+=("@clawbuster/web")
      printf '%s\n' "$changed_files" | grep -qE '^apps/ingestion-node/' && packages+=("@clawbuster/ingestion-node")
      printf '%s\n' "$changed_files" | grep -qE '^apps/viewer-web/' && packages+=("@clawbuster/viewer-web")
      if [ ${#packages[@]} -eq 0 ]; then
        return 0
      fi
      printf '%s\n' "${packages[@]}" | awk '!seen[$0]++ {print "pnpm --filter " $0 " lint"}' | join_commands_with_and
      return 0
      ;;
    esc-renovations)
      if printf '%s\n' "$changed_files" | grep -qE '(^|/)(package-lock\.json|yarn\.lock|bun\.lockb?|npm-shrinkwrap\.json)$'; then
        printf "%s" "$LINT_CMD"
        return 0
      fi
      local eslint_targets
      eslint_targets=$(printf '%s\n' "$changed_files" | grep -E '^(apps|packages|supabase/functions|scripts)/.*\.(js|jsx|ts|tsx|mjs|cjs)$|^eslint\.config\.js$' || true)
      if [ -n "$eslint_targets" ]; then
        local quoted_targets
        quoted_targets=$(printf '%s\n' "$eslint_targets" | awk '!seen[$0]++' | quote_command_args_from_lines)
        if [ -n "$quoted_targets" ] && [ -f "$repo/node_modules/eslint/bin/eslint.js" ]; then
          printf "node --max-old-space-size=4096 ./node_modules/eslint/bin/eslint.js %s" "$quoted_targets"
          return 0
        fi
      fi
      return 0
      ;;
    *)
      printf "%s" "$LINT_CMD"
      return 0
      ;;
  esac
}

validation_command_count_for_repo() {
  local repo=${1:-$REPO}
  local count=0
  [ -n "$(effective_test_command_for_repo "$repo")" ] && count=$((count + 1))
  [ -n "$(effective_lint_command_for_repo "$repo")" ] && count=$((count + 1))
  [ -n "$(active_profile_validation_command_for_repo "$repo" "cycle")" ] && count=$((count + 1))
  printf "%s" "$count"
}

validation_phase_skip_summary_for_effective_cmd() {
  local label=$1
  local effective_cmd=${2:-}
  local configured_cmd=${3:-}
  if [ -n "$effective_cmd" ]; then
    validation_phase_skip_summary "$label" "$effective_cmd"
  elif [ -n "$configured_cmd" ]; then
    printf "Not relevant to changed files"
  else
    printf "No %s command configured" "$label"
  fi
}

pretty_profile_label() {
  local profile=${1:-}
  [ -n "$profile" ] || return 0
  printf "%s" "$profile" | tr '-' ' ' | awk '{ for (i = 1; i <= NF; i++) { $i = toupper(substr($i, 1, 1)) substr($i, 2) } print }'
}

active_profile_validation_name() {
  local profile
  profile=$(team_profile_label)
  [ "$profile" = "reliability" ] && return 0
  printf "%s" "$profile"
}

profile_validation_entry_json() {
  local profile=${1:-}
  [ -n "$profile" ] || {
    printf "{}"
    return 0
  }

  PROFILE_VALIDATION_RAW="${PROFILE_VALIDATION_JSON:-}" PROFILE_VALIDATION_NAME="$profile" python3 - <<'PY'
import json
import os

raw = os.environ.get("PROFILE_VALIDATION_RAW", "").strip()
profile = os.environ.get("PROFILE_VALIDATION_NAME", "").strip()

try:
    data = json.loads(raw) if raw else {}
except json.JSONDecodeError:
    data = {}

entry = data.get(profile, {})
if not isinstance(entry, dict):
    entry = {}

print(json.dumps(entry, separators=(",", ":")))
PY
}

profile_validation_command_from_entry() {
  local profile=${1:-}
  PROFILE_VALIDATION_ENTRY="$(profile_validation_entry_json "$profile")" python3 - <<'PY'
import json
import os

entry = json.loads(os.environ.get("PROFILE_VALIDATION_ENTRY", "{}") or "{}")
value = entry.get("command", "")
print(value if isinstance(value, str) else "")
PY
}

profile_validation_runs_on_baseline() {
  local profile=${1:-}
  PROFILE_VALIDATION_ENTRY="$(profile_validation_entry_json "$profile")" python3 - <<'PY'
import json
import os

entry = json.loads(os.environ.get("PROFILE_VALIDATION_ENTRY", "{}") or "{}")
print("1" if entry.get("run_on_baseline") is True else "0")
PY
}

profile_validation_has_relevance_paths() {
  local profile=${1:-}
  PROFILE_VALIDATION_ENTRY="$(profile_validation_entry_json "$profile")" python3 - <<'PY'
import json
import os

entry = json.loads(os.environ.get("PROFILE_VALIDATION_ENTRY", "{}") or "{}")
paths = entry.get("relevance_paths", [])
print("1" if isinstance(paths, list) and any(isinstance(item, str) and item for item in paths) else "0")
PY
}

profile_validation_is_relevant_for_repo() {
  local repo=${1:-}
  local profile=${2:-}
  [ -n "$repo" ] || return 1
  [ -n "$profile" ] || return 1

  local changed_files
  changed_files=$(repo_changed_files "$repo")
  [ -n "$changed_files" ] || return 0

  PROFILE_VALIDATION_ENTRY="$(profile_validation_entry_json "$profile")" \
  PROFILE_CHANGED_FILES="$changed_files" python3 - <<'PY'
import json
import os
import sys

entry = json.loads(os.environ.get("PROFILE_VALIDATION_ENTRY", "{}") or "{}")
changed_files = [line.strip() for line in os.environ.get("PROFILE_CHANGED_FILES", "").splitlines() if line.strip()]
paths = entry.get("relevance_paths", [])

if not isinstance(paths, list) or not paths:
    raise SystemExit(0)

for changed in changed_files:
    for raw_path in paths:
        if not isinstance(raw_path, str) or not raw_path:
            continue
        if raw_path.endswith("/"):
            if changed.startswith(raw_path):
                raise SystemExit(0)
        elif changed == raw_path:
            raise SystemExit(0)

raise SystemExit(1)
PY
}

effective_security_command_for_repo() {
  local repo=${1:-}
  local mode=${2:-cycle}
  local parts=()

  [ -n "$SECURITY_CMD" ] && parts+=("$SECURITY_CMD")
  if [ -n "$SECURITY_DEPENDENCY_CMD" ] && { [ "$mode" = "baseline" ] || repo_has_dependency_manifest_changes "$repo"; }; then
    parts+=("$SECURITY_DEPENDENCY_CMD")
  fi

  if [ ${#parts[@]} -eq 0 ]; then
    return 0
  fi

  local joined=""
  local part
  for part in "${parts[@]}"; do
    if [ -n "$joined" ]; then
      joined="$joined && $part"
    else
      joined="$part"
    fi
  done
  printf "%s" "$joined"
}

performance_validation_is_relevant_for_repo() {
  local repo=${1:-}
  [ -n "$PERFORMANCE_CMD" ] || return 1
  [ -n "$repo" ] || return 1

  local changed_files
  changed_files=$(repo_changed_files "$repo")
  if [ -z "$changed_files" ]; then
    return 0
  fi

  printf '%s\n' "$changed_files" | grep -qE '^(apps/(web|mobile|macos)/|packages/ui/|scripts/performance/|package\.json$|pnpm-lock\.yaml$|yarn\.lock$|package-lock\.json$|bun\.lockb?$|npm-shrinkwrap\.json$)'
}

effective_performance_command_for_repo() {
  local repo=${1:-}
  local mode=${2:-cycle}
  [ -n "$PERFORMANCE_CMD" ] || return 0

  if [ "$mode" = "baseline" ] || performance_validation_is_relevant_for_repo "$repo"; then
    printf "%s" "$PERFORMANCE_CMD"
  fi
}

active_profile_validation_command_for_repo() {
  local repo=${1:-}
  local mode=${2:-cycle}
  local profile=""
  profile=$(active_profile_validation_name)
  [ -n "$profile" ] || return 0

  local configured_command=""
  configured_command=$(profile_validation_command_from_entry "$profile")
  if [ -n "$configured_command" ]; then
    if [ "$mode" = "baseline" ]; then
      [ "$(profile_validation_runs_on_baseline "$profile")" = "1" ] && printf "%s" "$configured_command"
      return 0
    fi

    if [ "$(profile_validation_has_relevance_paths "$profile")" = "0" ] || profile_validation_is_relevant_for_repo "$repo" "$profile"; then
      printf "%s" "$configured_command"
    fi
    return 0
  fi

  case "$profile" in
    security)
      effective_security_command_for_repo "$repo" "$mode"
      ;;
    performance)
      effective_performance_command_for_repo "$repo" "$mode"
      ;;
  esac
}

active_profile_validation_skip_summary() {
  local repo=${1:-}
  local effective_cmd=${2:-}
  local profile=""
  profile=$(active_profile_validation_name)
  [ -n "$profile" ] || return 0

  local label=""
  label=$(pretty_profile_label "$profile")

  if [ -n "$effective_cmd" ]; then
    validation_phase_skip_summary "$label" "$effective_cmd"
    return
  fi

  if [ -n "$(profile_validation_command_from_entry "$profile")" ] && [ -n "$repo" ] && [ "$(profile_validation_has_relevance_paths "$profile")" = "1" ] && ! profile_validation_is_relevant_for_repo "$repo" "$profile"; then
    printf "Not relevant to changed files"
    return
  fi

  if [ "$profile" = "performance" ] && [ -n "$PERFORMANCE_CMD" ] && [ -n "$repo" ] && ! performance_validation_is_relevant_for_repo "$repo"; then
    printf "Not relevant to changed files"
    return
  fi

  validation_phase_skip_summary "$label" "$effective_cmd"
}

normalize_team_profile() {
  local raw=${1:-reliability}
  raw=$(printf "%s" "$raw" | tr '[:upper:]' '[:lower:]' | tr ' _' '--')
  case "$raw" in
    # Core profiles (5)
    reliability)                    printf "reliability" ;;
    security)                       printf "security" ;;
    performance)                    printf "performance" ;;
    quality)                        printf "quality" ;;
    issues)                         printf "issues" ;;
    # Legacy aliases → consolidated profiles
    data-integrity|data|privacy-compliance|privacy|compliance|dependency-hygiene|dependency|dependencies|deps)
      printf "security" ;;
    test-hardening|tests|test|testing|frontend-quality|frontend|ui|mobile-quality|mobile|api-contract|contract|api|refactor-safety|refactor)
      printf "quality" ;;
    issue-burner|issue)
      printf "issues" ;;
    *)
      printf "reliability" ;;
  esac
}

team_profile_label() {
  printf "%s" "$(normalize_team_profile "$TEAM_PROFILE")"
}

normalize_speed_profile() {
  local raw=${1:-balanced}
  raw=$(printf "%s" "$raw" | tr '[:upper:]' '[:lower:]' | tr ' _' '--')
  case "$raw" in
    fast|balanced|thorough)
      printf "%s" "$raw"
      ;;
    quick|faster)
      printf "fast"
      ;;
    safe|default)
      printf "balanced"
      ;;
    *)
      printf "balanced"
      ;;
  esac
}

speed_profile_label() {
  printf "%s" "$(normalize_speed_profile "$SPEED_PROFILE")"
}

normalize_workflow_type() {
  local raw=${1:-standard}
  raw=$(printf "%s" "$raw" | tr '[:upper:]' '[:lower:]' | tr ' _' '--')
  case "$raw" in
    standard|implement-only|review-only|fast-ship|batch-research|research-only|deep-review)
      printf "%s" "$raw"
      ;;
    impl|implement|implementation)
      printf "implement-only"
      ;;
    review|review-pass)
      printf "review-only"
      ;;
    fast|fastship|ship)
      printf "fast-ship"
      ;;
    batch|multi-research|batch-impl)
      printf "batch-research"
      ;;
    research|findings|audit)
      printf "research-only"
      ;;
    deep-review|deepreview|deep-audit|stabilize)
      printf "deep-review"
      ;;
    *)
      printf "standard"
      ;;
  esac
}

workflow_type_label() {
  printf "%s" "$(normalize_workflow_type "$WORKFLOW_TYPE")"
}

resolve_phase_sequence() {
  local base_seq=""
  case "$(workflow_type_label)" in
    implement-only)  base_seq="impl:validate:commit" ;;
    review-only)     base_seq="review" ;;
    fast-ship)       base_seq="research:planning:impl:validate:commit" ;;
    batch-research)  base_seq="batch-research:planning:impl:validate:commit" ;;
    research-only)   base_seq="research" ;;
    deep-review)     base_seq="deep-review-audit:impl:validate:commit" ;;
    *)
      # Standard: use batch-research when running in parallel mode
      # AUTOCLAWDEV_BATCH_RESEARCH_AUTO is set by the parent before spawning workers
      if [ "${BATCH_RESEARCH_AUTO:-0}" = "1" ]; then
        base_seq="batch-research:planning:impl:validate:commit"
      else
        base_seq="research:planning:impl:validate:commit"
      fi
      ;;
  esac

  # Insert review phases based on review_depth
  local depth
  depth=$(resolve_review_depth)
  case "$depth" in
    full)
      # Insert coderabbit + review before validate
      base_seq="${base_seq/impl:validate/impl:coderabbit:review:validate}"
      ;;
    penny)
      # Insert review (Penny) only before validate
      base_seq="${base_seq/impl:validate/impl:review:validate}"
      ;;
    # validation-only | none — no extra review phases
  esac

  printf '%s' "$base_seq"
}

phase_is_enabled() {
  local phase_name=$1
  printf '%s' "${ACTIVE_PHASE_SEQUENCE:-}" | tr ':' '\n' | grep -qx "$phase_name"
}

# load_prompt <name> [KEY=value ...]
# Looks for $PROMPTS_DIR/<name>.txt; substitutes {{KEY}} placeholders.
# Falls back to <phase>-default.txt when profile-specific file is missing.
# Returns 0 and prints content if found; returns 1 (no output) if no file found.
load_prompt() {
  local name=$1
  local file="$PROMPTS_DIR/${name}.txt"
  if [ ! -f "$file" ]; then
    # Fallback: research-security → research-default
    local base="${name%-*}"
    file="$PROMPTS_DIR/${base}-default.txt"
    [ -f "$file" ] || return 1
  fi
  local content
  content=$(cat "$file")
  shift
  for kv in "$@"; do
    local key="${kv%%=*}"
    local val="${kv#*=}"
    content="${content//\{\{${key}\}\}/$val}"
  done
  printf '%s' "$content"
  return 0
}

should_skip_penny_after_clean_coderabbit() {
  case "${SKIP_PENNY_ON_CLEAN_CODERABBIT:-}" in
    1|true|TRUE|yes|YES)
      return 0
      ;;
    0|false|FALSE|no|NO)
      return 1
      ;;
  esac

  [ "$(speed_profile_label)" = "fast" ]
}

# Dynamic phase configuration — adjusts CR rounds and Penny skip based on
# finding type, domain, and diff size. Called after implementation when actual
# diff metrics are known. Saves/restores original config values per cycle.
_ORIG_CR_MAX_ROUNDS=""
_ORIG_SKIP_PENNY=""

save_phase_config_defaults() {
  _ORIG_CR_MAX_ROUNDS="${CODERABBIT_MAX_ROUNDS}"
  _ORIG_SKIP_PENNY="${SKIP_PENNY_ON_CLEAN_CODERABBIT:-}"
}

restore_phase_config_defaults() {
  CODERABBIT_MAX_ROUNDS="${_ORIG_CR_MAX_ROUNDS}"
  SKIP_PENNY_ON_CLEAN_CODERABBIT="${_ORIG_SKIP_PENNY}"
}

# Resolve review depth from explicit setting or profile default.
# Returns: none | validation-only | penny | full
resolve_review_depth() {
  # Explicit env var takes precedence
  if [ -n "${REVIEW_DEPTH:-}" ]; then
    printf '%s' "$REVIEW_DEPTH"
    return
  fi
  # Profile-based defaults
  case "$(team_profile_label)" in
    security|quality)
      printf "penny" ;;
    *)
      printf "validation-only" ;;
  esac
}

# Check if CR is enabled based on review depth
coderabbit_is_enabled() {
  [ "$(resolve_review_depth)" = "full" ]
}

# Check if Penny is enabled based on review depth
penny_is_enabled() {
  local depth
  depth=$(resolve_review_depth)
  [ "$depth" = "penny" ] || [ "$depth" = "full" ]
}

resolve_dynamic_phase_config() {
  local directive=${1:-} domain=${2:-} diff_lines=${3:-0}

  # If review depth allows Penny, small bug fixes can still skip it
  if penny_is_enabled && [ "$diff_lines" -lt 20 ] && [ "$directive" = "bug-fix" ]; then
    SKIP_PENNY_ON_CLEAN_CODERABBIT=1
  fi

  # If review depth is full, reduce CR rounds for small changes
  if coderabbit_is_enabled && [ "$diff_lines" -lt 15 ] && [ "$directive" = "bug-fix" ]; then
    CODERABBIT_MAX_ROUNDS=1
  fi
}

research_priority_order() {
  case "$(team_profile_label)" in
    security) printf "security > data integrity > bug fix > performance > refactor" ;;
    performance) printf "performance > bug fix > refactor > security > tests" ;;
    quality) printf "bug fix > accessibility > contract safety > test hardening > refactor" ;;
    issues) printf "GitHub issue fix > bug fix > security > performance > refactor" ;;
    *) printf "bug fix > feature improvement > performance > security > refactor > tests" ;;
  esac
}

research_profile_guidance() {
  case "$(team_profile_label)" in
    security)
      cat <<'EOF'
- You MUST find a concrete security, data-integrity, or compliance issue in production code
- Prefer: auth/authz, tenant isolation, input validation, injection, SSRF, CSRF, secrets, crypto misuse, unsafe file/path handling, data exposure, insecure defaults, broken access control
- Also look for: race conditions, lost updates, duplicate writes, PII leakage, unsafe logging, retention mistakes, vulnerable dependencies, license issues
- Do NOT choose general refactors unless they close a security or data-integrity weakness
- Prefer DIRECTIVE: security when it is accurate
EOF
      ;;
    performance)
      cat <<'EOF'
- You MUST find a concrete performance or efficiency problem in production code
- Prefer hot paths, repeated work, wasteful queries, avoidable network calls, memory spikes, serialization overhead, and bundle/runtime cost
- Do NOT choose generic cleanup unless it produces a measurable efficiency win
- Prefer DIRECTIVE: performance when it is accurate
EOF
      ;;
    quality)
      cat <<'EOF'
- You MUST find a concrete quality issue in production code — frontend, mobile, API, or structural
- Prefer: accessibility, broken interaction states, mobile/responsive defects, API contract mismatches, schema drift, form UX failures, visual regressions, fragile edge cases, flaky behavior
- Also look for: tightly scoped refactors that reduce complexity, duplicated logic, inconsistent helpers, test gaps that mask real bugs
- Fix the production code AND add/tighten a focused regression test when nearby coverage exists
- Do NOT choose broad rewrites — prefer narrow, high-confidence improvements
EOF
      ;;
    issues)
      cat <<'EOF'
- You MUST prioritize a concrete open GitHub issue when one exists in the fetched issue list
- Prefer user-reported bugs, regressions, and maintainer pain points over speculative improvements
- If no relevant issue exists, fall back to the normal best bug/security fix
EOF
      ;;
    *)
      cat <<'EOF'
- You MUST change PRODUCTION code, not just add test files
- Do NOT just add tests — fix bugs, improve features, optimize performance
- Look at recent experiments below — do NOT repeat the same type of change
- If the last 2 experiments were test-related, you MUST pick something different
- Avoid any active reserved work items listed below
EOF
      ;;
  esac
}

planning_profile_guidance() {
  case "$(team_profile_label)" in
    security) printf "Focus on exploitability, attack surface reduction, data integrity, secure defaults, and preserving intended product behavior.\n" ;;
    performance) printf "Focus on measurable efficiency wins, reduced latency/work, and avoiding behavior changes.\n" ;;
    quality) printf "Focus on user-visible correctness, accessibility, API contract safety, responsive behavior, and targeted regression coverage.\n" ;;
    issues) printf "Focus on closing the chosen issue with the smallest complete fix and clear verification.\n" ;;
    *) printf "" ;;
  esac
}

implementation_profile_guidance() {
  case "$(team_profile_label)" in
    security)
      cat <<'EOF'
Treat this as a security/data-integrity hardening change.
- Close the specific security or data-integrity gap with the smallest effective production-code change
- Preserve intended behavior for valid inputs
- Prefer idempotent, race-safe code paths when touching data flows
- Add a focused regression test when nearby test coverage makes it practical
EOF
      ;;
    performance)
      cat <<'EOF'
Treat this as a performance change.
- Remove avoidable work with the smallest scoped implementation that clearly improves cost, latency, or memory
- Preserve behavior and outputs unless the plan explicitly calls for a safe behavior change
- Add focused measurement or regression coverage when nearby tests make it practical
- You MUST report one of:
  PERFORMANCE_EVIDENCE: measured evidence was run
  PERFORMANCE_EVIDENCE: focused code-level evidence only — <why no perf command was relevant>
EOF
      ;;
    quality)
      cat <<'EOF'
Treat this as a quality improvement change.
- Prioritize user-visible correctness, accessibility, responsive behavior, API contract safety
- Fix the production behavior first, then add/tighten the narrowest regression test
- Keep visual language consistent unless the fix explicitly improves clarity
- Prefer small focused changes over broad rewrites
EOF
      ;;
    issues)
      cat <<'EOF'
Treat this as an issue-closure change.
- Solve the reported problem directly
- Keep the scope narrow enough to land confidently in one cycle
- Add targeted verification that clearly supports closing the issue
EOF
      ;;
    *)
      printf ""
      ;;
  esac
}

review_profile_guidance() {
  case "$(team_profile_label)" in
    security) printf "Check: exploitability, authorization, tenant isolation, input validation, secrets handling, data integrity, race conditions, privacy boundaries, and regression risk.\n" ;;
    performance) printf "Check: actual efficiency gain, hidden regressions, query/memory cost, algorithmic risk, and measurement credibility.\n" ;;
    quality) printf "Check: accessibility, interaction states, API compatibility, mobile responsiveness, test coverage, visual consistency, and user-facing regressions.\n" ;;
    issues) printf "Check: whether the reported issue is actually resolved, scope stayed tight, and verification supports closing it.\n" ;;
    *) printf "Check: correctness, edge cases, error handling, types, security, performance.\n" ;;
  esac
}

validation_baseline_cache_path() {
  local ref=$1
  local safe_project=${PROJECT_KEY//[^A-Za-z0-9._-]/-}
  local profile_name=${2:-$(active_profile_validation_name)}
  local safe_profile=${profile_name//[^A-Za-z0-9._-]/-}
  [ -z "$safe_profile" ] && safe_profile="reliability"
  mkdir -p "$VALIDATION_BASELINES_DIR"
  printf "%s/%s-%s-%s.json" "$VALIDATION_BASELINES_DIR" "$safe_project" "$ref" "$safe_profile"
}

validation_baseline_cache_path_by_branch() {
  local branch=$1
  local safe_project=${PROJECT_KEY//[^A-Za-z0-9._-]/-}
  local safe_branch=${branch//[^A-Za-z0-9._-]/-}
  local profile_name=${2:-$(active_profile_validation_name)}
  local safe_profile=${profile_name//[^A-Za-z0-9._-]/-}
  [ -z "$safe_profile" ] && safe_profile="reliability"
  mkdir -p "$VALIDATION_BASELINES_DIR"
  printf "%s/%s-branch-%s-%s.json" "$VALIDATION_BASELINES_DIR" "$safe_project" "$safe_branch" "$safe_profile"
}

load_validation_baseline_for_ref() {
  local ref=${1:-}
  [ -n "$ref" ] || return 0

  # Try exact ref match first
  local cache_path
  cache_path=$(validation_baseline_cache_path "$ref")
  if [ -s "$cache_path" ]; then
    cat "$cache_path"
    return
  fi

  # Fall back to branch-based cache
  local branch
  branch=$(git -C "$REPO" rev-parse --abbrev-ref HEAD 2>/dev/null) || return 0
  [ -n "$branch" ] && [ "$branch" != "HEAD" ] || return 0
  local branch_path
  branch_path=$(validation_baseline_cache_path_by_branch "$branch")
  [ -s "$branch_path" ] && cat "$branch_path"
}

store_validation_baseline_for_ref() {
  local ref=${1:-} summary=${2:-}
  [ -n "$ref" ] || return 0
  [ -n "$summary" ] || return 0

  local cache_path temp_path
  cache_path=$(validation_baseline_cache_path "$ref")
  temp_path=$(mktemp "$TMPDIR/autoresearch-validation-baseline-XXXXXX")
  printf "%s\n" "$summary" > "$temp_path"
  mv "$temp_path" "$cache_path"

  # Also update branch-based cache
  local branch
  branch=$(git -C "$REPO" rev-parse --abbrev-ref HEAD 2>/dev/null) || return 0
  if [ -n "$branch" ] && [ "$branch" != "HEAD" ]; then
    local branch_path
    branch_path=$(validation_baseline_cache_path_by_branch "$branch")
    cp "$cache_path" "$branch_path" 2>/dev/null || true
  fi
}

validation_summary_from_outputs() {
  VALIDATION_TEST_EXIT="${1:-0}" \
  VALIDATION_TEST_OUTPUT="${2:-}" \
  VALIDATION_LINT_EXIT="${3:-0}" \
  VALIDATION_LINT_OUTPUT="${4:-}" \
  VALIDATION_PROFILE_NAME="${5:-}" \
  VALIDATION_PROFILE_EXIT="${6:-0}" \
  VALIDATION_PROFILE_OUTPUT="${7:-}" \
  python3 - <<'PY'
import json
import os
import re

test_output = os.environ.get("VALIDATION_TEST_OUTPUT", "")
lint_output = os.environ.get("VALIDATION_LINT_OUTPUT", "")
profile_output = os.environ.get("VALIDATION_PROFILE_OUTPUT", "")
profile_name = os.environ.get("VALIDATION_PROFILE_NAME", "").strip()

path_pattern = re.compile(r'((?:apps|packages|supabase|scripts)/[A-Za-z0-9._/-]+)')
test_target_pattern = re.compile(r'((?:apps|packages|supabase|scripts)/[A-Za-z0-9._/-]+(?:\.test|\.spec)[A-Za-z0-9._/-]*)')
lint_target_pattern = re.compile(r'((?:apps|packages|supabase|scripts)/[A-Za-z0-9._/-]+\.(?:ts|tsx|js|jsx|mjs|cjs))')
fail_line_pattern = re.compile(r'\bFAIL\b[^\n]*?((?:apps|packages|supabase|scripts)/[A-Za-z0-9._/-]+)')


def parse_count(pattern: str, text: str) -> int:
    matches = re.findall(pattern, text, flags=re.IGNORECASE)
    return int(matches[-1]) if matches else 0


def clean_path(path: str) -> str:
    return path.rstrip("):,]")


def normalize_scope(path: str) -> str:
    parts = clean_path(path).split("/")
    if not parts:
        return ""
    if parts[0] in {"apps", "packages"} and len(parts) >= 2:
        return "/".join(parts[:2])
    if parts[0] == "supabase" and len(parts) >= 3 and parts[1] == "functions":
        return "/".join(parts[:3])
    if parts[0] == "scripts":
        return parts[0]
    return parts[0]


def unique(items):
    seen = set()
    ordered = []
    for item in items:
        value = clean_path(item)
        if not value or value in seen:
            continue
        seen.add(value)
        ordered.append(value)
    return ordered


def extract_scopes(text: str):
    return unique(normalize_scope(path) for path in path_pattern.findall(text) if normalize_scope(path))


summary = {
    "test": {
        "exit": int(os.environ.get("VALIDATION_TEST_EXIT", "0") or 0),
        "failed_count": parse_count(r"(\d+)\s+failed\b", test_output),
        "passed_count": parse_count(r"(\d+)\s+passed\b", test_output),
        "scopes": extract_scopes(test_output),
        "targets": unique(test_target_pattern.findall(test_output) or fail_line_pattern.findall(test_output)),
    },
    "lint": {
        "exit": int(os.environ.get("VALIDATION_LINT_EXIT", "0") or 0),
        "error_count": parse_count(r"(\d+)\s+errors?\b", lint_output),
        "warning_count": parse_count(r"(\d+)\s+warnings?\b", lint_output),
        "scopes": extract_scopes(lint_output),
        "targets": unique(lint_target_pattern.findall(lint_output)),
    },
    "profile": {
        "name": profile_name,
        "exit": int(os.environ.get("VALIDATION_PROFILE_EXIT", "0") or 0),
        "error_count": (
            parse_count(r"(\d+)\s+vulnerabilit(?:y|ies)\b", profile_output)
            or parse_count(r"(\d+)\s+findings?\b", profile_output)
            or parse_count(r"(\d+)\s+issues?\b", profile_output)
            or parse_count(r"(\d+)\s+errors?\b", profile_output)
            or parse_count(r"(\d+)\s+fail(?:ures?)?\b", profile_output)
        ),
        "warning_count": parse_count(r"(\d+)\s+warnings?\b", profile_output),
        "scopes": extract_scopes(profile_output),
        "targets": unique(lint_target_pattern.findall(profile_output) or path_pattern.findall(profile_output)),
    },
}

print(json.dumps(summary, separators=(",", ":")))
PY
}

validation_matches_baseline() {
  BASELINE_METRICS_JSON="${1:-}" \
  CURRENT_VALIDATION_JSON="${2:-}" \
  python3 - <<'PY'
import json
import os
import sys

metrics_text = os.environ.get("BASELINE_METRICS_JSON", "").strip()
current_text = os.environ.get("CURRENT_VALIDATION_JSON", "").strip()
if not metrics_text or not current_text:
    raise SystemExit(1)

try:
    metrics = json.loads(metrics_text)
    current = json.loads(current_text)
except json.JSONDecodeError:
    raise SystemExit(1)

baseline = metrics.get("validation_baseline")
if not isinstance(baseline, dict):
    raise SystemExit(1)


def has_failure(item: dict) -> bool:
    return bool(
        isinstance(item, dict)
        and (
            item.get("exit", 0) != 0
            or item.get("failed_count", 0) > 0
            or item.get("error_count", 0) > 0
        )
    )


def subset_ok(current_item: dict, baseline_item: dict) -> bool:
    current_targets = set(current_item.get("targets", []))
    baseline_targets = set(baseline_item.get("targets", []))
    current_scopes = set(current_item.get("scopes", []))
    baseline_scopes = set(baseline_item.get("scopes", []))

    structural_ok = False
    if current_targets and baseline_targets and current_targets.issubset(baseline_targets):
        structural_ok = True
    elif current_scopes and baseline_scopes and current_scopes.issubset(baseline_scopes):
        structural_ok = True
    elif current_item.get("exit", 0) != 0 and baseline_item.get("exit", 0) != 0 and not current_targets and not current_scopes:
        structural_ok = True

    current_count = current_item.get("failed_count", 0) or current_item.get("error_count", 0)
    baseline_count = baseline_item.get("failed_count", 0) or baseline_item.get("error_count", 0)
    count_ok = True if current_count == 0 or baseline_count == 0 else current_count <= baseline_count

    return structural_ok and count_ok


for key in ("test", "lint"):
    current_item = current.get(key, {})
    baseline_item = baseline.get(key, {})
    if has_failure(current_item):
        if not has_failure(baseline_item) or not subset_ok(current_item, baseline_item):
            raise SystemExit(1)

current_profile = current.get("profile", {})
baseline_profile = baseline.get("profile", {})
if isinstance(current_profile, dict) and current_profile.get("name") and has_failure(current_profile):
    if baseline_profile.get("name") != current_profile.get("name"):
        raise SystemExit(1)
    if not has_failure(baseline_profile) or not subset_ok(current_profile, baseline_profile):
        raise SystemExit(1)

raise SystemExit(0)
PY
}

capture_validation_baseline_for_repo() {
  local repo=${1:-}
  [ "$CAPTURE_VALIDATION_BASELINE" = "1" ] || return 0
  [ "$(validation_command_count)" -gt 0 ] || return 0
  [ -n "$repo" ] || return 0

  local head_ref
  head_ref=$(git -C "$repo" rev-parse HEAD 2>/dev/null || true)
  [ -n "$head_ref" ] || return 0

  local cached_summary
  cached_summary=$(load_validation_baseline_for_ref "$head_ref")
  if [ -n "$cached_summary" ]; then
    printf "%s" "$cached_summary"
    return 0
  fi

  local previous_repo=$REPO
  local test_exit=0 lint_exit=0 profile_exit=0
  local test_output="" lint_output="" profile_output=""
  local test_file="" lint_file="" profile_file=""
  REPO="$repo"

  if [ -n "$TEST_CMD" ]; then
    test_file=$(mktemp "$TMPDIR/autoresearch-baseline-test-XXXXXX")
    run_command_with_timeout "$VALIDATION_TIMEOUT" "$test_file" "cd '$REPO' && $TEST_CMD"
    test_exit=$?
    test_output=$(cat "$test_file" 2>/dev/null)
    rm -f "$test_file"
  fi

  if [ -n "$LINT_CMD" ]; then
    lint_file=$(mktemp "$TMPDIR/autoresearch-baseline-lint-XXXXXX")
    run_command_with_timeout "$VALIDATION_TIMEOUT" "$lint_file" "cd '$REPO' && $LINT_CMD"
    lint_exit=$?
    lint_output=$(cat "$lint_file" 2>/dev/null)
    rm -f "$lint_file"
  fi

  local active_profile_name
  active_profile_name=$(active_profile_validation_name)
  local baseline_profile_cmd
  baseline_profile_cmd=$(active_profile_validation_command_for_repo "$REPO" "baseline")
  if [ -n "$baseline_profile_cmd" ]; then
    profile_file=$(mktemp "$TMPDIR/autoresearch-baseline-profile-XXXXXX")
    run_command_with_timeout "$VALIDATION_TIMEOUT" "$profile_file" "cd '$REPO' && $baseline_profile_cmd"
    profile_exit=$?
    profile_output=$(cat "$profile_file" 2>/dev/null)
    rm -f "$profile_file"
  fi

  local summary
  summary=$(validation_summary_from_outputs "$test_exit" "$test_output" "$lint_exit" "$lint_output" "$active_profile_name" "$profile_exit" "$profile_output")
  [ -n "$summary" ] && store_validation_baseline_for_ref "$head_ref" "$summary"
  REPO="$previous_repo"
  printf "%s" "$summary"
}

truncate_text() {
  local text="${1:-}" max_len="${2:-60}"
  if [ "${#text}" -le "$max_len" ]; then
    printf "%s" "$text"
  else
    printf "%s..." "${text:0:$((max_len - 3))}"
  fi
}

validation_command_count() {
  local count=0
  [ -n "$TEST_CMD" ] && count=$((count + 1))
  [ -n "$LINT_CMD" ] && count=$((count + 1))
  [ -n "$(active_profile_validation_command_for_repo "$REPO" "baseline")" ] && count=$((count + 1))
  printf "%s" "$count"
}

validation_commands_summary() {
  local parts=()
  [ -n "$TEST_CMD" ] && parts+=("tests: $TEST_CMD")
  [ -n "$LINT_CMD" ] && parts+=("lint: $LINT_CMD")
  local active_profile_name
  active_profile_name=$(active_profile_validation_name)
  if [ -n "$active_profile_name" ]; then
    local active_profile_cmd=""
    active_profile_cmd=$(active_profile_validation_command_for_repo "$REPO" "baseline")
    if [ -n "$active_profile_cmd" ]; then
      parts+=("$(printf "%s" "$(pretty_profile_label "$active_profile_name")" | tr '[:upper:]' '[:lower:]'): $active_profile_cmd")
    else
      parts+=("$(printf "%s" "$(pretty_profile_label "$active_profile_name")" | tr '[:upper:]' '[:lower:]'): no custom command")
    fi
  fi

  if [ ${#parts[@]} -eq 0 ]; then
    printf "none configured"
  else
    local joined=""
    local part
    for part in "${parts[@]}"; do
      if [ -n "$joined" ]; then
        joined="$joined | $part"
      else
        joined="$part"
      fi
    done
    truncate_text "$joined" 48
  fi
}

validation_prompt_instructions() {
  local include_tests="${1:-1}" include_lint="${2:-1}" include_profile="${3:-1}"
  local active_profile_name="" active_profile_cmd=""
  active_profile_name=$(active_profile_validation_name)
  active_profile_cmd=$(active_profile_validation_command_for_repo "$REPO" "baseline")
  if { [ "$include_tests" = "1" ] && [ -n "$TEST_CMD" ]; } || { [ "$include_lint" = "1" ] && [ -n "$LINT_CMD" ]; } || { [ "$include_profile" = "1" ] && [ -n "$active_profile_name" ]; }; then
    printf "Use the configured verification commands when they are relevant to your changes.\n"
    [ "$include_lint" = "1" ] && [ -n "$LINT_CMD" ] && printf -- "- Lint: cd %s && %s\n" "$REPO" "$LINT_CMD"
    [ "$include_tests" = "1" ] && [ -n "$TEST_CMD" ] && printf -- "- Tests: cd %s && %s\n" "$REPO" "$TEST_CMD"
    if [ "$include_profile" = "1" ] && [ -n "$active_profile_name" ]; then
      if [ -n "$active_profile_cmd" ]; then
        printf -- "- %s: cd %s && %s\n" "$(pretty_profile_label "$active_profile_name")" "$REPO" "$active_profile_cmd"
      else
        printf -- "- %s: no custom command configured; rely on targeted verification and explicit evidence.\n" "$(pretty_profile_label "$active_profile_name")"
      fi
    fi
    printf "If one command is not relevant to the files you changed, say so explicitly.\n"
  else
    printf "No project-wide lint, test, or active profile command is configured. Run the narrowest verification you can for the files you changed and report it clearly.\n"
  fi
}

validation_phase_skip_summary() {
  local label=$1 cmd=${2:-}
  if [ -n "$DRY_RUN" ] && [ -n "$cmd" ]; then
    printf "[dry-run] would run: %s" "$cmd"
  elif [ -n "$DRY_RUN" ]; then
    printf "[dry-run] no %s command configured" "$label"
  elif [ -n "$cmd" ]; then
    printf "Skipped: %s" "$cmd"
  else
    printf "No %s command configured" "$label"
  fi
}

render_project_memory_context() {
  memory_enabled || return 0
  [ -n "$PROJECT_CONFIG_FILE" ] || return 0

  python3 "$MEMORY_SCRIPT" render-project-context \
    --project "$PROJECT_KEY" \
    --repo "$REPO" \
    --memory-dir "$MEMORY_DIR" \
    --program "$PROGRAM" \
    --project-config "$PROJECT_CONFIG_FILE" \
    --experiments "$EXPERIMENTS" \
    --max-chars 2200 2>/dev/null || true
}

render_fixed_findings_context() {
  memory_enabled || return 0
  python3 "$MEMORY_SCRIPT" render-fixed-findings \
    --project "$PROJECT_KEY" \
    --memory-dir "$MEMORY_DIR" \
    --limit 15 2>/dev/null || true
}

render_file_memory_context() {
  local targets_text=${1:-}
  memory_enabled || return 0
  [ -n "$PROJECT_CONFIG_FILE" ] || return 0
  [ -n "$targets_text" ] || return 0

  python3 "$MEMORY_SCRIPT" render-file-context \
    --project "$PROJECT_KEY" \
    --repo "$REPO" \
    --memory-dir "$MEMORY_DIR" \
    --program "$PROGRAM" \
    --project-config "$PROJECT_CONFIG_FILE" \
    --targets-text "$targets_text" \
    --max-chars 2600 2>/dev/null || true
}

record_cycle_memory() {
  local exp_id=${1:-}
  local result=${2:-}
  local target_files_text=${3:-}
  local changed_files_text=${4:-}
  local merged_commit=${5:-}
  [ -n "$exp_id" ] || return 0
  memory_enabled || return 0
  [ -n "$PROJECT_CONFIG_FILE" ] || return 0
  [ -n "$CYCLE_LOG" ] || return 0
  [ -f "$CYCLE_LOG" ] || return 0

  python3 "$MEMORY_SCRIPT" record-cycle \
    --project "$PROJECT_KEY" \
    --repo "$REPO" \
    --memory-dir "$MEMORY_DIR" \
    --program "$PROGRAM" \
    --project-config "$PROJECT_CONFIG_FILE" \
    --cycle-log "$CYCLE_LOG" \
    --exp-id "$exp_id" \
    --result "$result" \
    --target-files-text "$target_files_text" \
    --changed-files-text "$changed_files_text" \
    --merged-commit "$merged_commit" \
    --directive "${directive:-unknown}" \
    --domain "${domain:-unknown}" >/dev/null 2>&1 || true
}

recent_experiments_context() {
  local limit=${1:-5}
  [ -s "$EXPERIMENTS" ] || return 0

  EXP_PATH="$EXPERIMENTS" EXP_LIMIT="$limit" python3 - <<'PY' 2>/dev/null
import json
import os

path = os.environ["EXP_PATH"]
limit = int(os.environ["EXP_LIMIT"])

def parse_line(line: str):
    try:
        return json.loads(line)
    except json.JSONDecodeError:
        desc_prefix = '"description":"'
        result_marker = '","result":"'
        desc_start = line.find(desc_prefix)
        result_index = line.find(result_marker, desc_start + len(desc_prefix))
        if desc_start == -1 or result_index == -1:
            return None
        content_start = desc_start + len(desc_prefix)
        description = line[content_start:result_index].replace('"', '\\"')
        repaired = line[:content_start] + description + line[result_index:]
        try:
            return json.loads(repaired)
        except json.JSONDecodeError:
            return None

entries = []
with open(path, encoding="utf-8") as handle:
    for raw_line in handle:
        line = raw_line.strip()
        if not line:
            continue
        parsed = parse_line(line)
        if parsed is None:
            continue
        entries.append(f'- {parsed.get("description", "?")} ({parsed.get("result", "?")})')

for item in entries[-limit:]:
    print(item)
PY
}

# ── GitHub Issues Disk Cache ────────────────────────────────────────
GH_ISSUES_CACHE_DIR="${AUTOCLAWDEV_GH_ISSUES_CACHE_DIR:-$WORKSPACE/gh-cache}"
GH_ISSUES_CACHE_TTL_SECONDS="${AUTOCLAWDEV_GH_ISSUES_CACHE_TTL_SECONDS:-300}"

gh_issues_cache_path() {
  local repo=${1:-}
  local safe_repo=${repo//\//-}
  printf "%s/%s-issues.txt" "$GH_ISSUES_CACHE_DIR" "$safe_repo"
}

load_gh_issues_cache() {
  local repo=${1:-}
  [ -n "$repo" ] || return 1
  local cache_file
  cache_file=$(gh_issues_cache_path "$repo")
  [ -f "$cache_file" ] || return 1

  local now mtime age
  now=$(date +%s)
  if mtime=$(stat -f "%m" "$cache_file" 2>/dev/null); then
    : # macOS
  elif mtime=$(stat -c "%Y" "$cache_file" 2>/dev/null); then
    : # Linux
  else
    return 1
  fi
  age=$((now - mtime))
  [ "$age" -lt "$GH_ISSUES_CACHE_TTL_SECONDS" ] || return 1

  cat "$cache_file"
}

store_gh_issues_cache() {
  local repo=${1:-} content=${2:-}
  [ -n "$repo" ] || return 0
  [ -n "$content" ] || return 0
  mkdir -p "$GH_ISSUES_CACHE_DIR"
  local cache_file
  cache_file=$(gh_issues_cache_path "$repo")
  printf "%s" "$content" > "$cache_file"
}

fetch_github_issues_context() {
  local repo=${1:-} upstream=${2:-}
  [ -n "$repo" ] || return 0
  command_available gh || return 0

  local issues=""
  issues=$(gh issue list --repo "$repo" --state open --json number,title,labels --limit 15 --jq '.[] | "  #\(.number) \(.title) [\(.labels | map(.name) | join(","))]"' 2>/dev/null) || return 0

  if [ -n "$upstream" ]; then
    local upstream_issues=""
    if upstream_issues=$(gh issue list --repo "$upstream" --state open --label "bug,enhancement" --json number,title --limit 10 --jq '.[] | "  #\(.number) \(.title)"' 2>/dev/null); then
      issues="$issues
Upstream ($upstream):
$upstream_issues"
    fi
  fi

  printf "%s" "$issues"
}

active_reserved_work_items_context() {
  [ -d "$RESERVATIONS_DIR" ] || return 0

  local file
  for file in "$RESERVATIONS_DIR"/*.env; do
    [ -f "$file" ] || continue
    (
      unset RESERVED_EXP_ID RESERVED_FINDING RESERVED_FINDING_KEY RESERVED_TARGET RESERVED_ISSUE
      . "$file"
      local summary=""
      if [ -n "${RESERVED_ISSUE:-}" ]; then
        summary="#${RESERVED_ISSUE}"
      elif [ -n "${RESERVED_TARGET:-}" ]; then
        summary="${RESERVED_TARGET}"
      else
        summary="${RESERVED_FINDING:-reserved work}"
      fi
      printf -- "- %s\n" "$summary"
    )
  done
}

normalize_reservation_key() {
  printf "%s" "${1:-}" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/ /g; s/^ +//; s/ +$//; s/ +/ /g'
}

reserve_cycle_work_item() {
  local exp_id=$1 finding=$2 target=$3 issue=${4:-}
  local reservation_file="$RESERVATIONS_DIR/${exp_id}.env"
  local finding_key=""
  _RESERVATION_CONFLICT=""
  finding_key=$(normalize_reservation_key "$finding")

  mkdir -p "$RESERVATIONS_DIR"
  if ! acquire_lock_dir "$RESERVATIONS_LOCK_DIR" 30; then
    printf "ERROR: timed out waiting for reservations lock %s\n" "$RESERVATIONS_LOCK_DIR" >&2
    return 2
  fi

  local file
  for file in "$RESERVATIONS_DIR"/*.env; do
    [ -f "$file" ] || continue
    [ "$file" = "$reservation_file" ] && continue

    unset RESERVED_EXP_ID RESERVED_FINDING RESERVED_FINDING_KEY RESERVED_TARGET RESERVED_ISSUE
    . "$file"

    if [ -n "$issue" ] && [ -n "${RESERVED_ISSUE:-}" ] && [ "$issue" = "$RESERVED_ISSUE" ]; then
      _RESERVATION_CONFLICT="issue #$issue"
      release_lock_dir "$RESERVATIONS_LOCK_DIR"
      return 1
    fi
    if [ -n "$target" ] && [ -n "${RESERVED_TARGET:-}" ] && [ "$target" = "$RESERVED_TARGET" ]; then
      _RESERVATION_CONFLICT="target $target"
      release_lock_dir "$RESERVATIONS_LOCK_DIR"
      return 1
    fi
    if [ -n "$finding_key" ] && [ -n "${RESERVED_FINDING_KEY:-}" ] && [ "$finding_key" = "$RESERVED_FINDING_KEY" ]; then
      _RESERVATION_CONFLICT="similar work: ${RESERVED_FINDING:-${RESERVED_TARGET:-reserved work}}"
      release_lock_dir "$RESERVATIONS_LOCK_DIR"
      return 1
    fi
  done

  {
    printf "RESERVED_EXP_ID=%q\n" "$exp_id"
    printf "RESERVED_FINDING=%q\n" "$finding"
    printf "RESERVED_FINDING_KEY=%q\n" "$finding_key"
    printf "RESERVED_TARGET=%q\n" "$target"
    printf "RESERVED_ISSUE=%q\n" "$issue"
  } > "$reservation_file"
  CURRENT_RESERVATION_FILE="$reservation_file"
  release_lock_dir "$RESERVATIONS_LOCK_DIR"
  return 0
}

release_cycle_reservation() {
  [ -n "$CURRENT_RESERVATION_FILE" ] || return 0
  if acquire_lock_dir "$RESERVATIONS_LOCK_DIR" 30; then
    rm -f "$CURRENT_RESERVATION_FILE"
    release_lock_dir "$RESERVATIONS_LOCK_DIR"
  else
    rm -f "$CURRENT_RESERVATION_FILE"
  fi
  CURRENT_RESERVATION_FILE=""
}

build_validation_failure_reason() {
  local fix_attempts_used=$1 test_ok=$2 lint_ok=$3 profile_ok=${4:-true} profile_name=${5:-}
  local failed_parts=()
  local profile_label=""
  [ "$test_ok" = false ] && failed_parts+=("tests")
  [ "$lint_ok" = false ] && failed_parts+=("lint")
  if [ "$profile_ok" = false ] && [ -n "$profile_name" ]; then
    profile_label=$(printf "%s" "$(pretty_profile_label "$profile_name")" | tr '[:upper:]' '[:lower:]')
    failed_parts+=("$profile_label")
  fi
  if [ ${#failed_parts[@]} -gt 1 ]; then
    local joined=""
    local part=""
    for part in "${failed_parts[@]}"; do
      if [ -n "$joined" ]; then
        joined="$joined, $part"
      else
        joined="$part"
      fi
    done
    printf "Validation failed: %s still failing after %s fix attempt(s)" "$joined" "$fix_attempts_used"
  elif [ "$test_ok" = false ]; then
    printf "Validation failed: tests still failing after %s fix attempt(s)" "$fix_attempts_used"
  elif [ "$lint_ok" = false ]; then
    printf "Validation failed: lint still failing after %s fix attempt(s)" "$fix_attempts_used"
  elif [ "$profile_ok" = false ] && [ -n "$profile_label" ]; then
    printf "Validation failed: %s checks still failing after %s fix attempt(s)" "$profile_label" "$fix_attempts_used"
  else
    printf "Validation failed"
  fi
}

current_git_branch() {
  git -C "$1" symbolic-ref --quiet --short HEAD 2>/dev/null
}

acquire_lock_dir() {
  local lock_dir=$1 timeout_secs=${2:-300}
  local waited=0

  while ! mkdir "$lock_dir" 2>/dev/null; do
    if [ "$waited" -ge "$timeout_secs" ]; then
      return 1
    fi
    sleep 1
    waited=$((waited + 1))
  done
}

release_lock_dir() {
  local lock_dir=$1
  [ -n "$lock_dir" ] && rmdir "$lock_dir" 2>/dev/null || true
}

require_command() {
  local name=$1 hint=${2:-}
  if ! command -v "$name" >/dev/null 2>&1; then
    if [ -n "$hint" ]; then
      printf "ERROR: required command '%s' not found (%s)\n" "$name" "$hint" >&2
    else
      printf "ERROR: required command '%s' not found\n" "$name" >&2
    fi
    return 1
  fi
}

require_integer_min() {
  local value=$1 label=$2 min_value=${3:-0}
  if ! [[ "$value" =~ ^[0-9]+$ ]]; then
    printf "ERROR: %s must be an integer >= %s (got '%s')\n" "$label" "$min_value" "$value" >&2
    return 1
  fi
  if [ "$value" -lt "$min_value" ]; then
    printf "ERROR: %s must be >= %s (got '%s')\n" "$label" "$min_value" "$value" >&2
    return 1
  fi
}

command_available() {
  command -v "$1" >/dev/null 2>&1
}

visual_validation_skip_reason() {
  local server_html=${1:-}

  if [ -n "$DRY_RUN" ]; then
    printf "[dry-run] visual review skipped"
  elif ! command_available curl; then
    printf "curl unavailable — visual review skipped"
  elif [ -z "$server_html" ]; then
    printf "Dev server unavailable — visual review skipped"
  elif [ ! -f "$BROWSER_SNAPSHOT_SCRIPT" ]; then
    printf "Browser snapshot script missing — visual review skipped"
  elif ! command_available node; then
    printf "Node unavailable — visual review skipped"
  else
    printf "Visual review skipped"
  fi
}

runner_preflight() {
  require_command git "needed for worktrees and commits" || return 1
  require_command python3 "needed for metrics and experiment logs" || return 1
  require_command claude "needed for Opus and Sonnet agent phases" || return 1
  require_command codex "needed for implementation phases" || return 1
  return 0
}

ensure_integration_workspace() {
  local safe_project=${PROJECT_KEY//[^A-Za-z0-9._-]/-}
  local integration_ref="refs/heads/$INTEGRATION_BRANCH"

  INTEGRATION_WORKTREE="$WORKSPACE/worktrees/${safe_project}-integration"

  if ! git -C "$SOURCE_REPO" show-ref --verify --quiet "refs/heads/$BASE_BRANCH"; then
    printf "ERROR: base branch '%s' does not exist in %s\n" "$BASE_BRANCH" "$SOURCE_REPO" >&2
    return 1
  fi

  if ! git -C "$SOURCE_REPO" show-ref --verify --quiet "$integration_ref"; then
    if ! git -C "$SOURCE_REPO" branch "$INTEGRATION_BRANCH" "$BASE_BRANCH" >/dev/null 2>&1; then
      printf "ERROR: unable to create integration branch '%s' from '%s'\n" "$INTEGRATION_BRANCH" "$BASE_BRANCH" >&2
      return 1
    fi
  fi

  # Prune stale worktree entries from killed runs
  git -C "$SOURCE_REPO" worktree prune 2>/dev/null

  # Reuse existing healthy integration worktree if present
  if [ -d "$INTEGRATION_WORKTREE" ] && [ -f "$INTEGRATION_WORKTREE/.git" ]; then
    # Verify it's on the right branch and clean
    local wt_branch
    wt_branch=$(git -C "$INTEGRATION_WORKTREE" rev-parse --abbrev-ref HEAD 2>/dev/null || true)
    if [ "$wt_branch" = "$INTEGRATION_BRANCH" ]; then
      # Reset to clean state and pull latest from integration branch
      git -C "$INTEGRATION_WORKTREE" reset --hard HEAD >/dev/null 2>&1 || true
      git -C "$INTEGRATION_WORKTREE" clean -fd >/dev/null 2>&1 || true
    else
      # Wrong branch — recreate
      git -C "$SOURCE_REPO" worktree remove --force "$INTEGRATION_WORKTREE" >/dev/null 2>&1 || true
      rm -rf "$INTEGRATION_WORKTREE" 2>/dev/null
      git -C "$SOURCE_REPO" worktree prune 2>/dev/null
    fi
  elif [ -e "$INTEGRATION_WORKTREE" ]; then
    # Exists but broken — remove and recreate
    git -C "$SOURCE_REPO" worktree remove --force "$INTEGRATION_WORKTREE" >/dev/null 2>&1 || true
    rm -rf "$INTEGRATION_WORKTREE" 2>/dev/null
    git -C "$SOURCE_REPO" worktree prune 2>/dev/null
  fi

  if [ ! -d "$INTEGRATION_WORKTREE" ]; then
    if ! git -C "$SOURCE_REPO" worktree add "$INTEGRATION_WORKTREE" "$INTEGRATION_BRANCH" >/dev/null 2>&1; then
      # Retry after aggressive cleanup
      rm -rf "$INTEGRATION_WORKTREE" 2>/dev/null
      git -C "$SOURCE_REPO" worktree prune 2>/dev/null
      if ! git -C "$SOURCE_REPO" worktree add "$INTEGRATION_WORKTREE" "$INTEGRATION_BRANCH" >/dev/null 2>&1; then
        printf "ERROR: unable to create integration worktree for '%s'\n" "$INTEGRATION_BRANCH" >&2
        return 1
      fi
    fi
  fi

  LANDING_REPO="$INTEGRATION_WORKTREE"
  if ! bootstrap_validation_dependencies "$LANDING_REPO"; then
    return 1
  fi
  return 0
}

cleanup_run() {
  local child
  for child in $(pgrep -P $$ 2>/dev/null || true); do
    kill -TERM "$child" 2>/dev/null || true
  done
  sleep 1
  for child in $(pgrep -P $$ 2>/dev/null || true); do
    kill -KILL "$child" 2>/dev/null || true
  done
  release_cycle_reservation >/dev/null 2>&1 || true
  cleanup_cycle_workspace >/dev/null 2>&1 || true
  cleanup_integration_workspace >/dev/null 2>&1 || true
  if [ "$RUNNER_MODE" = "parent" ]; then
    [ -n "$HALT_FILE" ] && rm -f "$HALT_FILE"
    [ -n "$RESERVATIONS_DIR" ] && rm -rf "$RESERVATIONS_DIR"
  fi
  [ -n "$LOCKFILE" ] && rm -f "$LOCKFILE"
}

# ── Agent call wrapper — streams output to both capture AND stdout ────
# This ensures the SSE stream (which reads stdout) gets the live CLI output
_call_agent() {
  local label=$1 cmd=$2
  shift 2
  if [ -n "$DRY_RUN" ]; then
    echo "[dry-run] $label"
    return 0
  fi

  local out_file
  out_file=$(mktemp "$TMPDIR/autoresearch-agent-XXXXXX") || {
    printf "ERROR: unable to allocate agent output file\n" >&2
    return 1
  }
  local pipe_dir
  pipe_dir=$(mktemp -d "$TMPDIR/autoresearch-agent-pipe-XXXXXX") || {
    rm -f "$out_file"
    printf "ERROR: unable to allocate agent pipe directory\n" >&2
    return 1
  }
  local pipe_file="$pipe_dir/stream"
  local timeout_secs
  timeout_secs=$(agent_timeout_for_label "$label")

  # Print session header to STDERR (terminal/SSE display)
  printf "${BG_CARD}   ${FG_DD}── %s session ──${RST}\n" "$label" >&2

  if ! mkfifo "$pipe_file"; then
    rm -f "$out_file"
    rmdir "$pipe_dir" 2>/dev/null || true
    printf "ERROR: unable to create agent pipe\n" >&2
    return 1
  fi
  : > "$out_file"

  (
    while IFS= read -r line || [ -n "$line" ]; do
      printf "%s\n" "$line" >> "$out_file"
      printf "${BG_CARD}   ${FG_DD}│ %s${RST}\n" "${label}: ${line}" >&2
    done < "$pipe_file"
  ) &
  local reader_pid=$!

  bash -lc "$cmd" </dev/null > "$pipe_file" 2>&1 &
  local agent_pid=$!
  local agent_exit=0
  local timed_out=false
  local started_at=$(date +%s)

  while kill -0 "$agent_pid" 2>/dev/null; do
    if [ $(( $(date +%s) - started_at )) -ge "$timeout_secs" ]; then
      timed_out=true
      kill -TERM "$agent_pid" 2>/dev/null || true
      sleep 2
      kill -KILL "$agent_pid" 2>/dev/null || true
      break
    fi
    sleep 1
  done

  wait "$agent_pid" 2>/dev/null
  agent_exit=$?
  wait "$reader_pid" 2>/dev/null || true
  rm -f "$pipe_file"
  rmdir "$pipe_dir" 2>/dev/null || true

  if [ "$timed_out" = true ]; then
    local timeout_msg="[AUTOCLAWDEV] Timed out after ${timeout_secs}s."
    printf "%s\n" "$timeout_msg" >> "$out_file"
    printf "${BG_CARD}   ${FG_DD}│ %s${RST}\n" "${label}: ${timeout_msg}" >&2
    agent_exit=124
  fi

  printf "${BG_CARD}   ${FG_DD}── end %s ──${RST}\n" "$label" >&2

  # Set global with captured output (callers read this)
  _AGENT_OUTPUT=$(cat "$out_file")
  rm -f "$out_file"
  return "$agent_exit"
}

# Claude: research/analysis (Olivia)
call_olivia() {
  local prompt=$1
  local model="${2:-$MODEL_RESEARCH}"
  _call_agent "Olivia/${model}" "cd '$REPO' && claude --model ${model} -p $(printf '%q' "$prompt")"
  local status=$?
  echo "$_AGENT_OUTPUT"
  return "$status"
}

# Claude: batch research — returns N findings as FINDING_1/FILE_1/DIRECTIVE_1/DOMAIN_1 etc.
call_olivia_batch() {
  local prompt=$1
  local model="${2:-$MODEL_RESEARCH}"
  _call_agent "Olivia/${model}" "cd '$REPO' && claude --model ${model} -p $(printf '%q' "$prompt")"
  local status=$?
  echo "$_AGENT_OUTPUT"
  return "$status"
}

# Claude with image: visual review (Olivia)
call_olivia_visual() {
  local prompt=$1 image=$2
  local model="${MODEL_RESEARCH:-opus}"
  if [ -n "$image" ] && [ -f "$image" ]; then
    _call_agent "Olivia/visual" "cd '$REPO' && claude --model ${model} -p $(printf '%q' "$prompt") --image '$image'"
  else
    _call_agent "Olivia/visual" "cd '$REPO' && claude --model ${model} -p $(printf '%q' "$prompt")"
  fi
  local status=$?
  echo "$_AGENT_OUTPUT"
  return "$status"
}

# Claude: planning, deep reasoning (Jessica)
call_claude_opus() {
  local prompt=$1
  local model="${2:-$MODEL_PLANNING}"
  _call_agent "Jessica/${model}" "cd '$REPO' && claude --model ${model} -p $(printf '%q' "$prompt")"
  local status=$?
  echo "$_AGENT_OUTPUT"
  return "$status"
}

# Claude: deep review + fixing (Penny)
call_penny() {
  local prompt=$1
  local model="${2:-$MODEL_REVIEW}"
  _call_agent "Penny/${model}" "cd '$REPO' && claude --model ${model} -p $(printf '%q' "$prompt")"
  local status=$?
  echo "$_AGENT_OUTPUT"
  return "$status"
}

call_penny_with_retry() {
  local prompt=$1
  local out status
  out=$(call_penny "$prompt")
  status=$?
  if [ $status -eq 0 ] && [ -n "$(printf '%s' "$out" | tr -d '[:space:]')" ]; then
    printf '%s' "$out"
    return 0
  fi

  out=$(call_penny "$prompt")
  status=$?
  printf '%s' "$out"
  return $status
}

# Claude: implementation via Claude model (when MODEL_IMPL is set to a Claude model)
call_impl_claude() {
  local agent_name=$1 prompt=$2
  local model="${MODEL_IMPL:-opus}"
  _call_agent "${agent_name}/${model}" "cd '$REPO' && claude --model ${model} -p $(printf '%q' "$prompt")"
  local status=$?
  echo "$_AGENT_OUTPUT"
  return "$status"
}

# Fix agent: uses MODEL_FIX if set (Claude model), otherwise Codex Spark
call_fix_agent() {
  local prompt=$1
  if [ -n "${MODEL_FIX:-}" ]; then
    _call_agent "Fix/${MODEL_FIX}" "cd '$REPO' && claude --model ${MODEL_FIX} -p $(printf '%q' "$prompt")"
  else
    _call_agent "Fix/${CODEX_FIX_MODEL}" "$(build_isolated_codex_command "$prompt" "$CODEX_FIX_MODEL" "medium")"
  fi
  local status=$?
  echo "$_AGENT_OUTPUT"
  return "$status"
}

# Screenshot dev server for visual review
capture_screenshot() {
  local url=$1 output=$2
  # Try to capture with webkit2png or python
  python3 -c "
import subprocess, sys, os
url = '$url'
out = '$output'
# Try curl to check if server responds first
try:
    import urllib.request
    urllib.request.urlopen(url, timeout=5)
except:
    print('SERVER_DOWN')
    sys.exit(1)
# Use screencapture with a temp Safari approach
# Or just save the HTML for text-based review
import urllib.request
html = urllib.request.urlopen(url, timeout=10).read().decode('utf-8', errors='replace')
with open(out, 'w') as f:
    f.write(html[:5000])
print('HTML_CAPTURED')
" 2>/dev/null
}

build_isolated_codex_command() {
  local prompt=$1
  local model="${2:-$CODEX_MODEL}"
  local reasoning_effort="${3:-high}"
  local auth_path_escaped repo_escaped prompt_escaped model_escaped effort_escaped
  auth_path_escaped=$(printf '%q' "$HOME/.codex/auth.json")
  repo_escaped=$(printf '%q' "$REPO")
  prompt_escaped=$(printf '%q' "$prompt")
  model_escaped=$(printf '%q' "$model")
  effort_escaped=$(printf '%q' "$reasoning_effort")

  cat <<EOF
cd $repo_escaped && tmp_codex_home=\$(mktemp -d "$TMPDIR/autoclawdev-codex-XXXXXX") && cleanup_codex_home(){ rm -rf "\$tmp_codex_home"; } && trap cleanup_codex_home EXIT && if [ ! -f $auth_path_escaped ]; then echo "Missing Codex auth at $HOME/.codex/auth.json"; exit 1; fi && cp $auth_path_escaped "\$tmp_codex_home/auth.json" && python3 - "\$tmp_codex_home/config.toml" $repo_escaped <<'PY'
from pathlib import Path
import sys

config_path = Path(sys.argv[1])
repo = sys.argv[2]
config_path.write_text(
    f'''model = "$model"
model_reasoning_effort = "$reasoning_effort"
personality = "pragmatic"

[projects."{repo}"]
trust_level = "trusted"
''',
    encoding="utf-8",
)
PY
CODEX_HOME="\$tmp_codex_home" codex exec -m $model_escaped --full-auto --ephemeral -C $repo_escaped $prompt_escaped
EOF
}

# Codex GPT-5.4: backend implementation (Terry)
call_terry() {
  local prompt=$1
  _call_agent "Terry/codex" "$(build_isolated_codex_command "$prompt")"
  local status=$?
  echo "$_AGENT_OUTPUT"
  return "$status"
}

# Codex GPT-5.4: frontend implementation (Jerry)
call_jerry() {
  local prompt=$1
  _call_agent "Jerry/codex" "$(build_isolated_codex_command "$prompt")"
  local status=$?
  echo "$_AGENT_OUTPUT"
  return "$status"
}

# CodeRabbit: code review
call_coderabbit() {
  if [ "${CODERABBIT_AVAILABLE:-1}" != "1" ]; then
    echo "CodeRabbit CLI unavailable"
    return 127
  fi
  _call_agent "CodeRabbit" "cd '$REPO' && coderabbit review --type uncommitted --plain --no-color"
  local status=$?
  echo "$_AGENT_OUTPUT"
  return "$status"
}

parse_coderabbit_review() {
  python3 -c '
import json, re, sys

text = sys.stdin.read().strip()
lower = text.lower()

clean_markers = (
    "no findings",
    "no issues",
    "looks good",
    "no significant issues",
    "clean review",
    "no major issues",
    "no problems found",
)

if not text:
    print(json.dumps({"verdict": "unavailable", "count": 0, "findings": []}))
    raise SystemExit(0)

if any(marker in lower for marker in clean_markers):
    print(json.dumps({"verdict": "clean", "count": 0, "findings": []}))
    raise SystemExit(0)

blocks = [block.strip() for block in re.split(r"\n\s*\n+", text) if block.strip()]
findings = []
for block in blocks:
    block_lower = block.lower()
    score = 0
    if re.search(r"\b(p[0-3]|severity|warning|bug|issue|incorrect|vulnerability|regression|error)\b", block_lower):
        score += 1
    if re.search(r"(^|\n)\s*[-*]\s", block):
        score += 1
    if re.search(r"([A-Za-z0-9_/.-]+\.(ts|tsx|js|jsx|py|go|rb|java|kt|rs|sh|css|json|md))|#L\d+", block):
        score += 1
    if score >= 2:
        summary = " ".join(line.strip().lstrip("-*").strip() for line in block.splitlines()[:4])
        findings.append(summary[:320])

if not findings:
    first_line = next((line.strip().lstrip("-*").strip() for line in text.splitlines() if line.strip()), "")
    if first_line:
        findings.append(first_line[:320])

verdict = "issues" if findings else "clean"
print(json.dumps({"verdict": verdict, "count": len(findings), "findings": findings}))
'
}

capture_browser_snapshot() {
  local url=$1 output_dir=$2
  [ -f "$BROWSER_SNAPSHOT_SCRIPT" ] || return 1
  command_available node || return 1
  mkdir -p "$output_dir"
  node "$BROWSER_SNAPSHOT_SCRIPT" "$url" --output-dir "$output_dir" --save-har
}

# ── Per-Agent Cycle Logging ───────────────────────────────────────────
CYCLES_DIR="$WORKSPACE/cycles"
CYCLE_LOG=""
_orig_phase_output=""

init_cycle_log() {
  local exp_id=$1
  CYCLE_LOG="$CYCLES_DIR/${PROJECT_KEY}-${exp_id}.json"
  echo '{"id":"'"$exp_id"'","project":"'"$PROJECT_KEY"'","startedAt":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'","phases":[]}' > "$CYCLE_LOG"
}

log_phase() {
  local name=$1 tool=$2 status=$3 output=$4 elapsed=$5 detail_output=${6:-$4}
  # Escape JSON special chars in output
  local safe_output=$(echo "$detail_output" | python3 -c "import sys,json;print(json.dumps(sys.stdin.read().strip()))" 2>/dev/null || echo '""')
  python3 -c "
import json
with open('$CYCLE_LOG') as f: data = json.load(f)
data['phases'].append({
  'name': '$name',
  'tool': '$tool',
  'status': '$status',
  'output': $safe_output,
  'elapsed': $elapsed
})
with open('$CYCLE_LOG', 'w') as f: json.dump(data, f)
" 2>/dev/null
}

finalize_cycle_log() {
  local result=$1
  python3 -c "
import json
with open('$CYCLE_LOG') as f: data = json.load(f)
data['result'] = '$result'
data['finishedAt'] = '$(date -u +%Y-%m-%dT%H:%M:%SZ)'
with open('$CYCLE_LOG', 'w') as f: json.dump(data, f, indent=2)
" 2>/dev/null
}

# Override phase_done to auto-log phases
_orig_phase_agent=""
_orig_phase_tool=""
_orig_phase_start_time=0

phase_emit_start() {
  local icon=$1 name=$2 tool=$3 desc=$4
  printf "${BG_CARD} ${FG_C}${B}%s${RST}${BG_CARD} %-10s ${FG_P}%-8s${RST}${BG_CARD} ${FG_D}%s${RST}${BG_CARD}%*s${RST}\n" \
    "$icon" "$name" "[$tool]" "$desc" $((W-${#name}-${#tool}-${#desc}-7)) ""
  printf "${BG_CARD}   ${FG_O}⟳ Working...${RST}${BG_CARD}%*s${RST}" $((W-15)) ""
}

phase_emit_done() {
  local name=$1 tool=$2 started_at=$3 status=$4 summary=$5 detail_output=${6:-$5}
  local message="${name}: ${summary}"
  printf "\r${BG_CARD}   "
  if [ "$status" = "ok" ]; then
    printf "${FG_G}✓ Done${RST}${BG_CARD}  ${FG_D}%s${RST}${BG_CARD}%*s${RST}\n" "${message:0:$((W-12))}" 1 ""
  else
    printf "${FG_R}✗ Fail${RST}${BG_CARD}  ${FG_D}%s${RST}${BG_CARD}%*s${RST}\n" "${message:0:$((W-12))}" 1 ""
  fi
  local elapsed=$(( $(date +%s) - started_at ))
  [ -n "$CYCLE_LOG" ] && [ -f "$CYCLE_LOG" ] && log_phase "$name" "$tool" "$status" "$summary" "$elapsed" "$detail_output"
}

phase_set_output() {
  _orig_phase_output=$1
}

phase_start() {
  local icon=$1 name=$2 tool=$3 desc=$4
  _orig_phase_agent="$name"
  _orig_phase_tool="$tool"
  _orig_phase_start_time=$(date +%s)
  _orig_phase_output=""
  phase_emit_start "$icon" "$name" "$tool" "$desc"
}

phase_done() {
  local status=$1 summary=$2
  phase_emit_done "$_orig_phase_agent" "$_orig_phase_tool" "$_orig_phase_start_time" "$status" "$summary" "${_orig_phase_output:-$summary}"
  _orig_phase_output=""
}

prepare_cycle_workspace() {
  local exp_id=$1
  local safe_project=${PROJECT_KEY//[^A-Za-z0-9._-]/-}
  local safe_exp=${exp_id//[^A-Za-z0-9._-]/-}

  CURRENT_BRANCH="autoclawdev/${safe_project}/${safe_exp}-$(date +%s)"
  CURRENT_WORKTREE="$WORKSPACE/worktrees/${safe_project}-${safe_exp}"
  PRESERVE_CURRENT_WORKTREE=0

  mkdir -p "$WORKSPACE/worktrees" "$CYCLES_DIR"

  if [ -e "$CURRENT_WORKTREE" ]; then
    git -C "$SOURCE_REPO" worktree remove --force "$CURRENT_WORKTREE" >/dev/null 2>&1 || rm -rf "$CURRENT_WORKTREE"
  fi

  if ! git -C "$SOURCE_REPO" worktree add -b "$CURRENT_BRANCH" "$CURRENT_WORKTREE" "$INTEGRATION_BRANCH" >/dev/null 2>&1; then
    CURRENT_WORKTREE=""
    CURRENT_BRANCH=""
    REPO="${LANDING_REPO:-$SOURCE_REPO}"
    return 1
  fi

  # Git worktrees do not include ignored dependency directories. Link the
  # dependency trees from the hydrated integration/source workspace so
  # validation commands can resolve tooling without reinstalling per cycle.
  local dependency_source source_node_modules rel_path target_path
  dependency_source=$(dependency_link_source_repo)
  while [ -n "$dependency_source" ] && IFS= read -r -d '' source_node_modules; do
    rel_path=${source_node_modules#"$dependency_source"/}
    if [ "$rel_path" = "$source_node_modules" ]; then
      continue
    fi
    target_path="$CURRENT_WORKTREE/$rel_path"
    if [ -e "$target_path" ] || [ -L "$target_path" ]; then
      continue
    fi
    mkdir -p "$(dirname "$target_path")"
    ln -s "$source_node_modules" "$target_path"
  done < <(find "$dependency_source" -mindepth 1 -maxdepth 3 -type d -name node_modules -prune -print0 2>/dev/null)

  REPO="$CURRENT_WORKTREE"
}

cleanup_cycle_workspace() {
  release_cycle_reservation
  if [ "$PRESERVE_CURRENT_WORKTREE" = "1" ]; then
    REPO="${LANDING_REPO:-$SOURCE_REPO}"
    return 0
  fi

  if [ -n "$CURRENT_WORKTREE" ] && [ -e "$CURRENT_WORKTREE" ]; then
    git -C "$SOURCE_REPO" worktree remove --force "$CURRENT_WORKTREE" >/dev/null 2>&1 || rm -rf "$CURRENT_WORKTREE"
  fi

  if [ -n "$CURRENT_BRANCH" ] && git -C "$SOURCE_REPO" show-ref --verify --quiet "refs/heads/$CURRENT_BRANCH"; then
    git -C "$SOURCE_REPO" branch -D "$CURRENT_BRANCH" >/dev/null 2>&1 || true
  fi

  CURRENT_WORKTREE=""
  CURRENT_BRANCH=""
  REPO="${LANDING_REPO:-$SOURCE_REPO}"
}

cleanup_integration_workspace() {
  if [ -n "$INTEGRATION_WORKTREE" ] && [ -e "$INTEGRATION_WORKTREE" ]; then
    git -C "$SOURCE_REPO" worktree remove --force "$INTEGRATION_WORKTREE" >/dev/null 2>&1 || rm -rf "$INTEGRATION_WORKTREE"
  fi

  INTEGRATION_WORKTREE=""
  LANDING_REPO=""
}

promote_cycle_branch() {
  local output_file=$(mktemp "$TMPDIR/autoresearch-cherry-pick-XXXXXX")
  local merge_message=${1:-}
  local previous_repo=$REPO

  _PROMOTE_STATUS="failed"
  _PROMOTE_COMMIT_HASH=""
  _PROMOTE_METRICS_AFTER=""

  if [ -n "$HALT_FILE" ] && [ -f "$HALT_FILE" ]; then
    _PROMOTE_STATUS="halted"
    rm -f "$output_file"
    return 1
  fi

  if ! acquire_lock_dir "$MERGE_LOCK_DIR" 600; then
    printf "ERROR: timed out waiting for merge lock %s\n" "$MERGE_LOCK_DIR" >&2
    rm -f "$output_file"
    return 1
  fi

  if [ -n "$HALT_FILE" ] && [ -f "$HALT_FILE" ]; then
    _PROMOTE_STATUS="halted"
    release_lock_dir "$MERGE_LOCK_DIR"
    rm -f "$output_file"
    return 1
  fi

  if git -C "$LANDING_REPO" merge --no-ff "$CURRENT_BRANCH" -m "$merge_message" >"$output_file" 2>&1; then
    REPO="$LANDING_REPO"
    local merged_ref=""
    merged_ref=$(git -C "$LANDING_REPO" rev-parse HEAD 2>/dev/null || true)
    if [ -n "${CURRENT_VALIDATION_SUMMARY:-}" ] && [ -n "$merged_ref" ]; then
      store_validation_baseline_for_ref "$merged_ref" "$CURRENT_VALIDATION_SUMMARY"
    fi
    _PROMOTE_METRICS_AFTER=$(collect_metrics)
    REPO="$previous_repo"
    _PROMOTE_COMMIT_HASH=$(git -C "$LANDING_REPO" rev-parse --short HEAD)
    _PROMOTE_STATUS="merged"
    release_lock_dir "$MERGE_LOCK_DIR"
    rm -f "$output_file"
    printf "%s" "$_PROMOTE_COMMIT_HASH"
    return 0
  fi

  git -C "$LANDING_REPO" merge --abort >/dev/null 2>&1 || true
  release_lock_dir "$MERGE_LOCK_DIR"
  REPO="$previous_repo"
  cat "$output_file" >&2
  rm -f "$output_file"
  return 1
}

append_experiment_log() {
  local exp_id=$1
  local description=$2
  local result=$3
  local metrics_before=$4
  local metrics_after=$5
  local commit_hash=$6
  local elapsed=$7
  local directive_value=$8
  local domain_value=$9
  local issue_value=${10:-}
  local phase_timings_json=${11:-'{}'}
  local finding_title=${12:-}

  if ! acquire_lock_dir "$EXPERIMENTS_LOCK_DIR" 120; then
    printf "ERROR: timed out waiting for experiments lock %s\n" "$EXPERIMENTS_LOCK_DIR" >&2
    return 1
  fi

  EXP_FILE="$EXPERIMENTS" \
  EXP_ID="$exp_id" \
  EXP_TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  EXP_DIRECTIVE="$directive_value" \
  EXP_DESCRIPTION="$description" \
  EXP_RESULT="$result" \
  EXP_METRICS_BEFORE="$metrics_before" \
  EXP_METRICS_AFTER="$metrics_after" \
  EXP_COMMIT="$commit_hash" \
  EXP_ELAPSED="$elapsed" \
  EXP_DOMAIN="$domain_value" \
  EXP_ISSUE="$issue_value" \
  EXP_IMPLEMENTER="$([ "$domain_value" = "frontend" ] && printf "jerry" || printf "terry")" \
  EXP_PHASE_TIMINGS="$phase_timings_json" \
  EXP_FINDING_TITLE="$finding_title" \
  python3 - <<'PY'
import json
import os

phase_timings = {}
try:
    phase_timings = json.loads(os.environ.get("EXP_PHASE_TIMINGS", "{}"))
except (json.JSONDecodeError, TypeError):
    pass

payload = {
    "id": os.environ["EXP_ID"],
    "timestamp": os.environ["EXP_TIMESTAMP"],
    "directive": os.environ["EXP_DIRECTIVE"] or "unknown",
    "finding": os.environ.get("EXP_FINDING_TITLE", ""),
    "description": os.environ["EXP_DESCRIPTION"],
    "result": os.environ["EXP_RESULT"],
    "metrics_before": json.loads(os.environ["EXP_METRICS_BEFORE"]),
    "metrics_after": json.loads(os.environ["EXP_METRICS_AFTER"]),
    "commit": os.environ["EXP_COMMIT"],
    "elapsed": int(os.environ["EXP_ELAPSED"]),
    "phase_timings": phase_timings,
    "tools": [
        "olivia",
        "jessica",
        os.environ["EXP_IMPLEMENTER"],
        "coderabbit",
        "penny",
        "fix",
    ],
    "domain": os.environ["EXP_DOMAIN"] or "unknown",
    "gh_issue": os.environ["EXP_ISSUE"],
}

if payload["domain"] == "frontend":
    payload["tools"].append("visual")

with open(os.environ["EXP_FILE"], "a", encoding="utf-8") as handle:
    handle.write(json.dumps(payload) + "\n")
PY
  local append_status=$?
  release_lock_dir "$EXPERIMENTS_LOCK_DIR"
  return "$append_status"
}

# ── Metrics ──────────────────────────────────────────────────────────
collect_metrics() {
  cd "$REPO"
  local tc=0 tf=0 sf=0 lo="false"
  local head_ref=""
  local validation_baseline=""
  tf=$(find . -name '*.test.ts' -o -name '*.test.tsx' -o -name '*.spec.ts' 2>/dev/null | grep -v node_modules | wc -l | tr -d ' ')
  sf=$(find . -name '*.ts' -o -name '*.tsx' 2>/dev/null | grep -v node_modules | grep -v '.test.' | grep -v '.spec.' | grep -v dist | wc -l | tr -d ' ')
  [ -n "$LINT_CMD" ] && lo="true"
  head_ref=$(git rev-parse HEAD 2>/dev/null || true)
  validation_baseline=$(load_validation_baseline_for_ref "$head_ref")

  METRICS_TEST_COUNT="$tc" \
  METRICS_TEST_FILES="$tf" \
  METRICS_SRC_FILES="$sf" \
  METRICS_LINT_OK="$lo" \
  METRICS_BASE_COMMIT="$head_ref" \
  METRICS_VALIDATION_BASELINE="$validation_baseline" \
  python3 - <<'PY'
import json
import os

payload = {
    "test_count": int(os.environ["METRICS_TEST_COUNT"]),
    "test_files": int(os.environ["METRICS_TEST_FILES"]),
    "src_files": int(os.environ["METRICS_SRC_FILES"]),
    "lint_ok": os.environ["METRICS_LINT_OK"] == "true",
    "base_commit": os.environ.get("METRICS_BASE_COMMIT", ""),
}

baseline = os.environ.get("METRICS_VALIDATION_BASELINE", "").strip()
if baseline:
    payload["validation_baseline"] = json.loads(baseline)

print(json.dumps(payload, separators=(",", ":")))
PY
}

print_run_summary() {
  local completed_cycles=$1 passes=$2 failures=$3 metrics_json=$4

  echo ""
  hr
  printf "${BG_HEAD}${B}${FG_C}   AUTORESEARCH COMPLETE${RST}${BG_HEAD}%*s${RST}\n" $((W-22)) ""
  hr
  cblank
  cline "$(printf "  Cycles:  ${FG_W}${B}%d${RST}${BG_CARD}" "$completed_cycles")"
  cline "$(printf "  Passed:  ${FG_G}${B}%d${RST}${BG_CARD}" "$passes")"
  cline "$(printf "  Failed:  ${FG_R}${B}%d${RST}${BG_CARD}" "$failures")"
  cline "$(printf "  Rate:    ${FG_W}${B}%d%%${RST}${BG_CARD}" "$((passes * 100 / (passes + failures > 0 ? passes + failures : 1)))")"
  local f_tf=$(echo "$metrics_json" | python3 -c "import json,sys;print(json.loads(sys.stdin.read().strip()).get('test_files',0))" 2>/dev/null || echo "?")
  cline "$(printf "  Test files: ${FG_W}${B}%s${RST}${BG_CARD}" "$f_tf")"
  cblank
  echo ""
}

prune_stale_worktrees() {
  cd "$SOURCE_REPO" 2>/dev/null || return 0
  git worktree prune 2>/dev/null
  # Remove experiment worktree directories that have no matching git worktree entry
  local dir
  for dir in "$WORKSPACE/worktrees/${PROJECT_KEY}-exp-"*; do
    [ -d "$dir" ] || continue
    local wt_name
    wt_name=$(basename "$dir")
    if ! git worktree list 2>/dev/null | grep -q "$wt_name"; then
      rm -rf "$dir" 2>/dev/null
    fi
  done
}

run_parallel_cycles() {
  local exp_count=$1 baseline_json=$2 recent_context=$3 gh_issues_context=$4
  local worker_dir="$WORKSPACE/parallel-${PROJECT_KEY}"
  local next_cycle=1 active=0 passes=0 failures=0 stop_dispatch=0
  local halt_signal_sent=0 halt_kill_sent=0 halt_signal_started_at=0
  local cached_gh_context="$gh_issues_context"
  local last_gh_refresh_at=0
  mkdir -p "$worker_dir"

  # Pre-dispatch: prune stale worktrees and validate integration worktree
  prune_stale_worktrees
  if [ ! -d "$LANDING_REPO" ] || [ ! -f "$LANDING_REPO/package.json" ]; then
    echo "WARN: Integration worktree missing or incomplete. Recreating..."
    cd "$SOURCE_REPO" 2>/dev/null
    git worktree prune 2>/dev/null
    rm -rf "$LANDING_REPO" 2>/dev/null
    ensure_integration_workspace || {
      echo "ERROR: Could not recreate integration worktree"
      return 1
    }
    LANDING_REPO="$INTEGRATION_WORKTREE"
  fi

  [ -n "$cached_gh_context" ] && last_gh_refresh_at=$(date +%s)

  local -a worker_pids=()
  local -a worker_logs=()
  local -a worker_offsets=()

  while [ "$next_cycle" -le "$MAX_CYCLES" ] || [ "$active" -gt 0 ]; do
    [ -f "$HALT_FILE" ] && stop_dispatch=1

    while [ "$stop_dispatch" -eq 0 ] && [ "$next_cycle" -le "$MAX_CYCLES" ] && [ "$active" -lt "$MAX_PARALLEL_CYCLES" ]; do
      local exp_id="exp-$(printf '%03d' $((exp_count + next_cycle)))"
      # Write counter to prevent ID collisions across wigman restarts
      echo "$((exp_count + next_cycle))" > "$WORKSPACE/.exp-counter-${PROJECT_KEY}"
      local log_file="$worker_dir/${exp_id}.log"
      local dispatch_recent="$recent_context"
      local refreshed_recent=""
      local active_reservations=""
      local dispatch_gh="$cached_gh_context"
      local refreshed_gh=""

      REPO="$LANDING_REPO"
      capture_validation_baseline_for_repo "$LANDING_REPO" >/dev/null 2>&1 || true
      local dispatch_baseline=$(collect_metrics)

      refreshed_recent=$(recent_experiments_context 5)
      [ -n "$refreshed_recent" ] && dispatch_recent="$refreshed_recent"
      active_reservations=$(active_reserved_work_items_context)
      if [ -n "$active_reservations" ]; then
        if [ -n "$dispatch_recent" ]; then
          dispatch_recent="$dispatch_recent
Active reservations (avoid duplicating these):
$active_reservations"
        else
          dispatch_recent="Active reservations (avoid duplicating these):
$active_reservations"
        fi
      fi

      if [ -n "$gh_repo" ]; then
        local now_ts=$(date +%s)
        if [ "$GH_CONTEXT_REFRESH_SECONDS" -eq 0 ] || [ "$last_gh_refresh_at" -eq 0 ] || [ $((now_ts - last_gh_refresh_at)) -ge "$GH_CONTEXT_REFRESH_SECONDS" ]; then
          refreshed_gh=$(fetch_github_issues_context "$gh_repo" "$gh_upstream")
          last_gh_refresh_at=$now_ts
          if [ -n "$refreshed_gh" ]; then
            cached_gh_context="$refreshed_gh"
            dispatch_gh="$refreshed_gh"
            store_gh_issues_cache "$gh_repo" "$refreshed_gh"
          fi
        fi
      fi

      AUTOCLAWDEV_RUNNER_MODE=worker \
      AUTOCLAWDEV_SKIP_PROJECT_LOCK=1 \
      AUTOCLAWDEV_MAX_PARALLEL_CYCLES=1 \
      AUTOCLAWDEV_BATCH_RESEARCH_AUTO=1 \
      AUTOCLAWDEV_ASSIGNED_EXP_ID="$exp_id" \
      AUTOCLAWDEV_ASSIGNED_CYCLE_NUMBER="$next_cycle" \
      AUTOCLAWDEV_BASELINE_JSON="$dispatch_baseline" \
      AUTOCLAWDEV_RECENT_CONTEXT="$dispatch_recent" \
      AUTOCLAWDEV_GH_ISSUES_CONTEXT="$dispatch_gh" \
      AUTOCLAWDEV_LANDING_REPO="$LANDING_REPO" \
      AUTOCLAWDEV_BASE_BRANCH="$BASE_BRANCH" \
      AUTOCLAWDEV_INTEGRATION_BRANCH="$INTEGRATION_BRANCH" \
      "$RUNNER_PATH" 1 "$DRY_RUN" "$PROJECT_KEY" >"$log_file" 2>&1 &

      local worker_pid=$!
      worker_pids+=("$worker_pid")
      worker_logs+=("$log_file")
      worker_offsets+=(0)
      active=$((active + 1))
      phase_detail "Started cycle ${next_cycle} -> ${exp_id}"
      next_cycle=$((next_cycle + 1))
    done

    if [ "$stop_dispatch" -eq 1 ] && [ "$halt_signal_sent" -eq 0 ] && [ "${#worker_pids[@]}" -gt 0 ]; then
      local halt_pid=""
      phase_detail "Stopping in-flight workers after preserved cycle state"
      for halt_pid in "${worker_pids[@]}"; do
        kill -TERM "$halt_pid" 2>/dev/null || true
      done
      halt_signal_sent=1
      halt_signal_started_at=$(date +%s)
    fi

    if [ "$stop_dispatch" -eq 1 ] && [ "$halt_signal_sent" -eq 1 ] && [ "$halt_kill_sent" -eq 0 ] && [ "${#worker_pids[@]}" -gt 0 ]; then
      if [ $(( $(date +%s) - halt_signal_started_at )) -ge 5 ]; then
        local kill_pid=""
        phase_detail "Force-stopping remaining halted workers"
        for kill_pid in "${worker_pids[@]}"; do
          if kill -0 "$kill_pid" 2>/dev/null; then
            kill -KILL "$kill_pid" 2>/dev/null || true
          fi
        done
        halt_kill_sent=1
      fi
    fi

    local progressed=0
    local -a remaining_pids=()
    local -a remaining_logs=()
    local -a remaining_offsets=()
    local idx
    for idx in "${!worker_pids[@]}"; do
      local pid="${worker_pids[$idx]}"
      local log_file="${worker_logs[$idx]}"
      local log_offset="${worker_offsets[$idx]:-0}"

      if [ -f "$log_file" ]; then
        local log_size
        log_size=$(wc -c < "$log_file" 2>/dev/null | tr -d ' ')
        log_size=${log_size:-0}
        if [ "$log_size" -gt "$log_offset" ]; then
          tail -c "+$((log_offset + 1))" "$log_file"
          log_offset=$log_size
          progressed=1
        fi
      fi

      if kill -0 "$pid" 2>/dev/null; then
        remaining_pids+=("$pid")
        remaining_logs+=("$log_file")
        remaining_offsets+=("$log_offset")
        continue
      fi

      wait "$pid"
      local worker_status=$?
      if [ -f "$log_file" ]; then
        local final_log_size
        final_log_size=$(wc -c < "$log_file" 2>/dev/null | tr -d ' ')
        final_log_size=${final_log_size:-0}
        if [ "$final_log_size" -gt "$log_offset" ]; then
          tail -c "+$((log_offset + 1))" "$log_file"
        fi
      fi
      rm -f "$log_file"

      if [ "$worker_status" -eq 0 ]; then
        passes=$((passes + 1))
      else
        failures=$((failures + 1))
        if [ "$worker_status" -eq 2 ]; then
          stop_dispatch=1
          : > "$HALT_FILE"
          phase_detail "Parallel run halted after preserved cycle state"
        fi
      fi
      active=$((active - 1))
      progressed=1
    done
    if [ ${#remaining_pids[@]} -gt 0 ]; then
      worker_pids=("${remaining_pids[@]}")
      worker_logs=("${remaining_logs[@]}")
      worker_offsets=("${remaining_offsets[@]}")
    else
      worker_pids=()
      worker_logs=()
      worker_offsets=()
    fi

    [ "$progressed" -eq 0 ] && sleep 1
  done

  PARALLEL_PASSES=$passes
  PARALLEL_FAILURES=$failures
  PARALLEL_COMPLETED=$((passes + failures))
}

# ── Main ─────────────────────────────────────────────────────────────
main() {
  local config_file="$PROJECTS_DIR/${PROJECT_KEY}.json"
  if [ -f "$config_file" ]; then
    [ -z "${AUTOCLAWDEV_REPO:-}" ] && REPO=$(python3 -c "import json;print(json.load(open('$config_file')).get('path',''))" 2>/dev/null)
    [ -z "${AUTOCLAWDEV_NAME:-}" ] && PROJECT_NAME=$(python3 -c "import json;print(json.load(open('$config_file')).get('name','$PROJECT_KEY'))" 2>/dev/null)
    [ -z "${AUTOCLAWDEV_TEST_CMD:-}" ] && TEST_CMD=$(python3 -c "import json;print(json.load(open('$config_file')).get('test_cmd',''))" 2>/dev/null)
    [ -z "${AUTOCLAWDEV_LINT_CMD:-}" ] && LINT_CMD=$(python3 -c "import json;print(json.load(open('$config_file')).get('lint_cmd',''))" 2>/dev/null)
    [ -z "${AUTOCLAWDEV_SECURITY_CMD:-}" ] && SECURITY_CMD=$(python3 -c "import json;print(json.load(open('$config_file')).get('security_cmd',''))" 2>/dev/null)
    [ -z "${AUTOCLAWDEV_SECURITY_DEPENDENCY_CMD:-}" ] && SECURITY_DEPENDENCY_CMD=$(python3 -c "import json;print(json.load(open('$config_file')).get('security_dependency_cmd',''))" 2>/dev/null)
    [ -z "${AUTOCLAWDEV_PERFORMANCE_CMD:-}" ] && PERFORMANCE_CMD=$(python3 -c "import json;print(json.load(open('$config_file')).get('performance_cmd',''))" 2>/dev/null)
    [ -z "${AUTOCLAWDEV_PROFILE_VALIDATION_JSON:-}" ] && PROFILE_VALIDATION_JSON=$(python3 -c "import json; data=json.load(open('$config_file')); print(json.dumps(data.get('profile_validation', {}), separators=(',', ':')))" 2>/dev/null)
    [ -z "${AUTOCLAWDEV_DEV_URL:-}" ] && DEV_SERVER_URL=$(python3 -c "import json;print(json.load(open('$config_file')).get('dev_url',''))" 2>/dev/null)
    [ -z "${AUTOCLAWDEV_BASE_BRANCH:-}" ] && BASE_BRANCH=$(python3 -c "import json;print(json.load(open('$config_file')).get('base_branch',''))" 2>/dev/null)
    [ -z "${AUTOCLAWDEV_INTEGRATION_BRANCH:-}" ] && INTEGRATION_BRANCH=$(python3 -c "import json;print(json.load(open('$config_file')).get('integration_branch',''))" 2>/dev/null)
    [ -z "${AUTOCLAWDEV_TEAM_PROFILE:-}" ] && TEAM_PROFILE=$(python3 -c "import json;print(json.load(open('$config_file')).get('team_profile','reliability'))" 2>/dev/null)
    [ -z "${AUTOCLAWDEV_WORKFLOW_TYPE:-}" ] && WORKFLOW_TYPE=$(python3 -c "import json;print(json.load(open('$config_file')).get('workflow_type',''))" 2>/dev/null)
    [ -z "${AUTOCLAWDEV_RESEARCH_MODEL:-}" ] && MODEL_RESEARCH=$(python3 -c "import json;v=json.load(open('$config_file')).get('research_model','');print(v) if v else print('opus')" 2>/dev/null)
    [ -z "${AUTOCLAWDEV_PLANNING_MODEL:-}" ] && MODEL_PLANNING=$(python3 -c "import json;v=json.load(open('$config_file')).get('planning_model','');print(v) if v else print('opus')" 2>/dev/null)
    [ -z "${AUTOCLAWDEV_IMPL_MODEL:-}" ] && MODEL_IMPL=$(python3 -c "import json;print(json.load(open('$config_file')).get('impl_model',''))" 2>/dev/null)
    [ -z "${AUTOCLAWDEV_REVIEW_MODEL:-}" ] && MODEL_REVIEW=$(python3 -c "import json;v=json.load(open('$config_file')).get('review_model','');print(v) if v else print('opus')" 2>/dev/null)
    [ -z "${AUTOCLAWDEV_SPEED_PROFILE:-}" ] && SPEED_PROFILE=$(python3 -c "import json;print(json.load(open('$config_file')).get('speed_profile','balanced'))" 2>/dev/null)
    [ -z "${AUTOCLAWDEV_MAX_PARALLEL_CYCLES:-}" ] && MAX_PARALLEL_CYCLES=$(python3 -c "import json;v=json.load(open('$config_file')).get('max_parallel_cycles','');print(v) if v else print('1')" 2>/dev/null)
    [ -z "${AUTOCLAWDEV_BATCH_RESEARCH_COUNT:-}" ] && BATCH_RESEARCH_COUNT=$(python3 -c "import json;v=json.load(open('$config_file')).get('batch_research_count','');print(v) if v else print('3')" 2>/dev/null)
    [ -z "${AUTOCLAWDEV_LANDING_REPO:-}" ] && LANDING_REPO=$(python3 -c "import json;print(json.load(open('$config_file')).get('landing_repo',''))" 2>/dev/null)
    [ -z "${AUTOCLAWDEV_GH_CONTEXT_REFRESH_SECONDS:-}" ] && GH_CONTEXT_REFRESH_SECONDS=$(python3 -c "import json;v=json.load(open('$config_file')).get('gh_context_refresh_seconds','');print(v) if v else print('30')" 2>/dev/null)
    [ -z "${AUTOCLAWDEV_CODEX_MODEL:-}" ] && CODEX_MODEL=$(python3 -c "import json;v=json.load(open('$config_file')).get('codex_model','');print(v) if v else print('gpt-5.4')" 2>/dev/null)
    [ -z "${AUTOCLAWDEV_CODEX_FIX_MODEL:-}" ] && CODEX_FIX_MODEL=$(python3 -c "import json;v=json.load(open('$config_file')).get('codex_fix_model','');print(v) if v else print('gpt-5.3-codex-spark')" 2>/dev/null)
  fi
  PROJECT_CONFIG_FILE="$config_file"
  TEAM_PROFILE=$(normalize_team_profile "$TEAM_PROFILE")
  WORKFLOW_TYPE=$(normalize_workflow_type "${WORKFLOW_TYPE:-standard}")

  if [ -z "$REPO" ] || [ ! -d "$REPO" ]; then
    echo "ERROR: project repo not configured for ${PROJECT_KEY}"
    echo "Set AUTOCLAWDEV_REPO or create ${config_file}"
    exit 1
  fi

  require_command git "needed for worktrees, validation state, and commits" || exit 1
  require_command python3 "needed for runner parsing and JSON logging" || exit 1
  require_command claude "needed for Olivia/Jessica/Penny/Fix phases" || exit 1
  if [ -z "${MODEL_IMPL:-}" ]; then
    require_command codex "needed for Terry/Jerry implementation phases (set AUTOCLAWDEV_IMPL_MODEL to use a Claude model instead)" || exit 1
  fi
  require_integer_min "$MAX_CYCLES" "MAX_CYCLES" 1 || exit 1
  require_integer_min "$AGENT_TIMEOUT_DEFAULT" "AUTOCLAWDEV_AGENT_TIMEOUT_DEFAULT" 1 || exit 1
  require_integer_min "$AGENT_TIMEOUT_CODEX" "AUTOCLAWDEV_AGENT_TIMEOUT_CODEX" 1 || exit 1
  require_integer_min "$AGENT_TIMEOUT_OPUS" "AUTOCLAWDEV_AGENT_TIMEOUT_OPUS" 1 || exit 1
  require_integer_min "$AGENT_TIMEOUT_CODERABBIT" "AUTOCLAWDEV_AGENT_TIMEOUT_CODERABBIT" 1 || exit 1
  require_integer_min "$AGENT_TIMEOUT_FIX" "AUTOCLAWDEV_AGENT_TIMEOUT_FIX" 1 || exit 1
  require_integer_min "$VALIDATION_TIMEOUT" "AUTOCLAWDEV_VALIDATION_TIMEOUT" 1 || exit 1
  require_integer_min "$CODERABBIT_MAX_ROUNDS" "AUTOCLAWDEV_CODERABBIT_MAX_ROUNDS" 0 || exit 1
  require_integer_min "$VALIDATION_FIX_ATTEMPTS" "AUTOCLAWDEV_VALIDATION_FIX_ATTEMPTS" 0 || exit 1
  require_integer_min "$CYCLE_COOLDOWN_SECONDS" "AUTOCLAWDEV_CYCLE_COOLDOWN_SECONDS" 0 || exit 1
  require_integer_min "$MAX_PARALLEL_CYCLES" "AUTOCLAWDEV_MAX_PARALLEL_CYCLES" 1 || exit 1
  require_integer_min "$GH_CONTEXT_REFRESH_SECONDS" "AUTOCLAWDEV_GH_CONTEXT_REFRESH_SECONDS" 0 || exit 1
  case "$VALIDATION_MODE" in
    serial|parallel) ;;
    *)
      echo "ERROR: AUTOCLAWDEV_VALIDATION_MODE must be 'serial' or 'parallel'"
      exit 1
      ;;
  esac
  if [ "$ALLOW_PREEXISTING_TEST_FAILURES" != "0" ] && [ "$ALLOW_PREEXISTING_TEST_FAILURES" != "1" ]; then
    echo "ERROR: AUTOCLAWDEV_ALLOW_PREEXISTING_TEST_FAILURES must be 0 or 1"
    exit 1
  fi
  if [ "$SKIP_PROJECT_LOCK" != "0" ] && [ "$SKIP_PROJECT_LOCK" != "1" ]; then
    echo "ERROR: AUTOCLAWDEV_SKIP_PROJECT_LOCK must be 0 or 1"
    exit 1
  fi
  if [ "$RUNNER_MODE" != "parent" ] && [ "$RUNNER_MODE" != "worker" ]; then
    echo "ERROR: AUTOCLAWDEV_RUNNER_MODE must be 'parent' or 'worker'"
    exit 1
  fi
  case "$(speed_profile_label)" in
    fast|balanced|thorough) ;;
    *)
      echo "ERROR: AUTOCLAWDEV_SPEED_PROFILE must be 'fast', 'balanced', or 'thorough'"
      exit 1
      ;;
  esac
  case "$(workflow_type_label)" in
    standard|implement-only|review-only|fast-ship|batch-research|research-only) ;;
    *)
      echo "ERROR: AUTOCLAWDEV_WORKFLOW_TYPE must be one of: standard, implement-only, review-only, fast-ship, batch-research, research-only"
      exit 1
      ;;
  esac
  if [ "$(workflow_type_label)" = "implement-only" ] && [ -z "${AUTOCLAWDEV_GOAL:-}" ]; then
    echo "ERROR: implement-only workflow requires AUTOCLAWDEV_GOAL to be set"
    exit 1
  fi
  if [ "$MEMORY_ENABLED" != "0" ] && [ "$MEMORY_ENABLED" != "1" ]; then
    echo "ERROR: AUTOCLAWDEV_MEMORY_ENABLED must be 0 or 1"
    exit 1
  fi
  # Validate review depth
  case "$(resolve_review_depth)" in
    none|validation-only|penny|full) ;;
    *)
      echo "ERROR: AUTOCLAWDEV_REVIEW_DEPTH must be one of: none, validation-only, penny, full"
      exit 1
      ;;
  esac
  if ! command -v coderabbit >/dev/null 2>&1; then
    CODERABBIT_AVAILABLE=0
    if coderabbit_is_enabled; then
      echo "WARN: coderabbit not found; CodeRabbit review phases will be skipped"
    fi
  fi

  # Validate research model is highest-quality for best findings
  case "$MODEL_RESEARCH" in
    opus|claude-opus-4*) ;;
    *)
      echo "WARN: Research model '$MODEL_RESEARCH' is not opus — research quality may degrade"
      ;;
  esac

  if [ "$(team_profile_label)" = "issues" ]; then
    local issue_burner_repo=""
    if [ -f "$config_file" ]; then
      issue_burner_repo=$(python3 -c "import json;print(json.load(open('$config_file')).get('gh_repo',''))" 2>/dev/null)
    fi
    if [ -z "$issue_burner_repo" ]; then
      echo "ERROR: issues profile requires gh_repo in ${config_file}"
      exit 1
    fi
    if ! command_available gh; then
      echo "ERROR: issues profile requires gh CLI"
      exit 1
    fi
  fi

  SOURCE_REPO="$REPO"
  if ! git -C "$SOURCE_REPO" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "ERROR: ${SOURCE_REPO} is not a git repository"
    exit 1
  fi

  if [ -z "$BASE_BRANCH" ]; then
    BASE_BRANCH=$(current_git_branch "$SOURCE_REPO")
  fi
  if [ -z "$BASE_BRANCH" ]; then
    echo "ERROR: unable to determine base branch; set AUTOCLAWDEV_BASE_BRANCH"
    exit 1
  fi
  if [ -z "$INTEGRATION_BRANCH" ]; then
    INTEGRATION_BRANCH="autoclawdev/${PROJECT_KEY//[^A-Za-z0-9._-]/-}/integration"
  fi
  if [ "$INTEGRATION_BRANCH" = "$BASE_BRANCH" ]; then
    echo "ERROR: integration branch must differ from base branch"
    exit 1
  fi
  if [ "$RUNNER_MODE" = "worker" ]; then
    require_integer_min "${ASSIGNED_CYCLE_NUMBER:-0}" "AUTOCLAWDEV_ASSIGNED_CYCLE_NUMBER" 1 || exit 1
    if [ -z "$ASSIGNED_EXP_ID" ]; then
      echo "ERROR: AUTOCLAWDEV_ASSIGNED_EXP_ID is required in worker mode"
      exit 1
    fi
    # Wait up to 120s for the integration worktree to become available
    # (parent may still be bootstrapping deps which can take 30-60s)
    local _lr_wait=0
    while [ -z "$LANDING_REPO" ] || [ ! -d "$LANDING_REPO" ] || [ ! -f "$LANDING_REPO/package.json" ]; do
      if [ $_lr_wait -ge 120 ]; then
        echo "ERROR: AUTOCLAWDEV_LANDING_REPO must point to an existing integration worktree in worker mode (waited ${_lr_wait}s)"
        # Exit 2 = halt signal — tells parent to stop dispatching, not just count as failure
        exit 2
      fi
      sleep 3
      _lr_wait=$((_lr_wait + 3))
    done
    INTEGRATION_WORKTREE=""
  fi

  mkdir -p "$WORKSPACE" "$CYCLES_DIR" "$(dirname "$EXPERIMENTS")" "$MEMORY_DIR"
  MERGE_LOCK_DIR="$WORKSPACE/.merge-lock-${PROJECT_KEY}"
  EXPERIMENTS_LOCK_DIR="$WORKSPACE/.experiments-lock-${PROJECT_KEY}"
  RESERVATIONS_DIR="$WORKSPACE/.reservations-${PROJECT_KEY}"
  RESERVATIONS_LOCK_DIR="$WORKSPACE/.reservations-lock-${PROJECT_KEY}"
  HALT_FILE="$WORKSPACE/.halt-${PROJECT_KEY}"
  if [ "$RUNNER_MODE" = "parent" ]; then
    rm -f "$HALT_FILE"
    rm -rf "$RESERVATIONS_DIR"
  fi

  # ── Lock file — prevent two runs on the same project ─────────────
  if [ "$SKIP_PROJECT_LOCK" != "1" ]; then
    LOCKFILE="$WORKSPACE/.lock-${PROJECT_KEY}"
    if [ -f "$LOCKFILE" ]; then
      local lock_pid=$(cat "$LOCKFILE" 2>/dev/null)
      if kill -0 "$lock_pid" 2>/dev/null; then
        echo "ERROR: Another autoresearch run is active on ${PROJECT_KEY} (pid $lock_pid)"
        echo "If this is stale, remove: $LOCKFILE"
        exit 1
      else
        rm -f "$LOCKFILE"
      fi
    fi
    echo $$ > "$LOCKFILE"
  fi
  trap cleanup_run EXIT INT TERM

  if ! touch "$EXPERIMENTS"; then
    echo "ERROR: unable to write experiments log at $EXPERIMENTS"
    exit 1
  fi
  # Use an atomic counter file to assign unique experiment IDs.
  # Reads max from both the counter file and JSONL to ensure no collisions.
  local _counter_file="$WORKSPACE/.exp-counter-${PROJECT_KEY}"
  local exp_count
  exp_count=$(python3 -c "
import json, sys, os

max_id = 0
# Check JSONL for highest existing ID
try:
    with open('$EXPERIMENTS') as f:
        for line in f:
            line = line.strip()
            if not line: continue
            try:
                eid = json.loads(line).get('id', '')
                num = int(eid.replace('exp-', ''))
                if num > max_id: max_id = num
            except (json.JSONDecodeError, ValueError):
                pass
except FileNotFoundError:
    pass

# Check counter file for highest assigned ID (may be ahead of JSONL)
counter_file = '$_counter_file'
try:
    with open(counter_file) as f:
        counter_val = int(f.read().strip())
        if counter_val > max_id: max_id = counter_val
except (FileNotFoundError, ValueError):
    pass

print(max_id)
" 2>/dev/null || wc -l < "$EXPERIMENTS" | tr -d ' ')

  if [ "$RUNNER_MODE" = "parent" ]; then
    echo ""
    hr
    printf "${BG_HEAD}${B}${FG_C}   🦞 AutoClawDev — ${PROJECT_NAME}${RST}${BG_HEAD}%*s${RST}\n" $((W-21-${#PROJECT_NAME})) ""
    printf "${BG_HEAD}${FG_D}   Opus + Codex 5.4 + CodeRabbit${RST}${BG_HEAD}%*s${RST}\n" $((W-32)) ""
    printf "${BG_HEAD}${FG_D}   $MAX_CYCLES cycles · $(date '+%Y-%m-%d %H:%M')${RST}${BG_HEAD}%*s${RST}\n" $((W-32)) ""
    hr
    echo ""

    [ -n "$DRY_RUN" ] && printf "${BG_CARD} ${FG_Y}${B}DRY RUN${RST}${BG_CARD}%*s${RST}\n" $((W-8)) ""

    section "🧰" "RUNNER CHECK"
    cline "  Checking toolchain..."
    if ! runner_preflight; then
      cblank
      echo ""
      exit 1
    fi
    cline "  Required tools present"
    if ! command_available coderabbit; then
      cline "  CodeRabbit CLI unavailable — review phases will be skipped"
    fi
    cline "  Speed profile: $(speed_profile_label)"
    if memory_enabled; then
      cline "  Memory: enabled ($MEMORY_DIR)"
    else
      cline "  Memory: disabled or helper missing"
    fi
    cline "  Base branch: $BASE_BRANCH"
    cline "  Integration branch: $INTEGRATION_BRANCH"
    cblank
    echo ""

    # Clean state check
    cd "$SOURCE_REPO"
    if [ "$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')" -gt 0 ]; then
      printf "${BG_CARD} ${FG_R}${B}ERROR${RST}${BG_CARD} — uncommitted changes. Commit first.%*s${RST}\n" $((W-45)) ""
      exit 1
    fi

    if ! ensure_integration_workspace; then
      exit 1
    fi
    REPO="$LANDING_REPO"
  else
    REPO="$LANDING_REPO"
  fi

  # Baseline
  local baseline=""
  if [ "$RUNNER_MODE" = "worker" ] && [ -n "$INITIAL_BASELINE_JSON" ]; then
    baseline="$INITIAL_BASELINE_JSON"
  else
    [ "$RUNNER_MODE" = "parent" ] && section "📊" "BASELINE"
    [ "$RUNNER_MODE" = "parent" ] && cline "  Collecting metrics..."
    if [ "$RUNNER_MODE" = "parent" ] && [ "$CAPTURE_VALIDATION_BASELINE" = "1" ] && [ "$(validation_command_count)" -gt 0 ]; then
      cline "  Capturing validation baseline..."
      capture_validation_baseline_for_repo "$REPO" >/dev/null 2>&1 || true
    fi
    baseline=$(collect_metrics)
    if [ "$RUNNER_MODE" = "parent" ]; then
      local b_tf=$(echo "$baseline" | python3 -c "import json,sys;print(json.loads(sys.stdin.read().strip())['test_files'])" 2>/dev/null || echo "?")
      local b_sf=$(echo "$baseline" | python3 -c "import json,sys;print(json.loads(sys.stdin.read().strip())['src_files'])" 2>/dev/null || echo "?")
      cline "$(printf "  Test files: ${FG_W}${B}%s${RST}${BG_CARD}  Sources: ${FG_W}${B}%s${RST}${BG_CARD}" "$b_tf" "$b_sf")"
      cline "$(printf "  Validation: ${FG_W}${B}%s${RST}${BG_CARD}" "$(validation_commands_summary)")"
      echo "$baseline" | python3 -c "import json,sys; data=json.loads(sys.stdin.read().strip()); print('yes' if data.get('validation_baseline') else 'no')" 2>/dev/null | {
        read -r baseline_state
        cline "$(printf "  Validation baseline: ${FG_W}${B}%s${RST}${BG_CARD}" "${baseline_state:-no}")"
      }
      cblank
      echo ""
    fi
  fi

  # Recent experiments context
  local recent="${RECENT_CONTEXT_OVERRIDE:-}"
  if [ -z "$recent" ] && [ -s "$EXPERIMENTS" ]; then
    recent=$(recent_experiments_context 5)
  fi

  # GitHub issues context (if project has a gh_repo)
  local gh_issues="${GH_ISSUES_CONTEXT_OVERRIDE:-}"
  local gh_repo=""
  if [ -f "$config_file" ]; then
    gh_repo=$(python3 -c "import json;print(json.load(open('$config_file')).get('gh_repo',''))" 2>/dev/null)
    local gh_upstream=$(python3 -c "import json;print(json.load(open('$config_file')).get('gh_upstream',''))" 2>/dev/null)
  fi
  if [ -z "$gh_issues" ] && [ -n "$gh_repo" ]; then
    section "🔗" "GITHUB CONTEXT"
    if gh_issues=$(load_gh_issues_cache "$gh_repo"); then
      local issue_count
      issue_count=$(echo "$gh_issues" | grep -c "[#]" 2>/dev/null || true)
      issue_count=${issue_count:-0}
      cline "  ${FG_G}Loaded $issue_count cached issues (< ${GH_ISSUES_CACHE_TTL_SECONDS}s old)${RST}"
    elif ! command_available gh; then
      cline "  GitHub CLI unavailable — skipping issue context"
    else
      cline "  Fetching issues from $gh_repo..."
      if gh_issues=$(gh issue list --repo "$gh_repo" --state open --json number,title,labels --limit 15 --jq '.[] | "  #\(.number) \(.title) [\(.labels | map(.name) | join(","))]"' 2>/dev/null); then
        local issue_count
        issue_count=$(echo "$gh_issues" | grep -c "[#]" 2>/dev/null || true)
        issue_count=${issue_count:-0}
        if [ -n "$gh_upstream" ]; then
          local upstream_issues=""
          if upstream_issues=$(gh issue list --repo "$gh_upstream" --state open --label "bug,enhancement" --json number,title --limit 10 --jq '.[] | "  #\(.number) \(.title)"' 2>/dev/null); then
            gh_issues="$gh_issues
Upstream ($gh_upstream):
$upstream_issues"
            local upstream_count
            upstream_count=$(echo "$upstream_issues" | grep -c "[#]" 2>/dev/null || true)
            upstream_count=${upstream_count:-0}
            issue_count=$((issue_count + upstream_count))
          else
            cline "  Upstream issue fetch failed for $gh_upstream"
          fi
        fi
        store_gh_issues_cache "$gh_repo" "$gh_issues"
        cline "  ${FG_G}Found $issue_count open issues${RST}"
      else
        cline "  GitHub issue fetch failed — continuing without issue context"
      fi
    fi
    cblank
    echo ""
  fi

  if [ "$RUNNER_MODE" = "parent" ] && [ "$MAX_PARALLEL_CYCLES" -gt 1 ]; then
    section "⚙️" "PARALLEL CYCLES"
    cline "  Running up to $MAX_PARALLEL_CYCLES cycles at once"
    cblank
    echo ""
    run_parallel_cycles "$exp_count" "$baseline" "$recent" "$gh_issues"
    REPO="$LANDING_REPO"
    local final_metrics=$(collect_metrics)
    print_run_summary "$PARALLEL_COMPLETED" "$PARALLEL_PASSES" "$PARALLEL_FAILURES" "$final_metrics"
    return 0
  fi

  local cycle_begin=1 cycle_limit=$MAX_CYCLES
  if [ "$RUNNER_MODE" = "worker" ]; then
    cycle_begin=$ASSIGNED_CYCLE_NUMBER
    cycle_limit=$ASSIGNED_CYCLE_NUMBER
  fi
  local cycle=$cycle_begin passes=0 failures=0
  # Persistent queues for batch-research workflow (survive across cycle iterations)
  local _batch_queue_findings=()
  local _batch_queue_files=()
  local _batch_queue_directives=()
  local _batch_queue_domains=()

  while [ $cycle -le $cycle_limit ]; do
    local exp_id="exp-$(printf '%03d' $((exp_count + cycle)))"
    [ "$RUNNER_MODE" = "worker" ] && exp_id="$ASSIGNED_EXP_ID"
    local cycle_start=$(date +%s)
    local cycle_failed=false
    local finding="" target_file="" directive="unknown" domain="backend" gh_issue_num=""
    local goal="" acceptance="" changes_made="" verdict=""
    CURRENT_VALIDATION_SUMMARY=""

    section "🔬" "CYCLE $cycle / $MAX_CYCLES — $exp_id"
    cblank

    # Initialize per-agent cycle log
    init_cycle_log "$exp_id"
    save_phase_config_defaults

    if ! prepare_cycle_workspace "$exp_id"; then
      phase_detail "Failed to prepare isolated worktree"
      finalize_cycle_log "fail"
      failures=$((failures + 1))
      cycle=$((cycle + 1))
      continue
    fi
    phase_detail "Cycle branch: $CURRENT_BRANCH"
    phase_detail "Landing branch: $INTEGRATION_BRANCH"
    phase_detail "Team profile: $(team_profile_label)"
    ACTIVE_PHASE_SEQUENCE=$(resolve_phase_sequence)
    [ "$(workflow_type_label)" != "standard" ] && phase_detail "Workflow: $(workflow_type_label)"
    phase_detail "Review depth: $(resolve_review_depth) → phases: ${ACTIVE_PHASE_SEQUENCE}"

    # Pre-populate research outputs for implement-only (no research/planning phases)
    if ! phase_is_enabled "research" && ! phase_is_enabled "batch-research"; then
      finding="${AUTOCLAWDEV_GOAL:-}"
      goal="${AUTOCLAWDEV_GOAL:-}"
      target_file="${AUTOCLAWDEV_TARGET_FILE:-}"
      domain="${AUTOCLAWDEV_DOMAIN:-backend}"
      directive="${AUTOCLAWDEV_DIRECTIVE:-feature}"
      acceptance="Implement the goal as described."
      if [ -z "$finding" ]; then
        phase_detail "implement-only: AUTOCLAWDEV_GOAL not set"
        cycle_failed=true
      fi
    fi

    # batch-research: pop from queue if available (skip research phase for queued findings)
    if phase_is_enabled "batch-research" && [ "${#_batch_queue_findings[@]}" -gt 0 ]; then
      finding="${_batch_queue_findings[0]}"
      target_file="${_batch_queue_files[0]}"
      directive="${_batch_queue_directives[0]}"
      domain="${_batch_queue_domains[0]}"
      goal="$finding"
      acceptance="Implement the finding as described."
      _batch_queue_findings=("${_batch_queue_findings[@]:1}")
      _batch_queue_files=("${_batch_queue_files[@]:1}")
      _batch_queue_directives=("${_batch_queue_directives[@]:1}")
      _batch_queue_domains=("${_batch_queue_domains[@]:1}")
      phase_detail "Batch queue: using queued finding (${#_batch_queue_findings[@]} remaining)"
      # Override phase sequence to skip batch-research (already done) but keep planning
      local _batch_seq="planning:impl:validate:commit"
      case "$(resolve_review_depth)" in
        full)  _batch_seq="planning:impl:coderabbit:review:validate:commit" ;;
        penny) _batch_seq="planning:impl:review:validate:commit" ;;
      esac
      ACTIVE_PHASE_SEQUENCE="$_batch_seq"
    fi

    # ═══════════════════════════════════════════════════════════════
    # Phase 1-B: BATCH RESEARCH — Olivia (batch-research workflow only)
    # Finds N improvements; queues them for subsequent cycle iterations.
    # ═══════════════════════════════════════════════════════════════
    if [ "$cycle_failed" = false ] && phase_is_enabled "batch-research"; then
      phase_start "🔎" "Olivia" "${MODEL_RESEARCH:-opus}" "batch-research (${BATCH_RESEARCH_COUNT} findings)..."
      local program_content_b=$(cat "$PROGRAM" 2>/dev/null | head -50)
      local batch_recent="${recent:-none yet}"
      local batch_reserved=""
      batch_reserved=$(active_reserved_work_items_context)
      local batch_gh_context=""
      if [ -n "$gh_issues" ]; then
        batch_gh_context="
GitHub Issues (consider fixing these):
$gh_issues
"
      fi
      local batch_memory=""
      batch_memory=$(render_project_memory_context)
      local batch_fixed=""
      batch_fixed=$(render_fixed_findings_context)
      if [ -n "$batch_memory" ]; then
        phase_detail "Memory: loaded project context for batch research"
      fi
      if [ -n "$batch_fixed" ]; then
        phase_detail "Memory: loaded fixed findings for batch research"
      fi
      local batch_out
      batch_out=$(call_olivia_batch "You are analyzing the codebase at $REPO to find ${BATCH_RESEARCH_COUNT} specific improvements.

CRITICAL RULES:
$(research_profile_guidance)

Program directives:
$program_content_b

Recent experiments (don't repeat these — do something DIFFERENT):
${batch_recent}
Active reserved work items (other workers are already doing these — pick something DIFFERENT):
${batch_reserved:-none}
${batch_gh_context}
$(if [ -n "$batch_memory" ]; then printf "Reusable project memory (advisory):\n%s\n" "$batch_memory"; fi)
$(if [ -n "$batch_fixed" ]; then printf "Recently FIXED findings (do NOT re-investigate these — find something NEW):\n%s\n" "$batch_fixed"; fi)
Priority order: $(research_priority_order)
Find exactly ${BATCH_RESEARCH_COUNT} DISTINCT improvements in DIFFERENT files. Each finding must target a different file.

Respond with EXACTLY (repeat the block ${BATCH_RESEARCH_COUNT} times with N=1,2,...):
FINDING_1: <one-line description>
FILE_1: <production file(s)>
DIRECTIVE_1: <bug-fix, feature, performance, security, or refactor>
DOMAIN_1: backend or frontend")

      if [ $? -ne 0 ] || [ -z "$batch_out" ]; then
        phase_set_output "${batch_out:-}"
        phase_done "fail" "Batch research failed"
        cycle_failed=true
      else
        local _bi=1
        while [ $_bi -le "$BATCH_RESEARCH_COUNT" ]; do
          local _bf _bfile _bdir _bdom
          _bf=$(printf '%s\n' "$batch_out" | extract_response_field "FINDING_${_bi}")
          _bfile=$(printf '%s\n' "$batch_out" | extract_response_field "FILE_${_bi}")
          _bdir=$(printf '%s\n' "$batch_out" | extract_response_field "DIRECTIVE_${_bi}")
          _bdom=$(printf '%s\n' "$batch_out" | extract_response_field "DOMAIN_${_bi}" | awk '{print $1}')
          [ -z "$_bdom" ] && _bdom="backend"
          if [ -n "$_bf" ]; then
            # Try to reserve this finding to prevent other workers from duplicating it
            if reserve_cycle_work_item "${exp_id}-batch-${_bi}" "$_bf" "${_bfile:-}" ""; then
              _batch_queue_findings+=("$_bf")
              _batch_queue_files+=("${_bfile:-}")
              _batch_queue_directives+=("${_bdir:-unknown}")
              _batch_queue_domains+=("$_bdom")
            else
              phase_detail "Batch finding $_bi skipped (reserved by another worker: ${_RESERVATION_CONFLICT:-})"
            fi
          fi
          _bi=$((_bi + 1))
        done
        # Pop first finding into active variables for this cycle
        if [ "${#_batch_queue_findings[@]}" -gt 0 ]; then
          finding="${_batch_queue_findings[0]}"
          target_file="${_batch_queue_files[0]}"
          directive="${_batch_queue_directives[0]}"
          domain="${_batch_queue_domains[0]}"
          _batch_queue_findings=("${_batch_queue_findings[@]:1}")
          _batch_queue_files=("${_batch_queue_files[@]:1}")
          _batch_queue_directives=("${_batch_queue_directives[@]:1}")
          _batch_queue_domains=("${_batch_queue_domains[@]:1}")
          # Switch to planning+impl sequence (skip batch-research, keep planning)
          local _bseq="planning:impl:validate:commit"
          case "$(resolve_review_depth)" in
            full)  _bseq="planning:impl:coderabbit:review:validate:commit" ;;
            penny) _bseq="planning:impl:review:validate:commit" ;;
          esac
          ACTIVE_PHASE_SEQUENCE="$_bseq"
        fi
        phase_set_output "$batch_out"
        phase_done "ok" "${#_batch_queue_findings[@]} findings queued (processing first now)"
      fi
      cblank
    fi

    # ═══════════════════════════════════════════════════════════════
    # Phase 1: RESEARCH — Olivia
    # ═══════════════════════════════════════════════════════════════
    if [ "$cycle_failed" = false ] && phase_is_enabled "research"; then
    phase_start "🔎" "Olivia" "${MODEL_RESEARCH:-opus}" "researching..."
    local program_content=$(cat "$PROGRAM" 2>/dev/null | head -50)
    local gh_context=""
    local project_memory_context=""
    if [ -n "$gh_issues" ]; then
      gh_context="
GitHub Issues (consider fixing these — they come directly from users/maintainers):
$gh_issues
"
    fi
    project_memory_context=$(render_project_memory_context)
    if [ -n "$project_memory_context" ]; then
      phase_detail "Memory: loaded reusable project context"
    fi
    local fixed_findings_context=""
    fixed_findings_context=$(render_fixed_findings_context)
    if [ -n "$fixed_findings_context" ]; then
      phase_detail "Memory: loaded ${#fixed_findings_context} chars of fixed findings"
    fi
    local research_out=""
    local research_attempt=1
    local max_research_attempts=3
    local research_ok=0
    while [ $research_attempt -le $max_research_attempts ]; do
      local reserved_context
      reserved_context=$(active_reserved_work_items_context)
      local _research_prompt_override
      if _research_prompt_override=$(load_prompt "research-$(team_profile_label)" \
          "REPO=$REPO" "PROGRAM_CONTENT=$program_content" \
          "PROFILE_GUIDANCE=$(research_profile_guidance)" \
          "RECENT=${recent:-none yet}" "GH_CONTEXT=$gh_context" \
          "RESERVED_CONTEXT=${reserved_context:-none}" \
          "MEMORY_CONTEXT=$(if [ -n "$project_memory_context" ]; then printf "Reusable project memory (advisory; ignore if stale or irrelevant):\n%s" "$project_memory_context"; fi)" \
          "FIXED_FINDINGS=$(if [ -n "$fixed_findings_context" ]; then printf "Recently FIXED findings (do NOT re-investigate these — find something NEW):\n%s" "$fixed_findings_context"; fi)" \
          "PRIORITY_ORDER=$(research_priority_order)"); then
        research_out=$(call_olivia "$_research_prompt_override")
      else
      research_out=$(call_olivia "You are analyzing the codebase at $REPO to find ONE specific improvement.

CRITICAL RULES:
$(research_profile_guidance)

Program directives (read carefully):
$program_content

Recent experiments (don't repeat these — do something DIFFERENT):
${recent:-none yet}
Active reserved work items:
${reserved_context:-none}
${gh_context}
$(if [ -n "$project_memory_context" ]; then printf "Reusable project memory (advisory; ignore if stale or irrelevant):\n%s\n" "$project_memory_context"; fi)
$(if [ -n "$fixed_findings_context" ]; then printf "Recently FIXED findings (do NOT re-investigate these — find something NEW):\n%s\n" "$fixed_findings_context"; fi)
Priority order: $(research_priority_order)
Only suggest adding tests if you're ALSO fixing a bug that needs a regression test.

Respond with EXACTLY:
FINDING: <one-line description of the BUG FIX or FEATURE IMPROVEMENT>
FILE: <production file(s) to change — NOT test files>
DIRECTIVE: <bug-fix, feature, performance, security, or refactor>
DOMAIN: backend or frontend
ISSUE: <GitHub issue number if addressing one, or none>")
      fi # end prompt template override
      if [ $? -ne 0 ] || [ -z "$research_out" ]; then
        break
      fi
      finding=$(printf '%s\n' "$research_out" | extract_response_field "FINDING")
      target_file=$(printf '%s\n' "$research_out" | extract_response_field "FILE")
      directive=$(printf '%s\n' "$research_out" | extract_response_field "DIRECTIVE")
      domain=$(printf '%s\n' "$research_out" | extract_response_field "DOMAIN" | awk '{print $1}')
      gh_issue_num=$(printf '%s\n' "$research_out" | extract_response_field "ISSUE" | grep -oE '[0-9]+' | head -1)
      [ -z "$finding" ] && finding=$(echo "$research_out" | head -2 | tr '\n' ' ' | cut -c1-80)
      [ -z "$directive" ] && directive="unknown"
      if [ -z "$domain" ]; then
        if echo "$target_file" | grep -qi "web/\|viewer-web/\|\.tsx\|\.css\|component\|page"; then
          domain="frontend"
        else
          domain="backend"
        fi
      fi

      reserve_cycle_work_item "$exp_id" "$finding" "$target_file" "$gh_issue_num"
      local reservation_status=$?
      if [ "$reservation_status" -eq 0 ]; then
        if [ "$(team_profile_label)" = "issue-burner" ] && [ -n "$gh_issues" ] && [ -z "$gh_issue_num" ]; then
          research_out="${research_out}

Issue-burner profile requires selecting a real open issue when issue context is available."
        elif [ "$(team_profile_label)" = "issue-burner" ] && [ -z "$gh_issues" ] && [ -z "$gh_issue_num" ]; then
          research_out="${research_out}

ISSUE_BURNER_FALLBACK: no open GitHub issues available; falling back to the best scoped bug fix"
        fi
        research_ok=1
        break
      fi
      if [ "$reservation_status" -eq 2 ]; then
        research_out="${research_out}

Reservation lock failed."
        break
      fi
      if [ $research_attempt -lt $max_research_attempts ]; then
        phase_detail "Research conflicted with active work ($_RESERVATION_CONFLICT) — retrying"
      fi
      research_attempt=$((research_attempt + 1))
    done

    if [ "$research_ok" -eq 0 ] && [ -z "$CURRENT_RESERVATION_FILE" ] && [ -n "$research_out" ] && [ -n "${_RESERVATION_CONFLICT:-}" ]; then
      phase_set_output "$research_out"
      phase_done "fail" "Duplicate active work: ${_RESERVATION_CONFLICT}"
      cycle_failed=true
    elif [ "$research_ok" -eq 0 ] || [ -z "$research_out" ]; then
      phase_set_output "${research_out:-}"
      phase_done "fail" "Olivia failed"
      cycle_failed=true
    else
      phase_set_output "$research_out"
      phase_done "ok" "$finding"
      phase_detail "Target: ${target_file:-?}  Domain: $domain"
      if [ "$(team_profile_label)" = "issue-burner" ] && [ -n "$gh_issue_num" ]; then
        phase_detail "Issue: #$gh_issue_num"
      elif [ "$(team_profile_label)" = "issue-burner" ] && [ -z "$gh_issues" ]; then
        phase_detail "Fallback: no open issues available"
      fi
    fi
    cblank
    fi # end phase: research

    # ═══════════════════════════════════════════════════════════════
    # Phase 2: PLANNING — Claude (best reasoning)
    # ═══════════════════════════════════════════════════════════════
    if [ "$cycle_failed" = false ] && phase_is_enabled "planning"; then
      phase_start "🧭" "Jessica" "${MODEL_PLANNING:-opus}" "planning..."
      local plan_out
      local file_memory_context=""
      file_memory_context=$(render_file_memory_context "$target_file")
      if [ -n "$file_memory_context" ]; then
        phase_detail "Memory: loaded file context for planning"
      fi
      local planning_response_format="GOAL: <what this achieves>
CHANGES: <specific changes to make>
ACCEPTANCE: <how to verify>"
      case "$(team_profile_label)" in
        performance)
          planning_response_format="$planning_response_format
DIMENSION: <latency, memory, bundle, query count, or render cost>"
          ;;
        test-hardening)
          planning_response_format="$planning_response_format
BUG: <real production defect being fixed>
REGRESSION_SURFACE: <test or behavior surface that will guard it>"
          ;;
        frontend-quality)
          planning_response_format="$planning_response_format
SURFACE: <user-facing surface>
DEFECT_CLASS: <accessibility, interaction, responsive, or visual>"
          ;;
        dependency-hygiene)
          planning_response_format="$planning_response_format
RISK_TYPE: <vulnerability, license, install/policy, or supply-chain drift>"
          ;;
        api-contract)
          planning_response_format="$planning_response_format
CONTRACT_SURFACE: <request schema, response shape, webhook payload, or serialization boundary>"
          ;;
        data-integrity)
          planning_response_format="$planning_response_format
INTEGRITY_MODE: <race, idempotency, lost update, duplicate write, or partial state>"
          ;;
        privacy-compliance)
          planning_response_format="$planning_response_format
PRIVACY_RISK: <PII exposure, logging, retention, redaction, or consent>"
          ;;
        mobile-quality)
          planning_response_format="$planning_response_format
MOBILE_SURFACE: <touch, navigation, permissions, offline/error, or layout>"
          ;;
        refactor-safety)
          planning_response_format="$planning_response_format
SIMPLIFICATION_TARGET: <what is being simplified>
BEHAVIOR_BOUNDARY: <what behavior must remain unchanged>"
          ;;
      esac
      local _planning_prompt_override
      if _planning_prompt_override=$(load_prompt "planning-$(team_profile_label)" \
          "REPO=$REPO" "FINDING=$finding" "TARGET_FILE=$target_file" \
          "PROFILE_GUIDANCE=$(planning_profile_guidance)" \
          "FILE_MEMORY_CONTEXT=$(if [ -n "$file_memory_context" ]; then printf "Reusable file memory (advisory; ignore if stale or irrelevant):\n%s" "$file_memory_context"; fi)" \
          "PLANNING_RESPONSE_FORMAT=$planning_response_format"); then
        plan_out=$(call_claude_opus "$_planning_prompt_override")
      else
      plan_out=$(call_claude_opus "Plan an atomic $(team_profile_label) code change for the project at $REPO.

Finding: $finding
Target: $target_file

$(planning_profile_guidance)
$(if [ -n "$file_memory_context" ]; then printf "Reusable file memory (advisory; ignore if stale or irrelevant):\n%s\n" "$file_memory_context"; fi)

Create a scoped plan completable in one change. Respond EXACTLY:
$planning_response_format")
      fi # end prompt template override

      if [ $? -ne 0 ] || [ -z "$plan_out" ]; then
        phase_set_output "${plan_out:-}"
        phase_done "fail" "Claude failed"
        cycle_failed=true
      else
        goal=$(printf '%s\n' "$plan_out" | extract_response_field "GOAL")
        acceptance=$(printf '%s\n' "$plan_out" | extract_response_field "ACCEPTANCE")
        local performance_dimension=""
        local test_hardening_bug=""
        local test_hardening_surface=""
        local frontend_surface=""
        local frontend_defect_class=""
        local dependency_risk_type=""
        local api_contract_surface=""
        local data_integrity_mode=""
        local privacy_risk=""
        local mobile_surface=""
        local refactor_target=""
        local refactor_boundary=""
        case "$(team_profile_label)" in
          performance)
            performance_dimension=$(printf '%s\n' "$plan_out" | extract_response_field "DIMENSION")
            if ! printf "%s" "$performance_dimension" | grep -qiE '^(latency|memory|bundle|query count|render cost)([[:space:][:punct:]].*)?$'; then
              phase_set_output "$plan_out"
              phase_done "fail" "Missing optimization dimension"
              cycle_failed=true
            fi
            ;;
          test-hardening)
            test_hardening_bug=$(printf '%s\n' "$plan_out" | extract_response_field "BUG")
            test_hardening_surface=$(printf '%s\n' "$plan_out" | extract_response_field "REGRESSION_SURFACE")
            if [ -z "$test_hardening_bug" ] || [ -z "$test_hardening_surface" ]; then
              phase_set_output "$plan_out"
              phase_done "fail" "Missing bug or regression surface"
              cycle_failed=true
            fi
            ;;
          frontend-quality)
            frontend_surface=$(printf '%s\n' "$plan_out" | extract_response_field "SURFACE")
            frontend_defect_class=$(printf '%s\n' "$plan_out" | extract_response_field "DEFECT_CLASS")
            if [ -z "$frontend_surface" ] || ! printf "%s" "$frontend_defect_class" | grep -qiE '^(accessibility|interaction|responsive|visual)([[:space:][:punct:]].*)?$'; then
              phase_set_output "$plan_out"
              phase_done "fail" "Missing frontend surface or defect class"
              cycle_failed=true
            fi
            ;;
          dependency-hygiene)
            dependency_risk_type=$(printf '%s\n' "$plan_out" | extract_response_field "RISK_TYPE")
            if ! printf "%s" "$dependency_risk_type" | grep -qiE '^(vulnerability|license|install/policy|supply-chain drift)([[:space:][:punct:]].*)?$'; then
              phase_set_output "$plan_out"
              phase_done "fail" "Missing dependency risk type"
              cycle_failed=true
            fi
            ;;
          api-contract)
            api_contract_surface=$(printf '%s\n' "$plan_out" | extract_response_field "CONTRACT_SURFACE")
            if ! printf "%s" "$api_contract_surface" | grep -qiE '^(request schema|response shape|webhook payload|serialization boundary)([[:space:][:punct:]].*)?$'; then
              phase_set_output "$plan_out"
              phase_done "fail" "Missing contract surface"
              cycle_failed=true
            fi
            ;;
          data-integrity)
            data_integrity_mode=$(printf '%s\n' "$plan_out" | extract_response_field "INTEGRITY_MODE")
            if ! printf "%s" "$data_integrity_mode" | grep -qiE '^(race|idempotency|lost update|duplicate write|partial state)([[:space:][:punct:]].*)?$'; then
              phase_set_output "$plan_out"
              phase_done "fail" "Missing integrity mode"
              cycle_failed=true
            fi
            ;;
          privacy-compliance)
            privacy_risk=$(printf '%s\n' "$plan_out" | extract_response_field "PRIVACY_RISK")
            if ! printf "%s" "$privacy_risk" | grep -qiE '^(PII exposure|logging|retention|redaction|consent)([[:space:][:punct:]].*)?$'; then
              phase_set_output "$plan_out"
              phase_done "fail" "Missing privacy risk"
              cycle_failed=true
            fi
            ;;
          mobile-quality)
            mobile_surface=$(printf '%s\n' "$plan_out" | extract_response_field "MOBILE_SURFACE")
            if ! printf "%s" "$mobile_surface" | grep -qiE '^(touch|navigation|permissions|offline/error|layout)([[:space:][:punct:]].*)?$'; then
              phase_set_output "$plan_out"
              phase_done "fail" "Missing mobile surface"
              cycle_failed=true
            fi
            ;;
          refactor-safety)
            refactor_target=$(printf '%s\n' "$plan_out" | extract_response_field "SIMPLIFICATION_TARGET")
            refactor_boundary=$(printf '%s\n' "$plan_out" | extract_response_field "BEHAVIOR_BOUNDARY")
            if [ -z "$refactor_target" ] || [ -z "$refactor_boundary" ]; then
              phase_set_output "$plan_out"
              phase_done "fail" "Missing refactor target or behavior boundary"
              cycle_failed=true
            fi
            ;;
        esac
        [ -z "$goal" ] && goal=$(echo "$plan_out" | head -2 | tr '\n' ' ' | cut -c1-60)
        if [ "$cycle_failed" = false ]; then
          phase_set_output "$plan_out"
          phase_done "ok" "$goal"
          [ -n "$acceptance" ] && phase_detail "Criteria: $acceptance"
          [ -n "$performance_dimension" ] && phase_detail "Dimension: $performance_dimension"
          [ -n "$test_hardening_bug" ] && phase_detail "Bug: $test_hardening_bug"
          [ -n "$test_hardening_surface" ] && phase_detail "Regression surface: $test_hardening_surface"
          [ -n "$frontend_surface" ] && phase_detail "Surface: $frontend_surface"
          [ -n "$frontend_defect_class" ] && phase_detail "Defect class: $frontend_defect_class"
          [ -n "$dependency_risk_type" ] && phase_detail "Risk: $dependency_risk_type"
          [ -n "$api_contract_surface" ] && phase_detail "Contract: $api_contract_surface"
          [ -n "$data_integrity_mode" ] && phase_detail "Integrity: $data_integrity_mode"
          [ -n "$privacy_risk" ] && phase_detail "Privacy: $privacy_risk"
          [ -n "$mobile_surface" ] && phase_detail "Mobile surface: $mobile_surface"
          [ -n "$refactor_target" ] && phase_detail "Target: $refactor_target"
          [ -n "$refactor_boundary" ] && phase_detail "Boundary: $refactor_boundary"
        fi
      fi
      cblank
    fi # end phase: planning

    # ═══════════════════════════════════════════════════════════════
    # Phase 3: IMPLEMENTATION — Codex or Claude model
    # ═══════════════════════════════════════════════════════════════
    if [ "$cycle_failed" = false ] && phase_is_enabled "impl"; then
      local impl_validation=$(validation_prompt_instructions)
      local performance_impl_addendum=""
      case "$(team_profile_label)" in
        performance)
          performance_impl_addendum="
Optimization dimension: ${performance_dimension:-unknown}

At the end of your response include EXACTLY one line in one of these forms:
PERFORMANCE_EVIDENCE: measured evidence was run
PERFORMANCE_EVIDENCE: focused code-level evidence only — <why no perf command was relevant>"
          ;;
        test-hardening)
          performance_impl_addendum="
At the end of your response include EXACTLY:
TEST_EVIDENCE: <how the real bug and regression surface were verified>"
          ;;
        dependency-hygiene)
          performance_impl_addendum="
At the end of your response include EXACTLY:
DEPENDENCY_SURFACE: <package, lockfile, or policy surface changed>"
          ;;
      esac
      local impl_prompt="Implement this change in the repo at $REPO:

Goal: $goal
Finding: $finding
Target: $target_file
Acceptance: $acceptance

Make the code changes. Keep them minimal and scoped.
$(implementation_profile_guidance)
$performance_impl_addendum
$impl_validation"

      # Allow prompt template override
      local _impl_prompt_override
      if _impl_prompt_override=$(load_prompt "impl-$(team_profile_label)" \
          "REPO=$REPO" "GOAL=$goal" "FINDING=$finding" \
          "TARGET_FILE=$target_file" "ACCEPTANCE=$acceptance" \
          "PROFILE_GUIDANCE=$(implementation_profile_guidance)" \
          "PROFILE_ADDENDUM=$performance_impl_addendum" \
          "IMPL_VALIDATION=$impl_validation"); then
        impl_prompt="$_impl_prompt_override"
      fi

      local impl_out
      if [ -n "${MODEL_IMPL:-}" ]; then
        # ── Claude model implementation (when AUTOCLAWDEV_IMPL_MODEL is set) ──
        if [ "$domain" = "frontend" ]; then
          phase_start "🎨" "Jerry" "$MODEL_IMPL" "frontend impl..."
          impl_out=$(call_impl_claude "Jerry" "You are a frontend specialist working on $REPO.
SCOPE: Only modify files in apps/web/ or apps/viewer-web/. Focus on React, TypeScript, Tailwind, TanStack Router.

$impl_prompt")
        else
          phase_start "🛠️" "Terry" "$MODEL_IMPL" "backend impl..."
          impl_out=$(call_impl_claude "Terry" "$impl_prompt")
        fi
      elif [ "$domain" = "frontend" ]; then
        # ── Jerry (Codex) handles frontend/UI ──
        phase_start "🎨" "Jerry" "codex ${CODEX_MODEL}" "frontend impl..."
        impl_out=$(call_jerry "You are a frontend specialist working on $REPO.
SCOPE: Only modify files in apps/web/ or apps/viewer-web/. Focus on React, TypeScript, Tailwind, TanStack Router.

$impl_prompt")
      else
        # ── Terry (Codex) handles backend/server ──
        phase_start "🛠️" "Terry" "codex ${CODEX_MODEL}" "backend impl..."
        impl_out=$(call_terry "$impl_prompt")
      fi

      if [ $? -ne 0 ]; then
        phase_set_output "${impl_out:-}"
        phase_done "fail" "Implementation failed"
        cycle_failed=true
      else
        local performance_evidence=""
        local test_hardening_evidence=""
        local dependency_surface=""
        case "$(team_profile_label)" in
          performance)
            performance_evidence=$(printf '%s\n' "$impl_out" | extract_response_field "PERFORMANCE_EVIDENCE")
            if [ -z "$performance_evidence" ]; then
              phase_set_output "$impl_out"
              phase_done "fail" "Missing performance evidence"
              cycle_failed=true
            fi
            ;;
          test-hardening)
            test_hardening_evidence=$(printf '%s\n' "$impl_out" | extract_response_field "TEST_EVIDENCE")
            if [ -z "$test_hardening_evidence" ]; then
              phase_set_output "$impl_out"
              phase_done "fail" "Missing test evidence"
              cycle_failed=true
            fi
            ;;
          dependency-hygiene)
            dependency_surface=$(printf '%s\n' "$impl_out" | extract_response_field "DEPENDENCY_SURFACE")
            if [ -z "$dependency_surface" ]; then
              phase_set_output "$impl_out"
              phase_done "fail" "Missing dependency surface"
              cycle_failed=true
            fi
            ;;
        esac
        changes_made=$(echo "$impl_out" | tail -5 | tr '\n' ' ' | cut -c1-80)
        [ -z "$changes_made" ] && changes_made="$goal"
        local diff_size=$(cd "$REPO" && git diff 2>/dev/null | wc -l | tr -d ' ')
        local new_files=$(cd "$REPO" && git status --porcelain 2>/dev/null | grep "^?" | wc -l | tr -d ' ')
        local total_changes=$((diff_size + new_files))
        local refactor_safety_violation=""
        if [ "$cycle_failed" = false ] && [ "$(team_profile_label)" = "refactor-safety" ]; then
          refactor_safety_violation=$(cd "$REPO" && git diff --name-only --diff-filter=ACMRTUXB HEAD -- 2>/dev/null | grep -E '(^|/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|npm-shrinkwrap\.json)$|(^|/)(migrations?|scripts/supabase/|supabase/migrations/)|^packages/contracts/|(^|/)(contract|schema)s?/' | head -1 || true)
        fi
        if [ "$cycle_failed" = false ] && [ "$total_changes" -eq 0 ]; then
          phase_set_output "$impl_out"
          phase_done "fail" "No changes made"
          cycle_failed=true
        elif [ "$cycle_failed" = false ] && [ -n "$refactor_safety_violation" ]; then
          phase_set_output "$impl_out"
          phase_done "fail" "Unsafe refactor scope"
          phase_detail "Blocked file: $refactor_safety_violation"
          cycle_failed=true
        elif [ "$cycle_failed" = false ]; then
          phase_set_output "$impl_out"
          phase_done "ok" "$changes_made"
          phase_detail "$diff_size lines changed, $new_files new files"
          [ -n "$performance_evidence" ] && phase_detail "Evidence: $performance_evidence"
          [ -n "$test_hardening_evidence" ] && phase_detail "Evidence: $test_hardening_evidence"
          [ -n "$dependency_surface" ] && phase_detail "Dependency surface: $dependency_surface"
          # Adjust review pipeline based on actual diff size and finding type
          resolve_dynamic_phase_config "$directive" "$domain" "$diff_size"
        fi
      fi
      cblank
    fi # end phase: impl

    # ═══════════════════════════════════════════════════════════════
    # Phase 3.5: CODERABBIT REVIEW + CLAUDE FIX LOOP
    # ═══════════════════════════════════════════════════════════════
    local skip_penny_review=false
    if [ "$cycle_failed" = false ] && phase_is_enabled "coderabbit"; then
      local cr_round=1 cr_max=$CODERABBIT_MAX_ROUNDS cr_clean=false cr_last_verdict=""
      local cr_cooldown_file="$WORKSPACE/.cr-cooldown-${PROJECT_KEY}"

      # Check CodeRabbit rate-limit cooldown
      if [ -f "$cr_cooldown_file" ]; then
        local cr_cooldown_until
        cr_cooldown_until=$(cat "$cr_cooldown_file" 2>/dev/null || echo 0)
        if [ "$(date +%s)" -lt "$cr_cooldown_until" ]; then
          phase_start "🐰" "Review" "coderabbit" "rate-limited..."
          phase_done "ok" "CodeRabbit rate-limited — skipped (cooldown until $(date -r "$cr_cooldown_until" +%H:%M 2>/dev/null || echo '?'))"
          cr_clean=true
          cr_last_verdict="clean"
        else
          rm -f "$cr_cooldown_file"
        fi
      fi

      while [ $cr_round -le $cr_max ] && [ "$cr_clean" = false ]; do
        phase_start "🐰" "Review" "coderabbit" "round $cr_round/$cr_max..."
        local cr_output
        cr_output=$(call_coderabbit)
        local cr_exit=$?
        local cr_parsed cr_issues cr_verdict cr_findings
        cr_parsed=$(printf '%s' "$cr_output" | parse_coderabbit_review)
        cr_issues=$(echo "$cr_parsed" | python3 -c "import json,sys; print(json.load(sys.stdin).get('count', 0))" 2>/dev/null || echo 0)
        cr_verdict=$(echo "$cr_parsed" | python3 -c "import json,sys; print(json.load(sys.stdin).get('verdict', 'unavailable'))" 2>/dev/null || echo unavailable)
        cr_findings=$(echo "$cr_parsed" | python3 -c "import json,sys; data=json.load(sys.stdin); print('\n'.join(f'- {item}' for item in data.get('findings', [])[:5]))" 2>/dev/null || true)
        cr_last_verdict="$cr_verdict"

        # Detect rate-limit and set cooldown for remaining cycles
        if echo "$cr_output" | grep -qi "rate limit\|rate_limit\|429\|too many requests"; then
          local cooldown_seconds=900 # 15 min default
          local extracted_seconds
          extracted_seconds=$(echo "$cr_output" | grep -oE '[0-9]+ minutes?' | head -1 | grep -oE '[0-9]+' || true)
          [ -n "$extracted_seconds" ] && cooldown_seconds=$(( extracted_seconds * 60 + 60 ))
          echo "$(( $(date +%s) + cooldown_seconds ))" > "$cr_cooldown_file"
          phase_set_output "${cr_output:-}"
          phase_done "ok" "CodeRabbit rate-limited — skipped (cooldown ${cooldown_seconds}s)"
          cr_clean=true
          cr_last_verdict="clean"
        elif [ $cr_exit -ne 0 ]; then
          phase_set_output "${cr_output:-}"
          phase_done "ok" "CodeRabbit unavailable — skipped"
          cr_clean=true
        elif [ "$cr_verdict" = "clean" ] || [ "$cr_issues" -eq 0 ]; then
          phase_set_output "$cr_output"
          phase_done "ok" "Clean"
          cr_clean=true
        else
          phase_set_output "$cr_output"
          phase_done "fail" "$cr_issues potential issues"
          if [ $cr_round -lt $cr_max ]; then
            phase_start "🔧" "Fix" "codex spark" "fixing CR issues..."
            local fix_out
            local cr_validation=$(validation_prompt_instructions)
            fix_out=$(call_fix_agent "Fix these CodeRabbit issues in the repo at $REPO:

${cr_findings:-$cr_output}

Read the files, fix the issues, and verify the relevant paths.
$cr_validation")
            if [ $? -ne 0 ]; then
              phase_set_output "${fix_out:-}"
              phase_done "fail" "Codex Spark couldn't fix"
              cycle_failed=true; cr_clean=true
            else
              phase_set_output "$fix_out"
              phase_done "ok" "Fixes applied"
              changes_made="$changes_made + CR fixes"
            fi
          else
            phase_detail "Max rounds — moving on"
            cr_clean=true
          fi
        fi
        cr_round=$((cr_round + 1))
      done
      if [ "$cycle_failed" = false ] && [ "$cr_last_verdict" = "clean" ] && should_skip_penny_after_clean_coderabbit; then
        skip_penny_review=true
      fi
      cblank
    fi # end phase: coderabbit

    # ═══════════════════════════════════════════════════════════════
    # Phase 4: DEEP REVIEW — Claude (active reviewer + fixer)
    # ═══════════════════════════════════════════════════════════════
    if [ "$cycle_failed" = false ] && phase_is_enabled "review" && [ "$skip_penny_review" = true ]; then
      phase_start "🧐" "Penny" "${MODEL_REVIEW:-opus}" "deep review + fixes..."
      phase_set_output "Skipped Penny because CodeRabbit returned a clean review and AUTOCLAWDEV_SPEED_PROFILE=fast (or AUTOCLAWDEV_SKIP_PENNY_ON_CLEAN_CODERABBIT=1)."
      phase_done "ok" "Skipped after clean CodeRabbit review"
      cblank
    elif [ "$cycle_failed" = false ] && phase_is_enabled "review"; then
      phase_start "🧐" "Penny" "${MODEL_REVIEW:-opus}" "deep review + fixes..."
      local diff_content=$(cd "$REPO" && git diff 2>/dev/null | head -200)
      local review_validation=$(validation_prompt_instructions)
      local review_out
      local review_response_format="VERDICT: approve or reject
FIXES_MADE: <what you fixed, or none>
REMAINING_ISSUES: <unfixable issues, or none>"
      case "$(team_profile_label)" in
        performance)
          review_response_format="$review_response_format
PERFORMANCE_EVIDENCE_REVIEW: <measured evidence was run OR focused code-level evidence only — why no perf command was relevant>"
          ;;
        test-hardening)
          review_response_format="$review_response_format
TEST_HARDENING_REVIEW: <confirm real production bug was fixed and regression coverage is targeted>"
          ;;
        frontend-quality)
          review_response_format="$review_response_format
FRONTEND_QUALITY_REVIEW: <explicit accessibility and responsive regression assessment>"
          ;;
        api-contract)
          review_response_format="$review_response_format
API_CONTRACT_REVIEW: <explicit contract compatibility assessment>"
          ;;
        data-integrity)
          review_response_format="$review_response_format
DATA_INTEGRITY_REVIEW: <explicit rollback and partial-failure assessment>"
          ;;
        privacy-compliance)
          review_response_format="$review_response_format
PRIVACY_REVIEW: <explicit data exposure and logging assessment>"
          ;;
        mobile-quality)
          review_response_format="$review_response_format
MOBILE_REVIEW: <explicit device-specific regression assessment>"
          ;;
      esac
      local _review_prompt_override
      if _review_prompt_override=$(load_prompt "review-$(team_profile_label)" \
          "REPO=$REPO" "GOAL=$goal" "ACCEPTANCE=$acceptance" \
          "DIFF_CONTENT=$diff_content" \
          "PROFILE_GUIDANCE=$(review_profile_guidance)" \
          "REVIEW_VALIDATION=$review_validation" \
          "REVIEW_RESPONSE_FORMAT=$review_response_format"); then
        review_out=$(call_penny_with_retry "$_review_prompt_override")
      else
      review_out=$(call_penny_with_retry "Deep $(team_profile_label) code review of changes at $REPO.

Goal: $goal
Acceptance: $acceptance

Current diff:
$diff_content

$(review_profile_guidance)If you find fixable issues — fix them directly in the files.
$review_validation

Respond EXACTLY:
$review_response_format")
      fi # end prompt template override

      if [ $? -ne 0 ]; then
        phase_set_output "${review_out:-}"
        phase_done "fail" "Review failed"
        cycle_failed=true
      else
        if [ -z "$(printf '%s' "$review_out" | tr -d '[:space:]')" ]; then
          phase_set_output "${review_out:-}"
          phase_done "fail" "Empty review response"
          cycle_failed=true
        else
          verdict=$(printf '%s\n' "$review_out" | extract_response_field "VERDICT" | awk '{print $1}')
        local fixes=$(printf '%s\n' "$review_out" | extract_response_field "FIXES_MADE")
        local performance_review_evidence=""
        local test_hardening_review=""
        local frontend_quality_review=""
        local api_contract_review=""
        local data_integrity_review=""
        local privacy_review=""
        local mobile_review=""
        case "$(team_profile_label)" in
          performance)
            performance_review_evidence=$(printf '%s\n' "$review_out" | extract_response_field "PERFORMANCE_EVIDENCE_REVIEW")
            if [ -z "$performance_review_evidence" ]; then
              phase_set_output "$review_out"
              phase_done "fail" "Missing performance review evidence"
              cycle_failed=true
            fi
            ;;
          test-hardening)
            test_hardening_review=$(printf '%s\n' "$review_out" | extract_response_field "TEST_HARDENING_REVIEW")
            if [ -z "$test_hardening_review" ]; then
              phase_set_output "$review_out"
              phase_done "fail" "Missing test-hardening review"
              cycle_failed=true
            fi
            ;;
          frontend-quality)
            frontend_quality_review=$(printf '%s\n' "$review_out" | extract_response_field "FRONTEND_QUALITY_REVIEW")
            if [ -z "$frontend_quality_review" ]; then
              phase_set_output "$review_out"
              phase_done "fail" "Missing frontend quality review"
              cycle_failed=true
            fi
            ;;
          api-contract)
            api_contract_review=$(printf '%s\n' "$review_out" | extract_response_field "API_CONTRACT_REVIEW")
            if [ -z "$api_contract_review" ]; then
              phase_set_output "$review_out"
              phase_done "fail" "Missing api contract review"
              cycle_failed=true
            fi
            ;;
          data-integrity)
            data_integrity_review=$(printf '%s\n' "$review_out" | extract_response_field "DATA_INTEGRITY_REVIEW")
            if [ -z "$data_integrity_review" ]; then
              phase_set_output "$review_out"
              phase_done "fail" "Missing data integrity review"
              cycle_failed=true
            fi
            ;;
          privacy-compliance)
            privacy_review=$(printf '%s\n' "$review_out" | extract_response_field "PRIVACY_REVIEW")
            if [ -z "$privacy_review" ]; then
              phase_set_output "$review_out"
              phase_done "fail" "Missing privacy review"
              cycle_failed=true
            fi
            ;;
          mobile-quality)
            mobile_review=$(printf '%s\n' "$review_out" | extract_response_field "MOBILE_REVIEW")
            if [ -z "$mobile_review" ]; then
              phase_set_output "$review_out"
              phase_done "fail" "Missing mobile review"
              cycle_failed=true
            fi
            ;;
        esac
        [ -z "$verdict" ] && verdict="approve"

        if [ "$cycle_failed" = false ] && [ "$verdict" = "reject" ]; then
          local remaining=$(printf '%s\n' "$review_out" | extract_response_field "REMAINING_ISSUES")
          phase_set_output "$review_out"
          phase_done "fail" "Rejected: ${remaining:-review rejected}"
          cycle_failed=true
        elif [ "$cycle_failed" = false ] && review_fixes_indicate_actual_changes "$fixes"; then
          phase_set_output "$review_out"
          phase_done "ok" "Fixed: $fixes"
          changes_made="$changes_made + review fixes"
          [ -n "$performance_review_evidence" ] && phase_detail "Evidence: $performance_review_evidence"
          [ -n "$test_hardening_review" ] && phase_detail "Review: $test_hardening_review"
          [ -n "$frontend_quality_review" ] && phase_detail "Review: $frontend_quality_review"
          [ -n "$api_contract_review" ] && phase_detail "Review: $api_contract_review"
          [ -n "$data_integrity_review" ] && phase_detail "Review: $data_integrity_review"
          [ -n "$privacy_review" ] && phase_detail "Review: $privacy_review"
          [ -n "$mobile_review" ] && phase_detail "Review: $mobile_review"

          # CodeRabbit on Penny's fixes
          phase_start "🐰" "Review" "coderabbit" "Penny's fixes..."
          local pcr=$(call_coderabbit)
          local pcr_parsed pcr_issues pcr_verdict
          pcr_parsed=$(printf '%s' "$pcr" | parse_coderabbit_review)
          pcr_issues=$(echo "$pcr_parsed" | python3 -c "import json,sys; print(json.load(sys.stdin).get('count', 0))" 2>/dev/null || echo 0)
          pcr_verdict=$(echo "$pcr_parsed" | python3 -c "import json,sys; print(json.load(sys.stdin).get('verdict', 'unavailable'))" 2>/dev/null || echo unavailable)
          if [ "$pcr_verdict" = "clean" ] || [ "$pcr_issues" -eq 0 ]; then
            phase_set_output "$pcr"
            phase_done "ok" "Clean"
          else
            phase_set_output "$pcr"
            phase_done "ok" "Minor ($pcr_issues) — proceeding"
          fi
        elif [ "$cycle_failed" = false ]; then
          phase_set_output "$review_out"
          phase_done "ok" "Clean — no issues"
          [ -n "$performance_review_evidence" ] && phase_detail "Evidence: $performance_review_evidence"
          [ -n "$test_hardening_review" ] && phase_detail "Review: $test_hardening_review"
          [ -n "$frontend_quality_review" ] && phase_detail "Review: $frontend_quality_review"
          [ -n "$api_contract_review" ] && phase_detail "Review: $api_contract_review"
          [ -n "$data_integrity_review" ] && phase_detail "Review: $data_integrity_review"
          [ -n "$privacy_review" ] && phase_detail "Review: $privacy_review"
          [ -n "$mobile_review" ] && phase_detail "Review: $mobile_review"
        fi
        fi
      fi
      cblank
    fi # end phase: review

    # ═══════════════════════════════════════════════════════════════
    # Phase 5: VALIDATION — test/lint/visual with retries
    # ═══════════════════════════════════════════════════════════════
    if [ "$cycle_failed" = false ] && phase_is_enabled "validate"; then
      local gate_pass=false
      local fix_attempt=0
      local max_fix_attempts=$VALIDATION_FIX_ATTEMPTS
      local validation_block_reason=""
      local validation_override_reason=""
      local validation_pass_tag=""
      local validation_commands=$(validation_command_count_for_repo "$REPO")

      while [ "$gate_pass" = false ] && [ $fix_attempt -le $max_fix_attempts ]; do
        local test_ok=true
        local lint_ok=true
        local profile_ok=true
        local visual_ok=true
        local test_errors=""
        local lint_errors=""
        local profile_errors=""
        local test_output=""
        local lint_output=""
        local profile_output=""
        local test_file="" lint_file="" profile_file="" visual_file=""
        local test_started_at=0 lint_started_at=0 profile_started_at=0 visual_started_at=0
        local visual_summary=""
        local server_html=""
        local dev_url=""
        local test_exit=0 lint_exit=0 profile_exit=0
        local active_profile_name=""
        local active_profile_label=""
        local active_profile_cmd_effective=""
        local active_profile_skip_summary=""
        local effective_test_cmd=""
        local effective_lint_cmd=""
        active_profile_name=$(active_profile_validation_name)
        active_profile_label=$(pretty_profile_label "$active_profile_name")
        effective_test_cmd=$(effective_test_command_for_repo "$REPO")
        effective_lint_cmd=$(effective_lint_command_for_repo "$REPO")

        cd "$REPO"

        if [ "$VALIDATION_MODE" = "parallel" ]; then
          phase_detail "Validation mode=parallel is deprecated for heavy repos; running serially"
        fi

        # Run tests
        test_started_at=$(date +%s)
        if [ $fix_attempt -eq 0 ]; then
          phase_emit_start "🧪" "Tests" "direct" "running suite..."
        else
          phase_emit_start "🧪" "Tests" "direct" "re-running (fix $fix_attempt/$max_fix_attempts)..."
        fi
        if [ -z "$DRY_RUN" ] && [ -n "$effective_test_cmd" ]; then
          test_file=$(mktemp "$TMPDIR/autoresearch-test-XXXXXX")
          run_command_with_timeout "$VALIDATION_TIMEOUT" "$test_file" "cd '$REPO' && $effective_test_cmd"
          test_exit=$?
          test_output=$(cat "$test_file" 2>/dev/null)
          local new_tc=$(echo "$test_output" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' | tail -1 || echo "0")
          local new_fail=$(echo "$test_output" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' | tail -1 || echo "0")
          if [ $test_exit -ne 0 ] || [ "${new_fail:-0}" -gt 0 ]; then
            phase_emit_done "Tests" "direct" "$test_started_at" "fail" "${new_fail} failures (exit $test_exit)" "$test_output"
            test_ok=false
            test_errors=$(echo "$test_output" | grep -A3 "FAIL\|Error\|failed" | head -20)
          else
            phase_emit_done "Tests" "direct" "$test_started_at" "ok" "$new_tc passed" "$test_output"
          fi
          rm -f "$test_file"
        else
          local test_skip_summary=$(validation_phase_skip_summary_for_effective_cmd "test" "$effective_test_cmd" "$TEST_CMD")
          phase_emit_done "Tests" "direct" "$test_started_at" "ok" "$test_skip_summary" "$test_skip_summary"
          test_started_at=0
        fi

        # Run lint after tests to avoid overlapping Node/Vitest memory spikes.
        lint_started_at=$(date +%s)
        phase_emit_start "🛡️" "Lint" "direct" "checking..."
        if [ -z "$DRY_RUN" ] && [ -n "$effective_lint_cmd" ]; then
          lint_file=$(mktemp "$TMPDIR/autoresearch-lint-XXXXXX")
          run_command_with_timeout "$VALIDATION_TIMEOUT" "$lint_file" "cd '$REPO' && $effective_lint_cmd"
          lint_exit=$?
          lint_output=$(cat "$lint_file" 2>/dev/null)
          lint_errors="$lint_output"
          if [ $lint_exit -eq 0 ]; then
            phase_emit_done "Lint" "direct" "$lint_started_at" "ok" "Clean" "$lint_output"
          else
            phase_emit_done "Lint" "direct" "$lint_started_at" "fail" "Lint errors" "$lint_output"
            lint_ok=false
          fi
          rm -f "$lint_file"
        else
          local lint_skip_summary=$(validation_phase_skip_summary_for_effective_cmd "lint" "$effective_lint_cmd" "$LINT_CMD")
          phase_emit_done "Lint" "direct" "$lint_started_at" "ok" "$lint_skip_summary" "$lint_skip_summary"
          lint_started_at=0
        fi

        # Run active profile validation after lint when configured/relevant.
        if [ -n "$active_profile_name" ]; then
          profile_started_at=$(date +%s)
          phase_emit_start "🧩" "$active_profile_label" "direct" "checking..."
          active_profile_cmd_effective=$(active_profile_validation_command_for_repo "$REPO" "cycle")
          if [ -z "$DRY_RUN" ] && [ -n "$active_profile_cmd_effective" ]; then
            profile_file=$(mktemp "$TMPDIR/autoresearch-profile-XXXXXX")
            local profile_changed_files
            profile_changed_files=$(repo_changed_files "$REPO")
            local profile_changed_files_quoted
            profile_changed_files_quoted=$(printf '%q' "$profile_changed_files")
            run_command_with_timeout "$VALIDATION_TIMEOUT" "$profile_file" "export AUTOCLAWDEV_CHANGED_FILES=$profile_changed_files_quoted; cd '$REPO' && $active_profile_cmd_effective"
            profile_exit=$?
            profile_output=$(cat "$profile_file" 2>/dev/null)
            profile_errors="$profile_output"
            if [ $profile_exit -eq 0 ]; then
              phase_emit_done "$active_profile_label" "direct" "$profile_started_at" "ok" "Clean" "$profile_output"
            else
              phase_emit_done "$active_profile_label" "direct" "$profile_started_at" "fail" "$active_profile_label findings" "$profile_output"
              profile_ok=false
            fi
            rm -f "$profile_file"
          else
            active_profile_skip_summary=$(active_profile_validation_skip_summary "$REPO" "$active_profile_cmd_effective")
            phase_emit_done "$active_profile_label" "direct" "$profile_started_at" "ok" "$active_profile_skip_summary" "$active_profile_skip_summary"
            profile_started_at=0
          fi
        fi

        # Optional frontend visual review runs after test/lint to keep memory bounded.
        if [ "$domain" = "frontend" ]; then
          dev_url="${DEV_SERVER_URL:-http://localhost:3000}"
          if [ -z "$DEV_SERVER_URL" ]; then
            for port in 3000 5173 5174 4200 8080; do
              if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$port" 2>/dev/null | grep -q "200"; then
                dev_url="http://localhost:$port"
                break
              fi
            done
          fi
          server_html=$(curl -s "$dev_url" 2>/dev/null | head -200)

          visual_started_at=$(date +%s)
          phase_emit_start "👁️" "Visual" "opus" "visual review..."
          if [ -n "$server_html" ] && [ -z "$DRY_RUN" ] && [ -f "$BROWSER_SNAPSHOT_SCRIPT" ] && command_available node; then
            visual_file=$(mktemp "$TMPDIR/autoresearch-visual-XXXXXX")
            (
              artifact_dir=$(mktemp -d "$TMPDIR/autoresearch-browser-XXXXXX")
              cleanup_artifacts() {
                [ -n "${artifact_dir:-}" ] && rm -rf "$artifact_dir"
              }
              trap cleanup_artifacts EXIT
              snapshot_json=$(capture_browser_snapshot "$dev_url" "$artifact_dir")
              snapshot_exit=$?

              if [ $snapshot_exit -ne 0 ] || [ -z "$snapshot_json" ]; then
                printf "VISUAL_VERDICT: concern\nVISUAL_NOTES: Browser snapshot failed\n"
                [ -n "$snapshot_json" ] && printf "%s\n" "$snapshot_json"
                exit 1
              fi

              screenshot_path=$(echo "$snapshot_json" | python3 -c "import json,sys; print(json.load(sys.stdin).get('artifact', {}).get('screenshotPath', ''))" 2>/dev/null)
              final_url=$(echo "$snapshot_json" | python3 -c "import json,sys; print(json.load(sys.stdin).get('page', {}).get('finalUrl', ''))" 2>/dev/null)
              page_title=$(echo "$snapshot_json" | python3 -c "import json,sys; print(json.load(sys.stdin).get('page', {}).get('title', ''))" 2>/dev/null)
              http_status=$(echo "$snapshot_json" | python3 -c "import json,sys; print(json.load(sys.stdin).get('page', {}).get('httpStatus', ''))" 2>/dev/null)
              text_sample=$(echo "$snapshot_json" | python3 -c "import json,sys; print(json.load(sys.stdin).get('page', {}).get('visibleTextSample', '')[:1200])" 2>/dev/null)
              snapshot_status=$(echo "$snapshot_json" | python3 -c "import json,sys; print(json.load(sys.stdin).get('assessment', {}).get('status', 'unknown'))" 2>/dev/null)
              snapshot_issues=$(echo "$snapshot_json" | python3 -c "import json,sys; print('; '.join(json.load(sys.stdin).get('assessment', {}).get('issues', [])[:5]))" 2>/dev/null)

              visual_prompt="You are reviewing a frontend application after code changes in $REPO.

Browser snapshot metadata:
- Requested URL: $dev_url
- Final URL: ${final_url:-unknown}
- Page title: ${page_title:-unknown}
- HTTP status: ${http_status:-unknown}
- Snapshot status: ${snapshot_status:-unknown}
- Snapshot issues: ${snapshot_issues:-none}

Visible text preview:
${text_sample:-none}

Changes that were made:
$changes_made

              Review the attached screenshot and metadata. Respond EXACTLY:
VISUAL_VERDICT: ok or concern
VISUAL_NOTES: <brief assessment>"
              call_olivia_visual "$visual_prompt" "$screenshot_path"
            ) > "$visual_file"
            local visual_exit=$?
            local visual_out=$(cat "$visual_file" 2>/dev/null)
            local visual_verdict=$(printf '%s\n' "$visual_out" | extract_response_field "VISUAL_VERDICT" | awk '{print $1}')
            local visual_notes=$(printf '%s\n' "$visual_out" | extract_response_field "VISUAL_NOTES")
            if [ $visual_exit -ne 0 ]; then
              phase_emit_done "Visual" "opus" "$visual_started_at" "fail" "Visual review failed" "$visual_out"
              phase_detail "Non-blocking — continuing to tests"
              visual_ok=false
            elif [ "$visual_verdict" = "concern" ]; then
              phase_emit_done "Visual" "opus" "$visual_started_at" "fail" "Visual concern: ${visual_notes:-needs review}" "$visual_out"
              phase_detail "Non-blocking — continuing to tests"
              visual_ok=false
            else
              phase_emit_done "Visual" "opus" "$visual_started_at" "ok" "${visual_notes:-Looks good}" "$visual_out"
            fi
            rm -f "$visual_file"
          else
            local visual_skip_summary=$(visual_validation_skip_reason "$server_html")
            phase_emit_done "Visual" "opus" "$visual_started_at" "ok" "$visual_skip_summary" "$visual_skip_summary"
            visual_started_at=0
          fi
        fi

        CURRENT_VALIDATION_SUMMARY=$(validation_summary_from_outputs "$test_exit" "$test_output" "$lint_exit" "$lint_output" "$active_profile_name" "$profile_exit" "$profile_output")

        # Both pass? Done.
        if [ "$validation_commands" -eq 0 ]; then
          phase_detail "No test, lint, or active profile command configured — validation gate is informational only"
          gate_pass=true
        elif [ "$test_ok" = true ] && [ "$lint_ok" = true ] && [ "$profile_ok" = true ]; then
          gate_pass=true
        elif [ "$profile_ok" = true ] && validation_matches_baseline "$baseline" "$CURRENT_VALIDATION_SUMMARY"; then
          validation_override_reason="Validation matched known baseline failures for this integration commit — proceeding with reviewed scoped fix"
          validation_pass_tag="validation baseline matched"
          phase_detail "$validation_override_reason"
          gate_pass=true
        elif [ "$profile_ok" = false ] && profile_validation_is_blocking_failure "$active_profile_name" "$profile_output"; then
          validation_block_reason="Validation failed: $(printf "%s" "$(pretty_profile_label "$active_profile_name")" | tr '[:upper:]' '[:lower:]') command is missing or unusable in the worktree"
          phase_detail "$validation_block_reason"
        elif [ "$test_ok" = false ] && [ "$lint_ok" = true ] && [ "$profile_ok" = true ] && review_indicates_preexisting_failures "$review_out"; then
          validation_override_reason="Validation hit pre-existing unrelated test failures — proceeding with reviewed scoped fix"
          validation_pass_tag="validation override"
          phase_detail "$validation_override_reason"
          gate_pass=true
        elif [ "$profile_ok" = true ] && validation_output_is_environment_issue "$test_output" "$lint_output" "$profile_output"; then
          validation_override_reason="Validation hit environment-only issues — proceeding with reviewed scoped fix"
          validation_pass_tag="validation override"
          phase_detail "$validation_override_reason"
          gate_pass=true
        elif [ "$profile_ok" = true ] && validation_output_is_broad_repo_failure "$test_output" "$lint_output" "$profile_output"; then
          validation_override_reason="Validation surfaced broad repo-wide failures — proceeding with reviewed scoped fix"
          validation_pass_tag="validation override"
          phase_detail "$validation_override_reason"
          gate_pass=true
        elif [ $fix_attempt -lt $max_fix_attempts ]; then
          # ── Fix attempt: send errors to Codex Spark ──
          fix_attempt=$((fix_attempt + 1))
          cblank

          local retry_validation
          retry_validation=$(validation_prompt_instructions "$([ "$test_ok" = false ] && printf 1 || printf 0)" "$([ "$lint_ok" = false ] && printf 1 || printf 0)" "$([ "$profile_ok" = false ] && printf 1 || printf 0)")
          local fix_prompt="Fix these validation failures in $REPO.
"
          if [ "$test_ok" = false ]; then
            fix_prompt="$fix_prompt
TEST FAILURES:
$(echo "$test_errors" | head -30)
"
          fi
          if [ "$lint_ok" = false ]; then
            fix_prompt="$fix_prompt
LINT ERRORS:
$(echo "$lint_errors" | head -30)
"
          fi
          if [ "$profile_ok" = false ] && [ -n "$active_profile_name" ]; then
            fix_prompt="$fix_prompt
$(printf "%s FINDINGS:\n" "$(printf "%s" "$active_profile_label" | tr '[:lower:]' '[:upper:]')")
$(echo "$profile_errors" | head -30)
"
          fi
          fix_prompt="$fix_prompt
Fix only the concrete failures shown above. Do not chase unrelated or pre-existing suite failures.
$retry_validation
Summarize what changed and what verification you ran."

          phase_start "🔧" "Fix" "codex spark" "fixing validation (attempt $fix_attempt)..."
          local fix_out
          fix_out=$(call_fix_agent "$fix_prompt")
          if [ $? -ne 0 ]; then
            validation_block_reason="Validation fix attempt failed"
            phase_set_output "${fix_out:-}"
            phase_done "fail" "Fix failed"
            break
          else
            local fix_summary=$(echo "$fix_out" | tail -3 | tr '\n' ' ' | cut -c1-60)
            phase_set_output "$fix_out"
            phase_done "ok" "$fix_summary"
            changes_made="$changes_made + fix attempt $fix_attempt"
          fi
          cblank
        else
          # Max retries exhausted
          fix_attempt=$((fix_attempt + 1))
          validation_block_reason=$(build_validation_failure_reason "$max_fix_attempts" "$test_ok" "$lint_ok" "$profile_ok" "$active_profile_name")
          phase_detail "$validation_block_reason"
        fi
      done

      cblank
      if [ "$gate_pass" = false ]; then
        cycle_failed=true
        [ -z "$validation_block_reason" ] && validation_block_reason=$(build_validation_failure_reason "$fix_attempt" "$test_ok" "$lint_ok" "$profile_ok" "$active_profile_name")
      elif [ -n "$validation_pass_tag" ]; then
        changes_made="$changes_made + $validation_pass_tag"
      fi
    fi # end phase: validate

    # research-only: write finding to findings log and skip remaining phases
    if [ "$(workflow_type_label)" = "research-only" ] && [ "$cycle_failed" = false ]; then
      printf "%s\n" "$finding" >> "$WORKSPACE/findings-${PROJECT_KEY}.txt"
      phase_detail "research-only: wrote finding to $WORKSPACE/findings-${PROJECT_KEY}.txt"
    fi

    # review-only: no commit needed; mark pass if review succeeded
    if ! phase_is_enabled "commit" && [ "$cycle_failed" = false ]; then
      result="pass"
      changes_made="${changes_made:-review completed}"
    fi

    # ═══════════════════════════════════════════════════════════════
    # Phase 6: COMMIT or REVERT
    # ═══════════════════════════════════════════════════════════════
    local result="${result:-fail}" commit_hash="" after_metrics="$baseline"
    local discard_reason="${validation_block_reason:-Changes discarded}"
    local cycle_changed_files=""

    cycle_changed_files=$(repo_changed_files "$REPO")

    if [ "$cycle_failed" = false ] && phase_is_enabled "commit"; then
      phase_start "🚀" "Commit" "git" "finalizing..."
      cd "$REPO"
      local dirty=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
      if [ "$dirty" -gt 0 ] && [ -z "$DRY_RUN" ]; then
        git add -A
        local clean_changes=$(echo "$changes_made" | tr -d '"' | tr '\n' ' ' | cut -c1-120)
        local commit_msg="autoresearch($exp_id): $clean_changes"
        [ -n "$gh_issue_num" ] && commit_msg="$commit_msg (fixes #$gh_issue_num)"
        if git commit -m "$commit_msg" --no-verify &>/dev/null; then
          local merge_msg="merge($exp_id): ${clean_changes}"
          [ -n "$gh_issue_num" ] && merge_msg="$merge_msg (fixes #$gh_issue_num)"
          commit_hash=$(promote_cycle_branch "$merge_msg")
          if [ $? -eq 0 ] && [ -n "$commit_hash" ]; then
            REPO="$LANDING_REPO"
            after_metrics="${_PROMOTE_METRICS_AFTER:-$baseline}"
            result="pass"
            passes=$((passes + 1))
            phase_done "ok" "Merged $CURRENT_BRANCH into $INTEGRATION_BRANCH ($commit_hash)"
          else
            cycle_failed=true
            PRESERVE_CURRENT_WORKTREE=1
            STOP_AFTER_CURRENT_CYCLE=1
            if [ "${_PROMOTE_STATUS:-failed}" = "halted" ]; then
              : > "$HALT_FILE"
              discard_reason="Run halted before merge due to preserved parallel failure"
              phase_set_output "Skipped merging $CURRENT_BRANCH because the parallel run is halted"
              phase_done "fail" "Merge halted"
            else
              : > "$HALT_FILE"
              discard_reason="Merge into integration branch failed"
              phase_set_output "Failed to merge $CURRENT_BRANCH into $INTEGRATION_BRANCH"
              phase_done "fail" "Merge failed"
            fi
            phase_detail "Preserved branch: $CURRENT_BRANCH"
            phase_detail "Preserved worktree: $CURRENT_WORKTREE"
          fi
        else
          cycle_failed=true
          discard_reason="Worktree commit failed"
          phase_done "fail" "Commit failed"
        fi
      elif [ -n "$DRY_RUN" ]; then
        result="pass"; passes=$((passes + 1))
        phase_done "ok" "[dry-run] would commit"
      else
        cycle_failed=true
        discard_reason="No changes to commit"
        phase_done "fail" "No changes to commit"
      fi
    fi

    # Cycle summary
    local elapsed=$(( $(date +%s) - cycle_start ))
    local elapsed_str="${elapsed}s"
    [ $elapsed -gt 60 ] && elapsed_str="$((elapsed/60))m $((elapsed%60))s"

    if [ "$result" = "pass" ]; then
      printf "${BG_CARD} ${FG_G}${B}  ✓ CYCLE $cycle PASSED${RST}${BG_CARD}  ${FG_D}${elapsed_str}  commit ${commit_hash}${RST}${BG_CARD}%*s${RST}\n" $((W-38-${#elapsed_str}-${#commit_hash})) ""
    else
      printf "${BG_CARD} ${FG_R}${B}  ✗ CYCLE $cycle FAILED${RST}${BG_CARD}  ${FG_D}${elapsed_str}${RST}${BG_CARD}%*s${RST}\n" $((W-25-${#elapsed_str})) ""
    fi
    cblank

    # Extract per-phase timing from cycle log
    local phase_timings='{}'
    if [ -n "$CYCLE_LOG" ] && [ -f "$CYCLE_LOG" ]; then
      phase_timings=$(CYCLE_LOG="$CYCLE_LOG" python3 -c "
import json, os
with open(os.environ['CYCLE_LOG']) as f: data = json.load(f)
timings = {}
for p in data.get('phases', []):
    name = p.get('name', 'unknown')
    timings[name] = timings.get(name, 0) + int(p.get('elapsed', 0))
print(json.dumps(timings))
" 2>/dev/null || echo '{}')
    fi

    # Log experiment + finalize cycle log
    append_experiment_log "$exp_id" "${changes_made:-$finding}" "$result" "$baseline" "$after_metrics" "$commit_hash" "$elapsed" "${directive:-unknown}" "${domain:-unknown}" "${gh_issue_num:-}" "$phase_timings" "${finding:-}"
    finalize_cycle_log "$result"
    restore_phase_config_defaults
    record_cycle_memory "$exp_id" "$result" "$target_file" "$cycle_changed_files" "$commit_hash"

    if [ "$result" = "pass" ]; then
      cleanup_cycle_workspace
    else
      phase_start "↩️" "Revert" "git" "rolling back..."
      cleanup_cycle_workspace
      failures=$((failures + 1))
      phase_done "fail" "$discard_reason"
    fi
    cblank

    [ "$result" = "pass" ] && baseline="$after_metrics"

    if [ "$RUNNER_MODE" = "parent" ] && [ $cycle -lt $cycle_limit ]; then
      printf "${BG_HEAD}${FG_DD} Cooldown %ss...%*s${RST}\n" "$CYCLE_COOLDOWN_SECONDS" $((W-16-${#CYCLE_COOLDOWN_SECONDS})) ""
      sleep "$CYCLE_COOLDOWN_SECONDS"
      echo ""
    fi

    if [ "$STOP_AFTER_CURRENT_CYCLE" = "1" ]; then
      break
    fi

    cycle=$((cycle + 1))
  done

  if [ "$RUNNER_MODE" = "worker" ]; then
    if [ "$STOP_AFTER_CURRENT_CYCLE" = "1" ]; then
      return 2
    fi
    [ "$failures" -gt 0 ] && return 1
    return 0
  fi
  REPO="$LANDING_REPO"
  local final_metrics=$(collect_metrics)
  print_run_summary "$((passes + failures))" "$passes" "$failures" "$final_metrics"
}

main "$@"
