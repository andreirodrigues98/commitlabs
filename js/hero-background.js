(() => {
  "use strict";

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
  const seeded = (() => {
    let s = 0x8f31a2c7;
    return () => {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      return ((s >>> 0) % 1000000) / 1000000;
    };
  })();

  const VS = `#version 300 es
    precision highp float;
    layout(location=0) in vec3 aPosition;
    layout(location=1) in float aPhase;
    layout(location=2) in float aDepth;
    layout(location=3) in float aWeight;

    uniform float uTime;
    uniform vec2 uPointer;
    uniform float uPointerActive;
    uniform float uPointerSpeed;
    uniform float uPointMode;
    uniform float uFade;
    uniform float uPixelRatio;

    out float vAlpha;
    out float vBlueMix;

    void main() {
      vec2 p = aPosition.xy;

      float breatheA = sin(uTime * 0.38 + aPhase + p.y * 3.4) * (0.006 + aDepth * 0.010);
      float breatheB = cos(uTime * 0.29 + aPhase * 1.73 + p.x * 4.2) * (0.005 + aDepth * 0.008);
      p += vec2(breatheA, breatheB);

      vec2 delta = p - uPointer;
      float dist = max(length(delta), 0.0001);
      float radius = 0.24 + uPointerSpeed * 0.08;
      float influence = smoothstep(radius, 0.0, dist) * uPointerActive;
      vec2 repelDir = delta / dist;
      float repel = influence * (0.055 + 0.085 * uPointerSpeed) * (0.56 + aDepth * 0.88);
      p += repelDir * repel;

      // Pequena defasagem por profundidade para evitar a sensação de imagem 2D.
      p += vec2(uPointer.x, uPointer.y) * (aDepth - 0.45) * 0.012 * uPointerActive;

      gl_Position = vec4(p, aPosition.z, 1.0);
      if (uPointMode > 0.5) {
        gl_PointSize = (1.35 + aWeight * 2.65 + aDepth * 1.35) * uPixelRatio;
      }

      vec2 muteP = vec2((p.x - 0.02) * 0.82, (p.y + 0.02) * 1.18);
      float centralMute = smoothstep(0.18, 0.58, length(muteP));
      vAlpha = uFade * (0.16 + aDepth * 0.46 + aWeight * 0.14) * mix(0.42, 1.0, centralMute);
      vBlueMix = clamp(0.22 + aDepth * 0.78, 0.0, 1.0);
    }`;

  const FS = `#version 300 es
    precision highp float;
    uniform float uPointMode;
    in float vAlpha;
    in float vBlueMix;
    out vec4 outColor;

    void main() {
      if (uPointMode > 0.5) {
        vec2 p = gl_PointCoord - vec2(0.5);
        float r = length(p);
        if (r > 0.5) discard;
      }

      vec3 deepBlue = vec3(0.0, 0.18, 0.56);
      vec3 commitBlue = vec3(0.0, 0.40, 1.0);
      vec3 pale = vec3(0.64, 0.79, 1.0);
      vec3 color = mix(deepBlue, commitBlue, vBlueMix);
      color = mix(color, pale, max(0.0, vBlueMix - 0.82) * 0.24);
      outColor = vec4(color, vAlpha);
    }`;

  function shader(type, source) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, source);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn("Commit hero background shader:", gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  }

  const program = gl.createProgram();
  const vs = shader(gl.VERTEX_SHADER, VS);
  const fs = shader(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) {
    canvas.hidden = true;
    return;
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn("Commit hero background program:", gl.getProgramInfoLog(program));
    canvas.hidden = true;
    return;
  }

  const loc = {
    time: gl.getUniformLocation(program, "uTime"),
    pointer: gl.getUniformLocation(program, "uPointer"),
    pointerActive: gl.getUniformLocation(program, "uPointerActive"),
    pointerSpeed: gl.getUniformLocation(program, "uPointerSpeed"),
    pointMode: gl.getUniformLocation(program, "uPointMode"),
    fade: gl.getUniformLocation(program, "uFade"),
    pixelRatio: gl.getUniformLocation(program, "uPixelRatio")
  };

  const state = {
    width: 1,
    height: 1,
    dpr: 1,
    pointerX: 0.18,
    pointerY: 0.04,
    pointerTargetX: 0.18,
    pointerTargetY: 0.04,
    pointerActive: 0,
    pointerTargetActive: 0,
    pointerSpeed: 0,
    pointerSpeedTarget: 0,
    lastPointerX: innerWidth * 0.59,
    lastPointerY: innerHeight * 0.48,
    lastPointerTime: performance.now(),
    lastTime: performance.now(),
    visible: true,
    ready: false,
    scrollProgress: 0,
    lineCount: 0,
    pointCount: 0
  };

  let lineVao = null;
  let pointVao = null;
  let lineCount = 0;
  let pointCount = 0;
  let currentProfile = "";

  function profile() {
    if (innerWidth <= 600) return "mobile";
    if (innerWidth <= 1050) return "tablet";
    return "desktop";
  }

  function makeVao(vertices) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const stride = 6 * 4;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 3 * 4);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 4 * 4);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 5 * 4);

    gl.bindVertexArray(null);
    return vao;
  }

  function cubic(a, b, c, d, t) {
    const mt = 1 - t;
    return mt * mt * mt * a + 3 * mt * mt * t * b + 3 * mt * t * t * c + t * t * t * d;
  }

  function strandPoint(seed, i, segments) {
    const t = i / segments;
    let x = cubic(seed.startX, seed.c1X, seed.c2X, seed.endX, t);
    let y = cubic(seed.startY, seed.c1Y, seed.c2Y, seed.endY, t);

    // Micro-ondulação contínua ao longo da curva. Como ela é aplicada sobre uma
    // Bézier completa, não existe mais a sensação de raios saindo de um núcleo.
    const wave = Math.sin(t * seed.freq + seed.phase) * seed.wiggle * Math.sin(Math.PI * t);
    const wave2 = Math.cos(t * (seed.freq * 0.63) + seed.phase * 1.7) * seed.wiggle * 0.42 * Math.sin(Math.PI * t);
    x += wave * seed.normalX + wave2;
    y += wave * seed.normalY - wave2 * 0.34;
    return [x, y];
  }

  function rebuildGeometry() {
    const p = profile();
    if (p === currentProfile && lineVao && pointVao) return;
    currentProfile = p;

    if (lineVao) gl.deleteVertexArray(lineVao);
    if (pointVao) gl.deleteVertexArray(pointVao);

    const mobile = p === "mobile";
    const tablet = p === "tablet";
    const strands = mobile ? 20 : tablet ? 30 : 40;
    const segments = mobile ? 15 : tablet ? 18 : 22;
    const particleEvery = mobile ? 4 : 3;
    const lineVertices = [];
    const pointVertices = [];

    for (let s = 0; s < strands; s++) {
      const r1 = seeded();
      const r2 = seeded();
      const r3 = seeded();
      const r4 = seeded();
      const r5 = seeded();
      const side = s % 2 === 0 ? -1 : 1;
      let seed;

      if (mobile && s % 3 !== 0) {
        // Em portrait, a maior parte dos fios viaja vertical/diagonalmente. Isso
        // preenche o espaço ao redor do computador sem parecer a versão desktop
        // simplesmente comprimida.
        const topToBottom = s % 2 === 0;
        const startY = topToBottom ? 1.16 : -1.16;
        const endY = topToBottom ? -1.10 : 1.10;
        const startX = (r1 - 0.5) * 1.55;
        const endX = clamp(startX + (r2 - 0.5) * 0.92, -1.02, 1.02);
        const bow = (r3 - 0.5) * 0.78 + (s % 4 === 0 ? 0.34 : -0.08);
        seed = {
          startX, startY,
          c1X: clamp(startX + bow, -1.18, 1.18),
          c1Y: topToBottom ? 0.62 : -0.62,
          c2X: clamp(endX - bow * 0.75, -1.18, 1.18),
          c2Y: topToBottom ? -0.54 : 0.54,
          endX, endY,
          phase: r4 * 8 + s * 0.43,
          freq: 5.8 + r5 * 5.2,
          wiggle: 0.014 + r2 * 0.022,
          normalX: 0.72,
          normalY: 0.48,
          depth: 0.18 + seeded() * 0.82,
          weight: seeded()
        };
      } else {
        // Desktop/tablet: fios longos entram pelas bordas, contornam o centro e
        // saem em direções diferentes. Sem ponto focal/radial tipo Hawking.
        const startX = side * (1.05 + r1 * 0.28);
        const startY = (r2 - 0.5) * (mobile ? 1.70 : 1.62);
        const sameSide = s % 5 === 0;
        const endX = sameSide
          ? side * (0.16 + r3 * 0.42)
          : -side * (0.78 + r3 * 0.42);
        const endY = clamp(startY + (r4 - 0.5) * 1.02, -1.08, 1.08);
        const lift = (r5 - 0.5) * 0.74;
        seed = {
          startX, startY,
          c1X: side * (0.62 + seeded() * 0.26),
          c1Y: clamp(startY + lift, -1.05, 1.05),
          c2X: sameSide ? side * (0.34 + seeded() * 0.20) : -side * (0.05 + seeded() * 0.34),
          c2Y: clamp(endY - lift * 0.84 + (seeded() - 0.5) * 0.24, -1.08, 1.08),
          endX, endY,
          phase: r2 * 8 + s * 0.37,
          freq: 6.2 + r4 * 5.6,
          wiggle: (mobile ? 0.014 : 0.018) + r5 * (mobile ? 0.020 : 0.030),
          normalX: side * 0.56,
          normalY: 0.72,
          depth: 0.18 + seeded() * 0.82,
          weight: seeded()
        };
      }

      let prev = strandPoint(seed, 0, segments);
      for (let i = 1; i <= segments; i++) {
        const curr = strandPoint(seed, i, segments);
        const phaseA = seed.phase + (i - 1) * 0.10;
        const phaseB = seed.phase + i * 0.10;
        lineVertices.push(prev[0], prev[1], seed.depth * 0.15, phaseA, seed.depth, seed.weight);
        lineVertices.push(curr[0], curr[1], seed.depth * 0.15, phaseB, seed.depth, seed.weight);

        if (i % particleEvery === 0 && seeded() > (mobile ? 0.68 : 0.52)) {
          pointVertices.push(curr[0], curr[1], seed.depth * 0.15, phaseB, seed.depth, seed.weight);
        }
        prev = curr;
      }
    }

    lineVao = makeVao(lineVertices);
    pointVao = makeVao(pointVertices);
    lineCount = lineVertices.length / 6;
    pointCount = pointVertices.length / 6;
    state.lineCount = lineCount;
    state.pointCount = pointCount;
  }

  function resize() {
    const w = Math.max(1, canvas.clientWidth || innerWidth);
    const h = Math.max(1, canvas.clientHeight || innerHeight);
    const mobile = innerWidth <= 760;
    const dpr = Math.min(devicePixelRatio || 1, mobile ? 1.25 : 1.65);
    const rw = Math.max(1, Math.round(w * dpr));
    const rh = Math.max(1, Math.round(h * dpr));
    if (rw !== canvas.width || rh !== canvas.height) {
      canvas.width = rw;
      canvas.height = rh;
      state.width = w;
      state.height = h;
      state.dpr = dpr;
      gl.viewport(0, 0, rw, rh);
    }
    rebuildGeometry();
  }

  function readScroll() {
    const rect = intro.getBoundingClientRect();
    const max = Math.max(1, intro.offsetHeight - innerHeight);
    state.scrollProgress = clamp(-rect.top / max);
  }

  function pointerPosition(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const y = -(((clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
    return [clamp(x, -1.2, 1.2), clamp(y, -1.2, 1.2)];
  }

  function onPointerMove(e) {
    const rect = intro.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= innerHeight) return;

    const now = performance.now();
    const dt = Math.max(16, now - state.lastPointerTime);
    const dist = Math.hypot(e.clientX - state.lastPointerX, e.clientY - state.lastPointerY);
    const pxPerMs = dist / dt;
    state.pointerSpeedTarget = clamp(pxPerMs / 1.6, 0, 1);
    const pos = pointerPosition(e.clientX, e.clientY);
    state.pointerTargetX = pos[0];
    state.pointerTargetY = pos[1];
    state.pointerTargetActive = 1;
    state.lastPointerX = e.clientX;
    state.lastPointerY = e.clientY;
    state.lastPointerTime = now;
  }

  function onPointerLeave() {
    state.pointerTargetActive = 0;
    state.pointerSpeedTarget = 0;
  }

  intro.addEventListener("pointermove", onPointerMove, { passive: true });
  intro.addEventListener("pointerleave", onPointerLeave, { passive: true });
  intro.addEventListener("pointercancel", onPointerLeave, { passive: true });
  window.addEventListener("scroll", readScroll, { passive: true });
  window.addEventListener("resize", () => { resize(); readScroll(); }, { passive: true });

  const observer = new IntersectionObserver((entries) => {
    state.visible = entries.some((entry) => entry.isIntersecting);
  }, { rootMargin: "20% 0px 20% 0px" });
  observer.observe(intro);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);
  gl.useProgram(program);

  function render(now) {
    requestAnimationFrame(render);
    if (!state.visible || content?.hidden) return;

    resize();
    readScroll();
    const dt = Math.min(0.05, Math.max(0.001, (now - state.lastTime) / 1000));
    state.lastTime = now;

    state.pointerX = damp(state.pointerX, state.pointerTargetX, 7.2, dt);
    state.pointerY = damp(state.pointerY, state.pointerTargetY, 7.2, dt);
    state.pointerActive = damp(state.pointerActive, state.pointerTargetActive, state.pointerTargetActive ? 8.0 : 3.4, dt);
    state.pointerSpeed = damp(state.pointerSpeed, state.pointerSpeedTarget, 6.0, dt);
    state.pointerSpeedTarget = damp(state.pointerSpeedTarget, 0, 4.2, dt);

    // Mantém a estrutura presente no começo e a apaga antes do portal branco.
    const p = state.scrollProgress;
    let fade = 1;
    if (p > 0.46) fade = 1 - clamp((p - 0.46) / 0.39);
    fade = Math.pow(fade, 1.35);

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.uniform1f(loc.time, now * 0.001);
    gl.uniform2f(loc.pointer, state.pointerX, state.pointerY);
    gl.uniform1f(loc.pointerActive, state.pointerActive);
    gl.uniform1f(loc.pointerSpeed, state.pointerSpeed);
    gl.uniform1f(loc.fade, fade);
    gl.uniform1f(loc.pixelRatio, state.dpr);

    gl.bindVertexArray(lineVao);
    gl.uniform1f(loc.pointMode, 0);
    gl.drawArrays(gl.LINES, 0, lineCount);

    gl.bindVertexArray(pointVao);
    gl.uniform1f(loc.pointMode, 1);
    gl.drawArrays(gl.POINTS, 0, pointCount);
    gl.bindVertexArray(null);

    canvas.style.opacity = String(clamp(fade * 1.08, 0, 1));
  }

  function init() {
    if (state.ready || content?.hidden) return;
    state.ready = true;
    resize();
    readScroll();
    canvas.classList.add("is-ready");
    requestAnimationFrame(render);
  }

  addEventListener("commit:content-ready", init, { once: true });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { if (!content?.hidden) init(); }, { once: true });
  } else if (!content?.hidden) init();
})();
