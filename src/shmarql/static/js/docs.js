/* Documentation pages: add a "run" link to ```sparql code blocks. */
document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll(".docs-content .language-sparql").forEach(function (block) {
    var code = block.querySelector("code");
    if (!code) return;
    var link = document.createElement("a");
    link.className = "run-sparql";
    link.textContent = "▶ run";
    link.title = "Open in the query editor";
    link.href = "/query?query=" + encodeURIComponent(code.textContent);
    block.style.position = "relative";
    block.appendChild(link);
  });

  /* Documentation tree: collapsible navigation. */
  document.querySelectorAll(".docs-nav .nav-toggle").forEach(function (toggle) {
    toggle.addEventListener("click", function () {
      var item = toggle.parentElement;
      var open = item.classList.toggle("open");
      var icon = toggle.querySelector(".nav-toggle-icon");
      if (icon) icon.textContent = open ? "▾" : "▸";
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  });
});
