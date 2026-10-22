/** Binds the shared About and Help Markdown modal. */

import type { LodeonConfig } from "../configuration/schema";
import { LodeonClientError, renderConfiguredError } from "../errors/client-error";
import type { LodeonLocalization } from "../localization/runtime";
import { renderMarkdown } from "./markdown";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function bindMarkdownModals(
  root: HTMLElement,
  config: LodeonConfig,
  i18n: LodeonLocalization
): () => void {
  const modal = root.querySelector<HTMLElement>("[data-markdown-modal]");
  const title = root.querySelector<HTMLElement>("[data-markdown-modal-title]");
  const body = root.querySelector<HTMLElement>("[data-markdown-modal-body]");
  if (!modal || !title || !body) return () => undefined;

  const close = () => {
    modal.hidden = true;
    body.innerHTML = "";
  };
  const triggers = [...root.querySelectorAll<HTMLButtonElement>("[data-markdown-modal-trigger]")];
  const triggerHandlers = triggers.map((button) => {
    const handler = async () => {
      const modalId = button.dataset.markdownModalTrigger;
      if (!modalId) return;
      modal.hidden = false;
      title.textContent = i18n.t("editor", modalId === "help" ? "modal.help.title" : "modal.about.title");
      body.innerHTML = `<p>${escapeHtml(i18n.t("editor", "modal.loading"))}</p>`;
      try {
        const routeBase = config.application.baseURL.replace(/\/$/, "");
        const response = await fetch(`${routeBase}/content/${modalId}.md`);
        if (!response.ok) {
          throw new LodeonClientError("app.modal_load_failed", {
            externalError: String(response.status)
          });
        }
        body.innerHTML = `${
          modalId === "about"
            ? `<img class="ld-modal-badge" src="${routeBase}/assets/lodeon-badge.png" alt="LODEON" />`
            : ""
        }${renderMarkdown(await response.text())}`;
      } catch (error) {
        body.innerHTML = `<p>${escapeHtml(
          renderConfiguredError(config, error, "app.modal_load_failed")
        )}</p>`;
      }
    };
    const eventHandler = () => {
      void handler();
    };
    button.addEventListener("click", eventHandler);
    return { button, eventHandler };
  });
  const closeButton = root.querySelector<HTMLButtonElement>("[data-markdown-modal-close]");
  const handleClose = () => close();
  const handleBackdropClick = (event: MouseEvent) => {
    if (event.target === modal) close();
  };
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && !modal.hidden) close();
  };
  closeButton?.addEventListener("click", handleClose);
  modal.addEventListener("click", handleBackdropClick);
  root.ownerDocument.addEventListener("keydown", handleKeydown);

  return () => {
    for (const { button, eventHandler } of triggerHandlers) {
      button.removeEventListener("click", eventHandler);
    }
    closeButton?.removeEventListener("click", handleClose);
    modal.removeEventListener("click", handleBackdropClick);
    root.ownerDocument.removeEventListener("keydown", handleKeydown);
  };
}
