/** Extracts supported XMP metadata without mutating source files. */

import type { LodeonAssetMetadata, LodeonAssetRights } from "./contracts";
import { normalizeAssetMetadataFields } from "./metadata-schema";

const XMP_FIELD_MAP = {
  "dc:title": "title",
  "dc:description": "description",
  "dc:creator": "creator",
  "dc:date": "date",
  "dc:source": "source",
  "dc:identifier": "identifier",
  "dc:relation": "relation",
  "dc:language": "language",
  "dc:publisher": "publisher"
} as const satisfies Record<string, keyof LodeonAssetMetadata>;

const XMP_RIGHTS_FIELD_MAP = {
  "xmpRights:Owner": "owner",
  "xmpRights:UsageTerms": "usageTerms",
  "xmpRights:WebStatement": "webStatement",
  "xmpRights:Certificate": "certificate",
  "cc:license": "license",
  "cc:morePermissions": "morePermissions",
  "cc:attributionName": "attributionName",
  "cc:attributionURL": "attributionUrl"
} as const satisfies Record<string, keyof LodeonAssetRights>;

type XmpMetadataStringKey = (typeof XMP_FIELD_MAP)[keyof typeof XMP_FIELD_MAP];
type XmpRightsStringKey = (typeof XMP_RIGHTS_FIELD_MAP)[keyof typeof XMP_RIGHTS_FIELD_MAP];

export async function extractJpegXmpMetadata(
  file: Blob
): Promise<Record<string, string | string[] | boolean | number>> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunks: string[] = [];
  let offset = 2;

  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return {};
  }

  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      break;
    }

    const marker = bytes[offset + 1];

    if (marker === 0xda || marker === 0xd9) {
      break;
    }

    const length = (bytes[offset + 2] << 8) + bytes[offset + 3];

    if (length < 2 || offset + 2 + length > bytes.length) {
      break;
    }

    if (marker === 0xe1) {
      const segment = bytes.subarray(offset + 4, offset + 2 + length);
      const text = new TextDecoder("utf-8", { fatal: false }).decode(segment);
      const xmpStart = text.indexOf("<x:xmpmeta");

      if (xmpStart >= 0) {
        const xmpEnd = text.indexOf("</x:xmpmeta>", xmpStart);

        chunks.push(
          xmpEnd >= 0 ? text.slice(xmpStart, xmpEnd + "</x:xmpmeta>".length) : text.slice(xmpStart)
        );
      }
    }

    offset += 2 + length;
  }

  return chunks.reduce<Record<string, string | string[] | boolean | number>>(
    (metadata, chunk) => ({
      ...metadata,
      ...parseXmpPacket(chunk)
    }),
    {}
  );
}

export function normalizeXmpMetadata(
  rawXmp: Record<string, string | string[] | boolean | number>
): LodeonAssetMetadata {
  const metadata: LodeonAssetMetadata = {};
  const rights: LodeonAssetRights = {};

  for (const [xmpKey, targetKey] of Object.entries(XMP_FIELD_MAP)) {
    const value = firstString(rawXmp[xmpKey]);

    if (value) {
      setMetadataString(metadata, targetKey, value);
    }
  }

  const contributors = stringList(rawXmp["dc:contributor"]);
  const subjects = stringList(rawXmp["dc:subject"]);

  if (contributors.length > 0) {
    metadata.contributors = contributors;
  }

  if (subjects.length > 0) {
    metadata.subjects = subjects;
  }

  for (const [xmpKey, targetKey] of Object.entries(XMP_RIGHTS_FIELD_MAP)) {
    const value = firstString(rawXmp[xmpKey]);

    if (value) {
      setRightsString(rights, targetKey, value);
    }
  }

  if (typeof rawXmp["xmpRights:Marked"] === "boolean") {
    rights.marked = rawXmp["xmpRights:Marked"];
  }

  if (Object.keys(rights).length > 0) {
    metadata.rights = rights;
    metadata.license = rights.license;
    metadata.credit = rights.attributionName ?? rights.owner;
  }

  if (metadata.description && !metadata.caption) {
    metadata.caption = metadata.description;
  }

  if (Object.keys(rawXmp).length > 0) {
    metadata.metadataFields = normalizeAssetMetadataFields(rawXmp);
    metadata.rawMetadata = {
      xmp: rawXmp
    };
  }

  return metadata;
}

function parseXmpPacket(source: string): Record<string, string | string[] | boolean | number> {
  const metadata: Record<string, string | string[] | boolean | number> = {};
  const parser = new DOMParser();
  const document = parser.parseFromString(source, "application/xml");
  const descriptions = Array.from(document.getElementsByTagNameNS("*", "Description"));

  for (const description of descriptions) {
    for (const attribute of Array.from(description.attributes)) {
      const key = xmpNodeKey(attribute);

      if (key) {
        metadata[key] = parseXmpScalar(attribute.value);
      }
    }

    for (const child of Array.from(description.children)) {
      const key = xmpNodeKey(child);

      if (key) {
        metadata[key] = parseXmpElementValue(child);
      }
    }
  }

  return metadata;
}

function parseXmpElementValue(element: Element): string | string[] | boolean | number {
  const sequence = element.querySelector("Seq, Bag, Alt");

  if (sequence) {
    const values = Array.from(sequence.querySelectorAll("li"))
      .map((item) => normalizeWhitespace(item.textContent ?? ""))
      .filter(Boolean);

    return values.length === 1 ? (values[0] ?? "") : values;
  }

  return parseXmpScalar(normalizeWhitespace(element.textContent ?? ""));
}

function parseXmpScalar(value: string): string | boolean | number {
  const normalized = normalizeWhitespace(value);

  if (normalized === "True" || normalized === "true") {
    return true;
  }

  if (normalized === "False" || normalized === "false") {
    return false;
  }

  return normalized;
}

function xmpNodeKey(node: Element | Attr): string | null {
  const prefix = node.prefix;
  const localName = node.localName;

  if (!prefix || !localName) {
    return null;
  }

  return `${prefix}:${localName}`;
}

function setMetadataString(metadata: LodeonAssetMetadata, key: XmpMetadataStringKey, value: string): void {
  switch (key) {
    case "title":
    case "description":
    case "creator":
    case "date":
    case "source":
    case "identifier":
    case "relation":
    case "language":
    case "publisher":
      metadata[key] = value;
      break;
  }
}

function setRightsString(rights: LodeonAssetRights, key: XmpRightsStringKey, value: string): void {
  switch (key) {
    case "owner":
    case "usageTerms":
    case "webStatement":
    case "certificate":
    case "license":
    case "morePermissions":
    case "attributionName":
    case "attributionUrl":
      rights[key] = value;
      break;
  }
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function firstString(value: string | string[] | boolean | number | undefined): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.find(isNonEmptyString);
  }

  return undefined;
}

function stringList(value: string | string[] | boolean | number | undefined): string[] {
  if (typeof value === "string") {
    return value ? [value] : [];
  }

  if (Array.isArray(value)) {
    return value.filter(isNonEmptyString);
  }

  return [];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
