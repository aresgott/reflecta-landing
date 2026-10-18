/* The Reflecta thread, shared by the landing and the assessment pages.
 *
 * A full-screen paper overlay with one coral→violet line tangled around a question. The
 * landing draws it when a library card is clicked (ReflectaThread.leave), and the assessment
 * page opens on the same tangle and pulls it straight before its scene starts
 * (ReflectaThread.arrive). Both compute the tangle from the viewport, so the hand-off between
 * the two documents lines up. */
(function () {
  var N = 84;
  var style =
    ".rt-overlay{position:fixed;inset:0;z-index:100;background:#f6f2ec;pointer-events:none}" +
    ".rt-overlay svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}" +
    ".rt-overlay path{fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}" +
    ".rt-overlay .rt-glow{stroke-width:10;opacity:.16;filter:blur(6px)}" +
    ".rt-q{position:absolute;left:50%;top:50%;width:min(86vw,15em);margin:0;transform:translate(-50%,-50%);" +
    "text-align:center;font-family:'Instrument Serif',Georgia,serif;font-size:clamp(34px,5vw,64px);line-height:1.04;" +
    "letter-spacing:-.01em;color:#1b1714;text-shadow:0 0 18px #f6f2ec,0 0 36px #f6f2ec}";

  function css() {
    if (document.getElementById("rt-style")) return;
    var s = document.createElement("style");
    s.id = "rt-style";
    s.textContent = style;
    document.head.appendChild(s);
  }

  function geom() {
    var w = innerWidth;
    var h = innerHeight;
    var s = Math.min(w, h) * 0.36;
    var cx = w / 2;
    var cy = h / 2;
    var tangle = [];
    var line = [];
    for (var k = 0; k < N; k++) {
      var t = k / (N - 1);
      var a = t * Math.PI * 2 * 3.2;
      var b = t * Math.PI * 2 * 7.4 + 1.1;
      var g = 0.55 + 0.45 * Math.sin(t * Math.PI);
      tangle.push([cx + s * (Math.cos(a) * g + 0.33 * Math.cos(b)), cy + s * 0.8 * (Math.sin(a * 1.07) * g + 0.36 * Math.sin(b * 0.93))]);
      line.push([-0.3 * w + t * 1.6 * w, cy + s * 0.95]);
    }
    return { w: w, h: h, tangle: tangle, line: line };
  }

  function smooth(P) {
    var f = function (v) {
      return v.toFixed(1);
    };
    var d = "M" + f(P[0][0]) + " " + f(P[0][1]);
    for (var i = 0; i < P.length - 1; i++) {
      var p0 = P[i - 1] || P[i];
      var p1 = P[i];
      var p2 = P[i + 1];
      var p3 = P[i + 2] || p2;
      d +=
        " C" + f(p1[0] + (p2[0] - p0[0]) / 6) + " " + f(p1[1] + (p2[1] - p0[1]) / 6) +
        " " + f(p2[0] - (p3[0] - p1[0]) / 6) + " " + f(p2[1] - (p3[1] - p1[1]) / 6) +
        " " + f(p2[0]) + " " + f(p2[1]);
    }
    return d;
  }

  function ease(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function clamp(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  function overlay(text) {
    css();
    var el = document.createElement("div");
    el.className = "rt-overlay";
    el.setAttribute("aria-hidden", "true");
    var w = innerWidth;
    el.innerHTML =
      '<svg viewBox="0 0 ' + innerWidth + " " + innerHeight + '"><defs><linearGradient id="rtg" gradientUnits="userSpaceOnUse" x1="' +
      -0.2 * w + '" y1="0" x2="' + 1.2 * w + '" y2="0"><stop offset="0" stop-color="#e8775e" stop-opacity="0"/>' +
      '<stop offset=".3" stop-color="#e8775e"/><stop offset=".68" stop-color="#6b4ef0"/><stop offset="1" stop-color="#6b4ef0" stop-opacity="0"/>' +
      '</linearGradient></defs><path class="rt-glow" stroke="url(#rtg)" pathLength="1"/><path class="rt-line" stroke="url(#rtg)" pathLength="1"/></svg>' +
      '<p class="rt-q"></p>';
    el.querySelector(".rt-q").textContent = text || "";
    document.body.appendChild(el);
    var paths = el.querySelectorAll("path");
    return {
      el: el,
      q: el.querySelector(".rt-q"),
      set: function (d, dash) {
        for (var i = 0; i < paths.length; i++) {
          paths[i].setAttribute("d", d);
          paths[i].style.strokeDasharray = "1 1";
          paths[i].style.strokeDashoffset = String(dash || 0);
        }
      },
    };
  }

  function wobbled(P, t, amp) {
    return P.map(function (p, k) {
      return [p[0] + amp * Math.sin(t * 9 + k * 1.7), p[1] + amp * Math.cos(t * 8 + k * 2.3)];
    });
  }

  /* Landing → assessment: draw the tangle over the page, then go. */
  function leave(href, text) {
    var o = overlay(text);
    var G = geom();
    o.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 280, easing: "ease-out", fill: "both" });
    o.q.animate(
      [
        { opacity: 0, transform: "translate(-50%,-50%) translateY(14px)", filter: "blur(8px)" },
        { opacity: 1, transform: "translate(-50%,-50%)", filter: "blur(0px)" },
      ],
      { duration: 700, delay: 150, easing: "cubic-bezier(.2,.8,.2,1)", fill: "both" }
    );
    var t0 = performance.now();
    var gone = false;
    function go() {
      if (gone) return;
      gone = true;
      location.href = href;
    }
    (function frame(now) {
      var t = (now - t0) / 1000;
      o.set(smooth(wobbled(G.tangle, t, 3.5)), 1 - ease(clamp((t - 0.1) / 0.9)));
      if (t < 1.15) requestAnimationFrame(frame);
      else go();
    })(t0);
    setTimeout(go, 1600);
    // Coming back with the back button restores this page from cache: drop the overlay.
    addEventListener("pageshow", function (e) {
      if (e.persisted && o.el.parentNode) o.el.parentNode.removeChild(o.el);
    });
  }

  /* Assessment page: open on the tangle, pull it straight, reveal the page. */
  function arrive(text, done) {
    var o = overlay(text);
    var G = geom();
    var t0 = performance.now();
    var PULL = 0.55;
    o.q.animate(
      [
        { opacity: 1, transform: "translate(-50%,-50%)", filter: "blur(0px)" },
        { opacity: 0, transform: "translate(-50%,-50%) translateY(-24px)", filter: "blur(10px)" },
      ],
      { duration: 600, delay: PULL * 1000 + 250, easing: "cubic-bezier(.65,0,.35,1)", fill: "both" }
    );
    o.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 650, delay: (PULL + 1.05) * 1000, easing: "ease-in-out", fill: "both" });
    var finished = false;
    function end() {
      if (finished) return;
      finished = true;
      if (o.el.parentNode) o.el.parentNode.removeChild(o.el);
    }
    (function frame(now) {
      var t = (now - t0) / 1000;
      var calm = clamp((t - PULL) / 0.9);
      var P = G.tangle.map(function (p, k) {
        var u = ease(clamp((t - PULL - (1 - k / (N - 1)) * 0.4) / 0.75));
        return [p[0] + (G.line[k][0] - p[0]) * u, p[1] + (G.line[k][1] - p[1]) * u];
      });
      o.set(smooth(wobbled(P, t, 3.5 * (1 - calm))), 0);
      if (t > PULL + 1.0 && done) {
        done();
        done = null;
      }
      if (t < PULL + 1.75) requestAnimationFrame(frame);
      else end();
    })(t0);
    setTimeout(function () {
      if (done) {
        done();
        done = null;
      }
      end();
    }, 3500);
  }

  window.ReflectaThread = { leave: leave, arrive: arrive };
})();
