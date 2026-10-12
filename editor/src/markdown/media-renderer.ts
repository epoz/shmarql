/** Renders local and remote media references into Markdown. */

import type { JSONContent } from "@tiptap/core";
import { type LodeonAsset, type LodeonAssetMetadataFieldValue } from "../assets/contracts";
import { readAssetMetadataField } from "../assets/metadata";
import { ASSET_METADATA_TABS } from "../assets/metadata-schema";
import type { MarkdownExportConfig } from "./contracts";
import {
  escapeHtmlAttribute,
  escapeLinkLabel,
  escapeTableCell,
  escapeText,
  markdownLabel
} from "./text-presentation";

export function renderMediaAsset(node: JSONContent, config: MarkdownExportConfig): string {
  const assetId = String(node.attrs?.assetId ?? "");
  const asset = config.assets?.find((entry) => entry.assetId === assetId);

  if (!asset) {
    return "";
  }

  const title = String(node.attrs?.title ?? asset.title ?? "");
  const alt = escapeText(asset.alt ?? asset.title ?? asset.originalName ?? title);
  const caption = renderMediaAssetCaption(asset, config);
  const details =
    node.attrs?.displayExtendedMetadata === true ? renderMediaAssetMetadataDetails(asset, config) : "";

  if (asset.kind === "image") {
    const image = title
      ? `![${alt}](${asset.path} "${title.replace(/"/g, '\\"')}")`
      : `![${alt}](${asset.path})`;

    return [renderMediaAssetLink(asset, image), caption, details].filter(Boolean).join("\n\n");
  }

  if (asset.kind === "audio") {
    return [`<audio controls src="${escapeHtmlAttribute(asset.path)}"></audio>`, caption, details]
      .filter(Boolean)
      .join("\n\n");
  }

  return [`<video controls src="${escapeHtmlAttribute(asset.path)}"></video>`, caption, details]
    .filter(Boolean)
    .join("\n\n");
}

export function renderImage(node: JSONContent): string {
  const alt = escapeText(String(node.attrs?.alt ?? ""));
  const src = String(node.attrs?.src ?? "");
  const title = String(node.attrs?.title ?? "");

  if (!src) {
    return "";
  }

  return title ? `![${alt}](${src} "${title.replace(/"/g, '\\"')}")` : `![${alt}](${src})`;
}

function renderMediaAssetLink(asset: LodeonAsset, imageMarkdown: string): string {
  const sourceUrl = firstUrl([asset.source, asset.rights?.attributionUrl, asset.rights?.webStatement]);

  return sourceUrl ? `[${imageMarkdown}](${sourceUrl})` : imageMarkdown;
}

function renderMediaAssetCaption(asset: LodeonAsset, config: MarkdownExportConfig): string {
  const title = asset.title?.trim() ?? "";
  const caption = asset.caption?.trim() || asset.description?.trim() || "";
  const creator =
    asset.creator?.trim() || asset.credit?.trim() || asset.rights?.attributionName?.trim() || "";
  const date = asset.date?.trim() || formattedMetadataField(asset, "xmp:CreateDate");
  const source = renderCaptionSource(asset, config);
  const license =
    asset.license?.trim() || asset.rights?.license?.trim() || asset.rights?.usageTerms?.trim() || "";
  const statements = [caption, joinCaptionParts([creator, title, date, source, license])].filter(Boolean);

  if (statements.length === 0) {
    return "";
  }

  return `/// caption\n${statements.map(escapeText).join("\n")}\n///`;
}

function renderCaptionSource(asset: LodeonAsset, config: MarkdownExportConfig): string {
  const label =
    asset.source?.trim() ||
    asset.rights?.attributionName?.trim() ||
    asset.rights?.webStatement?.trim() ||
    asset.rights?.attributionUrl?.trim() ||
    "";
  const url = firstUrl([asset.source, asset.rights?.attributionUrl, asset.rights?.webStatement]);

  if (!label) {
    return "";
  }

  const linkLabel = label === url ? markdownLabel(config, "assetMetadata.source") : label;

  return url ? `[${escapeLinkLabel(linkLabel)}](${url})` : label;
}

function renderMediaAssetMetadataDetails(asset: LodeonAsset, config: MarkdownExportConfig): string {
  const rows = [
    ...renderMediaAssetFileRows(asset, config),
    ...ASSET_METADATA_TABS.flatMap((tab) =>
      tab.fields.flatMap((field) => {
        const value = readAssetMetadataField(asset, field.key);
        const formatted = formatAssetMetadataValue(value);

        return formatted
          ? [
              {
                group: markdownLabel(config, tab.labelKey),
                field: markdownLabel(config, field.labelKey),
                value: formatted
              }
            ]
          : [];
      })
    )
  ];

  if (rows.length === 0) {
    return "";
  }

  const table = [
    `| ${markdownLabel(config, "assetMetadata.group")} | ${markdownLabel(config, "assetMetadata.field")} | ${markdownLabel(config, "assetMetadata.value")} |`,
    "| --- | --- | --- |",
    ...rows.map(
      (row) =>
        `| ${escapeTableCell(row.group)} | ${escapeTableCell(row.field)} | ${escapeTableCell(row.value)} |`
    )
  ].join("\n");

  return `/// details | ${markdownLabel(config, "assetMetadata.title")}\n    type: plain\n\n${table}\n///`;
}

function renderMediaAssetFileRows(
  asset: LodeonAsset,
  config: MarkdownExportConfig
): Array<{
  group: string;
  field: string;
  value: string;
}> {
  const dimensions = asset.width && asset.height ? `${asset.width} x ${asset.height}px` : "";
  const duration = typeof asset.duration === "number" ? `${asset.duration}s` : "";

  return [
    [
      markdownLabel(config, "assetMetadata.fileGroup"),
      markdownLabel(config, "assetMetadata.originalName"),
      asset.originalName
    ],
    [
      markdownLabel(config, "assetMetadata.fileGroup"),
      markdownLabel(config, "assetMetadata.mimeType"),
      asset.mimeType
    ],
    [
      markdownLabel(config, "assetMetadata.fileGroup"),
      markdownLabel(config, "assetMetadata.size"),
      formatFileSize(asset.size)
    ],
    [
      markdownLabel(config, "assetMetadata.fileGroup"),
      markdownLabel(config, "assetMetadata.dimensions"),
      dimensions
    ],
    [
      markdownLabel(config, "assetMetadata.fileGroup"),
      markdownLabel(config, "assetMetadata.duration"),
      duration
    ]
  ].flatMap(([group, field, value]) =>
    value
      ? [
          {
            group,
            field,
            value
          }
        ]
      : []
  );
}

function formatAssetMetadataValue(value: LodeonAssetMetadataFieldValue | undefined): string {
  if (Array.isArray(value)) {
    return value
      .map((entry) => entry.trim())
      .filter(Boolean)
      .join("; ");
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    return String(value);
  }

  return String(value ?? "").trim();
}

function formattedMetadataField(asset: LodeonAsset, key: string): string {
  return formatAssetMetadataValue(readAssetMetadataField(asset, key));
}

function joinCaptionParts(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

function firstUrl(values: Array<string | undefined>): string {
  for (const value of values) {
    const match = value?.match(/https?:\/\/[^\s)\]]+/);

    if (match?.[0]) {
      return match[0];
    }
  }

  return "";
}

function formatFileSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) {
    return "";
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
