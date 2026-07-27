import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { AgentSelector } from '@/components/AgentSelector';
import { ModelSelector } from '@/components/ModelSelector';
import { ModelConfig } from '@/lib/opencode/config';
import styles from './ChatInput.module.css';

export interface ChatInputHandle {
  focus: () => void;
}

export interface ChatInputProps {
  onSubmit: (text: string) => void;
  onCancel: () => void;
  generating: boolean;
  disabled?: boolean;
  agentName?: string;
  onAgentChange?: (agentName: string) => void;
  model?: ModelConfig;
  onModelChange?: (model: ModelConfig) => void;
}

/**
 * Multi-line chat input with history (↑/↓), Ctrl+Enter submit, cancel button
 * while generating. Styled after the VS Code chat input.
 */
export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  function ChatInput(
    { onSubmit, onCancel, generating, disabled, agentName, onAgentChange, model, onModelChange },
    ref,
  ) {
    const [value, setValue] = useState('');
    const [history, setHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const draftRef = useRef('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
    }));

    const submit = useCallback(() => {
      const text = value.trim();
      if (!text || generating || disabled) return;
      onSubmit(text);
      setHistory((h) => [...h, text]);
      setHistoryIndex(-1);
      draftRef.current = '';
      setValue('');
    }, [value, generating, disabled, onSubmit]);

    const historyUp = useCallback(() => {
      if (history.length === 0) return;
      const next = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      if (historyIndex === -1) draftRef.current = value;
      setHistoryIndex(next);
      setValue(history[next]);
    }, [history, historyIndex, value]);

    const historyDown = useCallback(() => {
      const next = historyIndex + 1;
      if (next >= history.length) {
        setHistoryIndex(-1);
        setValue(draftRef.current);
      } else {
        setHistoryIndex(next);
        setValue(history[next]);
      }
    }, [history, historyIndex]);

    const handleKeyDown = useCallback(
      (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
        const isSubmit = e.key === 'Enter' && (e.ctrlKey || e.metaKey);
        const isHistoryUp = e.key === 'ArrowUp' && (value === '' || historyIndex >= 0);
        const isHistoryDown = e.key === 'ArrowDown' && historyIndex >= 0;
        const isCancel = e.key === 'Escape' && generating;

        if (!isSubmit && !isHistoryUp && !isHistoryDown && !isCancel) return;
        e.preventDefault();

        if (isSubmit) submit();
        else if (isHistoryUp) historyUp();
        else if (isHistoryDown) historyDown();
        else onCancel();
      },
      [submit, historyUp, historyDown, value, historyIndex, generating, onCancel],
    );

    return (
      <div className={styles.container}>
        <div className={styles.inputBox}>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe what to build"
            rows={3}
            disabled={disabled}
            aria-label="Message input. Press Ctrl+Enter to send."
          />
          <div className={styles.footer}>
            <div className={styles.meta}>
              {agentName && onAgentChange && (
                <AgentSelector value={agentName} onChange={onAgentChange} position="top" />
              )}
              {model && onModelChange && (
                <ModelSelector value={model} onChange={onModelChange} position="top" />
              )}
            </div>
            {generating ? (
              <button
                type="button"
                className={styles.stopButton}
                onClick={onCancel}
                aria-label="Stop generation"
              >
                ■ Stop
              </button>
            ) : (
              <button
                type="button"
                className={styles.sendButton}
                onClick={submit}
                disabled={!value.trim() || disabled}
                aria-label="Send message (Ctrl+Enter)"
                title="Send (Ctrl+Enter)"
              >
                ⏎
              </button>
            )}
          </div>
        </div>
      </div>
    );
  },
);
