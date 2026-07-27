import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { StatusBar } from "./StatusBar";

// Mock useAgent
const mockUseAgent = vi.fn();
vi.mock("@/lib/agent", () => ({
  useAgent: () => mockUseAgent(),
}));

function mockAgentState(overrides: {
  state?: Record<string, unknown>;
  [key: string]: unknown;
} = {}) {
  const { state: stateOverrides, ...rest } = overrides;
  return {
    state: {
      sessions: [],
      activeSessionId: null,
      messages: {},
      patches: [],
      sseStatus: "connected",
      error: null,
      tokens: { input: 0, output: 0 },
      cost: 0,
      activeToolCalls: 0,
      generating: false,
      ...(stateOverrides as Record<string, unknown>),
    },
    client: {},
    cwd: ".",
    backendReady: true,
    ...rest,
  };
}

describe("StatusBar", () => {
  it("shows 'Initializing...' when backend is not ready", () => {
    mockUseAgent.mockReturnValue(mockAgentState({ backendReady: false }));
    render(<StatusBar />);
    expect(screen.getByText(/Initializing/)).toBeInTheDocument();
  });

  it("shows 'Connected' when SSE is connected", () => {
    mockUseAgent.mockReturnValue(mockAgentState());
    render(<StatusBar />);
    expect(screen.getByText(/Connected/)).toBeInTheDocument();
  });

  it("shows 'Connecting' when SSE is connecting", () => {
    mockUseAgent.mockReturnValue(
      mockAgentState({ state: { sseStatus: "connecting" } }),
    );
    render(<StatusBar />);
    expect(screen.getByText(/Connecting/)).toBeInTheDocument();
  });

  it("shows 'Disconnected' when SSE is disconnected", () => {
    mockUseAgent.mockReturnValue(
      mockAgentState({ state: { sseStatus: "disconnected" } }),
    );
    render(<StatusBar />);
    expect(screen.getByText(/Disconnected/)).toBeInTheDocument();
  });

  it("shows 'Error' when SSE is in error state", () => {
    mockUseAgent.mockReturnValue(
      mockAgentState({ state: { sseStatus: "error" } }),
    );
    render(<StatusBar />);
    expect(screen.getByText(/Error/)).toBeInTheDocument();
  });

  it("displays token counts", () => {
    mockUseAgent.mockReturnValue(
      mockAgentState({ state: { tokens: { input: 150, output: 300 } } }),
    );
    render(<StatusBar />);
    expect(screen.getByText(/150/)).toBeInTheDocument();
    expect(screen.getByText(/300/)).toBeInTheDocument();
  });

  it("displays cost when non-zero", () => {
    mockUseAgent.mockReturnValue(
      mockAgentState({ state: { cost: 0.05 } }),
    );
    render(<StatusBar />);
    expect(screen.getByText(/\$ 0\.0500/)).toBeInTheDocument();
  });

  it("displays active tool calls when non-zero", () => {
    mockUseAgent.mockReturnValue(
      mockAgentState({ state: { activeToolCalls: 3 } }),
    );
    render(<StatusBar />);
    expect(screen.getByText(/3/)).toBeInTheDocument();
  });
});
