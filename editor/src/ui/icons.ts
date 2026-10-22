/** Renders the controlled Editor icon vocabulary. */

import type { IconNode } from "lucide";

const defaultIconAttributes = {
  "aria-hidden": "true",
  class: "ld-lucide-icon",
  fill: "none",
  height: "18",
  stroke: "currentColor",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "stroke-width": "2",
  viewBox: "0 0 24 24",
  width: "18",
  xmlns: "http://www.w3.org/2000/svg"
};

type IconAttributes = Record<string, string | number | undefined>;

export function renderIcon(node: IconNode, attributes: IconAttributes = {}): string {
  return `<svg ${renderAttributes({ ...defaultIconAttributes, ...attributes })}>${node
    .map(([tag, attrs]) => `<${tag} ${renderAttributes(attrs)} />`)
    .join("")}</svg>`;
}

function renderAttributes(attributes: IconAttributes): string {
  return Object.entries(attributes)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}="${escapeAttribute(String(value))}"`)
    .join(" ");
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
