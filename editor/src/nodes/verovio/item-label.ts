/** Derives stable user-facing Verovio item labels. */

import type { VerovioItem } from "./contracts";

export function verovioItemBaseLabel(item: VerovioItem, untitled: string): string {
  return item.label || item.resourceLabel || untitled;
}

export function verovioItemChoiceLabel(
  items: VerovioItem[],
  item: VerovioItem,
  untitled: string,
  formatDuplicate: (values: { label: string; position: number; resource: string }) => string,
  noResource: string
): string {
  const label = verovioItemBaseLabel(item, untitled);
  const duplicates = items.filter((candidate) => verovioItemBaseLabel(candidate, untitled) === label);
  if (duplicates.length < 2) return label;
  return formatDuplicate({
    label,
    position: items.indexOf(item) + 1,
    resource: item.resourceLabel || item.resource || noResource
  });
}
