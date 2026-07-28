import { ModelConfig } from '@/lib/opencode/config';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAgent } from '@/lib/agent';
import { ChatMessageItem } from './ChatMessageItem';
import { ChatInput, type ChatInputHandle } from './ChatInput';
import styles from './ChatPanel.module.css';

export interface ChatPanelProps {
  agentName?: string;
  onAgentChange?: (agentName: string, model?: ModelConfig) => void;
  model?: ModelConfig;
  onModelChange?: (model: ModelConfig) => void;
}

/**
 * Main chat panel: scrollable message log with streaming, plus the input box.
 * Mirrors the VS Code chat layout.
 */
export function ChatPanel({ agentName, onAgentChange, model, onModelChange }: ChatPanelProps) {
  const { state, sendMessage, cancelGeneration } = useAgent();
  const { activeSessionId, messages, generating, sseStatus } = state;
  const sessionMessages = useMemo(
    () => (activeSessionId ? (messages[activeSessionId] ?? []) : []),
    [activeSessionId, messages],
  );

  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<ChatInputHandle>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom on new content when user is at bottom
  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [sessionMessages, autoScroll]);

  const handleScroll = () => {
    const el = logRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  };

  return (
    <section className={styles.panel} aria-label="Chat">
      <div
        ref={logRef}
        className={styles.log}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        onScroll={handleScroll}
      >
        {sessionMessages.length === 0 ? (
          <div className={styles.empty}>
            <p>No messages yet. Start the conversation below.</p>
          </div>
        ) : (
          sessionMessages.map((m) => <ChatMessageItem key={m.id} message={m} />)
        )}
      </div>

      <ChatInput
        ref={inputRef}
        onSubmit={(text) => void sendMessage(text)}
        onCancel={() => void cancelGeneration()}
        generating={generating}
        disabled={!activeSessionId || sseStatus === 'error'}
        agentName={agentName}
        onAgentChange={onAgentChange}
        model={model}
        onModelChange={onModelChange}
      />
    </section>
  );
}
