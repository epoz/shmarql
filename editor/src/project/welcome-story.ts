/** Loads the configured Welcome Story through the canonical project-package contract. */

import type { LodeonConfig } from "../configuration/schema";
import { LodeonClientError } from "../errors/client-error";
import type { LodeonPersistence } from "../persistence/project-lifecycle";
import { saveProjectAssetBlobs } from "../persistence/project-store";
import type { LodeonProject } from "./contracts";
import { PROJECT_ZIP_MIME_TYPE } from "./package/contracts";
import { parseProjectFileWithAssets } from "./package/parsing";

export type WelcomeStoryLoaderOptions = {
  fetchStory?: typeof fetch;
  saveAssetFiles?: typeof saveProjectAssetBlobs;
  now?: () => string;
};

/**
 * Fetches, validates, and persists the configured Welcome Story as an ordinary
 * editable LODEON project. The caller invokes this only when no local project exists.
 */
export async function loadWelcomeStory(
  config: LodeonConfig,
  persistence: Pick<LodeonPersistence, "saveProject">,
  options: WelcomeStoryLoaderOptions = {}
): Promise<LodeonProject> {
  const welcomeStory = config.editor?.welcomeStory;

  if (!welcomeStory?.enabled) {
    throw new LodeonClientError("project.welcome_story_unavailable");
  }

  const fetchStory = options.fetchStory ?? fetch;
  const saveAssetFiles = options.saveAssetFiles ?? saveProjectAssetBlobs;
  const now = options.now ?? (() => new Date().toISOString());

  try {
    const response = await fetchStory(welcomeStory.url, {
      headers: { Accept: PROJECT_ZIP_MIME_TYPE }
    });

    if (!response.ok) {
      throw new LodeonClientError("project.welcome_story_load_failed", {
        externalError: String(response.status)
      });
    }

    const file = new File([await response.blob()], "welcome.lodeon.zip", {
      type: PROJECT_ZIP_MIME_TYPE
    });
    const importedPackage = await parseProjectFileWithAssets(file);
    const project = await persistence.saveProject(importedPackage.project);

    await saveAssetFiles(
      importedPackage.assets.map((assetFile) => ({
        projectId: project.id,
        assetId: assetFile.asset.assetId,
        blob: assetFile.blob,
        mimeType: assetFile.asset.mimeType,
        size: assetFile.blob.size,
        updatedAt: now()
      }))
    );

    return project;
  } catch (error) {
    if (error instanceof LodeonClientError && error.code === "project.welcome_story_load_failed") {
      throw error;
    }
    throw new LodeonClientError(
      "project.welcome_story_load_failed",
      { externalError: error instanceof Error ? error.message : String(error) },
      { cause: error }
    );
  }
}
