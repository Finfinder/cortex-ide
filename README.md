# Cortex IDE

**Agent-First IDE** — lightweight, local-first development environment built to solve the context overhead problem of VS Code + GitHub Copilot.

## The Problem

VS Code + Copilot sends **40–50K tokens** of boilerplate context even for simple prompts (e.g., `/commit` sends 33K+). This makes small local models unusable and incurs unnecessary API costs. Research confirmed: **no VS Code setting reduces this base harness overhead** — all customizations are additive.

## The Solution

Cortex IDE uses a **hybrid architecture**: OpenCode as the agent backend (via SDK port 4096) + a custom Tauri 2.x + React 19.2 frontend. OpenCode is the only evaluated platform with **built-in compaction** (`auto`/`prune`/`reserved` tokens) and `small_model` support — directly solving the 40–50K overhead problem and enabling small local models (mlx on Mac, llama.cpp on Windows/CUDA, Ollama, LM Studio).

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                               Cortex IDE Frontend                                │
│                React 19.2 + TypeScript + Vite 7 + CSS Modules                    │
│ ┌──────────┬──────────────┬──────────────────┬─────────────────┬───────────────┐ │
│ │ Chat     │ Patch Review │ Settings         │ Session / Agent │ Tool Calls /  │ │
│ │ Panel    │ (Diff View)  │ (Infra/MCP/LLM)  │ & Model Select  │ Permissions   │ │
│ └──────────┴──────────────┴──────────────────┴─────────────────┴───────────────┘ │
├──────────────────────────────────────────────────────────────────────────────────┤
│                           Tauri 2.x (Rust Desktop Shell)                         │
│   Window lifecycle • IPC commands • OpenCode Lifecycle Manager • Health Checker  │
├──────────────────────────────────────────────────────────────────────────────────┤
│                          OpenCode Backend (SDK :4096)                            │
│   SSE Streaming Parser • Compaction Engine • Model Switching • Session Manager   │
├──────────────────────────────────────────────────────────────────────────────────┤
│                          Local RAG & Infrastructure                              │
│   Tree-sitter Code Chunker • bge-m3 Embeddings (:8081) • Qdrant Vector Store    │
│   MCP Server Manager (Deny-First Security & Audit Logs)                          │
├──────────────────────────────────────────────────────────────────────────────────┤
│                          LLM Providers & Local Models                            │
│   mlx (macOS) • llama.cpp (Windows/CUDA) • Ollama • LM Studio • OpenAI • Claude  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

## Roadmap & Implementation Status

| Phase | Status | Description |
|-------|--------|-------------|
| **1. Tauri Scaffold + React 19.2 + Vite + Diff Viewer** | ✅ **COMPLETE** | Tauri 2.x shell, React 19.2, TypeScript strict mode, Vite with path aliases, ESLint + Prettier, DiffViewer (`react-diff-viewer-continued`), GitDiffOutput, IPC wrapper with types, Vitest + RTL test setup. |
| **2. OpenCode Integration** | ✅ **COMPLETE** | Auto-detect OpenCode binary in Rust, process lifecycle manager (start/stop/restart), HTTP SDK client (port 4096), robust SSE streaming parser, compaction config (`auto`/`prune`/`reserved`), health check polling & readiness events (`backend://ready`), `useOpencodeHealth` React hook. |
| **3. Agent UI** | ✅ **COMPLETE** | Chat panel with live streaming + GFM markdown rendering, session list with creation & switching, tool call visualization & approval flow, patch queue & review with unified/split diff toggle + raw git diff support, agent selector (15 roles), model selector, status bar, error banner, keyboard shortcuts (Ctrl+N, Ctrl+K, Esc), WCAG 2.1 AA accessibility. |
| **4. MCP & Local Infrastructure + RAG** | ✅ **COMPLETE** | Comprehensive Settings UI (Infra, LLM Providers, MCP Servers, Audit Log), MCP Server management with deny-first permissions store & interactive approval modal, audit logging, workspace vector indexing engine (Tree-sitter & regex fallback chunker, bge-m3 / OpenAI embeddings, Qdrant vector DB integration), multi-provider LLM abstraction layer (Ollama, LM Studio, OpenAI, Anthropic, custom OpenAI-compatible). |
| **5. Skill / Agent / Prompt Migration & AI Modules** | ✅ **COMPLETE** | 70+ domain skills (`.github/skills/`), 15 specialized agents (`.github/agents/`), 28 prompt templates (`.github/prompts/`), automated code review engine, multi-agent collaboration manager, continuous learning tracker, and skill/agent marketplace. |
| **6. Tray, Auto-Update & Packaging** | 🟡 **IN PROGRESS** | Tauri window lifecycle & bundle target configurations (NSIS installer for Windows, DMG for macOS, AppImage for Linux), system tray & updater framework integration, E2E test suites (Playwright). |

## Tech Stack

- **Desktop Shell**: Tauri 2.x (Rust backend — process management, health check polling, IPC commands, app opener)
- **Frontend**: React 19.2 + TypeScript 5.8 (strict mode) + Vite 7 + CSS Modules
- **Agent Engine**: OpenCode via SDK port 4096 (HTTP & SSE streaming)
- **Diff Rendering**: `react-diff-viewer-continued` (read-only unified & split views) + custom Git diff parser
- **Workspace RAG**:
  - Tree-sitter & regex fallback code chunking
  - `bge-m3` embedding service (configurable, default `:8081`) / OpenAI embeddings
  - Qdrant Vector Database (configurable, default `:6333`)
- **MCP Security**: Deny-first permission engine with interactive UI prompt modal & audit trail logging
- **LLM Abstraction**: Multi-provider support (mlx / llama.cpp / Ollama / LM Studio / OpenAI / Anthropic / Custom endpoints)
- **Testing**: Vitest 4 + React Testing Library (253 unit/integration tests) + Playwright 1.62 E2E test suite
- **Code Quality**: ESLint 10 + Prettier + TypeScript strict mode

## Getting Started

### Prerequisites

- **Node.js** 20+ and **npm** 9+
- **Rust** toolchain (`rustc` 1.78+, `cargo`)
- **Tauri CLI**: `npm install -g @tauri-apps/cli`
- **OpenCode CLI**: `npm install -g opencode-ai` (or let Cortex IDE auto-detect it on system PATH)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd cortex-ide

# Install frontend & dev dependencies
npm install

# Verify Tauri setup
npm run tauri -- --version
```

### Development

```bash
# Run Vite dev server (frontend only mock/standalone)
npm run dev

# Run Tauri desktop app (React frontend + Rust backend + OpenCode spawn)
npm run tauri dev

# Run unit & integration test suite (253 tests)
npm run test

# Run Vitest in watch mode
npm run test:watch

# Run Playwright end-to-end tests
npm run test:e2e

# Code linting & formatting
npm run lint
npm run lint:fix
npm run format
npm run format:check
```

### Build

```bash
# Build frontend bundle
npm run build

# Build production desktop installer
npm run tauri build
```

Production output artifacts:
- **Windows**: `src-tauri/target/release/bundle/nsis/cortex-ide_0.0.1_x64-setup.exe`
- **macOS**: `src-tauri/target/release/bundle/dmg/cortex-ide_0.0.1_x64.dmg`
- **Linux**: `src-tauri/target/release/bundle/appimage/cortex-ide_0.0.1_amd64.AppImage`

## Project Structure

```
cortex-ide/
├── src/                          # React 19.2 Frontend
│   ├── components/               # UI components
│   │   ├── AgentSelector/        # Agent role switcher (15 agents)
│   │   ├── Chat/                 # Chat panel, message list, streaming
│   │   ├── DiffViewer/           # react-diff-viewer-continued wrapper
│   │   ├── ErrorBanner/          # Global error notification banner
│   │   ├── GitDiff/              # Raw git diff view renderer
│   │   ├── Layout/               # App layout sidebar & main panel
│   │   ├── Markdown/             # React Markdown + GFM code highlighter
│   │   ├── ModelSelector/        # LLM provider & model switcher
│   │   ├── PatchReview/          # Pending patch queue & review UI
│   │   ├── Sessions/             # Session list & management
│   │   ├── Settings/             # Infra, LLM, MCP & Audit settings dialogs
│   │   ├── StatusBar/            # OpenCode & RAG connection status bar
│   │   ├── Theme/                # Dark/light theme provider & toggle
│   │   └── ToolCall/             # Tool call request & approval view
│   ├── lib/                      # Core business logic & SDK adapters
│   │   ├── agent/                # AgentContext, patch utils & state management
│   │   ├── ai/                   # Code review, collaboration, learning, marketplace
│   │   ├── llm/                  # Provider abstraction (Ollama/LM Studio/OpenAI/Anthropic)
│   │   ├── mcp/                  # MCP server manager, permissions & audit log
│   │   ├── opencode/             # OpenCode client, SSE parser, config, health check
│   │   ├── rag/                  # Code chunker, embeddings, Qdrant client & indexer
│   │   ├── utils/                # Health check & URL validation utilities
│   │   ├── constants.ts          # App constants & default configurations
│   │   ├── ipc.ts                # Type-safe Tauri IPC wrapper
│   │   └── settings.ts           # Settings store & persistence manager
│   ├── App.tsx                   # Main workspace layout & state binding
│   └── main.tsx                  # React DOM entry point
├── src-tauri/                    # Rust Tauri Desktop Backend
│   ├── src/
│   │   ├── opencode/             # Binary detection, process spawn manager & health checker
│   │   │   ├── detect.rs         # System PATH binary detector
│   │   │   ├── health.rs         # OpenCode health HTTP polling engine
│   │   │   ├── mod.rs            # Rust module exporter
│   │   │   └── spawn.rs          # Process launcher (SIGTERM -> SIGKILL)
│   │   ├── lib.rs                # Tauri command handlers & setup lifecycle
│   │   └── main.rs               # Binary entry point
│   ├── Cargo.toml                # Rust dependencies & metadata
│   └── tauri.conf.json           # Tauri app configuration & permissions
├── e2e/                          # Playwright E2E Test Suite
│   ├── app.spec.ts               # Core app layout E2E test
│   ├── chat.spec.ts              # Chat flow & message streaming E2E test
│   ├── model-selector.spec.ts    # Model switching E2E test
│   ├── patches.spec.ts           # Patch queue review E2E test
│   ├── rag.spec.ts               # RAG indexing & Qdrant query E2E test
│   ├── sessions.spec.ts          # Session management E2E test
│   └── toolcalls.spec.ts         # Tool execution approval E2E test
├── .github/                      # Skill, Agent & Prompt Repository
│   ├── agents/                   # 15 agent role definitions
│   ├── skills/                   # 70+ domain-specific skills
│   ├── prompts/                  # 28 prompt templates
│   └── Issue/                    # Research documents & implementation plans
└── public/                       # Static app assets
```

## Infrastructure Configuration

All local services and LLM providers are fully configurable in the **Settings UI** with zero hardcoded endpoints:

| Service | Default Endpoint | Configurable Parameters |
|---------|------------------|-------------------------|
| **OpenCode Engine** | `http://127.0.0.1:4096` | Port, binary path, CORS, auto-start |
| **Qdrant Vector DB** | `http://localhost:6333` | Endpoint URL, API key, collection name, timeout |
| **bge-m3 Embeddings** | `http://localhost:8081` | Service URL, model identifier, batch size |
| **Local LLM (mlx / llama.cpp)** | `http://localhost:8080` | Server URL, model name, API key, context window |
| **Ollama / LM Studio** | `http://localhost:11434` / `:1234` | Endpoint URL, selected model, keep-alive |
| **Cloud LLMs (OpenAI / Anthropic)** | Official APIs | API keys, custom base URLs, organization IDs |
| **MCP Servers** | Dynamic | Command prefix, CLI arguments, environment variables, permissions |

## Key Features

- **Context Compaction Engine**: Solves the 40–50K token harness overhead by compacting prompts down to <5K tokens via OpenCode's `auto`/`prune`/`reserved` algorithm.
- **Local-First & Offline Ready**: Seamlessly runs with local models (mlx on Mac, llama.cpp on Windows/CUDA, Ollama, LM Studio) for zero API costs and full data privacy.
- **Granular MCP Security**: Deny-first permission model for Model Context Protocol servers with interactive user permission popups and full audit logging.
- **Workspace RAG Semantic Search**: Codebase indexing powered by Tree-sitter AST chunking, `bge-m3` embeddings, and Qdrant vector storage for context retrieval.
- **Interactive Patch Review**: Unified and split side-by-side diff viewer with raw git diff support, line-by-line inspection, and one-click patch application.
- **15 Specialized Agent Roles**: Software Engineer, Architect, Code Reviewer, Context Engineer, Security Auditor, and more.
- **70+ Domain Skills & Prompts**: Built-in skill library covering code quality, performance optimization, unit testing, and architectural design patterns.
- **Cross-Platform Support**: Native binaries for Windows (NSIS installer), macOS (DMG bundle), and Linux (AppImage).

## License

MIT


