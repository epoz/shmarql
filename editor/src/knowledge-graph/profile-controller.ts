/** Owns the stateful knowledge graph controller lifecycle and presentation coordination. */

import type { LodeonConfig } from "../configuration/schema";
import type { SpecialNodeInsertContext } from "../registry/nodes";

export const KNOWLEDGE_GRAPH_PROFILE_STORAGE_KEY = "lodeon.knowledgeGraphProfileId";

type KnowledgeGraphProfile = LodeonConfig["knowledgeGraph"]["profiles"][number];

export type KnowledgeGraphProfileControllerOptions = {
  config: LodeonConfig;
  storage?: Pick<Storage, "getItem" | "setItem">;
  emptyStateLabel: string;
  onProfileChange?: (profileId: string) => void;
};

export type KnowledgeGraphProfileController = {
  getActiveProfileId: () => string | undefined;
  setActiveProfileId: (profileId: string) => void;
  getActiveProfile: () => KnowledgeGraphProfile | undefined;
  getProfile: (profileId: string) => KnowledgeGraphProfile | undefined;
  getSparnaturalConfigId: (profileId?: string) => string | undefined;
  createSpecialNodeInsertContext: (profileId?: string) => SpecialNodeInsertContext;
  bindPicker: (root: HTMLElement) => () => void;
};

function defaultProfile(config: LodeonConfig): KnowledgeGraphProfile | undefined {
  return (
    config.knowledgeGraph.profiles.find((profile) => profile.id === config.knowledgeGraph.defaultProfile) ??
    config.knowledgeGraph.profiles[0]
  );
}

function hasProfile(config: LodeonConfig, profileId: string | undefined): boolean {
  return Boolean(profileId && config.knowledgeGraph.profiles.some((profile) => profile.id === profileId));
}

function readPersistedProfileId(config: LodeonConfig, storage: Pick<Storage, "getItem">): string | undefined {
  if (config.knowledgeGraph.ui?.showProfileSelect === false) {
    return undefined;
  }
  try {
    return storage.getItem(KNOWLEDGE_GRAPH_PROFILE_STORAGE_KEY)?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export function createKnowledgeGraphProfileController({
  config,
  storage = localStorage,
  emptyStateLabel,
  onProfileChange
}: KnowledgeGraphProfileControllerOptions): KnowledgeGraphProfileController {
  const fallbackProfile = defaultProfile(config);
  const persistedProfileId = readPersistedProfileId(config, storage);
  let activeProfileId = hasProfile(config, persistedProfileId) ? persistedProfileId : fallbackProfile?.id;

  function resolveProfile(profileId = activeProfileId): KnowledgeGraphProfile | undefined {
    return config.knowledgeGraph.profiles.find((profile) => profile.id === profileId) ?? fallbackProfile;
  }

  function setActiveProfileId(profileId: string): void {
    if (!hasProfile(config, profileId)) {
      return;
    }
    activeProfileId = profileId;
    try {
      storage.setItem(KNOWLEDGE_GRAPH_PROFILE_STORAGE_KEY, profileId);
    } catch {
      // Browser storage can be unavailable in restricted contexts.
    }
    onProfileChange?.(profileId);
  }

  function getSparnaturalConfigId(profileId = activeProfileId): string | undefined {
    const profile = resolveProfile(profileId);
    return profile && config.nodes.sparql.profiles[profile.id] ? profile.id : undefined;
  }

  function bindPicker(root: HTMLElement): () => void {
    const picker = root.querySelector<HTMLSelectElement>("[data-knowledge-graph-picker]");
    if (!picker) {
      return () => undefined;
    }

    if (config.knowledgeGraph.profiles.length === 0) {
      picker.replaceChildren(new Option(emptyStateLabel, ""));
      picker.disabled = true;
      return () => undefined;
    }

    picker.innerHTML = config.knowledgeGraph.profiles
      .map(
        (profile) => `
        <option value="${profile.id}" ${profile.id === activeProfileId ? "selected" : ""}>
          ${profile.label}
        </option>
      `
      )
      .join("");
    picker.disabled = config.knowledgeGraph.profiles.length < 2;
    const handleChange = () => setActiveProfileId(picker.value);
    picker.addEventListener("change", handleChange);
    return () => picker.removeEventListener("change", handleChange);
  }

  return {
    getActiveProfileId: () => activeProfileId,
    setActiveProfileId,
    getActiveProfile: () => resolveProfile(),
    getProfile: (profileId) => config.knowledgeGraph.profiles.find((profile) => profile.id === profileId),
    getSparnaturalConfigId,
    createSpecialNodeInsertContext: (profileId = activeProfileId) => {
      const profile = resolveProfile(profileId);
      return {
        config,
        knowledgeGraphProfileId: profile?.id,
        sparnaturalConfigId: profile ? getSparnaturalConfigId(profile.id) : undefined,
        graphExplorerConfig: profile ? config.nodes.graphExplorer.profiles[profile.id] : undefined
      };
    },
    bindPicker
  };
}
