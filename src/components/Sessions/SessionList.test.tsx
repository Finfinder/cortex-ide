import { render, screen, fireEvent } from '@testing-library/react';
import { SessionList } from './SessionList';
import { AgentProvider } from '@/lib/agent';
import type { Session } from '@/lib/opencode/types';

// Mock the OpenCode client HTTP layer
const sessions: Session[] = [
  {
    id: 's1',
    title: 'First session',
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 1 },
  },
  {
    id: 's2',
    title: 'Second session',
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 2, updated: 2 },
  },
];

beforeEach(() => {
  globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/session') && !url.includes('/session/')) {
      return new Response(JSON.stringify(sessions), { status: 200 });
    }
    if (url.includes('/message')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (url.endsWith('/event')) {
      return new Response(new ReadableStream(), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SessionList', () => {
  it('lists sessions and filters by search query', async () => {
    render(
      <AgentProvider baseUrl="http://localhost:4096">
        <SessionList />
      </AgentProvider>,
    );

    expect(await screen.findByText('First session')).toBeInTheDocument();
    expect(screen.getByText('Second session')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search sessions'), {
      target: { value: 'first' },
    });
    expect(screen.getByText('First session')).toBeInTheDocument();
    expect(screen.queryByText('Second session')).not.toBeInTheDocument();
  });
});
