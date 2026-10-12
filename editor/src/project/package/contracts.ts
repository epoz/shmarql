/** Defines the stable project package data contracts without owning runtime behavior. */

import type { LodeonAsset } from "../../assets/contracts";
import type { LodeonProject } from "../contracts";
import type { EMPTY_LODEON_ASSISTANT_STATE } from "./lodeon-interop";

export const PROJECT_ZIP_MIME_TYPE = "application/zip";
export const PROJECT_ZIP_EXTENSION = "lodeon.zip";
export const PROJECT_JSON_ENTRY = "project.lodeon.json";
export const PROJECT_MARKDOWN_ENTRY = "story.md";
export const LODEON_PROJECT_PACKAGE_FORMAT = "lodeon-project-package";
export const LODEON_PROJECT_PACKAGE_VERSION = 1;

export type LodeonProjectPackage = {
  format: typeof LODEON_PROJECT_PACKAGE_FORMAT;
  version: typeof LODEON_PROJECT_PACKAGE_VERSION;
  exportedAt: string;
  generator: {
    name: "LODEON";
  };
  project: LodeonProject & { assistant: typeof EMPTY_LODEON_ASSISTANT_STATE };
};

export type LodeonProjectAssetFile = {
  asset: LodeonAsset;
  blob: Blob;
};

export type ParsedLodeonProjectFile = {
  project: LodeonProject;
  assets: LodeonProjectAssetFile[];
};
