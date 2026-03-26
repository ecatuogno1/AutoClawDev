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
