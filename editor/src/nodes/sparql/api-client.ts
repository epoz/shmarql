/** Owns the typed Sparql Special Node transport boundary and its protocol normalization. */

import { z } from "zod";
import { currentAuthHeaders } from "../../auth/api-client";

export type SparqlBindingValue = {
  type: string;
  value: string;
  datatype?: string;
  language?: string;
};

export type NormalizedSparqlRow = Record<string, SparqlBindingValue | null>;

export function sparqlRowValue(row: NormalizedSparqlRow, variable: string): string | null {
  return row[variable]?.value ?? null;
}

export type NormalizedSparqlResult = {
  status: "success";
  endpointUrl: string;
  executedAt: string;
  durationMs: number;
  variables: string[];
  rows: NormalizedSparqlRow[];
  boolean?: boolean;
};

export type SparqlErrorResult = {
  status: "error";
  endpointUrl: string;
  executedAt: string;
  durationMs: number;
  code: string;
  variables?: Record<string, string>;
  message: string;
};

export type SparqlExecutionResult = NormalizedSparqlResult | SparqlErrorResult;

type RawSparqlBindingValue = {
  type?: string;
  value?: string;
  datatype?: string;
  "xml:lang"?: string;
  lang?: string;
};

type RawSparqlResultsJson = {
  head?: {
    vars?: string[];
  };
  results?: {
    bindings?: Record<string, RawSparqlBindingValue>[];
  };
  boolean?: boolean;
  code?: string;
  error?: string;
  detail?: string;
};

const rawSparqlBindingValueSchema = z
  .object({
    type: z.string().optional(),
    value: z.string().optional(),
    datatype: z.string().optional(),
    "xml:lang": z.string().optional(),
    lang: z.string().optional()
  })
  .passthrough();

const rawSparqlResultsSchema: z.ZodType<RawSparqlResultsJson> = z
  .object({
    head: z
      .object({ vars: z.array(z.string()).optional() })
      .passthrough()
      .optional(),
    results: z
      .object({ bindings: z.array(z.record(z.string(), rawSparqlBindingValueSchema)).optional() })
      .passthrough()
      .optional(),
    boolean: z.boolean().optional(),
    code: z.string().optional(),
    error: z.string().optional(),
    detail: z.string().optional()
  })
  .passthrough();

export function normalizeSparqlResults(
  raw: RawSparqlResultsJson,
  meta: { endpointUrl: string; executedAt: string; durationMs: number }
): NormalizedSparqlResult {
  const variables =
    raw.head?.vars ??
    Array.from(new Set((raw.results?.bindings ?? []).flatMap((binding) => Object.keys(binding))));

  const rows = (raw.results?.bindings ?? []).map((binding) =>
    Object.fromEntries(
      variables.map((variable) => {
        const value = binding[variable];

        return [
          variable,
          value
            ? {
                type: value.type ?? "literal",
                value: value.value ?? "",
                datatype: value.datatype,
                language: value["xml:lang"] ?? value.lang
              }
            : null
        ];
      })
    )
  );

  return {
    status: "success",
    ...meta,
    variables,
    rows,
    boolean: raw.boolean
  };
}

export async function executeSparqlQuery(
  endpointUrl: string,
  query: string,
  fetcher: typeof fetch = fetch
): Promise<SparqlExecutionResult> {
  const executedAt = new Date().toISOString();
  const startedAt = performance.now();

  try {
    const response = await fetcher(endpointUrl, {
      method: "POST",
      headers: {
        Accept: "application/sparql-results+json",
        "Content-Type": "application/sparql-query",
        ...currentAuthHeaders()
      },
      body: query
    });
    const durationMs = Math.round(performance.now() - startedAt);
    const contentType = response.headers.get("content-type") ?? "";
    const raw = contentType.includes("json")
      ? rawSparqlResultsSchema.parse(await response.json())
      : ({ error: await response.text() } satisfies RawSparqlResultsJson);

    if (!response.ok || raw.error) {
      const code = raw.code || "sparql.request_failed";
      return {
        status: "error",
        endpointUrl,
        executedAt,
        durationMs,
        code,
        variables: {
          externalError: raw.error ?? raw.detail ?? String(response.status)
        },
        message: code
      };
    }

    return normalizeSparqlResults(raw, {
      endpointUrl,
      executedAt,
      durationMs
    });
  } catch (error) {
    return {
      status: "error",
      endpointUrl,
      executedAt,
      durationMs: Math.round(performance.now() - startedAt),
      code: "sparql.request_failed",
      variables: {
        externalError: error instanceof Error ? error.message : String(error)
      },
      message: "sparql.request_failed"
    };
  }
}
