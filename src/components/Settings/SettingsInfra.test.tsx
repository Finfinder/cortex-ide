import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsInfraComponent } from './SettingsInfra';
import { QdrantClient } from '@/lib/rag/qdrant';

vi.mock('@/lib/settings', () => ({
  updateSettings: vi.fn().mockResolvedValue({}),
  DEFAULT_SETTINGS: {
    infra: {
      qdrant: { url: 'http://localhost:6333', timeout: 5000, enabled: true },
      bgeM3: { url: 'http://localhost:8081', model: 'bge-m3', timeout: 5000, batchSize: 10, enabled: true },
      llm: { url: 'http://127.0.0.1:4096', model: 'opencode/north-mini-code-free', provider: 'opencode', timeout: 10000 },
    },
  },
}));

vi.mock('@/lib/rag/qdrant');
vi.mock('@/lib/rag/embeddings');

describe('SettingsInfra UI Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Qdrant and bge-m3 service cards with default values', () => {
    render(<SettingsInfraComponent />);

    expect(screen.getByText('Konfiguracja Infrastruktury')).toBeInTheDocument();
    expect(screen.getByText('Qdrant')).toBeInTheDocument();
    expect(screen.getByText('bge-m3 Embeddings')).toBeInTheDocument();

    const inputs = screen.getAllByRole('textbox');
    expect((inputs[0] as HTMLInputElement).value).toBe('http://localhost:6333');
    expect((inputs[1] as HTMLInputElement).value).toBe('http://localhost:8081');
  });

  it('triggers connection test and displays success badge on Qdrant mock success', async () => {
    vi.mocked(QdrantClient.prototype.health).mockResolvedValueOnce({
      status: 'ok',
      version: '1.7.0',
    });

    render(<SettingsInfraComponent />);

    const testButtons = screen.getAllByRole('button', { name: /Testuj Połączenie/i });
    fireEvent.click(testButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/✓ Połączono/i)).toBeInTheDocument();
    });
  });

  it('displays error badge when connection test fails', async () => {
    vi.mocked(QdrantClient.prototype.health).mockRejectedValueOnce(
      new Error('Connection refused'),
    );

    render(<SettingsInfraComponent />);

    const testButtons = screen.getAllByRole('button', { name: /Testuj Połączenie/i });
    fireEvent.click(testButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Connection refused/i)).toBeInTheDocument();
    });
  });
});
