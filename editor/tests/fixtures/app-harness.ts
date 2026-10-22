import { within } from "@testing-library/dom";
import type { EditorView } from "@codemirror/view";
import { expect, vi } from "vitest";

type CodeMirrorHost = HTMLElement & {
  __lodeonCodeMirrorView?: EditorView;
};

export class MockRendererXMLHttpRequest {
  readonly upload = new EventTarget();
  readonly headers: Record<string, string> = {};
  readonly target = new EventTarget();
  method = "";
  url = "";
  body: Document | XMLHttpRequestBodyInit | null = null;

  constructor(
    readonly status: number,
    readonly responseText: string,
    readonly contentType = "application/json"
  ) {}

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }

  getResponseHeader(name: string): string | null {
    return name.toLowerCase() === "content-type" ? this.contentType : null;
  }

  addEventListener(type: string, listener: EventListener): void {
    this.target.addEventListener(type, listener);
  }

  send(body?: Document | XMLHttpRequestBodyInit | null): void {
    this.body = body ?? null;
    setTimeout(() => {
      this.upload.dispatchEvent(
        new ProgressEvent("progress", {
          lengthComputable: true,
          loaded: 25,
          total: 100
        })
      );
      this.target.dispatchEvent(new Event("load"));
    }, 0);
  }
}

export function stubRendererXmlHttpRequest(
  xhr: MockRendererXMLHttpRequest
): void {
  vi.stubGlobal("XMLHttpRequest", function XMLHttpRequest() {
    return xhr;
  });
}

export function setCodeEditorValue(
  root: HTMLElement,
  ariaLabel: string,
  value: string
): void {
  const content = within(root).getByLabelText(ariaLabel) as HTMLElement;
  const wrapper = content.closest<CodeMirrorHost>(".ld-sparql-source-editor");
  const codeMirrorView = wrapper?.__lodeonCodeMirrorView;

  expect(wrapper).toBeTruthy();
  expect(codeMirrorView).toBeTruthy();

  codeMirrorView!.focus();
  codeMirrorView!.dispatch({
    changes: {
      from: 0,
      to: codeMirrorView!.state.doc.length,
      insert: value
    }
  });
}

export function resetAppTestState(): void {
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-theme");
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
}
