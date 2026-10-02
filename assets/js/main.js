/* The Candid Duo — interactions */
(function () {
  "use strict";

  /* ---- Mobile menu ---- */
  var toggle = document.querySelector(".nav-toggle");
  var links = document.querySelector(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", function () {
      var open = links.classList.toggle("open");
      document.body.classList.toggle("nav-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    links.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        links.classList.remove("open");
        document.body.classList.remove("nav-open");
      });
    });
  }

  /* ---- Transparent → solid header on scroll (homepage only) ---- */
  var header = document.querySelector(".site-header");
  if (header && header.dataset.overlay === "true") {
    var onScroll = function () {
      if (window.scrollY > window.innerHeight * 0.7) header.classList.add("solid");
      else header.classList.remove("solid");
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---- Hero carousel ---- */
  var hero = document.querySelector(".hero");
  if (hero) {
    var slides = hero.querySelectorAll(".hero__slide");
    var content = hero.querySelector(".hero__content");
    var dotsWrap = hero.querySelector(".hero__dots");
    var data = window.__HERO__ || [];
    var i = 0, timer;

    function render(idx) {
      slides.forEach(function (s, n) { s.classList.toggle("active", n === idx); });
      if (dotsWrap) {
        dotsWrap.querySelectorAll("button").forEach(function (b, n) {
          b.classList.toggle("active", n === idx);
        });
      }
      if (content && data[idx]) {
        var d = data[idx];
        var base = window.__BASEURL__ || "";
        var href = d.cta_url ? (/^https?:/.test(d.cta_url) ? d.cta_url : base + d.cta_url) : "";
        content.style.opacity = 0;
        setTimeout(function () {
          content.innerHTML =
            (d.eyebrow ? '<span class="eyebrow">' + d.eyebrow + "</span>" : "") +
            '<h1 class="hero__title">' + (d.title || "") + "</h1>" +
            (d.subtitle ? '<p class="hero__subtitle">' + d.subtitle + "</p>" : "") +
            (d.cta_text && href ? '<a class="btn btn--light" href="' + href + '">' + d.cta_text + "</a>" : "");
          // re-trigger entrance animation
          content.querySelectorAll("*").forEach(function (el, n) {
            el.style.animation = "none"; void el.offsetWidth;
            el.style.animation = "heroIn .9s cubic-bezier(.22,.61,.36,1) forwards";
            el.style.animationDelay = (0.12 + n * 0.12) + "s";
          });
          content.style.opacity = 1;
        }, 250);
      }
    }
    function go(idx) { i = (idx + slides.length) % slides.length; render(i); reset(); }
    function next() { go(i + 1); }
    function reset() { clearInterval(timer); if (slides.length > 1) timer = setInterval(next, 7000); }

    if (dotsWrap && slides.length > 1) {
      slides.forEach(function (_, n) {
        var b = document.createElement("button");
        b.setAttribute("aria-label", "Go to slide " + (n + 1));
        b.addEventListener("click", function () { go(n); });
        dotsWrap.appendChild(b);
      });
    }
    render(0); reset();
  }

  /* ---- Story filter (stories, family, products pages) ----
     A button matches cards on data-cat, or on the card attribute named by its
     data-filter-by (e.g. "section"), which can hold several space-separated values. */
  var filters = document.querySelector(".filters");
  if (filters) {
    var scope = filters.closest("section") || document;
    var cards = scope.querySelectorAll("[data-cat]");
    filters.querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        filters.querySelectorAll("button").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        var value = btn.dataset.filter;
        var by = btn.dataset.filterBy || "cat";
        cards.forEach(function (c) {
          var show = value === "all" || (c.dataset[by] || "").split(" ").indexOf(value) !== -1;
          c.style.display = show ? "" : "none";
        });
      });
    });
  }

  /* ---- Footer year ---- */
  var yr = document.getElementById("year");
  if (yr) yr.textContent = new Date().getFullYear();
})();
