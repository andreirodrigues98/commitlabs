(() => {
  "use strict";

  const ROOT_CLASS = "commit-work-motion";
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const range = (value, start, end) => clamp((value - start) / Math.max(0.0001, end - start));
  const smoothstep = (value) => value * value * (3 - 2 * value);

  // O estado inicial é aplicado antes do preloader liberar o conteúdo.
  document.documentElement.classList.add(ROOT_CLASS);

  const content = document.getElementById("site-content");
  let initialized = false;

  function init() {
    if (initialized || content?.hidden) return;

    const section = document.getElementById("work");
    if (!section) return;

    initialized = true;
    section.dataset.workReady = "true";

    const rows = [...section.querySelectorAll(".work-row")];
    const rowGrids = rows.map((row) => row.querySelector(".work-row__grid"));
    const allCards = [...section.querySelectorAll(".work-card")];
    const filters = [...section.querySelectorAll(".work-filter")];
    const title = section.querySelector(".selected-work__title");
    const eyebrow = section.querySelector(".selected-work__eyebrow");
    const intro = section.querySelector(".selected-work__intro");
    const filterBar = section.querySelector(".selected-work__filters");
    const mobile = () => innerWidth <= 760;
    let ticking = false;

    function categories(card) {
      return (card.dataset.categories || "").split(/\s+/).filter(Boolean);
    }

    function categoryCount(key) {
      if (key === "all") return allCards.length;
      return allCards.filter((card) => categories(card).includes(key)).length;
    }

    section.querySelectorAll("[data-filter-count]").forEach((element) => {
      element.textContent = String(categoryCount(element.dataset.filterCount));
    });

    function visibleCardsInRow(row) {
      return [...row.querySelectorAll(".work-card")].filter((card) => !card.hidden);
    }

    function arrangeCards(filterKey = "all") {
      const matching = allCards.filter((card) => filterKey === "all" || categories(card).includes(filterKey));

      allCards.forEach((card) => {
        card.hidden = !matching.includes(card);
      });
      rowGrids.forEach((grid) => grid?.replaceChildren());

      matching.forEach((card, index) => {
        const grid = rowGrids[Math.floor(index / 2)];
        grid?.append(card);
      });

      rows.forEach((row, index) => {
        const count = rowGrids[index]?.children.length || 0;
        row.hidden = count === 0;
        row.classList.toggle("is-single", count === 1);
      });
    }

    function revealElement(element, progress, distance = 38) {
      if (!element) return;
      element.style.opacity = String(progress);
      element.style.transform = `translate3d(0, ${(distance * (1 - progress)).toFixed(2)}px, 0)`;
    }

    function updateHeader() {
      const header = section.querySelector(".selected-work__header");
      if (!header) return;
      const rect = header.getBoundingClientRect();
      // Começa quando a seção entra pela base e conclui só depois que o header
      // percorreu boa parte da viewport: a subida fica perceptível e reversível.
      const base = clamp((innerHeight * 0.96 - rect.top) / (innerHeight * 0.66));
      const p = smoothstep(base);

      if (title) {
        title.style.opacity = String(0.02 + p * 0.98);
        title.style.transform = `translate3d(0, ${(104 * (1 - p)).toFixed(2)}px, 0)`;
        title.style.clipPath = `inset(${(100 * (1 - p)).toFixed(2)}% 0 0 0)`;
      }

      revealElement(eyebrow, smoothstep(range(p, 0.00, 0.46)), 36);
      revealElement(intro, smoothstep(range(p, 0.18, 0.76)), 48);
      revealElement(filterBar, smoothstep(range(p, 0.43, 0.94)), 40);
    }

    function updateRows() {
      rows.filter((row) => !row.hidden).forEach((row) => {
        const rect = row.getBoundingClientRect();
        const p = smoothstep(clamp((innerHeight * 0.96 - rect.top) / (innerHeight * 0.58)));
        const cards = visibleCardsInRow(row);
        const grid = row.querySelector(".work-row__grid");
        const horizontalShift = grid ? grid.clientWidth * 0.23 : innerWidth * 0.19;

        cards.forEach((card, index) => {
          const paired = !mobile() && cards.length > 1;
          // No início os dois cards ficam mais próximos do centro: o esquerdo
          // desloca para a direita e o direito para a esquerda. O scroll os abre.
          const x = paired ? (index === 0 ? horizontalShift : -horizontalShift) * (1 - p) : 0;
          const y = (paired ? 34 : 56) * (1 - p);
          const scale = 0.978 + p * 0.022;
          const opacity = 0.76 + p * 0.24;
          card.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
          card.style.opacity = String(opacity);
        });
      });
    }

    function updateCapabilities() {
      const capability = document.getElementById("capabilities");
      if (!capability) return;
      const rect = capability.getBoundingClientRect();
      const p = smoothstep(clamp((innerHeight * 0.95 - rect.top) / (innerHeight * 0.62)));
      const capEyebrow = capability.querySelector(".capabilities-entry__eyebrow");
      const capLines = [...capability.querySelectorAll(".capabilities-entry__title > span")];
      const capCopy = capability.querySelector(".capabilities-entry__copy");

      revealElement(capEyebrow, smoothstep(range(p, 0.00, 0.42)), 32);
      capLines.forEach((line, index) => {
        const lp = smoothstep(range(p, 0.08 + index * 0.085, 0.58 + index * 0.085));
        line.style.opacity = String(0.02 + lp * 0.98);
        line.style.transform = `translate3d(0, ${(88 * (1 - lp)).toFixed(2)}px, 0)`;
        line.style.clipPath = `inset(${(100 * (1 - lp)).toFixed(2)}% 0 0 0)`;
      });
      revealElement(capCopy, smoothstep(range(p, 0.40, 0.92)), 42);
    }

    function update() {
      ticking = false;
      updateHeader();
      updateRows();
      updateCapabilities();
    }

    function queueUpdate() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    function applyFilter(filterKey, button) {
      filters.forEach((item) => {
        const active = item === button;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", active ? "true" : "false");
      });

      const currentlyVisible = allCards.filter((card) => !card.hidden);
      const finish = () => {
        allCards.forEach((card) => card.getAnimations?.().forEach((animation) => animation.cancel()));
        arrangeCards(filterKey);
        allCards.filter((card) => !card.hidden).forEach((card) => {
          card.animate?.(
            [
              { opacity: 0.30, transform: `${card.style.transform || "none"} scale(.985)` },
              { opacity: Number(card.style.opacity) || 1, transform: card.style.transform || "none" }
            ],
            { duration: 280, easing: "cubic-bezier(.2,.72,.2,1)" }
          );
        });
        requestAnimationFrame(update);
        window.ScrollTrigger?.refresh?.();
      };

      if (currentlyVisible.length && Element.prototype.animate) {
        const animations = currentlyVisible.map((card) => card.animate(
          [{ opacity: Number(getComputedStyle(card).opacity) || 1 }, { opacity: 0 }],
          { duration: 130, easing: "ease-in", fill: "forwards" }
        ));
        Promise.all(animations.map((animation) => animation.finished.catch(() => {}))).then(finish);
      } else {
        finish();
      }
    }

    filters.forEach((button) => {
      button.addEventListener("click", () => applyFilter(button.dataset.filter || "all", button));
    });

    allCards.forEach((card) => {
      const media = card.querySelector(".work-card__media");
      if (!media) return;
      card.addEventListener("pointerleave", () => {
        media.style.setProperty("--media-x", "0px");
        media.style.setProperty("--media-y", "0px");
      });
      card.addEventListener("pointermove", (event) => {
        if (event.pointerType !== "mouse" || mobile() || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const rect = media.getBoundingClientRect();
        const nx = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1) - 0.5;
        const ny = clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1) - 0.5;
        media.style.setProperty("--media-x", `${(nx * 7).toFixed(2)}px`);
        media.style.setProperty("--media-y", `${(ny * 5).toFixed(2)}px`);
      });
    });

    arrangeCards("all");
    addEventListener("scroll", queueUpdate, { passive: true });
    addEventListener("resize", queueUpdate, { passive: true });
    addEventListener("pageshow", queueUpdate);
    addEventListener("commit:language-change", () => requestAnimationFrame(update));
    update();
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
