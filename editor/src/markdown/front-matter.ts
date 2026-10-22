/** Renders configured project metadata and JSON-LD front matter. */

import YAML from "yaml";
import type { LodeonProject } from "../project/contracts";
import type {
  MarkdownExportConfig,
  MetadataPanelRuntimeConfig,
  RendererMetadataConfig,
  RendererMetadataMapping
} from "./contracts";

/** Builds configured front matter and JSON-LD without package-specific policy. */
export function renderProjectFrontMatter(config: MarkdownExportConfig): string {
  if (!config.project || config.rendererEngine.metadata?.frontMatter?.enabled !== true) {
    return "";
  }

  const metadata = buildProjectFrontMatter(config);
  const cleaned = pruneEmpty(metadata);

  if (!isPlainObject(cleaned) || Object.keys(cleaned).length === 0) {
    return "";
  }

  return `---\n${YAML.stringify(cleaned).trimEnd()}\n---\n\n`;
}

function buildProjectFrontMatter(config: MarkdownExportConfig): Record<string, unknown> {
  if (!config.project) {
    return {};
  }

  const project = config.project;
  const rendererEngine = config.rendererEngine;
  const metadataConfig = rendererEngine.metadata;
  const base = {
    title: project.title,
    description: project.metadata.description,
    keywords: project.metadata.keywords,
    language: project.metadata.language,
    license: project.metadata.license,
    contributors: project.metadata.contributors.map((contributor) => ({
      name: contributor.name,
      role:
        contributor.name || contributor.affiliation || contributor.identifiers.length ? contributor.role : "",
      affiliation: contributor.affiliation,
      identifiers: contributor.identifiers.map((identifier) => ({
        type: identifier.type,
        value: identifier.value,
        url: identifier.url
      }))
    })),
    persistentIdentifiers: project.metadata.persistentIdentifiers.map((identifier) => ({
      type: identifier.type,
      value: identifier.value,
      url: identifier.url
    })),
    published: project.published,
    updatedAt: project.updatedAt,
    lodeon: {
      htmlMeta: renderConfiguredFields(config, metadataConfig?.htmlMeta),
      openGraph: renderConfiguredFields(config, metadataConfig?.openGraph),
      jsonLd: renderConfiguredJsonLd(config, metadataConfig?.jsonLd)
    }
  };

  return base;
}

function renderConfiguredFields(
  exportConfig: MarkdownExportConfig,
  config: { enabled: boolean; fields?: Record<string, RendererMetadataMapping> } | undefined
): Record<string, unknown> | undefined {
  if (!exportConfig.project || config?.enabled !== true || !config.fields) {
    return undefined;
  }

  const context = metadataContext(exportConfig.project, exportConfig.metadataPanel);
  const entries = Object.entries(config.fields).map(([key, mapping]) => [
    key,
    renderMapping(context, mapping)
  ]);

  return Object.fromEntries(entries);
}

function renderConfiguredJsonLd(
  exportConfig: MarkdownExportConfig,
  config: RendererMetadataConfig["jsonLd"] | undefined
): Record<string, unknown> | undefined {
  if (!exportConfig.project || config?.enabled !== true) {
    return undefined;
  }

  const context = metadataContext(exportConfig.project, exportConfig.metadataPanel);
  const properties = renderMappingProperties(context, config.properties);

  return {
    "@context": config.context,
    "@type": config.type,
    ...properties
  };
}

function renderMappingProperties(
  context: unknown,
  properties: Record<string, RendererMetadataMapping> | undefined
): Record<string, unknown> {
  if (!properties) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(properties).map(([key, mapping]) => [key, renderMapping(context, mapping)])
  );
}

function renderMapping(context: unknown, mapping: RendererMetadataMapping): unknown {
  const sourceValue = typeof mapping.source === "string" ? resolveSource(context, mapping.source) : undefined;
  const baseValue = mapping.source ? sourceValue : mapping.value;

  if (mapping.type && mapping.properties) {
    const values = Array.isArray(baseValue) ? baseValue : baseValue ? [baseValue] : [];
    const mappedValues = values.map((item) => {
      const properties = renderMappingProperties(
        item,
        mapping.properties as Record<string, RendererMetadataMapping>
      );
      const cleanedProperties = pruneEmpty(properties);

      if (!isPlainObject(cleanedProperties) || Object.keys(cleanedProperties).length === 0) {
        return undefined;
      }

      return {
        "@type": mapping.type,
        ...cleanedProperties
      };
    });

    return mappedValues;
  }

  return baseValue;
}

function metadataContext(
  project: LodeonProject,
  metadataPanel?: MetadataPanelRuntimeConfig
): Record<string, unknown> {
  return {
    title: project.title,
    metadata: {
      ...project.metadata,
      contributorsBySchemaOrgProperty: contributorsBySchemaOrgProperty(project, metadataPanel)
    },
    published: project.published,
    updatedAt: project.updatedAt
  };
}

function contributorsBySchemaOrgProperty(
  project: LodeonProject,
  metadataPanel?: MetadataPanelRuntimeConfig
): Record<string, LodeonProject["metadata"]["contributors"]> {
  const roles = metadataPanel?.contributors?.roles ?? {};
  const grouped: Record<string, LodeonProject["metadata"]["contributors"]> = {};

  for (const contributor of project.metadata.contributors) {
    const schemaOrgProperty = roles[contributor.role]?.schemaOrgProperty?.trim();

    if (!schemaOrgProperty) {
      continue;
    }

    grouped[schemaOrgProperty] = [...(grouped[schemaOrgProperty] ?? []), contributor];
  }

  return grouped;
}

function resolveSource(context: unknown, source: string): unknown {
  return resolvePathSegments(context, source.split("."));
}

function resolvePathSegments(value: unknown, segments: string[]): unknown {
  if (segments.length === 0) {
    return value;
  }

  if (value === undefined || value === null) {
    return undefined;
  }

  const [segment, ...rest] = segments;

  if (!segment) {
    return undefined;
  }

  if (segment.endsWith("[]")) {
    const key = segment.slice(0, -2);
    const list = readProperty(value, key);

    if (!Array.isArray(list)) {
      return undefined;
    }

    return list.flatMap((item) => {
      const resolved = resolvePathSegments(item, rest);

      return Array.isArray(resolved) ? resolved : resolved === undefined ? [] : [resolved];
    });
  }

  return resolvePathSegments(readProperty(value, segment), rest);
}

function readProperty(value: unknown, key: string): unknown {
  if (!isPlainObject(value)) {
    return undefined;
  }

  return value[key];
}

function pruneEmpty(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(pruneEmpty).filter((item) => !isEmptyValue(item));

    return items.length ? items : undefined;
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value)
      .map(([key, item]) => [key, pruneEmpty(item)] as const)
      .filter(([, item]) => !isEmptyValue(item));

    return entries.length ? Object.fromEntries(entries) : undefined;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    return trimmed ? trimmed : undefined;
  }

  return value;
}

function isEmptyValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0) ||
    (isPlainObject(value) && Object.keys(value).length === 0)
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
