/** Loads and normalizes visualization data from direct or SPARQL sources. */

import { LodeonClientError } from "../../errors/client-error";
import type { VisualizationNodeAttrs, VisualizationNodeOptions } from "./contracts";
import { normalizeSparqlResult, parseDelimitedTable, type NormalizedTable } from "./table-data";

/**
 * Loads one configured visualization source and normalizes it to a table.
 * Network and SPARQL failures retain their stable client error identifiers.
 */
export async function loadVisualizationData(
  attrs: VisualizationNodeAttrs,
  options: VisualizationNodeOptions
): Promise<NormalizedTable> {
  if (attrs.sourceMode === "sparql") {
    const query = attrs.source;

    if (!query.trim()) {
      throw new LodeonClientError("visualization.sparql_query_empty");
    }

    const profile = options.resolveKnowledgeGraphProfile(attrs.knowledgeGraphProfileId);
    const result = await options.executeQuery(profile.sparqlUrl, query, fetch);

    if (result.status === "error") {
      throw new LodeonClientError(result.code, result.variables);
    }

    return normalizeSparqlResult(result);
  }

  if (attrs.sourceMode === "url") {
    if (!attrs.url.trim()) {
      throw new LodeonClientError("visualization.data_url_empty");
    }

    const response = await options.fetchText(attrs.url);

    if (!response.ok) {
      throw new LodeonClientError("visualization.data_url_failed", {
        externalError: String(response.status)
      });
    }

    return parseDelimitedTable(
      await response.text(),
      inferUrlFormat(attrs.url, attrs.urlFormat) === "tsv" ? "\t" : ","
    );
  }

  return parseDelimitedTable(attrs.source, attrs.sourceMode === "tsv" ? "\t" : ",");
}

function inferUrlFormat(url: string, fallback: "csv" | "tsv"): "csv" | "tsv" {
  const pathname = url.split("?")[0]?.toLowerCase() ?? "";

  if (pathname.endsWith(".tsv") || pathname.endsWith(".tab")) {
    return "tsv";
  }
  if (pathname.endsWith(".csv")) {
    return "csv";
  }

  return fallback;
}
