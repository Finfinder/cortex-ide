// ─── AI Marketplace ─────────────────────────────────────────────────────────
// Download and manage new AI agents and extensions.

import type { AgentConfig } from '../opencode/config';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MarketplaceAgent {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  downloads: number;
  rating: number;
  tags: string[];
  capabilities: string[];
  config: AgentConfig;
  installed: boolean;
  installedVersion?: string;
}

export interface MarketplaceExtension {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  downloads: number;
  rating: number;
  type: ExtensionType;
  config: ExtensionConfig;
  installed: boolean;
}

export type ExtensionType =
  | 'mcp-server'
  | 'tool'
  | 'theme'
  | 'language-pack'
  | 'integration';

export interface ExtensionConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  settings?: Record<string, unknown>;
}

export interface MarketplaceCategory {
  id: string;
  name: string;
  description: string;
  agentCount: number;
}

// ─── Marketplace Data ───────────────────────────────────────────────────────

const MARKETPLACE_AGENTS: MarketplaceAgent[] = [
  {
    id: 'api-designer',
    name: 'API Designer',
    description: 'Design RESTful and GraphQL APIs with best practices',
    author: 'CortexAI',
    version: '1.0.0',
    downloads: 15420,
    rating: 4.8,
    tags: ['api', 'rest', 'graphql', 'openapi'],
    capabilities: ['architecture', 'documentation'],
    config: {
      name: 'api-designer',
      description: 'API design and documentation',
      systemPrompt: 'You are an API designer. Create RESTful and GraphQL APIs following best practices.',
      tools: { search: true, edit: true, shell: false, git: false, web: true, lsp: true },
      enabled: false,
    },
    installed: false,
  },
  {
    id: 'sql-expert',
    name: 'SQL Expert',
    description: 'Database query optimization and schema design',
    author: 'CortexAI',
    version: '1.2.0',
    downloads: 12350,
    rating: 4.7,
    tags: ['sql', 'database', 'postgresql', 'mysql'],
    capabilities: ['architecture', 'performance'],
    config: {
      name: 'sql-expert',
      description: 'SQL optimization and database design',
      systemPrompt: 'You are a SQL expert. Optimize queries and design efficient database schemas.',
      tools: { search: true, edit: true, shell: true, git: false, web: false, lsp: true },
      enabled: false,
    },
    installed: false,
  },
  {
    id: 'accessibility-auditor',
    name: 'Accessibility Auditor',
    description: 'WCAG compliance and accessibility testing',
    author: 'A11yTools',
    version: '2.0.0',
    downloads: 8920,
    rating: 4.9,
    tags: ['accessibility', 'a11y', 'wcag', 'screen-reader'],
    capabilities: ['code-review', 'testing'],
    config: {
      name: 'accessibility-auditor',
      description: 'Accessibility compliance and testing',
      systemPrompt: 'You are an accessibility expert. Ensure WCAG compliance and inclusive design.',
      tools: { search: true, edit: true, shell: false, git: false, web: true, lsp: true },
      enabled: false,
    },
    installed: false,
  },
  {
    id: 'docker-specialist',
    name: 'Docker Specialist',
    description: 'Containerization and Docker Compose configuration',
    author: 'DevOpsPro',
    version: '1.5.0',
    downloads: 21340,
    rating: 4.6,
    tags: ['docker', 'containers', 'devops', 'kubernetes'],
    capabilities: ['architecture', 'performance'],
    config: {
      name: 'docker-specialist',
      description: 'Docker and container configuration',
      systemPrompt: 'You are a Docker specialist. Create efficient containers and orchestration configs.',
      tools: { search: true, edit: true, shell: true, git: false, web: true, lsp: false },
      enabled: false,
    },
    installed: false,
  },
  {
    id: 'git-workflow',
    name: 'Git Workflow Manager',
    description: 'Git branching strategies and commit conventions',
    author: 'CortexAI',
    version: '1.1.0',
    downloads: 9870,
    rating: 4.5,
    tags: ['git', 'workflow', 'conventions', 'branching'],
    capabilities: ['documentation', 'research'],
    config: {
      name: 'git-workflow',
      description: 'Git workflow and commit management',
      systemPrompt: 'You are a Git expert. Manage branches, commits, and collaboration workflows.',
      tools: { search: true, edit: false, shell: true, git: true, web: false, lsp: false },
      enabled: false,
    },
    installed: false,
  },
  {
    id: 'regex-builder',
    name: 'Regex Builder',
    description: 'Build and test regular expressions',
    author: 'PatternMaster',
    version: '1.0.0',
    downloads: 18750,
    rating: 4.8,
    tags: ['regex', 'pattern', 'text-processing'],
    capabilities: ['research', 'testing'],
    config: {
      name: 'regex-builder',
      description: 'Regular expression builder and tester',
      systemPrompt: 'You are a regex expert. Build, explain, and test regular expressions.',
      tools: { search: true, edit: false, shell: false, git: false, web: true, lsp: false },
      enabled: false,
    },
    installed: false,
  },
];

const MARKETPLACE_EXTENSIONS: MarketplaceExtension[] = [
  {
    id: 'mcp-filesystem',
    name: 'Filesystem MCP Server',
    description: 'Enhanced filesystem access for AI agents',
    author: 'CortexAI',
    version: '1.0.0',
    downloads: 25600,
    rating: 4.7,
    type: 'mcp-server',
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem'],
    },
    installed: false,
  },
  {
    id: 'mcp-github',
    name: 'GitHub MCP Server',
    description: 'GitHub API integration for issue tracking and PRs',
    author: 'CortexAI',
    version: '1.2.0',
    downloads: 18900,
    rating: 4.6,
    type: 'mcp-server',
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_TOKEN: '' },
    },
    installed: false,
  },
  {
    id: 'theme-monokai',
    name: 'Monokai Pro Theme',
    description: 'Popular Monokai Pro color scheme',
    author: 'ThemeStudio',
    version: '1.0.0',
    downloads: 42100,
    rating: 4.9,
    type: 'theme',
    config: {
      settings: {
        colors: {
          background: '#272822',
          foreground: '#F8F8F2',
          primary: '#A6E22E',
          secondary: '#FD971F',
          accent: '#66D9EF',
        },
      },
    },
    installed: false,
  },
];

const MARKETPLACE_CATEGORIES: MarketplaceCategory[] = [
  { id: 'all', name: 'All Agents', description: 'Browse all available agents', agentCount: MARKETPLACE_AGENTS.length },
  { id: 'development', name: 'Development', description: 'Software development agents', agentCount: 4 },
  { id: 'devops', name: 'DevOps', description: 'Infrastructure and deployment', agentCount: 2 },
  { id: 'quality', name: 'Quality', description: 'Testing and code review', agentCount: 2 },
  { id: 'documentation', name: 'Documentation', description: 'Docs and comments', agentCount: 1 },
];

// ─── Marketplace Engine ─────────────────────────────────────────────────────

export class MarketplaceEngine {
  private agents: MarketplaceAgent[] = [...MARKETPLACE_AGENTS];
  private extensions: MarketplaceExtension[] = [...MARKETPLACE_EXTENSIONS];
  private categories: MarketplaceCategory[] = [...MARKETPLACE_CATEGORIES];
  private installedAgents: Set<string> = new Set();
  private installedExtensions: Set<string> = new Set();

  /**
   * Get all available agents.
   */
  getAgents(category?: string): MarketplaceAgent[] {
    if (!category || category === 'all') return this.agents;
    // Filter by category tags
    return this.agents.filter(a =>
      a.tags.some(t => category.toLowerCase().includes(t))
    );
  }

  /**
   * Get agent by ID.
   */
  getAgent(id: string): MarketplaceAgent | undefined {
    return this.agents.find(a => a.id === id);
  }

  /**
   * Search agents by query.
   */
  searchAgents(query: string): MarketplaceAgent[] {
    const q = query.toLowerCase();
    return this.agents.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.tags.some(t => t.toLowerCase().includes(q))
    );
  }

  /**
   * Get popular agents (sorted by downloads).
   */
  getPopularAgents(limit: number = 10): MarketplaceAgent[] {
    return [...this.agents]
      .sort((a, b) => b.downloads - a.downloads)
      .slice(0, limit);
  }

  /**
   * Get top-rated agents (sorted by rating).
   */
  getTopRatedAgents(limit: number = 10): MarketplaceAgent[] {
    return [...this.agents]
      .sort((a, b) => b.rating - a.rating)
      .slice(0, limit);
  }

  /**
   * Install an agent.
   */
  installAgent(id: string): boolean {
    const agent = this.agents.find(a => a.id === id);
    if (!agent) return false;

    agent.installed = true;
    agent.installedVersion = agent.version;
    this.installedAgents.add(id);
    return true;
  }

  /**
   * Uninstall an agent.
   */
  uninstallAgent(id: string): boolean {
    const agent = this.agents.find(a => a.id === id);
    if (!agent) return false;

    agent.installed = false;
    agent.installedVersion = undefined;
    this.installedAgents.delete(id);
    return true;
  }

  /**
   * Get installed agents.
   */
  getInstalledAgents(): MarketplaceAgent[] {
    return this.agents.filter(a => a.installed);
  }

  /**
   * Get all extensions.
   */
  getExtensions(type?: ExtensionType): MarketplaceExtension[] {
    if (!type) return this.extensions;
    return this.extensions.filter(e => e.type === type);
  }

  /**
   * Install an extension.
   */
  installExtension(id: string): boolean {
    const ext = this.extensions.find(e => e.id === id);
    if (!ext) return false;

    ext.installed = true;
    this.installedExtensions.add(id);
    return true;
  }

  /**
   * Uninstall an extension.
   */
  uninstallExtension(id: string): boolean {
    const ext = this.extensions.find(e => e.id === id);
    if (!ext) return false;

    ext.installed = false;
    this.installedExtensions.delete(id);
    return true;
  }

  /**
   * Get categories.
   */
  getCategories(): MarketplaceCategory[] {
    return this.categories;
  }

  /**
   * Get installed extensions.
   */
  getInstalledExtensions(): MarketplaceExtension[] {
    return this.extensions.filter(e => e.installed);
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

export const marketplaceEngine = new MarketplaceEngine();
