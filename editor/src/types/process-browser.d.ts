/** Declares the ambient TypeScript surface for process browser. */

declare module "process/browser.js" {
  import process from "node:process";

  export default process;
}
