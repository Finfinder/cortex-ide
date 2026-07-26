# Cortex IDE

**Agent-First IDE** — lightweight, local-first development environment built to solve the context overhead problem of VS Code + GitHub Copilot.

## The Problem

VS Code + Copilot sends **40–50K tokens** of boilerplate context even for simple prompts (e.g., `/commit` sends 33K+). This makes small local models unusable and incurs unnecessary API costs. Research confirmed: **no VS Code setting reduces this base harness overhead** — all customizations are additive.

## The Solution

Cortex IDE uses a **hybrid architecture**: OpenCode as the agent backend (via SDK port 4096) + a custom Tauri + React frontend. OpenCode is the only evaluated platform with **built-in compaction** (`auto`/`prune`/`reserved` tokens) and `small_model` support — directly solving the 40–50K overhead problem and enabling small local models (mlx on Mac, llama.cpp on Windows/CUDA).

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Cortex IDE Frontend             │
│  React 19.2 + TypeScript + Vite + CSS Modules   │
│  ┌──────────┬──────────────┬──────────────────┐ │
│  │  Chat    │  Patch Review│  Settings        │ │
│  │  Panel   │  (Diff View) │  (Infra/MCP)     │ │
│  └──────────┴──────────────┴──────────────────┘ │
├─────────────────────────────────────────────────┤
│              Tauri 2.x (Rust Shell)              │
│  Window lifecycle • IPC • System Tray • Updater  │
├─────────────────────────────────────────────────┤
│            OpenCode Backend (SDK :4096)          │
│  SSE Streaming • Compaction • small_model       │
│  MCP Servers • Session Management               │
├─────────────────────────────────────────────────┤
│           Local Infrastructure                   │
│  Qdrant (:6333) • bge-m3 (:8081)               │
│  mlx (:8080, macOS) • llama.cpp (Windows/CUDA)  │
└─────────────────────────────────────────────────┘
```

## Roadmap — 6 Phases

| Phase | Status | Description |
|-------|--------|-------------|
| **1. Tauri Scaffold + React 19.2 + Vite + Diff Viewer** | ✅ **COMPLETE** | Tauri 2.x shell, React 19.2, TypeScript strict mode, Vite with path aliases, ESLint + Prettier, DiffViewer (`react-diff-viewer-continued`), GitDiffOutput, IPC wrapper with types, Vitest tests (8/8 passing). |
| **2. OpenCode Integration** | ⏭️ NEXT | Auto-detect OpenCode binary on PATH, spawn per-app lifecycle (start/stop/restart), SDK HTTP client (port 4096), SSE streaming, compaction config (`auto`/`prune`/`reserved`), `small_model` per-agent, health check + reconnect, graceful shutdown (SIGTERM → SIGKILL). |
| **3. Agent UI** | 📋 Planned | Chat panel with streaming + markdown, session list, tool calls display, patch review with diff viewer toggle (unified/split + git diff), agent selector (15 agents), status indicators, keyboard shortcuts, WCAG 2.1 AA accessibility. |
| **4. MCP + Infra** | 📋 Planned | Settings UI for all infrastructure (Qdrant, bge-m3, mlx/llama.cpp — zero hardcoded endpoints), MCP server management (enable/disable, args, env), deny-first permissions with audit log, workspace indexing (Tree-sitter chunking, incremental reindex, SQLite/sqlite-vec), LLM provider abstraction. |
| **5. Skill/Agent/Prompt Migration** | 📋 Planned | Migrate 70+ skills, 15 agents, 28 prompts from `.github/` format to OpenCode `AGENTS.md` + `@file` lazy loading, generator script, validation script, agent/skill/prompt browser UI. |
| **6. Tray, Auto-Update, Packaging** | 📋 Planned | System tray with status menu, Tauri updater with signature verification, code signing (Windows signtool, macOS codesign + notarization), CI/CD release pipeline (GitHub Actions), first-run onboarding wizard. |

## Tech Stack

- **Desktop shell**: Tauri 2.x (Rust minimal — window lifecycle, IPC, system tray, updater)
- **Frontend**: React 19.2 + TypeScript strict mode + Vite 7 + CSS Modules
- **Agent backend**: OpenCode (MIT, 190k stars) via SDK port 4096 (SSE streaming)
- **Diff rendering**: `react-diff-viewer-continued` (~12KB, read-only unified/split diff)
- **Vector DB**: Qdrant (:6333 default, configurable)
- **Embeddings**: bge-m3 (:8081 default, configurable)
- **LLM inference**: mlx (macOS, :8080) / llama.cpp (Windows/CUDA, :8080)
- **Testing**: Vitest + React Testing Library
- **Linting**: ESLint 10 + Prettier + TypeScript strict

## Getting Started

### Prerequisites

- **Node.js** 20+ and **npm** 9+
- **Rust** toolchain (rustc 1.78+, cargo)
- **Tauri CLI**: `npm install -g @tauri-apps/cli`
- **OpenCode** (optional, for Phase 2+): `npm install -g @opencode-ai/opencode`

### Installation

```bash
# Clone and install dependencies
git clone <repository-url>
cd cortex-ide
npm install

# Install Rust dependencies
cargo tauri dev -- --help  # verifies Tauri setup
```

### Development

```bash
# Start Vite dev server (frontend only)
npm run dev

# Start Tauri app (frontend + Rust backend)
npm run tauri dev

# Run tests
npm run test

# Lint and format
npm run lint
npm run lint:fix
npm run format
```

### Build

```bash
# Build frontend for production
npm run build

# Build Tauri desktop app
npm run tauri build
```

Outputs:
- **Windows**: `src-tauri/target/release/cortex-ide.exe` (NSIS installer)
- **macOS**: `src-tauri/target/release/bundle/dmg/` (DMG, universal binary)
- **Linux**: `src-tauri/target/release/bundle/appimage/` (AppImage)

## Project Structure

```
cortex-ide/
├── src/                    # React frontend
│   ├── components/         # UI components
│   │   ├── DiffViewer/     # react-diff-viewer-continued wrapper
│   │   ├── GitDiffOutput/  # raw git diff renderer
│   │   ├── Layout/         # sidebar + main panel layout
│   │   └── Theme/          # dark/light theme provider
│   ├── hooks/              # custom React hooks
│   ├── lib/                # utilities, IPC wrappers
│   │   └── ipc.ts          # invoke/listen type-safe wrapper
│   └── App.tsx             # root component
├── src-tauri/              # Rust backend (Tauri)
│   ├── src/
│   │   ├── main.rs         # window lifecycle, IPC commands
│   │   └── lib.rs          # library module
│   ├── Cargo.toml          # Rust dependencies
│   └── tauri.conf.json     # Tauri configuration
├── .github/
│   ├── skills/             # 70+ domain skills (Phase 5 migration target)
│   ├── agents/             # 15 agent definitions (Phase 5 migration target)
│   ├── prompts/            # 28 prompt templates (Phase 5 migration target)
│   └── Issue/              # Research docs and implementation plans
└── public/                 # static assets
```

## Configuration

All infrastructure endpoints are **configurable in Settings UI** — zero hardcoded values:

| Service | Default URL | Configurable |
|---------|-------------|--------------|
| Qdrant | `http://localhost:6333` | ✅ URL, API key, timeout |
| bge-m3 | `http://localhost:8081` | ✅ URL, model name, timeout |
| mlx (macOS) | `http://localhost:8080` | ✅ URL, model, API key |
| llama.cpp (Windows) | `http://localhost:8080` | ✅ URL, model, API key |
| OpenCode | `http://localhost:4096` | ✅ Port, binary path |
| MCP servers | — | ✅ command, args, env per server |

## Key Features (Planned)

- **Context compaction**: Reduce 40–50K token overhead to <5K via OpenCode compaction + small_model
- **Local-first**: All inference runs locally (mlx/llama.cpp) — no cloud dependency
- **MCP integration**: Model Context Protocol servers with deny-first permissions and audit log
- **Workspace indexing**: Tree-sitter chunking + vector embeddings for semantic retrieval
- **Patch review**: Unified/split diff viewer with git diff toggle, approve/reject workflow
- **15 built-in agents**: software-engineer, architect, code-reviewer, context-engineer, etc.
- **70+ skills**: Domain-specific instructions for code quality, testing, security, performance
- **Cross-platform**: Windows (NSIS/MSI), macOS (DMG universal), Linux (AppImage/deb/rpm)

## Contributing

This is an active research and development project. See `.github/Issue/` for detailed implementation plans and research documents.

## License

MIT

