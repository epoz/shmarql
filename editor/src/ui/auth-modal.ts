/** Owns the authentication modal's DOM state and event lifecycle. */

import type { AuthController } from "../auth/controller";
import type { LodeonConfig } from "../configuration/schema";
import { renderConfiguredError } from "../errors/client-error";

export type AuthModalController = {
  open: (initialError?: unknown) => void;
  destroy: () => void;
};

export type AuthModalOptions = {
  onSessionChanged?: () => void;
};

export function bindAuthModal(
  root: HTMLElement,
  config: Pick<LodeonConfig, "errors">,
  controller: AuthController,
  options: AuthModalOptions = {}
): AuthModalController {
  const authButton = root.querySelector<HTMLButtonElement>("[data-auth-button]");
  const form = root.querySelector<HTMLFormElement>("[data-auth-form]");
  const closeButton = root.querySelector<HTMLButtonElement>("[data-auth-modal-close]");
  const modal = root.querySelector<HTMLElement>("[data-auth-modal]");
  const tokenInput = root.querySelector<HTMLInputElement>("[data-auth-token]");
  const error = root.querySelector<HTMLElement>("[data-auth-error]");
  const providerList = root.querySelector<HTMLElement>("[data-auth-providers]");
  const divider = root.querySelector<HTMLElement>("[data-auth-divider]");

  const renderMethods = () => {
    const methods = controller.getSession().methods;
    const providers = methods.externalProviders;
    form?.toggleAttribute("hidden", !methods.token);
    divider?.toggleAttribute("hidden", !methods.token || providers.length === 0);
    if (!providerList) return;

    providerList.replaceChildren(
      ...providers.map((provider) => {
        const action = document.createElement("a");
        const icon = document.createElement("img");
        const label = document.createElement("span");

        action.className = "ld-button ld-auth-provider ld-auth-provider-accent";
        action.href = provider.startUrl;
        action.dataset.authProvider = provider.id;
        icon.src = provider.icon;
        icon.alt = "";
        icon.setAttribute("aria-hidden", "true");
        label.textContent = provider.label;
        action.append(icon, label);
        return action;
      })
    );
    providerList.hidden = providers.length === 0;
  };

  const clear = () => {
    if (tokenInput) tokenInput.value = "";
    if (error) {
      error.hidden = true;
      error.textContent = "";
    }
  };
  const close = () => {
    if (modal) modal.hidden = true;
    clear();
  };
  const open = (initialError?: unknown) => {
    if (!modal) return;
    clear();
    renderMethods();
    if (initialError !== undefined && error) {
      error.textContent = renderConfiguredError(config, initialError, "auth.external.exchange_invalid");
      error.hidden = false;
    }
    modal.hidden = false;
    if (controller.getSession().methods.token) {
      tokenInput?.focus();
    } else {
      providerList?.querySelector<HTMLElement>("[data-auth-provider]")?.focus();
    }
  };
  const handleAuthClick = async () => {
    if (controller.getSession().authenticated) {
      await controller.logout();
      options.onSessionChanged?.();
    } else {
      open();
    }
  };
  const handleSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    try {
      await controller.login(tokenInput?.value.trim() ?? "");
      close();
      options.onSessionChanged?.();
    } catch (loginError) {
      if (error) {
        error.textContent = renderConfiguredError(config, loginError, "auth.login_failed");
        error.hidden = false;
      }
    }
  };
  const handleClose = () => close();
  const handleBackdrop = (event: MouseEvent) => {
    if (event.target === modal) close();
  };
  const handleAuthClickEvent = () => {
    void handleAuthClick();
  };
  const handleSubmitEvent = (event: SubmitEvent) => {
    void handleSubmit(event);
  };

  authButton?.addEventListener("click", handleAuthClickEvent);
  form?.addEventListener("submit", handleSubmitEvent);
  closeButton?.addEventListener("click", handleClose);
  modal?.addEventListener("click", handleBackdrop);
  if (error) error.hidden = true;

  return {
    open,
    destroy: () => {
      authButton?.removeEventListener("click", handleAuthClickEvent);
      form?.removeEventListener("submit", handleSubmitEvent);
      closeButton?.removeEventListener("click", handleClose);
      modal?.removeEventListener("click", handleBackdrop);
    }
  };
}
