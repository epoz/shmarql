import { describe, expect, it } from "vitest";
import { bindSparnaturalBuilderModal } from "@lodeon/nodes/sparnatural/modal";

describe("Sparnatural builder modal", () => {
  it("closes from every cancel control", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <section data-sparnatural-modal>
        <button type="button" data-sparnatural-cancel>Close</button>
        <div data-sparnatural-host><spar-natural></spar-natural></div>
        <button type="button" data-sparnatural-cancel>Cancel</button>
      </section>
      <button type="button" data-sparnatural-save>Use query</button>
    `;

    bindSparnaturalBuilderModal(root);

    root
      .querySelectorAll<HTMLButtonElement>("[data-sparnatural-cancel]")[1]
      ?.click();

    expect(
      root.querySelector<HTMLElement>("[data-sparnatural-modal]")?.hidden
    ).toBe(true);
    expect(
      root.querySelector<HTMLElement>("[data-sparnatural-host]")?.innerHTML
    ).toBe("");
  });
});
