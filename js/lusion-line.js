(() => {
  "use strict";

  const ROOT_CLASS = "commit-about-motion";
  const PATH_LENGTH = 1000;
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const range = (value, start, end) => clamp((value - start) / Math.max(0.0001, end - start));
  const smoothstep = (value) => value * value * (3 - 2 * value);

  // Marcamos a experiência antes do reveal do preloader. Assim o CSS já nasce
  // no estado inicial e não existe um frame em que a linha aparece inteira.
  document.documentElement.classList.add(ROOT_CLASS);

  const section = document.getElementById("about");
  const path = document.getElementById("commitLinePath");
  const wrap = section?.querySelector(".commit-line-wrap");
  const content = document.getElementById("site-content");

  if (!section || !path || !wrap) return;

  // Estado inicial garantido ANTES de qualquer cálculo de layout.
  path.setAttribute("pathLength", String(PATH_LENGTH));
  path.style.strokeDasharray = `${PATH_LENGTH} ${PATH_LENGTH}`;
  path.style.strokeDashoffset = String(PATH_LENGTH);

  let initialized = false;
  let ticking = false;
  let sectionTop = 0;
  let travel = 1;

  function getElements() {
    return {
      label: section.querySelector(".about-home__label"),
      titleLines: [...section.querySelectorAll(".about-home__title > span")],
      copy: section.querySelector(".about-home__copy-column")
    };
  }

  function measure() {
    // O elemento fica dentro de um capítulo sticky. O progresso começa somente
    // quando o topo real do About chega ao topo da viewport e termina quando o
    // sticky esgota seu percurso. Isso impede a animação de avançar ainda no PC.
    sectionTop = section.getBoundingClientRect().top + window.scrollY;
    travel = Math.max(1, section.offsetHeight - window.innerHeight);
  }

  function sectionProgress() {
    return clamp((window.scrollY - sectionTop) / travel);
  }

  function applyProgress(progress) {
    // Respiro inicial real: o About já está branco, mas a linha ainda não aparece.
    // Depois ela é desenhada integralmente pelo scroll e termina com margem antes
    // da entrada da seção Projects.
    const lineProgress = smoothstep(range(progress, 0.12, 0.72));
    path.style.strokeDashoffset = String(PATH_LENGTH * (1 - lineProgress));

    const { label, titleLines, copy } = getElements();

    const labelP = smoothstep(range(progress, 0.24, 0.34));
    if (label) {
      label.style.opacity = String(labelP);
      label.style.transform = `translate3d(0, ${(34 * (1 - labelP)).toFixed(2)}px, 0)`;
    }

    titleLines.forEach((line, index) => {
      const start = 0.29 + index * 0.036;
      const lineP = smoothstep(range(progress, start, start + 0.17));
      line.style.opacity = String(0.02 + lineP * 0.98);
      line.style.transform = `translate3d(0, ${(92 * (1 - lineP)).toFixed(2)}px, 0)`;
      line.style.clipPath = `inset(${(100 * (1 - lineP)).toFixed(2)}% 0 0 0)`;
    });

    const copyP = smoothstep(range(progress, 0.43, 0.60));
    if (copy) {
      copy.style.opacity = String(copyP);
      copy.style.transform = `translate3d(0, ${(56 * (1 - copyP)).toFixed(2)}px, 0)`;
    }

    section.style.setProperty("--about-progress", progress.toFixed(5));
    section.style.setProperty("--line-progress", lineProgress.toFixed(5));
  }

  function update() {
    ticking = false;
    if (!initialized || content?.hidden) return;
    applyProgress(sectionProgress());
  }

  function queueUpdate() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  function init() {
    if (initialized || content?.hidden) return;
    initialized = true;
    section.dataset.lineReady = "true";
    measure();
    applyProgress(sectionProgress());

    addEventListener("scroll", queueUpdate, { passive: true });
    addEventListener("resize", () => {
      measure();
      queueUpdate();
    }, { passive: true });
    addEventListener("pageshow", () => {
      measure();
      queueUpdate();
    });
    addEventListener("commit:language-change", () => {
      requestAnimationFrame(() => {
        measure();
        update();
      });
    });

    // Parallax é apenas um detalhe; em reduced motion ele é desligado, mas o
    // desenho principal da linha continua funcionando normalmente.
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    let tx = 0;
    let ty = 0;
    let px = 0;
    let py = 0;
    const pointer = (event) => {
      if (reduce.matches || innerWidth <= 760) return;
      const rect = section.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= innerHeight) return;
      tx = ((event.clientX / innerWidth) - 0.5) * 7;
      ty = ((event.clientY / innerHeight) - 0.5) * 5;
    };
    const parallaxFrame = () => {
      if (reduce.matches) {
        tx = ty = px = py = 0;
      } else {
        px += (tx - px) * 0.045;
        py += (ty - py) * 0.045;
      }
      wrap.style.setProperty("--line-parallax-x", `${px.toFixed(2)}px`);
      wrap.style.setProperty("--line-parallax-y", `${py.toFixed(2)}px`);
      requestAnimationFrame(parallaxFrame);
    };
    addEventListener("pointermove", pointer, { passive: true });
    requestAnimationFrame(parallaxFrame);
  }

  // Três caminhos para evitar qualquer corrida de inicialização.
  addEventListener("commit:content-ready", init);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      if (!content?.hidden) init();
    }, { once: true });
  } else if (!content?.hidden) {
    init();
  }

  // Caso o evento já tenha ocorrido por cache/reload, tentamos no próximo frame.
  requestAnimationFrame(() => {
    if (!content?.hidden) init();
  });
})();
