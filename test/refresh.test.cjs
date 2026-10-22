'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const { valid, fromLink } = require('../src/legacy/refresh.cjs');
const origin = 'https://dungeonblitzr.theminesa.studio/';
test('refresh hint is bounded, transient character identity on the active origin', () => {
  const expected = { userID: 123, name: 'Test Character' };
  assert(valid(expected));
  assert.deepEqual(
    fromLink(origin + 'p/cbp/DungeonBlitz.swf#blitz-refresh=123/Test%20Character', origin),
    expected
  );
  assert.deepEqual(
    fromLink('http://127.0.0.1:1234/p/a.swf#blitz-refresh=123/Test', 'http://127.0.0.1:1234/'),
    { userID: 123, name: 'Test' }
  );
  for (const value of [
    null,
    {},
    [],
    { ...expected, token: 'no' },
    { ...expected, userID: 0 },
    { ...expected, userID: 4294967296 },
    { ...expected, userID: 1.5 },
    { ...expected, name: '' },
    { ...expected, name: 'x'.repeat(65) },
    { ...expected, name: 'a\nb' },
  ])
    assert.equal(valid(value), false);
  for (const value of [
    'https://evil.org/#blitz-refresh=123/Test',
    origin + '#blitz-refresh=123/%xx',
    origin + '#blitz-refresh=123/Test/Other',
    origin + '#blitz-refresh=0/Test',
    origin + '#blitz-refresh=123/%0a',
    origin + '#blitz-refresh=9999999999/Test',
    'http://127.0.0.1:1235/#blitz-refresh=123/Test',
  ])
    assert.equal(fromLink(value, origin), null);
});
