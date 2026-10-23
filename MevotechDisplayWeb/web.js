/* Mevotech Display, web version.
   Plays the role the Android app played: finds media and customer logos, opens videos, PDFs and
   YouTube full screen, handles the idle timer and the Android back button. */
(() => {
  "use strict";
  const C = window.KIOSK_CONFIG || {};
  const q = s => document.querySelector(s);
  const EASE = "cubic-bezier(.16,1,.3,1)";
  const nv = q("#nv"), navBar = q("#navBar");
  const dp = () => Math.min(innerWidth, innerHeight) / 720;
  const ICON = {
    home: '<path d="M10,20v-6h4v6h5v-8h3L12,3 2,12h3v8z"/>',
    close: '<path d="M19,6.41L17.59,5 12,10.59 6.41,5 5,6.41 10.59,12 5,17.59 6.41,19 12,13.41 17.59,19 19,17.59 13.41,12z"/>',
  };
  let mode = "home";
  const ui = () => window.KioskUI;

  function toast(msg) {
    const t = q("#toast"); if (!t) return;
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 3600);
  }

  if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = "lib/pdf.worker.min.js";

  /* ================= Finding media and customers ================= */
  const VIDEO = /\.(mp4|m4v|webm|mov)$/i, PDF = /\.pdf$/i, IMAGE = /\.(png|jpe?g|webp|svg|gif)$/i;
  const base = location.href.replace(/[#?].*$/, "").replace(/[^/]*$/, "");
  const urlFor = p => base + p.split("/").map(encodeURIComponent).join("/");
  const nice = f => f.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();
  let content = { items: [], customers: [] }, loaded = false, lastScan = 0, scanning = null, failed = false;
  const thumbs = {};

  function githubRepo() {
    const h = location.hostname;
    if (!h.endsWith(".github.io")) return null;
    const seg = location.pathname.split("/").filter(Boolean)[0];
    return { owner: h.split(".")[0], repo: seg && !/\.\w+$/.test(seg) ? seg : h };
  }

  async function listPaths() {
    const r = githubRepo();
    if (r) {
      // Ask GitHub which files are in the project, so uploads show up without editing any list
      const api = `https://api.github.com/repos/${r.owner}/${r.repo}`;
      const info = await fetchJson(api);
      const tree = await fetchJson(`${api}/git/trees/${encodeURIComponent(info.default_branch)}?recursive=1`);
      return tree.tree.filter(t => t.type === "blob").map(t => t.path);
    }
    // Hosted somewhere else: list the files in content.json, e.g. { "files": ["media/a.mp4", "customers/Acme/logo.png"] }
    const list = await fetchJson("content.json?" + Date.now());
    return list.files || [];
  }
  async function fetchJson(u) {
    const r = await fetch(u, { cache: "no-store" });
    if (!r.ok) throw new Error(u + " " + r.status);
    return r.json();
  }

  function build(paths) {
    const items = [], logos = {};
    for (const p of paths) {
      const parts = p.split("/"), top = parts[0].toLowerCase(), file = parts[parts.length - 1];
      if (file.startsWith(".")) continue;
      if (top === "media" && parts.length >= 2) {
        const type = PDF.test(file) ? "pdf" : VIDEO.test(file) ? "video" : null;
        if (type) items.push({ id: p, name: nice(file) || file, type, folder: parts.slice(1, -1).join(" / "), url: urlFor(p) });
      } else if (top === "customers" && parts.length === 3 && IMAGE.test(file)) {
        const name = parts[1].trim(), isLogo = /^logo\./i.test(file), cur = logos[name];
        if (!cur || (isLogo && !cur.isLogo) || (isLogo === cur.isLogo && file.toLowerCase() < cur.file.toLowerCase()))
          logos[name] = { file, isLogo, logo: urlFor(p) };
      }
    }
    items.sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name));
    const customers = Object.keys(logos).sort((a, b) => a.localeCompare(b)).map(n => ({ name: n, logo: logos[n].logo }));
    return { items, customers };
  }

  function scan(force) {
    const fresh = Date.now() - lastScan < (force ? 20e3 : 5 * 60e3);
    if (loaded && fresh) { sendMedia(); return Promise.resolve(); }
    if (scanning) return scanning;
    scanning = (async () => {
      try {
        const paths = await listPaths();
        localStorage.setItem("kiosk.paths", JSON.stringify(paths));
        content = build(paths); failed = false;
      } catch (e) {
        // Offline or GitHub busy: keep showing what we found last time
        const saved = localStorage.getItem("kiosk.paths");
        if (saved) content = build(JSON.parse(saved)); else failed = true;
      }
      loaded = true; lastScan = Date.now(); scanning = null;
      sendMedia();
      makeThumbs();
    })();
    return scanning;
  }

  function sendMedia() {
    if (!ui()) return setTimeout(sendMedia, 100);
    const chosen = localStorage.getItem("kiosk.customer");
    const customers = content.customers;
    ui().onMedia(JSON.stringify({
      configured: true, folder: "media",
      error: failed ? "unreadable" : null,
      items: content.items.map(it => ({ id: it.id, name: it.name, type: it.type, folder: it.folder,
        thumb: (thumbs[it.id] && thumbs[it.id].thumb) || null, meta: (thumbs[it.id] && thumbs[it.id].meta) || "" })),
      customers,
      customer: customers.some(c => c.name === chosen) ? chosen : null,
    }));
  }

  /* ---------- Thumbnails, made on the display the first time it sees each file ---------- */
  let thumbing = false;
  async function makeThumbs() {
    if (thumbing) return; thumbing = true;
    let made = 0;
    for (const it of content.items) {
      if (thumbs[it.id]) continue;
      try { thumbs[it.id] = it.type === "pdf" ? await pdfThumb(it.url) : await videoThumb(it.url); }
      catch (e) { thumbs[it.id] = { thumb: null, meta: "" }; }
      if (++made % 4 === 0) sendMedia();
    }
    thumbing = false;
    if (made) sendMedia();
  }
  const fmt = s => !isFinite(s) || s <= 0 ? "" : s >= 3600
    ? `${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`
    : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  function videoThumb(url) {
    return new Promise((res, rej) => {
      const v = document.createElement("video");
      v.muted = true; v.playsInline = true; v.preload = "auto"; v.crossOrigin = "anonymous"; v.src = url;
      const to = setTimeout(() => { done(); rej(new Error("timeout")); }, 25000);
      const done = () => { clearTimeout(to); v.removeAttribute("src"); v.load(); };
      v.addEventListener("loadedmetadata", () => { v.currentTime = Math.min(2, (v.duration || 3) / 3); }, { once: true });
      v.addEventListener("seeked", () => {
        let thumb = null;
        try {
          const c = document.createElement("canvas"); c.width = 640;
          c.height = Math.round(640 * (v.videoHeight || 9) / (v.videoWidth || 16));
          c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
          thumb = c.toDataURL("image/jpeg", .8);
        } catch (e) {}
        const meta = fmt(v.duration); done(); res({ thumb, meta });
      }, { once: true });
      v.addEventListener("error", () => { done(); rej(new Error("video")); }, { once: true });
    });
  }
  async function pdfThumb(url) {
    if (!window.pdfjsLib) return { thumb: null, meta: "" };
    const doc = await pdfjsLib.getDocument(url).promise;
    try {
      const page = await doc.getPage(1);
      const v1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: 420 / v1.width });
      const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: g, viewport: vp }).promise;
      return { thumb: c.toDataURL("image/jpeg", .85), meta: doc.numPages === 1 ? "1 page" : `${doc.numPages} pages` };
    } finally { doc.destroy(); }
  }

  /* ================= Full-screen viewers ================= */
  let chromeT;
  function setChrome(on) {
    nv.classList.toggle("chrome-off", !on);
    clearTimeout(chromeT);
    if (on && mode === "pdf") chromeT = setTimeout(() => setChrome(false), 4000);
  }
  function show(view) {
    setChrome(true);
    ["#nvYoutube", "#nvVideo", "#nvPdf"].forEach(id => q(id).classList.toggle("on", id === view));
    q("#pdfBar").hidden = view !== "#nvPdf";
  }
  function setExit(media) {
    q("#homeLbl").textContent = media ? "Close" : "Menu";
    q("#homeIco").innerHTML = media ? ICON.close : ICON.home;
  }
  function reveal() {
    nv.hidden = false;
    nv.getAnimations().forEach(a => a.cancel());
    nv.animate([{ opacity: 0, transform: "scale(1.025)" }, { opacity: 1, transform: "none" }], { duration: 460, easing: EASE, fill: "both" });
    navBar.animate([{ opacity: 0, transform: `translateY(${-24 * dp()}px)` }, { opacity: 1, transform: "none" }],
      { duration: 420, delay: 260, easing: EASE, fill: "backwards" });
  }
  function teardown() {
    const v = q("#vid"); v.pause(); v.removeAttribute("src"); v.load();
    q("#ytFrame").removeAttribute("src");
    if (pdf) { try { pdf.doc.destroy(); } catch (e) {} pdf = null; }
    q("#pdfTrack").innerHTML = "";
  }
  function goHome(fromIdle) {
    if (mode === "home") { if (fromIdle && ui()) ui().onIdle(); return; }
    mode = "home";
    if (ui()) ui().onReturn(!!fromIdle);
    q("#vid").pause();
    nv.getAnimations().forEach(a => a.cancel());
    const a = nv.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(.985)" }], { duration: 300, fill: "forwards" });
    a.onfinish = () => { nv.hidden = true; a.cancel(); teardown(); };
    scan(false);
  }
  q("#homeBtn").addEventListener("click", () => goHome(false));

  /* ---------- Catalog: the website itself, full screen ---------- */
  function openCatalog() {
    // Websites can't be shown inside another page, so the display goes to the site itself.
    // Installed to the home screen, Chrome shows a small bar with an X that comes back here;
    // in a normal tab, the Android back button does.
    location.href = C.catalogUrl || "https://www.mevotech.com/";
  }
  // Coming back from the website: settle the menu instead of leaving the launch panel up
  addEventListener("pageshow", e => { if (e.persisted && ui()) ui().onReturn(false); });

  /* ---------- YouTube: the channel's uploads, playing inside the display ---------- */
  function openYouTube() {
    mode = "youtube";
    const list = (C.youtubeChannelId || "").replace(/^UC/, "UU");
    q("#ytFrame").src = `https://www.youtube.com/embed/videoseries?list=${list}&autoplay=1&rel=0&playsinline=1&modestbranding=1`;
    show("#nvYoutube"); setExit(false);
    reveal();
  }

  /* ---------- Video ---------- */
  function openVideo(item) {
    mode = "video";
    const v = q("#vid");
    v.loop = C.loopVideos !== false;
    v.src = item.url;
    v.play().catch(() => {});
    show("#nvVideo"); setExit(true);
    reveal();
  }

  /* ---------- PDF: full screen, a tap shows Close and the page controls ---------- */
  const track = q("#pdfTrack");
  let pdf = null, openToken = 0;
  async function openPdf(item) {
    mode = "pdf";
    const token = ++openToken;
    track.innerHTML = ""; q("#pdfLoading").hidden = false;
    show("#nvPdf"); setExit(true);
    reveal();
    nv.getAnimations({ subtree: true }).filter(a => a.effect && a.effect.target === navBar).forEach(a => a.cancel());
    setChrome(false);
    let doc;
    try { doc = await pdfjsLib.getDocument(item.url).promise; }
    catch (e) { if (token === openToken) { toast("This PDF can't be opened. It may be damaged or password protected."); goHome(false); } return; }
    if (token !== openToken || mode !== "pdf") { doc.destroy(); return; }
    pdf = { doc, n: doc.numPages, i: 0 };
    track.innerHTML = Array.from({ length: pdf.n }, (_, i) => `<div class="pdf-page"><canvas data-p="${i + 1}"></canvas></div>`).join("");
    q("#pdfLoading").hidden = true;
    q("#pPrev").style.display = q("#pNext").style.display = pdf.n > 1 ? "" : "none";
    goPage(0, false);
  }
  async function renderPage(p) {
    if (!pdf || p < 1 || p > pdf.n) return;
    const cv = track.querySelector(`canvas[data-p="${p}"]`);
    if (!cv || cv.dataset.done) return;
    cv.dataset.done = "1";
    const page = await pdf.doc.getPage(p);
    const W = nv.clientWidth, H = nv.clientHeight, ratio = Math.min(2, devicePixelRatio || 1);
    const v1 = page.getViewport({ scale: 1 }), fit = Math.min(W / v1.width, H / v1.height);
    const vp = page.getViewport({ scale: fit * ratio });
    cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
    cv.style.width = Math.floor(vp.width / ratio) + "px"; cv.style.height = Math.floor(vp.height / ratio) + "px";
    const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: g, viewport: vp }).promise;
  }
  function goPage(i, anim = true) {
    if (!pdf) return;
    pdf.i = Math.max(0, Math.min(pdf.n - 1, i));
    track.style.transition = anim ? `transform .5s ${EASE}` : "none";
    track.style.transform = `translateX(${-pdf.i * 100}%)`;
    q("#pInd").textContent = `Page ${pdf.i + 1} of ${pdf.n}`;
    q("#pPrev").disabled = pdf.i === 0;
    q("#pNext").disabled = pdf.i === pdf.n - 1;
    [pdf.i + 1, pdf.i + 2, pdf.i].forEach(p => renderPage(p).catch(() => {}));
  }
  q("#pPrev").addEventListener("click", () => { if (pdf) { goPage(pdf.i - 1); setChrome(true); } });
  q("#pNext").addEventListener("click", () => { if (pdf) { goPage(pdf.i + 1); setChrome(true); } });
  let sx = null, sw = 1;
  const pdfView = q("#nvPdf");
  pdfView.addEventListener("pointerdown", e => {
    if (e.target.closest(".pdf-bar, .navbar")) return;
    sx = e.clientX; sw = pdfView.clientWidth; track.style.transition = "none";
    try { pdfView.setPointerCapture(e.pointerId); } catch (_) {}
  });
  pdfView.addEventListener("pointermove", e => {
    if (sx === null || !pdf) return;
    let d = e.clientX - sx;
    if ((pdf.i === 0 && d > 0) || (pdf.i === pdf.n - 1 && d < 0)) d *= .3;
    track.style.transform = `translateX(calc(${-pdf.i * 100}% + ${d}px))`;
  });
  const endSwipe = e => {
    if (sx === null) return;
    const d = e.clientX - sx; sx = null;
    if (!pdf) return setChrome(nv.classList.contains("chrome-off"));
    if (Math.abs(d) < 8) { goPage(pdf.i, false); return setChrome(nv.classList.contains("chrome-off")); }  // a tap
    goPage(Math.abs(d) > sw * .15 ? pdf.i + (d < 0 ? 1 : -1) : pdf.i);
  };
  pdfView.addEventListener("pointerup", endSwipe);
  pdfView.addEventListener("pointercancel", endSwipe);

  /* ================= Kiosk behaviour ================= */
  // Android back button: close what's open instead of leaving the page
  // (Chrome only honours this after the first tap, so it's set up then)
  history.replaceState({ k: 0 }, "");
  addEventListener("pointerdown", () => history.pushState({ k: 1 }, ""), { once: true, capture: true });
  addEventListener("popstate", () => {
    history.pushState({ k: 1 }, "");
    if (mode !== "home") goHome(false); else if (ui()) ui().onBack();
  });

  // Idle: back to the menu, or to the customer welcome
  let lastTouch = Date.now(), idleSent = false;
  addEventListener("pointerdown", () => { lastTouch = Date.now(); idleSent = false; }, true);
  setInterval(() => {
    const v = q("#vid");
    if (mode === "video" && !v.paused) { lastTouch = Date.now(); return; }
    const limit = (mode === "youtube" ? (C.youtubeIdleMinutes || 15) : (C.idleMinutes || 3)) * 60e3;
    if (idleSent || Date.now() - lastTouch < limit) return;
    idleSent = true;
    goHome(true);
  }, 5000);

  // Look for new uploads now and then while the menu is showing
  setInterval(() => { if (mode === "home") scan(false); }, Math.max(5, C.checkForNewFilesMinutes || 15) * 60e3);

  // Full screen on the first tap (a normal Chrome tab needs a tap before it can go full screen)
  const standalone = matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches;
  function goFullscreen() {
    const el = document.documentElement;
    if (document.fullscreenElement || !el.requestFullscreen) return;
    el.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
  }
  if (C.autoFullscreen !== false && !standalone) addEventListener("pointerup", goFullscreen, { once: true, capture: true });

  // Keep the screen on
  let lock = null;
  async function keepAwake() {
    try { if ("wakeLock" in navigator && document.visibilityState === "visible") lock = await navigator.wakeLock.request("screen"); } catch (e) {}
  }
  keepAwake();
  document.addEventListener("visibilitychange", keepAwake);

  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});

  /* ================= What the menu talks to ================= */
  window.Kiosk = {
    open: d => (d === "youtube" ? openYouTube() : openCatalog()),
    openMedia: id => {
      const it = content.items.find(i => i.id === id);
      if (!it) { toast("That file is no longer in the media folder."); if (ui()) ui().onReturn(false); scan(true); return; }
      it.type === "pdf" ? openPdf(it) : openVideo(it);
    },
    requestMedia: () => { scan(false); },
    refresh: () => { scan(true); },
    pickMediaFolder: () => toast("Upload videos and PDFs to the media folder in the GitHub project, then tap Refresh."),
    checkPin: p => String(p) === String(C.pin || "2580"),
    isPinned: () => false, setPinned: () => {}, openSystemSettings: () => {},
    fullscreen: goFullscreen,
    contentSummary: () => {
      const v = content.items.filter(i => i.type === "video").length, p = content.items.length - v;
      return failed && !loaded ? "Not loaded" : `${v} video${v === 1 ? "" : "s"}, ${p} PDF${p === 1 ? "" : "s"}, ${content.customers.length} customer${content.customers.length === 1 ? "" : "s"}`;
    },
    appVersion: () => "web 1.0",
    setCustomer: name => { name ? localStorage.setItem("kiosk.customer", name) : localStorage.removeItem("kiosk.customer"); },
  };
  scan(false);
})();
