/** Owns validated Iiif Special Node configuration contracts and resolution. */

import type { LodeonConfig } from "../../configuration/schema";

export function defaultIiifOptions(): LodeonConfig["nodes"]["iiif"] {
  return {
    enabled: false,
    originPolicy: {
      mode: "allowList",
      allowedOrigins: [],
      blockedOrigins: []
    },
    requireHttps: true,
    defaultResultPageSize: 10,
    defaultViewMode: "single",
    defaultGalleryReferenceStrip: "none",
    defaultHeight: 1
  };
}

export function defaultIiifResultMapping(): Record<string, string> {
  return {
    manifest: "manifest",
    imageInfo: "imageInfo",
    label: "label",
    resource: "resource"
  };
}
