/** Owns the interactive Graph Explorer Special Node viewer lifecycle and resource cleanup. */

import * as d3 from "d3";
import { Maximize2, Minimize2, RotateCcw, Tags, ZoomIn, ZoomOut } from "lucide";
import { renderIcon } from "../../ui/icons";

export type GraphExplorerGraphNode = {
  id: string;
  iri?: string;
  label?: string;
  hasLabel?: boolean;
  kind?: "iri" | "blank" | "literal";
  type?: string;
  typeLabel?: string;
  properties?: GraphExplorerNodeProperty[];
  start?: boolean;
  expanded?: boolean;
  loading?: boolean;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
};

export type GraphExplorerNodeProperty = {
  id?: string;
  label: string;
  value: string;
  iri?: string;
  link?: boolean;
};

export type GraphExplorerGraphEdge = {
  id: string;
  source: string;
  target: string;
  predicate: string;
  label?: string;
  direction?: string;
};

export type GraphExplorerGraphData = {
  nodes: GraphExplorerGraphNode[];
  edges: GraphExplorerGraphEdge[];
  warnings?: string[];
  truncated?: boolean;
};

export type GraphExplorerViewerLabels = {
  zoomIn: string;
  zoomOut: string;
  resetZoom: string;
  togglePredicateLabels: string;
  expandNode: string;
  enterFullscreen: string;
  exitFullscreen: string;
  popupLabel: string;
  popupResource: string;
  popupType: string;
};

export type GraphExplorerViewerOptions = {
  height: number;
  showPredicateLabels: boolean;
  showTypes: boolean;
  colorway?: string[];
  singleTraceColor?: string;
  colors?: {
    nodeColors?: Record<string, string>;
    edgeColors?: Record<string, string>;
  };
  labels: GraphExplorerViewerLabels;
  onExpand: (node: GraphExplorerGraphNode) => void;
  onLayoutChange?: (graph: GraphExplorerGraphData) => void;
};

type SimulationNode = GraphExplorerGraphNode;

type SimulationEdge = Omit<GraphExplorerGraphEdge, "source" | "target"> & {
  source: SimulationNode | string;
  target: SimulationNode | string;
};

type NodeEnterSelection = d3.Selection<d3.EnterElement, SimulationNode, SVGGElement, unknown>;
type NodeSelection = d3.Selection<SVGGElement, SimulationNode, SVGGElement, unknown>;

export type GraphExplorerViewer = {
  update: (graph: GraphExplorerGraphData) => void;
  getGraphData: () => GraphExplorerGraphData;
  destroy: () => void;
};

const NODE_RADIUS = 30;
const LITERAL_RADIUS = 22;
const MARKER_SIZE = 10;
const DEFAULT_GRAPH_COLORWAY = [
  "#000000",
  "#E69F00",
  "#56B4E9",
  "#009E73",
  "#F0E442",
  "#0072B2",
  "#D55E00",
  "#CC79A7"
];
const DEFAULT_GRAPH_ACCENT = "#0072B2";

/**
 * Creates one interactive graph viewer. The returned owner must be destroyed
 * to stop D3 simulation work and detach viewer-scoped listeners.
 */
export function renderGraphExplorerViewer(
  host: HTMLElement,
  graph: GraphExplorerGraphData,
  options: GraphExplorerViewerOptions
): GraphExplorerViewer {
  host.innerHTML = "";
  const shell = document.createElement("div");
  const toolbar = document.createElement("div");
  const popover = document.createElement("div");
  const svgElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const width = Math.max(host.clientWidth || 960, 320);
  const height = Math.max(options.height, 160);
  const colorway = options.colorway?.length ? options.colorway : DEFAULT_GRAPH_COLORWAY;
  const singleTraceColor = options.singleTraceColor ?? colorway[5] ?? colorway[0] ?? DEFAULT_GRAPH_ACCENT;
  const nodeColors = {
    iri: singleTraceColor,
    blank: colorway[1] ?? "#E69F00",
    literal: "#FFFFFF",
    ...(options.colors?.nodeColors ?? {})
  };
  const edgeColors = {
    default: "#666666",
    ...(options.colors?.edgeColors ?? {})
  };
  let showPredicateLabels = options.showPredicateLabels;
  let isFullscreen = false;
  let popoverCloseTimer: number | undefined;

  shell.className = "ld-graph-viewer-shell";
  toolbar.className = "ld-graph-viewer-toolbar";
  popover.className = "ld-graph-node-popover";
  popover.hidden = true;
  svgElement.classList.add("ld-graph-viewer-svg");
  svgElement.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svgElement.setAttribute("width", "100%");
  svgElement.setAttribute("height", String(height));
  svgElement.style.minHeight = `${height}px`;
  svgElement.setAttribute("role", "img");

  shell.append(toolbar, popover, svgElement);
  host.append(shell);

  const svg = d3.select<SVGSVGElement, unknown>(svgElement);
  const group = svg.append("g").attr("class", "ld-graph-viewer-canvas");
  const zoom = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.25, 5])
    .on("zoom", (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
      group.attr("transform", event.transform.toString());
    });
  let nodes: SimulationNode[] = graph.nodes.map((node) => ({ ...node }));
  let edges: SimulationEdge[] = graph.edges.map((edge) => ({ ...edge }));
  let warnings = graph.warnings;
  let truncated = graph.truncated;
  const linkForce = d3
    .forceLink<SimulationNode, SimulationEdge>(edges)
    .id((entry) => entry.id)
    .distance(180);
  const simulation = d3
    .forceSimulation<SimulationNode>(nodes)
    .force("link", linkForce)
    .force("charge", d3.forceManyBody().strength(-420))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide<SimulationNode>().radius(NODE_RADIUS + 18));

  svg.call(zoom).call(
    zoom.transform,
    d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(0.78)
      .translate(-width / 2, -height / 2)
  );

  const markerId = `ld-graph-arrow-${Math.random().toString(36).slice(2)}`;
  const defs = svg.append("defs");

  defs
    .append("marker")
    .attr("id", markerId)
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", MARKER_SIZE)
    .attr("refY", 0)
    .attr("markerWidth", MARKER_SIZE)
    .attr("markerHeight", MARKER_SIZE)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", "currentColor");

  let link = group
    .selectAll<SVGLineElement, SimulationEdge>("line")
    .data(edges)
    .join("line")
    .attr("class", "ld-graph-viewer-link")
    .attr("marker-end", `url(#${markerId})`)
    .style("stroke", (entry: SimulationEdge) => resolveGraphExplorerEdgeColor(entry, edgeColors));

  let linkLabels = group
    .selectAll<SVGTextElement, SimulationEdge>(".ld-graph-viewer-link-label")
    .data(edges)
    .join("text")
    .attr("class", "ld-graph-viewer-link-label")
    .attr("text-anchor", "middle")
    .attr("dy", -5)
    .style("display", showPredicateLabels ? "block" : "none")
    .text((edge: SimulationEdge) => formatEdgeLabel(edge));

  let node = group
    .selectAll<SVGGElement, SimulationNode>(".ld-graph-viewer-node")
    .data(nodes, (entry: SimulationNode) => entry.id)
    .join((enter) => renderNodeEnter(enter));
  syncNodePresentation(node);

  simulation.on("tick", () => {
    link
      .attr("x1", (edge: SimulationEdge) => offsetPoint(edge, "source", "x"))
      .attr("y1", (edge: SimulationEdge) => offsetPoint(edge, "source", "y"))
      .attr("x2", (edge: SimulationEdge) => offsetPoint(edge, "target", "x", true))
      .attr("y2", (edge: SimulationEdge) => offsetPoint(edge, "target", "y", true));

    linkLabels
      .attr("x", (edge: SimulationEdge) => midpoint(edge, "x"))
      .attr("y", (edge: SimulationEdge) => midpoint(edge, "y"));

    node.attr("transform", (entry: SimulationNode) => `translate(${entry.x ?? 0},${entry.y ?? 0})`);
  });

  toolbar.append(
    createToolbarButton(options.labels.zoomIn, renderIcon(ZoomIn), () => {
      svg.transition().call(zoom.scaleBy, 1.2);
    }),
    createToolbarButton(options.labels.zoomOut, renderIcon(ZoomOut), () => {
      svg.transition().call(zoom.scaleBy, 0.8);
    }),
    createToolbarButton(options.labels.resetZoom, renderIcon(RotateCcw), () => {
      svg.transition().call(zoom.transform, d3.zoomIdentity.translate(0, 0).scale(1));
    }),
    createToolbarButton(options.labels.togglePredicateLabels, renderIcon(Tags), () => {
      showPredicateLabels = !showPredicateLabels;
      linkLabels.style("display", showPredicateLabels ? "block" : "none");
    }),
    createToolbarButton(
      options.labels.enterFullscreen,
      renderIcon(Maximize2),
      () => {
        void toggleFullscreen();
      },
      (button) => {
        button.dataset.graphExplorerFullscreen = "true";
      }
    )
  );
  popover.addEventListener("mouseenter", () => {
    if (popoverCloseTimer !== undefined) {
      window.clearTimeout(popoverCloseTimer);
      popoverCloseTimer = undefined;
    }
  });
  popover.addEventListener("mouseleave", schedulePopoverClose);
  popover.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  document.addEventListener("fullscreenchange", handleFullscreenChange);

  return {
    update: (nextGraph: GraphExplorerGraphData) => {
      const previousNodes = new Map(nodes.map((entry) => [entry.id, entry]));
      warnings = nextGraph.warnings;
      truncated = nextGraph.truncated;
      nodes = nextGraph.nodes.map((entry) => ({
        ...entry,
        x: previousNodes.get(entry.id)?.x ?? entry.x,
        y: previousNodes.get(entry.id)?.y ?? entry.y,
        fx: previousNodes.get(entry.id)?.fx ?? entry.fx,
        fy: previousNodes.get(entry.id)?.fy ?? entry.fy
      }));
      edges = nextGraph.edges.map((edge) => ({ ...edge }));

      link = link
        .data(edges, (entry: SimulationEdge) => entry.id)
        .join(
          (enter) =>
            enter
              .append("line")
              .attr("class", "ld-graph-viewer-link")
              .attr("marker-end", `url(#${markerId})`),
          (update) => update,
          (exit) => exit.remove()
        )
        .style("stroke", (entry: SimulationEdge) => resolveGraphExplorerEdgeColor(entry, edgeColors));
      linkLabels = linkLabels
        .data(edges, (entry: SimulationEdge) => entry.id)
        .join(
          (enter) =>
            enter
              .append("text")
              .attr("class", "ld-graph-viewer-link-label")
              .attr("text-anchor", "middle")
              .attr("dy", -5)
              .style("display", showPredicateLabels ? "block" : "none"),
          (update) => update,
          (exit) => exit.remove()
        )
        .text((edge: SimulationEdge) => formatEdgeLabel(edge));
      node = node
        .data(nodes, (entry: SimulationNode) => entry.id)
        .join(
          (enter) => renderNodeEnter(enter),
          (update) => update,
          (exit) => exit.remove()
        );
      syncNodePresentation(node);

      simulation.nodes(nodes);
      linkForce.links(edges);
      simulation.alpha(0.65).restart();
    },
    getGraphData: () => ({
      nodes: nodes.map((entry) => ({
        id: entry.id,
        iri: entry.iri,
        label: entry.label,
        hasLabel: entry.hasLabel,
        kind: entry.kind,
        type: entry.type,
        typeLabel: entry.typeLabel,
        properties: entry.properties?.map((property) => ({ ...property })),
        start: entry.start,
        expanded: entry.expanded,
        loading: entry.loading,
        x: entry.x,
        y: entry.y,
        fx: entry.fx,
        fy: entry.fy
      })),
      edges: edges.map((edge) => ({
        id: edge.id,
        source: resolveNode(edge.source).id,
        target: resolveNode(edge.target).id,
        predicate: edge.predicate,
        label: edge.label,
        direction: edge.direction
      })),
      warnings,
      truncated
    }),
    destroy: () => {
      simulation.stop();
      if (popoverCloseTimer !== undefined) {
        window.clearTimeout(popoverCloseTimer);
      }
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      host.innerHTML = "";
    }
  };

  function handleFullscreenChange(): void {
    setFullscreenState(document.fullscreenElement === shell);
  }

  async function toggleFullscreen(): Promise<void> {
    if (document.fullscreenElement === shell) {
      await document.exitFullscreen?.();
      setFullscreenState(false);
      return;
    }

    if (shell.requestFullscreen) {
      await shell.requestFullscreen();
      setFullscreenState(true);
      return;
    }

    setFullscreenState(!isFullscreen);
  }

  function setFullscreenState(nextFullscreen: boolean): void {
    isFullscreen = nextFullscreen;
    shell.dataset.fullscreen = nextFullscreen ? "true" : "false";
    const button = toolbar.querySelector<HTMLButtonElement>("[data-graph-explorer-fullscreen='true']");
    if (!button) {
      return;
    }
    const label = nextFullscreen ? options.labels.exitFullscreen : options.labels.enterFullscreen;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.innerHTML = renderIcon(nextFullscreen ? Minimize2 : Maximize2);
  }

  function renderNodeEnter(enter: NodeEnterSelection): NodeSelection {
    const nodeGroup = enter
      .append("g")
      .attr("class", (entry: SimulationNode) =>
        [
          "ld-graph-viewer-node",
          entry.start ? "ld-graph-viewer-node-start" : "",
          entry.kind === "literal" ? "ld-graph-viewer-node-literal" : "",
          entry.kind === "blank" ? "ld-graph-viewer-node-blank" : "",
          entry.loading ? "ld-graph-viewer-node-loading" : ""
        ]
          .filter(Boolean)
          .join(" ")
      )
      .call(
        createDragBehavior(simulation, () => {
          options.onLayoutChange?.({
            nodes: nodes.map((entry) => ({ ...entry })),
            edges: edges.map((edge) => ({
              ...edge,
              source: resolveNode(edge.source).id,
              target: resolveNode(edge.target).id
            })),
            warnings,
            truncated
          });
        })
      );

    nodeGroup
      .append("circle")
      .attr("r", (entry: SimulationNode) => (entry.kind === "literal" ? LITERAL_RADIUS : NODE_RADIUS));
    nodeGroup
      .append("text")
      .attr("class", "ld-graph-viewer-node-label")
      .attr("text-anchor", "middle")
      .attr("dy", (entry: SimulationNode) =>
        entry.kind === "literal" ? LITERAL_RADIUS + 16 : NODE_RADIUS + 17
      )
      .text((entry: SimulationNode) => formatNodeLabel(entry));
    nodeGroup
      .on("mouseenter", (event, entry) => {
        showNodePopover(entry, event);
      })
      .on("mouseleave", schedulePopoverClose);
    nodeGroup.on("click", (event, entry) => {
      event.stopPropagation();
      if (entry.loading) {
        return;
      }
      options.onExpand(entry);
    });

    return nodeGroup;
  }

  function syncNodePresentation(selection: NodeSelection): void {
    selection.attr("class", (entry: SimulationNode) =>
      [
        "ld-graph-viewer-node",
        entry.start ? "ld-graph-viewer-node-start" : "",
        entry.kind === "literal" ? "ld-graph-viewer-node-literal" : "",
        entry.kind === "blank" ? "ld-graph-viewer-node-blank" : "",
        entry.fx !== undefined && entry.fx !== null ? "ld-graph-viewer-node-fixed" : "",
        entry.loading ? "ld-graph-viewer-node-loading" : ""
      ]
        .filter(Boolean)
        .join(" ")
    );
    selection
      .select("circle")
      .attr("r", (entry: SimulationNode) => (entry.kind === "literal" ? LITERAL_RADIUS : NODE_RADIUS))
      .attr("fill", (entry: SimulationNode) => resolveGraphExplorerNodeColor(entry, nodeColors));
    selection
      .select("text")
      .attr("dy", (entry: SimulationNode) =>
        entry.kind === "literal" ? LITERAL_RADIUS + 16 : NODE_RADIUS + 17
      )
      .text((entry: SimulationNode) => formatNodeLabel(entry));
  }

  function showNodePopover(entry: SimulationNode, event: MouseEvent): void {
    if (popoverCloseTimer !== undefined) {
      window.clearTimeout(popoverCloseTimer);
      popoverCloseTimer = undefined;
    }
    if (!renderNodePopover(entry)) {
      popover.hidden = true;
      return;
    }
    positionNodePopover(event);
    popover.hidden = false;
  }

  function schedulePopoverClose(): void {
    if (popoverCloseTimer !== undefined) {
      window.clearTimeout(popoverCloseTimer);
    }
    popoverCloseTimer = window.setTimeout(() => {
      popover.hidden = true;
    }, 350);
  }

  function positionNodePopover(event: MouseEvent): void {
    const shellRect = shell.getBoundingClientRect();
    const popoverWidth = popover.offsetWidth || 280;
    const popoverHeight = popover.offsetHeight || 120;
    const padding = 12;
    const rawLeft = event.clientX - shellRect.left + padding;
    const rawTop = event.clientY - shellRect.top + padding;
    const left = Math.min(
      Math.max(padding, rawLeft),
      Math.max(padding, shellRect.width - popoverWidth - padding)
    );
    const top = Math.min(
      Math.max(padding, rawTop),
      Math.max(padding, shellRect.height - popoverHeight - padding)
    );

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  function renderNodePopover(entry: SimulationNode): boolean {
    popover.innerHTML = "";
    const list = document.createElement("dl");
    list.className = "ld-graph-node-popover-list";
    let rowCount = 0;

    if (entry.hasLabel) {
      appendPopoverRow(list, options.labels.popupLabel, entry.label || entry.id);
      rowCount += 1;
    }
    if (entry.kind === "iri") {
      appendPopoverRow(list, options.labels.popupResource, entry.iri || entry.id, entry.iri || entry.id);
      rowCount += 1;
    }
    if (entry.type) {
      appendPopoverRow(
        list,
        options.labels.popupType,
        entry.typeLabel || graphExplorerCompact(entry.type, 52),
        entry.type
      );
      rowCount += 1;
    }
    for (const property of entry.properties ?? []) {
      appendPopoverRow(
        list,
        property.label,
        property.value,
        property.link ? property.iri || property.value : undefined
      );
      rowCount += 1;
    }

    popover.append(list);
    return rowCount > 0;
  }
}

function createToolbarButton(
  label: string,
  icon: string,
  onClick: () => void,
  configure?: (button: HTMLButtonElement) => void
): HTMLButtonElement {
  const button = document.createElement("button");

  button.type = "button";
  button.className = "ld-graph-viewer-control";
  button.innerHTML = icon;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
  configure?.(button);
  return button;
}

function appendPopoverRow(list: HTMLDListElement, label: string, value: string, href?: string): void {
  const term = document.createElement("dt");
  const description = document.createElement("dd");

  term.textContent = label;
  if (href && isExternalReference(href)) {
    const link = document.createElement("a");
    link.href = href;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = value;
    description.append(link);
  } else {
    description.textContent = value;
  }

  list.append(term, description);
}

function isExternalReference(value: string): boolean {
  return /^(https?:|urn:)/.test(value);
}

function createDragBehavior(
  simulation: d3.Simulation<SimulationNode, undefined>,
  onLayoutChange: () => void
): d3.DragBehavior<SVGGElement, SimulationNode, unknown> {
  return d3
    .drag<SVGGElement, SimulationNode>()
    .on("start", (event: d3.D3DragEvent<SVGGElement, SimulationNode, unknown>, node) => {
      if (!event.active) {
        simulation.alphaTarget(0.3).restart();
      }
      node.fx = node.x;
      node.fy = node.y;
    })
    .on("drag", (event: d3.D3DragEvent<SVGGElement, SimulationNode, unknown>, node) => {
      node.fx = event.x;
      node.fy = event.y;
    })
    .on("end", (event: d3.D3DragEvent<SVGGElement, SimulationNode, unknown>, node) => {
      if (!event.active) {
        simulation.alphaTarget(0);
      }
      node.fx = node.x;
      node.fy = node.y;
      onLayoutChange();
    });
}

function offsetPoint(
  edge: SimulationEdge,
  side: "source" | "target",
  axis: "x" | "y",
  reverse = false
): number {
  const source = resolveNode(edge.source);
  const target = resolveNode(edge.target);
  const angle = Math.atan2((target.y ?? 0) - (source.y ?? 0), (target.x ?? 0) - (source.x ?? 0));
  const current = side === "source" ? source : target;
  const offset = nodeRadius(current) + (reverse ? MARKER_SIZE : 0);
  const direction = side === "source" ? 1 : -1;

  if (axis === "x") {
    return (current.x ?? 0) + Math.cos(angle) * offset * direction;
  }

  return (current.y ?? 0) + Math.sin(angle) * offset * direction;
}

function midpoint(edge: SimulationEdge, axis: "x" | "y"): number {
  const source = resolveNode(edge.source);
  const target = resolveNode(edge.target);

  return ((source[axis] ?? 0) + (target[axis] ?? 0)) / 2;
}

function resolveNode(value: SimulationNode | string): SimulationNode {
  return typeof value === "string" ? { id: value } : value;
}

function nodeRadius(node: SimulationNode): number {
  return node.kind === "literal" ? LITERAL_RADIUS : NODE_RADIUS;
}

function resolveGraphExplorerNodeColor(
  node: GraphExplorerGraphNode,
  nodeColors: Record<string, string>
): string {
  if (node.type && nodeColors[node.type]) {
    return nodeColors[node.type];
  }

  return nodeColors[node.kind ?? "iri"] ?? nodeColors.iri ?? DEFAULT_GRAPH_ACCENT;
}

function resolveGraphExplorerEdgeColor(edge: SimulationEdge, edgeColors: Record<string, string>): string {
  if (edge.predicate && edgeColors[edge.predicate]) {
    return edgeColors[edge.predicate];
  }
  if (edge.direction && edgeColors[edge.direction]) {
    return edgeColors[edge.direction];
  }
  return edgeColors.default ?? "#666666";
}

function formatNodeLabel(node: GraphExplorerGraphNode): string {
  const label = node.label || node.id;

  return graphExplorerCompact(label, 34);
}

function formatEdgeLabel(edge: SimulationEdge): string {
  const label = edge.label || edge.predicate;

  return graphExplorerCompact(label, 40);
}

function graphExplorerCompact(value: string, maxLength: number): string {
  const text = String(value || "");

  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}
