import { fireEvent, waitFor, within } from "@testing-library/dom";
import { Blob as NodeBlob } from "node:buffer";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "@lodeon/application/composition";
import { defaultConfig } from "./fixtures/config";
import { createEmptyProject } from "@lodeon/project/factory";
import { parseProject, readFileArrayBuffer } from "@lodeon/project/package/parsing";
import { serializeProject, serializeProjectZip } from "@lodeon/project/package/serialization";
import { createSparqlNodeContent } from "@lodeon/nodes/sparql/node-view";
import { createSparnaturalNodeContent } from "@lodeon/nodes/sparnatural/factory";
import { createVisualizationNodeContent } from "@lodeon/nodes/visualization/node-view";
import { createEmbedNodeContent } from "@lodeon/nodes/embed/node-view";
import { createIiifNodeContent } from "@lodeon/nodes/iiif/node-view";
import {
  createGraphExplorerNodeContent,
  GRAPH_EXPLORER_NODE_TYPE_NAME
} from "@lodeon/nodes/graph-explorer/node-view";
import { LEAFLET_NODE_TYPE_NAME } from "@lodeon/nodes/leaflet/contracts";
import { createLeafletNodeContent } from "@lodeon/nodes/leaflet/node-view";
import { VEROVIO_NODE_TYPE_NAME } from "@lodeon/nodes/verovio/contracts";
import { createVerovioNodeContent } from "@lodeon/nodes/verovio/node-view";
import { createRawGraphsNodeContent } from "@lodeon/nodes/rawgraphs/node-view";
import { VEROVIO_MULTI_ITEM_FIXTURE } from "./fixtures/verovio";
import { createMediaAssetNodeContent } from "@lodeon/nodes/media-asset/node-view";
import { createStoryMetadataNodeContent } from "@lodeon/nodes/story-metadata/node-view";
import {
  getProjectAssetBlob,
  saveProjectAssetBlob
} from "@lodeon/persistence/project-store";
import { LodeonClientError } from "@lodeon/errors/client-error";
import {
  MockRendererXMLHttpRequest,
  resetAppTestState,
  setCodeEditorValue,
  stubRendererXmlHttpRequest
} from "./fixtures/app-harness";

describe("LODEON app shell", () => {
  afterEach(resetAppTestState);

  it("requires login for protected preview and publish actions when auth is enabled", async () => {
    const root = document.createElement("div");
    const project = createEmptyProject("Auth Project");
    project.slug = "auth-project";
    const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith("/auth/status")) {
        const headers = (options?.headers ?? {}) as Record<string, string>;
        return new Response(
          JSON.stringify({
            authEnabled: true,
            authenticated: headers.Authorization === "Bearer session-1",
            ...(headers.Authorization === "Bearer session-1"
              ? { loginMethod: "token" }
              : {}),
            methods: { token: true, externalProviders: [] },
            capabilities: { publish: headers.Authorization === "Bearer session-1" }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/auth/login")) {
        return new Response(
          JSON.stringify({
            authEnabled: true,
            authenticated: true,
            loginMethod: "token",
            methods: { token: true, externalProviders: [] },
            capabilities: { publish: true },
            session: "session-1"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/auth/logout")) {
        return new Response(
          JSON.stringify({ authEnabled: true, authenticated: false }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          slug: "auth-project",
          title: "Auth Project",
          path: "story/auth-project/index.md",
          url: "/story/auth-project/"
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetcher);
    const publishXhr = new MockRendererXMLHttpRequest(
      200,
      JSON.stringify({
        slug: "auth-project",
        title: "Auth Project",
        path: "story/auth-project/index.md",
        url: "/story/auth-project/"
      })
    );
    stubRendererXmlHttpRequest(publishXhr);
    const app = await renderApp(root, defaultConfig, {
      persistence: {
        loadProject: async () => project,
        saveProject: async (project) => project,
        listProjects: async () => [project]
      },
      autosaveDelayMs: 1,
      reloadAfterAuth: () => undefined
    });

    document.body.append(root);
    const view = within(root);
    const loginButton = view.getByRole("button", {
      name: "Login"
    }) as HTMLButtonElement;

    expect(view.queryByRole("button", { name: "Preview" })).toBeNull();
    expect(view.queryByRole("button", { name: "Publish" })).toBeNull();
    expect(loginButton.hidden).toBe(false);

    loginButton.click();
    fireEvent.input(view.getByLabelText("Access token"), {
      target: { value: "secret" }
    });
    fireEvent.submit(root.querySelector<HTMLFormElement>("[data-auth-form]")!);

    await waitFor(() => {
      expect(view.getByRole("button", { name: "Logout" })).toBeTruthy();
      expect(view.getByRole("button", { name: "Preview" })).toBeTruthy();
      expect(view.getByRole("button", { name: "Publish" })).toBeTruthy();
    });

    const publishButton = view.getByRole("button", {
      name: "Publish"
    }) as HTMLButtonElement;

    publishButton.click();

    await waitFor(() => {
      expect(view.getByText("Published")).toBeTruthy();
    });

    expect(publishXhr.url).toBe("/api/publish");
    expect(publishXhr.headers).toMatchObject({
      Authorization: "Bearer session-1"
    });

    view.getByRole("button", { name: "Logout" }).click();

    await waitFor(() => {
      expect(view.getByRole("button", { name: "Login" })).toBeTruthy();
      expect(view.queryByRole("button", { name: "Preview" })).toBeNull();
      expect(view.queryByRole("button", { name: "Publish" })).toBeNull();
    });

    app.destroy();
    root.remove();
  });

  it("renders ordered external providers and applies the publish capability", async () => {
    const root = document.createElement("div");
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("/auth/status")) {
        return new Response(
          JSON.stringify({
            authEnabled: true,
            authenticated: false,
            methods: {
              token: true,
              externalProviders: [
                {
                  id: "institution",
                  label: "Institution Login",
                  icon: "https://identity.example/assets/institution.svg",
                  startUrl: "/api/auth/external/institution/start"
                },
                {
                  id: "orcid",
                  label: "ORCID",
                  icon: "/lodeon/assets/auth/sign-in.svg",
                  startUrl: "/api/auth/external/orcid/start"
                }
              ]
            },
            capabilities: { publish: false }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response("", { status: 404 });
    });
    vi.stubGlobal("fetch", fetcher);

    const app = await renderApp(root, defaultConfig, {
      persistence: {
        loadProject: async () => null,
        saveProject: async (project) => project,
        listProjects: async () => []
      },
      initialAuthError: new LodeonClientError("auth.external.exchange_invalid"),
      reloadAfterAuth: () => undefined
    });
    document.body.append(root);
    const view = within(root);

    const providerActions = Array.from(
      root.querySelectorAll<HTMLAnchorElement>("[data-auth-provider]")
    );
    expect(providerActions.map((action) => action.textContent)).toEqual([
      "Institution Login",
      "ORCID"
    ]);
    expect(providerActions.map((action) => action.getAttribute("href"))).toEqual([
      "/api/auth/external/institution/start",
      "/api/auth/external/orcid/start"
    ]);
    expect(
      providerActions.map((action) => action.querySelector("img")?.getAttribute("src"))
    ).toEqual([
      "https://identity.example/assets/institution.svg",
      "/lodeon/assets/auth/sign-in.svg"
    ]);
    expect(providerActions[0]?.classList.contains("ld-auth-provider-accent")).toBe(true);
    expect(view.getByLabelText("Access token")).toBeTruthy();
    expect(view.getByText("Or")).toBeTruthy();
    expect(
      view.getByText((content) => content.startsWith("The external login exchange is invalid"))
    ).toBeTruthy();
    expect(view.queryByRole("button", { name: "Preview" })).toBeNull();
    expect(view.queryByRole("button", { name: "Publish" })).toBeNull();

    app.destroy();
    root.remove();
  });

  it("preserves an existing node whose Knowledge Graph is not discoverable", async () => {
    const root = document.createElement("div");
    const project = createEmptyProject("Restricted Node");
    const restrictedNode = createSparqlNodeContent({
      source: "SELECT ?s WHERE { ?s ?p ?o }",
      knowledgeGraphProfileId: "restricted-kg"
    });
    project.document = {
      type: "doc",
      content: [restrictedNode]
    };

    const app = await renderApp(root, defaultConfig, {
      persistence: {
        loadProject: async () => project,
        saveProject: async (value) => value,
        listProjects: async () => [project]
      }
    });
    document.body.append(root);

    expect(
      root.querySelector<HTMLElement>(".ld-special-node-field-profile")?.textContent
    ).toBe("Missing KG profile: restricted-kg");
    expect(restrictedNode.attrs?.knowledgeGraphProfileId).toBe("restricted-kg");
    expect(project.document.content?.[0]?.attrs?.knowledgeGraphProfileId).toBe(
      "restricted-kg"
    );

    app.destroy();
    root.remove();
  });

  it("renders no Assistant panel and makes no Assistant requests", async () => {
    const root = document.createElement("div");
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          authEnabled: false,
          authenticated: false,
          methods: { token: false, externalProviders: [] },
          capabilities: { publish: false }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetcher);

    const app = await renderApp(root, defaultConfig, {
      persistence: {
        loadProject: async () => null,
        saveProject: async (project) => project,
        listProjects: async () => []
      }
    });
    document.body.append(root);

    expect(root.querySelector("[data-assistant-panel]")).toBeNull();
    expect(root.querySelector("[data-assistant-resize]")).toBeNull();
    expect(root.querySelector("[data-project-export-modal]")).toBeNull();
    expect(
      fetcher.mock.calls.some(([url]) => String(url).includes("/assistant/"))
    ).toBe(false);
    expect(within(root).queryByRole("button", { name: "Publish" })).toBeNull();

    app.destroy();
    root.remove();
  });

  it("can hide the topbar knowledge graph selector through configuration", async () => {
    const root = document.createElement("div");
    const config = structuredClone(defaultConfig);
    config.knowledgeGraph = {
      ...config.knowledgeGraph,
      ui: { showProfileSelect: false }
    };
    const fetcher = vi.fn(async (url: string) => {
      return new Response(
        JSON.stringify({ authEnabled: false, authenticated: true }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetcher);

    const app = await renderApp(root, config, {
      persistence: {
        loadProject: async () => null,
        saveProject: async (project) => project,
        listProjects: async () => []
      }
    });
    document.body.append(root);

    expect(root.querySelector("[data-knowledge-graph-picker]")).toBeNull();

    app.destroy();
    root.remove();
  });

  it("persists global knowledge graph selection and uses it for new nodes", async () => {
    localStorage.setItem("lodeon.knowledgeGraphProfileId", "secondary-kg");
    const root = document.createElement("div");
    const config = structuredClone(defaultConfig);
    config.knowledgeGraph.profiles = [
      {
        id: "culture-kg",
        label: "Culture KG",
        active: true,
        sparqlUrl: "/api/sparql/culture-kg",
      },
      {
        id: "secondary-kg",
        label: "Secondary KG",
        sparqlUrl: "/api/sparql/secondary-kg",
      }
    ];
    config.nodes.sparql.profiles["secondary-kg"] = {
      configURL: "/assets/sparnatural/secondary.ttl"
    };
    const project = createEmptyProject("KG Project");
    let savedProject = project;
    const fetcher = vi.fn(async () => {
      return new Response(
        JSON.stringify({ authEnabled: false, authenticated: true }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetcher);

    const app = await renderApp(root, config, {
      persistence: {
        loadProject: async () => project,
        saveProject: async (project) => {
          savedProject = project;
          return project;
        },
        listProjects: async () => [project]
      },
      autosaveDelayMs: 1
    });
    document.body.append(root);
    const view = within(root);
    const knowledgeGraphSelect = view.getByLabelText(
      "Knowledge graph"
    ) as HTMLSelectElement;

    expect(knowledgeGraphSelect.value).toBe("secondary-kg");

    fireEvent.change(knowledgeGraphSelect, { target: { value: "culture-kg" } });
    expect(localStorage.getItem("lodeon.knowledgeGraphProfileId")).toBe("culture-kg");

    fireEvent.change(view.getByLabelText("Special Nodes"), {
      target: { value: "sparql" }
    });

    await waitFor(() => {
      const sparnaturalNode = savedProject.document.content?.find(
        (node) => node.type === "sparnaturalNode"
      );

      expect(sparnaturalNode?.attrs?.knowledgeGraphProfileId).toBe("culture-kg");
      expect(sparnaturalNode?.attrs?.configId).toBe("culture-kg");
    });

    app.destroy();
    root.remove();
  });

  it("keeps existing graph nodes bound to their stored KG profile after topbar changes", async () => {
    const root = document.createElement("div");
    const config = structuredClone(defaultConfig);
    config.knowledgeGraph.profiles = [
      {
        id: "culture-kg",
        label: "Culture KG",
        active: true,
        sparqlUrl: "/api/sparql/culture-kg",
      },
      {
        id: "secondary-kg",
        label: "Secondary KG",
        sparqlUrl: "/api/sparql/secondary-kg",
      }
    ];
    const project = createEmptyProject("Multi KG Execution Project");
    project.document.content = [
      {
        type: "sparqlNode",
        attrs: {
          id: "culture-query",
          kind: "sparql",
          title: "Culture query",
          source: "SELECT ?culture WHERE { ?culture ?p ?o }",
          knowledgeGraphProfileId: "culture-kg",
          result: null,
          viewConfig: {},
          collapsed: false
        }
      },
      {
        type: "sparqlNode",
        attrs: {
          id: "secondary-query",
          kind: "sparql",
          title: "Secondary query",
          source: "SELECT ?secondary WHERE { ?secondary ?p ?o }",
          knowledgeGraphProfileId: "secondary-kg",
          result: null,
          viewConfig: {},
          collapsed: false
        }
      }
    ];
    let savedProject = project;
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({ head: { vars: ["s"] }, results: { bindings: [] } }),
        {
          status: 200,
          headers: { "content-type": "application/sparql-results+json" }
        }
      )
    );
    vi.stubGlobal("fetch", fetcher);

    const app = await renderApp(root, config, {
      persistence: {
        loadProject: async () => project,
        saveProject: async (project) => {
          savedProject = project;
          return project;
        },
        listProjects: async () => [project]
      },
      autosaveDelayMs: 1
    });
    document.body.append(root);
    const view = within(root);
    const knowledgeGraphSelect = view.getByLabelText(
      "Knowledge graph"
    ) as HTMLSelectElement;

    fireEvent.change(knowledgeGraphSelect, { target: { value: "secondary-kg" } });

    const runButtons = view.getAllByRole("button", { name: "Run SPARQL query" });
    runButtons[0].click();
    runButtons[1].click();

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledWith(
        "/api/sparql/culture-kg",
        expect.objectContaining({
          body: "SELECT ?culture WHERE { ?culture ?p ?o }"
        })
      );
      expect(fetcher).toHaveBeenCalledWith(
        "/api/sparql/secondary-kg",
        expect.objectContaining({
          body: "SELECT ?secondary WHERE { ?secondary ?p ?o }"
        })
      );
    });

    expect(savedProject.document.content?.[0]?.attrs?.knowledgeGraphProfileId).toBe(
      "culture-kg"
    );
    expect(savedProject.document.content?.[1]?.attrs?.knowledgeGraphProfileId).toBe(
      "secondary-kg"
    );

    app.destroy();
    root.remove();
  });

  it("keeps missing graph node profile ids instead of silently falling back", async () => {
    const root = document.createElement("div");
    const config = structuredClone(defaultConfig);
    config.knowledgeGraph.profiles = [
      {
        id: "culture-kg",
        label: "Culture KG",
        active: true,
        sparqlUrl: "/api/sparql/culture-kg",
      }
    ];
    const project = createEmptyProject("Missing KG Execution Project");
    project.document.content = [
      {
        type: "sparqlNode",
        attrs: {
          id: "missing-query",
          kind: "sparql",
          title: "Missing profile query",
          source: "SELECT ?s WHERE { ?s ?p ?o }",
          knowledgeGraphProfileId: "missing-kg",
          result: null,
          viewConfig: {},
          collapsed: false
        }
      }
    ];
    let savedProject = project;
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          code: "sparql.request_invalid",
          detail: "Unknown knowledge graph profile 'missing-kg'"
        }),
        {
          status: 400,
          headers: { "content-type": "application/json" }
        }
      )
    );
    vi.stubGlobal("fetch", fetcher);

    const app = await renderApp(root, config, {
      persistence: {
        loadProject: async () => project,
        saveProject: async (project) => {
          savedProject = project;
          return project;
        },
        listProjects: async () => [project]
      },
      autosaveDelayMs: 1
    });
    document.body.append(root);
    const view = within(root);

    view.getByRole("button", { name: "Run SPARQL query" }).click();

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledWith(
        "/api/sparql/missing-kg",
        expect.objectContaining({
          body: "SELECT ?s WHERE { ?s ?p ?o }"
        })
      );
    });
    await waitFor(() => {
      expect(
        view.getByText(/The SPARQL request is invalid/)
      ).toBeTruthy();
    });
    expect(root.textContent).toContain("Unknown knowledge graph profile 'missing-kg'");

    expect(fetcher).not.toHaveBeenCalledWith(
      "/api/sparql/culture-kg",
      expect.anything()
    );
    expect(savedProject.document.content?.[0]?.attrs?.knowledgeGraphProfileId).toBe(
      "missing-kg"
    );

    app.destroy();
    root.remove();
  });

});
