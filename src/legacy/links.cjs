'use strict';
// Shared by both trusted main processes. Remote pages never receive this API.
function classifyLink(value, live) {
  if (typeof value !== 'string' || value.length > 4096 || /[\x00-\x20\x7f]/.test(value)) return null;
  try {
    const url = new URL(value), game = new URL(live);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    const sameGame = url.origin === game.origin || (!url.port && ['dungeonblitz.com','www.dungeonblitz.com'].includes(url.hostname)) ||
      (url.hostname === 'dungeonblitzr.theminesa.studio' && game.hostname === url.hostname && !url.port && !game.port);
    return { type: sameGame ? 'reload' : 'external', url: url.href };
  } catch (_) { return null; }
}
module.exports = { classifyLink };
