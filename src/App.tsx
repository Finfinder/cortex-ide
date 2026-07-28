import { useEffect, useState } from "react";
import { sessionModelToConfig, type ModelConfig } from '@/lib/opencode/config';
import { Layout } from "@/components/Layout";
import { useTheme } from "@/components/Theme";
import { AgentProvider, useAgent } from "@/lib/agent";
import type { PendingPatch } from "@/lib/agent/types";
import { SessionList } from "@/components/Sessions";
import { ChatPanel } from "@/components/Chat";
import { PatchQueue } from "@/components/PatchReview";
import { StatusBar } from "@/components/StatusBar";
import { ErrorBanner } from "@/components/ErrorBanner";

const OPENCODE_BASE_URL = "http://127.0.0.1:4096";
const DEFAULT_AGENT = "software-engineer";

function AgentWorkspace() {
  const { state, createSession, cancelGeneration } = useAgent();
  const { theme, toggleTheme } = useTheme();
  const [agent, setAgent] = useState(DEFAULT_AGENT);
  const [model, setModel] = useState<ModelConfig | undefined>(undefined);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const activeSession = state.sessions.find((s) => s.id === state.activeSessionId);
  const activeModel = sessionModelToConfig(activeSession?.model);

  // Use activeModel as fallback if model hasn't been explicitly set
  const effectiveModel = model ?? activeModel;

  // Handle agent change with model sync — creates a new session with the agent's model
  const handleAgentChange = (agentName: string, agentModel?: ModelConfig) => {
    setAgent(agentName);
    if (agentModel) {
      setModel(agentModel);
      // OpenCode does not support changing model mid-session; create a new one
      const modelArg = agentModel.model.includes('/')
        ? { id: agentModel.model.split('/')[1], providerID: agentModel.model.split('/')[0] }
        : { id: agentModel.model, providerID: agentModel.provider };
      void createSession(modelArg);
    }
  };

  // Handle model change — creates a new session with the selected model
  const handleModelChange = (newModel: ModelConfig) => {
    setModel(newModel);
    const modelArg = newModel.model.includes('/')
      ? { id: newModel.model.split('/')[1], providerID: newModel.model.split('/')[0] }
      : { id: newModel.model, providerID: newModel.provider };
    void createSession(modelArg);
  };

  // Global keyboard shortcuts (3.10)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        void createSession(effectiveModel ? { id: effectiveModel.model.split('/')[1] ?? effectiveModel.model, providerID: effectiveModel.model.split('/')[0] ?? effectiveModel.provider } : undefined);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setPaletteOpen(false);
        if (state.generating) void cancelGeneration();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createSession, cancelGeneration, state.generating, model, effectiveModel]);

  const handleEditExternal = (patch: PendingPatch) => {
    // Dynamic import so the plugin is only loaded inside Tauri (browser tests
    // and dev server don't have the Tauri IPC bridge).
    void import("@tauri-apps/plugin-opener")
      .then((m) => m.openPath(patch.file))
      .catch(() => {
        /* not running inside Tauri — no-op */
      });
  };

  return (
    <Layout
      sidebar={
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 12px 0",
            }}
          >
            <strong style={{ fontSize: "13px" }}>Cortex IDE</strong>
            <button
              onClick={toggleTheme}
              style={{
                background: "transparent",
                border: "1px solid var(--border-color)",
                borderRadius: "4px",
                color: "var(--text-secondary)",
                fontSize: "11px",
                padding: "2px 8px",
              }}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? "☀" : "🌙"}
            </button>
          </div>
          <SessionList model={model} />
        </>
      }
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          margin: "-16px",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            padding: "8px 12px",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <span style={{ fontSize: "13px", fontWeight: 600 }}>
            {activeSession?.title ?? "Chat"}
          </span>
        </header>

        <ErrorBanner />

        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <ChatPanel 
            agentName={agent} 
            onAgentChange={handleAgentChange} 
            model={effectiveModel} 
            onModelChange={handleModelChange} 
          />
          <PatchQueue onEditExternal={handleEditExternal} />
        </div>

        <StatusBar />

        {paletteOpen && (
          <dialog
            open
            aria-label="Command palette"
            style={{
              position: "fixed",
              top: "15%",
              left: "50%",
              transform: "translateX(-50%)",
              width: "420px",
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
              borderRadius: "8px",
              boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
              zIndex: 50,
              padding: "8px",
            }}
          >
            <button
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                background: "transparent",
                border: "none",
                color: "var(--text-primary)",
                padding: "8px",
                fontSize: "13px",
              }}
              onClick={() => {
                void createSession(model ? { id: model.model.split('/')[1] ?? model.model, providerID: model.model.split('/')[0] ?? model.provider } : undefined);
                setPaletteOpen(false);
              }}
            >
              ＋ New session (Ctrl+N)
            </button>
          </dialog>
        )}
      </div>
    </Layout>
  );
}

function App() {
  return (
    <AgentProvider baseUrl={OPENCODE_BASE_URL}>
      <AgentWorkspace />
    </AgentProvider>
  );
}

export default App;
