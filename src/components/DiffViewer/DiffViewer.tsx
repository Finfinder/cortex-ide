import ReactDiffViewer from "react-diff-viewer-continued";
import { useTheme } from "@/components/Theme";
import styles from "./DiffViewer.module.css";

export type DiffMode = "unified" | "split";

export interface DiffViewerProps {
  oldContent: string;
  newContent: string;
  mode?: DiffMode;
  hideLineNumbers?: boolean;
  leftTitle?: string;
  rightTitle?: string;
  showDiffOnly?: boolean;
}

export function DiffViewer({
  oldContent,
  newContent,
  mode = "unified",
  hideLineNumbers = false,
  leftTitle,
  rightTitle,
  showDiffOnly = false,
}: DiffViewerProps) {
  const { theme } = useTheme();

  const splitView = mode === "split";

  return (
    <div className={styles.container}>
      <ReactDiffViewer
        oldValue={oldContent}
        newValue={newContent}
        splitView={splitView}
        hideLineNumbers={hideLineNumbers}
        useDarkTheme={theme === "dark"}
        leftTitle={leftTitle}
        rightTitle={rightTitle}
        showDiffOnly={showDiffOnly}
        disableWordDiff={false}
      />
    </div>
  );
}
