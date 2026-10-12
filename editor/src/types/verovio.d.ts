/** Declares the ambient TypeScript surface for verovio. */

declare module "verovio/wasm" {
  export default function createVerovioModule(): Promise<unknown>;
}

declare module "verovio/esm" {
  export class VerovioToolkit {
    static instances: VerovioToolkit[];
    constructor(module: unknown);
    destroy(): void;
    getElementsAtTime(milliseconds: number): unknown;
    getLog(): string;
    getMEI(options?: Record<string, unknown>): string;
    getPageCount(): number;
    getPageWithElement(xmlId: string): number;
    getTimeForElement(xmlId: string): number;
    getTimesForElement(xmlId: string): unknown;
    getVersion(): string;
    loadData(data: string): number;
    redoLayout(options?: Record<string, unknown>): void;
    redoPagePitchPosLayout(): void;
    renderToMIDI(): string;
    renderToSVG(page?: number, xmlDeclaration?: boolean): string;
    resetOptions(): void;
    setOptions(options: Record<string, unknown>): boolean;
    validatePAE(data: string | Record<string, unknown>): unknown;
  }
}
