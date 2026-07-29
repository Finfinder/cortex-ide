// ─── MCP Module Exports ──────────────────────────────────────────────────────

export { McpIntegration, type McpServerStatus, type McpIntegrationConfig, type McpTool, type McpResource, type McpPrompt } from './integration';
export {
  checkPermissions,
  applyDecision,
  isAlwaysAllowed,
  readAuditLog,
  clearAuditLog,
  getAuditLogByServer,
  getAuditLogByDate,
  type PermissionScope,
  type PermissionRequest,
  type PermissionDecision,
  type AuditLogEntry,
} from './permissions';
