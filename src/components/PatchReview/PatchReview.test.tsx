import type { ReactElement } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PatchReview } from './PatchReview';
import { ThemeProvider } from '@/components/Theme';
import { AgentProvider } from '@/lib/agent';
import type { PendingPatch } from '@/lib/agent/types';

beforeEach(() => {
  globalThis.fetch = vi.fn(
    async () => new Response(JSON.stringify([]), { status: 200 }),
  ) as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const patch: PendingPatch = {
  id: 'p1',
  messageID: 'm1',
  sessionID: 's1',
  file: 'src/a.ts',
  patch: [
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -1,1 +1,1 @@',
    '-const a = 1;',
    '+const a = 2;',
  ].join('\n'),
  status: 'pending',
};

function renderWithTheme(ui: ReactElement) {
  return render(
    <ThemeProvider>
      <AgentProvider baseUrl="http://localhost:4096">{ui}</AgentProvider>
    </ThemeProvider>,
  );
}

describe('PatchReview', () => {
  it('shows file path, status badge and diff viewer by default', () => {
    renderWithTheme(<PatchReview patch={patch} onResolve={() => {}} />);
    expect(screen.getByText('src/a.ts')).toBeInTheDocument();
    expect(screen.getByText('modified')).toBeInTheDocument();
    expect(screen.getByText('Pending review')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('toggles to git diff view showing raw patch', () => {
    renderWithTheme(<PatchReview patch={patch} onResolve={() => {}} />);
    fireEvent.click(screen.getByText('Git diff'));
    // falls back to raw patch in jsdom (no Tauri invoke)
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('calls onResolve on approve and reject', () => {
    const onResolve = vi.fn();
    renderWithTheme(<PatchReview patch={patch} onResolve={onResolve} />);

    fireEvent.click(screen.getByText('✓ Approve'));
    expect(onResolve).toHaveBeenCalledWith('p1', 'approved');

    fireEvent.click(screen.getByText('✗ Reject'));
    expect(onResolve).toHaveBeenCalledWith('p1', 'rejected');
  });

  it('disables actions when already resolved', () => {
    renderWithTheme(
      <PatchReview patch={{ ...patch, status: 'approved' }} onResolve={() => {}} />,
    );
    expect(screen.getByText('✓ Approve')).toBeDisabled();
    expect(screen.getByText('✗ Reject')).toBeDisabled();
  });
});
