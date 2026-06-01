const keys = ['enabled_futo', 'enabled_renzo', 'enabled_thermo', 'enabled_battle'];

document.addEventListener('DOMContentLoaded', () => {
  browser.storage.local.get(keys).then(r => {
    for (const k of keys) {
      document.getElementById(k).checked = r[k] !== false;
    }
  });
});

document.getElementById('opts').addEventListener('submit', e => {
  e.preventDefault();
  const data = {};
  for (const k of keys) {
    data[k] = document.getElementById(k).checked;
  }
  browser.storage.local.set(data).then(() => {
    const el = document.getElementById('saved');
    el.style.display = 'inline';
    setTimeout(() => el.style.display = 'none', 2000);
  });
});
