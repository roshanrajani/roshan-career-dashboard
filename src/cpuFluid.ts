/** Compatibility solver: ordinary number arrays + Canvas 2D, no float GPU textures. */
export function startCpuFluid(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const ink = document.createElement("canvas");
  const inkCtx = ink.getContext("2d")!;
  let w = 0,
    h = 0,
    count = 0,
    frame = 0,
    until = 0,
    previousTime = 0;
  let u = new Float32Array(0),
    v = new Float32Array(0),
    red = new Float32Array(0),
    green = new Float32Array(0),
    blue = new Float32Array(0);
  let reverse = new Float32Array(0),
    temp = new Float32Array(0),
    nextU = new Float32Array(0),
    nextV = new Float32Array(0),
    pressure = new Float32Array(0),
    nextPressure = new Float32Array(0),
    divergence = new Float32Array(0),
    curl = new Float32Array(0);
  let pixels: ImageData;
  let last: { x: number; y: number } | null = null;
  let touchId: number | null = null;
  const reset = () => {
    last = null;
  };
  const clear = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    reset();
    touchId = null;
    for (const field of [u, v, red, green, blue]) field.fill(0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const scale = 300 / Math.max(rect.width, rect.height, 1);
    w = Math.max(32, Math.round(rect.width * scale));
    h = Math.max(32, Math.round(rect.height * scale));
    count = w * h;
    [
      u,
      v,
      red,
      green,
      blue,
      temp,
      reverse,
      nextU,
      nextV,
      pressure,
      nextPressure,
      divergence,
      curl,
    ] = Array.from({ length: 13 }, () => new Float32Array(count));
    ink.width = w;
    ink.height = h;
    pixels = inkCtx.createImageData(w, h);
    clear();
  };
  const sample = (field: Float32Array, x: number, y: number) => {
    x = Math.max(0, Math.min(w - 1.001, x));
    y = Math.max(0, Math.min(h - 1.001, y));
    const ix = Math.floor(x),
      iy = Math.floor(y),
      fx = x - ix,
      fy = y - iy,
      i = iy * w + ix;
    return (
      (field[i] * (1 - fx) + field[i + 1] * fx) * (1 - fy) +
      (field[i + w] * (1 - fx) + field[i + w + 1] * fx) * fy
    );
  };
  const advect = (
    source: Float32Array,
    dest: Float32Array,
    dt: number,
    decay: number,
  ) => {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        dest[i] = sample(source, x - u[i] * dt, y - v[i] * dt) * decay;
      }
  };
  // Correct the diffusion from backtracing, then clamp to nearby source values.
  // This preserves thin curls without allowing negative ink or bright fringes.
  const transportInk = (
    source: Float32Array,
    dest: Float32Array,
    dt: number,
    decay: number,
  ) => {
    advect(source, dest, dt, 1);
    advect(dest, reverse, -dt, 1);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const sx = Math.floor(Math.max(0, Math.min(w - 1.001, x - u[i] * dt)));
        const sy = Math.floor(Math.max(0, Math.min(h - 1.001, y - v[i] * dt)));
        const j = sy * w + sx;
        const low = Math.min(
          source[j],
          source[j + 1],
          source[j + w],
          source[j + w + 1],
        );
        const high = Math.max(
          source[j],
          source[j + 1],
          source[j + w],
          source[j + w + 1],
        );
        dest[i] =
          Math.max(
            low,
            Math.min(high, dest[i] + 0.5 * (source[i] - reverse[i])),
          ) * decay;
      }
  };
  const render = (now: number) => {
    frame = 0;
    if (document.hidden) return;
    const dt = Math.min(0.033, Math.max(0.001, (now - previousTime) / 1000));
    previousTime = now;
    advect(u, nextU, dt, Math.exp(-dt));
    advect(v, nextV, dt, Math.exp(-dt));
    [u, nextU] = [nextU, u];
    [v, nextV] = [nextV, v];
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        curl[i] = 0.5 * (v[i + 1] - v[i - 1] - u[i + w] + u[i - w]);
      }
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const fx = Math.abs(curl[i + w]) - Math.abs(curl[i - w]);
        const fy = Math.abs(curl[i - 1]) - Math.abs(curl[i + 1]);
        const gain = (dt * 18 * curl[i]) / (Math.hypot(fx, fy) + 0.0001);
        u[i] = Math.max(-120, Math.min(120, u[i] + fx * gain));
        v[i] = Math.max(-120, Math.min(120, v[i] + fy * gain));
      }
    pressure.fill(0);
    nextPressure.fill(0);
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        divergence[i] = 0.5 * (u[i + 1] - u[i - 1] + v[i + w] - v[i - w]);
      }
    for (let iteration = 0; iteration < 12; iteration++) {
      for (let y = 1; y < h - 1; y++)
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          nextPressure[i] =
            (pressure[i - 1] +
              pressure[i + 1] +
              pressure[i - w] +
              pressure[i + w] -
              divergence[i]) *
            0.25;
        }
      [pressure, nextPressure] = [nextPressure, pressure];
    }
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        u[i] -= 0.5 * (pressure[i + 1] - pressure[i - 1]);
        v[i] -= 0.5 * (pressure[i + w] - pressure[i - w]);
      }
    const decay = Math.exp(-dt * 1.6);
    transportInk(red, temp, dt, decay);
    [red, temp] = [temp, red];
    transportInk(green, temp, dt, decay);
    [green, temp] = [temp, green];
    transportInk(blue, temp, dt, decay);
    [blue, temp] = [temp, blue];
    for (let i = 0; i < count; i++) {
      const r = 1 - Math.exp(-red[i]),
        g = 1 - Math.exp(-green[i]),
        b = 1 - Math.exp(-blue[i]);
      const alpha = Math.max(r, g, b);
      pixels.data[i * 4] = alpha ? (r / alpha) * 255 : 0;
      pixels.data[i * 4 + 1] = alpha ? (g / alpha) * 255 : 0;
      pixels.data[i * 4 + 2] = alpha ? (b / alpha) * 255 : 0;
      pixels.data[i * 4 + 3] = alpha * 170;
    }
    inkCtx.putImageData(pixels, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    // Ease the last faint residue out before putting the animation to sleep.
    const fade = Math.max(0, Math.min(1, (until - now) / 750));
    ctx.globalAlpha = fade * fade * (3 - 2 * fade);
    ctx.drawImage(ink, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    if (now < until) frame = requestAnimationFrame(render);
    else clear();
  };
  const movePoint = (point: { clientX: number; clientY: number }) => {
    const bounds = canvas.getBoundingClientRect();
    const x = ((point.clientX - bounds.left) / bounds.width) * (w - 1),
      y = ((point.clientY - bounds.top) / bounds.height) * (h - 1);
    if (x < 0 || y < 0 || x >= w || y >= h) {
      reset();
      return;
    }
    if (last) {
      const dx = x - last.x,
        dy = y - last.y,
        length = Math.hypot(dx, dy);
      if (length > 0.02) {
        const steps = Math.min(24, Math.ceil(length)),
          radius = 2.8;
        const hue = performance.now() * 0.00007 + 0.25 + (x / w) * 0.22;
        const color = [0, 0.33, 0.67].map(
          (shift) =>
            0.08 +
            Math.pow(0.5 + 0.5 * Math.cos((hue - shift) * Math.PI * 2), 3),
        );
        for (let step = 1; step <= steps; step++) {
          const cx = last.x + (dx * step) / steps,
            cy = last.y + (dy * step) / steps;
          for (
            let iy = Math.max(0, Math.floor(cy - 7));
            iy < Math.min(h, cy + 7);
            iy++
          )
            for (
              let ix = Math.max(0, Math.floor(cx - 7));
              ix < Math.min(w, cx + 7);
              ix++
            ) {
              const i = iy * w + ix,
                weight = Math.exp(
                  -((ix - cx) ** 2 + (iy - cy) ** 2) / radius ** 2,
                );
              u[i] += Math.max(-50, Math.min(50, (dx * 13) / steps)) * weight;
              v[i] += Math.max(-50, Math.min(50, (dy * 13) / steps)) * weight;
              red[i] = Math.min(5, red[i] + color[0] * weight * 0.5);
              green[i] = Math.min(5, green[i] + color[1] * weight * 0.5);
              blue[i] = Math.min(5, blue[i] + color[2] * weight * 0.5);
            }
        }
        until = performance.now() + 5000;
        if (!frame) {
          previousTime = performance.now();
          frame = requestAnimationFrame(render);
        }
      }
    }
    last = { x, y };
  };
  const move = (e: PointerEvent) => {
    if (e.pointerType !== "touch" && touchId === null) movePoint(e);
  };
  const start = (e: TouchEvent) => {
    reset();
    touchId = e.touches.length === 1 ? e.touches[0].identifier : null;
    if (touchId !== null) movePoint(e.touches[0]);
  };
  const touchMove = (e: TouchEvent) => {
    if (e.touches.length === 1 && e.touches[0].identifier === touchId)
      movePoint(e.touches[0]);
    else end();
  };
  const end = () => {
    touchId = null;
    reset();
  };
  const scroll = () => {
    if (touchId === null) reset();
  };
  const exit = (e: PointerEvent) => {
    if (!e.relatedTarget && e.pointerType !== "touch") reset();
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  window.addEventListener("pointermove", move, { passive: true });
  window.addEventListener("pointerout", exit);
  window.addEventListener("touchstart", start, { passive: true });
  window.addEventListener("touchmove", touchMove, { passive: true });
  window.addEventListener("touchend", end, { passive: true });
  window.addEventListener("touchcancel", end, { passive: true });
  window.addEventListener("scroll", scroll, { passive: true });
  window.addEventListener("blur", end);
  document.addEventListener("visibilitychange", clear);
  return () => {
    clear();
    observer.disconnect();
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerout", exit);
    window.removeEventListener("touchstart", start);
    window.removeEventListener("touchmove", touchMove);
    window.removeEventListener("touchend", end);
    window.removeEventListener("touchcancel", end);
    window.removeEventListener("scroll", scroll);
    window.removeEventListener("blur", end);
    document.removeEventListener("visibilitychange", clear);
  };
}
