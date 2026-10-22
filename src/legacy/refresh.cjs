'use strict';

// This is a one-reconnect hint, never a login token or a saved preference.
function valid(value) {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 2 &&
    Number.isInteger(value.userID) &&
    value.userID > 0 &&
    value.userID <= 0xffffffff &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    value.name.length <= 64 &&
    !/[\x00-\x1f\x7f]/.test(value.name)
  );
}

function fromLink(value, live) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value),
      origin = new URL(live);
    if (
      url.origin !== origin.origin ||
      url.username ||
      url.password ||
      !['http:', 'https:'].includes(url.protocol)
    )
      return null;
    const match = /^#blitz-refresh=([1-9][0-9]{0,9})\/([^/]+)$/.exec(url.hash);
    if (!match) return null;
    const result = { userID: Number(match[1]), name: decodeURIComponent(match[2]) };
    return valid(result) ? result : null;
  } catch (_) {
    return null;
  }
}
module.exports = { valid, fromLink };
