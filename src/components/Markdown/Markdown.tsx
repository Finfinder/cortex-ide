import { memo, useMemo, type ComponentProps } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './Markdown.module.css';

export interface MarkdownProps {
  children: string;
}

/**
 * Safe markdown renderer for chat messages.
 * - GFM support (tables, strikethrough, task lists)
 * - No raw HTML rendering (prevents XSS; react-markdown skips HTML by default)
 * - Code blocks rendered as <pre><code> with language class for styling
 */
export const Markdown = memo(function Markdown({ children }: MarkdownProps) {
  const components = useMemo(
    () => ({
      code({ className, children: codeChildren, ...props }: ComponentProps<'code'>) {
        const match = /language-(\w+)/.exec(className ?? '');
        const isBlock = Boolean(match) || String(codeChildren).includes('\n');
        if (isBlock) {
          return (
            <code className={`${styles.codeBlock} ${className ?? ''}`} {...props}>
              {codeChildren}
            </code>
          );
        }
        return (
          <code className={styles.inlineCode} {...props}>
            {codeChildren}
          </code>
        );
      },
      pre({ children: preChildren }: ComponentProps<'pre'>) {
        return <pre className={styles.pre}>{preChildren}</pre>;
      },
      a({ href, children: linkChildren }: ComponentProps<'a'>) {
        return (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {linkChildren}
          </a>
        );
      },
    }),
    [],
  );

  return (
    <div className={styles.markdown}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
});
