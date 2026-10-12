import { fireEvent } from "@testing-library/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalization } from "@lodeon/localization/runtime";
import { setSpecialNodeLocalization } from "@lodeon/nodes/shared/node-view-controls";
import {
  renderSparqlResult,
  type SparqlResultPageSize
} from "@lodeon/nodes/sparql/result-view";
import type { SparqlExecutionResult } from "@lodeon/nodes/sparql/api-client";
import { defaultConfig } from "./fixtures/config";

function createResult(rowCount: number): SparqlExecutionResult {
  return {
    status: "success",
    endpointUrl: "/api/sparql/culture-kg",
    executedAt: "2026-07-12T00:00:00Z",
    durationMs: 5,
    variables: ["item", "label"],
    rows: Array.from({ length: rowCount }, (_, index) => ({
      item: {
        type: "uri",
        value: `https://example.org/item/${index + 1}`
      },
      label: {
        type: "literal",
        value: `Item ${index + 1}`
      }
    }))
  };
}

describe("SPARQL result view", () => {
  beforeEach(() => {
    setSpecialNodeLocalization(createLocalization(defaultConfig));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders selectable paged results with filtering and persisted page size", () => {
    const footer = document.createElement("div");
    const container = document.createElement("div");
    const root = document.createElement("section");
    const updates: SparqlResultPageSize[] = [];
    const visibleIndexes: number[][] = [];

    root.dataset.lodeonNode = "sparql";
    root.draggable = true;
    root.append(container);
    document.body.append(root);

    renderSparqlResult(footer, container, createResult(12), {
      pageSize: 10,
      onPageSizeChange: (pageSize) => updates.push(pageSize),
      onVisibleRowIndexesChange: (indexes) => visibleIndexes.push(indexes)
    });

    expect(container.dataset.lodeonNodeControl).toBe("true");
    expect(container.textContent).toContain("Item 10");
    expect(container.textContent).not.toContain("Item 11");
    expect(visibleIndexes.at(-1)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        "button[aria-label='Next SPARQL result page']"
      )!
    );
    expect(visibleIndexes.at(-1)).toEqual([10, 11]);

    container.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true })
    );

    expect(root.draggable).toBe(false);

    const pageSize = container.querySelector<HTMLSelectElement>("select");

    expect(pageSize).toBeTruthy();
    fireEvent.change(pageSize!, { target: { value: "50" } });

    expect(updates).toEqual([50]);
    expect(container.textContent).toContain("Item 11");
    expect(visibleIndexes.at(-1)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

    const search = container.querySelector<HTMLInputElement>(
      "input[aria-label='Filter SPARQL results']"
    );

    expect(search).toBeTruthy();
    search!.focus();
    fireEvent.input(search!, { target: { value: "I" } });

    expect(document.activeElement).toBe(search);
    expect(
      container.querySelector<HTMLInputElement>(
        "input[aria-label='Filter SPARQL results']"
      )
    ).toBe(search);

    fireEvent.input(search!, { target: { value: "Item 12" } });

    expect(container.textContent).toContain("Item 12");
    expect(container.textContent).not.toContain("Item 11");
    expect(visibleIndexes.at(-1)).toEqual([11]);
  });

  it("downloads the filtered result set as CSV", () => {
    const footer = document.createElement("div");
    const container = document.createElement("div");
    const click = vi.fn();
    const createObjectURL = vi.fn(() => "blob:sparql-results");
    const revokeObjectURL = vi.fn();
    const append = vi.spyOn(document, "createElement");

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL
    });

    append.mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      const element = Document.prototype.createElement.call(
        document,
        tagName,
        options
      );

      if (tagName === "a") {
        Object.defineProperty(element, "click", {
          configurable: true,
          value: click
        });
      }

      return element;
    }) as typeof document.createElement);

    renderSparqlResult(footer, container, createResult(3));
    fireEvent.input(
      container.querySelector<HTMLInputElement>(
        "input[aria-label='Filter SPARQL results']"
      )!,
      { target: { value: "Item 2" } }
    );
    container
      .querySelector<HTMLButtonElement>(
        "button[aria-label='Download SPARQL results as CSV']"
      )!
      .click();

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:sparql-results");
  });

  it("renders the localized access error for an unavailable stored profile", () => {
    const footer = document.createElement("div");
    const container = document.createElement("div");

    renderSparqlResult(
      footer,
      container,
      {
        status: "error",
        endpointUrl: "/api/sparql/restricted-kg",
        executedAt: "2026-08-23T00:00:00Z",
        durationMs: 4,
        code: "auth.knowledge_graph_access_denied",
        message: "auth.knowledge_graph_access_denied"
      },
      { errors: defaultConfig.errors }
    );

    expect(container.textContent).toContain("Knowledge Graph access is not permitted");
    expect(container.textContent).toContain(
      "Your current LODEON session cannot use the selected Knowledge Graph."
    );
  });
});
