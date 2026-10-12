/** Defines the stable assets data contracts without owning runtime behavior. */

export type LodeonAssetKind = "image" | "video" | "audio";

export type LodeonAssetRights = {
  owner?: string;
  usageTerms?: string;
  webStatement?: string;
  certificate?: string;
  marked?: boolean;
  license?: string;
  morePermissions?: string;
  attributionName?: string;
  attributionUrl?: string;
};

export type LodeonAssetMetadataFieldValue = string | number | boolean | string[];

export type LodeonAssetMetadataFieldType = "text" | "textarea" | "number" | "checkbox";

export type LodeonAssetMetadataField = {
  key: string;
  labelKey: string;
  type: LodeonAssetMetadataFieldType;
  descriptionKey: string;
};

export type LodeonAssetMetadataTab = {
  id: string;
  labelKey: string;
  fields: LodeonAssetMetadataField[];
};

export type LodeonAssetMetadata = {
  title?: string;
  alt?: string;
  caption?: string;
  description?: string;
  creator?: string;
  contributors?: string[];
  credit?: string;
  date?: string;
  source?: string;
  identifier?: string;
  relation?: string;
  license?: string;
  subjects?: string[];
  language?: string;
  publisher?: string;
  rights?: LodeonAssetRights;
  metadataFields?: Record<string, LodeonAssetMetadataFieldValue>;
  rawMetadata?: {
    xmp?: Record<string, string | string[] | boolean | number>;
  };
};

export type LodeonAsset = LodeonAssetMetadata & {
  assetId: string;
  kind: LodeonAssetKind;
  mimeType: string;
  path: string;
  fileName: string;
  originalName: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
  createdAt: string;
};

export type LodeonAssetBlob = {
  assetId: string;
  projectId: string;
  blob: Blob;
  mimeType: string;
  size: number;
  updatedAt: string;
};
