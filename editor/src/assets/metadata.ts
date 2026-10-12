/** Owns canonical metadata normalization and mutation. */

import type { LodeonAsset, LodeonAssetMetadata, LodeonAssetMetadataFieldValue } from "./contracts";
import { normalizeAsset } from "./normalization";
import {
  LODEON_DISPLAY_FIELD_MAP,
  STANDARD_FIELD_TO_LODEON_FIELD_MAP,
  STANDARD_FIELD_TO_RIGHTS_FIELD_MAP,
  firstMetadataString,
  isEmptyMetadataFieldValue,
  isMetadataFieldValue,
  normalizeMetadataFieldValue
} from "./metadata-schema";

export function readAssetMetadataField(
  asset: LodeonAsset,
  key: string
): LodeonAssetMetadataFieldValue | undefined {
  const displayKey = LODEON_DISPLAY_FIELD_MAP[key];

  if (displayKey) {
    const value = asset[displayKey];

    return isMetadataFieldValue(value) ? value : undefined;
  }

  return asset.metadataFields?.[key];
}

export function updateAssetMetadataField(
  asset: LodeonAsset,
  key: string,
  value: LodeonAssetMetadataFieldValue | undefined
): LodeonAsset {
  const next: LodeonAsset = normalizeAsset({
    ...asset,
    metadataFields: {
      ...(asset.metadataFields ?? {})
    },
    rights: asset.rights ? { ...asset.rights } : undefined
  });
  const metadataFields = {
    ...(next.metadataFields ?? {})
  };

  if (isEmptyMetadataFieldValue(value)) {
    delete metadataFields[key];
  } else {
    metadataFields[key] = normalizeMetadataFieldValue(value);
  }

  next.metadataFields = metadataFields;
  syncMetadataField(next, key, value);

  if (Object.keys(metadataFields).length === 0) {
    delete next.metadataFields;
  }

  return normalizeAsset(next);
}

function syncMetadataField(
  asset: LodeonAsset,
  key: string,
  value: LodeonAssetMetadataFieldValue | undefined
): void {
  const displayKey = LODEON_DISPLAY_FIELD_MAP[key];

  if (displayKey) {
    setAssetStringField(asset, displayKey, firstMetadataString(value));
    return;
  }

  const metadataKey = STANDARD_FIELD_TO_LODEON_FIELD_MAP[key];

  if (metadataKey) {
    setAssetStringField(asset, metadataKey, firstMetadataString(value));
  }

  const rightsKey = STANDARD_FIELD_TO_RIGHTS_FIELD_MAP[key];

  if (!rightsKey) {
    return;
  }

  const rights = {
    ...(asset.rights ?? {})
  };

  if (rightsKey === "marked") {
    if (typeof value === "boolean") {
      rights.marked = value;
    } else {
      delete rights.marked;
    }
  } else {
    const stringValue = firstMetadataString(value);

    if (stringValue) {
      rights[rightsKey] = stringValue;
    } else {
      delete rights[rightsKey];
    }
  }

  asset.rights = Object.keys(rights).length > 0 ? rights : undefined;
  asset.license = asset.rights?.license ?? asset.license;
  asset.credit = asset.rights?.attributionName ?? asset.credit;
}

function setAssetStringField(
  asset: LodeonAsset,
  key: keyof LodeonAssetMetadata,
  value: string | undefined
): void {
  if (
    key === "title" ||
    key === "alt" ||
    key === "caption" ||
    key === "description" ||
    key === "creator" ||
    key === "credit" ||
    key === "date" ||
    key === "source" ||
    key === "identifier" ||
    key === "relation" ||
    key === "license" ||
    key === "language" ||
    key === "publisher"
  ) {
    if (value) {
      asset[key] = value;
    } else {
      delete asset[key];
    }
  }
}
