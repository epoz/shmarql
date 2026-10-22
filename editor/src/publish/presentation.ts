/** Renders workflow status from localized contracts. */

import type { LodeonLocalization } from "../localization/runtime";
import type { LodeonProject } from "../project/contracts";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function fileNameFromUrl(url: string): string {
  const normalized = url.split(/[?#]/, 1)[0] ?? url;
  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1) || url;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function renderPublishedStoryStatus(i18n: LodeonLocalization, project: LodeonProject): string {
  if (!project.published) {
    return `<span class="ld-published-empty">${escapeHtml(
      i18n.t("editor", "metadataPanel.published.empty")
    )}</span>`;
  }

  const historyCount = project.publicationHistory?.length ?? 0;
  const history =
    historyCount <= 1
      ? ""
      : `<small>${escapeHtml(
          i18n.t("editor", "metadataPanel.published.historyCount", {
            count: historyCount
          })
        )}</small>`;
  const packageLink = project.published.packageUrl
    ? `<span class="ld-published-story-label">${escapeHtml(
        i18n.t("editor", "metadataPanel.published.zip")
      )}</span><a href="${escapeAttribute(
        project.published.packageUrl
      )}" target="_blank" rel="noreferrer">${escapeHtml(fileNameFromUrl(project.published.packageUrl))}</a>`
    : "";

  return `
    <span class="ld-published-story-label">${escapeHtml(
      i18n.t("editor", "metadataPanel.published.url")
    )}</span>
    <a href="${escapeAttribute(
      project.published.url
    )}" target="_blank" rel="noreferrer">${escapeHtml(project.published.url)}</a>
    ${packageLink}
    <small>${escapeHtml(
      i18n.t("editor", "metadataPanel.published.publishedAt", {
        date: formatDate(project.published.publishedAt)
      })
    )}</small>
    ${history}
  `;
}
