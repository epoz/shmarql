/** Validates project-package structure and canonical payloads. */

import { z } from "zod";
import { LODEON_PROJECT_FORMAT, LODEON_PROJECT_VERSION } from "../contracts";
import { LODEON_PROJECT_PACKAGE_FORMAT, LODEON_PROJECT_PACKAGE_VERSION } from "./contracts";

const prosemirrorDocumentSchema = z
  .object({
    type: z.literal("doc")
  })
  .passthrough();

const projectIdentifierSchema = z.object({
  id: z.string().min(1),
  type: z.string(),
  value: z.string(),
  url: z.string()
});

const projectMetadataSchema = z.object({
  description: z.string(),
  keywords: z.array(z.string()),
  language: z.string(),
  license: z.string(),
  contributors: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string(),
      role: z.string(),
      affiliation: z.string(),
      identifiers: z.array(projectIdentifierSchema)
    })
  ),
  persistentIdentifiers: z.array(
    z.object({
      id: z.string().min(1),
      type: z.string(),
      value: z.string(),
      url: z.string()
    })
  )
});

const projectSchema = z
  .object({
    id: z.string().min(1),
    format: z.literal(LODEON_PROJECT_FORMAT),
    version: z.literal(LODEON_PROJECT_VERSION),
    title: z.string().min(1),
    slug: z.string().min(1),
    metadata: projectMetadataSchema,
    publishStoryZip: z.boolean(),
    published: z
      .object({
        url: z.string().min(1),
        packageUrl: z.string().min(1).optional(),
        publishedAt: z.string().min(1)
      })
      .optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    canonical: z.literal("prosemirror"),
    sourceFixture: z.string().optional(),
    // Present in packages from a full LODEON instance; ignored on import (see lodeon-interop.ts).
    assistant: z.unknown().optional(),
    assets: z.array(z.object({}).passthrough()).optional(),
    document: prosemirrorDocumentSchema
  })
  .passthrough();

/** Accepts only the current lossless LODEON package envelope and project schema. */
export const packageSchema = z.object({
  format: z.literal(LODEON_PROJECT_PACKAGE_FORMAT),
  version: z.literal(LODEON_PROJECT_PACKAGE_VERSION),
  exportedAt: z.string().min(1),
  generator: z.object({
    name: z.literal("LODEON")
  }),
  project: projectSchema
});
