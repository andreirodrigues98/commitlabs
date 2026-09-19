(() => {
  "use strict";

  const CONFIG = {
    startNumber: 1,
    endNumber: 100,
    minDuration: 900,
    targetDuration: 1450,
    maxDuration: 2200,
    exitDelay: 130,
    exitDuration: 360,
    digitAnimationDuration: 175
  };

  const preloader = document.getElementById("preloader");
  const content = document.getElementById("site-content");
  const digits = [...document.querySelectorAll(".counter__digit")];

  if (!preloader || !content || digits.length !== 3) {
    if (content) content.hidden = false;
    return;
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const startedAt = performance.now();
  let currentShown = CONFIG.startNumber;
  let pageReady = document.readyState === "complete";
  let rafId = 0;
  let finishing = false;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

  window.addEventListener("load", () => {
    pageReady = true;
  }, { once: true });

  function setProgress(value) {
    const safe = clamp(value, 0, 1);
    preloader.style.setProperty("--loader-progress", `${(safe * 100).toFixed(2)}%`);
  }

  function animateDigit(element, nextValue) {
    const current = element.querySelector(".counter__current");
    const next = element.querySelector(".counter__next");

    if (!current || !next || current.textContent === nextValue) return;

    if (reducedMotion) {
      current.textContent = nextValue;
      next.textContent = nextValue;
      return;
    }

    next.textContent = nextValue;
    element.classList.remove("is-changing");
    void element.offsetWidth;
    element.classList.add("is-changing");

    window.setTimeout(() => {
      current.textContent = nextValue;
      next.textContent = nextValue;
      element.classList.remove("is-changing");
    }, CONFIG.digitAnimationDuration);
  }

  function setCounter(number) {
    const capped = clamp(Math.floor(number), CONFIG.startNumber, CONFIG.endNumber);
    const formatted = String(capped).padStart(3, "0");

    digits.forEach((digit, index) => {
      animateDigit(digit, formatted[index]);
    });
  }

  function simulatedProgress(elapsed) {
    const normalized = clamp(elapsed / CONFIG.targetDuration, 0, 1);
    const eased = 1 - Math.pow(1 - normalized, 2.05);
    const ceiling = pageReady && elapsed >= CONFIG.minDuration ? 1 : 0.94;
    return Math.min(eased, ceiling);
  }

  function frame(now) {
    const elapsed = now - startedAt;
    let progress = simulatedProgress(elapsed);

    if (elapsed >= CONFIG.maxDuration) {
      pageReady = true;
      progress = 1;
    }

    if (pageReady && elapsed >= CONFIG.minDuration) {
      const finishWindow = clamp((elapsed - CONFIG.minDuration) / 580, 0, 1);
      progress = Math.max(progress, 0.94 + finishWindow * 0.06);
    }

    setProgress(progress);

    // Sequência visual exata: 001 -> 002 -> 003 ... -> 100.
    const displayValue = clamp(
      Math.floor(CONFIG.startNumber + progress * (CONFIG.endNumber - CONFIG.startNumber)),
      CONFIG.startNumber,
      CONFIG.endNumber
    );

    if (displayValue !== currentShown) {
      currentShown = displayValue;
      setCounter(displayValue);
    }

    if (progress >= 0.999) {
      finish();
      return;
    }

    rafId = requestAnimationFrame(frame);
  }

  async function finish() {
    if (finishing) return;
    finishing = true;

    cancelAnimationFrame(rafId);
    setProgress(1);
    currentShown = CONFIG.endNumber;
    setCounter(CONFIG.endNumber);
    preloader.classList.add("is-complete");

    await sleep(reducedMotion ? 50 : CONFIG.exitDelay);

    // O navegador pode tentar restaurar a posição antiga quando o conteúdo volta a existir.
    // Forçamos o topo antes e logo depois do reveal para a experiência sempre começar no computador.
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    content.hidden = false;
    window.dispatchEvent(new CustomEvent("commit:content-ready"));
    window.scrollTo(0, 0);
    requestAnimationFrame(() => window.scrollTo(0, 0));
    window.setTimeout(() => window.scrollTo(0, 0), 80);

    preloader.setAttribute("aria-hidden", "true");
    preloader.classList.add("is-leaving");

    await sleep(reducedMotion ? 140 : CONFIG.exitDuration);
    preloader.classList.add("is-hidden");
    preloader.remove();
  }

  setProgress(0);
  setCounter(CONFIG.startNumber);
  rafId = requestAnimationFrame(frame);
})();
