/** Boots the browser process through the single Editor application composition root. */

import "./polyfills/node-globals";
import "./styles.css";
import { renderApp } from "./application/composition";
import { authHeaders, completeExternalAuthReturn, readAuthSession } from "./auth/api-client";
import { loadConfig } from "./configuration/loader";
import { LodeonClientError, renderConfiguredError } from "./errors/client-error";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new LodeonClientError("app.root_missing");
}

const appRoot = root;

async function bootstrap() {
  let initialAuthError: unknown;
  try {
    await completeExternalAuthReturn(globalThis.location.href, (url) => {
      globalThis.history.replaceState(globalThis.history.state, "", url);
    });
  } catch (error) {
    initialAuthError = error;
  }
  // shmarql's page template provides the title, favicon, header and footer.
  const config = await loadConfig(authHeaders(readAuthSession()));
  await renderApp(appRoot, config, { initialAuthError });
}

void bootstrap().catch((error) => {
  appRoot.replaceChildren();
  const message = document.createElement("pre");

  message.className = "ld-boot-error";
  message.textContent = renderConfiguredError({ errors: undefined }, error, "app.bootstrap_failed");
  appRoot.append(message);
});
