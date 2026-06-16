import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import type {
  Core,
  ElementDefinition,
  EventObject,
  StylesheetStyle,
} from "cytoscape";
import type { GraphResponse, GraphNode } from "@shared/contracts";
import { NODE_TYPE_COLOR } from "@/lib/graphStyle";

interface GraphCanvasProps {
  graph: GraphResponse;
  onNodeClick: (node: GraphNode) => void;
}

const NODE_SHAPE: Record<string, cytoscape.Css.NodeShape> = {
  "claude-md": "round-rectangle",
  rule: "round-rectangle",
  memory: "ellipse",
  skill: "diamond",
  mcp: "hexagon",
  command: "round-tag",
  agent: "octagon",
  project: "round-rectangle",
  settings: "round-pentagon",
  plugin: "barrel",
};

function buildStylesheet(): StylesheetStyle[] {
  const perType: StylesheetStyle[] = Object.entries(NODE_TYPE_COLOR).map(
    ([type, color]) => ({
      selector: `node[type = "${type}"]`,
      style: {
        "background-color": color,
        "border-color": color,
        shape: NODE_SHAPE[type] ?? "ellipse",
      },
    }),
  );

  return [
    {
      selector: "node",
      style: {
        label: "data(label)",
        color: "#1f1f1f",
        "font-size": 9,
        "font-family": "Inter, ui-sans-serif, system-ui, sans-serif",
        "text-valign": "bottom",
        "text-halign": "center",
        "text-margin-y": 4,
        "text-max-width": "120px",
        "text-wrap": "ellipsis",
        width: 22,
        height: 22,
        "border-width": 1.5,
        "border-color": "#ffffff",
        "background-opacity": 0.9,
        "transition-property": "background-opacity, border-width, width, height",
        "transition-duration": 120,
      },
    },
    ...perType,
    {
      selector: 'node[group = "startup"]',
      style: { width: 30, height: 30, "background-opacity": 1 },
    },
    {
      selector: "edge",
      style: {
        width: 1,
        "line-color": "#d0d0d0",
        "target-arrow-color": "#b3b3b3",
        "target-arrow-shape": "triangle",
        "arrow-scale": 0.7,
        "curve-style": "bezier",
        label: "data(label)",
        "font-size": 7,
        color: "#9a9a9a",
        "text-rotation": "autorotate",
        "text-background-color": "#ffffff",
        "text-background-opacity": 0.85,
        "text-background-padding": "1px",
      },
    },
    {
      selector: "node:selected",
      style: {
        "border-width": 3,
        "border-color": "#1a1a1a",
        "background-opacity": 1,
      },
    },
    {
      selector: ".faded",
      style: { opacity: 0.2 },
    },
    {
      selector: ".highlight",
      style: { "line-color": "#1a1a1a", "target-arrow-color": "#1a1a1a" },
    },
  ];
}

export function GraphCanvas({ graph, onNodeClick }: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const clickRef = useRef(onNodeClick);
  clickRef.current = onNodeClick;

  useEffect(() => {
    if (!containerRef.current) return;

    const elements: ElementDefinition[] = [
      ...graph.nodes.map((n) => ({
        data: {
          id: n.id,
          label: n.label,
          type: n.type,
          group: n.group,
        },
      })),
      ...graph.edges.map((e) => ({
        data: {
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label,
        },
      })),
    ];

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: buildStylesheet(),
      layout: {
        name: "cose",
        animate: false,
        nodeRepulsion: () => 12000,
        idealEdgeLength: () => 90,
        nodeOverlap: 16,
        gravity: 0.4,
        padding: 30,
        randomize: false,
        componentSpacing: 80,
      },
      minZoom: 0.2,
      maxZoom: 3,
      wheelSensitivity: 0.25,
      // "auto" renders at the device pixel ratio (2x on retina). Hardcoding 1
      // halves the resolution and makes nodes + labels look blurry.
      pixelRatio: "auto",
    });
    cyRef.current = cy;

    const byId = new Map(graph.nodes.map((n) => [n.id, n]));

    cy.on("tap", "node", (evt: EventObject) => {
      const id = evt.target.id() as string;
      const node = byId.get(id);
      // Highlight neighborhood.
      cy.elements().removeClass("faded").removeClass("highlight");
      const hood = evt.target.closedNeighborhood();
      cy.elements().not(hood).addClass("faded");
      hood.edges().addClass("highlight");
      if (node) clickRef.current(node);
    });

    cy.on("tap", (evt: EventObject) => {
      if (evt.target === cy) {
        cy.elements().removeClass("faded").removeClass("highlight");
        cy.$(":selected").unselect();
      }
    });

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [graph]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ background: "#ffffff" }}
    />
  );
}
