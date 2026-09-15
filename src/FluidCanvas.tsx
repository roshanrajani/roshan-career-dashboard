import { useEffect, useRef } from 'react';

const vertexShader = `
  attribute vec2 a_position;
  varying vec2 v_uv;

  void main() {
    v_uv = a_position * .5 + .5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;

  uniform float u_time;
  uniform float u_aspect;
  uniform float u_pointerActive;
  uniform float u_pointerSpeed;
  uniform vec3 u_theme;
  uniform vec2 u_pointer;
  uniform vec4 u_trail[8];
  varying vec2 v_uv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 cell = floor(p);
    vec2 local = fract(p);
    local = local * local * (3.0 - 2.0 * local);
    return mix(
      mix(hash(cell), hash(cell + vec2(1.0, 0.0)), local.x),
      mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), local.x),
      local.y
    );
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = .5;
    for (int octave = 0; octave < 4; octave++) {
      value += amplitude * noise(p);
      p = p * 2.03 + 17.17;
      amplitude *= .5;
    }
    return value;
  }

  void main() {
    float time = u_time;
    vec2 position = (v_uv - .5) * vec2(u_aspect, 1.0);
    vec2 pointer = (u_pointer - .5) * vec2(u_aspect, 1.0);
    float distanceToPointer = length(position - pointer);
    float pointerField = smoothstep(.3, .015, distanceToPointer) * u_pointerActive;
    float trailField = 0.0;
    for (int index = 0; index < 8; index++) {
      float trailDistance = distance(position, u_trail[index].xy);
      trailField = max(trailField, smoothstep(.24, .01, trailDistance) * u_trail[index].z);
    }
    pointerField = max(pointerField, trailField);

    vec2 flow = vec2(
      fbm(position * 1.45 + vec2(time * .055, -time * .035)),
      fbm(position * 1.6 + vec2(-time * .045, time * .06) + 9.0)
    ) - .5;
    vec2 warped = position + flow * .16;
    warped += vec2(
      sin(position.y * 4.5 + time * .42),
      cos(position.x * 3.7 - time * .36)
    ) * (.018 + pointerField * .025);

    float surface = fbm(warped * 2.5 + flow * .9 + time * .025);
    float detail = fbm(warped * 6.0 - flow * 1.2 - time * .018);
    float caustic = pow(max(0.0, sin((surface + detail) * 8.0 + time * .55)), 6.0);
    float shimmer = pow(max(0.0, sin(detail * 12.0 + surface * 7.0 - time * .35)), 8.0);
    float crest = pow(max(0.0, sin((surface + detail) * 10.0 - time * .4)), 12.0);

    vec3 deep = vec3(.008, .022, .055);
    vec3 water = mix(vec3(.015, .22, .34), u_theme, .65);
    vec3 cyan = mix(vec3(.08, .78, .92), u_theme, .5);
    vec3 blue = mix(vec3(.08, .38, .98), u_theme, .34);
    vec3 color = deep;
    color += (water - deep) * smoothstep(.28, .85, surface) * pointerField * .78;
    color += cyan * (caustic * .19 + shimmer * .08 + crest * .12) * pointerField;
    color += mix(blue, cyan, pointerField) * (pointerField * (.18 + u_pointerSpeed * .28));
    color += vec3(.6, .92, 1.0) * pow(pointerField, 2.2) * (.08 + u_pointerSpeed * .2);

    float vignette = 1.0 - smoothstep(.45, 1.2, length(position * vec2(.72, 1.0)));
    color *= .72 + vignette * .28;
    gl_FragColor = vec4(color, .94);
  }
`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function FluidCanvas() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const gl = element.getContext('webgl', { alpha: true, antialias: false, powerPreference: 'high-performance' });
    if (!gl) return;

    const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexShader);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShader);
    if (!vertex || !fragment) return;
    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;

    const position = gl.getAttribLocation(program, 'a_position');
    const time = gl.getUniformLocation(program, 'u_time');
    const aspect = gl.getUniformLocation(program, 'u_aspect');
    const pointerActive = gl.getUniformLocation(program, 'u_pointerActive');
    const pointerSpeed = gl.getUniformLocation(program, 'u_pointerSpeed');
    const themeTint = gl.getUniformLocation(program, 'u_theme');
    const pointer = gl.getUniformLocation(program, 'u_pointer');
    const trailUniform = gl.getUniformLocation(program, 'u_trail[0]');
    const buffer = gl.createBuffer();
    if (!buffer) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.useProgram(program);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cursor = { x: .5, y: .5, active: 0, speed: 0, lastX: -1, lastY: -1 };
    const trail: Array<{ x: number; y: number; life: number }> = [];
    const theme = document.documentElement.dataset.theme;
    const tint = theme === 'orange' ? [1, .42, .16] : theme === 'blue' ? [.22, .78, 1] : [.68, .98, .35];
    let width = 0;
    let height = 0;
    let frame = 0;
    let last = performance.now();

    const resize = () => {
      const rect = element.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      element.width = Math.max(1, Math.floor(width * ratio));
      element.height = Math.max(1, Math.floor(height * ratio));
      gl.viewport(0, 0, element.width, element.height);
    };
    const move = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!inside) {
        cursor.active = 0;
        return;
      }
      const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(rect.width, 1)));
      const y = Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / Math.max(rect.height, 1)));
      if (cursor.lastX >= 0) cursor.speed = Math.min(1, Math.hypot(x - cursor.lastX, y - cursor.lastY) * 8);
      if (cursor.lastX >= 0 && Math.hypot(x - cursor.lastX, y - cursor.lastY) > .008) {
        trail.unshift({ x, y, life: 1 });
        if (trail.length > 8) trail.pop();
      }
      cursor.x = x;
      cursor.y = y;
      cursor.lastX = x;
      cursor.lastY = y;
      cursor.active = 1;
    };
    const leave = () => { cursor.active = 0; };
    const render = (now: number) => {
      const elapsed = Math.min(50, now - last);
      last = now;
      cursor.speed *= reduced ? 0 : Math.pow(.88, elapsed / 16.67);
      cursor.active = Math.max(0, cursor.active - (reduced ? 1 : elapsed * .0012));
      trail.forEach((point) => { point.life *= reduced ? 0 : Math.pow(.9, elapsed / 16.67); });
      for (let index = trail.length - 1; index >= 0; index -= 1) if (trail[index].life < .035) trail.splice(index, 1);
      const packedTrail = new Float32Array(32);
      trail.forEach((point, index) => {
        packedTrail[index * 4] = point.x;
        packedTrail[index * 4 + 1] = point.y;
        packedTrail[index * 4 + 2] = point.life;
      });
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(time, reduced ? 0 : now * .001);
      gl.uniform1f(aspect, width / Math.max(height, 1));
      gl.uniform1f(pointerActive, cursor.active);
      gl.uniform1f(pointerSpeed, cursor.speed);
      gl.uniform3f(themeTint, tint[0], tint[1], tint[2]);
      gl.uniform2f(pointer, cursor.x, cursor.y);
      gl.uniform4fv(trailUniform, packedTrail);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!reduced) frame = requestAnimationFrame(render);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerleave', leave);
    if (reduced) render(performance.now());
    else frame = requestAnimationFrame(render);
    return () => {
      observer.disconnect();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerleave', leave);
      cancelAnimationFrame(frame);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, []);

  return <canvas ref={canvas} className="fluid-canvas" aria-hidden="true" />;
}
