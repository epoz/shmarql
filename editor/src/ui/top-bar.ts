/** Renders and binds the application top bar. */

import { Download, Eye, CircleHelp, LogIn, LogOut, Send, SquarePlus, Trash2, Upload } from "lucide";
import type { LodeonRuntime } from "../application/contracts";
import { renderIcon } from "./icons";

export function renderTopBar(runtime: LodeonRuntime): string {
  const t = (key: string) => runtime.i18n.t("editor", key);
  const showProfileSelect = runtime.config.knowledgeGraph.ui?.showProfileSelect !== false;
  const actionButton = (actionId: string) => {
    const action = runtime.registries.actions.get(actionId);
    const isAuthProtected = actionId === "preview.open" || actionId === "render.html";

    if (!action) {
      return "";
    }

    return `
      <button
        class="ld-button"
        type="button"
        data-action="${action.id}"
        ${isAuthProtected ? "hidden" : ""}
        title="${escapeAttribute(t(action.descriptionKey))}"
      >
        ${renderActionIcon(action.id)}
        ${escapeHtml(t(action.labelKey))}
      </button>
    `;
  };

  return `
    <header class="ld-topbar">
      <div class="ld-project-title">
        <label for="project-title-input">${escapeHtml(t("topbar.projectLabel"))}</label>
        <input
          id="project-title-input"
          class="ld-project-title-input"
          type="text"
          value="${runtime.project.title}"
          data-project-title
          aria-label="${escapeAttribute(t("topbar.projectTitleAria"))}"
        />
      </div>
      <nav class="ld-actions" aria-label="${escapeAttribute(t("topbar.primaryActionsAria"))}">
        <div class="ld-action-group ld-project-actions">
          <div class="ld-project-select-group">
            ${
              showProfileSelect
                ? `<div class="ld-project-switcher ld-kg-switcher">
                    <label for="knowledge-graph-picker">${escapeHtml(t("topbar.knowledgeGraphSelectLabel"))}</label>
                    <select id="knowledge-graph-picker" data-knowledge-graph-picker aria-label="${escapeAttribute(t("topbar.knowledgeGraphSelectAria"))}"></select>
                  </div>`
                : ""
            }
            <div class="ld-project-switcher">
              <select id="project-picker" data-project-picker aria-label="${escapeAttribute(t("topbar.dataStorySelectAria"))}"></select>
            </div>
          </div>
        </div>
        <div class="ld-action-group ld-project-actions">
          ${actionButton("project.new")}
          ${actionButton("project.import")}
          ${actionButton("project.export")}
          <button class="ld-button" type="button" data-project-delete title="${escapeAttribute(t("actions.project.delete.description"))}" aria-label="${escapeAttribute(t("actions.project.delete.description"))}">
            ${renderDeleteIcon()}
            ${escapeHtml(t("actions.project.delete.label"))}
          </button>
          <input type="file" accept=".lodeon.zip,.zip,application/zip" data-project-import aria-label="${escapeAttribute(t("topbar.importFileAria"))}" hidden />
        </div>
        <div class="ld-action-group">
          ${actionButton("preview.open")}
          ${actionButton("render.html")}
        </div>
        <button class="ld-button ld-auth-button" type="button" data-auth-button hidden aria-label="${escapeAttribute(t("auth.login"))}" title="${escapeAttribute(t("auth.login"))}">
          <span data-auth-button-icon>${renderIcon(LogIn)}</span>
          <span data-auth-button-label>${escapeHtml(t("auth.login"))}</span>
        </button>
        <div class="ld-action-group ld-utility-actions">
          <button class="ld-icon-button" type="button" data-markdown-modal-trigger="help" aria-label="${escapeAttribute(t("topbar.openHelpAria"))}" title="${escapeAttribute(t("topbar.helpTitle"))}">
            ${renderIcon(CircleHelp)}
          </button>
        </div>
      </nav>
    </header>
  `;
}

function renderActionIcon(actionId: string): string {
  if (actionId === "project.new") {
    return renderIcon(SquarePlus);
  }
  if (actionId === "project.import") {
    return renderIcon(Upload);
  }
  if (actionId === "project.export") {
    return renderIcon(Download);
  }
  if (actionId === "preview.open") {
    return renderIcon(Eye);
  }
  if (actionId === "render.html") {
    return renderIcon(Send);
  }

  return "";
}

export function renderDeleteIcon(): string {
  return renderIcon(Trash2);
}

export function renderLoginIcon(): string {
  return renderIcon(LogIn);
}

export function renderLogoutIcon(): string {
  return renderIcon(LogOut);
}

export function bindTopBar(root: HTMLElement, runtime: LodeonRuntime): void {
  root.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const actionId = button.dataset.action;

      if (!actionId) {
        return;
      }

      const action = runtime.registries.actions.get(actionId);
      void action?.run(runtime);
    });
  });
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
