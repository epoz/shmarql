import { describe, expect, it } from "vitest";
import { defaultConfig } from "./fixtures/config";
import { createLocalization } from "@lodeon/localization/runtime";

describe("LODEON localization runtime", () => {
  it("translates configured runtime messages", () => {
    const i18n = createLocalization(defaultConfig);

    expect(i18n.locale).toBe("en");
    expect(i18n.t("editor", "toolbar.autosave.saveNow")).toBe("Save now");
    expect(i18n.exists("editor", "toolbar.autosave.saveNow")).toBe(true);
  });

  it("throws coded failures for missing strict messages", () => {
    const i18n = createLocalization(defaultConfig);

    expect(() => i18n.t("editor", "toolbar.missing")).toThrow(
      "localization.missing:editor:toolbar.missing"
    );
  });
});
