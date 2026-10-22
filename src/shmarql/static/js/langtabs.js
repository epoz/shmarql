document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.lang-tab').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var group = btn.dataset.group;
            var lang = btn.dataset.lang;

            // Update active tab button
            document.querySelectorAll('.lang-tab[data-group="' + group + '"]').forEach(function (b) {
                b.classList.toggle('active', b.dataset.lang === lang);
            });

            // Show/hide lang-value divs
            document.querySelectorAll('.lang-value[data-group="' + group + '"]').forEach(function (div) {
                div.style.display = div.dataset.lang === lang ? '' : 'none';
            });
        });
    });
});
