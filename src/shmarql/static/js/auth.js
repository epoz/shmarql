/* SHMARQL site auth: the template-driven login/logout UI of the site header.
 *
 * The login form (username/password, POST /token) exchanges the credentials for a signed,
 * expiring JWT access token; the token is kept in the ``access_token`` browser cookie (which
 * outlives the browser session) and the header swaps the login link for the logout button
 * once the visitor is authenticated.
 */
(function () {
  "use strict";

  const loginForm = document.querySelector("[data-auth-form]");
  const tokenForm = document.querySelector("[data-auth-token-form]");
  const logoutForm = document.querySelector("[data-auth-logout-form]");
  const loginLink = document.querySelector(".auth-login-link");
  const personIcon = document.querySelector(".auth-person");
  const errorBox = document.querySelector("[data-auth-error]");

  const AUTH_COOKIE = "access_token";
  const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, like the access token lifetime

  function readToken() {
    const prefix = AUTH_COOKIE + "=";
    const cookie = (document.cookie || "").split(";").map((c) => c.trim()).find((c) => c.startsWith(prefix));
    return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : "";
  }

  function writeToken(token) {
    document.cookie = AUTH_COOKIE + "=" + encodeURIComponent(token) + "; path=/; max-age=" + AUTH_COOKIE_MAX_AGE + "; samesite=lax";
  }

  function clearToken() {
    document.cookie = AUTH_COOKIE + "=; path=/; max-age=0; samesite=lax";
  }

  function authHeaders(token) {
    return token ? { Authorization: "Bearer " + token } : {};
  }

  function setError(message) {
    if (!errorBox) return;
    errorBox.textContent = message || "auth.login_failed";
    errorBox.hidden = false;
  }

  function setLoggedIn(username) {
    if (logoutForm) logoutForm.hidden = false;
    if (loginLink) loginLink.hidden = true;
    if (loginForm) loginForm.hidden = true;
    if (personIcon) personIcon.title = username || "";
  }

  function setLoggedOut() {
    if (logoutForm) logoutForm.hidden = true;
    if (loginLink) loginLink.hidden = false;
    if (loginForm) loginForm.hidden = false;
    if (errorBox) errorBox.hidden = true;
  }

  function handleLoginSubmit(event) {
    event.preventDefault();
    if (!loginForm) return;
    const formData = new FormData(loginForm);
    const username = String(formData.get("username") || "");
    const password = String(formData.get("password") || "");
    return fetch("/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "username=" + encodeURIComponent(username) + "&password=" + encodeURIComponent(password)
    })
      .then(function (response) {
        return response.json().then(function (body) {
          return { ok: response.ok, status: response.status, body: body };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          throw new Error((result.body && result.body.detail) || "auth.login_failed");
        }
        const token = result.body.access_token;
        if (!token) {
          throw new Error("auth.login_failed");
        }
        writeToken(token);
        setLoggedIn(result.body.sub || username);
        window.location.href = "/";
      })
      .catch(function () {
        setError("auth.login_failed");
      });
  }

  function handleTokenSubmit(event) {
    event.preventDefault();
    if (!tokenForm) return;
    const input = tokenForm.querySelector('input[name="token"]');
    const token = String(input?.value ?? "").trim();
    if (!token) {
      setError("auth.token_required");
      return;
    }
    return fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token })
    })
      .then(function (response) {
        return response.json().then(function (body) {
          return { ok: response.ok, status: response.status, body: body };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          throw new Error((result.body && result.body.detail) || "auth.login_failed");
        }
        const session = result.body.session;
        if (!session) {
          throw new Error("auth.login_failed");
        }
        writeToken(session);
        setLoggedIn("");
        window.location.href = "/";
      })
      .catch(function () {
        setError("auth.login_failed");
      });
  }

  function handleLogoutSubmit(event) {
    event.preventDefault();
    if (!logoutForm) return;
    const token = readToken();
    return fetch("/api/auth/logout", {
      method: "POST",
      headers: authHeaders(token)
    })
      .then(function (response) {
        return response.json().then(function (body) {
          return { ok: response.ok, status: response.status, body: body };
        });
      })
      .then(function () {
        clearToken();
        setLoggedOut();
      })
      .catch(function () {
        setLoggedOut();
      });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", handleLoginSubmit);
  }
  if (tokenForm) {
    tokenForm.addEventListener("submit", handleTokenSubmit);
  }
  if (logoutForm) {
    logoutForm.addEventListener("submit", handleLogoutSubmit);
  }
})();
