/** Defines the stable markdown data contracts without owning runtime behavior. */

import type { LodeonAsset } from "../assets/contracts";
import type { LodeonProject } from "../project/contracts";

export type RendererSpecialNodeMapping = {
  strategy: string;
  fence?: string;
  contentAttribute?: string;
  template?: string;
  attributes?: Record<string, string>;
};

export type RendererFormatMapping = {
  strategy: string;
  tag?: string;
  template?: string;
  attributes?: Record<string, string[]>;
};

export type RendererContainerMapping = {
  strategy: string;
  block?: string;
  argument?: string;
  titleAttribute?: string;
  summaryAttribute?: string;
  openAttribute?: string;
  tag?: string;
  template?: string;
  attributes?: Record<string, string[]>;
  options?: Record<string, unknown>;
};

export type RendererMetadataMapping = {
  source?: string;
  value?: unknown;
  type?: string;
  properties?: Record<string, unknown>;
  [key: string]: unknown;
};

export type RendererMetadataConfig = {
  frontMatter?: { enabled: boolean };
  htmlMeta?: { enabled: boolean; fields?: Record<string, RendererMetadataMapping> };
  openGraph?: { enabled: boolean; fields?: Record<string, RendererMetadataMapping> };
  jsonLd?: {
    enabled: boolean;
    context: string;
    type: string;
    properties: Record<string, RendererMetadataMapping>;
  };
};

export type MetadataPanelContributorRoleConfig = {
  labelKey: string;
  schemaOrgProperty?: string;
};

export type MetadataPanelRuntimeConfig = {
  contributors?: {
    enabled?: boolean;
    roles?: Record<string, MetadataPanelContributorRoleConfig>;
  };
  fields?: Record<string, { enabled: boolean }>;
};

export type RendererEngineMarkdownConfig = {
  specialNodeMappings: Record<string, RendererSpecialNodeMapping>;
  templateDirectory?: string;
  templates?: Record<string, string>;
  formatMappings?: Record<string, RendererFormatMapping>;
  containerMappings?: Record<string, RendererContainerMapping>;
  metadata?: RendererMetadataConfig;
};

export type MarkdownExportConfig = {
  rendererEngine: RendererEngineMarkdownConfig;
  assets?: LodeonAsset[];
  project?: LodeonProject;
  metadataPanel?: MetadataPanelRuntimeConfig;
  markdownLabels?: Record<string, string>;
};
