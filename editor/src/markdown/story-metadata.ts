/** Projects canonical story metadata for renderer templates. */

import type { JSONContent } from "@tiptap/core";
import { LodeonClientError } from "../errors/client-error";
import type { LodeonProject } from "../project/contracts";
import type { MarkdownExportConfig } from "./contracts";
import { escapeHtml, escapeHtmlAttribute, markdownLabel } from "./text-presentation";

export function buildStoryMetadataTemplateValues(
  node: JSONContent,
  config: MarkdownExportConfig
): Record<string, unknown> {
  if (!config.project) {
    throw new LodeonClientError("markdown.story_metadata_project_missing");
  }

  const project = config.project;
  const title =
    String(node.attrs?.title ?? markdownLabel(config, "storyMetadata.title")).trim() ||
    markdownLabel(config, "storyMetadata.title");
  const metadata = project.metadata;
  const rows = [
    ...renderContributorRows(config, project),
    renderConfiguredMetadataRow(config, "description", "storyMetadata.description", metadata.description),
    renderConfiguredMetadataRow(
      config,
      "keywords",
      "storyMetadata.keywords",
      renderInlineList(metadata.keywords)
    ),
    renderConfiguredMetadataRow(config, "language", "storyMetadata.language", metadata.language),
    renderConfiguredMetadataRow(config, "license", "storyMetadata.license", metadata.license),
    renderConfiguredMetadataRow(
      config,
      "persistentIdentifiers",
      "storyMetadata.persistentIdentifiers",
      renderPersistentIdentifierList(project)
    ),
    renderMetadataRow(markdownLabel(config, "storyMetadata.publishingDate"), renderPublishingDate(project)),
    renderMetadataRow(markdownLabel(config, "storyMetadata.download"), renderPublishedPackageLink(project))
  ].filter((row): row is StoryMetadataTemplateRow => row !== null);

  return {
    title,
    emptyText: markdownLabel(config, "storyMetadata.empty"),
    rows
  };
}

type StoryMetadataTemplateRow = {
  label: string;
  valueHtml: string;
};

function renderMetadataRow(label: string, value: string): StoryMetadataTemplateRow | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  return {
    label,
    valueHtml: trimmed
  };
}

function renderConfiguredMetadataRow(
  config: MarkdownExportConfig,
  fieldId: string,
  labelKey: string,
  value: string
): StoryMetadataTemplateRow | null {
  if (!metadataPanelFieldEnabled(config, fieldId)) {
    return null;
  }

  return renderMetadataRow(markdownLabel(config, labelKey), value);
}

function metadataPanelFieldEnabled(config: MarkdownExportConfig, fieldId: string): boolean {
  return config.metadataPanel?.fields?.[fieldId]?.enabled !== false;
}

function renderInlineList(values: string[]): string {
  const items = values.map((value) => value.trim()).filter(Boolean);

  if (items.length === 0) {
    return "";
  }

  return items.map(escapeHtml).join(", ");
}

function renderContributorRows(
  config: MarkdownExportConfig,
  project: LodeonProject
): StoryMetadataTemplateRow[] {
  if (config.metadataPanel?.contributors?.enabled === false) {
    return [];
  }

  return project.metadata.contributors.flatMap((contributor) => {
    const name = contributor.name.trim();
    const role = contributorRoleLabel(config, contributor.role);
    const affiliation = contributor.affiliation.trim();
    const identifiers = contributor.identifiers
      .map((identifier) => renderMetadataIdentifier(identifier.value, identifier.url))
      .filter(Boolean);
    const values = [
      name ? `<strong>${escapeHtml(name)}</strong>` : "",
      affiliation ? `<span class="lodeon-story-metadata-affiliation">${escapeHtml(affiliation)}</span>` : "",
      ...identifiers
    ].filter(Boolean);

    if (values.length === 0) {
      return [];
    }

    const row = renderMetadataRow(role, values.join(", "));

    return row ? [row] : [];
  });
}

function contributorRoleLabel(config: MarkdownExportConfig, roleId: string): string {
  const normalizedRoleId = roleId.trim();
  const roleConfig = normalizedRoleId
    ? config.metadataPanel?.contributors?.roles?.[normalizedRoleId]
    : undefined;
  const configuredLabelKey = roleConfig?.labelKey;

  if (configuredLabelKey && config.markdownLabels?.[configuredLabelKey]) {
    return config.markdownLabels[configuredLabelKey];
  }

  return renderMetadataLabel(normalizedRoleId || "author");
}

function renderPersistentIdentifierList(project: LodeonProject): string {
  const items = project.metadata.persistentIdentifiers
    .map((identifier) => renderMetadataIdentifier(identifier.value, identifier.url))
    .filter(Boolean);

  return items.join(", ");
}

function renderMetadataIdentifier(value: string, url: string): string {
  const label = value.trim();
  const href = url.trim();

  if (!label && !href) {
    return "";
  }

  if (href) {
    return `<a href="${escapeHtmlAttribute(href)}">${escapeHtml(href)}</a>`;
  }

  return escapeHtml(label);
}

function renderMetadataLabel(label: string): string {
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : label;
}

function renderPublishingDate(project: LodeonProject): string {
  if (!project.published) {
    return "";
  }

  const publishedAt = project.published.publishedAt.trim();

  return publishedAt ? escapeHtml(formatDateOnly(publishedAt)) : "";
}

function renderPublishedPackageLink(project: LodeonProject): string {
  const packageUrl = project.published?.packageUrl?.trim();

  if (!packageUrl) {
    return "";
  }

  return `<a href="${escapeHtmlAttribute(packageUrl)}">${escapeHtml(fileNameFromUrl(packageUrl))}</a>`;
}

function formatDateOnly(value: string): string {
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);

  return match?.[0] ?? value;
}

function fileNameFromUrl(url: string): string {
  const normalized = url.split(/[?#]/, 1)[0] ?? url;
  const segments = normalized.split("/").filter(Boolean);

  return segments.at(-1) || url;
}
