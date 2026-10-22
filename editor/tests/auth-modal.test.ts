import { describe, expect, it, vi } from "vitest";
import type { AuthController } from "@lodeon/auth/controller";
import type { AuthStatus } from "@lodeon/auth/api-client";
import { bindAuthModal } from "@lodeon/ui/auth-modal";
import { defaultConfig } from "./fixtures/config";

const provider = {
  id: "institution",
  label: "Institution Login",
  icon: "/lodeon/assets/auth/sign-in.svg",
  startUrl: "/api/auth/external/institution/start"
};

function renderModal(methods: AuthStatus["methods"]): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = `
    <button type="button" data-auth-button></button>
    <section data-auth-modal hidden>
      <button type="button" data-auth-modal-close></button>
      <p data-auth-error hidden></p>
      <form data-auth-form><input data-auth-token /></form>
      <div data-auth-divider hidden></div>
      <div data-auth-providers hidden></div>
    </section>
  `;
  const session: AuthStatus = {
    authEnabled: true,
    authenticated: false,
    methods,
    capabilities: { publish: false }
  };
  const controller: AuthController = {
    initialize: vi.fn(async () => session),
    getSession: () => session,
    getSessionToken: () => undefined,
    isAuthorized: () => false,
    login: vi.fn(async () => session),
    logout: vi.fn(async () => session)
  };

  bindAuthModal(root, defaultConfig, controller).open();
  return root;
}

describe("authentication modal method presentation", () => {
  it("shows only token login when no external provider is configured", () => {
    const root = renderModal({ token: true, externalProviders: [] });

    expect(root.querySelector<HTMLElement>("[data-auth-form]")?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>("[data-auth-divider]")?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>("[data-auth-providers]")?.hidden).toBe(true);
  });

  it("shows only external login when token login is unavailable", () => {
    const root = renderModal({ token: false, externalProviders: [provider] });

    expect(root.querySelector<HTMLElement>("[data-auth-form]")?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>("[data-auth-divider]")?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>("[data-auth-providers]")?.hidden).toBe(false);
    expect(root.querySelectorAll("[data-auth-provider]")).toHaveLength(1);
  });

  it("shows token and external login with a divider when both are available", () => {
    const root = renderModal({ token: true, externalProviders: [provider] });

    expect(root.querySelector<HTMLElement>("[data-auth-form]")?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>("[data-auth-divider]")?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>("[data-auth-providers]")?.hidden).toBe(false);
    expect(root.querySelectorAll("[data-auth-provider]")).toHaveLength(1);
  });
});
