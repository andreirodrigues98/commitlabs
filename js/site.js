(() => {
  "use strict";

  const DATA = window.COMMIT_PC_MODEL;
  const canvas = document.getElementById("pcCanvas");
  const intro = document.getElementById("intro");
  const stage = document.getElementById("stage");
  const loaderEl = document.getElementById("modelLoader");
  const scrollHint = document.getElementById("scrollHint");
  const dragLabel = document.getElementById("dragLabel");
  const portalWhite = document.getElementById("portalWhite");

  if (!DATA || !canvas || !intro) return;

  const gl = canvas.getContext("webgl2", {
    antialias: true,
    alpha: false,
    depth: true,
    premultipliedAlpha: false,
    powerPreference: "high-performance"
  });

  if (!gl) {
    loaderEl.innerHTML = "<span>WEBGL 2 NÃO DISPONÍVEL NESTE NAVEGADOR</span>";
    return;
  }

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || "Shader error");
    }
    return shader;
  }

  const VS = `#version 300 es
    precision highp float;
    layout(location=0) in vec3 aPosition;
    layout(location=1) in vec3 aNormal;
    layout(location=2) in vec2 aUv;
    uniform mat4 uModel;
    uniform mat4 uView;
    uniform mat4 uProjection;
    out vec3 vNormal;
    out vec3 vWorld;
    out vec2 vUv;
    void main(){
      vec4 world = uModel * vec4(aPosition, 1.0);
      vWorld = world.xyz;
      vNormal = normalize(mat3(uModel) * aNormal);
      vUv = aUv;
      gl_Position = uProjection * uView * world;
    }`;

  const FS = `#version 300 es
    precision highp float;
    in vec3 vNormal;
    in vec3 vWorld;
    in vec2 vUv;
    uniform vec3 uColor;
    uniform vec3 uEmissive;
    uniform float uGloss;
    uniform float uIsScreen;
    uniform vec3 uCamera;
    uniform sampler2D uScreenTexture;
    out vec4 outColor;
    void main(){
      if (uIsScreen > 0.5) {
        vec2 uv = vUv;
        vec3 screen = texture(uScreenTexture, uv).rgb;
        float scan = 0.975 + 0.025 * sin(uv.y * 880.0);
        outColor = vec4(screen * scan, 1.0);
        return;
      }
      vec3 N = normalize(vNormal);
      if (!gl_FrontFacing) N = -N;
      vec3 V = normalize(uCamera - vWorld);
      vec3 L = normalize(vec3(-0.42, 0.78, 0.72));
      vec3 H = normalize(L + V);
      float diff = max(dot(N, L), 0.0);
      float hemi = N.y * 0.5 + 0.5;
      float rim = pow(1.0 - max(dot(N, V), 0.0), 2.7);
      float specPow = mix(15.0, 78.0, clamp(uGloss, 0.0, 1.0));
      float spec = pow(max(dot(N, H), 0.0), specPow) * mix(0.035, 0.16, uGloss);
      vec3 color = uColor * (0.20 + 0.46 * hemi + 0.58 * diff);
      color += vec3(spec) + rim * vec3(0.06, 0.075, 0.10);
      color += uEmissive * 0.24;
      color = pow(max(color, 0.0), vec3(0.90));
      outColor = vec4(color, 1.0);
    }`;

  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "Program link error");
  }

  const loc = {
    model: gl.getUniformLocation(program, "uModel"),
    view: gl.getUniformLocation(program, "uView"),
    projection: gl.getUniformLocation(program, "uProjection"),
    color: gl.getUniformLocation(program, "uColor"),
    emissive: gl.getUniformLocation(program, "uEmissive"),
    gloss: gl.getUniformLocation(program, "uGloss"),
    isScreen: gl.getUniformLocation(program, "uIsScreen"),
    camera: gl.getUniformLocation(program, "uCamera"),
    screenTexture: gl.getUniformLocation(program, "uScreenTexture")
  };

  function bytes(base64) {
    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function f32(base64) {
    const u8 = bytes(base64);
    return new Float32Array(u8.buffer);
  }
  function u16(base64) {
    const u8 = bytes(base64);
    return new Uint16Array(u8.buffer);
  }

  function makeBuffer(target, data) {
    const b = gl.createBuffer();
    gl.bindBuffer(target, b);
    gl.bufferData(target, data, gl.STATIC_DRAW);
    return b;
  }

  const meshes = DATA.groups.map((group) => {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const p = makeBuffer(gl.ARRAY_BUFFER, f32(group.positions));
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    const n = makeBuffer(gl.ARRAY_BUFFER, f32(group.normals));
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

    const uv = makeBuffer(gl.ARRAY_BUFFER, f32(group.uvs));
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);

    const index = makeBuffer(gl.ELEMENT_ARRAY_BUFFER, u16(group.indices));
    gl.bindVertexArray(null);
    return { group, vao, index, count: group.indexCount };
  });

  function buildScreenCanvas() {
    // A tela do computador funciona apenas como portal: branca, limpa e com
    // a assinatura COMMIT LABS pequena no centro. O ABOUT só existe depois
    // do fim do zoom, evitando qualquer sensação de seção duplicada.
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 768;
    const ctx = c.getContext("2d");

    ctx.fillStyle = "#F1F2F3";
    ctx.fillRect(0, 0, c.width, c.height);

    ctx.fillStyle = "#0D0D0F";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 28px Arial";
    ctx.fillText("COMMIT LABS", c.width / 2, c.height / 2);

    return c;
  }

  function updateScreenTextureFromSource(source) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, screenTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  const screenTexture = gl.createTexture();
  updateScreenTextureFromSource(buildScreenCanvas());

  window.addEventListener("commit:language-change", () => {
    updateScreenTextureFromSource(buildScreenCanvas());
  });

  function mat4Identity() {
    return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  }
  function mat4Multiply(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        o[c*4+r] = a[0*4+r]*b[c*4+0] + a[1*4+r]*b[c*4+1] + a[2*4+r]*b[c*4+2] + a[3*4+r]*b[c*4+3];
      }
    }
    return o;
  }
  function mat4RotationX(a) {
    const c = Math.cos(a), s = Math.sin(a);
    return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]);
  }
  function mat4RotationY(a) {
    const c = Math.cos(a), s = Math.sin(a);
    return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]);
  }
  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
      f/aspect,0,0,0,
      0,f,0,0,
      0,0,(far+near)*nf,-1,
      0,0,(2*far*near)*nf,0
    ]);
  }
  function normalize(v) {
    const l = Math.hypot(v[0],v[1],v[2]) || 1;
    return [v[0]/l,v[1]/l,v[2]/l];
  }
  function cross(a,b) {
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  }
  function dot(a,b) { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
  function lookAt(eye, target, up=[0,1,0]) {
    const z = normalize([eye[0]-target[0], eye[1]-target[1], eye[2]-target[2]]);
    const x = normalize(cross(up,z));
    const y = cross(z,x);
    return new Float32Array([
      x[0],y[0],z[0],0,
      x[1],y[1],z[1],0,
      x[2],y[2],z[2],0,
      -dot(x,eye),-dot(y,eye),-dot(z,eye),1
    ]);
  }
  function transformPoint(m, p) {
    const x=p[0], y=p[1], z=p[2];
    return [
      m[0]*x+m[4]*y+m[8]*z+m[12],
      m[1]*x+m[5]*y+m[9]*z+m[13],
      m[2]*x+m[6]*y+m[10]*z+m[14],
      m[3]*x+m[7]*y+m[11]*z+m[15]
    ];
  }
  function projectPoint(p, model, view, proj) {
    let q = transformPoint(model,p);
    q = transformPoint(view,q);
    q = transformPoint(proj,q);
    const w = q[3] || 1;
    return [q[0]/w, q[1]/w, q[2]/w];
  }

  const screen = DATA.screenBounds;
  const screenCenter = screen.center;
  const screenCorners = [
    [screen.min[0], screen.min[1], screen.center[2]],
    [screen.max[0], screen.min[1], screen.center[2]],
    [screen.max[0], screen.max[1], screen.center[2]],
    [screen.min[0], screen.max[1], screen.center[2]]
  ];

  const state = {
    scroll: 0,
    pointerX: 0,
    pointerY: 0,
    parallaxX: 0,
    parallaxY: 0,
    dragging: false,
    activePointer: null,
    lastX: 0,
    lastY: 0,
    yaw: -0.10,
    pitch: -0.035,
    yawTarget: -0.10,
    pitchTarget: -0.035,
    width: 0,
    height: 0,
    dpr: 1,
    lastTime: performance.now(),
    ready: true
  };

  function readScroll() {
    const rect = intro.getBoundingClientRect();
    const max = intro.offsetHeight - innerHeight;
    state.scroll = max > 0 ? clamp(-rect.top / max, 0, 1) : 0;
  }

  function resize() {
    const w = canvas.clientWidth || innerWidth;
    const h = canvas.clientHeight || innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, innerWidth < 760 ? 1.5 : 2);
    const rw = Math.max(1, Math.floor(w*dpr));
    const rh = Math.max(1, Math.floor(h*dpr));
    if (rw !== canvas.width || rh !== canvas.height) {
      canvas.width = rw;
      canvas.height = rh;
      state.width = w;
      state.height = h;
      state.dpr = dpr;
      gl.viewport(0,0,rw,rh);
    }
  }

  function pointerMove(e) {
    const nx = (e.clientX / innerWidth) * 2 - 1;
    const ny = (e.clientY / innerHeight) * 2 - 1;
    state.pointerX = clamp(nx,-1,1);
    state.pointerY = clamp(ny,-1,1);
    if (!state.dragging || state.scroll > 0.075) return;
    const dx = e.clientX - state.lastX;
    const dy = e.clientY - state.lastY;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    state.yawTarget += dx * 0.0105;
    state.pitchTarget = clamp(state.pitchTarget + dy * 0.008, -0.48, 0.42);
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (state.scroll > 0.075) return;
    state.dragging = true;
    state.activePointer = e.pointerId;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    canvas.classList.add("is-dragging");
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  canvas.addEventListener("pointermove", pointerMove, { passive: true });
  window.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse" && !state.dragging) pointerMove(e);
  }, { passive: true });
  function endDrag(e) {
    if (!state.dragging) return;
    if (state.activePointer !== null && e.pointerId !== undefined && e.pointerId !== state.activePointer) return;
    state.dragging = false;
    state.activePointer = null;
    canvas.classList.remove("is-dragging");
  }
  window.addEventListener("pointerup", endDrag, { passive: true });
  window.addEventListener("pointercancel", endDrag, { passive: true });

  window.addEventListener("scroll", readScroll, { passive: true });
  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("pageshow", () => {
    window.scrollTo(0, 0);
    state.scroll = 0;
    requestAnimationFrame(readScroll);
  });

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  gl.clearColor(0,0,0,1);
  gl.useProgram(program);
  gl.uniform1i(loc.screenTexture, 0);

  canvas.classList.add("is-ready");
  loaderEl.classList.add("is-hidden");
  setTimeout(() => dragLabel.classList.add("is-visible"), 600);
  setTimeout(() => dragLabel.classList.remove("is-visible"), 3800);

  function render(now) {
    resize();
    const dt = Math.min(.05, Math.max(.001, (now - state.lastTime)/1000));
    state.lastTime = now;
    const p = state.scroll;

    const settle = smooth(.055,.24,p);
    if (p > .055) {
      state.yawTarget = damp(state.yawTarget, 0, 8.5, dt);
      state.pitchTarget = damp(state.pitchTarget, 0, 8.5, dt);
    }
    state.yaw = damp(state.yaw, state.yawTarget, state.dragging ? 18 : 9, dt);
    state.pitch = damp(state.pitch, state.pitchTarget, state.dragging ? 18 : 9, dt);

    const paraStrength = (1 - smooth(.04,.20,p)) * (state.dragging ? .15 : 1);
    state.parallaxX = damp(state.parallaxX, state.pointerX * .075 * paraStrength, 4.8, dt);
    state.parallaxY = damp(state.parallaxY, -state.pointerY * .045 * paraStrength, 4.8, dt);

    const model = mat4Multiply(mat4RotationY(state.yaw), mat4RotationX(state.pitch));

    const fov = 33 * Math.PI / 180;
    const aspect = Math.max(.2, state.width / Math.max(1,state.height));
    const projection = perspective(fov, aspect, .025, 60);

    const zoom = smooth(.08,.90,p);
    const zEase = zoom*zoom*(3-2*zoom);
    const homeEye = [state.parallaxX, .08 + state.parallaxY, 5.30];
    const homeTarget = [state.parallaxX*.18, .03 + state.parallaxY*.10, 0];

    const screenH = Math.max(.1, screen.size[1]);
    const screenW = Math.max(.1, screen.size[0]);
    const vDist = screenH / (2*Math.tan(fov/2));
    const hFov = 2*Math.atan(Math.tan(fov/2)*aspect);
    const hDist = screenW / (2*Math.tan(hFov/2));
    const fillDistance = Math.max(vDist,hDist) * .64;
    const finalEye = [screenCenter[0], screenCenter[1], screenCenter[2] + fillDistance];
    const finalTarget = [screenCenter[0], screenCenter[1], screenCenter[2] - .018];

    const eye = [
      lerp(homeEye[0], finalEye[0], zEase),
      lerp(homeEye[1], finalEye[1], zEase),
      lerp(homeEye[2], finalEye[2], zEase)
    ];
    const target = [
      lerp(homeTarget[0], finalTarget[0], zEase),
      lerp(homeTarget[1], finalTarget[1], zEase),
      lerp(homeTarget[2], finalTarget[2], zEase)
    ];
    const view = lookAt(eye,target,[0,1,0]);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);
    gl.uniformMatrix4fv(loc.model,false,model);
    gl.uniformMatrix4fv(loc.view,false,view);
    gl.uniformMatrix4fv(loc.projection,false,projection);
    gl.uniform3f(loc.camera,eye[0],eye[1],eye[2]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,screenTexture);

    for (const mesh of meshes) {
      const g = mesh.group;
      // Hide the dark glass cover so the preview on the monitor stays visible.
      if (g.name === "screen") continue;
      gl.bindVertexArray(mesh.vao);
      gl.uniform3f(loc.color,g.color[0],g.color[1],g.color[2]);
      gl.uniform3f(loc.emissive,g.emissive[0],g.emissive[1],g.emissive[2]);
      gl.uniform1f(loc.gloss,g.gloss || 0);
      gl.uniform1f(loc.isScreen,g.screen ? 1 : 0);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    }
    gl.bindVertexArray(null);

    // O zoom termina em uma viewport realmente branca. O overlay cobre o
    // monitor inteiro no final da cena; depois há apenas o curto deslocamento
    // restante do sticky antes do About entrar. Tudo continua reversível.
    // A tela do computador termina primeiro em branco absoluto. A cobrinha
    // NÃO pertence a esta cena: ela só começa no capítulo About, depois que
    // o computador já saiu. Mantemos um pequeno plateau branco no fim do
    // sticky para a transição respirar antes do próximo capítulo.
    const whiteProgress = smooth(.72, .84, p);
    canvas.style.opacity = String(1 - smooth(.70, .84, p));
    if (portalWhite) portalWhite.style.opacity = String(whiteProgress);
    if (stage) {
      stage.style.opacity = "1";
      stage.style.pointerEvents = p >= .985 ? "none" : "auto";
    }

    // O About fica sobreposto exatamente em 1 viewport para eliminar aquela
    // "segunda tela branca" longa. Enquanto o computador ainda está ativo,
    // INTRO permanece acima dele. Só no final exato do zoom o z-index troca:
    // surge então o branco limpo do About, sem a cobrinha na tela do monitor.
    // Ao subir, a troca se desfaz no mesmo ponto.
    intro.style.zIndex = p >= .9995 ? "1" : "5";
    intro.style.pointerEvents = p >= .985 ? "none" : "auto";

    if (scrollHint) scrollHint.style.opacity = String(1-smooth(.012,.11,p));
    if (dragLabel) dragLabel.style.opacity = String((1-smooth(.01,.08,p)) * (dragLabel.classList.contains("is-visible") ? 1 : 0));

    requestAnimationFrame(render);
  }

  readScroll();
  resize();
  requestAnimationFrame(render);
})();
