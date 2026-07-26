import { useMemo } from "react";
import styles from "./GitDiffOutput.module.css";

export interface GitDiffOutputProps {
  raw: string;
}

interface ParsedLine {
  type: "add" | "remove" | "header" | "context" | "hunk";
  content: string;
}

function parseGitDiff(raw: string): ParsedLine[] {
  const lines = raw.split("\n");
  return lines.map((line) => {
    if (
      line.startsWith("diff ") ||
      line.startsWith("index ") ||
      line.startsWith("---") ||
      line.startsWith("+++")
    ) {
      return { type: "header", content: line };
    }
    if (line.startsWith("@@")) {
      return { type: "hunk", content: line };
    }
    if (line.startsWith("+")) {
      return { type: "add", content: line };
    }
    if (line.startsWith("-")) {
      return { type: "remove", content: line };
    }
    return { type: "context", content: line };
  });
}

export function GitDiffOutput({ raw }: GitDiffOutputProps) {
  const parsedLines = useMemo(() => parseGitDiff(raw), [raw]);

  if (!raw) {
    return (
      <div className={styles.empty}>
        <p>No diff output available.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <pre className={styles.output}>
        {parsedLines.map((line, i) => (
          <span key={i} className={styles[line.type]}>
            {line.content}
            {"\n"}
          </span>
        ))}
      </pre>
    </div>
  );
}
