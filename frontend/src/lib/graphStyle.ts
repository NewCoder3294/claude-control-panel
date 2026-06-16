import type { GraphNodeType } from "@shared/contracts";

/**
 * Stable color per node type, used by both the cytoscape canvas and legend.
 * Monochrome ramp tuned for a white background: types are differentiated by a
 * subtle light-to-dark gray step (plus node shape on the canvas).
 */
export const NODE_TYPE_COLOR: Record<GraphNodeType, string> = {
  "claude-md": "#1f1f1f",
  rule: "#3a3a3a",
  memory: "#525252",
  skill: "#6b6b6b",
  mcp: "#7d7d7d",
  command: "#8f8f8f",
  agent: "#a0a0a0",
  project: "#b0b0b0",
  settings: "#9a9a9a",
  plugin: "#c0c0c0",
};

export const NODE_TYPE_LABEL: Record<GraphNodeType, string> = {
  "claude-md": "CLAUDE.md",
  rule: "Rule",
  memory: "Memory",
  skill: "Skill",
  mcp: "MCP",
  command: "Command",
  agent: "Agent",
  project: "Project",
  settings: "Settings",
  plugin: "Plugin",
};
