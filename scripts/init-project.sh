#!/usr/bin/env bash
set -uo pipefail

# ──────────────────────────────────────────────────────────────────────────────
# init-project.sh — Register a project with AutoClawDev
#
# Usage:
#   init-project.sh <name> [path]
#   init-project.sh my-app
#   init-project.sh my-app /path/to/my-app
# ──────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECTS_DIR="${AUTOCLAWDEV_PROJECTS_DIR:-$HOME/.local/lib/autoclawdev/projects}"

PROJECT_NAME="${1:-}"
PROJECT_PATH="${2:-}"

if [ -z "$PROJECT_NAME" ] || [ "$PROJECT_NAME" = "--help" ] || [ "$PROJECT_NAME" = "-h" ]; then
  echo "Usage: init-project.sh <name> [path]"
  echo ""
  echo "Registers an existing project with AutoClawDev."
  echo "Detects package manager, test/lint commands, and GitHub remote."
  exit 0
fi

# Generate key from name (lowercase, hyphens)
PROJECT_KEY=$(echo "$PROJECT_NAME" | tr '[:upper:]' '[:lower:]' | tr ' _' '-' | tr -cd 'a-z0-9-')

# Resolve path
if [ -z "$PROJECT_PATH" ]; then
  # Try current dir, then ~/Developer/<name>
  if [ -f "package.json" ] || [ -d ".git" ]; then
    PROJECT_PATH="$(pwd)"
  elif [ -d "$HOME/Developer/$PROJECT_NAME" ]; then
    PROJECT_PATH="$HOME/Developer/$PROJECT_NAME"
  else
    echo "ERROR: Could not find project. Specify the path: init-project.sh $PROJECT_NAME /path/to/project"
    exit 1
  fi
fi

PROJECT_PATH="$(cd "$PROJECT_PATH" 2>/dev/null && pwd)"
if [ ! -d "$PROJECT_PATH" ]; then
  echo "ERROR: Path does not exist: $PROJECT_PATH"
  exit 1
fi

# Detect package manager
PM="pnpm"
[ -f "$PROJECT_PATH/yarn.lock" ] && PM="yarn"
[ -f "$PROJECT_PATH/bun.lockb" ] && PM="bun"
[ -f "$PROJECT_PATH/package-lock.json" ] && PM="npm"

# Detect test command
TEST_CMD=""
if [ -f "$PROJECT_PATH/package.json" ]; then
  TEST_CMD=$(python3 -c "
import json
d = json.load(open('$PROJECT_PATH/package.json'))
scripts = d.get('scripts', {})
for key in ['test', 'test:run', 'vitest']:
    if key in scripts:
        print(f'$PM {key}')
        break
" 2>/dev/null || echo "")
fi

# Detect lint command
LINT_CMD=""
if [ -f "$PROJECT_PATH/package.json" ]; then
  LINT_CMD=$(python3 -c "
import json
d = json.load(open('$PROJECT_PATH/package.json'))
scripts = d.get('scripts', {})
for key in ['lint', 'eslint', 'check']:
    if key in scripts:
        print(f'$PM {key}')
        break
" 2>/dev/null || echo "")
fi

# Detect description
DESCRIPTION=""
if [ -f "$PROJECT_PATH/package.json" ]; then
  DESCRIPTION=$(python3 -c "import json; print(json.load(open('$PROJECT_PATH/package.json')).get('description',''))" 2>/dev/null || echo "")
fi

# Detect GitHub repo
GH_REPO=""
if [ -d "$PROJECT_PATH/.git" ]; then
  remote=$(git -C "$PROJECT_PATH" remote get-url origin 2>/dev/null || echo "")
  if echo "$remote" | grep -q "github.com"; then
    GH_REPO=$(echo "$remote" | sed 's|.*github.com[:/]||' | sed 's|\.git$||')
  fi
fi

# ── Write project config ─────────────────────────────────────────────

mkdir -p "$PROJECTS_DIR"
CONFIG_FILE="$PROJECTS_DIR/${PROJECT_KEY}.json"

python3 - "$PROJECT_NAME" "$PROJECT_PATH" "$DESCRIPTION" "$PM" "$TEST_CMD" "$LINT_CMD" "$GH_REPO" "$CONFIG_FILE" <<'PYEOF'
import json, sys
name, path, desc, pm, test_cmd, lint_cmd, gh_repo, config_file = sys.argv[1:9]
config = {
    'name': name,
    'path': path,
    'description': desc,
    'package_manager': pm,
    'test_cmd': test_cmd,
    'lint_cmd': lint_cmd,
    'focus': [],
    'team_profile': 'reliability',
    'speed_profile': 'balanced',
    'workflow_type': 'standard',
    'default_cycles': 5,
    'max_parallel_cycles': 1,
}
if gh_repo:
    config['gh_repo'] = gh_repo
with open(config_file, 'w') as f:
    json.dump(config, f, indent=2)
    f.write('\n')
PYEOF

# Create .autoclaw dir in project
mkdir -p "$PROJECT_PATH/.autoclaw"/{memory,reviews,builds,cycles,runs}

# Copy config to project
cp "$CONFIG_FILE" "$PROJECT_PATH/.autoclaw/config.json"

# Add .autoclaw to gitignore if not already there
if [ -f "$PROJECT_PATH/.gitignore" ]; then
  grep -q "\.autoclaw/" "$PROJECT_PATH/.gitignore" 2>/dev/null || echo ".autoclaw/" >> "$PROJECT_PATH/.gitignore"
fi

# Initialize memory
if command -v autoclaw >/dev/null 2>&1; then
  echo "  Initializing memory..."
  autoclaw memory "$PROJECT_KEY" >/dev/null 2>&1 || true
fi

echo ""
echo "Project registered: $PROJECT_NAME"
echo "  Key:      $PROJECT_KEY"
echo "  Path:     $PROJECT_PATH"
echo "  PM:       $PM"
echo "  Test:     ${TEST_CMD:-none}"
echo "  Lint:     ${LINT_CMD:-none}"
echo "  GitHub:   ${GH_REPO:-not connected}"
echo "  Config:   $CONFIG_FILE"
echo ""
echo "Commands:"
echo "  autoclaw run $PROJECT_KEY"
echo "  autoclaw review $PROJECT_KEY"
echo "  autoclaw build $PROJECT_KEY --list"
