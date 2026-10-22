'use strict';
const fs = require('node:fs'),
  assert = require('node:assert/strict');
const [reference, actual] = process.argv.slice(2);
if (!reference || !actual) throw Error('Expected Flash result and native result');
function canonical(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonical);
  const result = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, canonical(v)]));
  // A closed polygon may start at a different vertex while preserving exactly
  // the same edges and winding. Flash rotates stroke contours when extracting.
  if (
    result.type === 'flash.display::GraphicsPath' &&
    result.commands?.[0] === 1 &&
    result.commands.slice(1).every((v) => v === 2) &&
    result.data.length >= 8
  ) {
    const d = result.data;
    if (d[0] === d.at(-2) && d[1] === d.at(-1)) {
      const points = Array.from({ length: d.length / 2 - 1 }, (_, i) => d.slice(i * 2, i * 2 + 2));
      let first = 0;
      for (let i = 1; i < points.length; i++)
        if (
          points[i][0] < points[first][0] ||
          (points[i][0] === points[first][0] && points[i][1] < points[first][1])
        )
          first = i;
      const ordered = points.slice(first).concat(points.slice(0, first));
      result.data = ordered.concat([ordered[0]]).flat();
    }
  }
  return result;
}
const expected = canonical(JSON.parse(fs.readFileSync(reference)).result),
  observed = canonical(JSON.parse(fs.readFileSync(actual)).result);
function compare(a, b, path) {
  if (typeof a === 'number' && typeof b === 'number') {
    assert(Math.abs(a - b) <= 0.001, `${path}: ${a} != ${b}`);
    return;
  }
  if (a === null || typeof a !== 'object') {
    assert.equal(b, a, path);
    return;
  }
  assert.equal(Array.isArray(b), Array.isArray(a), path);
  assert.deepEqual(Object.keys(b).sort(), Object.keys(a).sort(), path);
  for (const key of Object.keys(a)) compare(a[key], b[key], path + '.' + key);
}
compare(expected, observed, 'graphics');
console.log(
  'Flash/native graphics extraction agrees for ' +
    Object.keys(expected).length +
    ' scenarios (0.001 matrix tolerance).'
);
