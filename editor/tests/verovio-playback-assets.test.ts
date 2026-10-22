import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const expected = {
  lib: {
    version: "4.3.12",
    integrity: "sha512-74G7z9B/b6vwZNo/i3YwKiinYhJKCNdu1A0DeYTFoOPoHFqGD7tE1AvetmWZuOaxr7UukEoNt2m4O5KDFn1kuA==",
    processorSha256: "4a6e2bf7ca16a510841f467f4563dcf9155c328ff6eef808a508def280de709e"
  },
  core: {
    version: "4.3.16",
    integrity: "sha512-ZEbPMeJgyuS/3lRP7l8Kvr2MYkW5gqFdPCi15GjeCgCVm/gPS2txDFdH5ouwJ/9HGQxE7NhWco/OnpznLISaaA=="
  },
  soundfont: {
    bytes: 8_423_728,
    sha256: "e2ed326ff44d15f78f2fdc72403b6fa6b77ee7266d3aad0d2198bc95797bc66c"
  }
} as const;

describe("Verovio playback production assets", () => {
  it("pins the selected SpessaSynth packages and AudioWorklet exactly", () => {
    const lock = JSON.parse(readFileSync(resolve(process.cwd(), "package-lock.json"), "utf8"));
    const rootDependencies = lock.packages[""].dependencies;
    const lib = lock.packages["node_modules/spessasynth_lib"];
    const core = lock.packages["node_modules/spessasynth_core"];

    expect(rootDependencies.spessasynth_lib).toBe(expected.lib.version);
    expect(rootDependencies.spessasynth_core).toBe(expected.core.version);
    expect(lib).toMatchObject({ version: expected.lib.version, integrity: expected.lib.integrity });
    expect(core).toMatchObject({ version: expected.core.version, integrity: expected.core.integrity });
    expect(sha256(resolve(
      process.cwd(),
      "node_modules/spessasynth_lib/dist/spessasynth_processor.min.js"
    ))).toBe(expected.lib.processorSha256);
  });

  it("bundles the selected complete SF3 and its matching license", () => {
    const soundfontPath = resolve(
      process.cwd(),
      "public/assets/verovio/GeneralUserGS.sf3"
    );
    const soundfont = readFileSync(soundfontPath);
    const license = readFileSync(resolve(
      process.cwd(),
      "public/assets/verovio/GeneralUserGS-LICENSE.txt"
    ), "utf8");

    expect(soundfont.byteLength).toBe(expected.soundfont.bytes);
    expect(createHash("sha256").update(soundfont).digest("hex"))
      .toBe(expected.soundfont.sha256);
    expect(license).toContain("GeneralUser GS v2.0.3");
    expect(license).toContain("License v2.0");
  });
});

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
