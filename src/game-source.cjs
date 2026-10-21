'use strict';

function modernAddress(value) {
  try {
    const source = new URL(value);
    if (
      source.protocol !== 'https:' ||
      source.port ||
      source.username ||
      source.password ||
      !['/', '/web', '/web/'].includes(source.pathname) ||
      !['dungeonblitzr.theminesa.studio', 'dungeonblitz.theminesa.studio'].includes(source.hostname)
    )
      return null;
    const target = new URL('https://dungeonblitz.theminesa.studio/web');
    const language = source.searchParams.get('lang');
    if (language && /^[a-z-]{2,8}$/i.test(language)) target.searchParams.set('lang', language);
    return target.href;
  } catch {
    return null;
  }
}

function originalAddress(value) {
  if (!modernAddress(value)) return null;
  const target = new URL(value);
  target.pathname = '/';
  target.hash = '';
  return target.href;
}

async function publicBytes(url, limit, signal) {
  const response = await fetch(url, {
    redirect: 'error',
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(25000)])
      : AbortSignal.timeout(25000),
    credentials: 'omit',
  });
  if (!response.ok || Number(response.headers.get('content-length')) > limit) {
    throw Error('Public game resource unavailable');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) throw Error('Public game resource exceeds limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

module.exports = { modernAddress, originalAddress, publicBytes };
