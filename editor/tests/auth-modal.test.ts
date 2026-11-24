import { fireEvent, waitFor } from "@testing-library/dom";
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

function renderModal(methods: AuthStatus["methods"]) {
  const root = document.createElement("div");
  root.innerHTML = `
    <button type="button" data-auth-button></button>
    <section data-auth-modal hidden>
      <button type="button" data-auth-modal-close></button>
      <p data-auth-error hidden></p>
      <form data-auth-form>
        <label>
          <span>Username</span>
          <input type="text" data-auth-username />
        </label>
        <label>
          <span>Password</span>
          <input type="password" data-auth-password />
        </label>
      </form>
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
    loginWithCredentials: vi.fn(async () => session),
    logout: vi.fn(async () => session)
  };

  const modal = bindAuthModal(root, defaultConfig, controller);
  modal.open();
  return { root, controller, modal };
}

describe("authentication modal method presentation", () => {
  it("shows the username/password form when credentials login is available", () => {
    const { root } = renderModal({ credentials: true, externalProviders: [] });

    expect(root.querySelector<HTMLElement>("[data-auth-form]")?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>("[data-auth-username]")?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>("[data-auth-password]")?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>("[data-auth-providers]")?.hidden).toBe(true);
  });

  it("hides the auth form when no login method is available", () => {
    const { root } = renderModal({ credentials: false, externalProviders: [] });

    expect(root.querySelector<HTMLElement>("[data-auth-form]")?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>("[data-auth-providers]")?.hidden).toBe(true);
  });

  it("shows external login providers when credentials login is unavailable", () => {
    const { root } = renderModal({ credentials: false, externalProviders: [provider] });

    expect(root.querySelector<HTMLElement>("[data-auth-form]")?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>("[data-auth-providers]")?.hidden).toBe(false);
    expect(root.querySelectorAll("[data-auth-provider]")).toHaveLength(1);
  });

  it("shows username and password login when only credentials are available", () => {
    const { root } = renderModal({ credentials: true, externalProviders: [] });

    expect(root.querySelector<HTMLElement>("[data-auth-form]")?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>("[data-auth-providers]")?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>("[data-auth-username]")?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>("[data-auth-password]")?.hidden).toBe(false);
  });

  it("logs in with username and password credentials", async () => {
    const { root, controller, modal } = renderModal({
      credentials: true,
      externalProviders: []
    });

    const form = root.querySelector<HTMLFormElement>("[data-auth-form]");
    const username = root.querySelector<HTMLInputElement>("[data-auth-username]");
    const password = root.querySelector<HTMLInputElement>("[data-auth-password]");
    expect(form).toBeTruthy();
    expect(username).toBeTruthy();
    expect(password).toBeTruthy();

    username.value = "editor";
    password.value = "editor-password";
    fireEvent.submit(form!);
    await waitFor(() => {
      expect(controller.loginWithCredentials).toHaveBeenCalledWith("editor", "editor-password");
    });

    modal.destroy();
  });
});
