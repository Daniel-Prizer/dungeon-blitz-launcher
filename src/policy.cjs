'use strict';
const LIVE = 'https://dungeonblitzr.theminesa.studio/';
const UNLOCK_KEYS = require('./shortcuts.js').codes;
function gameURL(value) {
  if (typeof value !== 'string' || value.length > 8192) return null;
  try {
    const u = new URL(value.trim());
    if (u.username || u.password) return null;
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))) return null;
    u.hash = ''; return u.href;
  } catch { return null; }
}
function zoom(value) { return Number.isFinite(value) ? Math.max(.5, Math.min(3, value)) : 1; }
const AUDIO_BUSES=['player','music','environment','creatures'];
function validAudioMix(input={}) {return Object.fromEntries(AUDIO_BUSES.map(key=>[key,Number.isInteger(input?.[key])&&input[key]>=0&&input[key]<=100?input[key]:100]));}
function validSettings(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) input = {};
  return { gameURL: gameURL(input.gameURL) || LIVE,
    volume: Number.isInteger(input.volume) && input.volume >= 0 && input.volume <= 100 ? input.volume : 100,
    audioMix:validAudioMix(input.audioMix),
    cursorLock: input.cursorLock === true,
    unlockKey: Object.hasOwn(UNLOCK_KEYS, input.unlockKey) ? input.unlockKey : 'AltLeft',
    gameZoom: zoom(input.gameZoom ?? input.defaultZoom),
    renderResolution: [.5,.75,1].includes(input.renderResolution)?input.renderResolution:1,
    showFPS: input.showFPS === true,
    experimentalWidescreen: input.experimentalWidescreen === true,
    autoUpdates: input.autoUpdates !== false,
    keepGameAwake: input.keepGameAwake !== false, hardwareAcceleration: input.hardwareAcceleration !== false };
}
module.exports = { LIVE, UNLOCK_KEYS, gameURL, zoom, validSettings, validAudioMix, AUDIO_BUSES };
