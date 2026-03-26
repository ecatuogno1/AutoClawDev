#!/usr/bin/env bash
set -uo pipefail

# ──────────────────────────────────────────────────────────────────────────────
# create-project.sh — Scaffold a new project from template
#
# Usage:
#   create-project.sh <name> [--path <dir>] [--template <template>] [--init]
#   create-project.sh my-app
#   create-project.sh my-app --init
#   create-project.sh my-app --path ~/Projects --template fullstack
# ──────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEV_DIR="${AUTOCLAW_DEV_DIR:-$HOME/Developer}"
PROJECTS_DIR="${AUTOCLAWDEV_PROJECTS_DIR:-$HOME/.local/lib/autoclawdev/projects}"

PROJECT_NAME=""
PROJECT_PATH=""
TEMPLATE="fullstack"
DO_INIT=false

# Parse args
ARGS=("$@")
i=0
while [ $i -lt ${#ARGS[@]} ]; do
  arg="${ARGS[$i]}"
  case "$arg" in
    --path)     i=$((i+1)); [ $i -lt ${#ARGS[@]} ] && PROJECT_PATH="${ARGS[$i]}" ;;
    --template) i=$((i+1)); [ $i -lt ${#ARGS[@]} ] && TEMPLATE="${ARGS[$i]}" ;;
    --init)     DO_INIT=true ;;
    --help|-h)
      echo "Usage: create-project.sh <name> [--path <dir>] [--template <template>] [--init]"
      echo ""
      echo "Templates: fullstack (default), api, web, mobile"
      echo ""
      echo "Options:"
      echo "  --path <dir>      Parent directory (default: ~/Developer)"
      echo "  --template <name> Project template"
      echo "  --init            Also register with AutoClawDev"
      exit 0
      ;;
    -*)         ;;
    *)          [ -z "$PROJECT_NAME" ] && PROJECT_NAME="$arg" ;;
  esac
  i=$((i+1))
done

if [ -z "$PROJECT_NAME" ]; then
  echo "ERROR: project name required"
  echo "Usage: create-project.sh <name> [--init]"
  exit 1
fi

# Resolve project path
[ -z "$PROJECT_PATH" ] && PROJECT_PATH="$DEV_DIR/$PROJECT_NAME"

if [ -d "$PROJECT_PATH" ]; then
  echo "ERROR: Directory already exists: $PROJECT_PATH"
  exit 1
fi

# ── Scaffold ─────────────────────────────────────────────────────────

echo ""
echo "Creating project: $PROJECT_NAME"
echo "Path: $PROJECT_PATH"
echo "Template: $TEMPLATE"
echo ""

mkdir -p "$PROJECT_PATH"
cd "$PROJECT_PATH"

# ── Git init ─────────────────────────────────────────────────────────

git init -b main >/dev/null 2>&1

# ── Base files ───────────────────────────────────────────────────────

cat > .gitignore << 'EOF'
node_modules/
dist/
build/
.output/
.cache/
.autoclaw/
.DS_Store
*.log
.env
.env.local
.env.*.local
EOF

cat > .nvmrc << 'EOF'
22
EOF

cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx"
  }
}
EOF

cat > README.md << EOF
# $PROJECT_NAME

Created with AutoClawDev.

## Development

\`\`\`bash
pnpm install
pnpm dev
\`\`\`

## Testing

\`\`\`bash
pnpm test
pnpm lint
\`\`\`
EOF

cat > CLAUDE.md << EOF
# $PROJECT_NAME

## Project Structure

This is a Vite + React + TypeScript project with TanStack Router and Tailwind CSS.

## Development Workflow

\`\`\`bash
pnpm dev          # Start dev server
pnpm build        # Production build
pnpm test         # Run tests
pnpm lint         # Run ESLint
pnpm typecheck    # TypeScript check
\`\`\`

## Architecture

- **Frontend**: React 19 + TanStack Router + TanStack Query + Tailwind CSS 4
- **Components**: shadcn/ui
- **Testing**: Vitest
- **Linting**: ESLint

## Conventions

- Use TypeScript strict mode
- Use TanStack Router for routing (file-based)
- Use TanStack Query for server state
- Use Tailwind CSS for styling
- Use shadcn/ui components
EOF

# ── Template: fullstack ──────────────────────────────────────────────

case "$TEMPLATE" in
  fullstack|default)
    echo "  Scaffolding fullstack template..."

    cat > package.json << EOF
{
  "name": "$PROJECT_NAME",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit"
  }
}
EOF

    # Install dependencies
    echo "  Installing dependencies..."
    pnpm add react react-dom @tanstack/react-router @tanstack/react-query tailwind-merge lucide-react 2>/dev/null
    pnpm add -D typescript @types/react @types/react-dom vite @vitejs/plugin-react @tailwindcss/vite tailwindcss @tanstack/router-plugin vitest @testing-library/react eslint 2>/dev/null

    # Initialize shadcn
    echo "  Setting up shadcn/ui..."
    pnpm add @base-ui/react class-variance-authority clsx 2>/dev/null

    # Vite config
    cat > vite.config.ts << 'EOF'
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [TanStackRouterVite({ quoteStyle: "double" }), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
  },
});
EOF

    # Source structure
    mkdir -p src/{components,routes,lib,hooks,types}

    cat > src/main.tsx << 'EOF'
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 10000, retry: 1 },
  },
});

const router = createRouter({
  routeTree,
  context: { queryClient },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
EOF

    cat > src/index.css << 'EOF'
@import "tailwindcss";
EOF

    cat > src/routes/__root.tsx << 'EOF'
import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <Outlet />
    </div>
  ),
});
EOF

    cat > src/routes/index.tsx << EOF
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">$PROJECT_NAME</h1>
        <p className="text-gray-500">Ready to build.</p>
      </div>
    </div>
  );
}
EOF

    cat > src/lib/utils.ts << 'EOF'
import { twMerge } from "tailwind-merge";

type ClassInput = string | false | null | undefined;

export function cn(...inputs: ClassInput[]) {
  return twMerge(inputs.filter(Boolean).join(" "));
}
EOF

    cat > index.html << EOF
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>$PROJECT_NAME</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
EOF

    # ESLint config
    cat > eslint.config.js << 'EOF'
import js from "@eslint/js";

export default [
  js.configs.recommended,
  { ignores: ["dist/", "node_modules/", "*.gen.*"] },
];
EOF
    ;;

  api)
    echo "  Scaffolding API template..."
    cat > package.json << EOF
{
  "name": "$PROJECT_NAME",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "lint": "eslint ."
  }
}
EOF
    pnpm add express cors 2>/dev/null
    pnpm add -D typescript @types/express @types/cors tsx vitest eslint 2>/dev/null
    mkdir -p src/routes src/lib
    cat > src/index.ts << 'EOF'
import express from "express";
import cors from "cors";

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
EOF
    ;;

  *)
    echo "ERROR: Unknown template: $TEMPLATE"
    echo "Available: fullstack, api"
    exit 1
    ;;
esac

# ── Initial commit ───────────────────────────────────────────────────

echo "  Creating initial commit..."
git add -A
git commit -m "Initial project scaffold ($TEMPLATE template)" >/dev/null 2>&1

# ── AutoClawDev .autoclaw dir ────────────────────────────────────────

mkdir -p .autoclaw/{memory,reviews,builds,cycles,runs}

echo ""
echo "Project created: $PROJECT_NAME"
echo "Path: $PROJECT_PATH"
echo ""

# ── Optional: init with AutoClawDev ──────────────────────────────────

if [ "$DO_INIT" = true ]; then
  "$SCRIPT_DIR/init-project.sh" "$PROJECT_NAME" "$PROJECT_PATH"
fi
