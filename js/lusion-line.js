(() => {
  "use strict";

  const PATH_LENGTH = 1000;
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

  const section = document.getElementById("about");
  const path = document.getElementById("commitLinePath");
  const content = document.getElementById("site-content");

  if (!section || !path) return;

  // A linha começa totalmente recolhida. O desenho é controlado SOMENTE pelo
  // scroll da seção About: sem autoplay, easing, parallax ou animação do texto.
  path.setAttribute("pathLength", String(PATH_LENGTH));
  path.style.strokeDasharray = `${PATH_LENGTH} ${PATH_LENGTH}`;
  path.style.strokeDashoffset = String(PATH_LENGTH);

  let initialized = false;
  let ticking = false;
  let sectionTop = 0;
  let travel = 1;

  function measure() {
    sectionTop = section.getBoundingClientRect().top + window.scrollY;

    // A distância útil é exatamente o percurso do sticky. Assim 0% do percurso
    // da seção = 0% da cobra e 100% da seção = 100% da cobra, eliminando o
    // trecho de scroll sem animação que existia depois do desenho terminar.
    travel = Math.max(1, section.offsetHeight - window.innerHeight);
  }

  function getProgress() {
    return clamp((window.scrollY - sectionTop) / travel);
  }

  function applyProgress(progress) {
    // Mapeamento 1:1 e linear. Um pequeno delta de scroll produz um pequeno
    // delta no traço; não existe smoothstep nem janela reduzida de progresso.
    path.style.strokeDashoffset = String(PATH_LENGTH * (1 - progress));
    section.style.setProperty("--about-progress", progress.toFixed(5));
    section.style.setProperty("--line-progress", progress.toFixed(5));
  }

  function update() {
    ticking = false;
    if (!initialized || content?.hidden) return;
    applyProgress(getProgress());
  }

  function queueUpdate() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  function refresh() {
    measure();
    queueUpdate();
  }

  function init() {
    if (initialized || content?.hidden) return;
    initialized = true;
    section.dataset.lineReady = "true";

    measure();
    applyProgress(getProgress());

    addEventListener("scroll", queueUpdate, { passive: true });
    addEventListener("resize", refresh, { passive: true });
    addEventListener("pageshow", refresh);
    addEventListener("commit:language-change", () => requestAnimationFrame(refresh));

    // Recalcula também caso fontes/layout alterem a altura depois do primeiro
    // paint, sem introduzir qualquer animação adicional na seção.
    if ("ResizeObserver" in window) {
      const observer = new ResizeObserver(refresh);
      observer.observe(section);
    }
  }

  addEventListener("commit:content-ready", init);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      if (!content?.hidden) init();
    }, { once: true });
  } else if (!content?.hidden) {
    init();
  }

  requestAnimationFrame(() => {
    if (!content?.hidden) init();
  });
})();
