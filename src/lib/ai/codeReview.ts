// ─── Advanced AI Code Review System ─────────────────────────────────────────
// Comprehensive code review with security, performance, and style analysis.

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CodeReviewRequest {
  id: string;
  files: ReviewFile[];
  options: ReviewOptions;
  createdAt: Date;
}

export interface ReviewFile {
  path: string;
  content: string;
  language: string;
  diff?: string;
}

export interface ReviewOptions {
  checkSecurity: boolean;
  checkPerformance: boolean;
  checkStyle: boolean;
  checkAccessibility: boolean;
  checkTesting: boolean;
  severity: ReviewSeverity[];
  autoFix: boolean;
}

export type ReviewSeverity = 'error' | 'warning' | 'info' | 'hint';

export interface CodeReviewResult {
  id: string;
  requestId: string;
  summary: ReviewSummary;
  issues: ReviewIssue[];
  suggestions: ReviewSuggestion[];
  metrics: CodeMetrics;
  score: number;
  completedAt: Date;
}

export interface ReviewSummary {
  totalFiles: number;
  totalIssues: number;
  issuesBySeverity: Record<ReviewSeverity, number>;
  issuesByCategory: Record<string, number>;
  overallScore: number;
  recommendation: string;
}

export interface ReviewIssue {
  id: string;
  file: string;
  line: number;
  column: number;
  severity: ReviewSeverity;
  category: IssueCategory;
  message: string;
  description: string;
  rule: string;
  fix?: IssueFix;
}

export type IssueCategory =
  | 'security'
  | 'performance'
  | 'style'
  | 'bug'
  | 'accessibility'
  | 'testing'
  | 'maintainability';

export interface IssueFix {
  description: string;
  replacement: string;
  startLine: number;
  endLine: number;
}

export interface ReviewSuggestion {
  id: string;
  file: string;
  line: number;
  category: string;
  message: string;
  impact: 'low' | 'medium' | 'high';
}

export interface CodeMetrics {
  linesOfCode: number;
  complexity: number;
  maintainabilityIndex: number;
  testCoverage?: number;
  duplicatedLines: number;
  technicalDebt: string;
}

// ─── Review Rules ───────────────────────────────────────────────────────────

interface ReviewRule {
  id: string;
  name: string;
  category: IssueCategory;
  severity: ReviewSeverity;
  pattern?: RegExp;
  check: (file: ReviewFile, line: string, lineNumber: number) => ReviewIssue | null;
}

const REVIEW_RULES: ReviewRule[] = [
  // Security Rules
  {
    id: 'SEC001',
    name: 'Hardcoded credentials',
    category: 'security',
    severity: 'error',
    pattern: /(?:password|secret|api[_-]?key|token)\s*[=:]\s*['"][^'"]+['"]/i,
    check: (file, line, lineNumber) => {
      const match = line.match(/(?:password|secret|api[_-]?key|token)\s*[=:]\s*['"][^'"]+['"]/i);
      if (match) {
        return {
          id: crypto.randomUUID(),
          file: file.path,
          line: lineNumber,
          column: match.index || 0,
          severity: 'error',
          category: 'security',
          message: 'Hardcoded credentials detected',
          description: 'Never hardcode sensitive information. Use environment variables or secrets management.',
          rule: 'SEC001',
        };
      }
      return null;
    },
  },
  {
    id: 'SEC002',
    name: 'SQL injection risk',
    category: 'security',
    severity: 'error',
    pattern: /(?:query|execute|sql)\s*\(\s*['"`].*\$\{/i,
    check: (file, line, lineNumber) => {
      const match = line.match(/(?:query|execute|sql)\s*\(\s*['"`].*\$\{/i);
      if (match) {
        return {
          id: crypto.randomUUID(),
          file: file.path,
          line: lineNumber,
          column: match.index || 0,
          severity: 'error',
          category: 'security',
          message: 'Potential SQL injection',
          description: 'Use parameterized queries instead of string interpolation.',
          rule: 'SEC002',
          fix: {
            description: 'Use parameterized query',
            replacement: line.replace(/\$\{[^}]+\}/g, '?'),
            startLine: lineNumber,
            endLine: lineNumber,
          },
        };
      }
      return null;
    },
  },
  {
    id: 'SEC003',
    name: 'XSS vulnerability',
    category: 'security',
    severity: 'warning',
    pattern: /dangerouslySetInnerHTML|innerHTML\s*=/,
    check: (file, line, lineNumber) => {
      const match = line.match(/dangerouslySetInnerHTML|innerHTML\s*=/);
      if (match) {
        return {
          id: crypto.randomUUID(),
          file: file.path,
          line: lineNumber,
          column: match.index || 0,
          severity: 'warning',
          category: 'security',
          message: 'Potential XSS vulnerability',
          description: 'Sanitize user input before rendering HTML.',
          rule: 'SEC003',
        };
      }
      return null;
    },
  },

  // Performance Rules
  {
    id: 'PERF001',
    name: 'Nested loops',
    category: 'performance',
    severity: 'warning',
    pattern: /for\s*\(.*\)\s*\{[^}]*for\s*\(/,
    check: (file, line, lineNumber) => {
      const match = line.match(/for\s*\(.*\)\s*\{[^}]*for\s*\(/);
      if (match) {
        return {
          id: crypto.randomUUID(),
          file: file.path,
          line: lineNumber,
          column: match.index || 0,
          severity: 'warning',
          category: 'performance',
          message: 'Nested loops detected',
          description: 'Consider refactoring to reduce time complexity.',
          rule: 'PERF001',
        };
      }
      return null;
    },
  },
  {
    id: 'PERF002',
    name: 'Memory leak potential',
    category: 'performance',
    severity: 'warning',
    pattern: /addEventListener\s*\([^)]+\)(?![^}]*removeEventListener)/,
    check: (file, line, lineNumber) => {
      const match = line.match(/addEventListener\s*\([^)]+\)(?![^}]*removeEventListener)/);
      if (match) {
        return {
          id: crypto.randomUUID(),
          file: file.path,
          line: lineNumber,
          column: match.index || 0,
          severity: 'warning',
          category: 'performance',
          message: 'Event listener without cleanup',
          description: 'Ensure event listeners are removed to prevent memory leaks.',
          rule: 'PERF002',
        };
      }
      return null;
    },
  },

  // Style Rules
  {
    id: 'STYLE001',
    name: 'Console.log left in code',
    category: 'style',
    severity: 'info',
    pattern: /console\.(log|debug|info)\s*\(/,
    check: (file, line, lineNumber) => {
      const match = line.match(/console\.(log|debug|info)\s*\(/);
      if (match) {
        return {
          id: crypto.randomUUID(),
          file: file.path,
          line: lineNumber,
          column: match.index || 0,
          severity: 'info',
          category: 'style',
          message: 'Console statement in production code',
          description: 'Remove console statements or use a proper logging library.',
          rule: 'STYLE001',
          fix: {
            description: 'Remove console statement',
            replacement: '',
            startLine: lineNumber,
            endLine: lineNumber,
          },
        };
      }
      return null;
    },
  },
  {
    id: 'STYLE002',
    name: 'Magic numbers',
    category: 'style',
    severity: 'hint',
    pattern: /(?:if|while|for)\s*\([^)]*(?:===?|!==?|>=?|<=?|[+\-*/])\s*\d{2,}/,
    check: (file, line, lineNumber) => {
      const match = line.match(/(?:if|while|for)\s*\([^)]*(?:===?|!==?|>=?|<=?|[+\-*/])\s*\d{2,}/);
      if (match) {
        return {
          id: crypto.randomUUID(),
          file: file.path,
          line: lineNumber,
          column: match.index || 0,
          severity: 'hint',
          category: 'style',
          message: 'Magic number detected',
          description: 'Consider extracting to a named constant.',
          rule: 'STYLE002',
        };
      }
      return null;
    },
  },

  // Bug Rules
  {
    id: 'BUG001',
    name: 'Loose equality',
    category: 'bug',
    severity: 'warning',
    pattern: /[^!=]==(?!=)/,
    check: (file, line, lineNumber) => {
      const match = line.match(/[^!=]==(?!=)/);
      if (match) {
        return {
          id: crypto.randomUUID(),
          file: file.path,
          line: lineNumber,
          column: match.index || 0,
          severity: 'warning',
          category: 'bug',
          message: 'Loose equality comparison',
          description: 'Use strict equality (===) to avoid type coercion bugs.',
          rule: 'BUG001',
          fix: {
            description: 'Use strict equality',
            replacement: line.replace(/==/, '==='),
            startLine: lineNumber,
            endLine: lineNumber,
          },
        };
      }
      return null;
    },
  },
];

// ─── Code Review Engine ─────────────────────────────────────────────────────

export class CodeReviewEngine {
  private rules: ReviewRule[] = [...REVIEW_RULES];

  /**
   * Perform a code review.
   */
  async review(request: CodeReviewRequest): Promise<CodeReviewResult> {
    const issues: ReviewIssue[] = [];
    const suggestions: ReviewSuggestion[] = [];

    // Analyze each file
    for (const file of request.files) {
      const fileIssues = this.reviewFile(file, request.options);
      issues.push(...fileIssues);

      const fileSuggestions = this.generateSuggestions(file);
      suggestions.push(...fileSuggestions);
    }

    // Calculate metrics
    const metrics = this.calculateMetrics(request.files);

    // Calculate score
    const score = this.calculateScore(issues, metrics);

    // Generate summary
    const summary = this.generateSummary(request.files, issues, score);

    return {
      id: crypto.randomUUID(),
      requestId: request.id,
      summary,
      issues,
      suggestions,
      metrics,
      score,
      completedAt: new Date(),
    };
  }

  /**
   * Review a single file.
   */
  private reviewFile(file: ReviewFile, options: ReviewOptions): ReviewIssue[] {
    const issues: ReviewIssue[] = [];
    const lines = file.content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      for (const rule of this.rules) {
        // Skip rules based on options
        if (!options.checkSecurity && rule.category === 'security') continue;
        if (!options.checkPerformance && rule.category === 'performance') continue;
        if (!options.checkStyle && rule.category === 'style') continue;
        if (!options.checkAccessibility && rule.category === 'accessibility') continue;
        if (!options.checkTesting && rule.category === 'testing') continue;

        // Check severity filter
        if (options.severity.length > 0 && !options.severity.includes(rule.severity)) continue;

        const issue = rule.check(file, line, lineNumber);
        if (issue) issues.push(issue);
      }
    }

    return issues;
  }

  /**
   * Generate suggestions for a file.
   */
  private generateSuggestions(file: ReviewFile): ReviewSuggestion[] {
    const suggestions: ReviewSuggestion[] = [];
    const lines = file.content.split('\n');

    // Check for long functions
    let functionStart = -1;
    let braceCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.match(/function|=>\s*\{/)) {
        functionStart = i;
        braceCount = 0;
      }
      if (functionStart >= 0) {
        braceCount += (line.match(/{/g) || []).length;
        braceCount -= (line.match(/}/g) || []).length;
        if (braceCount <= 0 && i - functionStart > 50) {
          suggestions.push({
            id: crypto.randomUUID(),
            file: file.path,
            line: functionStart + 1,
            category: 'maintainability',
            message: 'Function is too long (over 50 lines)',
            impact: 'medium',
          });
        }
        functionStart = -1;
      }
    }

    // Check for missing comments
    if (lines.length > 100 && !lines.some(l => l.includes('//') || l.includes('/*'))) {
      suggestions.push({
        id: crypto.randomUUID(),
        file: file.path,
        line: 1,
        category: 'documentation',
        message: 'Large file without comments',
        impact: 'low',
      });
    }

    return suggestions;
  }

  /**
   * Calculate code metrics.
   */
  private calculateMetrics(files: ReviewFile[]): CodeMetrics {
    let totalLines = 0;
    let complexity = 0;
    let duplicatedLines = 0;

    for (const file of files) {
      const lines = file.content.split('\n');
      totalLines += lines.length;

      // Calculate complexity (simplified)
      for (const line of lines) {
        if (line.match(/if|else|for|while|switch|case|catch|&&|\|\|/)) {
          complexity++;
        }
      }

      // Check for duplicated lines (simplified)
      const lineSet = new Set(lines);
      duplicatedLines += lines.length - lineSet.size;
    }

    const maintainabilityIndex = Math.max(0, 100 - complexity * 0.5 - duplicatedLines * 0.1);

    return {
      linesOfCode: totalLines,
      complexity,
      maintainabilityIndex,
      duplicatedLines,
      technicalDebt: complexity > 50 ? 'High' : complexity > 20 ? 'Medium' : 'Low',
    };
  }

  /**
   * Calculate review score.
   */
  private calculateScore(issues: ReviewIssue[], metrics: CodeMetrics): number {
    let score = 100;

    // Deduct for issues
    for (const issue of issues) {
      switch (issue.severity) {
        case 'error': score -= 10; break;
        case 'warning': score -= 5; break;
        case 'info': score -= 1; break;
        case 'hint': score -= 0.5; break;
      }
    }

    // Adjust for metrics
    if (metrics.complexity > 50) score -= 10;
    if (metrics.maintainabilityIndex < 50) score -= 10;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate review summary.
   */
  private generateSummary(
    files: ReviewFile[],
    issues: ReviewIssue[],
    score: number,
  ): ReviewSummary {
    const issuesBySeverity: Record<ReviewSeverity, number> = {
      error: 0,
      warning: 0,
      info: 0,
      hint: 0,
    };
    const issuesByCategory: Record<string, number> = {};

    for (const issue of issues) {
      issuesBySeverity[issue.severity]++;
      issuesByCategory[issue.category] = (issuesByCategory[issue.category] || 0) + 1;
    }

    let recommendation: string;
    if (score >= 90) recommendation = 'Excellent code quality. Ready to merge.';
    else if (score >= 70) recommendation = 'Good code. Address warnings before merging.';
    else if (score >= 50) recommendation = 'Needs improvement. Fix errors and warnings.';
    else recommendation = 'Significant issues found. Requires major refactoring.';

    return {
      totalFiles: files.length,
      totalIssues: issues.length,
      issuesBySeverity,
      issuesByCategory,
      overallScore: score,
      recommendation,
    };
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

export const codeReviewEngine = new CodeReviewEngine();
