(() => {
  "use strict";

  const header = document.getElementById("siteHeader");
  const intro = document.getElementById("intro");
  const about = document.getElementById("about");
  const work = document.getElementById("work");
  const capabilities = document.getElementById("capabilities");
  const menu = document.getElementById("mobileMenu");
  const menuTrigger = document.getElementById("mobileMenuTrigger");
  const backdrop = document.getElementById("menuBackdrop");
  const headerLanguageToggle = document.getElementById("headerLanguageToggle");
  const languageButtons = [...document.querySelectorAll("[data-language]")];

  if (!header) return;

  // Conteúdo bilíngue com seletor PT / EN integrado à navegação compacta.
  let language = "pt";
  try { language = localStorage.getItem("commit-labs-language") || "pt"; } catch (_) {}
  function setLanguage(next) {
    language = next === "en" ? "en" : "pt";
    document.documentElement.lang = language === "pt" ? "pt-BR" : "en";
    document.querySelectorAll("[data-i18n-pt][data-i18n-en]").forEach((el) => {
      el.textContent = el.getAttribute(`data-i18n-${language}`) || el.textContent;
    });
    document.querySelectorAll("[data-i18n-html-pt][data-i18n-html-en]").forEach((el) => {
      const html = el.getAttribute(`data-i18n-html-${language}`);
      if (html) el.innerHTML = html;
    });
    languageButtons.forEach((button) => {
      const active = button.dataset.language === language;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    if (headerLanguageToggle) {
      const nextLanguageName = language === "pt" ? "inglês" : "português do Brasil";
      headerLanguageToggle.querySelector(".header-language__label").textContent = language === "pt" ? "PT BR" : "EN";
      headerLanguageToggle.setAttribute("aria-label", `Alterar idioma para ${nextLanguageName}`);
      headerLanguageToggle.setAttribute("title", `Alterar idioma para ${nextLanguageName}`);
    }

    window.dispatchEvent(new CustomEvent("commit:language-change", { detail: { language } }));
    window.ScrollTrigger?.refresh?.();
  }
  setLanguage(language);
  languageButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.language === "en" ? "en" : "pt";
      try { localStorage.setItem("commit-labs-language", next); } catch (_) {}
      setLanguage(next);
    });
  });

  function sectionAtY(section, y = 56) {
    if (!section) return false;
    const rect = section.getBoundingClientRect();
    return rect.top <= y && rect.bottom > y;
  }

  function setMenuActive(hash) {
    menu?.querySelectorAll(".floating-menu__nav a").forEach((link) => {
      link.classList.toggle("is-active", link.getAttribute("href") === hash);
    });
  }

  function updateHeader() {
    const aboutRect = about?.getBoundingClientRect();
    const workRect = work?.getBoundingClientRect();
    const capRect = capabilities?.getBoundingClientRect();

    // O portal branco fica realmente limpo. A navegação entra apenas quando
    // o About já encostou no topo, como um segundo capítulo da experiência.
    const reachedContent = Boolean(
      (aboutRect && aboutRect.top <= -innerHeight * .18) ||
      (workRect && workRect.top <= 4) ||
      (capRect && capRect.top <= 4)
    );
    header.classList.toggle("is-visible", reachedContent || header.classList.contains("is-menu-open"));

    const inCapabilities = sectionAtY(capabilities, 54);
    const inWork = sectionAtY(work, 54);
    const inAbout = sectionAtY(about, 54);
    header.classList.toggle("is-on-dark", inCapabilities);
    header.classList.toggle("is-on-light", inAbout || inWork);

    if (inCapabilities) setMenuActive("#capabilities");
    else if (inWork) setMenuActive("#work");
    else if (inAbout) setMenuActive("#about");
    else setMenuActive("#intro");
  }

  function openMenu() {
    menu?.classList.add("is-open");
    backdrop?.classList.add("is-open");
    menu?.setAttribute("aria-hidden", "false");
    backdrop?.setAttribute("aria-hidden", "false");
    menuTrigger?.setAttribute("aria-expanded", "true");
    menuTrigger?.setAttribute("aria-label", "Fechar menu");
    header.classList.add("is-menu-open", "is-visible");
    document.body.classList.add("is-menu-open");
  }

  function closeMenu() {
    menu?.classList.remove("is-open");
    backdrop?.classList.remove("is-open");
    menu?.setAttribute("aria-hidden", "true");
    backdrop?.setAttribute("aria-hidden", "true");
    menuTrigger?.setAttribute("aria-expanded", "false");
    menuTrigger?.setAttribute("aria-label", "Abrir menu");
    header.classList.remove("is-menu-open");
    document.body.classList.remove("is-menu-open");
    updateHeader();
  }

  menuTrigger?.addEventListener("click", () => {
    if (menu?.classList.contains("is-open")) closeMenu();
    else openMenu();
  });
  backdrop?.addEventListener("click", closeMenu);
  menu?.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  headerLanguageToggle?.addEventListener("click", () => {
    const next = language === "pt" ? "en" : "pt";
    try { localStorage.setItem("commit-labs-language", next); } catch (_) {}
    setLanguage(next);
  });

  let ticking = false;
  function queueUpdate() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      updateHeader();
    });
  }
  window.addEventListener("scroll", queueUpdate, { passive: true });
  window.addEventListener("resize", queueUpdate, { passive: true });
  window.addEventListener("pageshow", queueUpdate);
  window.addEventListener("commit:content-ready", queueUpdate);
  updateHeader();
})();
