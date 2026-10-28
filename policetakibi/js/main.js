(function () {
  "use strict";

  var WA_TEXT =
    "Merhaba, ruhsat fotoğrafımı göndermek istiyorum. Poliçe teklifi alabilir miyim?";
  var WA_URL =
    "https://wa.me/905447202837?text=" + encodeURIComponent(WA_TEXT);
  var TIP_KEY = "pt_wa_tip_dismissed";

  function injectWhatsAppFab() {
    if (document.querySelector(".wa-fab-wrap")) return;

    var wrap = document.createElement("div");
    wrap.className = "wa-fab-wrap";
    wrap.setAttribute("data-wa-root", "");

    var tipDismissed = false;
    try {
      tipDismissed = localStorage.getItem(TIP_KEY) === "1";
    } catch (e) {
      tipDismissed = false;
    }

    if (!tipDismissed) {
      var tip = document.createElement("div");
      tip.className = "wa-tip";
      tip.setAttribute("role", "dialog");
      tip.setAttribute("aria-label", "WhatsApp teklif ipucu");

      var tipLink = document.createElement("a");
      tipLink.className = "wa-tip-link";
      tipLink.href = WA_URL;
      tipLink.target = "_blank";
      tipLink.rel = "noopener noreferrer";
      tipLink.innerHTML =
        '<span class="wa-tip-label">WhatsApp</span>' +
        "<p>Ruhsat fotoğrafı gönderin, poliçe teklifi alalım.</p>";

      var closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "wa-tip-close";
      closeBtn.setAttribute("aria-label", "İpucunu kapat");
      closeBtn.innerHTML = "&times;";
      closeBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        tip.classList.add("is-hiding");
        try {
          localStorage.setItem(TIP_KEY, "1");
        } catch (err) {
          /* ignore */
        }
        window.setTimeout(function () {
          if (tip.parentNode) tip.parentNode.removeChild(tip);
        }, 220);
      });

      tip.appendChild(tipLink);
      tip.appendChild(closeBtn);
      wrap.appendChild(tip);
    }

    var fab = document.createElement("a");
    fab.className = "wa-fab";
    fab.href = WA_URL;
    fab.target = "_blank";
    fab.rel = "noopener noreferrer";
    fab.setAttribute(
      "aria-label",
      "WhatsApp ile ruhsat gönderin, poliçe teklifi alın"
    );
    fab.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>';

    wrap.appendChild(fab);
    document.body.appendChild(wrap);
  }

  function initMobileNav() {
    var toggle = document.querySelector(".nav-toggle");
    var nav = document.querySelector(".site-nav");
    if (!toggle || !nav) return;

    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });

    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && nav.classList.contains("is-open")) {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  function markCurrentNav() {
    var path = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    if (!path || path === "") path = "index.html";
    document.querySelectorAll(".site-nav a[href]").forEach(function (a) {
      var href = (a.getAttribute("href") || "").toLowerCase();
      if (href === path || (path === "index.html" && href === "./")) {
        a.setAttribute("aria-current", "page");
      }
    });
  }

  function initCarousels() {
    document.querySelectorAll("[data-carousel]").forEach(function (root) {
      var slides = Array.prototype.slice.call(
        root.querySelectorAll("[data-carousel-slide]")
      );
      if (slides.length < 2) return;

      var dotsWrap = root.querySelector("[data-carousel-dots]");
      var prevBtn = root.querySelector("[data-carousel-prev]");
      var nextBtn = root.querySelector("[data-carousel-next]");
      var index = Math.max(
        0,
        slides.findIndex(function (s) {
          return s.classList.contains("is-active");
        })
      );
      var timer = null;
      var reduceMotion =
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      var AUTO_MS = 5500;

      function buildDots() {
        if (!dotsWrap) return;
        dotsWrap.innerHTML = "";
        slides.forEach(function (slide, i) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "shots-dot";
          btn.setAttribute("role", "tab");
          var kind = slide.classList.contains("is-mobile")
            ? "Mobil uygulama"
            : "PC uygulaması";
          btn.setAttribute("aria-label", kind + " — ekran " + (i + 1));
          btn.addEventListener("click", function () {
            goTo(i, "next");
            restartAuto();
          });
          dotsWrap.appendChild(btn);
        });
      }

      function syncDots() {
        if (!dotsWrap) return;
        Array.prototype.forEach.call(dotsWrap.children, function (dot, i) {
          dot.setAttribute("aria-selected", i === index ? "true" : "false");
        });
      }

      function goTo(next, dir) {
        if (next === index) return;
        slides[index].classList.remove("is-active");
        slides[index].removeAttribute("data-dir");
        index = (next + slides.length) % slides.length;
        slides[index].setAttribute("data-dir", dir || "next");
        slides[index].classList.add("is-active");
        syncDots();
      }

      function next() {
        goTo(index + 1, "next");
      }

      function prev() {
        goTo(index - 1, "prev");
      }

      function stopAuto() {
        if (timer) {
          window.clearInterval(timer);
          timer = null;
        }
      }

      function startAuto() {
        stopAuto();
        if (reduceMotion) return;
        timer = window.setInterval(next, AUTO_MS);
      }

      function restartAuto() {
        stopAuto();
        startAuto();
      }

      buildDots();
      syncDots();

      if (prevBtn) {
        prevBtn.addEventListener("click", function () {
          prev();
          restartAuto();
        });
      }
      if (nextBtn) {
        nextBtn.addEventListener("click", function () {
          next();
          restartAuto();
        });
      }

      root.addEventListener("mouseenter", stopAuto);
      root.addEventListener("mouseleave", startAuto);
      root.addEventListener("focusin", stopAuto);
      root.addEventListener("focusout", function (ev) {
        if (!root.contains(ev.relatedTarget)) startAuto();
      });

      var startX = null;
      root.addEventListener(
        "touchstart",
        function (ev) {
          if (!ev.touches || !ev.touches.length) return;
          startX = ev.touches[0].clientX;
          stopAuto();
        },
        { passive: true }
      );
      root.addEventListener(
        "touchend",
        function (ev) {
          if (startX == null || !ev.changedTouches || !ev.changedTouches.length) {
            startAuto();
            return;
          }
          var dx = ev.changedTouches[0].clientX - startX;
          startX = null;
          if (Math.abs(dx) > 40) {
            if (dx < 0) next();
            else prev();
          }
          startAuto();
        },
        { passive: true }
      );

      document.addEventListener("visibilitychange", function () {
        if (document.hidden) stopAuto();
        else startAuto();
      });

      startAuto();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      markCurrentNav();
      initMobileNav();
      injectWhatsAppFab();
      initCarousels();
    });
  } else {
    markCurrentNav();
    initMobileNav();
    injectWhatsAppFab();
    initCarousels();
  }
})();
