import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { useTheme } from "@/components/Theme";
import { AgentProvider, useAgent } from "@/lib/agent";
import type { PendingPatch } from "@/lib/agent/types";
import { SessionList } from "@/components/Sessions";
import { ChatPanel } from "@/components/Chat";
import { PatchQueue } from "@/components/PatchReview";
import { AgentSelector } from "@/components/AgentSelector";
import { StatusBar } from "@/components/StatusBar";
import { ErrorBanner } from "@/components/ErrorBanner";

const OPENCODE_BASE_URL = "http://127.0.0.1:4096";
const DEFAULT_AGENT = "software-engineer";

function AgentWorkspace() {
  const { state, createSession, cancelGeneration } = useAgent();
  const { theme, toggleTheme } = useTheme();
  const [agent, setAgent] = useState(DEFAULT_AGENT);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const activeSession = state.sessions.find((s) => s.id === state.activeSessionId);

  // Global keyboard shortcuts (3.10)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        void createSession();
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
  }, [createSession, cancelGeneration, state.generating]);

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
          <SessionList />
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
          <AgentSelector value={agent} onChange={setAgent} />
        </header>

        <ErrorBanner />

        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <ChatPanel agentName={agent} modelLabel={activeSession?.model?.id} />
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
                void createSession();
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
