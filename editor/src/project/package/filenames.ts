/** Derives stable project-package and export filenames. */

import type { LodeonProject } from "../contracts";
import { normalizeProject } from "../normalization";
import { PROJECT_ZIP_EXTENSION } from "./contracts";

export function createProjectZipFileName(project: LodeonProject): string {
  const slug = normalizeProject(project).slug;

  return `${slug || "lodeon-project"}.${PROJECT_ZIP_EXTENSION}`;
}
