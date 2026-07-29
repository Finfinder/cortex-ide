import { describe, it, expect } from 'vitest';
import { chunkByAstBoundaries, detectLanguage } from './chunker';

describe('AST Chunker', () => {
  describe('detectLanguage', () => {
    it('detects typescript and javascript extensions', () => {
      expect(detectLanguage('index.ts')).toBe('typescript');
      expect(detectLanguage('component.tsx')).toBe('typescript');
      expect(detectLanguage('module.mts')).toBe('typescript');
      expect(detectLanguage('script.js')).toBe('javascript');
      expect(detectLanguage('app.jsx')).toBe('javascript');
    });

    it('detects python, rust, go, java, csharp, cpp, c, ruby, php, swift, kotlin', () => {
      expect(detectLanguage('main.py')).toBe('python');
      expect(detectLanguage('lib.rs')).toBe('rust');
      expect(detectLanguage('server.go')).toBe('go');
      expect(detectLanguage('App.java')).toBe('java');
      expect(detectLanguage('Program.cs')).toBe('csharp');
      expect(detectLanguage('main.cpp')).toBe('cpp');
      expect(detectLanguage('helper.h')).toBe('c');
      expect(detectLanguage('script.rb')).toBe('ruby');
      expect(detectLanguage('index.php')).toBe('php');
      expect(detectLanguage('Main.swift')).toBe('swift');
      expect(detectLanguage('App.kt')).toBe('kotlin');
    });

    it('returns unknown for unmapped extensions or files without extension', () => {
      expect(detectLanguage('notes.txt')).toBe('unknown');
      expect(detectLanguage('Dockerfile')).toBe('unknown');
    });
  });

  describe('chunkByAstBoundaries across languages', () => {
    it('handles empty content gracefully with empty array', () => {
      expect(chunkByAstBoundaries('', 'typescript')).toEqual([]);
      expect(chunkByAstBoundaries('   \n  \t ', 'python')).toEqual([]);
    });

    it('handles single-line file content with single fallback chunk', () => {
      const content = 'console.log("hello world");';
      const chunks = chunkByAstBoundaries(content, 'typescript');
      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe('console.log("hello world");');
      expect(chunks[0].lineStart).toBe(0);
      expect(chunks[0].lineEnd).toBe(0);
    });

    it('chunks Python defs and classes', () => {
      const pyCode = `
def greet(name):
    print("Hello", name)

class Person:
    def __init__(self, name):
        self.name = name
      `.trim();

      const chunks = chunkByAstBoundaries(pyCode, 'python', 120, 1);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks.some((c) => c.name === 'greet')).toBe(true);
      expect(chunks.some((c) => c.name === 'Person')).toBe(true);
    });

    it('chunks Rust fn, struct, impl, and mod', () => {
      const rustCode = `
pub async fn fetch_data() -> String {
    "data".to_string()
}

pub struct User {
    id: u64,
}

impl User {
    fn new(id: u64) -> Self { User { id } }
}
      `.trim();

      const chunks = chunkByAstBoundaries(rustCode, 'rust', 120, 1);
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expect(chunks.some((c) => c.name === 'fetch_data')).toBe(true);
      expect(chunks.some((c) => c.name === 'User')).toBe(true);
    });

    it('chunks Go functions and struct types', () => {
      const goCode = `
func ProcessItem(item string) error {
    return nil
}

type Service struct {
    Name string
}
      `.trim();

      const chunks = chunkByAstBoundaries(goCode, 'go', 120, 1);
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expect(chunks.some((c) => c.name === 'ProcessItem')).toBe(true);
      expect(chunks.some((c) => c.name === 'Service')).toBe(true);
    });

    it('chunks Java / C# classes and methods', () => {
      const javaCode = `
public class Main {
    public void run() {
        System.out.println("Running");
    }
}
      `.trim();

      const chunks = chunkByAstBoundaries(javaCode, 'java', 120, 1);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks.some((c) => c.name === 'Main')).toBe(true);
    });

    it('falls back to windowed line chunking for unknown language', () => {
      const text = Array.from({ length: 25 }, (_, i) => `line ${i + 1}`).join('\n');
      const chunks = chunkByAstBoundaries(text, 'unknown', 10, 3);
      expect(chunks.length).toBe(3);
      expect(chunks[0].lineStart).toBe(0);
      expect(chunks[0].lineEnd).toBe(9);
    });
  });
});
