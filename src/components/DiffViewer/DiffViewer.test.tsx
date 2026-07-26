import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@/components/Theme";
import { DiffViewer } from "./DiffViewer";

const oldContent = `function hello() {
  console.log("world");
}`;

const newContent = `function hello() {
  console.log("hello");
}`;

describe("DiffViewer", () => {
  it("renders unified diff by default", () => {
    render(
      <ThemeProvider>
        <DiffViewer oldContent={oldContent} newContent={newContent} />
      </ThemeProvider>,
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("renders split diff when mode is split", () => {
    render(
      <ThemeProvider>
        <DiffViewer oldContent={oldContent} newContent={newContent} mode="split" />
      </ThemeProvider>,
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("hides line numbers when hideLineNumbers is true", () => {
    render(
      <ThemeProvider>
        <DiffViewer oldContent={oldContent} newContent={newContent} hideLineNumbers />
      </ThemeProvider>,
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});
