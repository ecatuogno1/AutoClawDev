#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────────
# migrate-to-autoclaw.sh — Move data from old scattered layout to .autoclaw/
#
# Usage:
#   ./scripts/migrate-to-autoclaw.sh              # migrate all projects
#   ./scripts/migrate-to-autoclaw.sh clawbuster   # migrate one project
#   ./scripts/migrate-to-autoclaw.sh --dry-run    # show what would happen
#
# Old layout:
#   ~/.local/lib/autoclawdev/projects/*.json
#   ~/.openclaw/workspace/autoresearch/experiments-*.jsonl
#   ~/.openclaw/workspace/autoresearch/cycles/
#   ~/.openclaw/workspace/autoresearch/memory/
#   <project>/.deep-review-logs/
#
# New layout:
#   ~/.autoclawdev/                    (global home)
#   <project>/.autoclaw/config.json
#   <project>/.autoclaw/experiments.jsonl
#   <project>/.autoclaw/cycles/
#   <project>/.autoclaw/memory/
#   <project>/.autoclaw/reviews/
#   <project>/.autoclaw/runs/
# ──────────────────────────────────────────────────────────────────────────────

OLD_PROJECTS_DIR="${HOME}/.local/lib/autoclawdev/projects"
OLD_WORKSPACE="${HOME}/.openclaw/workspace/autoresearch"
NEW_GLOBAL="${HOME}/.autoclawdev"
DRY_RUN=false
TARGET_PROJECT=""

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --help|-h) echo "Usage: migrate-to-autoclaw.sh [project-key] [--dry-run]"; exit 0 ;;
    *) TARGET_PROJECT="$arg" ;;
  esac
done

do_cmd() {
  if [ "$DRY_RUN" = true ]; then
    echo "  [dry-run] $*"
  else
    "$@"
  fi
}

migrate_project() {
  local key=$1
  local config_file="${OLD_PROJECTS_DIR}/${key}.json"

  if [ ! -f "$config_file" ]; then
    echo "  SKIP: no config at $config_file"
    return
  fi

  local project_path
  project_path=$(python3 -c "import json; print(json.load(open('$config_file'))['path'])" 2>/dev/null)
  if [ -z "$project_path" ] || [ ! -d "$project_path" ]; then
    echo "  SKIP: project path not found ($project_path)"
    return
  fi

  local autoclaw_dir="${project_path}/.autoclaw"
  echo "  Migrating $key → $autoclaw_dir"

  # Create directory structure
  do_cmd mkdir -p "$autoclaw_dir/memory/locks" "$autoclaw_dir/memory/snapshots" \
    "$autoclaw_dir/cycles" "$autoclaw_dir/reviews" "$autoclaw_dir/runs"

  # 1. Config
  if [ ! -f "$autoclaw_dir/config.json" ]; then
    do_cmd cp "$config_file" "$autoclaw_dir/config.json"
    echo "    config.json ← $config_file"
  fi

  # 2. Experiments
  local old_exp="${OLD_WORKSPACE}/experiments-${key}.jsonl"
  if [ -f "$old_exp" ] && [ ! -f "$autoclaw_dir/experiments.jsonl" ]; then
    do_cmd cp "$old_exp" "$autoclaw_dir/experiments.jsonl"
    echo "    experiments.jsonl ← $old_exp ($(wc -l < "$old_exp" | tr -d ' ') entries)"
  fi

  # 3. Memory
  local old_mem="${OLD_WORKSPACE}/memory/${key}"
  if [ -d "$old_mem" ]; then
    for f in project-memory.json finding-memory.jsonl file-memory.jsonl; do
      if [ -f "$old_mem/$f" ] && [ ! -f "$autoclaw_dir/memory/$f" ]; then
        do_cmd cp "$old_mem/$f" "$autoclaw_dir/memory/$f"
        echo "    memory/$f ← $old_mem/$f"
      fi
    done
    # Copy snapshots
    if [ -d "$old_mem/snapshots" ]; then
      for f in "$old_mem/snapshots"/*; do
        [ -f "$f" ] || continue
        local base=$(basename "$f")
        if [ ! -f "$autoclaw_dir/memory/snapshots/$base" ]; then
          do_cmd cp "$f" "$autoclaw_dir/memory/snapshots/$base"
        fi
      done
    fi
  fi

  # 4. Cycles
  local old_cycles="${OLD_WORKSPACE}/cycles"
  if [ -d "$old_cycles" ]; then
    local count=0
    for f in "$old_cycles"/${key}-exp-*.json; do
      [ -f "$f" ] || continue
      local base=$(basename "$f")
      # Strip project prefix for cleaner names
      local new_name=${base#"${key}-"}
      if [ ! -f "$autoclaw_dir/cycles/$new_name" ]; then
        do_cmd cp "$f" "$autoclaw_dir/cycles/$new_name"
        count=$((count + 1))
      fi
    done
    [ $count -gt 0 ] && echo "    cycles/ ← $count cycle files"
  fi

  # 5. Deep review logs → reviews
  local old_reviews="${project_path}/.deep-review-logs"
  if [ -d "$old_reviews" ]; then
    for f in "$old_reviews"/*; do
      [ -f "$f" ] || continue
      local base=$(basename "$f")
      if [ ! -f "$autoclaw_dir/reviews/$base" ]; then
        do_cmd cp "$f" "$autoclaw_dir/reviews/$base"
      fi
    done
    echo "    reviews/ ← .deep-review-logs/"
  fi

  # 6. Run log
  local old_log="${OLD_WORKSPACE}/run-${key}.log"
  if [ -f "$old_log" ] && [ ! -f "$autoclaw_dir/runs/run.log" ]; then
    do_cmd cp "$old_log" "$autoclaw_dir/runs/run.log"
    echo "    runs/run.log ← $old_log"
  fi

  # 7. Program file
  local old_program="${OLD_WORKSPACE}/program-${key}.md"
  if [ -f "$old_program" ] && [ ! -f "$autoclaw_dir/program.md" ]; then
    do_cmd cp "$old_program" "$autoclaw_dir/program.md"
    echo "    program.md ← $old_program"
  fi

  echo "  Done: $key"
}

# ── Main ──────────────────────────────────────────────────────────────

echo "AutoClawDev Migration → .autoclaw/ per-project structure"
[ "$DRY_RUN" = true ] && echo "(dry run — no changes will be made)"
echo ""

# Create global home
echo "Global home: $NEW_GLOBAL"
do_cmd mkdir -p "$NEW_GLOBAL/worktrees"

if [ -n "$TARGET_PROJECT" ]; then
  migrate_project "$TARGET_PROJECT"
else
  # Migrate all projects
  if [ -d "$OLD_PROJECTS_DIR" ]; then
    for config_file in "$OLD_PROJECTS_DIR"/*.json; do
      [ -f "$config_file" ] || continue
      key=$(basename "$config_file" .json)
      migrate_project "$key"
    done
  else
    echo "No projects found at $OLD_PROJECTS_DIR"
  fi
fi

echo ""

if [ "$DRY_RUN" = true ]; then
  echo "Migration preview complete. Run without --dry-run to execute."
  exit 0
fi

# ── Verify and clean up ──────────────────────────────────────────────

echo "Verifying migration..."
errors=0

verify_project() {
  local key=$1
  local config_file="${OLD_PROJECTS_DIR}/${key}.json"
  [ -f "$config_file" ] || return

  local project_path
  project_path=$(python3 -c "import json; print(json.load(open('$config_file'))['path'])" 2>/dev/null)
  [ -z "$project_path" ] || [ ! -d "$project_path" ] && return

  local autoclaw_dir="${project_path}/.autoclaw"
  [ ! -d "$autoclaw_dir" ] && { echo "  FAIL: $key — .autoclaw/ not created"; errors=$((errors + 1)); return; }

  # Verify config
  [ ! -f "$autoclaw_dir/config.json" ] && { echo "  FAIL: $key — config.json missing"; errors=$((errors + 1)); }

  # Verify experiments (if old file existed)
  local old_exp="${OLD_WORKSPACE}/experiments-${key}.jsonl"
  if [ -f "$old_exp" ] && [ -s "$old_exp" ]; then
    if [ ! -f "$autoclaw_dir/experiments.jsonl" ]; then
      echo "  FAIL: $key — experiments.jsonl missing"
      errors=$((errors + 1))
    else
      local old_lines=$(wc -l < "$old_exp" | tr -d ' ')
      local new_lines=$(wc -l < "$autoclaw_dir/experiments.jsonl" | tr -d ' ')
      if [ "$old_lines" != "$new_lines" ]; then
        echo "  WARN: $key — experiments line count mismatch (old=$old_lines new=$new_lines)"
      fi
    fi
  fi

  # Verify memory
  local old_mem="${OLD_WORKSPACE}/memory/${key}"
  if [ -d "$old_mem" ]; then
    for f in project-memory.json finding-memory.jsonl; do
      if [ -f "$old_mem/$f" ] && [ ! -f "$autoclaw_dir/memory/$f" ]; then
        echo "  FAIL: $key — memory/$f missing"
        errors=$((errors + 1))
      fi
    done
  fi

  # Verify reviews
  local old_reviews="${project_path}/.deep-review-logs"
  if [ -d "$old_reviews" ] && [ "$(ls -A "$old_reviews" 2>/dev/null)" ]; then
    if [ ! -d "$autoclaw_dir/reviews" ] || [ -z "$(ls -A "$autoclaw_dir/reviews" 2>/dev/null)" ]; then
      echo "  FAIL: $key — reviews/ not migrated"
      errors=$((errors + 1))
    fi
  fi
}

if [ -n "$TARGET_PROJECT" ]; then
  verify_project "$TARGET_PROJECT"
else
  for config_file in "$OLD_PROJECTS_DIR"/*.json; do
    [ -f "$config_file" ] || continue
    verify_project "$(basename "$config_file" .json)"
  done
fi

if [ "$errors" -gt 0 ]; then
  echo ""
  echo "Verification found $errors issue(s). Old data will NOT be removed."
  echo "Fix the issues above and re-run the migration."
  exit 1
fi

echo "  All verified."
echo ""

# ── Clean up old locations ────────────────────────────────────────────

echo "Cleaning up old data..."

cleanup_project() {
  local key=$1
  local config_file="${OLD_PROJECTS_DIR}/${key}.json"
  [ -f "$config_file" ] || return

  local project_path
  project_path=$(python3 -c "import json; print(json.load(open('$config_file'))['path'])" 2>/dev/null)
  [ -z "$project_path" ] && return

  # Remove old experiments
  local old_exp="${OLD_WORKSPACE}/experiments-${key}.jsonl"
  [ -f "$old_exp" ] && rm -f "$old_exp" && echo "  Removed $old_exp"

  # Remove old memory
  local old_mem="${OLD_WORKSPACE}/memory/${key}"
  [ -d "$old_mem" ] && rm -rf "$old_mem" && echo "  Removed $old_mem/"

  # Remove old cycles
  local old_cycles="${OLD_WORKSPACE}/cycles"
  if [ -d "$old_cycles" ]; then
    local count=0
    for f in "$old_cycles"/${key}-exp-*.json; do
      [ -f "$f" ] || continue
      rm -f "$f"
      count=$((count + 1))
    done
    [ $count -gt 0 ] && echo "  Removed $count old cycle files"
  fi

  # Remove old run log
  local old_log="${OLD_WORKSPACE}/run-${key}.log"
  [ -f "$old_log" ] && rm -f "$old_log" && echo "  Removed $old_log"

  # Remove old program
  local old_program="${OLD_WORKSPACE}/program-${key}.md"
  [ -f "$old_program" ] && rm -f "$old_program" && echo "  Removed $old_program"

  # Remove old .deep-review-logs
  local old_reviews="${project_path}/.deep-review-logs"
  [ -d "$old_reviews" ] && rm -rf "$old_reviews" && echo "  Removed $old_reviews/"
}

if [ -n "$TARGET_PROJECT" ]; then
  cleanup_project "$TARGET_PROJECT"
else
  for config_file in "$OLD_PROJECTS_DIR"/*.json; do
    [ -f "$config_file" ] || continue
    cleanup_project "$(basename "$config_file" .json)"
  done
fi

# Clean up empty legacy directories
[ -d "${OLD_WORKSPACE}/memory" ] && rmdir "${OLD_WORKSPACE}/memory" 2>/dev/null && echo "  Removed empty memory/"
[ -d "${OLD_WORKSPACE}/cycles" ] && [ -z "$(ls -A "${OLD_WORKSPACE}/cycles" 2>/dev/null)" ] && rmdir "${OLD_WORKSPACE}/cycles" 2>/dev/null && echo "  Removed empty cycles/"

echo ""
echo "Migration complete. All data now lives in <project>/.autoclaw/"
