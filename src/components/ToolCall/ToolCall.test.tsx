import { render, screen, fireEvent } from '@testing-library/react';
import { ToolCall } from './ToolCall';
import type { ToolPart } from '@/lib/opencode/types';

const basePart: ToolPart = {
  id: 'p1',
  callID: 'c1',
  messageID: 'm1',
  sessionID: 's1',
  tool: 'read_file',
  type: 'tool',
  state: { status: 'pending' },
};

describe('ToolCall', () => {
  it('renders tool name and pending status', () => {
    render(<ToolCall part={basePart} />);
    expect(screen.getByText('read_file')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('expands to show args and result when completed', () => {
    const part: ToolPart = {
      ...basePart,
      state: {
        status: 'completed',
        input: { filePath: 'src/a.ts' },
        metadata: {},
        output: 'file contents',
        time: { start: 1, end: 2 },
        title: 'Read a.ts',
      },
    };
    render(<ToolCall part={part} />);
    expect(screen.queryByText('Arguments')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Arguments')).toBeInTheDocument();
    expect(screen.getByText(/file contents/)).toBeInTheDocument();
  });

  it('shows error output for error status', () => {
    const part: ToolPart = {
      ...basePart,
      state: {
        status: 'error',
        error: 'boom',
        input: {},
        time: { start: 1, end: 2 },
      },
    };
    render(<ToolCall part={part} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('boom')).toBeInTheDocument();
  });
});
