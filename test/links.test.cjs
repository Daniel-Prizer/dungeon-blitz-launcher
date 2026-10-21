const test = require('node:test'),
  assert = require('node:assert/strict');
const { classifyLink } = require('../src/legacy/links.cjs');
const game = 'https://dungeonblitzr.theminesa.studio/';
test('game links reload and web links receive a canonical default-browser handoff', () => {
  for (const url of [
    game,
    game + '?reload=1',
    game + 'forum',
    game + '#play',
    'http://dungeonblitzr.theminesa.studio/',
  ])
    assert.equal(classifyLink(url, game).type, 'reload');
  for (const url of ['http://www.dungeonblitz.com/news/', 'https://dungeonblitz.com/lostpw'])
    assert.equal(classifyLink(url, game).type, 'reload');
  for (const url of [
    'https://www.paypal.com/donate/?a=1&b=2',
    'https://www.facebook.com/',
    'http://example.com/',
    'https://dungeonblitzr.theminesa.studio.evil.org/',
  ])
    assert.deepEqual(classifyLink(url, game), { type: 'external', url });
  assert.equal(classifyLink('http://127.0.0.1:8080/play', 'http://127.0.0.1:8080/').type, 'reload');
  assert.equal(classifyLink('http://127.0.0.1:8081/', 'http://127.0.0.1:8080/').type, 'external');
});
test('external handoff rejects privileged schemes, credentials, malformed and oversized input', () => {
  for (const url of [
    null,
    {},
    '',
    'javascript:alert(1)',
    'file:///C:/Windows',
    'data:text/html,x',
    'mailto:x@example.com',
    'steam://game',
    'https://user:pass@paypal.com/',
    'https://paypal.com\n.evil.org/',
    ' https://paypal.com/',
    'https://x/' + 'a'.repeat(4096),
  ])
    assert.equal(classifyLink(url, game), null, String(url).slice(0, 60));
});
test('rankings open in the browser without reloading, retaining category/level parameters', () => {
  for (const host of [
    'www.dungeonblitz.com',
    'dungeonblitz.com',
    'dungeonblitzr.theminesa.studio',
    'dungeonblitz.theminesa.studio',
  ])
    for (const path of [
      '/rankings',
      '/rankings/',
      '/rankings/levels?level=Temple%20of%20Umbra&mode=heroic#scores',
    ])
      assert.deepEqual(classifyLink('http://' + host + path, game), {
        type: 'external',
        url: 'https://dungeonblitz.theminesa.studio' + path,
      });
  assert.deepEqual(
    classifyLink('http://localhost:8080/rankings/?level=1', 'http://localhost:8080/'),
    { type: 'external', url: 'http://localhost:8080/rankings/?level=1' }
  );
  assert.equal(classifyLink(game + 'rankings-other', game).type, 'reload');
  assert.deepEqual(classifyLink('https://dungeonblitz.com.evil.org/rankings/', game), {
    type: 'external',
    url: 'https://dungeonblitz.com.evil.org/rankings/',
  });
});
