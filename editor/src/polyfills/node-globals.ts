/** Provides only the Node globals required by browser-targeted third-party dependencies. */

import { Buffer } from "buffer";
import jquery from "jquery";
import process from "process/browser.js";

declare global {
  interface Window {
    Buffer?: typeof Buffer;
    $?: typeof jquery;
    jQuery?: typeof jquery;
    process?: typeof process;
  }
}

const browserGlobal = globalThis as typeof globalThis & {
  Buffer?: typeof Buffer;
  $?: typeof jquery;
  jQuery?: typeof jquery;
  process?: typeof process;
};

globalThis.Buffer ??= Buffer;
browserGlobal.process ??= process;
browserGlobal.$ ??= jquery;
browserGlobal.jQuery ??= jquery;
