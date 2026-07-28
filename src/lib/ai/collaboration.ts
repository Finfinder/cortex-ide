// ─── AI Collaboration System ────────────────────────────────────────────────
// Allows multiple AI agents to work together on complex tasks.

import { PREDEFINED_AGENTS } from '../opencode/config';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CollaborationTask {
  id: string;
  title: string;
  description: string;
  requiredCapabilities: AgentCapability[];
  status: TaskStatus;
  assignedAgents: string[];
  results: AgentResult[];
  createdAt: Date;
  completedAt?: Date;
}

export type TaskStatus =
  | 'pending'
  | 'planning'
  | 'executing'
  | 'reviewing'
  | 'completed'
  | 'failed';

export type AgentCapability =
  | 'architecture'
  | 'code-review'
  | 'testing'
  | 'debugging'
  | 'documentation'
  | 'research'
  | 'translation'
  | 'refactoring'
  | 'performance'
  | 'security';

export interface AgentResult {
  agentName: string;
  capability: AgentCapability;
  output: string;
  filesModified?: string[];
  suggestions?: string[];
  timestamp: Date;
}

export interface CollaborationPlan {
  taskId: string;
  steps: PlanStep[];
  estimatedDuration: number;
  requiredAgents: string[];
}

export interface PlanStep {
  order: number;
  agentName: string;
  capability: AgentCapability;
  description: string;
  dependencies: number[];
  estimatedDuration: number;
}

// ─── Capability Mapping ─────────────────────────────────────────────────────

const AGENT_CAPABILITIES: Record<string, AgentCapability[]> = {
  architect: ['architecture', 'performance'],
  'code-reviewer': ['code-review', 'security'],
  'test-writer': ['testing'],
  debugger: ['debugging', 'security'],
  'devops-engineer': ['performance', 'security'],
  'security-auditor': ['security'],
  'documentation-writer': ['documentation'],
  refactorer: ['refactoring', 'performance'],
  'performance-engineer': ['performance'],
  'data-engineer': ['architecture'],
  'frontend-developer': ['architecture', 'documentation'],
  'backend-developer': ['architecture', 'performance'],
  'mobile-developer': ['architecture', 'performance'],
  'ml-engineer': ['performance', 'research'],
  'general-assistant': ['documentation', 'research'],
  researcher: ['research', 'documentation'],
  tester: ['testing', 'debugging'],
  translator: ['translation', 'documentation'],
  documenter: ['documentation'],
};

// ─── Collaboration Engine ───────────────────────────────────────────────────

export class CollaborationEngine {
  private tasks: Map<string, CollaborationTask> = new Map();
  private plans: Map<string, CollaborationPlan> = new Map();

  /**
   * Create a new collaboration task.
   */
  createTask(title: string, description: string): CollaborationTask {
    const task: CollaborationTask = {
      id: crypto.randomUUID(),
      title,
      description,
      requiredCapabilities: [],
      status: 'pending',
      assignedAgents: [],
      results: [],
      createdAt: new Date(),
    };
    this.tasks.set(task.id, task);
    return task;
  }

  /**
   * Analyze task and determine required capabilities.
   */
  analyzeTask(taskId: string): AgentCapability[] {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    const capabilities = new Set<AgentCapability>();
    const desc = task.description.toLowerCase();

    if (desc.includes('architect') || desc.includes('design') || desc.includes('structure')) {
      capabilities.add('architecture');
    }
    if (desc.includes('review') || desc.includes('quality') || desc.includes('check')) {
      capabilities.add('code-review');
    }
    if (desc.includes('test') || desc.includes('coverage') || desc.includes('spec')) {
      capabilities.add('testing');
    }
    if (desc.includes('debug') || desc.includes('error') || desc.includes('fix')) {
      capabilities.add('debugging');
    }
    if (desc.includes('document') || desc.includes('readme') || desc.includes('comment')) {
      capabilities.add('documentation');
    }
    if (desc.includes('research') || desc.includes('analyze') || desc.includes('investigate')) {
      capabilities.add('research');
    }
    if (desc.includes('translate') || desc.includes('convert') || desc.includes('migrate')) {
      capabilities.add('translation');
    }
    if (desc.includes('refactor') || desc.includes('improve') || desc.includes('clean')) {
      capabilities.add('refactoring');
    }
    if (desc.includes('performance') || desc.includes('optimize') || desc.includes('speed')) {
      capabilities.add('performance');
    }
    if (desc.includes('security') || desc.includes('vulnerability') || desc.includes('audit')) {
      capabilities.add('security');
    }

    // Default to research if no capabilities detected
    if (capabilities.size === 0) {
      capabilities.add('research');
    }

    task.requiredCapabilities = Array.from(capabilities);
    return task.requiredCapabilities;
  }

  /**
   * Find best agents for given capabilities.
   */
  findAgentsForCapabilities(capabilities: AgentCapability[]): string[] {
    const agentScores = new Map<string, number>();

    for (const agent of PREDEFINED_AGENTS) {
      if (!agent.enabled) continue;
      const agentCaps = AGENT_CAPABILITIES[agent.name] || [];
      let score = 0;
      for (const cap of capabilities) {
        if (agentCaps.includes(cap)) score++;
      }
      if (score > 0) agentScores.set(agent.name, score);
    }

    return Array.from(agentScores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
  }

  /**
   * Generate a collaboration plan for a task.
   */
  generatePlan(taskId: string): CollaborationPlan {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    const capabilities = task.requiredCapabilities.length > 0
      ? task.requiredCapabilities
      : this.analyzeTask(taskId);

    const agents = this.findAgentsForCapabilities(capabilities);
    const steps: PlanStep[] = [];

    // Create steps based on capabilities
    let order = 1;
    for (const cap of capabilities) {
      const agentForCap = agents.find(a => {
        const caps = AGENT_CAPABILITIES[a] || [];
        return caps.includes(cap);
      });

      if (agentForCap) {
        steps.push({
          order,
          agentName: agentForCap,
          capability: cap,
          description: `Execute ${cap} task using ${agentForCap}`,
          dependencies: order > 1 ? [order - 1] : [],
          estimatedDuration: 300, // 5 minutes default
        });
        order++;
      }
    }

    const plan: CollaborationPlan = {
      taskId,
      steps,
      estimatedDuration: steps.reduce((sum, s) => sum + s.estimatedDuration, 0),
      requiredAgents: agents,
    };

    this.plans.set(taskId, plan);
    task.assignedAgents = agents;
    return plan;
  }

  /**
   * Execute a collaboration plan step.
   */
  async executeStep(taskId: string, stepOrder: number): Promise<AgentResult> {
    const plan = this.plans.get(taskId);
    if (!plan) throw new Error(`No plan found for task ${taskId}`);

    const step = plan.steps.find(s => s.order === stepOrder);
    if (!step) throw new Error(`Step ${stepOrder} not found in plan`);

    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    task.status = 'executing';

    // Simulate agent execution
    const result: AgentResult = {
      agentName: step.agentName,
      capability: step.capability,
      output: `Completed ${step.capability} task using ${step.agentName}`,
      timestamp: new Date(),
    };

    task.results.push(result);
    return result;
  }

  /**
   * Get task status.
   */
  getTask(taskId: string): CollaborationTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get all tasks.
   */
  getAllTasks(): CollaborationTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get plan for a task.
   */
  getPlan(taskId: string): CollaborationPlan | undefined {
    return this.plans.get(taskId);
  }

  /**
   * Complete a task.
   */
  completeTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'completed';
      task.completedAt = new Date();
    }
  }

  /**
   * Delete a task.
   */
  deleteTask(taskId: string): boolean {
    this.plans.delete(taskId);
    return this.tasks.delete(taskId);
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

export const collaborationEngine = new CollaborationEngine();
