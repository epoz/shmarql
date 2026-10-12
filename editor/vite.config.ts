import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const resolveDependency = (path: string) => fileURLToPath(new URL(`./node_modules/${path}`, import.meta.url));

const editorRoot = fileURLToPath(new URL(".", import.meta.url));
const lodeonSourceRoot = fileURLToPath(new URL("./src", import.meta.url));
const frontendTestRoot = fileURLToPath(new URL("./tests", import.meta.url));
// The built editor is part of the shmarql Python package and served at /lodeon/.
const outputRoot = fileURLToPath(new URL("../src/shmarql/lodeon_editor", import.meta.url));
// `npm run dev` proxies API and story assets to a running shmarql (uv run shmarql).
const shmarqlURL = process.env.SHMARQL_URL ?? "http://127.0.0.1:8000";

export default defineConfig({
  base: "/lodeon/",
  build: {
    outDir: outputRoot,
    emptyOutDir: true,
    chunkSizeWarningLimit: 8192
  },
  define: {
    global: "globalThis",
    process: "globalThis.process"
  },
  resolve: {
    alias: [
      {
        find: "@lodeon",
        replacement: lodeonSourceRoot
      },
      {
        find: /^@testing-library\/dom$/,
        replacement: resolveDependency("@testing-library/dom/dist/index.js")
      },
      {
        find: /^fake-indexeddb$/,
        replacement: resolveDependency("fake-indexeddb/build/cjs/index.js")
      },
      {
        find: /^jszip$/,
        replacement: resolveDependency("jszip/lib/index.js")
      },
      {
        find: /^process\/browser$/,
        replacement: resolveDependency("process/browser.js")
      },
      {
        find: /^process$/,
        replacement: resolveDependency("process/browser.js")
      },
      {
        find: /^stream$/,
        replacement: resolveDependency("stream-browserify/index.js")
      },
      {
        find: /^util$/,
        replacement: resolveDependency("util/util.js")
      },
      {
        find: /^buffer$/,
        replacement: resolveDependency("buffer/index.js")
      },
      {
        find: /^events$/,
        replacement: resolveDependency("events/events.js")
      },
      {
        find: /^querystring$/,
        replacement: resolveDependency("querystring-es3/index.js")
      },
      {
        find: /^url$/,
        replacement: resolveDependency("url/url.js")
      },
      {
        find: /^vm$/,
        replacement: resolveDependency("vm-browserify/index.js")
      }
    ]
  },
  optimizeDeps: {
    force: true,
    esbuildOptions: {
      define: {
        global: "globalThis",
        process: "globalThis.process"
      }
    },
    include: [
      "buffer",
      "events",
      "process/browser.js",
      "querystring-es3",
      "stream-browserify",
      "url",
      "util",
      "vm-browserify"
    ]
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": shmarqlURL,
      "/static": shmarqlURL,
      "/story": shmarqlURL
    },
    fs: {
      allow: [editorRoot, frontendTestRoot]
    }
  },
  test: {
    environment: "jsdom",
    fileParallelism: false,
    globals: false,
    include: [`${frontendTestRoot}/**/*.test.ts`],
    setupFiles: [`${frontendTestRoot}/setup.ts`],
    testTimeout: 15_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/build/**", "src/main.ts", "src/vite-env.d.ts"],
      thresholds: {
        statements: 84,
        branches: 71,
        functions: 83,
        lines: 85
      }
    }
  }
});
