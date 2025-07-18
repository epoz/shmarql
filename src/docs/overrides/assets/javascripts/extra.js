fa_aeroplane = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="24" height="24" fill="#ccc" ><!--! Font Awesome Free 6.5.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free (Icons: CC BY 4.0, Fonts: SIL OFL 1.1, Code: MIT License) Copyright 2024 Fonticons, Inc.--><path d="M498.1 5.6c10.1 7 15.4 19.1 13.5 31.2l-64 416c-1.5 9.7-7.4 18.2-16 23s-18.9 5.4-28 1.6L284 427.7l-68.5 74.1c-8.9 9.7-22.9 12.9-35.2 8.1S160 493.2 160 480v-83.6c0-4 1.5-7.8 4.2-10.7l167.6-182.9c5.8-6.3 5.6-16-.4-22s-15.7-6.4-22-.7L106 360.8l-88.3-44.2C7.1 311.3.3 300.7 0 288.9s5.9-22.8 16.1-28.7l448-256c10.7-6.1 23.9-5.5 34 1.4z"></path></svg>`;

document$.subscribe(function () {
  document.querySelectorAll(".language-sparql").forEach(function (block) {
    thepre = block.querySelector("pre");
    thecode = block.querySelector("code");
    var xLink = document.createElement("a");
    xLink.style.display = "block";
    xLink.title = "Execute Query";
    xLink.href = "../shmarql/?query=" + encodeURIComponent(thecode.innerText);
    xLink.innerHTML = fa_aeroplane;

    thepre.appendChild(xLink);
  });

  document.querySelectorAll(".language-shmarql").forEach(function (block) {
    thecode = block.querySelector("code");
    fetch(
      "../shmarql/fragments/sparql?query=" +
        encodeURIComponent(thecode.innerText),
      {
        method: "POST",
        Accept: "text/html",
      }
    )
      .then((response) => response.text())
      .then((data) => {
        block.innerHTML = data;
        block.querySelectorAll("script").forEach((script) => {
          if (script.textContent) {
            eval(script.textContent);
          }
          if (script.src) {
            // For external scripts, you'd need to fetch and eval them
            fetch(script.src)
              .then((response) => response.text())
              .then((scriptContent) => eval(scriptContent));
          }
        });
      });
  });
});
