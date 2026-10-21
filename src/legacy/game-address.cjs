'use strict';
// This client's local assets use localhost and Flash requires the same
// application/security domain. Keep one canonical loopback origin instead of
// permitting cross-origin asset imports or disabling web security.
function canonicalGameAddress(value) {
  const u = new URL(value);
  if (u.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(u.hostname))
    u.hostname = 'localhost';
  return u.href;
}
module.exports = { canonicalGameAddress };
