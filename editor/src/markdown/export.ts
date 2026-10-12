/** Maps canonical ProseMirror content to configured Markdown output. */

import type { JSONContent } from "@tiptap/core";
import { LodeonClientError } from "../errors/client-error";
import { buildRendererTemplateContext, renderRendererTemplate } from "./templates";
import type { MarkdownExportConfig, RendererContainerMapping, RendererSpecialNodeMapping } from "./contracts";
import { renderProjectFrontMatter } from "./front-matter";
import { renderImage, renderMediaAsset } from "./media-renderer";
import { buildStoryMetadataTemplateValues } from "./story-metadata";
import {
  escapeHtml,
  escapeHtmlAttribute,
  escapeTableCell,
  escapeText,
  markdownLabel
} from "./text-presentation";

/**
 * Projects canonical ProseMirror JSON through the active renderer mappings.
 * Unsupported mappings fail explicitly; this function never invents fallback
 * renderer behavior or mutates the source project.
 */
export function exportProjectMarkdown(document: JSONContent, config: MarkdownExportConfig): string {
  const markdown = renderBlocks(document.content ?? [], config).trim();
  const frontMatter = renderProjectFrontMatter(config);

  return `${frontMatter}${markdown}\n`;
}

function renderBlocks(nodes: JSONContent[], config: MarkdownExportConfig, depth = 0): string {
  return nodes
    .map((node) => renderBlock(node, config, depth))
    .filter((block) => block.length > 0)
    .join("\n\n");
}

function renderBlock(node: JSONContent, config: MarkdownExportConfig, depth: number): string {
  if (node.attrs?.excludeFromRender === true) {
    return "";
  }

  const nodeConfig = node.type ? config.rendererEngine.specialNodeMappings[node.type] : undefined;

  if (nodeConfig) {
    if (nodeConfig.strategy === "mediaReference" && node.type === "mediaAssetNode") {
      return renderMediaAsset(node, config);
    }

    return renderConfiguredNode(node, nodeConfig, config);
  }

  switch (node.type) {
    case undefined:
      return renderInline(node, config);
    case "heading":
      return renderBlockFormat(
        node,
        `${"#".repeat(Number(node.attrs?.level ?? 1))} ${renderInline(node, config)}`,
        config
      );
    case "paragraph":
      return renderBlockFormat(node, renderInline(node, config), config);
    case "blockquote":
      return renderBlocks(node.content ?? [], config, depth)
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    case "bulletList":
      return renderList(node, "- ", config, depth);
    case "orderedList":
      return renderList(node, "1. ", config, depth);
    case "listItem":
      return renderBlocks(node.content ?? [], config, depth);
    case "semanticContainer":
      return renderSemanticContainer(node, config, depth);
    case "codeBlock":
      return renderCodeBlock(String(node.attrs?.language ?? ""), renderText(node));
    case "horizontalRule":
      return "---";
    case "image":
      return renderImage(node);
    case "mediaAssetNode":
      return renderMediaAsset(node, config);
    case "table":
      return renderTable(node, config);
    default:
      return renderInline(node, config);
  }
}

function renderSemanticContainer(node: JSONContent, config: MarkdownExportConfig, depth: number): string {
  const containerId = String(node.attrs?.semanticContainer ?? "");
  const mapping = containerId ? config.rendererEngine.containerMappings?.[containerId] : undefined;
  const content = renderBlocks(node.content ?? [], config, depth);

  if (!mapping) {
    throw new LodeonClientError("markdown.container_mapping_missing", {
      containerId
    });
  }

  if (mapping.strategy === "pymdownxBlock") {
    return renderPymdownxBlock(node, mapping, content);
  }

  if (mapping.strategy === "htmlBlock") {
    return renderHtmlBlock(mapping, content);
  }

  if (mapping.strategy === "htmlDetails") {
    return renderHtmlDetails(node, mapping, content, config);
  }

  if (mapping.strategy === "template") {
    return renderRendererTemplate(
      mapping,
      config,
      buildRendererTemplateContext({
        node,
        config,
        renderedContent: content,
        text: renderText(node),
        values: {
          containerId,
          content
        }
      })
    );
  }

  throw new LodeonClientError("markdown.container_strategy_unsupported", {
    containerId,
    strategy: mapping.strategy
  });
}

function renderPymdownxBlock(node: JSONContent, mapping: RendererContainerMapping, content: string): string {
  const block = mapping.block ?? "html";
  const title = mapping.titleAttribute ? String(node.attrs?.[mapping.titleAttribute] ?? "").trim() : "";
  const headerParts = [`/// ${block}`, mapping.argument || title ? " | " : "", mapping.argument || title];
  const options = renderPymdownxOptions(node, mapping);
  const body = [options, content].filter(Boolean).join(options ? "\n\n" : "");

  return `${headerParts.join("")}\n${body}\n///`;
}

function renderPymdownxOptions(node: JSONContent, mapping: RendererContainerMapping): string {
  const rows = Object.entries(mapping.options ?? {}).map(([key, value]) => `    ${key}: ${String(value)}`);

  if (mapping.openAttribute && node.attrs?.[mapping.openAttribute] === true) {
    rows.push("    open: true");
  }

  return rows.join("\n");
}

function renderHtmlBlock(mapping: RendererContainerMapping, content: string): string {
  const tag = mapping.tag || "div";
  const attributes = renderHtmlAttributes(mapping.attributes ?? {});

  return `<${tag}${attributes ? ` ${attributes}` : ""}>\n\n${content}\n\n</${tag}>`;
}

function renderHtmlDetails(
  node: JSONContent,
  mapping: RendererContainerMapping,
  content: string,
  config: MarkdownExportConfig
): string {
  const summary = mapping.summaryAttribute
    ? String(node.attrs?.[mapping.summaryAttribute] ?? markdownLabel(config, "details.summary")).trim()
    : markdownLabel(config, "details.summary");
  const open = mapping.openAttribute && node.attrs?.[mapping.openAttribute] === true ? " open" : "";

  return `<details${open}>\n<summary>${escapeHtml(summary || markdownLabel(config, "details.summary"))}</summary>\n\n${content}\n\n</details>`;
}

function renderList(node: JSONContent, marker: string, config: MarkdownExportConfig, depth: number): string {
  const indent = "  ".repeat(depth);

  return (node.content ?? [])
    .map((item) => {
      const content = renderBlock(item, config, depth + 1).replace(/\n/g, `\n${indent}  `);
      return `${indent}${marker}${content}`;
    })
    .join("\n");
}

function renderBlockFormat(node: JSONContent, markdown: string, config: MarkdownExportConfig): string {
  const formatId = String(node.attrs?.semanticFormat ?? "");
  const mapping = formatId ? config.rendererEngine.formatMappings?.[formatId] : undefined;

  if (!formatId) {
    return markdown;
  }

  if (!mapping) {
    throw new LodeonClientError("markdown.format_mapping_missing", {
      formatId
    });
  }

  if (mapping.strategy === "template") {
    return renderRendererTemplate(
      mapping,
      config,
      buildRendererTemplateContext({
        node,
        config,
        renderedContent: markdown,
        text: renderText(node),
        values: {
          formatId,
          content: markdown
        }
      })
    );
  }

  if (mapping.strategy !== "attrList") {
    throw new LodeonClientError("markdown.block_format_strategy_unsupported", {
      formatId,
      strategy: mapping.strategy
    });
  }

  const attributes = renderMarkdownAttributes(mapping.attributes ?? {});
  return attributes ? `${markdown}\n{: ${attributes}}` : markdown;
}

function renderInline(node: JSONContent, config: MarkdownExportConfig): string {
  return (node.content ?? []).map((child) => renderInlineNode(child, config)).join("");
}

function renderInlineNode(node: JSONContent, config: MarkdownExportConfig): string {
  if (node.type === "text") {
    return applyMarks(escapeText(node.text ?? ""), node.marks ?? [], config);
  }

  if (node.type === "hardBreak") {
    return "  \n";
  }

  return renderInline(node, config);
}

function applyMarks(
  text: string,
  marks: NonNullable<JSONContent["marks"]>,
  config: MarkdownExportConfig
): string {
  return marks.reduce((value, mark) => {
    if (mark.type === "bold") {
      return `**${value}**`;
    }
    if (mark.type === "italic") {
      return `_${value}_`;
    }
    if (mark.type === "underline") {
      return `<u>${value}</u>`;
    }
    if (mark.type === "strike") {
      return `~~${value}~~`;
    }
    if (mark.type === "code") {
      return `\`${value}\``;
    }
    if (mark.type === "link" && mark.attrs?.href) {
      return `[${value}](${mark.attrs.href})`;
    }
    if (mark.type === "semanticInlineFormat") {
      return renderSemanticInlineFormat(value, mark, config);
    }
    return value;
  }, text);
}

function renderSemanticInlineFormat(
  value: string,
  mark: NonNullable<JSONContent["marks"]>[number],
  config: MarkdownExportConfig
): string {
  const formatId = String(mark.attrs?.format ?? "");
  const mapping = formatId ? config.rendererEngine.formatMappings?.[formatId] : undefined;

  if (!formatId) {
    return value;
  }

  if (!mapping) {
    throw new LodeonClientError("markdown.format_mapping_missing", {
      formatId
    });
  }

  if (mapping.strategy === "template") {
    return renderRendererTemplate(
      mapping,
      config,
      buildRendererTemplateContext({
        node: {
          type: "text",
          text: value,
          attrs: mark.attrs
        },
        config,
        renderedContent: value,
        text: value,
        values: {
          formatId,
          content: value
        }
      })
    );
  }

  if (mapping.strategy !== "htmlSpan") {
    throw new LodeonClientError("markdown.inline_format_strategy_unsupported", {
      formatId,
      strategy: mapping.strategy
    });
  }

  const tag = mapping.tag || "span";
  const attributes = renderHtmlAttributes(mapping.attributes ?? {});
  return `<${tag}${attributes ? ` ${attributes}` : ""}>${value}</${tag}>`;
}

function renderTable(node: JSONContent, config: MarkdownExportConfig): string {
  const rows = node.content ?? [];
  const renderedRows = rows.map((row) => (row.content ?? []).map((cell) => renderInlineCell(cell, config)));
  const columnCount = Math.max(0, ...renderedRows.map((row) => row.length));

  if (columnCount === 0) {
    return "";
  }

  const normalizedRows = renderedRows.map((row) =>
    Array.from({ length: columnCount }, (_, index) => escapeTableCell(row[index] ?? ""))
  );
  const [firstRow = []] = normalizedRows;
  const header = `| ${firstRow.join(" | ")} |`;
  const divider = `| ${Array.from({ length: columnCount }, () => "---").join(" | ")} |`;
  const body = normalizedRows
    .slice(1)
    .map((row) => `| ${row.join(" | ")} |`)
    .join("\n");

  return [header, divider, body].filter(Boolean).join("\n");
}

function renderInlineCell(node: JSONContent, config: MarkdownExportConfig): string {
  return (node.content ?? [])
    .map((child) => {
      if (child.type === "paragraph") {
        return renderInline(child, config);
      }

      return renderBlock(child, config, 0).replace(/\n/g, "<br>");
    })
    .join("<br>");
}

function renderText(node: JSONContent): string {
  if (node.text) {
    return node.text;
  }

  return (node.content ?? []).map(renderText).join("");
}

function renderCodeBlock(language: string, source: string): string {
  return `\`\`\`${language}\n${source}\n\`\`\``;
}

function renderConfiguredNode(
  node: JSONContent,
  nodeConfig: RendererSpecialNodeMapping,
  config: MarkdownExportConfig
): string {
  if (nodeConfig.strategy === "template") {
    return renderRendererTemplate(
      nodeConfig,
      config,
      buildRendererTemplateContext({
        node,
        config,
        text: renderText(node),
        values: node.type === "storyMetadataNode" ? buildStoryMetadataTemplateValues(node, config) : undefined
      })
    );
  }

  if (nodeConfig.strategy !== "fencedCode") {
    throw new LodeonClientError("markdown.special_node_strategy_unsupported", {
      strategy: nodeConfig.strategy
    });
  }

  const rawSource = node.attrs?.[nodeConfig.contentAttribute ?? ""] ?? "";
  const source = typeof rawSource === "string" ? rawSource : JSON.stringify(rawSource, null, 2);
  const attributes = Object.entries(nodeConfig.attributes ?? {})
    .map(([markdownName, nodeAttribute]) => {
      const value = escapeMarkdownAttribute(String(node.attrs?.[nodeAttribute] ?? ""));

      return value ? `${markdownName}="${value}"` : "";
    })
    .filter(Boolean)
    .join(" ");
  const info = attributes ? `${nodeConfig.fence} {${attributes}}` : nodeConfig.fence;

  return `\`\`\`${info}\n${source}\n\`\`\``;
}

function escapeMarkdownAttribute(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[\r\n\t]+/g, " ");
}

function renderMarkdownAttributes(attributes: Record<string, string[]>): string {
  return Object.entries(attributes)
    .flatMap(([name, values]) => {
      const cleanValues = values.map((value) => String(value).trim()).filter(Boolean);
      if (name === "class") {
        return cleanValues.map((value) => `.${value}`);
      }
      return cleanValues.map((value) => `${name}="${value.replace(/"/g, '\\"')}"`);
    })
    .join(" ");
}

function renderHtmlAttributes(attributes: Record<string, string[]>): string {
  return Object.entries(attributes)
    .flatMap(([name, values]) => {
      const cleanValues = values.map((value) => String(value).trim()).filter(Boolean);
      if (!cleanValues.length) {
        return [];
      }
      return `${name}="${escapeHtmlAttribute(cleanValues.join(" "))}"`;
    })
    .join(" ");
}
