/** Declares the ambient TypeScript surface for openseadragon. */

declare module "openseadragon" {
  type OpenSeadragonOptions = {
    element: HTMLElement;
    tileSources: unknown;
    drawer?: string | string[];
    showNavigator?: boolean;
    showNavigationControl?: boolean;
    gestureSettingsMouse?: Record<string, unknown>;
  };

  type OpenSeadragonViewer = {
    destroy: () => void;
  };

  export default function OpenSeadragon(options: OpenSeadragonOptions): OpenSeadragonViewer;
}
