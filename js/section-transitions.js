(() => {
  "use strict";

  const DEFAULT_CONFIG = {
    resolution: 20,
    spread: 5,
    fillDuration: 0.03,
    layerHeight: "64vh",
    mode: "cover",
    coverStart: "bottom bottom+=20%",
    revealStart: "top bottom",
    mobile: { breakpoint: 768 }
  };

  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const isScope = (value) => value instanceof Element || value instanceof Document;
  const getPositiveInt = (value, fallback) => {
    const parsed = Number.parseInt(value ?? "", 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  };
  const getPositiveFloat = (value, fallback) => {
    const parsed = Number.parseFloat(value ?? "");
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  const getCssSize = (value, fallback) => {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return `${value}px`;
    if (typeof value === "string" && value.trim()) return value.trim();
    return fallback;
  };
  const isTransparent = (value) => (
    value === "transparent" || value === "rgba(0, 0, 0, 0)" || value === "rgba(0,0,0,0)"
  );
  const hash = (i) => {
    const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  function getConfig(overrides = {}) {
    return {
      ...DEFAULT_CONFIG,
      ...overrides,
      mobile: { ...DEFAULT_CONFIG.mobile, ...(overrides.mobile || {}) }
    };
  }

  function resolveFillColor(section, sibling) {
    const override = section.dataset.stFillColor;
    if (override?.trim()) return override.trim();

    for (const element of [sibling, sibling?.parentElement, document.body, document.documentElement]) {
      if (!element) continue;
      const color = getComputedStyle(element).backgroundColor;
      if (!isTransparent(color)) return color;
    }
    return "rgb(255, 255, 255)";
  }

  function clearExisting(section) {
    section.querySelectorAll(":scope > [data-st-03-pixels]").forEach((node) => node.remove());
    if (section.__commitPixelTimeline) {
      section.__commitPixelTimeline.scrollTrigger?.kill?.();
      section.__commitPixelTimeline.kill?.();
      section.__commitPixelTimeline = null;
    }
  }

  function createPixelLayer(section, columnCount, fillColor, layerHeight, initialOpacity) {
    clearExisting(section);

    const computed = getComputedStyle(section);
    if (computed.position === "static") section.style.position = "relative";
    if (computed.isolation !== "isolate") section.style.isolation = "isolate";
    if (!["hidden", "clip"].includes(computed.overflow)) section.style.overflow = "hidden";

    const layer = document.createElement("div");
    layer.setAttribute("data-st-03-pixels", "");
    layer.setAttribute("aria-hidden", "true");
    Object.assign(layer.style, {
      position: "absolute",
      left: "0",
      right: "0",
      bottom: "0",
      top: "auto",
      height: layerHeight,
      zIndex: "30",
      pointerEvents: "none",
      contain: "layout paint style"
    });
    section.append(layer);

    const width = Math.max(layer.offsetWidth, section.clientWidth, window.innerWidth, 1);
    const height = Math.max(layer.offsetHeight, 1);
    const cellSize = width / columnCount;
    const rowCount = Math.max(Math.ceil(height / Math.max(cellSize, 1)), 1);

    Object.assign(layer.style, {
      display: "grid",
      gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
      gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))`
    });

    const totalCells = columnCount * rowCount;
    const cells = Array.from({ length: totalCells }, () => {
      const cell = document.createElement("span");
      cell.setAttribute("data-st-03-cell", "");
      Object.assign(cell.style, {
        display: "block",
        width: "100%",
        height: "100%",
        background: fillColor,
        opacity: String(initialOpacity),
        backfaceVisibility: "hidden",
        willChange: "opacity"
      });
      layer.append(cell);
      return cell;
    });

    return { layer, cells, rows: rowCount, columns: columnCount };
  }

  function buildCellDelays(cells, rows, columns, spread) {
    const maxDelay = Math.max((rows - 1) + spread, 1);
    return cells.map((_, index) => {
      const row = Math.floor(index / columns);
      const rowFromBottom = (rows - 1) - row;
      return (rowFromBottom + hash(index) * spread) / maxDelay;
    });
  }

  function runWithGsap(scope, config) {
    const gsap = window.gsap;
    const ScrollTrigger = window.ScrollTrigger;
    if (!gsap || !ScrollTrigger) return false;

    gsap.registerPlugin(ScrollTrigger);
    document.documentElement.classList.add("has-gsap-scrolltrigger");
    document.documentElement.classList.remove("no-gsap-scrolltrigger");

    const isMobile = matchMedia(`(max-width: ${config.mobile.breakpoint}px)`).matches;
    const sections = scope.querySelectorAll("[data-st-03]");

    sections.forEach((section) => {
      const mode = (section.dataset.stMode || config.mode || "cover").toLowerCase() === "reveal" ? "reveal" : "cover";
      const sibling = mode === "reveal" ? section.previousElementSibling : section.nextElementSibling;
      if (!(sibling instanceof Element)) return;

      const desktopResolution = getPositiveInt(section.getAttribute("data-st-03"), getPositiveInt(config.resolution, 20));
      const resolution = isMobile
        ? getPositiveInt(section.dataset.stMobileResolution, getPositiveInt(config.mobile.resolution, desktopResolution))
        : desktopResolution;
      const spread = getPositiveInt(section.dataset.stSpread, config.spread);
      const fillDuration = getPositiveFloat(section.dataset.stFillDuration, config.fillDuration);
      const layerHeight = getCssSize(section.dataset.stLayerHeight || config.layerHeight, "64vh");
      const fillColor = resolveFillColor(section, sibling);
      const initialOpacity = mode === "reveal" ? 1 : 0;
      const { layer, cells, rows, columns } = createPixelLayer(section, resolution, fillColor, layerHeight, initialOpacity);
      const cellDelays = buildCellDelays(cells, rows, columns, spread);

      gsap.set(cells, { opacity: initialOpacity });

      const start = mode === "reveal"
        ? (section.dataset.stRevealStart || config.revealStart)
        : (section.dataset.stCoverStart || config.coverStart);

      const timeline = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: section,
          start,
          end: () => `+=${Math.max(layer.offsetHeight, 1)}`,
          scrub: 1,
          invalidateOnRefresh: true
        }
      });

      timeline.to(cells, {
        duration: fillDuration,
        opacity: mode === "reveal" ? 0 : 1,
        stagger: (index) => cellDelays[index]
      }, 0);

      section.__commitPixelTimeline = timeline;
    });

    requestAnimationFrame(() => ScrollTrigger.refresh());
    return true;
  }

  // Fallback local: mantém o mesmo desenho, resolução, stagger e progresso de scroll
  // caso a CDN do GSAP esteja bloqueada ou o usuário esteja offline.
  function runFallback(scope, config) {
    document.documentElement.classList.add("no-gsap-scrolltrigger");
    document.documentElement.classList.remove("has-gsap-scrolltrigger");

    const instances = [];
    const isMobile = matchMedia(`(max-width: ${config.mobile.breakpoint}px)`).matches;

    scope.querySelectorAll("[data-st-03]").forEach((section) => {
      const mode = (section.dataset.stMode || config.mode || "cover").toLowerCase() === "reveal" ? "reveal" : "cover";
      const sibling = mode === "reveal" ? section.previousElementSibling : section.nextElementSibling;
      if (!(sibling instanceof Element)) return;

      const desktopResolution = getPositiveInt(section.getAttribute("data-st-03"), config.resolution);
      const columns = isMobile ? getPositiveInt(section.dataset.stMobileResolution, desktopResolution) : desktopResolution;
      const spread = getPositiveInt(section.dataset.stSpread, config.spread);
      const fillDuration = getPositiveFloat(section.dataset.stFillDuration, config.fillDuration);
      const layerHeight = getCssSize(section.dataset.stLayerHeight || config.layerHeight, "64vh");
      const fillColor = resolveFillColor(section, sibling);
      const initialOpacity = mode === "reveal" ? 1 : 0;
      const { layer, cells, rows } = createPixelLayer(section, columns, fillColor, layerHeight, initialOpacity);
      const delays = buildCellDelays(cells, rows, columns, spread);
      instances.push({ section, mode, layer, cells, delays, fillDuration });
    });

    const documentTop = (el) => el.getBoundingClientRect().top + window.scrollY;
    const coverStartPx = (section) => {
      const spec = section.dataset.stCoverStart || config.coverStart;
      const match = spec.match(/bottom\+=([\d.]+)%/i);
      const extra = match ? Number(match[1]) / 100 : 0.20;
      return documentTop(section) + section.offsetHeight - innerHeight * (1 + extra);
    };
    const revealStartPx = (section) => documentTop(section) - innerHeight;

    let ticking = false;
    const update = () => {
      ticking = false;
      instances.forEach(({ section, mode, layer, cells, delays, fillDuration }) => {
        const start = mode === "reveal" ? revealStartPx(section) : coverStartPx(section);
        const end = start + Math.max(layer.offsetHeight, 1);
        const progress = clamp((window.scrollY - start) / Math.max(1, end - start));
        // Aproxima a duração curta do tween GSAP dentro de uma timeline normalizada.
        const edge = clamp(0.085 + fillDuration * 1.7, 0.09, 0.16);

        cells.forEach((cell, index) => {
          const local = clamp((progress - delays[index] * (1 - edge)) / edge);
          cell.style.opacity = String(mode === "reveal" ? 1 - local : local);
        });
      });
    };

    const queue = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };

    addEventListener("scroll", queue, { passive: true });
    addEventListener("resize", queue, { passive: true });
    addEventListener("pageshow", queue);
    update();
    return true;
  }

  function sectionTransition03(scopeOrConfig = document, maybeConfig = {}) {
    const scope = isScope(scopeOrConfig) ? scopeOrConfig : document;
    const config = getConfig(isScope(scopeOrConfig) ? maybeConfig : scopeOrConfig);
    return runWithGsap(scope, config) || runFallback(scope, config);
  }

  window.sectionTransition03 = sectionTransition03;

  function init() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // A transição continua funcional, porém instantânea/leve para respeitar a preferência.
      document.documentElement.classList.add("reduced-motion");
    }
    sectionTransition03();
  }

  const content = document.getElementById("site-content");
  if (content?.hidden) addEventListener("commit:content-ready", init, { once: true });
  else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
