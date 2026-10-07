import { useEffect, useRef } from 'react';
import { startCpuFluid } from './cpuFluid';

// Persistent velocity, pressure and ink fields: a GPU fluid solver.
const vertex = `#version 300 es
in vec2 position; out vec2 uv;
void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
// Explicit sampler precision matters for float textures on ANGLE-backed GPUs.
// Manual bilinear filtering avoids depending on float-linear driver extensions.
const header = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 uv; out vec4 result;
uniform sampler2D source, velocity, pressure, curl;
uniform vec2 texel; uniform float dt;
uniform int sourceKind, outputKind;
#ifdef PACKED_FIELDS
float unpackSigned(vec2 bytes){
  vec2 b=floor(bytes*255.+.5);
  return (b.x*256.+b.y-32768.)/32.;
}
vec2 packSigned(float value){
  float n=floor(clamp(value*32.+32768.,0.,65535.)+.5);
  return vec2(floor(n/256.),mod(n,256.))/255.;
}
#endif
vec4 readField(sampler2D field,vec2 p,int kind){
  vec4 value=texture(field,p);
#ifdef PACKED_FIELDS
  if(kind==1)return vec4(unpackSigned(value.rg),unpackSigned(value.ba),0.,0.);
  if(kind==2)return vec4(unpackSigned(value.rg),0.,0.,0.);
  return vec4(value.rgb*value.rgb*8.,0.);
#else
  return value;
#endif
}
vec4 encodeField(vec4 value,int kind){
#ifdef PACKED_FIELDS
  if(kind==1)return vec4(packSigned(value.x),packSigned(value.y));
  if(kind==2)return vec4(packSigned(value.x),0.,1.);
  if(kind==0)return vec4(sqrt(clamp(value.rgb/8.,0.,1.)),1.);
#endif
  return value;
}
vec4 linearSample(sampler2D field,vec2 p,int kind){
  vec2 size=vec2(textureSize(field,0)),cell=p*size-.5,f=fract(cell);
  vec2 base=(floor(cell)+.5)/size,s=1./size;
  return mix(mix(readField(field,base,kind),readField(field,base+vec2(s.x,0.),kind),f.x),
    mix(readField(field,base+vec2(0.,s.y),kind),readField(field,base+s,kind),f.x),f.y);
}
`;
const shaders = {
  advect: `uniform float decay;
    void main(){result=linearSample(source,uv-dt*linearSample(velocity,uv,1).xy*texel,sourceKind)*exp(-decay*dt);}`,
  splat: `uniform vec2 point,aspect; uniform vec3 amount; uniform float radius;
    void main(){vec2 d=(uv-point)*aspect;result=readField(source,uv,sourceKind)+vec4(amount*exp(-dot(d,d)/radius),0.);}`,
  curl: `void main(){
    float l=readField(velocity,uv-vec2(texel.x,0.),1).y,r=readField(velocity,uv+vec2(texel.x,0.),1).y;
    float b=readField(velocity,uv-vec2(0.,texel.y),1).x,t=readField(velocity,uv+vec2(0.,texel.y),1).x;
    result=vec4(.5*(r-l-t+b),0.,0.,0.);}`,
  vorticity: `void main(){
    float l=abs(readField(curl,uv-vec2(texel.x,0.),2).x),r=abs(readField(curl,uv+vec2(texel.x,0.),2).x);
    float b=abs(readField(curl,uv-vec2(0.,texel.y),2).x),t=abs(readField(curl,uv+vec2(0.,texel.y),2).x);
    vec2 force=.5*vec2(t-b,l-r);force/=length(force)+.0001;force*=18.*readField(curl,uv,2).x;
    result=vec4(clamp(readField(velocity,uv,1).xy+dt*force,-600.,600.),0.,0.);}`,
  divergence: `void main(){
    vec2 c=readField(velocity,uv,1).xy;
    float l=readField(velocity,uv-vec2(texel.x,0.),1).x,r=readField(velocity,uv+vec2(texel.x,0.),1).x;
    float b=readField(velocity,uv-vec2(0.,texel.y),1).y,t=readField(velocity,uv+vec2(0.,texel.y),1).y;
    if(uv.x<texel.x)l=-c.x;if(uv.x>1.-texel.x)r=-c.x;
    if(uv.y<texel.y)b=-c.y;if(uv.y>1.-texel.y)t=-c.y;
    result=vec4(.5*(r-l+t-b),0.,0.,0.);}`,
  pressure: `void main(){
    float l=readField(pressure,uv-vec2(texel.x,0.),2).x,r=readField(pressure,uv+vec2(texel.x,0.),2).x;
    float b=readField(pressure,uv-vec2(0.,texel.y),2).x,t=readField(pressure,uv+vec2(0.,texel.y),2).x;
    result=vec4((l+r+b+t-readField(source,uv,sourceKind).x)*.25,0.,0.,0.);}`,
  project: `void main(){
    float l=readField(pressure,uv-vec2(texel.x,0.),2).x,r=readField(pressure,uv+vec2(texel.x,0.),2).x;
    float b=readField(pressure,uv-vec2(0.,texel.y),2).x,t=readField(pressure,uv+vec2(0.,texel.y),2).x;
    result=vec4(readField(velocity,uv,1).xy-vec2(r-l,t-b)*.5,0.,0.);}`,
  display: `void main(){
    vec3 color=1.-exp(-max(linearSample(source,uv,sourceKind).rgb,0.)*.85);
    float strength=max(color.r,max(color.g,color.b));
    result=vec4(color*.68,strength*.68);}`,
};

function startFluid(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    depth: false,
  });
  if (!gl) return () => {};
  const packed =
    /Windows/i.test(navigator.userAgent) ||
    new URLSearchParams(location.search).get('fluid') === 'packed' ||
    !gl.getExtension('EXT_color_buffer_float');
  // Dithering must be off: each byte stores data, not a display color.
  gl.disable(gl.DITHER);
  gl.disable(gl.BLEND);
  const programs: WebGLProgram[] = [],
    textures: WebGLTexture[] = [],
    framebuffers: WebGLFramebuffer[] = [];
  let frame = 0,
    stopped = false;
  const buffer = gl.createBuffer();
  const cleanup = () => {
    stopped = true;
    cancelAnimationFrame(frame);
    programs.forEach((p) => gl.deleteProgram(p));
    textures.forEach((t) => gl.deleteTexture(t));
    framebuffers.forEach((f) => gl.deleteFramebuffer(f));
    gl.deleteBuffer(buffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  };
  try {
    const compile = (type: number, text: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(message || 'Fluid shader failed');
      }
      return shader;
    };
    const passes = Object.fromEntries(
      Object.entries(shaders).map(([name, fragment]) => {
        const program = gl.createProgram()!;
        programs.push(program);
        const vs = compile(gl.VERTEX_SHADER, vertex),
          fs = compile(
            gl.FRAGMENT_SHADER,
            (packed
              ? header.replace('#version 300 es', '#version 300 es\n#define PACKED_FIELDS')
              : header) +
              fragment.replace(/result=([^;]+);/g, 'result=encodeField($1,outputKind);'),
          );
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.bindAttribLocation(program, 0, 'position');
        gl.linkProgram(program);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS))
          throw new Error('Fluid program failed');
        const uniforms = Object.fromEntries(
          [
            'sourceKind',
            'outputKind',
            'source',
            'velocity',
            'pressure',
            'curl',
            'texel',
            'dt',
            'decay',
            'point',
            'aspect',
            'amount',
            'radius',
          ].map((key) => [key, gl.getUniformLocation(program, key)]),
        );
        return [name, { program, uniforms }];
      }),
    );
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    type Target = {
      texture: WebGLTexture;
      fbo: WebGLFramebuffer;
      width: number;
      height: number;
      kind: number;
    };
    const clearTarget = (target: Target | null) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target?.fbo ?? null);
      if (packed && target?.kind === 1) gl.clearColor(128 / 255, 0, 128 / 255, 0);
      else if (packed && target?.kind === 2) gl.clearColor(128 / 255, 0, 0, 1);
      else gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    };
    const target = (width: number, height: number, kind: number): Target => {
      const texture = gl.createTexture()!,
        fbo = gl.createFramebuffer()!;
      textures.push(texture);
      framebuffers.push(fbo);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        packed ? gl.RGBA8 : gl.RGBA16F,
        width,
        height,
        0,
        gl.RGBA,
        packed ? gl.UNSIGNED_BYTE : gl.HALF_FLOAT,
        null,
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
        throw new Error('Fluid framebuffer unavailable');
      const result = { texture, fbo, width, height, kind };
      clearTarget(result);
      return result;
    };
    const pair = (w: number, h: number, kind: number) => ({
      read: target(w, h, kind),
      write: target(w, h, kind),
      swap() {
        [this.read, this.write] = [this.write, this.read];
      },
    });
    const rect = canvas.getBoundingClientRect();
    let aspect = rect.width / Math.max(rect.height, 1);
    let simW = Math.round(160 * Math.max(1, aspect)),
      simH = Math.round(160 / Math.min(1, aspect));
    const dyeW = Math.min(1536, Math.round(640 * Math.max(1, aspect))),
      dyeH = Math.min(1536, Math.round(640 / Math.min(1, aspect)));
    const velocity = pair(simW, simH, 1),
      dye = pair(dyeW, dyeH, 0),
      pressure = pair(simW, simH, 2);
    const curl = target(simW, simH, 2),
      divergence = target(simW, simH, 2);
    const draw = (
      name: string,
      dest: Target | null,
      inputs: Record<string, Target>,
      values: Record<string, number | number[]> = {},
    ) => {
      const pass = passes[name];
      gl.useProgram(pass.program);
      gl.uniform1i(pass.uniforms.sourceKind, inputs.source?.kind ?? 0);
      gl.uniform1i(pass.uniforms.outputKind, dest?.kind ?? -1);
      Object.entries(inputs).forEach(([key, input], unit) => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, input.texture);
        gl.uniform1i(pass.uniforms[key], unit);
      });
      gl.uniform2f(pass.uniforms.texel, 1 / simW, 1 / simH);
      Object.entries(values).forEach(([key, value]) => {
        if (typeof value === 'number') gl.uniform1f(pass.uniforms[key], value);
        else if (value.length === 2) gl.uniform2fv(pass.uniforms[key], value);
        else gl.uniform3fv(pass.uniforms[key], value);
      });
      gl.bindFramebuffer(gl.FRAMEBUFFER, dest?.fbo ?? null);
      gl.viewport(0, 0, dest?.width ?? canvas.width, dest?.height ?? canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    let lastPoint: { x: number; y: number } | null = null;
    const queue: Array<{ x: number; y: number; dx: number; dy: number }> = [];
    let activeUntil = 0,
      lastTime = 0;
    const reset = () => {
      lastPoint = null;
    };
    const movePoint = (event: { clientX: number; clientY: number }) => {
      const bounds = canvas.getBoundingClientRect(),
        x = (event.clientX - bounds.left) / bounds.width,
        y = 1 - (event.clientY - bounds.top) / bounds.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) {
        reset();
        return;
      }
      if (lastPoint) {
        const dx = x - lastPoint.x,
          dy = y - lastPoint.y;
        if (Math.hypot(dx, dy) > 0.0002) {
          const count = Math.min(8, Math.ceil(Math.hypot(dx * aspect, dy) / 0.018));
          for (let i = 1; i <= count; i++)
            queue.push({
              x: lastPoint.x + (dx * i) / count,
              y: lastPoint.y + (dy * i) / count,
              dx: dx / count,
              dy: dy / count,
            });
          if (queue.length > 32) queue.splice(0, queue.length - 32);
          activeUntil = performance.now() + 6000;
          if (!frame) {
            lastTime = performance.now();
            frame = requestAnimationFrame(render);
          }
        }
      }
      lastPoint = { x, y };
    };
    // Touch events continue during native scrolling, unlike pointermove which
    // browsers may cancel when a pan starts. Passive listeners keep scrolling free.
    let touchId: number | null = null;
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' && touchId === null) movePoint(event);
    };
    const touchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        touchId = null;
        reset();
        return;
      }
      const touch = event.touches[0];
      touchId = touch.identifier;
      reset();
      movePoint(touch);
      if (lastPoint) {
        queue.push({ ...lastPoint, dx: 0, dy: 0 });
        activeUntil = performance.now() + 6000;
        if (!frame) {
          lastTime = performance.now();
          frame = requestAnimationFrame(render);
        }
      }
    };
    const touchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        touchId = null;
        reset();
        return;
      }
      const touch = event.touches[0];
      if (touch.identifier === touchId) movePoint(touch);
    };
    const touchEnd = () => {
      touchId = null;
      reset();
    };
    const scroll = () => {
      if (touchId === null) reset();
    };
    const render = (now: number) => {
      frame = 0;
      if (stopped || document.hidden) return;
      const dt = Math.min((now - lastTime) / 1000, 1 / 30);
      lastTime = now;
      for (const point of queue.splice(0)) {
        const hue = now * 0.00012 + 0.25 + point.x * 0.22;
        const color = [0, 0.33, 0.67].map(
          (shift) => 0.12 + 1.5 * Math.pow(0.5 + 0.5 * Math.cos((hue - shift) * Math.PI * 2), 3),
        );
        const params = {
          point: [point.x, point.y],
          aspect: [aspect, 1],
          radius: 0.00032,
        };
        draw(
          'splat',
          velocity.write,
          { source: velocity.read },
          {
            ...params,
            amount: [
              Math.max(-180, Math.min(180, point.dx * simW * 18)),
              Math.max(-180, Math.min(180, point.dy * simH * 18)),
              0,
            ],
          },
        );
        velocity.swap();
        draw('splat', dye.write, { source: dye.read }, { ...params, amount: color });
        dye.swap();
      }
      draw(
        'advect',
        velocity.write,
        { source: velocity.read, velocity: velocity.read },
        { dt, decay: 1.2 },
      );
      velocity.swap();
      draw('curl', curl, { velocity: velocity.read });
      draw('vorticity', velocity.write, { velocity: velocity.read, curl }, { dt });
      velocity.swap();
      draw('divergence', divergence, { velocity: velocity.read });
      clearTarget(pressure.read);
      for (let i = 0; i < 18; i++) {
        draw('pressure', pressure.write, {
          pressure: pressure.read,
          source: divergence,
        });
        pressure.swap();
      }
      draw('project', velocity.write, {
        velocity: velocity.read,
        pressure: pressure.read,
      });
      velocity.swap();
      draw('advect', dye.write, { source: dye.read, velocity: velocity.read }, { dt, decay: 1.1 });
      dye.swap();
      draw('display', null, { source: dye.read });
      if (now < activeUntil) frame = requestAnimationFrame(render);
      else {
        clearTarget(null);
      }
    };
    const resize = () => {
      const bounds = canvas.getBoundingClientRect(),
        dpr = Math.min(devicePixelRatio || 1, 1.5);
      aspect = bounds.width / Math.max(bounds.height, 1);
      const width = Math.max(1, Math.round(bounds.width * dpr));
      const height = Math.max(1, Math.round(bounds.height * dpr));
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      const nextW = Math.round(160 * Math.max(1, aspect));
      const nextH = Math.round(160 / Math.min(1, aspect));
      if (nextW !== simW || nextH !== simH) {
        simW = nextW;
        simH = nextH;
        // Resize both axes together so the dye texture keeps square cells,
        // including when a desktop viewport becomes a narrow mobile viewport.
        const dyeScale = Math.min(640, 1536 / Math.max(aspect, 1 / aspect));
        for (const field of [
          velocity.read,
          velocity.write,
          pressure.read,
          pressure.write,
          curl,
          divergence,
          dye.read,
          dye.write,
        ]) {
          field.width = field.kind === 0 ? Math.round(dyeScale * Math.max(1, aspect)) : simW;
          field.height = field.kind === 0 ? Math.round(dyeScale / Math.min(1, aspect)) : simH;
          gl.bindTexture(gl.TEXTURE_2D, field.texture);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            packed ? gl.RGBA8 : gl.RGBA16F,
            field.width,
            field.height,
            0,
            gl.RGBA,
            packed ? gl.UNSIGNED_BYTE : gl.HALF_FLOAT,
            null,
          );
          clearTarget(field);
        }
        queue.length = 0;
      }
      // Mobile browser chrome resizes the viewport during a swipe. Keep the
      // active finger, but rebase its next sample to avoid a jump in velocity.
      reset();
    };
    const visibility = () => {
      touchId = null;
      reset();
      queue.length = 0;
      cancelAnimationFrame(frame);
      frame = 0;
      for (const t of [velocity.read, velocity.write, dye.read, dye.write]) {
        clearTarget(t);
      }
      clearTarget(null);
    };
    const exit = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' && !event.relatedTarget) reset();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('touchstart', touchStart, { passive: true });
    window.addEventListener('touchmove', touchMove, { passive: true });
    window.addEventListener('touchend', touchEnd, { passive: true });
    window.addEventListener('touchcancel', touchEnd, { passive: true });
    window.addEventListener('pointerout', exit);
    window.addEventListener('blur', touchEnd);
    window.addEventListener('scroll', scroll, { passive: true });
    document.addEventListener('visibilitychange', visibility);
    return () => {
      observer.disconnect();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('touchstart', touchStart);
      window.removeEventListener('touchmove', touchMove);
      window.removeEventListener('touchend', touchEnd);
      window.removeEventListener('touchcancel', touchEnd);
      window.removeEventListener('pointerout', exit);
      window.removeEventListener('blur', touchEnd);
      window.removeEventListener('scroll', scroll);
      document.removeEventListener('visibilitychange', visibility);
      cleanup();
    };
  } catch (error) {
    console.warn('Fluid effect unavailable:', error);
    cleanup();
    return () => {};
  }
}

export function FluidCanvas() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let dispose = () => {};
    const setup = () => {
      dispose();
      dispose = () => {};
      if (!motion.matches) {
        // Windows uses Canvas 2D to avoid the reported WebGL corruption.
        // Other platforms retain the existing WebGL effect.
        const compatible =
          /Windows/i.test(navigator.userAgent) ||
          new URLSearchParams(location.search).get('fluid') === 'cpu';
        dispose = compatible ? startCpuFluid(element) : startFluid(element);
      }
    };
    setup();
    motion.addEventListener('change', setup);
    return () => {
      dispose();
      motion.removeEventListener('change', setup);
    };
  }, []);
  return <canvas ref={canvas} className="fluid-canvas" aria-hidden="true" />;
}
