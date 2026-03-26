# Environment Variables

AutoClawDev reads environment variables directly from the shell. The
[`.env.example`](/Users/emanuelcatuogno/Developer/AutoClawDev/.env.example)
file is a template, not an auto-loaded config file.

Use this reference when you need to:

- Override defaults globally with `direnv`, `.envrc`, or shell exports.
- Set per-project runner inputs before invoking `autoclaw` or `runner.sh`.
- Understand which values are user-facing versus auto-managed worker state.

Blank defaults mean the variable is optional, required per run, or resolved from
project JSON config when available. Standard shell variables like `HOME` and
`PATH` are intentionally omitted unless they change AutoClawDev behavior.

## Core Paths

| Variable | Default | Used by | Description | Example |
| --- | --- | --- | --- | --- |
| `AUTOCLAWDEV_HOME` | `~/.autoclawdev` | `apps/server/src/lib/paths.ts` | Server-side global home used by the new path helpers. | `/Users/alex/.autoclawdev` |
| `AUTOCLAWDEV_WORKSPACE` | `~/.openclaw/workspace/autoresearch` | `scripts/runner.sh`, `bin/autoclawdev`, `bin/autoclawdev-ui`, `apps/server/src/lib/paths.ts` | Legacy workspace root for experiments, logs, cycles, memory, and compatibility fallbacks. | `/Users/alex/.openclaw/workspace/autoresearch` |
| `AUTOCLAWDEV_PROJECTS_DIR` | `~/.local/lib/autoclawdev/projects` | `scripts/runner.sh`, `scripts/build.sh`, `scripts/deep-review.sh`, `scripts/ingest-to-memory.sh`, `scripts/create-project.sh`, `bin/autoclawdev`, `apps/server/src/lib/paths.ts` | Directory containing registered project JSON files. | `/Users/alex/.local/lib/autoclawdev/projects` |
| `AUTOCLAWDEV_RUNNER` | `<repo>/scripts/runner.sh` | `bin/autoclawdev`, `apps/server/src/lib/process.ts` | Explicit runner script path for the CLI and dashboard server. | `/Users/alex/Developer/AutoClawDev/scripts/runner.sh` |
| `AUTOCLAWDEV_UI_LAUNCHER` | `<repo>/bin/autoclawdev-ui` | `bin/autoclawdev` | Override path to the dashboard launcher script. | `/Users/alex/Developer/AutoClawDev/bin/autoclawdev-ui` |
| `AUTOCLAWDEV_REPO_ROOT` | repo checkout root | `bin/autoclawdev-ui`, `apps/server/src/lib/process.ts` | Server override for locating repo-local scripts and build artifacts. Usually set by the UI launcher. | `/Users/alex/Developer/AutoClawDev` |
| `AUTOCLAW_DEV_DIR` | `~/Developer` | `scripts/create-project.sh` | Default parent directory for new project scaffolds. | `/Users/alex/Developer` |

## Project and Runner Inputs

| Variable | Default | Used by | Description | Example |
| --- | --- | --- | --- | --- |
| `AUTOCLAWDEV_PROJECT` | `clawbuster` | `scripts/runner.sh`, `bin/autoclawdev` | Default project key when invoking the runner directly. | `clawbuster` |
| `AUTOCLAWDEV_REPO` | blank | `scripts/runner.sh`, `bin/autoclawdev` | Absolute path to the project repository being analyzed. | `/Users/alex/Developer/clawbuster` |
| `AUTOCLAWDEV_PROJECT_CONFIG_FILE` | `<projects-dir>/<project>.json` | `scripts/runner.sh` | Optional explicit project config path override. | `/Users/alex/.local/lib/autoclawdev/projects/clawbuster.json` |
| `AUTOCLAWDEV_NAME` | project key | `scripts/runner.sh`, `bin/autoclawdev` | Human-readable project name used in prompts and logs. | `Clawbuster` |
| `AUTOCLAWDEV_PROGRAM` | `<workspace>/program.md` | `scripts/runner.sh`, `bin/autoclawdev` | Program/context markdown file supplied to the runner. | `/Users/alex/.openclaw/workspace/autoresearch/program-clawbuster.md` |
| `AUTOCLAWDEV_EXPERIMENTS` | `<workspace>/experiments-<project>.jsonl` | `scripts/runner.sh`, `bin/autoclawdev` | Experiment log file path. | `/Users/alex/.openclaw/workspace/autoresearch/experiments-clawbuster.jsonl` |
| `AUTOCLAWDEV_TEST_CMD` | blank | `scripts/runner.sh`, `bin/autoclawdev` | Project test command used in validation and prompts. | `make smoke` |
| `AUTOCLAWDEV_LINT_CMD` | blank | `scripts/runner.sh`, `bin/autoclawdev` | Project lint/doctor command used in validation and prompts. | `make doctor` |
| `AUTOCLAWDEV_SECURITY_CMD` | blank | `scripts/runner.sh`, `bin/autoclawdev` | Optional project security command. | `pnpm audit --prod` |
| `AUTOCLAWDEV_SECURITY_DEPENDENCY_CMD` | blank | `scripts/runner.sh`, `bin/autoclawdev` | Optional dependency vulnerability command. | `pnpm audit --json` |
| `AUTOCLAWDEV_PERFORMANCE_CMD` | blank | `scripts/runner.sh`, `bin/autoclawdev` | Optional project-specific performance validation command. | `pnpm perf:smoke` |
| `AUTOCLAWDEV_PROFILE_VALIDATION_JSON` | blank | `scripts/runner.sh`, `bin/autoclawdev` | JSON object with per-profile validation commands. | `{"security":"pnpm profile:security"}` |
| `AUTOCLAWDEV_DEV_URL` | blank | `scripts/runner.sh`, `bin/autoclawdev` | URL used for browser snapshot validation. | `http://localhost:3000` |
| `AUTOCLAWDEV_BASE_BRANCH` | auto-detect if unset | `scripts/runner.sh`, `bin/autoclawdev` | Base branch used for worktree creation and rebases. | `main` |
| `AUTOCLAWDEV_INTEGRATION_BRANCH` | generated from project key | `scripts/runner.sh`, `bin/autoclawdev` | Shared integration branch for cycle merges. | `autoclawdev/clawbuster/integration` |
| `AUTOCLAWDEV_LANDING_REPO` | blank | `scripts/runner.sh`, `bin/autoclawdev` | Path to the shared integration worktree; required in worker mode. | `/Users/alex/.openclaw/workspace/autoresearch/clawbuster-integration` |

## Workflow and Orchestration

| Variable | Default | Used by | Description | Example |
| --- | --- | --- | --- | --- |
| `AUTOCLAWDEV_TEAM_PROFILE` | `reliability` | `scripts/runner.sh`, `bin/autoclawdev` | Active profile family for a run. | `security` |
| `AUTOCLAWDEV_WORKFLOW_TYPE` | `standard` | `scripts/runner.sh`, `bin/autoclawdev` | Phase sequence override. Supported values: `standard`, `implement-only`, `review-only`, `fast-ship`, `batch-research`, `research-only`. | `implement-only` |
| `AUTOCLAWDEV_SPEED_PROFILE` | `balanced` | `scripts/runner.sh`, `bin/autoclawdev` | Review aggressiveness profile. Supported values: `fast`, `balanced`, `thorough`. | `fast` |
| `AUTOCLAWDEV_MAX_PARALLEL_CYCLES` | `1` | `scripts/runner.sh`, `bin/autoclawdev` | Maximum number of cycles the parent runner may dispatch in parallel. | `3` |
| `AUTOCLAWDEV_BATCH_RESEARCH_COUNT` | `3` | `scripts/runner.sh`, `bin/autoclawdev` | Finding count Olivia should queue during batch research mode. | `5` |
| `AUTOCLAWDEV_BATCH_RESEARCH_AUTO` | `0` | `scripts/runner.sh` | Internal switch used by the parent runner to turn standard workers into batch-research workers. Usually not set manually. | `1` |
| `AUTOCLAWDEV_RUNNER_MODE` | `parent` | `scripts/runner.sh` | Runner role: `parent` or `worker`. Usually auto-managed. | `worker` |
| `AUTOCLAWDEV_SKIP_PROJECT_LOCK` | `0` | `scripts/runner.sh`, `bin/autoclawdev` | Skip the per-project run lock. | `1` |
| `AUTOCLAWDEV_CYCLE_COOLDOWN_SECONDS` | `0` | `scripts/runner.sh` | Delay between loop cycles. | `30` |
| `AUTOCLAWDEV_GOAL` | blank | `scripts/runner.sh`, `bin/autoclawdev` | Required goal text for `implement-only` workflow. | `Document every env var and add .env.example` |
| `AUTOCLAWDEV_TARGET_FILE` | blank | `scripts/runner.sh` | Optional file hint used with `implement-only` workflow. | `README.md` |
| `AUTOCLAWDEV_DOMAIN` | `backend` | `scripts/runner.sh` | Optional domain hint for `implement-only` workflow. | `frontend` |
| `AUTOCLAWDEV_DIRECTIVE` | `feature` | `scripts/runner.sh` | Optional directive hint for `implement-only` workflow. | `bug-fix` |
| `AUTOCLAW_BUILD_MAX_ATTEMPTS` | `3` | `scripts/build.sh` | Maximum attempts per build-plan phase. | `5` |
| `AUTOCLAWDEV_WIGMAN_SUCCESS_SLEEP_SECONDS` | `3` | `bin/autoclawdev` | Sleep between successful continuous-loop iterations. | `10` |
| `AUTOCLAWDEV_WIGMAN_FAILURE_SLEEP_SECONDS` | `20` | `bin/autoclawdev` | Sleep after failed continuous-loop iterations. | `60` |
| `AUTOCLAWDEV_WIGMAN_MAX_CONSECUTIVE_FAILURES` | `3` | `bin/autoclawdev` | Abort threshold for repeated failures in continuous-loop mode. | `5` |

## Models

| Variable | Default | Used by | Description | Example |
| --- | --- | --- | --- | --- |
| `AUTOCLAWDEV_RESEARCH_MODEL` | project config or `opus` | `scripts/runner.sh`, `bin/autoclawdev` | Research model for Olivia. The top-of-file bootstrap says `sonnet`, but normal project-config resolution replaces it with `opus` when the env var is unset. | `claude-opus-4-1` |
| `AUTOCLAWDEV_PLANNING_MODEL` | project config or `opus` | `scripts/runner.sh`, `bin/autoclawdev` | Planning model for Jessica. | `claude-opus-4-1` |
| `AUTOCLAWDEV_IMPL_MODEL` | blank | `scripts/runner.sh`, `bin/autoclawdev` | Override implementation model. Blank keeps Terry/Jerry on Codex. | `claude-sonnet-4` |
| `AUTOCLAWDEV_REVIEW_MODEL` | project config or `opus` | `scripts/runner.sh`, `bin/autoclawdev` | Review model for Penny. | `claude-opus-4-1` |
| `AUTOCLAWDEV_FIX_MODEL` | blank | `scripts/runner.sh` | Override the fix agent model. Blank keeps the Codex fix model path. | `claude-sonnet-4` |
| `AUTOCLAWDEV_CODEX_MODEL` | project config or `gpt-5.4` | `scripts/runner.sh`, `bin/autoclawdev` | Codex model used for implementation phases. | `gpt-5.4` |
| `AUTOCLAWDEV_CODEX_FIX_MODEL` | project config or `gpt-5.3-codex-spark` | `scripts/runner.sh`, `bin/autoclawdev` | Codex model used for fix-up phases. | `gpt-5.3-codex-spark` |
| `CLAUDE_MODEL` | `opus` | `scripts/deep-review.sh` | Claude model override for deep-review sessions. | `sonnet` |

## Validation and Review Controls

| Variable | Default | Used by | Description | Example |
| --- | --- | --- | --- | --- |
| `AUTOCLAWDEV_AGENT_TIMEOUT_DEFAULT` | `900` | `scripts/runner.sh` | Fallback timeout for agent commands in seconds. | `1200` |
| `AUTOCLAWDEV_AGENT_TIMEOUT_CODEX` | `1800` | `scripts/runner.sh` | Codex timeout in seconds. | `2400` |
| `AUTOCLAWDEV_AGENT_TIMEOUT_OPUS` | `1200` | `scripts/runner.sh` | Claude/Sonnet/visual timeout in seconds. | `1500` |
| `AUTOCLAWDEV_AGENT_TIMEOUT_CODERABBIT` | `600` | `scripts/runner.sh` | CodeRabbit timeout in seconds. | `900` |
| `AUTOCLAWDEV_AGENT_TIMEOUT_FIX` | `600` | `scripts/runner.sh` | Fix-agent timeout in seconds. | `900` |
| `AUTOCLAWDEV_VALIDATION_TIMEOUT` | `1200` | `scripts/runner.sh` | Timeout for validation commands. | `1800` |
| `AUTOCLAWDEV_DEPENDENCY_BOOTSTRAP_TIMEOUT` | `1800` | `scripts/runner.sh` | Timeout for dependency/bootstrap work. | `2400` |
| `AUTOCLAWDEV_VALIDATION_MODE` | `serial` | `scripts/runner.sh` | Validation strategy. Supported values: `serial` or `parallel`. | `parallel` |
| `AUTOCLAWDEV_ALLOW_PREEXISTING_TEST_FAILURES` | `0` | `scripts/runner.sh` | Allow unrelated pre-existing failures to pass validation. | `1` |
| `AUTOCLAWDEV_CODERABBIT_MAX_ROUNDS` | `3` | `scripts/runner.sh` | Max review rounds for CodeRabbit. | `1` |
| `AUTOCLAWDEV_VALIDATION_FIX_ATTEMPTS` | `2` | `scripts/runner.sh` | Max validation repair attempts after implementation. | `3` |
| `AUTOCLAWDEV_CAPTURE_VALIDATION_BASELINE` | `1` | `scripts/runner.sh` | Capture pre-change validation baselines. | `0` |
| `AUTOCLAWDEV_SKIP_PENNY_ON_CLEAN_CODERABBIT` | blank | `scripts/runner.sh` | Truthy value skips Penny after a clean CodeRabbit pass. | `1` |
| `AUTOCLAWDEV_REVIEW_DEPTH` | profile default | `scripts/runner.sh`, `bin/autoclawdev` | Review depth override: `none`, `validation-only`, `penny`, or `full`. | `full` |

## Memory, Prompts, and GitHub Context

| Variable | Default | Used by | Description | Example |
| --- | --- | --- | --- | --- |
| `AUTOCLAWDEV_MEMORY_ENABLED` | `1` | `scripts/runner.sh` | Enable or disable memory read/write behavior. | `0` |
| `AUTOCLAWDEV_MEMORY_DIR` | `<workspace>/memory` | `scripts/runner.sh`, `scripts/ingest-to-memory.sh` | Base memory directory. Ingestion also falls back to `<project>/.autoclaw/memory` when present. | `/Users/alex/.openclaw/workspace/autoresearch/memory` |
| `AUTOCLAWDEV_MEMORY_SCRIPT` | `<repo>/scripts/memory_cache.py` | `scripts/runner.sh` | Memory helper script path. | `/Users/alex/Developer/AutoClawDev/scripts/memory_cache.py` |
| `AUTOCLAWDEV_VALIDATION_BASELINES_DIR` | `<workspace>/validation-baselines` | `scripts/runner.sh` | Directory holding validation baseline snapshots. | `/Users/alex/.openclaw/workspace/autoresearch/validation-baselines` |
| `AUTOCLAWDEV_PROMPTS_DIR` | `<repo>/scripts/prompts` | `scripts/runner.sh` | Prompt directory override. | `/Users/alex/Developer/AutoClawDev/scripts/prompts` |
| `AUTOCLAWDEV_BROWSER_SNAPSHOT` | `<repo>/scripts/browser_snapshot.mjs` | `scripts/runner.sh` | Browser snapshot script used for visual validation. | `/Users/alex/Developer/AutoClawDev/scripts/browser_snapshot.mjs` |
| `AUTOCLAWDEV_GH_CONTEXT_REFRESH_SECONDS` | `30` | `scripts/runner.sh`, `bin/autoclawdev` | Refresh interval for GitHub issue context. | `120` |
| `AUTOCLAWDEV_GH_ISSUES_CACHE_DIR` | `<workspace>/gh-cache` | `scripts/runner.sh` | Disk cache location for GitHub issue list output. | `/Users/alex/.openclaw/workspace/autoresearch/gh-cache` |
| `AUTOCLAWDEV_GH_ISSUES_CACHE_TTL_SECONDS` | `300` | `scripts/runner.sh` | Cache TTL for GitHub issue lists. | `600` |
| `AUTOCLAWDEV_RECENT_CONTEXT` | blank | `scripts/runner.sh` | Injected recent experiment summary used when parent workers dispatch child runs. Usually auto-managed. | `- fix login regression (pass)` |
| `AUTOCLAWDEV_GH_ISSUES_CONTEXT` | blank | `scripts/runner.sh` | Injected GitHub issue summary used when parent workers dispatch child runs. Usually auto-managed. | `#142 Fix race in scheduler` |
| `AUTOCLAWDEV_BASELINE_JSON` | blank | `scripts/runner.sh`, `bin/autoclawdev` | Injected baseline summary JSON for worker runs. Usually auto-managed. | `{"profiles":{"security":"pass"}}` |
| `AUTOCLAWDEV_ASSIGNED_EXP_ID` | blank | `scripts/runner.sh` | Worker-assigned experiment id. Usually auto-managed. | `20260326-140012-security` |
| `AUTOCLAWDEV_ASSIGNED_CYCLE_NUMBER` | blank | `scripts/runner.sh` | Worker-assigned cycle number. Usually auto-managed. | `2` |
| `AUTOCLAWDEV_CHANGED_FILES` | blank | `scripts/runner.sh` | File list exported into profile validation commands. Usually auto-managed. | `apps/server/src/index.ts README.md` |

## Dashboard and Server

| Variable | Default | Used by | Description | Example |
| --- | --- | --- | --- | --- |
| `PORT` | `4100` for AutoClawDev dashboard, `3000` in scaffolded API template | `bin/autoclawdev-ui`, `apps/server/src/index.ts`, generated code in `scripts/create-project.sh` | HTTP port for the dashboard server; the project scaffolder also emits API templates that read `PORT`. | `4200` |
| `AUTOCLAWDEV_UI_PID_FILE` | `<workspace>/autoclawdev-ui.pid` | `bin/autoclawdev-ui` | PID file written by the dashboard launcher. | `/Users/alex/.openclaw/workspace/autoresearch/autoclawdev-ui.pid` |
| `AUTOCLAWDEV_UI_LOG_FILE` | `<workspace>/autoclawdev-ui.log` | `bin/autoclawdev-ui` | Dashboard launcher log file. | `/Users/alex/.openclaw/workspace/autoresearch/autoclawdev-ui.log` |
| `AUTOCLAWDEV_UI_SERVICE_LABEL` | `com.autoresearch.dashboard` | `bin/autoclawdev-ui` | `launchd` label used for background dashboard mode. | `com.autoclawdev.dashboard` |
| `AUTOCLAWDEV_UI_LAUNCH_AGENTS_DIR` | `~/Library/LaunchAgents` | `bin/autoclawdev-ui` | Directory where the launcher writes plist files. | `/Users/alex/Library/LaunchAgents` |
| `AUTOCLAWDEV_UI_PLIST_FILE` | `<launch-agents-dir>/<service-label>.plist` | `bin/autoclawdev-ui` | Explicit plist path override for launchd integration. | `/Users/alex/Library/LaunchAgents/com.autoclawdev.dashboard.plist` |

## Standard Shell Overrides

| Variable | Default | Used by | Description | Example |
| --- | --- | --- | --- | --- |
| `EDITOR` | `nano` | `bin/autoclawdev` | Editor used by interactive CLI edit commands. | `vim` |
| `TMPDIR` | `/tmp` | `scripts/runner.sh` | Temporary directory used for transient files. | `/var/folders/xx/tmp` |

## Notes

- `AUTOCLAWDEV_RESEARCH_MODEL`, `AUTOCLAWDEV_PLANNING_MODEL`, and `AUTOCLAWDEV_REVIEW_MODEL` show bootstrap defaults near the top of `runner.sh`, but normal project-config resolution replaces those with `opus` when the env vars are unset.
- `AUTOCLAWDEV_CODEX_MODEL` behaves similarly: the bootstrap value is `gpt-5.3-codex-spark`, while the common project-config fallback is `gpt-5.4`.
- Auto-managed variables like `AUTOCLAWDEV_ASSIGNED_EXP_ID`, `AUTOCLAWDEV_ASSIGNED_CYCLE_NUMBER`, and `AUTOCLAWDEV_CHANGED_FILES` are documented here for completeness but usually should not be exported by hand.
