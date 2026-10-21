// Bounded dedicated workers decode independent artwork, never game state.
import { nativeBytes } from './binary.mjs';
self.onmessage = async ({ data }) => {
  try {
    const bytes = data.bytes ?? nativeBytes(data.encoded.binary, data.encoded.byteLength);
    if (
      !(bytes instanceof ArrayBuffer) ||
      bytes.byteLength < 33 ||
      bytes.byteLength > 32 * 1024 * 1024
    )
      throw Error('Invalid artwork payload');
    const view = new DataView(bytes),
      width = view.getUint32(16),
      height = view.getUint32(20);
    if (
      view.getUint32(0) !== 0x89504e47 ||
      view.getUint32(4) !== 0x0d0a1a0a ||
      view.getUint32(8) !== 13 ||
      view.getUint32(12) !== 0x49484452 ||
      width !== data.width ||
      height !== data.height ||
      width < 1 ||
      height < 1 ||
      width > 8192 ||
      height > 8192 ||
      width * height > 16 * 1024 * 1024
    )
      throw Error('PNG header disagrees with reserved artwork');
    const bitmap = await createImageBitmap(new Blob([bytes]), {
      premultiplyAlpha: 'premultiply',
      colorSpaceConversion: 'none',
    });
    if (
      bitmap.width < 1 ||
      bitmap.height < 1 ||
      bitmap.width > 8192 ||
      bitmap.height > 8192 ||
      bitmap.width * bitmap.height > 16 * 1024 * 1024
    ) {
      bitmap.close();
      throw Error('Artwork dimensions exceed budget');
    }
    self.postMessage({ id: data.id, bitmap }, [bitmap]);
  } catch (e) {
    self.postMessage({ id: data.id, error: String(e.message || e) });
  }
};
