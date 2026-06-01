browser.storage.local.get('enabled_battle').then(r => {
    if (r.enabled_battle !== false) {
        fetch(browser.runtime.getURL('core/battleships.js'))
            .then(r => r.text())
            .then(code => {
                var s = document.createElement('script');
                s.textContent = code;
                document.documentElement.appendChild(s);
            });
    }
});
