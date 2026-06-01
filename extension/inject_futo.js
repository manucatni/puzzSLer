browser.storage.local.get('enabled_futo').then(r => {
    if (r.enabled_futo !== false) {
        fetch(browser.runtime.getURL('core/futoshiki.js'))
            .then(r => r.text())
            .then(code => {
                var s = document.createElement('script');
                s.textContent = code;
                document.documentElement.appendChild(s);
            });
    }
});
