'use strict';
// Bound bytes as they arrive, before parsing or waiting for a newline.
// Shared with the legacy main process; keep Node 12 compatibility.
function readMessages(stream, receive, invalid = () => stream.destroy(), limit = 32768) {
  let parts = [], size = 0, stopped = false;
  function reject() { if (!stopped) { stopped = true; parts = []; size = 0; invalid(); } }
  stream.on('data', chunk => {
    if (stopped) return;
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    let start = 0;
    while (start < bytes.length && !stopped) {
      const end = bytes.indexOf(10, start), next = end < 0 ? bytes.length : end;
      size += next - start;
      if (size > limit) { reject(); return; }
      parts.push(bytes.subarray(start, next));
      if (end < 0) return;
      let message;
      try { message = JSON.parse(Buffer.concat(parts, size).toString('utf8')); }
      catch (_) { reject(); return; }
      parts = []; size = 0;
      if (!message || typeof message !== 'object' || Array.isArray(message) ||
          typeof message.type !== 'string' || message.type.length > 64) { reject(); return; }
      try {
        const result = receive(message);
        if (result && typeof result.catch === 'function') result.catch(reject);
      } catch (_) { reject(); return; }
      if (stream.destroyed) { stopped = true; parts = []; size = 0; return; }
      start = end + 1;
    }
  });
  stream.on('end', () => { if (size) reject(); });
}
module.exports = { readMessages };
