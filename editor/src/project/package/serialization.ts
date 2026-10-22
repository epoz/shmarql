/** Serializes canonical projects and assets into lossless packages. */

import JSZip from "jszip";
import type { LodeonProject } from "../contracts";
import { normalizeProject } from "../normalization";
import {
  LODEON_PROJECT_PACKAGE_FORMAT,
  LODEON_PROJECT_PACKAGE_VERSION,
  PROJECT_JSON_ENTRY,
  PROJECT_MARKDOWN_ENTRY,
  PROJECT_ZIP_MIME_TYPE,
  type LodeonProjectAssetFile,
  type LodeonProjectPackage
} from "./contracts";
import { EMPTY_LODEON_ASSISTANT_STATE } from "./lodeon-interop";

/** Creates the current lossless package envelope after canonical project normalization. */
export function createProjectPackage(project: LodeonProject): LodeonProjectPackage {
  return {
    format: LODEON_PROJECT_PACKAGE_FORMAT,
    version: LODEON_PROJECT_PACKAGE_VERSION,
    exportedAt: new Date().toISOString(),
    generator: {
      name: "LODEON"
    },
    project: { ...normalizeProject(project), assistant: EMPTY_LODEON_ASSISTANT_STATE }
  };
}

/** Serializes only the current canonical JSON project contract. */
export function serializeProject(project: LodeonProject): string {
  return `${JSON.stringify(createProjectPackage(project), null, 2)}\n`;
}

/**
 * Produces the lossless `.lodeon.zip` package while keeping browser-local
 * assets as separate entries.
 */
export async function serializeProjectZip(
  project: LodeonProject,
  markdown: string,
  assets: LodeonProjectAssetFile[] = []
): Promise<Blob> {
  const zip = new JSZip();

  zip.file(PROJECT_JSON_ENTRY, serializeProject(project));
  zip.file(PROJECT_MARKDOWN_ENTRY, markdown.endsWith("\n") ? markdown : `${markdown}\n`);

  for (const assetFile of assets) {
    if (project.assets.some((asset) => asset.assetId === assetFile.asset.assetId)) {
      zip.file(assetFile.asset.path, assetFile.blob);
    }
  }

  return zip.generateAsync({
    type: "blob",
    mimeType: PROJECT_ZIP_MIME_TYPE,
    compression: "DEFLATE",
    compressionOptions: {
      level: 6
    }
  });
}
