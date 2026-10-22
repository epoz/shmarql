/** Renders project navigation and metadata sidebar state. */

import { z } from "zod";
import { ChevronDown, ChevronRight, Info, PanelLeftClose, PanelLeftOpen, Plus, Trash2 } from "lucide";
import type { LodeonRuntime } from "../application/contracts";
import {
  type LodeonProjectContributor,
  type LodeonProjectIdentifier,
  type LodeonProjectPersistentIdentifier
} from "../project/contracts";
import { summarizeAssetLifecycle } from "../project/asset-references";
import type { LodeonLocalization } from "../localization/runtime";
import { contributorRoleOptions, type ContributorRoleOption } from "../configuration/metadata-panel";
import { renderIcon } from "./icons";

export const METADATA_PANEL_COLLAPSED_STORAGE_KEY = "lodeon.metadata.collapsed";
export const METADATA_CARD_COLLAPSED_STORAGE_KEY = "lodeon.metadata.cards.collapsed";

export function renderProjectSidebar(runtime: LodeonRuntime): string {
  const collapsed = readMetadataPanelCollapsed();
  const i18n = runtime.i18n;
  const toggleLabel = metadataText(i18n, collapsed ? "metadataPanel.expand" : "metadataPanel.collapse");

  return `
    <aside class="ld-sidebar" aria-label="${escapeAttribute(metadataText(i18n, "metadataPanel.aria"))}" data-sidebar data-collapsed="${collapsed ? "true" : "false"}">
      <div class="ld-panel-resize-handle ld-panel-resize-handle-left" data-sidebar-resize role="separator" aria-orientation="vertical" aria-label="${escapeAttribute(metadataText(i18n, "metadataPanel.resizeAria"))}"></div>
      <div class="ld-sidebar-header">
        <strong>${escapeHtml(metadataText(i18n, "metadataPanel.title"))}</strong>
        <button class="ld-sidebar-toggle" type="button" data-sidebar-toggle aria-label="${escapeAttribute(toggleLabel)}" title="${escapeAttribute(toggleLabel)}">
          <span aria-hidden="true" data-sidebar-toggle-icon>${renderIcon(collapsed ? PanelLeftOpen : PanelLeftClose)}</span>
        </button>
      </div>
      <div class="ld-sidebar-content ld-metadata-panel">
        <section class="ld-field ld-metadata-section">
          <div class="ld-metadata-section-header">
            <span>${escapeHtml(metadataText(i18n, "metadataPanel.contributors.title"))}</span>
            <button class="ld-button ld-metadata-add-button" type="button" data-project-contributor-add>
              ${renderIcon(Plus)}
              ${escapeHtml(metadataText(i18n, "metadataPanel.contributors.add"))}
            </button>
          </div>
          <div class="ld-contributor-list" data-project-contributors>
            ${renderContributors(runtime, runtime.project.metadata.contributors)}
          </div>
          <small>${escapeHtml(metadataText(i18n, "metadataPanel.contributors.help"))}</small>
        </section>
        <label class="ld-field">
          <span>${escapeHtml(metadataText(i18n, "metadataPanel.fields.description.label"))}</span>
          <textarea
            class="ld-metadata-input ld-metadata-textarea"
            data-project-description
            aria-label="${escapeAttribute(metadataText(i18n, "metadataPanel.fields.description.aria"))}"
            placeholder="${escapeAttribute(metadataText(i18n, "metadataPanel.fields.description.placeholder"))}"
          >${escapeHtml(runtime.project.metadata.description ?? "")}</textarea>
          <small>${escapeHtml(metadataText(i18n, "metadataPanel.fields.description.help"))}</small>
        </label>
        <label class="ld-field">
          <span>${escapeHtml(metadataText(i18n, "metadataPanel.fields.keywords.label"))}</span>
          <input
            class="ld-metadata-input"
            type="text"
            value="${escapeAttribute((runtime.project.metadata.keywords ?? []).join(", "))}"
            data-project-keywords
            aria-label="${escapeAttribute(metadataText(i18n, "metadataPanel.fields.keywords.aria"))}"
            placeholder="${escapeAttribute(metadataText(i18n, "metadataPanel.fields.keywords.placeholder"))}"
          />
          <small>${escapeHtml(metadataText(i18n, "metadataPanel.fields.keywords.help"))}</small>
        </label>
        <label class="ld-field">
          <span>${escapeHtml(metadataText(i18n, "metadataPanel.fields.language.label"))}</span>
          <input
            class="ld-metadata-input"
            type="text"
            value="${escapeAttribute(runtime.project.metadata.language ?? "en")}"
            data-project-language
            aria-label="${escapeAttribute(metadataText(i18n, "metadataPanel.fields.language.aria"))}"
            placeholder="${escapeAttribute(metadataText(i18n, "metadataPanel.fields.language.placeholder"))}"
          />
          <small>${escapeHtml(metadataText(i18n, "metadataPanel.fields.language.help"))}</small>
        </label>
        <label class="ld-field">
          <span>${escapeHtml(metadataText(i18n, "metadataPanel.fields.license.label"))}</span>
          <input
            class="ld-metadata-input"
            type="text"
            value="${escapeAttribute(runtime.project.metadata.license ?? "")}"
            data-project-license
            aria-label="${escapeAttribute(metadataText(i18n, "metadataPanel.fields.license.aria"))}"
            placeholder="${escapeAttribute(metadataText(i18n, "metadataPanel.fields.license.placeholder"))}"
          />
          <small>${escapeHtml(metadataText(i18n, "metadataPanel.fields.license.help"))}</small>
        </label>
        <section class="ld-field ld-metadata-section">
          <div class="ld-metadata-section-header">
            <span>${escapeHtml(metadataText(i18n, "metadataPanel.persistentIdentifiers.title"))}</span>
            <button class="ld-button ld-metadata-add-button" type="button" data-project-pid-add>
              ${renderIcon(Plus)}
              ${escapeHtml(metadataText(i18n, "metadataPanel.persistentIdentifiers.add"))}
            </button>
          </div>
          <div class="ld-pid-list" data-project-pids>
            ${renderPersistentIdentifiers(i18n, runtime.project.metadata.persistentIdentifiers)}
          </div>
          <small>${escapeHtml(metadataText(i18n, "metadataPanel.persistentIdentifiers.help"))}</small>
        </section>
        <label class="ld-field">
          <span>${escapeHtml(metadataText(i18n, "metadataPanel.fields.slug.label"))}</span>
          <input
            class="ld-metadata-input"
            type="text"
            value="${escapeAttribute(runtime.project.slug)}"
            data-project-slug
            aria-label="${escapeAttribute(metadataText(i18n, "metadataPanel.fields.slug.aria"))}"
          />
          <small data-project-slug-status>${escapeHtml(metadataText(i18n, "metadataPanel.fields.slug.statusValid"))}</small>
        </label>
        <label class="ld-field ld-checkbox-field">
          <input
            type="checkbox"
            data-project-publish-story-zip
            ${runtime.project.publishStoryZip ? "checked" : ""}
          />
          <span>${escapeHtml(metadataText(i18n, "metadataPanel.fields.publishStoryZip.label"))}</span>
        </label>
        <div class="ld-field">
          <span>${escapeHtml(metadataText(i18n, "metadataPanel.published.title"))}</span>
          <div class="ld-published-story" data-published-story>
            ${renderPublishedStory(runtime)}
          </div>
        </div>
        <div class="ld-field">
          <span>${escapeHtml(metadataText(i18n, "metadataPanel.assets.title"))}</span>
          <div class="ld-project-assets" data-project-assets>
            ${renderProjectAssetStatus(runtime)}
          </div>
        </div>
      </div>
      <div class="ld-sidebar-footer">
        <button class="ld-icon-button" type="button" data-markdown-modal-trigger="about" aria-label="${escapeAttribute(metadataText(i18n, "metadataPanel.aboutAria"))}" title="${escapeAttribute(metadataText(i18n, "metadataPanel.aboutTitle"))}">
          ${renderIcon(Info)}
        </button>
      </div>
    </aside>
  `;
}

function readMetadataPanelCollapsed(): boolean {
  try {
    const stored = localStorage.getItem(METADATA_PANEL_COLLAPSED_STORAGE_KEY);

    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

export function renderProjectAssetStatus(runtime: Pick<LodeonRuntime, "project" | "i18n">): string {
  const i18n = runtime.i18n;
  const summary = summarizeAssetLifecycle(runtime.project);
  const total = runtime.project.assets.length;
  const used = summary.usedAssets.length;
  const unused = summary.unusedAssets.length;
  const missing = summary.missingAssetIds.length;

  if (total === 0 && missing === 0) {
    return `<span class="ld-assets-empty">${escapeHtml(metadataText(i18n, "metadataPanel.assets.empty"))}</span>`;
  }

  return `
    <dl class="ld-assets-summary">
      <div><dt>${escapeHtml(metadataText(i18n, "metadataPanel.assets.total"))}</dt><dd>${total}</dd></div>
      <div><dt>${escapeHtml(metadataText(i18n, "metadataPanel.assets.used"))}</dt><dd>${used}</dd></div>
      <div><dt>${escapeHtml(metadataText(i18n, "metadataPanel.assets.unused"))}</dt><dd>${unused}</dd></div>
      <div data-state="${missing > 0 ? "warning" : "ok"}"><dt>${escapeHtml(metadataText(i18n, "metadataPanel.assets.missing"))}</dt><dd>${missing}</dd></div>
    </dl>
    ${
      missing > 0
        ? `<small class="ld-assets-warning">${escapeHtml(
            metadataText(i18n, "metadataPanel.assets.missingWarning", {
              count: missing,
              fileLabel: metadataText(
                i18n,
                missing === 1
                  ? "metadataPanel.assets.missingFileSingular"
                  : "metadataPanel.assets.missingFilePlural"
              )
            })
          )}</small>`
        : ""
    }
    ${
      unused > 0
        ? `<button class="ld-button ld-assets-cleanup" type="button" data-assets-cleanup>${escapeHtml(metadataText(i18n, "metadataPanel.assets.cleanup"))}</button>`
        : ""
    }
  `;
}

function renderPublishedStory(runtime: LodeonRuntime): string {
  const published = runtime.project.published;

  if (!published) {
    return `<span class="ld-published-empty">${escapeHtml(metadataText(runtime.i18n, "metadataPanel.published.empty"))}</span>`;
  }

  return `
    <span class="ld-published-story-label">${escapeHtml(metadataText(runtime.i18n, "metadataPanel.published.url"))}</span>
    <a href="${escapeAttribute(published.url)}" target="_blank" rel="noreferrer">${escapeHtml(published.url)}</a>
    ${
      published.packageUrl
        ? `<span class="ld-published-story-label">${escapeHtml(metadataText(runtime.i18n, "metadataPanel.published.zip"))}</span><a href="${escapeAttribute(published.packageUrl)}" target="_blank" rel="noreferrer">${escapeHtml(fileNameFromUrl(published.packageUrl))}</a>`
        : ""
    }
    <small>${escapeHtml(metadataText(runtime.i18n, "metadataPanel.published.publishedAt", { date: formatDate(published.publishedAt) }))}</small>
    ${renderPublicationHistoryCount(runtime)}
  `;
}

function renderPublicationHistoryCount(runtime: LodeonRuntime): string {
  const count = runtime.project.publicationHistory?.length ?? 0;

  if (count <= 1) {
    return "";
  }

  return `<small>${escapeHtml(metadataText(runtime.i18n, "metadataPanel.published.historyCount", { count }))}</small>`;
}

export function renderContributors(
  runtime: Pick<LodeonRuntime, "config" | "i18n">,
  contributors: LodeonProjectContributor[] | undefined
): string {
  const i18n = runtime.i18n;
  const safeContributors = contributors ?? [];
  const roleOptions = contributorRoleOptions(runtime);

  if (safeContributors.length === 0) {
    return `<div class="ld-metadata-empty">${escapeHtml(metadataText(i18n, "metadataPanel.contributors.empty"))}</div>`;
  }

  return safeContributors
    .map((contributor, index) => renderContributor(i18n, contributor, index, roleOptions))
    .join("");
}

function renderContributor(
  i18n: LodeonLocalization,
  contributor: LodeonProjectContributor,
  index: number,
  roleOptions: ContributorRoleOption[]
): string {
  const cardKey = metadataCardKey("contributor", contributor.id);
  const collapsed = readMetadataCardCollapsed(cardKey);
  const displayIndex = index + 1;

  return `
    <article class="ld-contributor-card" data-contributor-id="${escapeAttribute(contributor.id)}" data-metadata-card data-metadata-card-key="${escapeAttribute(cardKey)}" data-collapsed="${collapsed ? "true" : "false"}">
      <div class="ld-contributor-card-header">
        <button class="ld-metadata-card-toggle" type="button" data-metadata-card-toggle aria-expanded="${collapsed ? "false" : "true"}" aria-label="${escapeAttribute(metadataText(i18n, "metadataPanel.contributors.toggleAria", { index: displayIndex }))}">
          <span class="ld-metadata-card-toggle-expanded" aria-hidden="true">${renderIcon(ChevronDown)}</span>
          <span class="ld-metadata-card-toggle-collapsed" aria-hidden="true">${renderIcon(ChevronRight)}</span>
        </button>
        <div class="ld-metadata-card-title">
          <strong>${escapeHtml(metadataText(i18n, "metadataPanel.contributors.cardTitle", { index: displayIndex }))}</strong>
          <span data-metadata-card-summary>${escapeHtml(contributor.name.trim() || metadataText(i18n, "metadataPanel.contributors.unnamed"))}</span>
        </div>
        <button class="ld-icon-button ld-metadata-remove-button" type="button" data-project-contributor-remove="${escapeAttribute(contributor.id)}" aria-label="${escapeAttribute(metadataText(i18n, "metadataPanel.contributors.removeAria", { index: displayIndex }))}" title="${escapeAttribute(metadataText(i18n, "metadataPanel.contributors.removeTitle"))}">
          ${renderIcon(Trash2)}
        </button>
      </div>
      <div class="ld-metadata-card-body">
      <div class="ld-contributor-grid">
        <label class="ld-field">
          <span>${escapeHtml(metadataText(i18n, "metadataPanel.contributors.name.label"))}</span>
          <input class="ld-metadata-input" type="text" value="${escapeAttribute(contributor.name)}" data-contributor-field="name" data-contributor-id="${escapeAttribute(contributor.id)}" aria-label="${escapeAttribute(metadataText(i18n, "metadataPanel.contributors.name.aria", { index: displayIndex }))}" placeholder="${escapeAttribute(metadataText(i18n, "metadataPanel.contributors.name.placeholder"))}" />
        </label>
        <label class="ld-field">
          <span>${escapeHtml(metadataText(i18n, "metadataPanel.contributors.role.label"))}</span>
          ${renderContributorRoleSelect(i18n, contributor, displayIndex, roleOptions)}
        </label>
        <label class="ld-field ld-contributor-affiliation-field">
          <span>${escapeHtml(metadataText(i18n, "metadataPanel.contributors.affiliation.label"))}</span>
          <input class="ld-metadata-input" type="text" value="${escapeAttribute(contributor.affiliation)}" data-contributor-field="affiliation" data-contributor-id="${escapeAttribute(contributor.id)}" aria-label="${escapeAttribute(metadataText(i18n, "metadataPanel.contributors.affiliation.aria", { index: displayIndex }))}" placeholder="${escapeAttribute(metadataText(i18n, "metadataPanel.contributors.affiliation.placeholder"))}" />
        </label>
      </div>
      <div class="ld-contributor-identifiers">
        <div class="ld-contributor-identifiers-header">
          <span>${escapeHtml(metadataText(i18n, "metadataPanel.contributors.identifiers.title"))}</span>
          <button class="ld-button ld-metadata-add-button" type="button" data-project-contributor-identifier-add="${escapeAttribute(contributor.id)}">
            ${renderIcon(Plus)}
            ${escapeHtml(metadataText(i18n, "metadataPanel.contributors.identifiers.add"))}
          </button>
        </div>
        <div class="ld-identifier-list">
          ${renderIdentifiers(i18n, contributor, index)}
        </div>
      </div>
      </div>
    </article>
  `;
}

function renderContributorRoleSelect(
  i18n: LodeonLocalization,
  contributor: LodeonProjectContributor,
  displayIndex: number,
  roleOptions: ContributorRoleOption[]
): string {
  const selectedRole = contributor.role.trim();
  const options =
    roleOptions.length > 0
      ? roleOptions
      : [{ id: selectedRole || "author", label: selectedRole || "author" }];

  return `
    <select class="ld-metadata-input" data-contributor-field="role" data-contributor-id="${escapeAttribute(contributor.id)}" aria-label="${escapeAttribute(metadataText(i18n, "metadataPanel.contributors.role.aria", { index: displayIndex }))}">
      ${options
        .map(
          (option) => `
            <option value="${escapeAttribute(option.id)}" ${option.id === selectedRole ? "selected" : ""}>
              ${escapeHtml(option.label)}
            </option>
          `
        )
        .join("")}
    </select>
  `;
}

function renderIdentifiers(
  i18n: LodeonLocalization,
  contributor: LodeonProjectContributor,
  contributorIndex: number
): string {
  if (contributor.identifiers.length === 0) {
    return `<div class="ld-metadata-empty">${escapeHtml(metadataText(i18n, "metadataPanel.contributors.identifiers.empty"))}</div>`;
  }

  return contributor.identifiers
    .map((identifier, index) => renderIdentifier(i18n, contributor.id, identifier, contributorIndex, index))
    .join("");
}

function renderIdentifier(
  i18n: LodeonLocalization,
  contributorId: string,
  identifier: LodeonProjectIdentifier,
  contributorIndex: number,
  index: number
): string {
  const label = metadataText(i18n, "metadataPanel.contributors.identifiers.label", {
    contributorIndex: contributorIndex + 1,
    index: index + 1
  });

  return `
    <div class="ld-identifier-row" data-contributor-identifier-id="${escapeAttribute(identifier.id)}">
      <label class="ld-field">
        <span>${escapeHtml(metadataText(i18n, "metadataPanel.contributors.identifiers.type.label"))}</span>
        <input class="ld-metadata-input" type="text" value="${escapeAttribute(identifier.type)}" data-contributor-identifier-field="type" data-contributor-id="${escapeAttribute(contributorId)}" data-contributor-identifier-id="${escapeAttribute(identifier.id)}" aria-label="${escapeAttribute(metadataText(i18n, "metadataPanel.contributors.identifiers.type.aria", { label }))}" placeholder="${escapeAttribute(metadataText(i18n, "metadataPanel.contributors.identifiers.type.placeholder"))}" />
      </label>
      <label class="ld-field">
        <span>${escapeHtml(metadataText(i18n, "metadataPanel.contributors.identifiers.value.label"))}</span>
        <input class="ld-metadata-input" type="text" value="${escapeAttribute(identifier.value)}" data-contributor-identifier-field="value" data-contributor-id="${escapeAttribute(contributorId)}" data-contributor-identifier-id="${escapeAttribute(identifier.id)}" aria-label="${escapeAttribute(metadataText(i18n, "metadataPanel.contributors.identifiers.value.aria", { label }))}" placeholder="${escapeAttribute(metadataText(i18n, "metadataPanel.contributors.identifiers.value.placeholder"))}" />
      </label>
      <label class="ld-field">
        <span>${escapeHtml(metadataText(i18n, "metadataPanel.contributors.identifiers.url.label"))}</span>
        <input class="ld-metadata-input" type="url" value="${escapeAttribute(identifier.url)}" data-contributor-identifier-field="url" data-contributor-id="${escapeAttribute(contributorId)}" data-contributor-identifier-id="${escapeAttribute(identifier.id)}" aria-label="${escapeAttribute(metadataText(i18n, "metadataPanel.contributors.identifiers.url.aria", { label }))}" placeholder="${escapeAttribute(metadataText(i18n, "metadataPanel.contributors.identifiers.url.placeholder"))}" />
      </label>
      <button class="ld-icon-button ld-metadata-remove-button" type="button" data-project-contributor-identifier-remove="${escapeAttribute(identifier.id)}" data-contributor-id="${escapeAttribute(contributorId)}" aria-label="${escapeAttribute(metadataText(i18n, "metadataPanel.contributors.identifiers.removeAria", { label }))}" title="${escapeAttribute(metadataText(i18n, "metadataPanel.contributors.identifiers.removeTitle"))}">
        ${renderIcon(Trash2)}
      </button>
    </div>
  `;
}

export function renderPersistentIdentifiers(
  i18n: LodeonLocalization,
  identifiers: LodeonProjectPersistentIdentifier[] | undefined
): string {
  const safeIdentifiers = identifiers ?? [];

  if (safeIdentifiers.length === 0) {
    return `<div class="ld-metadata-empty">${escapeHtml(metadataText(i18n, "metadataPanel.persistentIdentifiers.empty"))}</div>`;
  }

  return safeIdentifiers
    .map((identifier, index) => renderPersistentIdentifier(i18n, identifier, index))
    .join("");
}

function renderPersistentIdentifier(
  i18n: LodeonLocalization,
  identifier: LodeonProjectPersistentIdentifier,
  index: number
): string {
  const displayIndex = index + 1;
  const label = metadataText(i18n, "metadataPanel.persistentIdentifiers.label", {
    index: displayIndex
  });
  const cardKey = metadataCardKey("pid", identifier.id);
  const collapsed = readMetadataCardCollapsed(cardKey);

  return `
    <article class="ld-contributor-card" data-pid-id="${escapeAttribute(identifier.id)}" data-metadata-card data-metadata-card-key="${escapeAttribute(cardKey)}" data-collapsed="${collapsed ? "true" : "false"}">
      <div class="ld-contributor-card-header">
        <button class="ld-metadata-card-toggle" type="button" data-metadata-card-toggle aria-expanded="${collapsed ? "false" : "true"}" aria-label="${escapeAttribute(metadataText(i18n, "metadataPanel.persistentIdentifiers.toggleAria", { index: displayIndex }))}">
          <span class="ld-metadata-card-toggle-expanded" aria-hidden="true">${renderIcon(ChevronDown)}</span>
          <span class="ld-metadata-card-toggle-collapsed" aria-hidden="true">${renderIcon(ChevronRight)}</span>
        </button>
        <div class="ld-metadata-card-title">
          <strong>${escapeHtml(metadataText(i18n, "metadataPanel.persistentIdentifiers.cardTitle", { index: displayIndex }))}</strong>
          <span data-metadata-card-summary>${escapeHtml(identifier.url.trim() || identifier.value.trim() || metadataText(i18n, "metadataPanel.persistentIdentifiers.emptySummary"))}</span>
        </div>
        <button class="ld-icon-button ld-metadata-remove-button" type="button" data-project-pid-remove="${escapeAttribute(identifier.id)}" aria-label="${escapeAttribute(metadataText(i18n, "metadataPanel.persistentIdentifiers.removeAria", { index: displayIndex }))}" title="${escapeAttribute(metadataText(i18n, "metadataPanel.persistentIdentifiers.removeTitle"))}">
          ${renderIcon(Trash2)}
        </button>
      </div>
      <div class="ld-metadata-card-body">
      <div class="ld-pid-grid">
        <label class="ld-field">
          <span>${escapeHtml(metadataText(i18n, "metadataPanel.persistentIdentifiers.type.label"))}</span>
          <input class="ld-metadata-input" type="text" value="${escapeAttribute(identifier.type)}" data-project-pid-field="type" data-project-pid-id="${escapeAttribute(identifier.id)}" aria-label="${escapeAttribute(metadataText(i18n, "metadataPanel.persistentIdentifiers.type.aria", { label }))}" placeholder="${escapeAttribute(metadataText(i18n, "metadataPanel.persistentIdentifiers.type.placeholder"))}" />
        </label>
        <label class="ld-field">
          <span>${escapeHtml(metadataText(i18n, "metadataPanel.persistentIdentifiers.value.label"))}</span>
          <input class="ld-metadata-input" type="text" value="${escapeAttribute(identifier.value)}" data-project-pid-field="value" data-project-pid-id="${escapeAttribute(identifier.id)}" aria-label="${escapeAttribute(metadataText(i18n, "metadataPanel.persistentIdentifiers.value.aria", { label }))}" placeholder="${escapeAttribute(metadataText(i18n, "metadataPanel.persistentIdentifiers.value.placeholder"))}" />
        </label>
        <label class="ld-field">
          <span>${escapeHtml(metadataText(i18n, "metadataPanel.persistentIdentifiers.url.label"))}</span>
          <input class="ld-metadata-input" type="url" value="${escapeAttribute(identifier.url)}" data-project-pid-field="url" data-project-pid-id="${escapeAttribute(identifier.id)}" aria-label="${escapeAttribute(metadataText(i18n, "metadataPanel.persistentIdentifiers.url.aria", { label }))}" placeholder="${escapeAttribute(metadataText(i18n, "metadataPanel.persistentIdentifiers.url.placeholder"))}" />
        </label>
      </div>
      </div>
    </article>
  `;
}

function metadataText(
  i18n: LodeonLocalization,
  key: string,
  values?: Record<string, string | number | boolean | null | undefined>
): string {
  return i18n.t("editor", key, values);
}

function metadataCardKey(type: "contributor" | "pid", id: string): string {
  return `${type}:${id}`;
}

function readMetadataCardCollapsed(cardKey: string): boolean {
  try {
    const stored = localStorage.getItem(METADATA_CARD_COLLAPSED_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    const collapsedCards = z.array(z.string()).safeParse(parsed);

    return collapsedCards.success && collapsedCards.data.includes(cardKey);
  } catch {
    return false;
  }
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function fileNameFromUrl(url: string): string {
  const normalized = url.split(/[?#]/, 1)[0] ?? url;
  const segments = normalized.split("/").filter(Boolean);

  return segments.at(-1) || url;
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
