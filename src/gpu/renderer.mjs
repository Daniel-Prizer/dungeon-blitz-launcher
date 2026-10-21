import { LIMITS, validateSnapshot, FramePacer } from './scene.mjs';
import { DeadlineClock } from './deadline-clock.mjs';
const shader = `
struct Instance { matrix:vec4f, originSize:vec4f, uv:vec4f, tint:vec4f, colorOffset:vec4f, clip:vec4f }
struct View { size:vec2f, padding:vec2f }
@group(0) @binding(0) var<uniform> view:View;
@group(0) @binding(1) var<storage,read> objects:array<Instance>;
@group(0) @binding(2) var artwork:texture_2d<f32>;
@group(0) @binding(3) var linearSampler:sampler;
struct Vertex { @builtin(position) position:vec4f, @location(0) uv:vec2f, @location(1) tint:vec4f, @location(2) clip:vec4f, @location(3) colorOffset:vec4f, @location(4) uvBounds:vec4f }
@vertex fn vs(@builtin(vertex_index) index:u32,@builtin(instance_index) object:u32)->Vertex {
 let corners=array<vec2f,6>(vec2f(0,0),vec2f(1,0),vec2f(0,1),vec2f(0,1),vec2f(1,0),vec2f(1,1));
 let n=objects[object];let q=corners[index];let p=q*n.originSize.zw;
 let pixel=vec2f(n.matrix.x*p.x+n.matrix.z*p.y,n.matrix.y*p.x+n.matrix.w*p.y)+n.originSize.xy;
 var out:Vertex;out.position=vec4f(pixel/view.size*vec2f(2,-2)+vec2f(-1,1),0,1);out.uv=mix(n.uv.xy,n.uv.zw,q);out.tint=n.tint;out.clip=n.clip;out.colorOffset=n.colorOffset;out.uvBounds=n.uv;return out;
}
@fragment fn fs(in:Vertex)->@location(0) vec4f {
 if(in.position.x<in.clip.x||in.position.y<in.clip.y||in.position.x>=in.clip.z||in.position.y>=in.clip.w){discard;}
 let halfTexel=vec2f(0.5)/vec2f(textureDimensions(artwork));let pixel=textureSample(artwork,linearSampler,clamp(in.uv,in.uvBounds.xy+halfTexel,in.uvBounds.zw-halfTexel));
 let alpha=clamp(pixel.a*in.tint.a+in.colorOffset.a,0.0,1.0);
 let straight=pixel.rgb/max(pixel.a,0.000001);
 return vec4f(clamp(straight*in.tint.rgb+in.colorOffset.rgb,vec3f(0),vec3f(1))*alpha,alpha);
}`;
export class GpuSceneRenderer {
  static async create({
    width,
    height,
    requireHardware = true,
    maxNodes = 4096,
    maxFramesInFlight = 2,
    sampleCount = 4,
    individualArtwork = false,
  } = {}) {
    if (!navigator.gpu) throw Error('WebGPU unavailable');
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1 ||
      width > 4096 ||
      height > 4096 ||
      !Number.isInteger(maxNodes) ||
      maxNodes < 1 ||
      maxNodes > LIMITS.nodes ||
      !Number.isInteger(maxFramesInFlight) ||
      maxFramesInFlight < 1 ||
      maxFramesInFlight > 3
    )
      throw Error('Invalid render dimensions or node budget');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw Error('No WebGPU adapter');
    const info = adapter.info || {};
    const fallback = info.isFallbackAdapter ?? adapter.isFallbackAdapter ?? null;
    if (
      requireHardware &&
      (fallback !== false ||
        /swiftshader|software|basic render/i.test(
          [info.description, info.device, info.vendor].join(' ')
        ))
    )
      throw Error('Hardware adapter not established');
    if (![1, 4].includes(sampleCount)) throw Error('Unsupported multisampling');
    const device = await adapter.requestDevice();
    let self;
    try {
      self = new GpuSceneRenderer(device, {
        width,
        height,
        maxNodes,
        maxFramesInFlight,
        sampleCount,
        info: {
          vendor: info.vendor,
          architecture: info.architecture,
          device: info.device,
          description: info.description,
          isFallbackAdapter: fallback,
        },
      });
      self.individualArtwork = individualArtwork;
      await self.init();
      return self;
    } catch (e) {
      device.destroy();
      throw e;
    }
  }
  constructor(device, { width, height, maxNodes, maxFramesInFlight, sampleCount, info }) {
    this.device = device;
    this.width = width;
    this.height = height;
    this.maxNodes = maxNodes;
    this.maxFramesInFlight = maxFramesInFlight;
    this.sampleCount = sampleCount;
    this.inFlight = 0;
    this.adapterInfo = info;
    this.closed = false;
    this.updating = false;
    this.frameId = 0;
    this.artworkRevision = 0;
    this.art = [];
    this.stats = {
      completedFrames: 0,
      submissions: 0,
      failedFrames: 0,
      submittedPresents: 0,
      textureUpdates: 0,
      peakFramesInFlight: 0,
    };
    this.pixels = new Float32Array(maxNodes * 24);
    this.fault = null;
    device.lost.then((reason) => {
      this.fault = Error('GPU device lost: ' + reason.reason);
    });
    device.addEventListener('uncapturederror', (event) => {
      this.fault = Error(event.error.message);
    });
  }
  get busy() {
    return this.updating || this.inFlight > 0;
  }
  assertReady() {
    if (this.closed) throw Error('GPU renderer closed');
    if (this.fault) throw this.fault;
  }
  async init() {
    const d = this.device;
    d.pushErrorScope('validation');
    try {
      const module = d.createShaderModule({ code: shader });
      const compilation = await module.getCompilationInfo();
      const errors = compilation.messages.filter((m) => m.type === 'error');
      if (errors.length) throw Error(errors.map((e) => e.message).join('\n'));
      this.layout = d.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
          { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        ],
      });
      const layout = d.createPipelineLayout({ bindGroupLayouts: [this.layout] });
      this.pipelines = {};
      for (const blend of ['normal', 'add'])
        this.pipelines[blend] = await d.createRenderPipelineAsync({
          layout,
          vertex: { module, entryPoint: 'vs' },
          fragment: {
            module,
            entryPoint: 'fs',
            targets: [
              {
                format: 'rgba8unorm',
                blend: {
                  color: {
                    srcFactor: 'one',
                    dstFactor: blend === 'add' ? 'one' : 'one-minus-src-alpha',
                    operation: 'add',
                  },
                  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                },
              },
            ],
          },
          primitive: { topology: 'triangle-list' },
          multisample: { count: this.sampleCount },
        });
      this.uniform = d.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.instances = d.createBuffer({
        size: this.pixels.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      d.queue.writeBuffer(this.uniform, 0, new Float32Array([this.width, this.height, 0, 0]));
      this.target = d.createTexture({
        size: [this.width, this.height],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
      this.view = this.target.createView();
      if (this.sampleCount > 1)
        this.multisample = d.createTexture({
          size: [this.width, this.height],
          format: 'rgba8unorm',
          sampleCount: this.sampleCount,
          usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
      this.samplers = Object.fromEntries(
        ['linear', 'nearest'].map((filter) => [
          filter,
          d.createSampler({
            magFilter: filter,
            minFilter: filter,
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge',
          }),
        ])
      );
    } finally {
      const error = await d.popErrorScope();
      if (error) throw Error(error.message);
    }
  }
  async setArtwork(bitmaps) {
    return this.uploadArtwork(bitmaps, false);
  }
  async appendArtwork(bitmaps, expectedRevision) {
    if (expectedRevision !== this.artworkRevision || !this.atlases)
      throw Error('Stale artwork append');
    return this.uploadArtwork(bitmaps, true);
  }
  async uploadArtwork(bitmaps, append) {
    this.assertReady();
    if (this.busy) throw Error('Render in flight');
    if (
      !Array.isArray(bitmaps) ||
      !bitmaps.length ||
      bitmaps.length + (append ? this.art.length : 0) > LIMITS.textures
    )
      throw Error('Invalid artwork set');
    const previousRevision = this.artworkRevision,
      basePage = append ? this.atlases.length : 0;
    const limit = Math.min(LIMITS.dimension, this.device.limits.maxTextureDimension2D),
      positions = [],
      pages = [{ x: 1, y: 1, row: 0, width: 0, height: 0 }];
    for (const b of bitmaps) {
      if (
        !b ||
        !Number.isInteger(b.width) ||
        !Number.isInteger(b.height) ||
        b.width < 1 ||
        b.height < 1 ||
        b.width + 2 > limit ||
        b.height + 2 > limit
      )
        throw Error('Artwork exceeds atlas dimension');
      let page = pages.at(-1);
      if (page.x + b.width + 1 > limit) {
        page.x = 1;
        page.y += page.row + 2;
        page.row = 0;
      }
      if (page.y + b.height + 1 > limit) {
        page = { x: 1, y: 1, row: 0, width: 0, height: 0 };
        pages.push(page);
      }
      positions.push({
        x: page.x,
        y: page.y,
        width: b.width,
        height: b.height,
        page: pages.length - 1,
      });
      page.width = Math.max(page.width, page.x + b.width + 1);
      page.height = Math.max(page.height, page.y + b.height + 1);
      page.x += b.width + 2;
      page.row = Math.max(page.row, b.height);
    }
    if (this.individualArtwork) {
      pages.length = 0;
      positions.length = 0;
      for (const b of bitmaps) {
        positions.push({ x: 0, y: 0, width: b.width, height: b.height, page: pages.length });
        pages.push({ width: b.width, height: b.height });
      }
    }
    const bytes =
      pages.reduce((n, p) => n + p.width * p.height * 4, 0) + (append ? this.atlasBytes : 0);
    if (bytes > LIMITS.atlasBytes) throw Error('Artwork exceeds atlas bytes');
    this.updating = true;
    const d = this.device,
      candidates = [];
    d.pushErrorScope('validation');
    let error;
    try {
      for (let index = 0; index < pages.length; index++) {
        const page = pages[index],
          canvas = this.individualArtwork ? null : new OffscreenCanvas(page.width, page.height),
          ctx = canvas?.getContext('2d', { alpha: true });
        if (!this.individualArtwork && !ctx) throw Error('Atlas preprocessing unavailable');
        if (ctx) ctx.imageSmoothingEnabled = false;
        // One-time preprocessing with extruded gutters, never game frame capture.
        if (ctx)
          for (let i = 0; i < bitmaps.length; i++) {
            const b = bitmaps[i],
              p = positions[i];
            if (p.page !== index) continue;
            ctx.drawImage(b, p.x, p.y);
            ctx.drawImage(b, 0, 0, b.width, 1, p.x, p.y - 1, b.width, 1);
            ctx.drawImage(b, 0, b.height - 1, b.width, 1, p.x, p.y + p.height, b.width, 1);
            ctx.drawImage(b, 0, 0, 1, b.height, p.x - 1, p.y, 1, b.height);
            ctx.drawImage(b, b.width - 1, 0, 1, b.height, p.x + p.width, p.y, 1, b.height);
            for (const [sx, sy, dx, dy] of [
              [0, 0, -1, -1],
              [b.width - 1, 0, b.width, -1],
              [0, b.height - 1, -1, b.height],
              [b.width - 1, b.height - 1, b.width, b.height],
            ])
              ctx.drawImage(b, sx, sy, 1, 1, p.x + dx, p.y + dy, 1, 1);
          }
        const texture = d.createTexture({
          size: [page.width, page.height],
          format: 'rgba8unorm',
          usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_DST |
            GPUTextureUsage.RENDER_ATTACHMENT,
        });
        candidates.push({ texture, width: page.width, height: page.height });
        d.queue.copyExternalImageToTexture(
          { source: canvas || bitmaps[index] },
          { texture, premultipliedAlpha: true },
          [page.width, page.height]
        );
        candidates.at(-1).groups = Object.fromEntries(
          Object.entries(this.samplers).map(([filter, sampler]) => [
            filter,
            d.createBindGroup({
              layout: this.layout,
              entries: [
                { binding: 0, resource: { buffer: this.uniform } },
                { binding: 1, resource: { buffer: this.instances } },
                { binding: 2, resource: texture.createView() },
                { binding: 3, resource: sampler },
              ],
            }),
          ])
        );
      }
      await d.queue.onSubmittedWorkDone();
      this.assertReady();
    } catch (e) {
      error = e;
    } finally {
      const validation = await d.popErrorScope();
      if (validation && !error) error = Error(validation.message);
      this.updating = false;
    }
    if (error) {
      candidates.forEach((p) => p.texture.destroy());
      throw error;
    }
    if (!append) this.atlases?.forEach((p) => p.texture.destroy());
    this.atlases = append ? [...this.atlases, ...candidates] : candidates;
    this.atlasBytes = bytes;
    this.artworkRevision++;
    const added = positions.map((p) => {
      const page = pages[p.page];
      return {
        ...p,
        page: p.page + basePage,
        reservedWidth: p.width,
        reservedHeight: p.height,
        uv: [
          p.x / page.width,
          p.y / page.height,
          (p.x + p.width) / page.width,
          (p.y + p.height) / page.height,
        ],
      };
    });
    this.art = append ? [...this.art, ...added] : added;
    return {
      kind: append ? 'append' : 'reset',
      previousRevision,
      artworkRevision: this.artworkRevision,
      pages: pages.map((p) => ({ width: p.width, height: p.height })),
      bytes,
      images: bitmaps.length,
    };
  }
  async reuseArtwork(changes, expectedRevision) {
    return this.updateArtwork(changes, expectedRevision, true);
  }
  async updateArtwork(changes, expectedRevision, reuse = false) {
    this.assertReady();
    if (this.busy) throw Error('Render in flight');
    if (
      expectedRevision !== this.artworkRevision ||
      !Array.isArray(changes) ||
      !changes.length ||
      changes.length > LIMITS.textures
    )
      throw Error('Stale or invalid artwork update');
    const indices = new Set();
    for (const { index, bitmap } of changes) {
      const p = this.art[index];
      if (
        !Number.isInteger(index) ||
        indices.has(index) ||
        !p ||
        !bitmap ||
        !Number.isInteger(bitmap.width) ||
        !Number.isInteger(bitmap.height) ||
        bitmap.width < 1 ||
        bitmap.height < 1 ||
        (reuse
          ? bitmap.width > p.reservedWidth || bitmap.height > p.reservedHeight
          : bitmap.width !== p.width || bitmap.height !== p.height)
      )
        throw Error('Artwork update dimensions changed');
      indices.add(index);
    }
    // Update only dirty atlas rectangles. Every native cache mutation must have
    // a reviewed revision notification before this can be wired into a live game.
    this.updating = true;
    const d = this.device;
    d.pushErrorScope('validation');
    let failure;
    try {
      for (const { index, bitmap } of changes) {
        const p = { ...this.art[index], width: bitmap.width, height: bitmap.height };
        if (this.individualArtwork) {
          d.queue.copyExternalImageToTexture(
            { source: bitmap },
            { texture: this.atlases[p.page].texture, premultipliedAlpha: true },
            [p.width, p.height]
          );
          continue;
        }
        const canvas = new OffscreenCanvas(p.width + 2, p.height + 2),
          ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(bitmap, 1, 1);
        ctx.drawImage(bitmap, 0, 0, p.width, 1, 1, 0, p.width, 1);
        ctx.drawImage(bitmap, 0, p.height - 1, p.width, 1, 1, p.height + 1, p.width, 1);
        ctx.drawImage(bitmap, 0, 0, 1, p.height, 0, 1, 1, p.height);
        ctx.drawImage(bitmap, p.width - 1, 0, 1, p.height, p.width + 1, 1, 1, p.height);
        for (const [sx, sy, dx, dy] of [
          [0, 0, 0, 0],
          [p.width - 1, 0, p.width + 1, 0],
          [0, p.height - 1, 0, p.height + 1],
          [p.width - 1, p.height - 1, p.width + 1, p.height + 1],
        ])
          ctx.drawImage(bitmap, sx, sy, 1, 1, dx, dy, 1, 1);
        d.queue.copyExternalImageToTexture(
          { source: canvas },
          {
            texture: this.atlases[p.page].texture,
            origin: [p.x - 1, p.y - 1],
            premultipliedAlpha: true,
          },
          [p.width + 2, p.height + 2]
        );
      }
      await d.queue.onSubmittedWorkDone();
      this.assertReady();
    } catch (e) {
      failure = e;
    } finally {
      const error = await d.popErrorScope();
      if (error && !failure) failure = Error(error.message);
      this.updating = false;
    }
    if (failure) {
      this.fault = Error('GPU artwork update failed; native fallback required');
      throw failure;
    }
    if (reuse)
      for (const { index, bitmap } of changes) {
        const p = this.art[index],
          page = this.atlases[p.page];
        this.art[index] = {
          ...p,
          width: bitmap.width,
          height: bitmap.height,
          uv: [
            p.x / page.width,
            p.y / page.height,
            (p.x + bitmap.width) / page.width,
            (p.y + bitmap.height) / page.height,
          ],
        };
      }
    const previousRevision = this.artworkRevision;
    this.artworkRevision++;
    this.stats.textureUpdates += changes.length;
    return reuse
      ? {
          kind: 'reuse',
          previousRevision,
          artworkRevision: this.artworkRevision,
          changedIndices: [...indices],
        }
      : this.artworkRevision;
  }
  attachCanvas(canvas) {
    this.assertReady();
    if (this.busy) throw Error('Render in flight');
    if (!canvas || typeof canvas.getContext !== 'function') throw Error('Invalid owned canvas');
    const context = canvas.getContext('webgpu');
    if (!context) throw Error('WebGPU canvas unavailable');
    this.detachCanvas();
    canvas.width = this.width;
    canvas.height = this.height;
    context.configure({
      device: this.device,
      format: 'rgba8unorm',
      alphaMode: 'premultiplied',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST,
    });
    this.canvasContext = context;
    this.lastFrame = null;
  }
  detachCanvas() {
    if (this.busy) throw Error('Render in flight');
    this.canvasContext?.unconfigure();
    this.canvasContext = null;
  }
  async render(input, options) {
    return this.submit(input, options);
  }
  submit(input, { clear = [0, 0, 0, 0], skipUnchanged = false } = {}) {
    this.assertReady();
    if (this.updating || this.inFlight >= this.maxFramesInFlight)
      throw Error('Render queue full or artwork update in flight');
    if (!this.atlases) throw Error('Artwork not initialized');
    const scene = validateSnapshot(input);
    if (scene.artworkRevision !== this.artworkRevision) throw Error('Stale artwork revision');
    if (
      scene.nodes.length > this.maxNodes ||
      !Array.isArray(clear) ||
      clear.length !== 4 ||
      clear.some((n) => !Number.isFinite(n) || n < 0 || n > 1)
    )
      throw Error('Render budget exceeded');
    let at = 0;
    const batches = [];
    for (const n of scene.nodes) {
      const art = this.art[n.texture];
      if (!art) throw Error('Missing native artwork');
      this.pixels.set(
        [
          n.matrix[0],
          n.matrix[1],
          n.matrix[2],
          n.matrix[3],
          n.matrix[4],
          n.matrix[5],
          n.size[0],
          n.size[1],
          ...art.uv,
          ...n.tint,
          ...n.offset,
          ...n.clip,
        ],
        at * 24
      );
      const previous = batches.at(-1);
      if (
        previous?.blend === n.blend &&
        previous.page === art.page &&
        previous.sampling === n.sampling
      )
        previous.count++;
      else
        batches.push({ blend: n.blend, page: art.page, sampling: n.sampling, start: at, count: 1 });
      at++;
    }
    const words = new Uint32Array(this.pixels.buffer, 0, at * 24),
      batchKey = batches.map((b) => [b.blend, b.page, b.sampling, b.count].join(':')).join('|'),
      last = this.lastFrame;
    if (
      skipUnchanged &&
      last &&
      last.revision === this.artworkRevision &&
      last.batches === batchKey &&
      last.words.length === words.length &&
      last.clear.every((v, i) => v === clear[i]) &&
      last.words.every((v, i) => v === words[i])
    ) {
      this.stats.skippedUnchanged = (this.stats.skippedUnchanged || 0) + 1;
      const skipped = Promise.resolve({ skipped: true, sequence: scene.sequence });
      skipped.skipped = true;
      return skipped;
    }
    const start = performance.now();
    let completion;
    try {
      const d = this.device;
      if (at) d.queue.writeBuffer(this.instances, 0, this.pixels.buffer, 0, at * 96);
      const encoder = d.createCommandEncoder();
      const attachment = {
        view: this.multisample ? this.multisample.createView() : this.view,
        clearValue: clear,
        loadOp: 'clear',
        storeOp: this.multisample ? 'discard' : 'store',
      };
      if (this.multisample) attachment.resolveTarget = this.view;
      const pass = encoder.beginRenderPass({ colorAttachments: [attachment] });
      for (const batch of batches) {
        pass.setBindGroup(0, this.atlases[batch.page].groups[batch.sampling]);
        pass.setPipeline(this.pipelines[batch.blend]);
        pass.draw(6, batch.count, 0, batch.start);
      }
      pass.end();
      if (this.canvasContext)
        encoder.copyTextureToTexture(
          { texture: this.target },
          { texture: this.canvasContext.getCurrentTexture() },
          [this.width, this.height]
        );
      d.queue.submit([encoder.finish()]);
      this.stats.submissions++;
      if (this.canvasContext) this.stats.submittedPresents++;
      completion = d.queue.onSubmittedWorkDone();
    } catch (e) {
      this.stats.failedFrames++;
      throw e;
    }
    // GPU queue order also orders each writeBuffer before its matching draw.
    // At most three submissions can be pending; completion, not submission,
    // advances the rendered-frame counter. No unbounded latency queue.
    this.lastFrame = {
      revision: this.artworkRevision,
      batches: batchKey,
      words: new Uint32Array(words),
      clear: [...clear],
    };
    const frameId = ++this.frameId;
    this.inFlight++;
    this.stats.peakFramesInFlight = Math.max(this.stats.peakFramesInFlight, this.inFlight);
    return completion
      .then(() => {
        this.assertReady();
        this.stats.completedFrames++;
        return {
          frameId,
          sequence: scene.sequence,
          sceneTime: scene.time,
          cpuAndGpuMs: performance.now() - start,
          nodes: at,
          drawCalls: batches.length,
        };
      })
      .catch((e) => {
        this.stats.failedFrames++;
        throw e;
      })
      .finally(() => {
        this.inFlight--;
      });
  }
  async readPixels() {
    this.assertReady();
    if (this.busy) throw Error('Render in flight');
    this.updating = true;
    const row = Math.ceil((this.width * 4) / 256) * 256,
      b = this.device.createBuffer({
        size: row * this.height,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
    try {
      const e = this.device.createCommandEncoder();
      e.copyTextureToBuffer({ texture: this.target }, { buffer: b, bytesPerRow: row }, [
        this.width,
        this.height,
      ]);
      this.device.queue.submit([e.finish()]);
      await b.mapAsync(GPUMapMode.READ);
      const mapped = new Uint8Array(b.getMappedRange()),
        pixels = new Uint8Array(this.width * this.height * 4);
      for (let y = 0; y < this.height; y++)
        pixels.set(mapped.subarray(y * row, y * row + this.width * 4), y * this.width * 4);
      b.unmap();
      return pixels;
    } finally {
      b.destroy();
      this.updating = false;
    }
  }
  close() {
    if (this.closed) return;
    if (this.busy) throw Error('Render in flight');
    this.detachCanvas();
    this.closed = true;
    this.atlases?.forEach((p) => p.texture.destroy());
    for (const resource of [this.target, this.multisample, this.instances, this.uniform])
      resource?.destroy();
    this.device.destroy();
  }
}
// Offscreen completed-render benchmark. No monitor/scanout FPS claim. One
// submission in flight; no per-frame readback. Hidden tests call this directly,
// never attach it to a player's game process or alter its scheduling.
export async function measure(
  renderer,
  sceneAt,
  { cap = 240, frames = 120, signal, clock = new DeadlineClock() } = {}
) {
  if (!Number.isInteger(frames) || frames < 1 || frames > 2000)
    throw Error('Invalid frame sample count');
  const pacer = new FramePacer(cap);
  await clock.wait(1);
  const start = performance.now(),
    times = [];
  let previous = start;
  try {
    for (let i = 0; i < frames; i++) {
      if (signal?.aborted) throw Error('Benchmark cancelled');
      const now = performance.now();
      pacer.advance(now);
      await renderer.render(sceneAt(now - start));
      const end = performance.now();
      times.push(end - previous);
      previous = end;
      if (i + 1 < frames) await clock.wait(Math.max(0, pacer.deadline - end));
    }
    const elapsed = performance.now() - start,
      sorted = [...times].sort((a, b) => a - b),
      percentile = (p) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
    return {
      metric: 'completed-offscreen-scene-renders',
      frames,
      elapsedMs: elapsed,
      fps: (frames * 1000) / elapsed,
      cap,
      pacingClock: clock.mode,
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      p99Ms: percentile(0.99),
      displayedFPS: null,
      simulationFPS: null,
      adapter: renderer.adapterInfo,
    };
  } finally {
    clock.close();
  }
}
// Diagnostic maximum-throughput sample, not the user-facing capped player.
// Await every GPU completion and report offscreen work explicitly; no timer,
// draw-call submission counter or duplicated capture masquerades as game FPS.
export async function measureThroughput(
  renderer,
  sceneAt,
  { frames = 16, signal, pipelineDepth = 1 } = {}
) {
  if (
    !Number.isInteger(frames) ||
    frames < 2 ||
    frames > 120 ||
    !Number.isInteger(pipelineDepth) ||
    pipelineDepth < 1 ||
    pipelineDepth > renderer.maxFramesInFlight
  )
    throw Error('Invalid throughput sample');
  const start = performance.now(),
    costs = [],
    pending = [];
  let failure;
  try {
    for (let i = 0; i < frames; i++) {
      if (signal?.aborted) throw Error('Throughput sample cancelled');
      if (pending.length >= pipelineDepth) costs.push((await pending.shift()).cpuAndGpuMs);
      const task = renderer.submit(sceneAt(performance.now() - start));
      task.catch(() => {});
      pending.push(task);
    }
  } catch (e) {
    failure = e;
  }
  for (const task of pending)
    try {
      costs.push((await task).cpuAndGpuMs);
    } catch (e) {
      failure ??= e;
    }
  if (failure) throw failure;
  const elapsed = performance.now() - start;
  return {
    metric: 'completed-offscreen-renderer-throughput',
    frames,
    pipelineDepth,
    elapsedMs: elapsed,
    fps: (frames * 1000) / elapsed,
    meanCpuAndGpuMs: costs.reduce((a, b) => a + b, 0) / frames,
    displayedFPS: null,
    simulationFPS: null,
  };
}
