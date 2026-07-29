import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsMcpComponent } from './SettingsMcp';

vi.mock('@/lib/settings', () => ({
  loadSettings: vi.fn().mockResolvedValue({
    mcp: {
      servers: {
        'test-mcp': {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-memory'],
          env: { API_KEY: 'secret' },
          enabled: true,
        },
      },
    },
  }),
  updateSettings: vi.fn().mockResolvedValue({}),
}));

describe('SettingsMcp UI Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders configured MCP servers list', async () => {
    render(<SettingsMcpComponent />);

    await waitFor(() => {
      expect(screen.getByText('test-mcp')).toBeInTheDocument();
    });

    expect(screen.getAllByText(/npx/i).length).toBeGreaterThan(0);
  });

  it('allows removing an MCP server', async () => {
    render(<SettingsMcpComponent />);

    await waitFor(() => {
      expect(screen.getByText('test-mcp')).toBeInTheDocument();
    });

    const removeBtn = screen.getByRole('button', { name: /Usuń/i });
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(screen.queryByText('test-mcp')).not.toBeInTheDocument();
    });
  });

  it('allows toggling server enable/disable state', async () => {
    render(<SettingsMcpComponent />);

    await waitFor(() => {
      expect(screen.getByText('test-mcp')).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toBeChecked();

    fireEvent.click(checkboxes[0]);
    expect(checkboxes[0]).not.toBeChecked();
  });
});
