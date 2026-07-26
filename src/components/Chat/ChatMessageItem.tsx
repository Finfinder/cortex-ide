import { memo } from 'react';
import type { UiMessage } from '@/lib/agent/types';
import { Markdown } from '@/components/Markdown';
import { ToolCall } from '@/components/ToolCall';
import styles from './ChatMessageItem.module.css';

export interface ChatMessageItemProps {
  message: UiMessage;
}

/**
 * A single chat message: text parts rendered as markdown, tool parts as
 * collapsible ToolCall widgets. Streaming indicator while generating.
 */
export const ChatMessageItem = memo(function ChatMessageItem({
  message,
}: ChatMessageItemProps) {
  const isUser = message.role === 'user';

  return (
    <article
      className={`${styles.message} ${isUser ? styles.user : styles.assistant}`}
      aria-label={isUser ? 'User message' : 'Assistant message'}
    >
      <div className={styles.bubble}>
        {message.parts.map((part) => {
          switch (part.type) {
            case 'text':
              return isUser ? (
                <p key={part.id} className={styles.userText}>
                  {part.text}
                </p>
              ) : (
                <Markdown key={part.id}>{part.text}</Markdown>
              );
            case 'tool':
              return <ToolCall key={part.id} part={part} />;
            case 'step-finish':
              return null;
            default:
              return null;
          }
        })}
        {message.streaming && (
          <span className={styles.streaming} aria-live="polite">
            <span className={styles.dot} />
            <span className={styles.dot} />
            <span className={styles.dot} />
          </span>
        )}
      </div>
    </article>
  );
});
