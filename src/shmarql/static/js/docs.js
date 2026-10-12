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
});
