/** Coordinates complete project-to-Markdown serialization. */

import { ASSET_METADATA_TABS } from "../assets/metadata-schema";
import type { LodeonConfig } from "../configuration/schema";
import { LodeonClientError } from "../errors/client-error";
import type { LodeonProject } from "../project/contracts";
import type { RendererEngineMarkdownConfig } from "./contracts";
import { exportProjectMarkdown } from "./export";

export function buildProjectMarkdown(project: LodeonProject, config: LodeonConfig): string {
  return exportProjectMarkdown(project.document, {
    rendererEngine: resolveActiveRendererEngine(config),
    assets: project.assets,
    project,
    metadataPanel: config.metadata.resolved,
    markdownLabels: markdownExportLabels(config)
  });
}

function markdownExportLabels(config: LodeonConfig): Record<string, string> {
  if (!config.localization) {
    throw new LodeonClientError("localization.config_missing");
  }

  const localization = config.localization;
  const t = (namespace: string, key: string): string => {
    const resources = localization.resources;
    const localeOrder = [localization.activeLocale, localization.fallbackLocale].filter(
      (locale, index, locales) => locale && locales.indexOf(locale) === index
    );

    for (const locale of localeOrder) {
      let value: unknown = resources?.[locale]?.[namespace];

      for (const part of key.split(".")) {
        if (!value || typeof value !== "object" || !(part in value)) {
          value = undefined;
          break;
        }

        value = (value as Record<string, unknown>)[part];
      }

      if (typeof value === "string") {
        return value;
      }
    }

    throw new LodeonClientError("localization.message_missing", {
      namespace,
      key
    });
  };

  const labels: Record<string, string> = {
    "assetMetadata.title": t("special-nodes", "markdown.assetMetadata.title"),
    "assetMetadata.fileGroup": t("special-nodes", "markdown.assetMetadata.fileGroup"),
    "assetMetadata.originalName": t("special-nodes", "markdown.assetMetadata.originalName"),
    "assetMetadata.mimeType": t("special-nodes", "markdown.assetMetadata.mimeType"),
    "assetMetadata.size": t("special-nodes", "markdown.assetMetadata.size"),
    "assetMetadata.dimensions": t("special-nodes", "markdown.assetMetadata.dimensions"),
    "assetMetadata.duration": t("special-nodes", "markdown.assetMetadata.duration"),
    "assetMetadata.group": t("special-nodes", "markdown.assetMetadata.group"),
    "assetMetadata.field": t("special-nodes", "markdown.assetMetadata.field"),
    "assetMetadata.value": t("special-nodes", "markdown.assetMetadata.value"),
    "assetMetadata.source": t("special-nodes", "markdown.assetMetadata.source"),
    "details.summary": t("special-nodes", "markdown.details.summary"),
    "storyMetadata.title": t("special-nodes", "markdown.storyMetadata.title"),
    "storyMetadata.description": t("special-nodes", "markdown.storyMetadata.description"),
    "storyMetadata.keywords": t("special-nodes", "markdown.storyMetadata.keywords"),
    "storyMetadata.language": t("special-nodes", "markdown.storyMetadata.language"),
    "storyMetadata.license": t("special-nodes", "markdown.storyMetadata.license"),
    "storyMetadata.persistentIdentifiers": t("special-nodes", "markdown.storyMetadata.persistentIdentifiers"),
    "storyMetadata.publishingDate": t("special-nodes", "markdown.storyMetadata.publishingDate"),
    "storyMetadata.download": t("special-nodes", "markdown.storyMetadata.download"),
    "storyMetadata.empty": t("special-nodes", "markdown.storyMetadata.empty")
  };

  for (const tab of ASSET_METADATA_TABS) {
    labels[tab.labelKey] = t("special-nodes", tab.labelKey);

    for (const field of tab.fields) {
      labels[field.labelKey] = t("special-nodes", field.labelKey);
    }
  }

  const roleConfigs = config.metadata.resolved?.contributors?.roles ?? {};

  for (const role of Object.values(roleConfigs)) {
    if (role.labelKey) {
      labels[role.labelKey] = t("editor", role.labelKey);
    }
  }

  return labels;
}

function resolveActiveRendererEngine(config: LodeonConfig): RendererEngineMarkdownConfig {
  const activeEngine = config.renderer.activeEngine;
  const engine = activeEngine ? config.renderer.engines?.[activeEngine] : undefined;

  if (!activeEngine || !engine) {
    throw new LodeonClientError("app.renderer_engine.missing", {
      activeEngine: activeEngine ?? ""
    });
  }

  return engine;
}
