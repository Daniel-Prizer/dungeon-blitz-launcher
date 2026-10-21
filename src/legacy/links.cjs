'use strict';
const { canonicalGameAddress } = require('./game-address.cjs');
// Shared by both trusted main processes. Remote pages never receive this API.
function classifyLink(value, live) {
  if (typeof value !== 'string' || value.length > 4096 || /[\x00-\x20\x7f]/.test(value))
    return null;
  try {
    const url = new URL(value),
      game = new URL(live);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    // Rankings are a website, including the legacy URL emitted by Flash.
    // Keep level/category query parameters while directing official aliases to
    // the current HTTPS site. Local/custom servers retain their own rankings.
    if (/^\/rankings(?:\/|$)/.test(url.pathname)) {
      if (
        !url.port &&
        [
          'dungeonblitz.com',
          'www.dungeonblitz.com',
          'dungeonblitzr.theminesa.studio',
          'dungeonblitz.theminesa.studio',
        ].includes(url.hostname)
      ) {
        url.protocol = 'https:';
        url.hostname = 'dungeonblitz.theminesa.studio';
      }
      return { type: 'external', url: url.href };
    }
    const sameGame =
      new URL(canonicalGameAddress(value)).origin === new URL(canonicalGameAddress(live)).origin ||
      (!url.port && ['dungeonblitz.com', 'www.dungeonblitz.com'].includes(url.hostname)) ||
      (url.hostname === 'dungeonblitzr.theminesa.studio' &&
        game.hostname === url.hostname &&
        !url.port &&
        !game.port);
    return { type: sameGame ? 'reload' : 'external', url: url.href };
  } catch (_) {
    return null;
  }
}
module.exports = { classifyLink };
