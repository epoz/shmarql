/* SHMARQL graph browser (/spo): profile picker, then browse via the /spo form. */
(function () {
  "use strict";

  const profiles = JSON.parse(document.getElementById("profiles-data").textContent || "[]");
  const input = document.getElementById("profile-input");
  const keyField = document.getElementById("profile-key");
  const optionsList = document.getElementById("profile-options");
  const endpointLabel = document.getElementById("profile-endpoint");

  window.SHmarqlProfiles.createPicker({
    input,
    keyField,
    optionsList,
    endpointLabel,
    profiles,
    onChange: () => updateUrl(),
  });

  // Reflect the chosen profile in the URL, keeping the s/p/o filters the user typed.
  function updateUrl() {
    const params = new URLSearchParams();
    const add = (name, value) => {
      const v = String(value || "").trim();
      if (v) params.set(name, v);
    };
    add("s", document.getElementById("spo-s").value);
    add("p", document.getElementById("spo-p").value);
    add("o", document.getElementById("spo-o").value);
    if (keyField.value) params.set("profile", keyField.value);
    const qs = params.toString();
    history.replaceState(null, "", qs ? "/spo?" + qs : "/spo");
  }
})();
