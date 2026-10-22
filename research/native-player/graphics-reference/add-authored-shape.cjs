'use strict';
const zlib = require('node:zlib');
module.exports = function addAuthoredShape(bytes) {
  const body =
    bytes.toString('ascii', 0, 3) === 'CWS'
      ? zlib.inflateSync(bytes.subarray(8))
      : bytes.subarray(8);
  const offset = Math.ceil((5 + (body[0] >> 3) * 4) / 8) + 4;
  const tag = (code, data) => {
    const h = Buffer.alloc(data.length < 63 ? 2 : 6);
    h.writeUInt16LE(code * 64 + Math.min(data.length, 63));
    if (data.length >= 63) h.writeUInt32LE(data.length, 2);
    return Buffer.concat([h, data]);
  };
  const id = Buffer.alloc(2);
  id.writeUInt16LE(65001);
  const golden = JSON.parse(
    require('node:fs').readFileSync(
      require('node:path').join(__dirname, 'authored-golden-shape.json')
    )
  );
  const shape = tag(
    golden.code,
    Buffer.concat([id, Buffer.from(golden.data, 'base64').subarray(2)])
  );
  const place = Buffer.alloc(5);
  place[0] = 0x26;
  place.writeUInt16LE(3200, 1);
  place.writeUInt16LE(65001, 3);
  const placement = tag(
    26,
    Buffer.concat([place, Buffer.from([0]), Buffer.from('BlitzAuthoredShape\0')])
  );
  const result = [body.subarray(0, offset)];
  let cursor = offset,
    inserted = false;
  while (cursor < body.length) {
    const start = cursor,
      h = body.readUInt16LE(cursor);
    cursor += 2;
    const code = h >> 6;
    let length = h & 63;
    if (length === 63) {
      length = body.readUInt32LE(cursor);
      cursor += 4;
    }
    if (cursor + length > body.length) throw Error('SWF tag boundary');
    if (code === 1 && !inserted) {
      result.push(shape, placement);
      inserted = true;
    }
    if (code === 32 && length >= 2 && body.readUInt16LE(cursor) === 65001)
      throw Error('Fixture ID collision');
    result.push(body.subarray(start, cursor + length));
    cursor += length;
  }
  if (!inserted) throw Error('No authored frame');
  const changed = Buffer.concat(result),
    header = Buffer.from(bytes.subarray(0, 8));
  header.write('CWS');
  header.writeUInt32LE(changed.length + 8, 4);
  return Buffer.concat([header, zlib.deflateSync(changed)]);
};
