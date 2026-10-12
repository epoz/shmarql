/** Defines the stable project data contracts without owning runtime behavior. */

import type { JSONContent } from "@tiptap/core";
import type { LodeonAsset } from "../assets/contracts";

export const LODEON_PROJECT_FORMAT = "lodeon-datastory";
export const LODEON_PROJECT_VERSION = 1;

export type LodeonProject = {
  id: string;
  format: typeof LODEON_PROJECT_FORMAT;
  version: typeof LODEON_PROJECT_VERSION;
  title: string;
  slug: string;
  metadata: LodeonProjectMetadata;
  publishStoryZip: boolean;
  published?: {
    url: string;
    packageUrl?: string;
    publishedAt: string;
  };
  publicationHistory: LodeonPublicationEntry[];
  createdAt: string;
  updatedAt: string;
  canonical: "prosemirror";
  sourceFixture?: string;
  assets: LodeonAsset[];
  document: JSONContent;
};

export type LodeonProjectMetadata = {
  description: string;
  keywords: string[];
  language: string;
  license: string;
  contributors: LodeonProjectContributor[];
  persistentIdentifiers: LodeonProjectPersistentIdentifier[];
};

export type LodeonProjectContributor = {
  id: string;
  name: string;
  role: string;
  affiliation: string;
  identifiers: LodeonProjectIdentifier[];
};

export type LodeonProjectIdentifier = {
  id: string;
  type: string;
  value: string;
  url: string;
};

export type LodeonProjectPersistentIdentifier = {
  id: string;
  type: string;
  value: string;
  url: string;
};

export type LodeonPublicationEntry = {
  url: string;
  packageUrl?: string;
  publishedAt: string;
};

export type LodeonAssetLifecycleSummary = {
  referencedAssetIds: string[];
  usedAssets: LodeonAsset[];
  unusedAssets: LodeonAsset[];
  missingAssetIds: string[];
};
