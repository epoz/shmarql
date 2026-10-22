/** Owns the typed Graph Explorer Special Node transport boundary and its protocol normalization. */

import { z } from "zod";
import { currentAuthHeaders } from "../../auth/api-client";
import type { LodeonConfig } from "../../configuration/schema";
import { LodeonClientError } from "../../errors/client-error";
import type { GraphExplorerGraphData } from "./viewer";

type KnowledgeGraphProfile = LodeonConfig["knowledgeGraph"]["profiles"][number] & {
  graphExplorer?: LodeonConfig["nodes"]["graphExplorer"]["profiles"][string];
};

export type GraphExplorerExpandPayload = {
  iris: string[];
  direction: "outgoing" | "incoming" | "both";
  depth: number;
  maxNodes: number;
  maxEdgesPerNode: number;
  includeLiterals: boolean;
  includeBlankNodes: boolean;
};

export type GraphExplorerExpandResponse = GraphExplorerGraphData & {
  ok: boolean;
  profileId: string;
  request?: Record<string, unknown>;
  query?: string;
};

const graphExplorerNodePropertySchema = z
  .object({
    id: z.string().optional(),
    label: z.string(),
    value: z.string(),
    iri: z.string().optional(),
    link: z.boolean().optional()
  })
  .strict();

const graphExplorerNodeSchema = z
  .object({
    id: z.string(),
    iri: z.string().optional(),
    label: z.string().optional(),
    hasLabel: z.boolean().optional(),
    kind: z.enum(["iri", "blank", "literal"]).optional(),
    type: z.string().optional(),
    typeLabel: z.string().optional(),
    properties: z.array(graphExplorerNodePropertySchema).optional(),
    start: z.boolean().optional(),
    expanded: z.boolean().optional(),
    loading: z.boolean().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    fx: z.number().nullable().optional(),
    fy: z.number().nullable().optional()
  })
  .strict();

const graphExplorerEdgeSchema = z
  .object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
    predicate: z.string(),
    label: z.string().optional(),
    direction: z.string().optional()
  })
  .strict();

const graphExplorerResponseSchema = z
  .object({
    ok: z.boolean(),
    profileId: z.string().optional(),
    nodes: z.array(graphExplorerNodeSchema),
    edges: z.array(graphExplorerEdgeSchema),
    warnings: z.array(z.string()).optional(),
    truncated: z.boolean().optional(),
    request: z.record(z.string(), z.unknown()).optional(),
    query: z.string().optional(),
    code: z.string().optional()
  })
  .passthrough();

export async function expandGraphExplorer(
  profile: KnowledgeGraphProfile,
  payload: GraphExplorerExpandPayload,
  fetcher: typeof fetch = fetch
): Promise<GraphExplorerExpandResponse> {
  const endpoint = resolveGraphExplorerEndpoint(profile);
  const response = await fetcher(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...currentAuthHeaders()
    },
    body: JSON.stringify(payload)
  });
  const rawBody = await readJsonBody(response);

  if (!response.ok) {
    throw new LodeonClientError(
      typeof rawBody.code === "string" ? rawBody.code : "graph_explorer.request_invalid",
      {
        externalError: JSON.stringify(rawBody),
        statusCode: response.status
      }
    );
  }

  const body = graphExplorerResponseSchema.parse(rawBody);
  if (!body.ok) {
    throw new LodeonClientError(body.code ?? "graph_explorer.request_invalid", {
      externalError: JSON.stringify(body),
      statusCode: response.status
    });
  }

  return {
    ok: true,
    profileId: body.profileId ?? profile.id,
    nodes: body.nodes,
    edges: body.edges,
    warnings: body.warnings ?? [],
    truncated: body.truncated ?? false,
    request: body.request,
    query: body.query
  };
}

function resolveGraphExplorerEndpoint(profile: KnowledgeGraphProfile): string {
  return profile.graphExplorer?.expandURL ?? `/api/explorer/${encodeURIComponent(profile.id)}/expand`;
}

async function readJsonBody(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("json")) {
    return {
      externalError: await response.text()
    };
  }

  const body = (await response.json()) as unknown;

  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}
