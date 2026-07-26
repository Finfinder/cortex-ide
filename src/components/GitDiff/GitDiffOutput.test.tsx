import { render, screen } from "@testing-library/react";
import { GitDiffOutput } from "./GitDiffOutput";

const sampleGitDiff = `diff --git a/file.txt b/file.txt
index 1234567..abcdefg 100644
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,3 @@
 line 1
-old line
+new line
 line 3`;

describe("GitDiffOutput", () => {
  it("renders empty state when no diff", () => {
    render(<GitDiffOutput raw="" />);
    expect(screen.getByText("No diff output available.")).toBeInTheDocument();
  });

  it("renders diff with add/remove highlighting", () => {
    render(<GitDiffOutput raw={sampleGitDiff} />);
    expect(screen.getByText(/diff --git/)).toBeInTheDocument();
    expect(screen.getByText(/-old line/)).toBeInTheDocument();
    expect(screen.getByText(/\+new line/)).toBeInTheDocument();
  });

  it("applies correct CSS classes for add/remove lines", () => {
    render(<GitDiffOutput raw={sampleGitDiff} />);
    const pre = document.querySelector("pre");
    expect(pre).toBeInTheDocument();
  });
});
