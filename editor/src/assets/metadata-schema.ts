/** Defines editable asset metadata fields and validation. */

import type {
  LodeonAssetMetadata,
  LodeonAssetMetadataField,
  LodeonAssetMetadataFieldType,
  LodeonAssetMetadataFieldValue,
  LodeonAssetMetadataTab,
  LodeonAssetRights
} from "./contracts";

export const LODEON_DISPLAY_FIELD_MAP: Record<string, keyof LodeonAssetMetadata> = {
  "lodeon:title": "title",
  "lodeon:alt": "alt",
  "lodeon:caption": "caption",
  "lodeon:creator": "creator",
  "lodeon:credit": "credit",
  "lodeon:license": "license",
  "lodeon:source": "source",
  "lodeon:identifier": "identifier"
};

export const STANDARD_FIELD_TO_LODEON_FIELD_MAP: Record<string, keyof LodeonAssetMetadata> = {
  "dc:title": "title",
  "dc:description": "description",
  "dc:creator": "creator",
  "dc:date": "date",
  "dc:source": "source",
  "dc:identifier": "identifier",
  "dc:relation": "relation",
  "dc:language": "language",
  "dc:publisher": "publisher",
  "cc:license": "license",
  "cc:attributionName": "credit"
};

export const STANDARD_FIELD_TO_RIGHTS_FIELD_MAP: Record<string, keyof LodeonAssetRights> = {
  "xmpRights:Certificate": "certificate",
  "xmpRights:Marked": "marked",
  "xmpRights:Owner": "owner",
  "xmpRights:UsageTerms": "usageTerms",
  "xmpRights:WebStatement": "webStatement",
  "cc:license": "license",
  "cc:morePermissions": "morePermissions",
  "cc:attributionURL": "attributionUrl",
  "cc:attributionName": "attributionName"
};

export const ASSET_METADATA_TABS: LodeonAssetMetadataTab[] = [
  {
    id: "display",
    labelKey: "assetMetadata.tabs.display.label",
    fields: [
      field("lodeon:title", "lodeonTitle"),
      field("lodeon:alt", "lodeonAlt"),
      field("lodeon:caption", "lodeonCaption"),
      field("lodeon:creator", "lodeonCreator"),
      field("lodeon:credit", "lodeonCredit"),
      field("lodeon:license", "lodeonLicense"),
      field("lodeon:source", "lodeonSource"),
      field("lodeon:identifier", "lodeonIdentifier")
    ]
  },
  {
    id: "dc",
    labelKey: "assetMetadata.tabs.dc.label",
    fields: [
      field("dc:title", "dcTitle"),
      field("dc:creator", "dcCreator"),
      field("dc:contributor", "dcContributor"),
      field("dc:coverage", "dcCoverage"),
      field("dc:date", "dcDate"),
      field("dc:description", "dcDescription"),
      field("dc:format", "dcFormat"),
      field("dc:identifier", "dcIdentifier"),
      field("dc:language", "dcLanguage"),
      field("dc:publisher", "dcPublisher"),
      field("dc:relation", "dcRelation"),
      field("dc:rights", "dcRights"),
      field("dc:source", "dcSource"),
      field("dc:subject", "dcSubject"),
      field("dc:type", "dcType")
    ]
  },
  {
    id: "iptc",
    labelKey: "assetMetadata.tabs.iptc.label",
    fields: [
      field("Iptc4xmpCore:CountryCode", "iptcCountryCode"),
      field("Iptc4xmpExt:LocationCreatedWorldRegion", "iptcWorldRegion"),
      field("Iptc4xmpExt:CountryName", "iptcCountryName"),
      field("Iptc4xmpExt:ProvinceState", "iptcProvinceState"),
      field("Iptc4xmpExt:City", "iptcCity"),
      field("Iptc4xmpExt:Sublocation", "iptcSublocation")
    ]
  },
  {
    id: "xmp",
    labelKey: "assetMetadata.tabs.xmp.label",
    fields: [
      field("xmp:CreateDate", "xmpCreateDate"),
      field("xmp:CreatorTool", "xmpCreatorTool"),
      field("xmp:Identifier", "xmpIdentifier"),
      field("xmp:Label", "xmpLabel"),
      field("xmp:MetadataDate", "xmpMetadataDate"),
      field("xmp:ModifyDate", "xmpModifyDate"),
      field("xmp:Rating", "xmpRating", "number")
    ]
  },
  {
    id: "rights",
    labelKey: "assetMetadata.tabs.rights.label",
    fields: [
      field("xmpRights:Certificate", "xmpRightsCertificate"),
      field("xmpRights:Marked", "xmpRightsMarked", "checkbox"),
      field("xmpRights:Owner", "xmpRightsOwner"),
      field("xmpRights:UsageTerms", "xmpRightsUsageTerms"),
      field("xmpRights:WebStatement", "xmpRightsWebStatement"),
      field("cc:license", "ccLicense"),
      field("cc:morePermissions", "ccMorePermissions"),
      field("cc:attributionURL", "ccAttributionUrl"),
      field("cc:attributionName", "ccAttributionName")
    ]
  },
  {
    id: "xmpmm",
    labelKey: "assetMetadata.tabs.xmpmm.label",
    fields: [
      field("xmpMM:DerivedFrom", "xmpmmDerivedFrom"),
      field("xmpMM:DocumentID", "xmpmmDocumentId"),
      field("xmpMM:InstanceID", "xmpmmInstanceId"),
      field("xmpMM:OriginalDocumentID", "xmpmmOriginalDocumentId"),
      field("xmpMM:RenditionClass", "xmpmmRenditionClass"),
      field("xmpMM:RenditionParams", "xmpmmRenditionParams")
    ]
  },
  {
    id: "internal",
    labelKey: "assetMetadata.tabs.internal.label",
    fields: [
      field("photoshop:CaptionWriter", "photoshopCaptionWriter"),
      field("photoshop:Instructions", "photoshopInstructions")
    ]
  }
];

function field(
  key: string,
  messageKey: string,
  type: LodeonAssetMetadataFieldType = "text"
): LodeonAssetMetadataField {
  return {
    key,
    labelKey: `assetMetadata.fields.${messageKey}.label`,
    type,
    descriptionKey: `assetMetadata.fields.${messageKey}.description`
  };
}

export function normalizeAssetMetadataFields(
  fields: Record<string, unknown>
): Record<string, LodeonAssetMetadataFieldValue> | undefined {
  const normalized: Record<string, LodeonAssetMetadataFieldValue> = {};
  const knownKeys = new Set(ASSET_METADATA_TABS.flatMap((tab) => tab.fields.map((field) => field.key)));

  for (const [key, value] of Object.entries(fields)) {
    if (!knownKeys.has(key) || isEmptyMetadataFieldValue(value)) {
      continue;
    }

    normalized[key] = normalizeMetadataFieldValue(value);
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function normalizeMetadataFieldValue(value: unknown): LodeonAssetMetadataFieldValue {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }

  return String(value ?? "").trim();
}

export function isMetadataFieldValue(value: unknown): value is LodeonAssetMetadataFieldValue {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    (Array.isArray(value) && value.every((entry) => typeof entry === "string"))
  );
}

export function isEmptyMetadataFieldValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }

  if (typeof value === "string") {
    return value.trim().length === 0;
  }

  if (Array.isArray(value)) {
    return value.length === 0 || value.every((entry) => String(entry).trim().length === 0);
  }

  return false;
}

export function firstMetadataString(value: LodeonAssetMetadataFieldValue | undefined): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  return Array.isArray(value) ? value.find(isNonEmptyMetadataString) : undefined;
}

export function isNonEmptyMetadataString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
