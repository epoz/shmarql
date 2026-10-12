import { describe, expect, it, vi } from "vitest";
import {
  executeSparqlQuery,
  normalizeSparqlResults,
  sparqlRowValue
} from "@lodeon/nodes/sparql/api-client";

describe("SPARQL client", () => {
  it("reads URI and literal bindings while preserving unbound values", () => {
    const row = {
      resource: { type: "uri", value: "https://example.org/resource/1" },
      label: { type: "literal", value: "Example", language: "en" },
      missing: null
    };

    expect(sparqlRowValue(row, "resource")).toBe(
      "https://example.org/resource/1"
    );
    expect(sparqlRowValue(row, "label")).toBe("Example");
    expect(sparqlRowValue(row, "missing")).toBeNull();
    expect(sparqlRowValue(row, "unknown")).toBeNull();
  });

  it("normalizes SPARQL JSON results into table rows", () => {
    const result = normalizeSparqlResults(
      {
        head: { vars: ["item", "label"] },
        results: {
          bindings: [
            {
              item: {
                type: "uri",
                value: "https://example.org/item/1"
              },
              label: {
                type: "literal",
                value: "First Item",
                "xml:lang": "en"
              }
            }
          ]
        }
      },
      {
        endpointUrl: "/sparql",
        executedAt: "2026-06-27T09:00:00.000Z",
        durationMs: 12
      }
    );

    expect(result.variables).toEqual(["item", "label"]);
    expect(result.rows[0].item?.type).toBe("uri");
    expect(result.rows[0].label?.language).toBe("en");
  });

  it("posts SPARQL queries to Shmarql and normalizes the response", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          head: { vars: ["person"] },
          results: {
            bindings: [
              {
                person: {
                  type: "uri",
                  value: "https://example.org/person/1"
                }
              }
            ]
          }
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/sparql-results+json"
          }
        }
      )
    );

    const result = await executeSparqlQuery(
      "/sparql",
      "SELECT ?person WHERE { ?person a ?type } LIMIT 1",
      fetcher
    );

    expect(fetcher).toHaveBeenCalledWith("/sparql", {
      method: "POST",
      headers: {
        Accept: "application/sparql-results+json",
        "Content-Type": "application/sparql-query"
      },
      body: "SELECT ?person WHERE { ?person a ?type } LIMIT 1"
    });
    expect(result.status).toBe("success");

    if (result.status === "success") {
      expect(result.variables).toEqual(["person"]);
      expect(result.rows[0].person?.value).toBe("https://example.org/person/1");
    }
  });

  it("posts profile-routed SPARQL queries to the configured broker path", async () => {
    sessionStorage.setItem("lodeon.auth.session", "restricted-session");
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ head: { vars: ["s"] }, results: { bindings: [] } }), {
        status: 200,
        headers: {
          "content-type": "application/sparql-results+json"
        }
      })
    );

    await executeSparqlQuery(
      "/api/sparql/secondary-kg",
      "SELECT ?s WHERE { ?s ?p ?o } LIMIT 1",
      fetcher
    );

    expect(fetcher).toHaveBeenCalledWith("/api/sparql/secondary-kg", {
      method: "POST",
      headers: {
        Accept: "application/sparql-results+json",
        "Content-Type": "application/sparql-query",
        Authorization: "Bearer restricted-session"
      },
      body: "SELECT ?s WHERE { ?s ?p ?o } LIMIT 1"
    });
    sessionStorage.removeItem("lodeon.auth.session");
  });

  it("fails closed when a successful endpoint response violates the SPARQL result envelope", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ head: { vars: "not-an-array" } }), {
        status: 200,
        headers: { "content-type": "application/sparql-results+json" }
      })
    );

    const result = await executeSparqlQuery(
      "/sparql",
      "SELECT ?s WHERE { ?s ?p ?o }",
      fetcher
    );

    expect(result.status).toBe("error");
  });

  it("preserves a restricted Knowledge Graph denial for the node error surface", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          code: "auth.knowledge_graph_access_denied",
          detail: "denied"
        }),
        { status: 403, headers: { "content-type": "application/problem+json" } }
      )
    );

    const result = await executeSparqlQuery(
      "/api/sparql/restricted-kg",
      "SELECT ?s WHERE { ?s ?p ?o }",
      fetcher
    );

    expect(result).toMatchObject({
      status: "error",
      code: "auth.knowledge_graph_access_denied"
    });
  });
});
