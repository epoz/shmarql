/** Owns the stateful auth controller lifecycle and presentation coordination. */

import type { LodeonLocalization } from "../localization/runtime";
import { loadAuthSession, loginWithToken, logout, validateLoginToken, type AuthSession } from "./api-client";

export type AuthControllerOptions = {
  onSessionChange?: (session: AuthSession) => void | Promise<void>;
  loadSession?: typeof loadAuthSession;
  login?: typeof loginWithToken;
  logoutSession?: typeof logout;
};

export type AuthController = {
  initialize: () => Promise<AuthSession>;
  getSession: () => AuthSession;
  getSessionToken: () => string | undefined;
  isAuthorized: () => boolean;
  login: (token: string) => Promise<AuthSession>;
  logout: () => Promise<AuthSession>;
};

/** Owns the browser session state and exposes no token beyond authenticated API headers. */
export function createAuthController({
  onSessionChange,
  loadSession = loadAuthSession,
  login = loginWithToken,
  logoutSession = logout
}: AuthControllerOptions = {}): AuthController {
  let session: AuthSession = {
    authEnabled: true,
    authenticated: false,
    methods: { token: false, externalProviders: [] },
    capabilities: { publish: false }
  };

  async function setSession(nextSession: AuthSession): Promise<AuthSession> {
    session = nextSession;
    await onSessionChange?.(session);
    return session;
  }

  return {
    initialize: async () => setSession(await loadSession()),
    getSession: () => session,
    getSessionToken: () => session.session,
    isAuthorized: () => !session.authEnabled || session.authenticated,
    login: async (token) => {
      validateLoginToken(token);
      return setSession(await login(token));
    },
    logout: async () => setSession(await logoutSession(session.session))
  };
}

/** Projects authenticated state into controls without storing credentials in the DOM. */
export function renderAuthControlState(
  root: HTMLElement,
  session: AuthSession,
  i18n: LodeonLocalization,
  icons: {
    login: () => string;
    logout: () => string;
  }
): void {
  const button = root.querySelector<HTMLButtonElement>("[data-auth-button]");
  const label = root.querySelector<HTMLElement>("[data-auth-button-label]");
  const icon = root.querySelector<HTMLElement>("[data-auth-button-icon]");
  const protectedButtons = root.querySelectorAll<HTMLButtonElement>(
    '[data-action="preview.open"], [data-action="render.html"]'
  );
  const labelText = session.authenticated ? i18n.t("editor", "auth.logout") : i18n.t("editor", "auth.login");

  if (button) {
    button.hidden = !session.authEnabled;
    button.dataset.authenticated = session.authenticated ? "true" : "false";
    button.setAttribute("aria-label", labelText);
    button.title = labelText;
  }
  if (label) {
    label.textContent = labelText;
  }
  if (icon) {
    icon.innerHTML = session.authenticated ? icons.logout() : icons.login();
  }

  protectedButtons.forEach((protectedButton) => {
    const requiresLogin = session.authEnabled && !session.authenticated;
    const isPublish = protectedButton.dataset.action === "render.html";
    const isUnavailable = requiresLogin || (isPublish && !session.capabilities.publish);
    protectedButton.hidden = isUnavailable;
    protectedButton.disabled = isUnavailable;
    protectedButton.title = requiresLogin
      ? i18n.t("editor", "auth.loginRequired")
      : protectedButton.dataset.action === "preview.open"
        ? i18n.t("editor", "actions.preview.open.protectedDescription")
        : i18n.t("editor", "actions.render.html.protectedDescription");
  });
}
