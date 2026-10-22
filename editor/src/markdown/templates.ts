/** Owns the controlled Handlebars context, helper set, and template rendering boundary. */

import type { JSONContent } from "@tiptap/core";
import Handlebars from "handlebars";
import YAML from "yaml";
import { LodeonClientError } from "../errors/client-error";
import type { LodeonProject } from "../project/contracts";
import type {
  MarkdownExportConfig,
  RendererContainerMapping,
  RendererFormatMapping,
  RendererSpecialNodeMapping
} from "./contracts";

export type RendererTemplateMapping =
  | RendererSpecialNodeMapping
  | RendererContainerMapping
  | RendererFormatMapping;

export type RendererTemplateContext = {
  project: {
    id?: string;
    title?: string;
    slug?: string;
    metadata?: LodeonProject["metadata"];
    published?: LodeonProject["published"];
    createdAt?: string;
    updatedAt?: string;
  };
  runtime: {
    metadataPanel?: MarkdownExportConfig["metadataPanel"];
    labels?: MarkdownExportConfig["markdownLabels"];
  };
  node: {
    type?: string;
    attrs: Record<string, unknown>;
    id?: string;
    kind?: string;
  };
  document: {
    node: JSONContent;
    attrs: Record<string, unknown>;
    content: JSONContent[];
    text: string;
    renderedContent: string;
  };
  values: Record<string, unknown>;
};

/**
 * Renders a configured template with a fresh, controlled Handlebars runtime.
 * Only registered helpers are available; templates cannot execute JavaScript
 * or access files, environment variables, or application secrets.
 */
export function renderRendererTemplate(
  mapping: RendererTemplateMapping,
  config: MarkdownExportConfig,
  context: RendererTemplateContext
): string {
  const templateId = mapping.template;

  if (!templateId) {
    throw new LodeonClientError("markdown.template_missing");
  }

  const templateSource = config.rendererEngine.templates?.[templateId];

  if (typeof templateSource !== "string") {
    throw new LodeonClientError("markdown.template_missing", {
      template: templateId
    });
  }

  try {
    return createHandlebarsRuntime().compile(templateSource)(context).trim();
  } catch (error) {
    throw new LodeonClientError(
      "markdown.template_render_failed",
      {
        template: templateId,
        externalError: error instanceof Error ? error.message : String(error)
      },
      { cause: error }
    );
  }
}

/**
 * Builds the JSON-compatible renderer contract shared by browser export,
 * Preview, and Publish without embedding package-specific display policy.
 */
export function buildRendererTemplateContext(options: {
  node: JSONContent;
  config: MarkdownExportConfig;
  renderedContent?: string;
  text?: string;
  values?: Record<string, unknown>;
}): RendererTemplateContext {
  const attrs = isRecord(options.node.attrs) ? options.node.attrs : {};
  const project = options.config.project;
  const renderedContent = options.renderedContent ?? "";

  return {
    project: buildProjectContext(project),
    runtime: {
      metadataPanel: options.config.metadataPanel,
      labels: options.config.markdownLabels
    },
    node: {
      type: options.node.type,
      attrs,
      id: stringValue(attrs.id),
      kind: stringValue(attrs.kind)
    },
    document: {
      node: options.node,
      attrs,
      content: options.node.content ?? [],
      text: options.text ?? "",
      renderedContent
    },
    values: {
      renderedContent,
      ...(options.values ?? {})
    }
  };
}

function createHandlebarsRuntime(): typeof Handlebars {
  const runtime = Handlebars.create();

  runtime.registerHelper("eq", (left: unknown, right: unknown) => left === right);
  runtime.registerHelper("not", (value: unknown) => !value);
  runtime.registerHelper("and", (...args: unknown[]) => args.slice(0, -1).every((value) => Boolean(value)));
  runtime.registerHelper("or", (...args: unknown[]) => args.slice(0, -1).some((value) => Boolean(value)));
  runtime.registerHelper("has", (value: unknown) => {
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (isRecord(value)) {
      return Object.keys(value).length > 0;
    }
    return Boolean(value);
  });
  runtime.registerHelper("length", (value: unknown) => {
    if (Array.isArray(value) || typeof value === "string") {
      return value.length;
    }
    if (isRecord(value)) {
      return Object.keys(value).length;
    }
    return 0;
  });
  runtime.registerHelper("join", (value: unknown, separator: unknown) => {
    const resolvedSeparator = isHandlebarsOptions(separator) ? ", " : String(separator ?? ", ");
    return Array.isArray(value) ? value.map((entry) => String(entry)).join(resolvedSeparator) : "";
  });
  runtime.registerHelper("where", (value: unknown, path: unknown, expected: unknown) => {
    if (!Array.isArray(value) || typeof path !== "string") {
      return [];
    }

    return value.filter((entry) => readPath(entry, path) === expected);
  });
  runtime.registerHelper("groupBy", (value: unknown, path: unknown) => {
    if (!Array.isArray(value) || typeof path !== "string") {
      return [];
    }

    const groups = new Map<string, unknown[]>();
    for (const entry of value) {
      const key = String(readPath(entry, path) ?? "");
      const items = groups.get(key) ?? [];
      items.push(entry);
      groups.set(key, items);
    }

    return Array.from(groups.entries()).map(([key, items]) => ({ key, items }));
  });
  runtime.registerHelper("uniqueBy", (value: unknown, path: unknown) => {
    if (!Array.isArray(value) || typeof path !== "string") {
      return [];
    }

    const seen = new Set<string>();
    const uniqueValues: unknown[] = [];

    for (const entry of value) {
      const resolved = readPath(entry, path);
      const key = String(resolved ?? "").trim();

      if (!key || seen.has(key)) {
        continue;
      }

      seen.add(key);
      uniqueValues.push(resolved);
    }

    return uniqueValues;
  });
  runtime.registerHelper("positionOf", (value: unknown, expected: unknown) => {
    if (!Array.isArray(value)) {
      return 0;
    }

    const index = value.findIndex((entry) => entry === expected);

    return index >= 0 ? index + 1 : 0;
  });
  runtime.registerHelper("date", (value: unknown) => formatDate(value, false));
  runtime.registerHelper("dateOnly", (value: unknown) => formatDate(value, true));
  runtime.registerHelper(
    "fileName",
    (value: unknown) =>
      String(value ?? "")
        .split(/[\\/]/)
        .filter(Boolean)
        .pop() ?? ""
  );
  runtime.registerHelper(
    "escapeHtml",
    (value: unknown) => new runtime.SafeString(escapeHtml(String(value ?? "")))
  );
  runtime.registerHelper(
    "escapeAttribute",
    (value: unknown) => new runtime.SafeString(escapeHtmlAttribute(String(value ?? "")))
  );
  runtime.registerHelper("json", (value: unknown) => new runtime.SafeString(JSON.stringify(value, null, 2)));
  runtime.registerHelper("yaml", (value: unknown) => new runtime.SafeString(YAML.stringify(value).trimEnd()));
  runtime.registerHelper("indent", (value: unknown, size: unknown) => {
    const resolvedSize = isHandlebarsOptions(size) ? 2 : Number(size);
    const prefix = " ".repeat(Math.max(0, Number.isFinite(resolvedSize) ? resolvedSize : 2));
    return String(value ?? "")
      .split("\n")
      .map((line) => (line ? `${prefix}${line}` : line))
      .join("\n");
  });
  runtime.registerHelper("renderChildren", function renderChildren(this: RendererTemplateContext) {
    return new runtime.SafeString(this.document?.renderedContent ?? "");
  });

  return runtime;
}

function buildProjectContext(project: LodeonProject | undefined): RendererTemplateContext["project"] {
  if (!project) {
    return {};
  }

  return {
    id: project.id,
    title: project.title,
    slug: project.slug,
    metadata: project.metadata,
    published: project.published,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readPath(value: unknown, path: string): unknown {
  return path
    .split(".")
    .filter(Boolean)
    .reduce<unknown>((current, segment) => (isRecord(current) ? current[segment] : undefined), value);
}

function isHandlebarsOptions(value: unknown): boolean {
  return isRecord(value) && isRecord(value.hash);
}

function formatDate(value: unknown, dateOnly: boolean): string {
  const date = new Date(String(value ?? ""));

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return dateOnly ? date.toISOString().slice(0, 10) : date.toISOString();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
