import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ErrorBanner } from "./ErrorBanner";

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
    refreshSessions: vi.fn(),
    ...rest,
  };
}

describe("ErrorBanner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("returns null when backend is not ready", () => {
    mockUseAgent.mockReturnValue(mockAgentState({ backendReady: false }));
    const { container } = render(<ErrorBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null when no error and SSE is connected", () => {
    mockUseAgent.mockReturnValue(mockAgentState());
    const { container } = render(<ErrorBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("shows explicit error immediately", () => {
    mockUseAgent.mockReturnValue(
      mockAgentState({ state: { error: "Something went wrong", sseStatus: "connected" } }),
    );
    render(<ErrorBanner />);
    expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
  });

  it("shows 'Lost connection' after debounce when SSE is in error state", () => {
    mockUseAgent.mockReturnValue(
      mockAgentState({ state: { sseStatus: "error", error: null } }),
    );
    const { container } = render(<ErrorBanner />);
    // Before debounce: null
    expect(container.firstChild).toBeNull();

    // After 4s debounce: visible
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByText(/Lost connection/)).toBeInTheDocument();
  });

  it("hides banner when SSE recovers before debounce expires", () => {
    const { rerender, container } = render(
      <ErrorBanner />,
    );

    // Set SSE to error
    mockUseAgent.mockReturnValue(
      mockAgentState({ state: { sseStatus: "error", error: null } }),
    );
    rerender(<ErrorBanner />);
    expect(container.firstChild).toBeNull();

    // Advance 2s (not enough for debounce)
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // SSE recovers
    mockUseAgent.mockReturnValue(
      mockAgentState({ state: { sseStatus: "connected", error: null } }),
    );
    rerender(<ErrorBanner />);
    expect(container.firstChild).toBeNull();

    // Advance past 4s — should still be null because SSE recovered
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(container.firstChild).toBeNull();
  });

  it("clears timer on unmount", () => {
    mockUseAgent.mockReturnValue(
      mockAgentState({ state: { sseStatus: "error", error: null } }),
    );
    const { unmount } = render(<ErrorBanner />);

    // Debounce timer should be pending
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();

    // After unmount, no timers should remain
    expect(vi.getTimerCount()).toBe(0);
  });

  it("calls onRetry when retry button is clicked", () => {
    const onRetry = vi.fn();
    mockUseAgent.mockReturnValue(
      mockAgentState({ state: { error: "Test error", sseStatus: "connected" } }),
    );
    render(<ErrorBanner onRetry={onRetry} />);
    screen.getByText("Retry").click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("calls refreshSessions when retry is clicked without onRetry prop", () => {
    const refreshSessions = vi.fn();
    mockUseAgent.mockReturnValue(
      mockAgentState({ state: { error: "Test error", sseStatus: "connected" }, refreshSessions }),
    );
    render(<ErrorBanner />);
    screen.getByText("Retry").click();
    expect(refreshSessions).toHaveBeenCalledOnce();
  });
});
