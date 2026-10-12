/** Generates stable client-side identifiers shared by Special Node factories. */

/**
 * Uses the browser cryptographic UUID facility when available and retains a
 * deterministic shape for constrained test or browser environments.
 */
export function createNodeId(kind = "node"): string {
  return globalThis.crypto?.randomUUID?.() ?? `${kind}-${Date.now()}`;
}
