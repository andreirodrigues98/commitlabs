(() => {
  "use strict";

  /*
   * Commit Labs — Hero WebGL background
   *
   * Geometry and natural motion are an integration/adaptation of Demo 6
   * ("Hawking — A Biography") from DecorativeBackgrounds by Louis Hoebregts
   * for Codrops (2017):
   * https://github.com/Mamboleoo/DecorativeBackgrounds/blob/master/js/demo6.js
   *
   * The original Demo 6 model is preserved here: multiple straight THREE-style
   * polylines with randomized 3D rotations, 50 sampled points per line on
   * desktop, sinusoidal displacement weighted toward each line's extremities,
   * and a slowly rotating parent group. This integration ports that exact
   * structure to the site's existing WebGL stack, then adds Commit Labs colors,
   * responsive density, cursor repulsion on the existing vertices, and a
   * scroll-linked fade during the computer zoom.
   */

  const canvas = document.getElementById("heroWebglBackground");
  const intro = document.getElementById("intro");
  const content = document.getElementById("site-content");
  if (!canvas || !intro) return;

  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: true,
    depth: false,
    premultipliedAlpha: false,
    powerPreference: "high-performance"
  });

  if (!gl) {
    canvas.hidden = true;
    return;
  }

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
  const smooth = (a, b, v) => {
    if (a === b) return v < a ? 0 : 1;
    const t = clamp((v - a) / (b - a));
    return t * t * (3 - 2 * t);
  };

  // Demo 6 camera constants: PerspectiveCamera(40deg), camera.z = 280.
  const FOV = 40 * Math.PI / 180;
  const CAMERA_Z = 280;
  const FOCAL = 1 / Math.tan(FOV / 2);

  const VS = `#version 300 es
    precision highp float;
    layout(location=0) in vec3 aPosition;
    layout(location=1) in vec3 aColor;
    layout(location=2) in float aAlpha;

    uniform float uAspect;
    uniform float uOpacity;

    out vec3 vColor;
    out float vAlpha;

    void main() {
      float viewW = max(1.0, ${CAMERA_Z.toFixed(1)} - aPosition.z);
      gl_Position = vec4(
        aPosition.x * ${FOCAL.toFixed(8)} / max(0.20, uAspect),
        aPosition.y * ${FOCAL.toFixed(8)},
        0.0,
        viewW
      );
      vColor = aColor;
      vAlpha = aAlpha * uOpacity;
    }`;

  const FS = `#version 300 es
    precision highp float;
    in vec3 vColor;
    in float vAlpha;
    out vec4 outColor;
    void main() {
      outColor = vec4(vColor, vAlpha);
    }`;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn("Commit Demo 6 shader:", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const program = gl.createProgram();
  const vertexShader = compile(gl.VERTEX_SHADER, VS);
  const fragmentShader = compile(gl.FRAGMENT_SHADER, FS);
  if (!vertexShader || !fragmentShader) {
    canvas.hidden = true;
    return;
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn("Commit Demo 6 program:", gl.getProgramInfoLog(program));
    canvas.hidden = true;
    return;
  }

  const loc = {
    aspect: gl.getUniformLocation(program, "uAspect"),
    opacity: gl.getUniformLocation(program, "uOpacity")
  };

  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);

  const STRIDE = 7 * 4;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STRIDE, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, STRIDE, 3 * 4);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, STRIDE, 6 * 4);
  gl.bindVertexArray(null);

  // Commit Labs palette. The geometry/motion stays Demo 6; only material colors
  // are adapted to the brand as requested.
  const PALETTE = [
    { color: [0.000, 0.400, 1.000], alpha: 0.78, weight: 0.52 }, // Commit blue
    { color: [0.035, 0.145, 0.430], alpha: 0.72, weight: 0.30 }, // deep blue
    { color: [0.370, 0.395, 0.440], alpha: 0.54, weight: 0.12 }, // graphite gray
    { color: [0.790, 0.840, 0.920], alpha: 0.62, weight: 0.06 }  // sparse pale threads
  ];

  function pickMaterial() {
    const r = Math.random();
    let acc = 0;
    for (const material of PALETTE) {
      acc += material.weight;
      if (r <= acc) return material;
    }
    return PALETTE[0];
  }

  const state = {
    width: 1,
    height: 1,
    aspect: 1,
    dpr: 1,
    scroll: 0,
    visible: true,
    ready: false,
    profile: "",
    lastTime: performance.now(),
    pointerX: 0,
    pointerY: 0,
    pointerTargetX: 0,
    pointerTargetY: 0,
    pointerActive: 0,
    pointerTargetActive: 0,
    lines: [],
    config: null,
    vertexData: new Float32Array(0),
    drawVertexCount: 0
  };

  function getProfile() {
    if (innerWidth <= 620) return "mobile";
    if (innerWidth <= 1050) return "tablet";
    return "desktop";
  }

  function profileConfig(profile) {
    // Keep the recognizable Demo 6 construction, but enlarge its WORLD space
    // so the strands read as an environmental background rather than a small
    // ornament behind the computer. The line count remains close to the demo;
    // the main change is length/coverage, not a new visual language.
    if (profile === "mobile") return {
      lines: 34, dots: 46, dpr: 1.20,
      radius: 165, minLength: 0.76, lengthRange: 0.34,
      hoverRadius: 0.50, hoverPush: 0.095
    };
    if (profile === "tablet") return {
      lines: 46, dots: 54, dpr: 1.40,
      radius: 195, minLength: 0.74, lengthRange: 0.36,
      hoverRadius: 0.58, hoverPush: 0.115
    };
    return {
      lines: 56, dots: 60, dpr: 1.65,
      radius: 220, minLength: 0.72, lengthRange: 0.38,
      hoverRadius: 0.64, hoverPush: 0.132
    };
  }

  function rebuildGeometry() {
    const profile = getProfile();
    if (profile === state.profile && state.lines.length) return;
    state.profile = profile;

    const config = profileConfig(profile);
    state.config = config;
    const radius = config.radius;
    const lines = [];

    for (let i = 0; i < config.lines; i++) {
      // Same Demo 6 radial-line construction, expanded spatially. Lengths are
      // intentionally distributed: most threads stay somewhat closer to the
      // computer while a smaller set reaches toward the viewport boundaries.
      // That keeps the origin dense and the outer field progressively lighter.
      const lengthFactor = config.minLength + Math.pow(Math.random(), 1.42) * config.lengthRange;
      const lineRadius = Math.floor(radius * lengthFactor);
      const material = pickMaterial();
      const points = [];

      for (let j = 0; j < config.dots; j++) {
        const x = ((j / config.dots) * lineRadius * 2) - lineRadius;
        const ratio = 1 - ((lineRadius - Math.abs(x)) / lineRadius);
        points.push({
          x,
          ratio,
          offsetX: 0,
          offsetY: 0
        });
      }

      lines.push({
        speed: Math.random() * 300 + 250,
        wave: Math.random(), // kept for parity with original Demo 6 state
        radius: lineRadius,
        rotationX: Math.random() * Math.PI,
        rotationY: Math.random() * Math.PI,
        rotationZ: Math.random() * Math.PI,
        color: material.color,
        alpha: material.alpha,
        points
      });
    }

    state.lines = lines;
    const segmentCount = config.lines * Math.max(0, config.dots - 1);
    state.drawVertexCount = segmentCount * 2;
    state.vertexData = new Float32Array(state.drawVertexCount * 7);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, state.vertexData.byteLength, gl.DYNAMIC_DRAW);
  }

  function rotateXYZ(x, y, z, rx, ry, rz) {
    // Default THREE.Euler order is XYZ. Applying local X -> Y -> Z matches the
    // Object3D rotation behavior used by the original Demo 6 lines.
    let c = Math.cos(rx), s = Math.sin(rx);
    let y1 = y * c - z * s;
    let z1 = y * s + z * c;
    let x1 = x;

    c = Math.cos(ry); s = Math.sin(ry);
    let x2 = x1 * c + z1 * s;
    let z2 = -x1 * s + z1 * c;
    let y2 = y1;

    c = Math.cos(rz); s = Math.sin(rz);
    return [
      x2 * c - y2 * s,
      x2 * s + y2 * c,
      z2
    ];
  }

  function projectNdc(x, y, z) {
    const viewW = Math.max(1, CAMERA_Z - z);
    return [
      (x * FOCAL / Math.max(0.2, state.aspect)) / viewW,
      (y * FOCAL) / viewW,
      viewW
    ];
  }

  function updateLinePoint(line, point, pointIndex, timeMs, groupRx, groupRy, dt) {
    // Demo 6 natural displacement, scaled only enough to stay proportional to
    // the longer strands. This avoids turning the enlarged composition into
    // almost perfectly straight spokes.
    const waveScale = Math.sqrt(line.radius / 100);
    const naturalY = Math.sin(timeMs / line.speed + pointIndex * 0.15) * 12 * waveScale * point.ratio;

    let p = rotateXYZ(
      point.x,
      naturalY,
      0,
      line.rotationX,
      line.rotationY,
      line.rotationZ
    );
    p = rotateXYZ(p[0], p[1], p[2], groupRx, groupRy, 0);

    let targetOffsetX = 0;
    let targetOffsetY = 0;

    if (state.pointerActive > 0.002) {
      const projected = projectNdc(p[0], p[1], p[2]);
      const dx = projected[0] - state.pointerX;
      const dy = projected[1] - state.pointerY;
      const config = state.config || profileConfig(state.profile || getProfile());

      // Measure in viewport-height units so the field feels circular on wide
      // screens instead of becoming a shallow horizontal ellipse. The larger
      // radius makes a visibly broader area of the existing strands open up.
      const dxScreen = dx * state.aspect;
      const distance = Math.hypot(dxScreen, dy);
      const radiusNdc = config.hoverRadius;

      if (distance < radiusNdc) {
        const safeDistance = Math.max(0.0001, distance);
        const t = 1 - distance / radiusNdc;
        // Smooth, broad falloff: nearby vertices move most, while strands near
        // the edge of the field are only nudged. No new geometry is created.
        const influence = (t * t * (3 - 2 * t)) * state.pointerActive;
        const ndcPush = config.hoverPush * influence;

        // Convert the screen-space direction back to NDC before returning to
        // world units. If the cursor lands exactly on a vertex, push outward
        // from the composition center rather than producing a zero vector.
        let dirXScreen = dxScreen / safeDistance;
        let dirY = dy / safeDistance;
        if (distance < 0.002) {
          const fallbackLen = Math.hypot(projected[0] * state.aspect, projected[1]) || 1;
          dirXScreen = (projected[0] * state.aspect) / fallbackLen;
          dirY = projected[1] / fallbackLen;
        }
        const dirX = dirXScreen / Math.max(0.2, state.aspect);

        targetOffsetX = dirX * ndcPush * projected[2] * state.aspect / FOCAL;
        targetOffsetY = dirY * ndcPush * projected[2] / FOCAL;
      }
    }

    const hasForce = Math.abs(targetOffsetX) + Math.abs(targetOffsetY) > 0.0001;
    // Fast enough to follow the cursor, deliberately slower on release so the
    // strands close back with a light elastic/inertial feeling.
    const response = hasForce ? 12.0 : 2.85;
    point.offsetX = damp(point.offsetX, targetOffsetX, response, dt);
    point.offsetY = damp(point.offsetY, targetOffsetY, response, dt);

    return [p[0] + point.offsetX, p[1] + point.offsetY, p[2]];
  }

  function writeVertex(data, offset, p, line, point) {
    data[offset] = p[0];
    data[offset + 1] = p[1];
    data[offset + 2] = p[2];
    data[offset + 3] = line.color[0];
    data[offset + 4] = line.color[1];
    data[offset + 5] = line.color[2];

    // Demo 6 stays visually strongest around its origin, but the expanded
    // endpoints fade slightly. This creates the requested high density near
    // the computer and calmer extremities without shortening every strand.
    const edge = Math.pow(clamp(point.ratio), 1.35);
    const densityFade = lerp(1.0, 0.43, edge);
    data[offset + 6] = line.alpha * densityFade;
    return offset + 7;
  }

  function updateGeometry(timeMs, dt) {
    // Original Demo 6 parent-group motion:
    // sphere.rotation.y = time * .0001; sphere.rotation.x = -time * .0001
    const groupRy = timeMs * 0.0001;
    const groupRx = -timeMs * 0.0001;
    const data = state.vertexData;
    let cursor = 0;

    for (const line of state.lines) {
      const points = line.points;
      let previousPoint = points[0];
      let previous = updateLinePoint(line, previousPoint, 0, timeMs, groupRx, groupRy, dt);

      for (let j = 1; j < points.length; j++) {
        const currentPoint = points[j];
        const current = updateLinePoint(line, currentPoint, j, timeMs, groupRx, groupRy, dt);
        cursor = writeVertex(data, cursor, previous, line, previousPoint);
        cursor = writeVertex(data, cursor, current, line, currentPoint);
        previousPoint = currentPoint;
        previous = current;
      }
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
  }

  function readScroll() {
    const rect = intro.getBoundingClientRect();
    const max = Math.max(1, intro.offsetHeight - innerHeight);
    state.scroll = clamp(-rect.top / max);
  }

  function resize() {
    rebuildGeometry();
    const config = profileConfig(state.profile || getProfile());
    const width = Math.max(1, canvas.clientWidth || innerWidth);
    const height = Math.max(1, canvas.clientHeight || innerHeight);
    const dpr = Math.min(devicePixelRatio || 1, config.dpr);
    const rw = Math.max(1, Math.round(width * dpr));
    const rh = Math.max(1, Math.round(height * dpr));

    if (canvas.width !== rw || canvas.height !== rh) {
      canvas.width = rw;
      canvas.height = rh;
      gl.viewport(0, 0, rw, rh);
    }

    state.width = width;
    state.height = height;
    state.aspect = width / height;
    state.dpr = dpr;
  }

  function pointerToNdc(e) {
    const rect = intro.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const y = 1 - ((e.clientY - rect.top) / Math.max(1, rect.height)) * 2;
    return [clamp(x, -1.25, 1.25), clamp(y, -1.25, 1.25)];
  }

  function onPointerMove(e) {
    // Mouse/pen only. Touch continues to own vertical scrolling with no custom
    // gesture interception; mobile keeps the original natural Demo 6 motion.
    if (e.pointerType === "touch") return;
    const rect = intro.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= innerHeight) return;
    const p = pointerToNdc(e);
    state.pointerTargetX = p[0];
    state.pointerTargetY = p[1];
    state.pointerTargetActive = 1;
  }

  function clearPointer() {
    state.pointerTargetActive = 0;
  }

  intro.addEventListener("pointermove", onPointerMove, { passive: true });
  intro.addEventListener("pointerleave", clearPointer, { passive: true });
  intro.addEventListener("pointercancel", clearPointer, { passive: true });
  window.addEventListener("blur", clearPointer, { passive: true });
  window.addEventListener("scroll", readScroll, { passive: true });
  window.addEventListener("resize", () => {
    resize();
    readScroll();
  }, { passive: true });

  const observer = new IntersectionObserver((entries) => {
    state.visible = entries.some((entry) => entry.isIntersecting);
    if (!state.visible) clearPointer();
  }, { rootMargin: "15% 0px 15% 0px" });
  observer.observe(intro);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.DEPTH_TEST);
  gl.clearColor(0, 0, 0, 0);
  gl.lineWidth(1);

  function render(now) {
    requestAnimationFrame(render);
    if (!state.ready || !state.visible || content?.hidden) return;

    resize();
    readScroll();

    const dt = Math.min(0.05, Math.max(0.001, (now - state.lastTime) / 1000));
    state.lastTime = now;

    state.pointerX = damp(state.pointerX, state.pointerTargetX, 10.5, dt);
    state.pointerY = damp(state.pointerY, state.pointerTargetY, 10.5, dt);
    state.pointerActive = damp(
      state.pointerActive,
      state.pointerTargetActive,
      state.pointerTargetActive ? 11.0 : 3.6,
      dt
    );

    updateGeometry(now, dt);

    // Keep the background alive during the beginning of the zoom, then dissolve
    // it progressively so the portal finishes cleanly with no abrupt cutoff.
    const opacity = 1 - smooth(0.36, 0.84, state.scroll);

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.uniform1f(loc.aspect, state.aspect);
    gl.uniform1f(loc.opacity, opacity);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.LINES, 0, state.drawVertexCount);
    gl.bindVertexArray(null);

    canvas.style.opacity = String(clamp(opacity * 1.02));
  }

  function init() {
    if (state.ready || content?.hidden) return;
    state.ready = true;
    resize();
    readScroll();
    canvas.classList.add("is-ready");
    state.lastTime = performance.now();
    requestAnimationFrame(render);
  }

  addEventListener("commit:content-ready", init, { once: true });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      if (!content?.hidden) init();
    }, { once: true });
  } else if (!content?.hidden) {
    init();
  }
})();
