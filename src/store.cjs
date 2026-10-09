const fs = require('node:fs'), path = require('node:path');
const { validSettings } = require('./policy.cjs');
function loadStore(dir) {
  const file = path.join(dir, 'preferences.json'); let raw = {};
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = {};
  // Browser tabs, history and URLs are deliberately discarded during migration.
  const data = { settings: validSettings(raw.settings), window: {} };
  if (raw.window && typeof raw.window === 'object') {
    for (const key of ['width', 'height']) if (Number.isFinite(raw.window[key])) data.window[key] = raw.window[key];
    data.window.maximized = raw.window.maximized === true;
  }
  function save() { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2)); fs.renameSync(`${file}.tmp`, file); }
  return { data, save };
}
module.exports = { loadStore };
