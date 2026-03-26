# T3Code IDE Port — Execution Plan

## Source

T3Code: `~/Developer/t3code` — 435 files, 113K lines
Stack: Vite + React 19 + TanStack Router + TanStack Query + Tailwind 4 (same as AutoClawDev)

## Target

AutoClawDev web dashboard: `~/Developer/AutoClawDev/apps/web/`
AutoClawDev server: `~/Developer/AutoClawDev/apps/server/`

## T3Code Architecture

### Server (`apps/server/src/`)
- **Effect-TS layers** — uses `@effect/io` for dependency injection and service composition
- **WebSocket server** (`wsServer/`) — push bus for real-time updates (terminal output, git status, thread state)
- **Terminal** (`terminal/`) — spawns PTY processes, streams I/O over WebSocket
- **Git** (`git/`) — layered git operations (core, manager, GitHub CLI, text generation)
- **Orchestration** (`orchestration/`) — manages AI agent tool execution (decider pattern)
- **Checkpointing** (`checkpointing/`) — diffs, snapshots, checkpoint store
- **Provider** (`provider/`) — AI provider abstraction (Claude, Codex, etc.)
- **Persistence** (`persistence/`) — thread state, conversation history
- **Workspace entries** (`workspaceEntries.ts`) — file listing with chunking

### Web (`apps/web/src/`)
- **Routes**: `_chat.tsx` (main workspace), `_chat.$threadId.tsx` (thread view), `_chat.settings.tsx`
- **Components**:
  - `Sidebar.tsx` — thread list sidebar
  - `ChatView.tsx` — main chat/conversation view
  - `ComposerPromptEditor.tsx` — message input (Lexical-based rich editor)
  - `MessagesTimeline.tsx` — message history display
  - `DiffPanel.tsx` / `DiffPanelShell.tsx` — code diff viewer
  - `ThreadTerminalDrawer.tsx` — embedded terminal
  - `PlanSidebar.tsx` — execution plan display
  - `chat/ChangedFilesTree.tsx` — file tree of changes
  - `chat/ProviderModelPicker.tsx` — AI provider selector
  - `chat/ComposerPendingApprovalPanel.tsx` — tool approval UI
- **Stores**: zustand-based state management (store.ts, terminalStateStore.ts, composerDraftStore.ts, threadSelectionStore.ts)
- **Lib**: git queries, diff rendering, terminal context, server queries
- **Hooks**: useHandleNewThread, etc.

### Key Dependencies to Add
```
@xterm/xterm @xterm/addon-fit    # Terminal emulator
@pierre/diffs                     # Diff rendering
react-markdown                    # Markdown rendering in chat
@lexical/react lexical            # Rich text editor for composer
lucide-react                      # Icons
@tanstack/react-virtual           # Virtualized lists
@tanstack/react-pacer             # Throttling/debouncing
@base-ui/react                    # Base UI components
tailwind-merge                    # Tailwind class merging
```

## Phased Execution Plan

### Phase 1: Workspace Layout Shell
**Goal**: Replace the current flat page layout with a resizable workspace layout (sidebar + main + panel)

**Port from T3Code**:
- The sidebar/main/panel split layout pattern from `_chat.tsx`
- Resizable pane logic
- The sidebar component shell (simplified — list projects/threads instead of T3Code's full thread list)

**New route**: `/workspace` — the IDE view
**Keep existing**: All current pages stay as-is. Workspace is a new route.

**Files to create**:
- `apps/web/src/routes/workspace.tsx` — workspace layout route
- `apps/web/src/components/workspace/WorkspaceLayout.tsx` — resizable split panes
- `apps/web/src/components/workspace/WorkspaceSidebar.tsx` — project/file navigator
- `apps/web/src/components/workspace/WorkspacePanel.tsx` — right panel (diff, terminal)

### Phase 2: File Explorer + Code Viewer
**Goal**: Browse project files and view code with syntax highlighting

**Port from T3Code**:
- `workspaceEntries.ts` — file listing API
- `ChangedFilesTree.tsx` — tree component (adapt for full file tree)

**Server work**:
- `GET /api/workspace/files?path=...` — list directory
- `GET /api/workspace/file?path=...` — read file content
- `POST /api/workspace/file` — write file

**Frontend work**:
- File tree component with expand/collapse
- Code viewer with syntax highlighting (use `shiki` or `prism` — simpler than Monaco for read-only)
- Breadcrumb navigation

### Phase 3: Integrated Terminal
**Goal**: Spawn a shell in the project directory, stream I/O

**Port from T3Code**:
- `terminal/` server layer — PTY spawning, I/O streaming
- `ThreadTerminalDrawer.tsx` — terminal UI
- `@xterm/xterm` integration

**Server work**:
- WebSocket endpoint for terminal I/O (`/ws/terminal`)
- PTY management (spawn, resize, kill)

**Frontend work**:
- Xterm.js component
- Terminal drawer (bottom panel, resizable)
- Multiple terminal tabs

### Phase 4: Enhanced Chat with Tool Use
**Goal**: Chat that can read/write/edit files, run commands, show diffs

**Port from T3Code**:
- `ChatView.tsx` — enhanced chat view
- `MessagesTimeline.tsx` — message rendering with tool call display
- `ComposerPromptEditor.tsx` — rich message input (simplify to textarea first, Lexical later)
- `ComposerPendingApprovalPanel.tsx` — tool approval UI
- `ChatMarkdown.tsx` — markdown rendering for AI responses

**Server work**:
- Extend `/api/chat` to support tool use callbacks
- File read/write/edit tool handlers
- Bash execution tool handler
- Diff generation tool handler

**Frontend work**:
- Tool call rendering (show what file was read/edited/created)
- Approval flow (approve/deny tool execution)
- Diff display inline in chat
- File reference chips in messages

### Phase 5: Diff Viewer + Git Integration
**Goal**: See what changed, review diffs, commit from the UI

**Port from T3Code**:
- `DiffPanel.tsx` / `DiffPanelShell.tsx` — diff viewer
- `@pierre/diffs` integration
- `git/` server layer — status, diff, log, commit
- `GitActionsControl.tsx` — commit/branch UI
- `BranchToolbar.tsx` — branch management

**Server work**:
- `GET /api/workspace/git/status` — git status
- `GET /api/workspace/git/diff` — git diff
- `GET /api/workspace/git/log` — git log
- `POST /api/workspace/git/commit` — commit changes

**Frontend work**:
- Side-by-side diff viewer
- Git status panel
- Commit dialog
- Branch selector

## Notes

- T3Code uses Effect-TS layers for DI — AutoClawDev server is plain Express. Adapt by extracting the core logic from Effect layers into plain functions.
- T3Code's WebSocket push bus can be adapted to use the existing SSE infrastructure or a new WebSocket endpoint.
- Start with read-only features (view files, view diffs) before write features (edit, commit).
- Each phase should be independently deployable and useful.
- The existing chat component (`/chat` route) can be upgraded incrementally.

## T3Code Mapper Agent Results (2026-03-26)

### Critical Finding: Same Stack
T3Code uses the EXACT same stack as AutoClawDev:
- Vite 8 + React 19 + TanStack Router + TanStack Query + Tailwind 4 + Zustand
- No framework translation needed — components can be copied with minimal changes

### NOT Monaco — Uses Lexical
T3Code does NOT use Monaco editor. It uses **Lexical** (@lexical/react) for the prompt composer.
Code viewing relies on markdown rendering + @pierre/diffs for diffs.

### Backend: Effect-TS + WebSocket RPC
T3Code server uses Effect-TS layers (functional DI) and WebSocket-based JSON-RPC, not REST.
AutoClawDev server is plain Express. Options:
- Option A: Add WebSocket support to Express server (ws library)
- Option B: Port to REST endpoints (simpler but loses real-time push)
- Recommended: Option A for terminal, REST for file/git operations

### Reusability Matrix
- **Direct copy (70%)**: Zustand stores, utility functions, business logic, most UI components
- **Minor tweaks (20%)**: Route files (same router), component imports, theme tokens
- **Rewrite (10%)**: Effect-TS backend layers → plain Express, WebSocket transport setup

### Key Files to Copy First
**Frontend (copy directly):**
- `src/store.ts` → app state (projects, threads)
- `src/composerDraftStore.ts` → draft message state
- `src/terminalStateStore.ts` → terminal UI state
- `src/session-logic.ts` → message derivation
- `src/composer-logic.ts` → prompt parsing
- `src/components/ui/*` → 30+ headless UI components
- `src/components/ChatView.tsx` → main chat container
- `src/components/Sidebar.tsx` → navigation sidebar
- `src/components/DiffPanel.tsx` → diff viewer
- `src/components/ThreadTerminalDrawer.tsx` → terminal
- `src/components/chat/MessagesTimeline.tsx` → message display
- `src/components/chat/ChangedFilesTree.tsx` → file tree

**Backend (adapt from Effect-TS to Express):**
- `terminal/` → PTY management (need node-pty or similar)
- `git/` → git operations (can use execSync like workspace.ts already does)
- `orchestration/` → command/event handling (simplify to Express routes)
- `workspaceEntries.ts` → file listing (already built in workspace.ts)
