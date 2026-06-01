browser.storage.local.get('enabled_renzo').then(r => {
    if (r.enabled_renzo !== false) {
        fetch(browser.runtime.getURL('core/renzoku.js'))
            .then(r => r.text())
            .then(code => {
                var s = document.createElement('script');
                s.textContent = code;
                document.documentElement.appendChild(s);
            });
    }
});
