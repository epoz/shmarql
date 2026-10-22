/** Keeps exported packages importable by a full LODEON instance. */

/**
 * LODEON's package schema requires an `assistant` block on every project. This
 * editor has no Assistant, so exports carry LODEON's empty default state and
 * imports discard whatever Assistant data a LODEON package contains.
 */
export const EMPTY_LODEON_ASSISTANT_STATE = {
  keepChatsEnabled: false,
  chats: [],
  useToolsEnabled: true,
  useProposalsEnabled: true,
  useSuggestionsEnabled: true,
  includeStoryContentEnabled: true,
  memory: { entries: [] },
  toolTrace: []
} as const;
