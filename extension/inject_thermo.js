browser.storage.local.get('enabled_thermo').then(r => {
    if (r.enabled_thermo !== false) {
        fetch(browser.runtime.getURL('core/thermometer.js'))
            .then(r => r.text())
            .then(code => {
                var s = document.createElement('script');
                s.textContent = code;
                document.documentElement.appendChild(s);
            });
    }
});
