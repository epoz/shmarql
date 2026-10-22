import { fireEvent } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";
import {
  createAuthController,
  renderAuthControlState
} from "@lodeon/auth/controller";
import {
  createKnowledgeGraphProfileController,
  KNOWLEDGE_GRAPH_PROFILE_STORAGE_KEY
} from "@lodeon/knowledge-graph/profile-controller";
import { createLocalization } from "@lodeon/localization/runtime";
import { defaultConfig } from "./fixtures/config";

describe("auth controller", () => {
  it("starts fail-closed before authoritative discovery completes", () => {
    const controller = createAuthController();

    expect(controller.getSession()).toEqual({
      authEnabled: true,
      authenticated: false,
      methods: { token: false, externalProviders: [] },
      capabilities: { publish: false }
    });
    expect(controller.isAuthorized()).toBe(false);
  });

  it("owns initialize, login, logout, authorization, and session notifications", async () => {
    const sessions: Array<{ authenticated: boolean; session?: string }> = [];
    const controller = createAuthController({
      loadSession: vi.fn().mockResolvedValue({
        authEnabled: true,
        authenticated: false
      }),
      login: vi.fn().mockResolvedValue({
        authEnabled: true,
        authenticated: true,
        session: "session-one"
      }),
      logoutSession: vi.fn().mockResolvedValue({
        authEnabled: true,
        authenticated: false
      }),
      onSessionChange: (session) => sessions.push(session)
    });

    await controller.initialize();
    expect(controller.isAuthorized()).toBe(false);
    await controller.login("token-one");
    expect(controller.getSessionToken()).toBe("session-one");
    expect(controller.isAuthorized()).toBe(true);
    await controller.logout();

    expect(sessions.map((session) => session.authenticated)).toEqual([
      false,
      true,
      false
    ]);
    expect(controller.getSessionToken()).toBeUndefined();
  });

  it("projects one session state onto auth and protected controls", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <button data-auth-button><span data-auth-button-icon></span><span data-auth-button-label></span></button>
      <button data-action="preview.open"></button>
      <button data-action="render.html"></button>
    `;
    renderAuthControlState(
      root,
      {
        authEnabled: true,
        authenticated: false,
        methods: { token: true, externalProviders: [] },
        capabilities: { publish: false }
      },
      createLocalization(defaultConfig),
      { login: () => "login-icon", logout: () => "logout-icon" }
    );

    expect(root.querySelector<HTMLButtonElement>("[data-auth-button]")?.title).toBe(
      "Login"
    );
    expect(root.querySelector("[data-auth-button-icon]")?.innerHTML).toBe(
      "login-icon"
    );
    expect(
      root.querySelector<HTMLButtonElement>('[data-action="preview.open"]')?.hidden
    ).toBe(true);
    expect(
      root.querySelector<HTMLButtonElement>('[data-action="render.html"]')?.disabled
    ).toBe(true);

    renderAuthControlState(
      root,
      {
        authEnabled: true,
        authenticated: true,
        methods: { token: true, externalProviders: [] },
        capabilities: { publish: false }
      },
      createLocalization(defaultConfig),
      { login: () => "login-icon", logout: () => "logout-icon" }
    );
    expect(
      root.querySelector<HTMLButtonElement>('[data-action="preview.open"]')?.hidden
    ).toBe(false);
    expect(
      root.querySelector<HTMLButtonElement>('[data-action="render.html"]')?.hidden
    ).toBe(true);
  });
});

describe("knowledge graph profile controller", () => {
  it("restores and persists the active profile and emits explicit changes", () => {
    const config = structuredClone(defaultConfig);
    config.knowledgeGraph.profiles.push({
      id: "secondary-kg",
      label: "Secondary KG",
      sparqlUrl: "/api/sparql/secondary-kg",
    });
    config.nodes.sparql.profiles["secondary-kg"] = {
      configURL: "/api/knowledge-graphs/secondary-kg/sparnatural"
    };
    const values = new Map<string, string>([
      [KNOWLEDGE_GRAPH_PROFILE_STORAGE_KEY, "secondary-kg"]
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };
    const changes: string[] = [];
    const controller = createKnowledgeGraphProfileController({
      config,
      emptyStateLabel: "No Knowledge Graph configured",
      storage,
      onProfileChange: (profileId) => changes.push(profileId)
    });

    expect(controller.getActiveProfileId()).toBe("secondary-kg");
    expect(controller.getSparnaturalConfigId()).toBe("secondary-kg");
    controller.setActiveProfileId("culture-kg");

    expect(values.get(KNOWLEDGE_GRAPH_PROFILE_STORAGE_KEY)).toBe("culture-kg");
    expect(changes).toEqual(["culture-kg"]);
    expect(controller.createSpecialNodeInsertContext()).toMatchObject({
      config,
      knowledgeGraphProfileId: "culture-kg",
    });
    expect(controller.createSpecialNodeInsertContext("secondary-kg")).toMatchObject({
      config,
      knowledgeGraphProfileId: "secondary-kg",
    });
    expect(controller.getProfile("secondary-kg")?.label).toBe("Secondary KG");
  });

  it("binds the configured picker through the same validated profile path", () => {
    const config = structuredClone(defaultConfig);
    config.knowledgeGraph.profiles.push({
      id: "secondary-kg",
      label: "Secondary KG",
      sparqlUrl: "/api/sparql/secondary-kg",
    });
    const root = document.createElement("div");
    root.innerHTML = '<select data-knowledge-graph-picker></select>';
    const changes: string[] = [];
    const controller = createKnowledgeGraphProfileController({
      config,
      emptyStateLabel: "No Knowledge Graph configured",
      storage: { getItem: () => null, setItem: vi.fn() },
      onProfileChange: (profileId) => changes.push(profileId)
    });
    const destroy = controller.bindPicker(root);
    const picker = root.querySelector<HTMLSelectElement>(
      "[data-knowledge-graph-picker]"
    )!;

    picker.value = "secondary-kg";
    fireEvent.change(picker);
    expect(controller.getActiveProfileId()).toBe("secondary-kg");
    expect(changes).toEqual(["secondary-kg"]);

    destroy();
    picker.value = "culture-kg";
    fireEvent.change(picker);
    expect(controller.getActiveProfileId()).toBe("secondary-kg");
  });

  it("represents an empty profile set without inventing a profile id", () => {
    const config = structuredClone(defaultConfig);
    config.knowledgeGraph.profiles = [];
    config.knowledgeGraph.defaultProfile = undefined;
    const root = document.createElement("div");
    root.innerHTML = '<select data-knowledge-graph-picker></select>';
    const controller = createKnowledgeGraphProfileController({
      config,
      emptyStateLabel: "No Knowledge Graph configured",
      storage: { getItem: () => "removed-profile", setItem: vi.fn() }
    });

    const destroy = controller.bindPicker(root);
    const picker = root.querySelector<HTMLSelectElement>("[data-knowledge-graph-picker]")!;

    expect(controller.getActiveProfileId()).toBeUndefined();
    expect(controller.getActiveProfile()).toBeUndefined();
    expect(controller.getSparnaturalConfigId()).toBeUndefined();
    expect(controller.createSpecialNodeInsertContext()).toEqual({
      config,
      knowledgeGraphProfileId: undefined,
      sparnaturalConfigId: undefined,
      graphExplorerConfig: undefined
    });
    expect(picker.disabled).toBe(true);
    expect(picker.value).toBe("");
    expect(picker.textContent).toContain("No Knowledge Graph configured");
    destroy();
  });
});
