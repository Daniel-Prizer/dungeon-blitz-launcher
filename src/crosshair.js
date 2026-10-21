'use strict';
// Shared, bounded pointer artwork. No remote assets or player input are used.
(function (root) {
  const styles = ['default', 'original', 'cross', 'dot', 'ring'];
  function valid(input = {}) {
    return {
      style: styles.includes(input?.style) ? input.style : 'default',
      color:
        typeof input?.color === 'string' && /^#[0-9a-f]{6}$/i.test(input.color)
          ? input.color.toLowerCase()
          : '#8cff65',
      size: [16, 24, 32, 48].includes(input?.size) ? input.size : 24,
      outline: input?.outline !== false,
    };
  }
  function pixels(input, density = 1) {
    const s = valid(input),
      scale = Number.isFinite(density) ? Math.max(0.5, Math.min(3, density)) : 1;
    const width = Math.min(145, Math.round((s.size * scale) / 2) * 2 + 1),
      center = (width - 1) / 2;
    const rgba = new Uint8Array(width * width * 4),
      ink = new Uint8Array(width * width),
      radius = Math.max(2, Math.round(width * 0.31)),
      half = Math.max(0, Math.round(scale) - 1),
      gap = Math.max(2, Math.round(width * 0.1));
    for (let y = 0; y < width; y++)
      for (let x = 0; x < width; x++) {
        const dx = Math.abs(x - center),
          dy = Math.abs(y - center),
          distance = Math.hypot(dx, dy);
        ink[y * width + x] = Number(
          s.style === 'cross'
            ? (dx <= half && dy >= gap && dy <= radius) || (dy <= half && dx >= gap && dx <= radius)
            : s.style === 'dot'
              ? distance <= Math.max(2, Math.round(width * 0.09))
              : s.style === 'ring'
                ? Math.abs(distance - radius) <= Math.max(0.6, scale * 0.7)
                : false
        );
      }
    const rgb = [1, 3, 5].map((n) => parseInt(s.color.slice(n, n + 2), 16));
    for (let y = 0; y < width; y++)
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        let border = false;
        if (s.outline && !ink[index])
          for (let j = -Math.ceil(scale); j <= Math.ceil(scale) && !border; j++)
            for (let i = -Math.ceil(scale); i <= Math.ceil(scale); i++) {
              if (
                x + i >= 0 &&
                x + i < width &&
                y + j >= 0 &&
                y + j < width &&
                ink[(y + j) * width + x + i]
              ) {
                border = true;
                break;
              }
            }
        if (ink[index] || border) {
          rgba.set(ink[index] ? rgb : [15, 18, 21], index * 4);
          rgba[index * 4 + 3] = 255;
        }
      }
    return { width, hotspot: center, rgba };
  }
  function recolor(source, color) {
    if (!(source instanceof Uint8Array) || source.length > 145 * 145 * 4 || source.length % 4)
      throw Error('Invalid original pointer');
    const rgb = [1, 3, 5].map((n) => parseInt(valid({ color }).color.slice(n, n + 2), 16)),
      rgba = new Uint8Array(source);
    for (let i = 0; i < rgba.length; i += 4) {
      // Retain native transparency and dark outlines; tint the original light
      // artwork rather than replacing its silhouette with a new shape.
      const light = Math.max(source[i], source[i + 1], source[i + 2]) / 255;
      if (light > 0.2) for (let c = 0; c < 3; c++) rgba[i + c] = Math.round(rgb[c] * light);
    }
    return rgba;
  }
  const api = { styles, valid, pixels, recolor };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.blitzCrosshair = api;
})(typeof window === 'object' ? window : globalThis);
