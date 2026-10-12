/** Owns the Sparnatural query-builder modal lifecycle. */

import type { SparnaturalBuilderInput, SparnaturalBuilderOutput, SparnaturalQueryJson } from "./contracts";
import type { LodeonConfig } from "../../configuration/schema";
import type { LodeonLocalization } from "../../localization/runtime";
import { createSparqlSourceEditor, type SparqlSourceEditor } from "../sparql/source-editor";

type SparnaturalQueryUpdatedEvent = CustomEvent<{
  queryString: string;
  queryJson: SparnaturalQueryJson;
  querySparqlJs?: unknown;
}>;

type SparnaturalElementApi = HTMLElement & {
  expandSparql: (query: string) => string;
  loadQuery: (query: NonNullable<SparnaturalQueryJson>) => void;
  clear: () => void;
};

type SparnaturalModalState = {
  activeAttrs: SparnaturalBuilderInput | null;
  latestSource: string;
  latestQueryJson: SparnaturalQueryJson;
  resolve: ((value: SparnaturalBuilderOutput | null) => void) | null;
};

const state: SparnaturalModalState = {
  activeAttrs: null,
  latestSource: "",
  latestQueryJson: null,
  resolve: null
};

let sparnaturalLoaded = false;
let queryPreviewEditor: SparqlSourceEditor | null = null;

export async function openSparnaturalBuilderModal(
  root: HTMLElement,
  config: LodeonConfig,
  i18n: LodeonLocalization,
  attrs: SparnaturalBuilderInput
): Promise<SparnaturalBuilderOutput | null> {
  await ensureSparnaturalLoaded();

  const modal = root.querySelector<HTMLElement>("[data-sparnatural-modal]");
  const host = root.querySelector<HTMLElement>("[data-sparnatural-host]");
  const preview = root.querySelector<HTMLElement>("[data-sparnatural-query-preview]");
  const status = root.querySelector<HTMLElement>("[data-sparnatural-status]");
  const configDefinition = config.nodes.sparql.profiles[attrs.configId];
  const knowledgeGraphProfile =
    config.knowledgeGraph.profiles.find((entry) => entry.id === attrs.knowledgeGraphProfileId) ??
    config.knowledgeGraph.profiles.find((entry) => entry.id === config.knowledgeGraph.defaultProfile) ??
    config.knowledgeGraph.profiles[0];

  if (!modal || !host || !configDefinition || !knowledgeGraphProfile) {
    return null;
  }

  state.activeAttrs = attrs;
  state.latestSource = attrs.source ?? "";
  state.latestQueryJson = attrs.queryJson ?? null;
  const text = (key: string) => i18n.t("editor", key);

  queryPreviewEditor = createQueryPreviewEditor(preview, state.latestSource, text);
  setStatus(status, text("modal.sparnatural.loading"));

  host.innerHTML = "";
  const element = document.createElement("spar-natural") as SparnaturalElementApi;

  element.setAttribute("src", withCacheBuster(configDefinition.configURL));
  element.setAttribute("endpoint", knowledgeGraphProfile.sparqlUrl);
  element.setAttribute("lang", "en");
  element.setAttribute("defaultLang", "en");
  element.setAttribute("distinct", "true");
  element.setAttribute("limit", "100");
  element.setAttribute("submitButton", "false");

  element.addEventListener("init", () => {
    setStatus(status, text("modal.sparnatural.ready"));

    if (state.latestQueryJson) {
      window.setTimeout(() => {
        try {
          element.loadQuery(state.latestQueryJson as NonNullable<SparnaturalQueryJson>);
        } catch {
          setStatus(status, text("modal.sparnatural.restoreFailed"));
        }
      }, 0);
    }
  });

  element.addEventListener("queryUpdated", (event) => {
    const detail = (event as SparnaturalQueryUpdatedEvent).detail;
    const source = element.expandSparql(detail.queryString);

    state.latestSource = source;
    state.latestQueryJson = detail.queryJson;
    previewQuery(source);
    setStatus(status, text("modal.sparnatural.updated"));
  });

  element.addEventListener("reset", () => {
    state.latestSource = "";
    state.latestQueryJson = null;
    previewQuery("");
    setStatus(status, text("modal.sparnatural.cleared"));
  });

  host.append(element);
  modal.hidden = false;

  return new Promise((resolve) => {
    state.resolve = resolve;
  });
}

export function bindSparnaturalBuilderModal(root: HTMLElement): void {
  root.querySelector<HTMLButtonElement>("[data-sparnatural-save]")?.addEventListener("click", () => {
    closeSparnaturalModal(root, {
      source: state.latestSource,
      queryJson: state.latestQueryJson,
      configId: state.activeAttrs?.configId,
      knowledgeGraphProfileId: state.activeAttrs?.knowledgeGraphProfileId
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-sparnatural-cancel]").forEach((button) =>
    button.addEventListener("click", () => {
      closeSparnaturalModal(root, null);
    })
  );
}

async function ensureSparnaturalLoaded(): Promise<void> {
  if (sparnaturalLoaded) {
    return;
  }

  await import("sparnatural/dist/browser");
  sparnaturalLoaded = true;
}

function withCacheBuster(path: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}v=${Date.now()}`;
}

function closeSparnaturalModal(root: HTMLElement, output: SparnaturalBuilderOutput | null): void {
  const modal = root.querySelector<HTMLElement>("[data-sparnatural-modal]");
  const host = root.querySelector<HTMLElement>("[data-sparnatural-host]");
  const resolve = state.resolve;

  if (modal) {
    modal.hidden = true;
  }

  if (host) {
    host.innerHTML = "";
  }

  queryPreviewEditor?.destroy();
  queryPreviewEditor = null;

  state.activeAttrs = null;
  state.latestSource = "";
  state.latestQueryJson = null;
  state.resolve = null;
  resolve?.(output);
}

function createQueryPreviewEditor(
  preview: HTMLElement | null,
  source: string,
  text: (key: string) => string
): SparqlSourceEditor | null {
  if (!preview) {
    return null;
  }

  preview.innerHTML = "";
  const editor = createSparqlSourceEditor({
    value: source.trim(),
    className: "ld-sparnatural-query-preview-editor",
    ariaLabel: text("modal.sparnatural.generatedQueryAria"),
    placeholder: text("modal.sparnatural.generatedQueryPlaceholder")
  });

  editor.onChange((value) => {
    state.latestSource = value.trim();
    state.latestQueryJson = null;
  });
  preview.append(editor.element);
  return editor;
}

function previewQuery(source: string): void {
  if (!queryPreviewEditor) {
    return;
  }

  queryPreviewEditor.setValue(source.trim());
}

function setStatus(status: HTMLElement | null, message: string): void {
  if (status) {
    status.textContent = message;
  }
}
