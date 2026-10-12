/** Owns canonical metadata normalization and mutation. */

import type {
  LodeonProjectContributor,
  LodeonProjectIdentifier,
  LodeonProjectMetadata,
  LodeonProjectPersistentIdentifier
} from "./contracts";
import { createProjectId } from "./identity";

export function createEmptyProjectMetadata(): LodeonProjectMetadata {
  return {
    description: "",
    keywords: [],
    language: "en",
    license: "",
    contributors: [],
    persistentIdentifiers: []
  };
}

export function createProjectContributor(
  name = "",
  id = createProjectId(),
  role = "author"
): LodeonProjectContributor {
  return {
    id,
    name,
    role,
    affiliation: "",
    identifiers: []
  };
}

export function createProjectIdentifier(
  type = "ORCID",
  value = "",
  url = "",
  id = createProjectId()
): LodeonProjectIdentifier {
  return {
    id,
    type,
    value,
    url
  };
}

export function createProjectPersistentIdentifier(
  type = "DOI",
  value = "",
  url = "",
  id = createProjectId()
): LodeonProjectPersistentIdentifier {
  return {
    id,
    type,
    value,
    url
  };
}

export function normalizeProjectMetadata(metadata: LodeonProjectMetadata | undefined): LodeonProjectMetadata {
  const normalized = {
    ...createEmptyProjectMetadata(),
    ...(metadata ?? {})
  };
  return {
    description: String(normalized.description ?? ""),
    keywords: normalizeKeywords(normalized.keywords),
    language: String(normalized.language ?? "en"),
    license: String(normalized.license ?? ""),
    contributors: normalizeProjectContributors(normalized.contributors),
    persistentIdentifiers: normalizePersistentIdentifiers(normalized.persistentIdentifiers)
  };
}

function normalizeProjectContributors(
  contributors: LodeonProjectContributor[] | undefined
): LodeonProjectContributor[] {
  if (!Array.isArray(contributors)) {
    return [];
  }

  return contributors
    .map((contributor) => ({
      id: String(contributor.id || createProjectId()),
      name: String(contributor.name ?? "").trim(),
      role: String(contributor.role ?? "author").trim() || "author",
      affiliation: String(contributor.affiliation ?? "").trim(),
      identifiers: normalizeProjectIdentifiers(contributor.identifiers)
    }))
    .filter(
      (contributor) => contributor.name || contributor.affiliation || contributor.identifiers.length > 0
    );
}

function normalizeProjectIdentifiers(
  identifiers: LodeonProjectIdentifier[] | undefined
): LodeonProjectIdentifier[] {
  if (!Array.isArray(identifiers)) {
    return [];
  }

  return identifiers
    .map((identifier) => ({
      id: String(identifier.id || createProjectId()),
      type: String(identifier.type ?? "").trim(),
      value: String(identifier.value ?? "").trim(),
      url: String(identifier.url ?? "").trim()
    }))
    .filter((identifier) => identifier.type || identifier.value || identifier.url);
}

function normalizePersistentIdentifiers(
  identifiers: LodeonProjectPersistentIdentifier[] | undefined
): LodeonProjectPersistentIdentifier[] {
  if (!Array.isArray(identifiers)) {
    return [];
  }

  return identifiers
    .map((identifier) => ({
      id: String(identifier.id || createProjectId()),
      type: String(identifier.type ?? "").trim(),
      value: String(identifier.value ?? "").trim(),
      url: String(identifier.url ?? "").trim()
    }))
    .filter((identifier) => identifier.type || identifier.value || identifier.url);
}

export function parseProjectKeywords(value: string): string[] {
  return normalizeKeywords(value.split(","));
}

function normalizeKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((keyword): keyword is string => typeof keyword === "string")
        .map((keyword) => keyword.trim())
        .filter(Boolean)
    )
  ).slice(0, 50);
}
