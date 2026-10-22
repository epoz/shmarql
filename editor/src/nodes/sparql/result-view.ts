/** Renders SPARQL results with exact count and page disclosure. */

import type { SparqlExecutionResult } from "./api-client";
import type { LodeonConfig } from "../../configuration/schema";
import { renderConfiguredErrorCode } from "../../errors/client-error";
import { markNodeViewControl, translateSpecialNodeText } from "../shared/node-view-controls";

const RESULT_PAGE_SIZES = [10, 50, 100, 500, 1000, "All"] as const;

export type SparqlResultPageSize = (typeof RESULT_PAGE_SIZES)[number];

export type SparqlResultViewOptions = {
  pageSize?: SparqlResultPageSize;
  onPageSizeChange?: (pageSize: SparqlResultPageSize) => void;
  onVisibleRowIndexesChange?: (rowIndexes: number[]) => void;
  onRowIndexesChange?: (state: { filteredRowIndexes: number[]; visibleRowIndexes: number[] }) => void;
  requestedVisibleRowIndex?: number | null;
  errors?: LodeonConfig["errors"];
};

type SparqlResultViewState = {
  page: number;
  search: string;
};

const resultViewStates = new WeakMap<HTMLElement, SparqlResultViewState>();

function formatBinding(value: { value: string; type: string } | null): string {
  return value?.value ?? "";
}

export function renderSparqlResult(
  footer: HTMLElement,
  resultContainer: HTMLElement,
  result: SparqlExecutionResult | null,
  options: SparqlResultViewOptions = {}
): void {
  if (!resultContainer.dataset.lodeonNodeControl) {
    markNodeViewControl(resultContainer);
  }

  const state = getResultViewState(resultContainer);

  resultContainer.innerHTML = "";

  if (!result) {
    options.onVisibleRowIndexesChange?.([]);
    options.onRowIndexesChange?.({ filteredRowIndexes: [], visibleRowIndexes: [] });
    footer.textContent = translateSpecialNodeText("status.runQueryPreview");
    return;
  }

  if (result.status === "error") {
    options.onVisibleRowIndexesChange?.([]);
    options.onRowIndexesChange?.({ filteredRowIndexes: [], visibleRowIndexes: [] });
    footer.textContent = translateSpecialNodeText("status.queryFailed", {
      durationMs: result.durationMs
    });
    resultContainer.innerHTML = `<div class="ld-sparql-error"></div>`;
    const error = resultContainer.querySelector<HTMLElement>(".ld-sparql-error");

    if (error) {
      error.textContent = renderConfiguredErrorCode(options.errors, result.code, result.variables);
    }
    return;
  }

  const pageSize = normalizePageSize(options.pageSize);

  if (typeof result.boolean === "boolean") {
    options.onVisibleRowIndexesChange?.([]);
    options.onRowIndexesChange?.({ filteredRowIndexes: [], visibleRowIndexes: [] });
    footer.textContent = translateSpecialNodeText("status.askResult", {
      durationMs: result.durationMs
    });
    resultContainer.innerHTML = `<div class="ld-sparql-boolean"></div>`;
    const booleanResult = resultContainer.querySelector<HTMLElement>(".ld-sparql-boolean");

    if (booleanResult) {
      booleanResult.textContent = result.boolean ? "true" : "false";
    }
    return;
  }

  if (result.variables.length === 0) {
    options.onVisibleRowIndexesChange?.([]);
    options.onRowIndexesChange?.({ filteredRowIndexes: [], visibleRowIndexes: [] });
    resultContainer.innerHTML = `<div class="ld-sparql-empty"></div>`;
    const empty = resultContainer.querySelector<HTMLElement>(".ld-sparql-empty");

    if (empty) {
      empty.textContent = translateSpecialNodeText("status.noResultColumns");
    }
    return;
  }

  const successResult = result;
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");
  const headerRow = document.createElement("tr");
  const toolbar = document.createElement("div");
  const pageSizeLabel = document.createElement("label");
  const pageSizeSelect = markNodeViewControl(document.createElement("select"));
  const searchLabel = document.createElement("label");
  const searchInput = markNodeViewControl(document.createElement("input"));
  const downloadButton = markNodeViewControl(document.createElement("button"));
  const pager = document.createElement("div");
  const previousButton = markNodeViewControl(document.createElement("button"));
  const nextButton = markNodeViewControl(document.createElement("button"));
  const pageLabel = document.createElement("label");
  const pageInput = markNodeViewControl(document.createElement("input"));
  const pageText = document.createElement("span");
  let currentPageSize = pageSize;
  let requestedVisibleRowIndex = options.requestedVisibleRowIndex;

  toolbar.className = "ld-sparql-table-toolbar";
  pageSizeLabel.className = "ld-sparql-table-control";
  searchLabel.className = "ld-sparql-table-control ld-sparql-table-search";
  downloadButton.className = "ld-sparql-table-download";
  pager.className = "ld-sparql-table-pager";
  previousButton.className = "ld-sparql-table-page-button";
  nextButton.className = "ld-sparql-table-page-button";
  pageLabel.className = "ld-sparql-table-control";
  pageText.className = "ld-sparql-table-page-text";

  table.className = "ld-sparql-table";
  pageSizeLabel.textContent = translateSpecialNodeText("fields.rows");
  searchLabel.textContent = translateSpecialNodeText("fields.search");
  pageLabel.textContent = translateSpecialNodeText("fields.page");
  searchInput.type = "search";
  searchInput.value = state.search;
  searchInput.placeholder = translateSpecialNodeText("status.filterResults");
  searchInput.setAttribute("aria-label", translateSpecialNodeText("aria.filterSparqlResults"));
  downloadButton.type = "button";
  downloadButton.textContent = translateSpecialNodeText("status.downloadCsv");
  downloadButton.title = translateSpecialNodeText("aria.downloadFilteredCsv");
  downloadButton.setAttribute("aria-label", translateSpecialNodeText("aria.downloadSparqlCsv"));
  previousButton.type = "button";
  previousButton.textContent = translateSpecialNodeText("status.previous");
  previousButton.setAttribute("aria-label", translateSpecialNodeText("aria.previousSparqlResultPage"));
  nextButton.type = "button";
  nextButton.textContent = translateSpecialNodeText("status.next");
  nextButton.setAttribute("aria-label", translateSpecialNodeText("aria.nextSparqlResultPage"));
  pageInput.type = "number";
  pageInput.min = "1";
  pageInput.setAttribute("aria-label", translateSpecialNodeText("aria.sparqlResultPage"));

  RESULT_PAGE_SIZES.forEach((entry) => {
    const option = document.createElement("option");

    option.value = String(entry);
    option.textContent = String(entry);
    pageSizeSelect.append(option);
  });
  pageSizeSelect.value = String(pageSize);

  pageSizeSelect.addEventListener("change", () => {
    const nextPageSize = parsePageSize(pageSizeSelect.value);
    currentPageSize = nextPageSize;
    state.page = 1;
    options.onPageSizeChange?.(nextPageSize);
    updateRows();
  });

  searchInput.addEventListener("input", () => {
    state.search = searchInput.value;
    state.page = 1;
    updateRows();
  });

  downloadButton.addEventListener("click", () => {
    downloadCsv(successResult.variables, filterRows(successResult, state.search));
  });

  previousButton.addEventListener("click", () => {
    state.page = Math.max(1, state.page - 1);
    updateRows();
  });

  nextButton.addEventListener("click", () => {
    const totalPages = getTotalPages(successResult, state.search, currentPageSize);

    state.page = Math.min(totalPages, state.page + 1);
    updateRows();
  });

  pageInput.addEventListener("change", () => {
    const nextPage = Number.parseInt(pageInput.value, 10);

    if (Number.isFinite(nextPage)) {
      const totalPages = getTotalPages(successResult, state.search, currentPageSize);

      state.page = Math.min(Math.max(nextPage, 1), totalPages);
      updateRows();
    }
  });

  pageSizeLabel.append(pageSizeSelect);
  searchLabel.append(searchInput);
  toolbar.append(pageSizeLabel, searchLabel, downloadButton);
  pageLabel.append(pageInput);
  pager.append(previousButton, pageLabel, nextButton, pageText);

  successResult.variables.forEach((variable) => {
    const th = document.createElement("th");
    th.textContent = variable;
    headerRow.append(th);
  });

  thead.append(headerRow);
  table.append(thead, tbody);
  resultContainer.append(toolbar);
  resultContainer.append(table);
  resultContainer.append(pager);

  updateRows();

  function updateRows(): void {
    const filteredRowIndexes = filterRowIndexes(successResult, state.search);
    const totalPages =
      currentPageSize === "All" ? 1 : Math.max(1, Math.ceil(filteredRowIndexes.length / currentPageSize));

    if (requestedVisibleRowIndex !== null && requestedVisibleRowIndex !== undefined) {
      const filteredPosition = filteredRowIndexes.indexOf(requestedVisibleRowIndex);
      if (filteredPosition >= 0 && currentPageSize !== "All") {
        state.page = Math.floor(filteredPosition / currentPageSize) + 1;
      }
      requestedVisibleRowIndex = null;
    }

    state.page = Math.min(Math.max(state.page, 1), totalPages);

    const startIndex = currentPageSize === "All" ? 0 : (state.page - 1) * currentPageSize;
    const visibleRowIndexes =
      currentPageSize === "All"
        ? filteredRowIndexes
        : filteredRowIndexes.slice(startIndex, startIndex + currentPageSize);
    const visibleRows = visibleRowIndexes.map((index) => successResult.rows[index]);
    const endIndex = startIndex + visibleRowIndexes.length;
    const originalRowLabel =
      successResult.rows.length === 1
        ? translateSpecialNodeText("status.row")
        : translateSpecialNodeText("status.rows");
    const filteredSuffix =
      filteredRowIndexes.length === successResult.rows.length
        ? ""
        : translateSpecialNodeText("status.filteredRowsSuffix", {
            count: filteredRowIndexes.length
          });

    footer.textContent = translateSpecialNodeText("status.resultSummary", {
      count: successResult.rows.length,
      rowLabel: originalRowLabel,
      filteredSuffix,
      durationMs: successResult.durationMs
    });
    previousButton.disabled = state.page <= 1 || currentPageSize === "All";
    nextButton.disabled = state.page >= totalPages || currentPageSize === "All";
    pageInput.max = String(totalPages);
    pageInput.value = String(state.page);
    pageInput.disabled = currentPageSize === "All";
    pageText.textContent =
      currentPageSize === "All"
        ? translateSpecialNodeText("status.showingAllRows", {
            count: filteredRowIndexes.length
          })
        : translateSpecialNodeText("status.showingRows", {
            start: filteredRowIndexes.length ? startIndex + 1 : 0,
            end: endIndex,
            count: filteredRowIndexes.length
          });

    tbody.replaceChildren();
    options.onVisibleRowIndexesChange?.([...visibleRowIndexes]);
    options.onRowIndexesChange?.({
      filteredRowIndexes: [...filteredRowIndexes],
      visibleRowIndexes: [...visibleRowIndexes]
    });

    visibleRows.forEach((row) => {
      const tr = document.createElement("tr");

      successResult.variables.forEach((variable) => {
        const td = document.createElement("td");
        const value = row[variable];

        if (value?.type === "uri") {
          const link = document.createElement("a");
          link.href = value.value;
          link.textContent = value.value;
          link.target = "_blank";
          link.rel = "noreferrer";
          td.append(link);
        } else {
          td.textContent = formatBinding(value);
        }

        tr.append(td);
      });

      tbody.append(tr);
    });
  }
}

function getResultViewState(container: HTMLElement): SparqlResultViewState {
  const existing = resultViewStates.get(container);

  if (existing) {
    return existing;
  }

  const state = { page: 1, search: "" };

  resultViewStates.set(container, state);
  return state;
}

function normalizePageSize(value: SparqlResultPageSize | undefined): SparqlResultPageSize {
  return RESULT_PAGE_SIZES.includes(value ?? 10) ? (value ?? 10) : 10;
}

function parsePageSize(value: string): SparqlResultPageSize {
  if (value === "All") {
    return "All";
  }

  const parsed = Number.parseInt(value, 10);

  return RESULT_PAGE_SIZES.includes(parsed as SparqlResultPageSize) ? (parsed as SparqlResultPageSize) : 10;
}

function filterRows(result: Extract<SparqlExecutionResult, { status: "success" }>, search: string) {
  return filterRowIndexes(result, search).map((index) => result.rows[index]);
}

function filterRowIndexes(
  result: Extract<SparqlExecutionResult, { status: "success" }>,
  search: string
): number[] {
  const normalizedSearch = search.trim().toLowerCase();

  if (!normalizedSearch) {
    return result.rows.map((_row, index) => index);
  }

  return result.rows.flatMap((row, index) =>
    result.variables.some((variable) => formatBinding(row[variable]).toLowerCase().includes(normalizedSearch))
      ? [index]
      : []
  );
}

function getTotalPages(
  result: Extract<SparqlExecutionResult, { status: "success" }>,
  search: string,
  pageSize: SparqlResultPageSize
): number {
  if (pageSize === "All") {
    return 1;
  }

  return Math.max(1, Math.ceil(filterRows(result, search).length / pageSize));
}

function downloadCsv(
  variables: string[],
  rows: Extract<SparqlExecutionResult, { status: "success" }>["rows"]
): void {
  const csv = [
    variables.map(csvCell).join(","),
    ...rows.map((row) => variables.map((variable) => csvCell(formatBinding(row[variable]))).join(","))
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "sparql-results.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
