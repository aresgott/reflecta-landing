/* Assessment pages: page chrome + the Scene loop engine.
 *
 * Each page's scene is a fixed 560×560 stage animated on ONE looping clock. A page calls
 *
 *   Scene(12, function (s) { s.win(el, 1.2, 4.0); s.at(el, 5, {…}, {…}, 0.6); … });
 *
 * once at the end of <body>. Every animation is a Web Animation as long as the loop
 * (iterations: Infinity) whose keyframe offsets are its moments in the loop, so the scene
 * stays in sync forever and pauses as one when it scrolls out of view. The markup is the still
 * frame: no JS / reduced motion show it as is (minus `.anim-only` elements).
 *
 * The page opens on the Reflecta thread (thread.js): the tangle around the page's question is
 * pulled straight, then the page fades in and the scene starts from 0. */
(function () {
  var root = document.documentElement;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var motion = !reduce && !!Element.prototype.animate;
  if (motion) root.classList.add("motion");

  var E = {
    out: "cubic-bezier(.2,.8,.2,1)",
    inout: "cubic-bezier(.65,0,.35,1)",
    spring: "cubic-bezier(.34,1.56,.64,1)",
    inq: "cubic-bezier(.6,0,.85,.3)",
  };

  /* chrome */
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
  var header = document.getElementById("site-header");
  function onScroll() {
    if (header) header.classList.toggle("is-scrolled", scrollY > 12);
  }
  onScroll();
  addEventListener("scroll", onScroll, { passive: true });

  var reveals = document.querySelectorAll(".reveal");
  if (motion && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    reveals.forEach(function (el) {
      io.observe(el);
    });
  } else {
    reveals.forEach(function (el) {
      el.classList.add("is-visible");
    });
  }

  /* stage scale */
  var wrap = document.querySelector(".stage-wrap");
  var stage = document.querySelector(".stage");
  function fit() {
    if (wrap && stage) stage.style.setProperty("--k", String(wrap.clientWidth / 560));
  }
  fit();
  if (wrap && "ResizeObserver" in window) new ResizeObserver(fit).observe(wrap);
  else addEventListener("resize", fit);

  /* intro → scene */
  var ready = [];
  var opened = !root.classList.contains("intro-on");
  function open() {
    if (opened) return;
    opened = true;
    root.classList.remove("intro-on");
    ["#site-header", "main", "footer"].forEach(function (sel, k) {
      var el = document.querySelector(sel);
      if (el && motion) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: k * 60, easing: "ease-out", fill: "backwards" });
    });
    ready.splice(0).forEach(function (f) {
      f();
    });
  }
  if (!opened) {
    var h1 = document.querySelector(".a-hero h1");
    if (motion && window.ReflectaThread) ReflectaThread.arrive(h1 ? h1.textContent : "", open);
    else open();
    setTimeout(open, 4000);
  }

  /* the loop engine */
  function assign(a, b) {
    var o = {};
    var k;
    for (k in a) o[k] = a[k];
    for (k in b) o[k] = b[k];
    return o;
  }
  var HID = { opacity: 0, translate: "0 16px", filter: "blur(8px)" };
  var SHOW = { opacity: 1, translate: "0 0", filter: "blur(0px)" };
  var GONE = { opacity: 0, translate: "0 -10px", filter: "blur(8px)" };

  window.Scene = function (L, build) {
    if (!motion || !stage) return;
    var anims = [];
    var tracks = [];
    function o(t) {
      return Math.max(0, Math.min(1, t / L));
    }
    function add(el, frames) {
      if (!el) return;
      var a = el.animate(frames, { duration: L * 1000, iterations: Infinity, easing: "linear" });
      a.pause();
      anims.push(a);
      return a;
    }
    var s = {
      E: E,
      L: L,
      /* Raw keyframes: [{ t: seconds, …props, easing? }, …]; held before the first and after the last. */
      keys: function (el, frames) {
        var f = frames.map(function (fr) {
          var c = assign(fr, { offset: o(fr.t) });
          delete c.t;
          return c;
        });
        if (f[0].offset > 0) f.unshift(assign(f[0], { offset: 0 }));
        if (f[f.length - 1].offset < 1) f.push(assign(f[f.length - 1], { offset: 1, easing: "linear" }));
        return add(el, f);
      },
      /* In at t0, out at t1. o: from / to / out, i (in duration), x (out duration), ease. */
      win: function (el, t0, t1, op) {
        op = op || {};
        var i = op.i || 0.6;
        var x = op.x || 0.45;
        var from = op.from || HID;
        var to = op.to || SHOW;
        var out = op.out || GONE;
        return s.keys(el, [
          assign(from, { t: t0, easing: op.ease || E.out }),
          assign(to, { t: t0 + i }),
          assign(to, { t: Math.max(t1, t0 + i), easing: E.inout }),
          assign(out, { t: Math.max(t1, t0 + i) + x }),
        ]);
      },
      /* Pops in at t with a spring and stays until the loop ends. */
      pop: function (el, t, op) {
        op = op || {};
        return s.keys(el, [
          { t: t, opacity: 0, scale: op.s || 0.6, filter: "blur(6px)", easing: E.spring },
          { t: t + (op.d || 0.6), opacity: 1, scale: 1, filter: "blur(0px)" },
        ]);
      },
      /* Goes from a to b at t over d seconds and holds b. */
      at: function (el, t, a, b, d, ease) {
        return s.keys(el, [assign(a, { t: t, easing: ease || E.inout }), assign(b, { t: t + (d || 0.6) })]);
      },
      /* Per-frame work on the loop clock: fn(t) with t in [0, L). */
      track: function (fn) {
        tracks.push(fn);
      },
      /* Types text into el between t0 and t1; del = [d0, d1] deletes it again. */
      type: function (el, text, t0, t1, del) {
        tracks.push(function (t) {
          var n = t < t0 ? 0 : t < t1 ? Math.round((text.length * (t - t0)) / (t1 - t0)) : text.length;
          if (del) {
            if (t >= del[1]) n = 0;
            else if (t > del[0]) n = Math.round(text.length * (1 - (t - del[0]) / (del[1] - del[0])));
          }
          var v = text.slice(0, n);
          if (el._v !== v) {
            el.textContent = v;
            el._v = v;
          }
        });
      },
      /* Counts el from a to b between t0 and t1. */
      count: function (el, a, b, t0, t1, fmt) {
        tracks.push(function (t) {
          var u = Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
          var v = a + (b - a) * (1 - Math.pow(1 - u, 3));
          var str = fmt ? fmt(v) : String(Math.round(v));
          if (el._v !== str) {
            el.textContent = str;
            el._v = str;
          }
        });
      },
    };

    // The whole scene fades in and out at the loop seam.
    s.keys(stage.querySelector(".scene"), [
      { t: 0, opacity: 0 },
      { t: 0.4, opacity: 1 },
      { t: L - 0.5, opacity: 1 },
      { t: L, opacity: 0 },
    ]);
    // Captions under the stage: <span data-t0 data-t1>.
    Array.prototype.forEach.call(document.querySelectorAll(".scene-cap > span"), function (c) {
      s.win(c, parseFloat(c.dataset.t0), parseFloat(c.dataset.t1), { i: 0.7, x: 0.4 });
    });
    build(s);
    var ref = anims[0];

    var raf = 0;
    var running = false;
    function frame() {
      var t = ((ref.currentTime || 0) / 1000) % L;
      for (var i = 0; i < tracks.length; i++) tracks[i](t);
      raf = requestAnimationFrame(frame);
    }
    function play() {
      if (running) return;
      running = true;
      anims.forEach(function (a) {
        a.play();
      });
      raf = requestAnimationFrame(frame);
    }
    function pause() {
      if (!running) return;
      running = false;
      anims.forEach(function (a) {
        a.pause();
      });
      cancelAnimationFrame(raf);
    }

    // ?t=4.2 freezes the scene on a moment (for reviews and screenshots).
    var freeze = parseFloat(new URLSearchParams(location.search).get("t"));
    if (!isNaN(freeze)) {
      anims.forEach(function (a) {
        a.currentTime = freeze * 1000;
      });
      for (var i = 0; i < tracks.length; i++) tracks[i](freeze);
      return;
    }

    var visible = true;
    var started = false;
    function sync() {
      if (started && visible && !document.hidden) play();
      else pause();
    }
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (e) {
        visible = e[0].isIntersecting;
        sync();
      }).observe(stage);
    }
    document.addEventListener("visibilitychange", sync);
    function start() {
      started = true;
      sync();
    }
    if (opened) start();
    else ready.push(start);
  };
})();
