// ─── AI Learning System ─────────────────────────────────────────────────────
// Learns your coding style and preferences over time.

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CodingStyleProfile {
  id: string;
  name: string;
  preferences: StylePreferences;
  patterns: CodingPattern[];
  statistics: CodingStatistics;
  lastUpdated: Date;
}

export interface StylePreferences {
  indentation: IndentationStyle;
  quotes: QuoteStyle;
  semicolons: boolean;
  trailingComma: boolean;
  bracketSpacing: boolean;
  printWidth: number;
  tabWidth: number;
  lineEnding: LineEnding;
}

export type IndentationStyle = 'spaces' | 'tabs';
export type QuoteStyle = 'single' | 'double' | 'backtick';
export type LineEnding = 'lf' | 'crlf';

export interface CodingPattern {
  id: string;
  name: string;
  pattern: string;
  frequency: number;
  lastSeen: Date;
  examples: string[];
}

export interface CodingStatistics {
  totalFiles: number;
  totalLines: number;
  languages: Record<string, number>;
  averageFileLength: number;
  mostUsedPatterns: string[];
  codingHours: Record<number, number>;
  commitFrequency: Record<string, number>;
}

export interface StyleSuggestion {
  id: string;
  category: string;
  message: string;
  currentStyle: string;
  suggestedStyle: string;
  confidence: number;
}

// ─── Style Analysis ─────────────────────────────────────────────────────────

export class CodingStyleAnalyzer {
  private profile: CodingStyleProfile;

  constructor() {
    this.profile = this.createDefaultProfile();
  }

  /**
   * Analyze code and update the style profile.
   */
  analyzeCode(content: string, language: string, _filePath: string): void {
    const lines = content.split('\n');

    // Update statistics
    this.profile.statistics.totalFiles++;
    this.profile.statistics.totalLines += lines.length;
    this.profile.statistics.languages[language] =
      (this.profile.statistics.languages[language] || 0) + 1;

    // Analyze indentation
    this.analyzeIndentation(lines);

    // Analyze quotes
    this.analyzeQuotes(content);

    // Analyze semicolons
    this.analyzeSemicolons(content);

    // Analyze trailing commas
    this.analyzeTrailingCommas(content);

    // Analyze bracket spacing
    this.analyzeBracketSpacing(content);

    // Analyze patterns
    this.analyzePatterns(content, language);

    // Update last updated
    this.profile.lastUpdated = new Date();
  }

  /**
   * Analyze indentation style.
   */
  private analyzeIndentation(lines: string[]): void {
    let spacesCount = 0;
    let tabsCount = 0;
    let spaceWidths: number[] = [];

    for (const line of lines) {
      const match = line.match(/^(\s+)/);
      if (match) {
        const indent = match[1];
        if (indent.includes('\t')) {
          tabsCount++;
        } else {
          spacesCount++;
          spaceWidths.push(indent.length);
        }
      }
    }

    if (spacesCount > tabsCount) {
      this.profile.preferences.indentation = 'spaces';
      // Calculate most common space width
      const widthCounts = new Map<number, number>();
      for (const w of spaceWidths) {
        widthCounts.set(w, (widthCounts.get(w) || 0) + 1);
      }
      let maxCount = 0;
      let mostCommon = 2;
      for (const [width, count] of widthCounts) {
        if (count > maxCount) {
          maxCount = count;
          mostCommon = width;
        }
      }
      this.profile.preferences.tabWidth = mostCommon;
    } else {
      this.profile.preferences.indentation = 'tabs';
    }
  }

  /**
   * Analyze quote style.
   */
  private analyzeQuotes(content: string): void {
    const singleQuotes = (content.match(/'/g) || []).length;
    const doubleQuotes = (content.match(/"/g) || []).length;
    const backticks = (content.match(/`/g) || []).length;

    if (doubleQuotes > singleQuotes && doubleQuotes > backticks) {
      this.profile.preferences.quotes = 'double';
    } else if (backticks > singleQuotes && backticks > doubleQuotes) {
      this.profile.preferences.quotes = 'backtick';
    } else {
      this.profile.preferences.quotes = 'single';
    }
  }

  /**
   * Analyze semicolon usage.
   */
  private analyzeSemicolons(content: string): void {
    const lines = content.split('\n');
    let linesWithSemicolons = 0;
    let totalCodeLines = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !trimmed.startsWith('*')) {
        totalCodeLines++;
        if (trimmed.endsWith(';')) {
          linesWithSemicolons++;
        }
      }
    }

    this.profile.preferences.semicolons = linesWithSemicolons > totalCodeLines / 2;
  }

  /**
   * Analyze trailing comma usage.
   */
  private analyzeTrailingCommas(content: string): void {
    const trailingCommaPattern = /,\s*[}\])]/g;
    const matches = content.match(trailingCommaPattern) || [];
    this.profile.preferences.trailingComma = matches.length > 0;
  }

  /**
   * Analyze bracket spacing.
   */
  private analyzeBracketSpacing(content: string): void {
    const withSpacing = (content.match(/\{\s+[^}]/g) || []).length;
    const withoutSpacing = (content.match(/\{[^ }\n]/g) || []).length;
    this.profile.preferences.bracketSpacing = withSpacing > withoutSpacing;
  }

  /**
   * Analyze coding patterns.
   */
  private analyzePatterns(content: string, _language: string): void {
    // Function declaration patterns
    const functionPatterns = [
      { pattern: /function\s+\w+\s*\(/g, name: 'function-declaration' },
      { pattern: /const\s+\w+\s*=\s*(?:async\s*)?\(/g, name: 'arrow-function' },
      { pattern: /=>\s*\{/g, name: 'arrow-function-body' },
      { pattern: /class\s+\w+/g, name: 'class-declaration' },
      { pattern: /interface\s+\w+/g, name: 'interface-declaration' },
      { pattern: /type\s+\w+/g, name: 'type-alias' },
      { pattern: /import\s+.*from\s+['"]/g, name: 'import-statement' },
      { pattern: /export\s+(?:default\s+)?(?:function|class|const|interface|type)/g, name: 'export-statement' },
    ];

    for (const fp of functionPatterns) {
      const matches = content.match(fp.pattern) || [];
      if (matches.length > 0) {
        const existing = this.profile.patterns.find(p => p.name === fp.name);
        if (existing) {
          existing.frequency += matches.length;
          existing.lastSeen = new Date();
          if (existing.examples.length < 3 && matches[0]) {
            existing.examples.push(matches[0]);
          }
        } else {
          this.profile.patterns.push({
            id: crypto.randomUUID(),
            name: fp.name,
            pattern: fp.pattern.source,
            frequency: matches.length,
            lastSeen: new Date(),
            examples: matches.slice(0, 3),
          });
        }
      }
    }
  }

  /**
   * Get style suggestions based on learned patterns.
   */
  getSuggestions(): StyleSuggestion[] {
    const suggestions: StyleSuggestion[] = [];

    // Indentation suggestion
    suggestions.push({
      id: crypto.randomUUID(),
      category: 'indentation',
      message: `You prefer ${this.profile.preferences.indentation} with ${this.profile.preferences.tabWidth} width`,
      currentStyle: this.profile.preferences.indentation,
      suggestedStyle: this.profile.preferences.indentation,
      confidence: 0.9,
    });

    // Quote style suggestion
    suggestions.push({
      id: crypto.randomUUID(),
      category: 'quotes',
      message: `You prefer ${this.profile.preferences.quotes} quotes`,
      currentStyle: this.profile.preferences.quotes,
      suggestedStyle: this.profile.preferences.quotes,
      confidence: 0.85,
    });

    // Semicolons suggestion
    suggestions.push({
      id: crypto.randomUUID(),
      category: 'semicolons',
      message: this.profile.preferences.semicolons
        ? 'You use semicolons'
        : 'You don\'t use semicolons',
      currentStyle: this.profile.preferences.semicolons ? 'yes' : 'no',
      suggestedStyle: this.profile.preferences.semicolons ? 'yes' : 'no',
      confidence: 0.8,
    });

    return suggestions;
  }

  /**
   * Get the current profile.
   */
  getProfile(): CodingStyleProfile {
    return { ...this.profile };
  }

  /**
   * Update profile preferences.
   */
  updatePreferences(preferences: Partial<StylePreferences>): void {
    this.profile.preferences = { ...this.profile.preferences, ...preferences };
    this.profile.lastUpdated = new Date();
  }

  /**
   * Create default profile.
   */
  private createDefaultProfile(): CodingStyleProfile {
    return {
      id: crypto.randomUUID(),
      name: 'Default Profile',
      preferences: {
        indentation: 'spaces',
        quotes: 'single',
        semicolons: true,
        trailingComma: false,
        bracketSpacing: true,
        printWidth: 80,
        tabWidth: 2,
        lineEnding: 'lf',
      },
      patterns: [],
      statistics: {
        totalFiles: 0,
        totalLines: 0,
        languages: {},
        averageFileLength: 0,
        mostUsedPatterns: [],
        codingHours: {},
        commitFrequency: {},
      },
      lastUpdated: new Date(),
    };
  }

  /**
   * Export profile as JSON.
   */
  exportProfile(): string {
    return JSON.stringify(this.profile, null, 2);
  }

  /**
   * Import profile from JSON.
   */
  importProfile(json: string): boolean {
    try {
      const imported = JSON.parse(json) as CodingStyleProfile;
      this.profile = imported;
      return true;
    } catch {
      return false;
    }
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

export const codingStyleAnalyzer = new CodingStyleAnalyzer();
