/** Constructs canonical project values without retaining mutable application state. */

import type { JSONContent } from "@tiptap/core";
import { LODEON_PROJECT_FORMAT, LODEON_PROJECT_VERSION, type LodeonProject } from "./contracts";
import { createProjectId, createProjectSlug } from "./identity";
import { createEmptyProjectMetadata } from "./metadata";

export function createEmptyProject(title = "", id = createProjectId()): LodeonProject {
  const now = new Date().toISOString();
  const heading: JSONContent = {
    type: "heading",
    attrs: { level: 1 }
  };

  if (title) {
    heading.content = [{ type: "text", text: title }];
  }

  return {
    id,
    format: LODEON_PROJECT_FORMAT,
    version: LODEON_PROJECT_VERSION,
    title,
    slug: createProjectSlug(title),
    metadata: createEmptyProjectMetadata(),
    publishStoryZip: false,
    publicationHistory: [],
    createdAt: now,
    updatedAt: now,
    canonical: "prosemirror",
    assets: [],
    document: {
      type: "doc",
      content: [
        heading,
        {
          type: "paragraph",
          content: []
        }
      ]
    }
  };
}
