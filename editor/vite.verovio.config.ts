import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const editorRoot = fileURLToPath(new URL(".", import.meta.url));
const sourceRoot = fileURLToPath(new URL("./src", import.meta.url));
const outputRoot = fileURLToPath(new URL("../src/shmarql/static/lodeon/verovio", import.meta.url));
const publicAssets = fileURLToPath(new URL("./public/assets/verovio", import.meta.url));

const copyControlledAssets = (): Plugin => ({
  name: "lodeon-copy-verovio-assets",
  writeBundle() {
    mkdirSync(outputRoot, { recursive: true });
    copyFileSync(`${publicAssets}/GeneralUserGS.sf3`, `${outputRoot}/GeneralUserGS.sf3`);
    copyFileSync(`${publicAssets}/GeneralUserGS-LICENSE.txt`, `${outputRoot}/GeneralUserGS-LICENSE.txt`);
    const lock = JSON.parse(readFileSync(`${editorRoot}/package-lock.json`, "utf8"));
    const dependency = (name: string) => lock.packages[`node_modules/${name}`];
    const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
    writeFileSync(
      `${outputRoot}/versions.json`,
      `${JSON.stringify(
        {
          verovio: {
            version: dependency("verovio").version,
            integrity: dependency("verovio").integrity,
            bundledModuleSha256: sha256(`${outputRoot}/verovio-module.js`)
          },
          spessasynthLib: {
            version: dependency("spessasynth_lib").version,
            integrity: dependency("spessasynth_lib").integrity,
            workletSha256: sha256(`${outputRoot}/spessasynth_processor.min.js`)
          },
          spessasynthCore: {
            version: dependency("spessasynth_core").version,
            integrity: dependency("spessasynth_core").integrity
          },
          soundfont: {
            version: "2.0.3 BETA",
            sha256: sha256(`${outputRoot}/GeneralUserGS.sf3`)
          }
        },
        null,
        2
      )}\n`
    );
  }
});

export default defineConfig({
  root: editorRoot,
  base: "./",
  publicDir: false,
  plugins: [copyControlledAssets()],
  define: { global: "globalThis", process: "globalThis.process" },
  resolve: { alias: { "@lodeon": sourceRoot } },
  build: {
    outDir: outputRoot,
    emptyOutDir: true,
    cssCodeSplit: false,
    target: "es2022",
    rollupOptions: {
      input: fileURLToPath(new URL("./src/nodes/verovio/shmarql-runtime.ts", import.meta.url)),
      output: {
        entryFileNames: "lodeon-verovio.js",
        chunkFileNames: "[name].js",
        assetFileNames: ({ names }) =>
          names.some((name) => name.endsWith(".css")) ? "lodeon-verovio.css" : "[name][extname]"
      }
    }
  }
});
