import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Layout } from "@/components/Layout";
import { useTheme } from "@/components/Theme";

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");
  const { theme, toggleTheme } = useTheme();

  async function greet() {
    setGreetMsg(await invoke("greet", { name }));
  }

  return (
    <Layout
      sidebar={
        <div style={{ padding: "12px" }}>
          <h3
            style={{
              marginBottom: "8px",
              fontSize: "14px",
              color: "var(--text-secondary)",
            }}
          >
            Cortex IDE
          </h3>
          <button
            onClick={toggleTheme}
            style={{
              padding: "6px 12px",
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
              borderRadius: "4px",
              color: "var(--text-primary)",
              fontSize: "12px",
            }}
          >
            {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
          </button>
        </div>
      }
    >
      <h1>Welcome to Cortex IDE</h1>
      <p style={{ color: "var(--text-secondary)", marginTop: "8px" }}>
        Agent-First IDE — Tauri + React 19.2 + Vite
      </p>

      <div style={{ marginTop: "24px" }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name..."
          style={{
            padding: "8px 12px",
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            borderRadius: "4px",
            color: "var(--text-primary)",
            fontSize: "14px",
            width: "240px",
          }}
        />
        <button
          onClick={greet}
          style={{
            marginLeft: "8px",
            padding: "8px 16px",
            background: "var(--accent)",
            border: "none",
            borderRadius: "4px",
            color: "#fff",
            fontSize: "14px",
          }}
        >
          Greet
        </button>
      </div>

      {greetMsg && <p style={{ marginTop: "16px", color: "var(--accent)" }}>{greetMsg}</p>}
    </Layout>
  );
}

export default App;
