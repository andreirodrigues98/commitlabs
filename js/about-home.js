(() => {
  "use strict";

  const section = document.getElementById("about");
  const grid = section?.querySelector(".about-home__technical-grid");
  if (!section || !grid) return;

  let targetX = 0;
  let targetY = 0;
  let x = 0;
  let y = 0;
  let raf = 0;

  function animate() {
    x += (targetX - x) * .055;
    y += (targetY - y) * .055;
    grid.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
    raf = requestAnimationFrame(animate);
  }

  function onPointer(event) {
    if (innerWidth <= 760) return;
    const rect = section.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight) return;
    targetX = ((event.clientX / innerWidth) - .5) * 10;
    targetY = ((event.clientY / innerHeight) - .5) * 7;
  }

  window.addEventListener("pointermove", onPointer, { passive: true });
  raf = requestAnimationFrame(animate);
  window.addEventListener("pagehide", () => cancelAnimationFrame(raf), { once: true });
})();
