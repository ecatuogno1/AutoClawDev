# AutoClawDev

AutoClawDev is a local autonomous development cockpit. It orchestrates multiple AI agents (Claude Opus, GPT-5.4 Codex, CodeRabbit) to continuously find and fix issues across all your projects.

The short alias `autoclaw` works everywhere instead of `autoclawdev`.

## How It Works

A single `autoclaw run` executes one **full cycle** — 5 sequential profile passes that cover every dimension of a project:

```
autoclaw run clawbuster
  reliability  →  find general bugs, edge cases, improvements
  security     →  find auth, injection, data integrity, privacy issues
  performance  →  find hot paths, wasteful queries, memory spikes
  quality      →  find UX, accessibility, API contract, test gaps
  issues       →  fix an open GitHub issue
```

Each profile pass runs the same agent pipeline:

```
  Olivia    (Opus)     Research — find 1 concrete issue
     ↓
  Jessica   (Opus)     Planning — scope the fix
     ↓
  Terry     (Codex)    Implement — write the code
     ↓
  Penny     (Opus)     Review — check quality
     ↓
  Validate  (Direct)   Tests + lint
     ↓
  Commit    (Git)      Land or revert
```

Result: pass or fail. Findings feed into project memory so the next cycle builds on what was learned.

## Quick Start

```bash
pnpm install
make install
autoclaw run clawbuster        # 1 full cycle (5 profiles)
```

## Commands

### Run

```bash
autoclaw run <project>                  # 1 full cycle (all 5 profiles)
autoclaw run <project> 3                # 3 full cycles (15 pipeline runs)
autoclaw run <project> -p security      # single profile, 1 cycle
autoclaw review <project>               # deep codebase review + fix (Claude)
autoclaw review <project> --codex       # deep review with GPT-5.4
autoclaw review <project> --codex-fast  # deep review with GPT-5.4 fast
autoclaw loop <project> [N]             # continuous full cycles (default 5)
autoclaw loop <project> -p security     # continuous single profile
autoclaw stop [project]                 # stop active run
```

### Projects

```bash
autoclaw list                   # list all projects
autoclaw add <path>             # register a project
autoclaw log [project]          # experiment history
autoclaw status                 # active runs + stats
autoclaw github <project>       # view GitHub issues
```

### Tools

```bash
autoclaw audit <url>                        # web security audit
autoclaw ingest <project> [deep-review|qa|profile]  # feed findings into memory
autoclaw memory <project>                   # initialize/refresh project memory
autoclaw ui                                 # open web dashboard
autoclaw doctor                             # verify install + toolchain
```

### Advanced

```bash
autoclaw workflow <type> <project> [N]  # standard, implement-only, review-only, fast-ship, research-only, deep-review
autoclaw cycle <project> [exp-id]       # per-agent cycle details
autoclaw tail [project]                 # tail run log
autoclaw dashboard                      # full-screen TUI dashboard
```

## Profiles

Profiles steer what the AI agents look for. A full cycle runs all 5 in sequence.

| Profile | What agents look for |
|---------|---------------------|
| `reliability` | General bugs, edge cases, improvements |
| `security` | Auth/authz, injection, data races, PII, privacy, dependency vulnerabilities |
| `performance` | Hot paths, wasteful queries, memory spikes, bundle cost |
| `quality` | Accessibility, UX defects, API contract drift, test gaps, safe refactors |
| `issues` | Open GitHub issues first, then best bug fix |

Use `-p` to run a single profile: `autoclaw run clawbuster -p security`

## Deep Review

Deep review is a separate system from standard runs. It launches a full interactive AI session that:

1. Spawns 5 parallel subagents to audit the codebase (backend, frontend, DB, integrations, dead code)
2. Synthesizes findings into an audit report and execution plan
3. Implements fixes in phased order (critical → cleanup → refactor → harden)
4. Commits work at phase boundaries
5. Deploys and verifies with Chrome (if configured)
6. Ingests all findings into project memory

```bash
autoclaw review clawbuster               # Claude Opus, max thinking
autoclaw review clawbuster --codex       # GPT-5.4, high reasoning
autoclaw review clawbuster --codex-fast  # GPT-5.4, high reasoning, fast sandbox
```

Artifacts saved to `<project>/.deep-review-logs/`:
- `audit-report.md` — all findings
- `execution-plan.md` — phased fix plan
- `progress.md` — resume state for the next session

## Memory

Every run feeds into a per-project knowledge base at `~/.openclaw/workspace/autoresearch/memory/<project>/`:

- `project-memory.json` — summary, hotspots, commit reference
- `finding-memory.jsonl` — individual findings (open/fixed) from all sources
- `file-memory.jsonl` — per-file knowledge

Memory is fed by:
- Standard cycles (automatic after each pass)
- Deep reviews (automatic after session ends)
- QA audits (`autoclaw ingest <project> qa-audit`)
- Profile validations (`autoclaw ingest <project> profile`)

The next run reads memory to avoid repeating work and focus on new areas.

## Web Dashboard

```bash
autoclaw ui
```

Opens `http://localhost:4100` with:

- **Command Center** — cross-project health matrix (pass rates, trends, deep review status, memory status)
- **Project Hub** — per-project detail with tabs for Runs, Deep Reviews, Knowledge Base
- **Live Console** — real-time agent output streaming
- **Deep Reviews** — audit report viewer, execution plan, progress tracking
- **Knowledge Base** — open findings, resolved findings, hotspot files

## Architecture

```
autoclaw run <project>
│
├── Full Cycle (all 5 profiles in sequence)
│   ├── reliability  → 1 pipeline pass → experiment logged → memory updated
│   ├── security     → 1 pipeline pass → experiment logged → memory updated
│   ├── performance  → 1 pipeline pass → experiment logged → memory updated
│   ├── quality      → 1 pipeline pass → experiment logged → memory updated
│   └── issues       → 1 pipeline pass → experiment logged → memory updated
│
├── Each pipeline pass:
│   Olivia (research) → Jessica (plan) → Terry (implement) → Penny (review) → Validate → Commit
│
└── All results → Memory → Dashboard → Next Run
```

```
autoclaw review <project>
│
├── 5 parallel subagents audit the codebase
├── Synthesize → audit-report.md + execution-plan.md
├── Fix phases: critical → cleanup → refactor → harden
├── Commit at each phase boundary
└── Ingest findings → Memory
```

## Prerequisites

- `bash`, `node`, `pnpm`, `python3`, `git`
- `gh` (GitHub CLI)
- `gum` (terminal UI toolkit)
- `claude` (Claude Code CLI)
- `codex` (OpenAI Codex CLI)
- `coderabbit` (CodeRabbit CLI, optional)
- `curl`, `lsof`

## Install and Update

```bash
pnpm install
make install
```

`make install` builds the web and server apps, creates data directories, and installs symlinks (`autoclaw`, `autoclawdev`, `autoclawdev-ui`, `runner.sh`).

Use `make update` after repo changes. It is equivalent to `make install`.

## Environment Variables

AutoClawDev reads environment variables directly from the shell; it does not
auto-load `.env`. Use [`.env.example`](/Users/emanuelcatuogno/Developer/AutoClawDev/.env.example)
as the template and see [`docs/environment.md`](/Users/emanuelcatuogno/Developer/AutoClawDev/docs/environment.md)
for the full reference with script locations and examples.

### Core Paths

| Variable | Default | Description |
| --- | --- | --- |
| `AUTOCLAWDEV_HOME` | `~/.autoclawdev` | Server-side global data root used by the new path helpers. |
| `AUTOCLAWDEV_WORKSPACE` | `~/.openclaw/workspace/autoresearch` | Legacy workspace root for logs, experiments, cycles, and memory. |
| `AUTOCLAWDEV_PROJECTS_DIR` | `~/.local/lib/autoclawdev/projects` | Directory containing project JSON configs. |
| `AUTOCLAWDEV_RUNNER` | `<repo>/scripts/runner.sh` | Runner script path used by the CLI and dashboard. |
| `AUTOCLAWDEV_UI_LAUNCHER` | `<repo>/bin/autoclawdev-ui` | UI launcher path used by the CLI. |
| `AUTOCLAWDEV_REPO_ROOT` | `<repo root>` | Server override for resolving repo-local assets and scripts. |
| `AUTOCLAW_DEV_DIR` | `~/Developer` | Default parent directory for `autoclaw add` scaffolding. |

### Project and Runner Inputs

| Variable | Default | Description |
| --- | --- | --- |
| `AUTOCLAWDEV_PROJECT` | `clawbuster` | Default project key when the runner is invoked directly. |
| `AUTOCLAWDEV_REPO` | empty | Absolute path to the project repository under analysis. |
| `AUTOCLAWDEV_PROJECT_CONFIG_FILE` | `<projects-dir>/<project>.json` | Override path for the runner project config file. |
| `AUTOCLAWDEV_NAME` | project key | Display name used in logs and prompts. |
| `AUTOCLAWDEV_PROGRAM` | `<workspace>/program.md` | Program/context file path for runner prompts. |
| `AUTOCLAWDEV_EXPERIMENTS` | `<workspace>/experiments-<project>.jsonl` | Experiment log file path. |
| `AUTOCLAWDEV_TEST_CMD` | empty | Test command for validation and prompts. |
| `AUTOCLAWDEV_LINT_CMD` | empty | Lint command for validation and prompts. |
| `AUTOCLAWDEV_SECURITY_CMD` | empty | Project-specific security scan command. |
| `AUTOCLAWDEV_SECURITY_DEPENDENCY_CMD` | empty | Dependency security scan command. |
| `AUTOCLAWDEV_PERFORMANCE_CMD` | empty | Project-specific performance command. |
| `AUTOCLAWDEV_PROFILE_VALIDATION_JSON` | empty | JSON object mapping profile names to validation commands. |
| `AUTOCLAWDEV_DEV_URL` | empty | Development server URL used for browser snapshot validation. |
| `AUTOCLAWDEV_BASE_BRANCH` | auto-detect | Base branch used for worktree creation and rebases. |
| `AUTOCLAWDEV_INTEGRATION_BRANCH` | generated | Shared integration branch for cycle merges. |
| `AUTOCLAWDEV_LANDING_REPO` | empty | Integration worktree path; required in worker mode. |

### Workflow and Orchestration

| Variable | Default | Description |
| --- | --- | --- |
| `AUTOCLAWDEV_TEAM_PROFILE` | `reliability` | Active profile family for a run. |
| `AUTOCLAWDEV_WORKFLOW_TYPE` | `standard` | Phase sequence: `standard`, `implement-only`, `review-only`, `fast-ship`, `batch-research`, or `research-only`. |
| `AUTOCLAWDEV_SPEED_PROFILE` | `balanced` | Review aggressiveness: `fast`, `balanced`, or `thorough`. |
| `AUTOCLAWDEV_MAX_PARALLEL_CYCLES` | `1` | Maximum worker cycles to run in parallel. |
| `AUTOCLAWDEV_BATCH_RESEARCH_COUNT` | `3` | Number of findings Olivia should queue in batch mode. |
| `AUTOCLAWDEV_BATCH_RESEARCH_AUTO` | `0` | Internal flag that switches standard runs into batch-research worker mode. |
| `AUTOCLAWDEV_RUNNER_MODE` | `parent` | Runner process role: `parent` or `worker`. |
| `AUTOCLAWDEV_SKIP_PROJECT_LOCK` | `0` | Skip project-level run locking. |
| `AUTOCLAWDEV_CYCLE_COOLDOWN_SECONDS` | `0` | Delay between loop cycles. |
| `AUTOCLAWDEV_GOAL` | empty | Required goal text for `implement-only` workflow. |
| `AUTOCLAWDEV_TARGET_FILE` | empty | Optional target file hint for `implement-only` workflow. |
| `AUTOCLAWDEV_DOMAIN` | `backend` | Optional domain hint for `implement-only` workflow. |
| `AUTOCLAWDEV_DIRECTIVE` | `feature` | Optional directive hint for `implement-only` workflow. |
| `AUTOCLAW_BUILD_MAX_ATTEMPTS` | `3` | Max retries per `scripts/build.sh` phase. |
| `AUTOCLAWDEV_WIGMAN_SUCCESS_SLEEP_SECONDS` | `3` | Sleep between successful continuous-loop iterations. |
| `AUTOCLAWDEV_WIGMAN_FAILURE_SLEEP_SECONDS` | `20` | Sleep after failed continuous-loop iterations. |
| `AUTOCLAWDEV_WIGMAN_MAX_CONSECUTIVE_FAILURES` | `3` | Stop threshold for repeated loop failures. |

### Models

| Variable | Default | Description |
| --- | --- | --- |
| `AUTOCLAWDEV_RESEARCH_MODEL` | project config or `opus` | Research model for Olivia. |
| `AUTOCLAWDEV_PLANNING_MODEL` | project config or `opus` | Planning model for Jessica. |
| `AUTOCLAWDEV_IMPL_MODEL` | empty | Override implementation model; empty keeps Codex as the implementation agent. |
| `AUTOCLAWDEV_REVIEW_MODEL` | project config or `opus` | Review model for Penny. |
| `AUTOCLAWDEV_FIX_MODEL` | empty | Override the fix agent model; empty keeps Codex Spark. |
| `AUTOCLAWDEV_CODEX_MODEL` | project config or `gpt-5.4` | Codex model for implementation phases. |
| `AUTOCLAWDEV_CODEX_FIX_MODEL` | project config or `gpt-5.3-codex-spark` | Codex model for fix-up phases. |
| `CLAUDE_MODEL` | `opus` | Deep-review Claude model override. |

### Validation and Review

| Variable | Default | Description |
| --- | --- | --- |
| `AUTOCLAWDEV_AGENT_TIMEOUT_DEFAULT` | `900` | Fallback timeout for agent commands in seconds. |
| `AUTOCLAWDEV_AGENT_TIMEOUT_CODEX` | `1800` | Codex timeout in seconds. |
| `AUTOCLAWDEV_AGENT_TIMEOUT_OPUS` | `1200` | Claude/Sonnet/visual timeout in seconds. |
| `AUTOCLAWDEV_AGENT_TIMEOUT_CODERABBIT` | `600` | CodeRabbit timeout in seconds. |
| `AUTOCLAWDEV_AGENT_TIMEOUT_FIX` | `600` | Fix-agent timeout in seconds. |
| `AUTOCLAWDEV_VALIDATION_TIMEOUT` | `1200` | Timeout for validation commands. |
| `AUTOCLAWDEV_DEPENDENCY_BOOTSTRAP_TIMEOUT` | `1800` | Timeout for dependency/bootstrap steps. |
| `AUTOCLAWDEV_VALIDATION_MODE` | `serial` | Validation strategy: `serial` or `parallel`. |
| `AUTOCLAWDEV_ALLOW_PREEXISTING_TEST_FAILURES` | `0` | Allow unrelated pre-existing test failures. |
| `AUTOCLAWDEV_CODERABBIT_MAX_ROUNDS` | `3` | Max review rounds for CodeRabbit. |
| `AUTOCLAWDEV_VALIDATION_FIX_ATTEMPTS` | `2` | Retry count for validation repair loops. |
| `AUTOCLAWDEV_CAPTURE_VALIDATION_BASELINE` | `1` | Capture pre-change validation baselines. |
| `AUTOCLAWDEV_SKIP_PENNY_ON_CLEAN_CODERABBIT` | empty | Skip Penny after a clean CodeRabbit pass when set truthy. |
| `AUTOCLAWDEV_REVIEW_DEPTH` | profile default | Review depth: `none`, `validation-only`, `penny`, or `full`. |

### Memory, Prompts, and GitHub Context

| Variable | Default | Description |
| --- | --- | --- |
| `AUTOCLAWDEV_MEMORY_ENABLED` | `1` | Enable memory read/write features. |
| `AUTOCLAWDEV_MEMORY_DIR` | `<workspace>/memory` | Base memory directory; ingestion also uses it as a legacy fallback. |
| `AUTOCLAWDEV_MEMORY_SCRIPT` | `<repo>/scripts/memory_cache.py` | Memory helper script path. |
| `AUTOCLAWDEV_VALIDATION_BASELINES_DIR` | `<workspace>/validation-baselines` | Directory storing validation baselines. |
| `AUTOCLAWDEV_PROMPTS_DIR` | `<repo>/scripts/prompts` | Prompt directory override for the runner. |
| `AUTOCLAWDEV_BROWSER_SNAPSHOT` | `<repo>/scripts/browser_snapshot.mjs` | Browser snapshot script used for visual checks. |
| `AUTOCLAWDEV_GH_CONTEXT_REFRESH_SECONDS` | `30` | GitHub issue refresh interval in seconds. |
| `AUTOCLAWDEV_GH_ISSUES_CACHE_DIR` | `<workspace>/gh-cache` | Disk cache directory for GitHub issue listings. |
| `AUTOCLAWDEV_GH_ISSUES_CACHE_TTL_SECONDS` | `300` | GitHub issue cache TTL in seconds. |
| `AUTOCLAWDEV_RECENT_CONTEXT` | empty | Injected recent-experiment context override. |
| `AUTOCLAWDEV_GH_ISSUES_CONTEXT` | empty | Injected GitHub issue context override. |
| `AUTOCLAWDEV_BASELINE_JSON` | empty | Injected baseline summary JSON for workers. |
| `AUTOCLAWDEV_ASSIGNED_EXP_ID` | empty | Worker-assigned experiment id. |
| `AUTOCLAWDEV_ASSIGNED_CYCLE_NUMBER` | empty | Worker-assigned cycle number. |
| `AUTOCLAWDEV_CHANGED_FILES` | empty | File list exported into profile validation commands. |

### Dashboard and Shell

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `4100` | Dashboard server port; scaffolded API templates generated by `create-project.sh` use `3000` instead. |
| `AUTOCLAWDEV_UI_PID_FILE` | `<workspace>/autoclawdev-ui.pid` | PID file for the dashboard launcher. |
| `AUTOCLAWDEV_UI_LOG_FILE` | `<workspace>/autoclawdev-ui.log` | Log file for the dashboard launcher. |
| `AUTOCLAWDEV_UI_SERVICE_LABEL` | `com.autoresearch.dashboard` | `launchd` service label for background dashboard mode. |
| `AUTOCLAWDEV_UI_LAUNCH_AGENTS_DIR` | `~/Library/LaunchAgents` | Directory for generated `launchd` plists. |
| `AUTOCLAWDEV_UI_PLIST_FILE` | `<launch-agents-dir>/<service-label>.plist` | Explicit plist path override for dashboard launchd integration. |
| `EDITOR` | `nano` | Editor used by interactive config-editing commands. |
| `TMPDIR` | `/tmp` | Temporary directory used by the runner for transient files. |

## Lifecycle Commands

- `make build` — build the web UI and server
- `make doctor` — validate toolchain, paths, build outputs, and symlinks
- `make smoke` — non-destructive installed-command smoke test
- `make uninstall` — remove only repo-managed symlinks

## Runtime Layout

- `~/.local/bin/autoclaw` → repo CLI (also `autoclawdev`)
- `~/.local/bin/autoclawdev-ui` → dashboard launcher
- `~/.openclaw/workspace/autoresearch/runner.sh` → runner engine
- `~/.local/lib/autoclawdev/projects/` → project JSON configs
- `~/.openclaw/workspace/autoresearch/` → logs, cycles, experiments, memory

Install and uninstall do not delete project configs, logs, or experiment history.

## Recovery Notes

- If `make doctor` reports missing build output, run `make build`.
- If the dashboard launcher gets stuck, stop it with `autoclawdev-ui --stop`.
- If a run is interrupted, remove stale lock files from `~/.openclaw/workspace/autoresearch/.lock-*`.
- If you need to inspect an older wrapper after install, use the generated `*.pre-autoclawdev.<timestamp>.bak` backup beside the original path.
