// Chronicle of Earth: animated hero.
// A globe travels through the draft record: the timeline sweeps from 1900,
// the globe turns to each recorded place, and a dossier card shows what is
// on the record and how far it has been verified. Empty stretches of the
// timeline are announced as gaps. Present-day reference geography only.
(() => {
  const stage = document.querySelector("[data-hero-stage]");
  if (!stage) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canvas = stage.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const card = stage.querySelector("[data-hero-card]");
  const dateEl = stage.querySelector("[data-hero-date]");
  const ruler = document.querySelector("[data-hero-ruler]");
  const marker = ruler && ruler.querySelector(".ruler-marker");
  const toggle = document.querySelector("[data-hero-toggle]");
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const START = 1900, END = 2030;
  const C = { ocean: "#0f1c26", land: "#1d303d", border: "#3e5666", grid: "#1b2d3a", limb: "#4a6272", hi: "#d2b26c", hiStroke: "#e6cf96" };
  const rad = Math.PI / 180;

  let data, units, stops, size = 0, dpr = 1;
  let lon0 = -20, lat0 = 22; // view centre
  let paused = false, last = 0;
  let timeline = []; // phases
  let phase = 0, phaseT = 0;
  let year = START; // fractional
  let active = null, pulse = 0;

  const yearOf = (sort) => { const [y, m, d] = sort.split("-").map(Number); return y + (m - 1) / 12 + (d - 1) / 365; };
  const fmtYear = (y) => { const yy = Math.floor(y); const m = Math.min(11, Math.floor((y - yy) * 12)); return `${MONTHS[m]} ${yy}`; };
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const lerpAngle = (a, b, t) => { let d = ((b - a + 540) % 360) - 180; return a + d * t; };

  function resize() {
    const box = stage.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    size = Math.round(Math.min(box.width, 620));
    canvas.width = canvas.height = size * dpr;
    canvas.style.width = canvas.style.height = `${size}px`;
  }

  function project(lon, lat, out) {
    const l = lon * rad, p = lat * rad, l0 = lon0 * rad, p0 = lat0 * rad;
    const cosc = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l - l0);
    let x = Math.cos(p) * Math.sin(l - l0);
    let y = Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l - l0);
    if (cosc < 0) { const n = Math.hypot(x, y) || 1; x /= n; y /= n; }
    out[0] = x; out[1] = y; out[2] = cosc;
    return out;
  }

  const tmp = [0, 0, 0];
  function ringPath(ring, R, c) {
    let visible = false;
    for (let i = 0; i < ring.length; i += 2) {
      project(ring[i], ring[i + 1], tmp);
      if (tmp[2] >= 0) visible = true;
      const x = c + R * tmp[0], y = c - R * tmp[1];
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    return visible;
  }

  function draw() {
    const R = size / 2 - 3, c = size / 2;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.fillStyle = C.ocean; ctx.fill(); ctx.clip();
    // graticule
    ctx.beginPath(); ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    for (let lon = -180; lon < 180; lon += 15) {
      let pen = false;
      for (let lat = -90; lat <= 90; lat += 3) {
        project(lon, lat, tmp);
        if (tmp[2] < 0) { pen = false; continue; }
        const x = c + R * tmp[0], y = c - R * tmp[1];
        if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        pen = true;
      }
    }
    for (let lat = -75; lat < 90; lat += 15) {
      let pen = false;
      for (let lon = -180; lon <= 180; lon += 3) {
        project(lon, lat, tmp);
        if (tmp[2] < 0) { pen = false; continue; }
        const x = c + R * tmp[0], y = c - R * tmp[1];
        if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        pen = true;
      }
    }
    ctx.stroke();
    // land
    const hi = active && !active.point ? new Set(active.units) : null;
    ctx.beginPath();
    for (const u of units) {
      if (hi && hi.has(u.n)) continue;
      for (const r of u.r) ringPath(r, R, c);
    }
    ctx.fillStyle = C.land; ctx.fill("evenodd");
    ctx.strokeStyle = C.border; ctx.lineWidth = 0.6; ctx.lineJoin = "round"; ctx.stroke();
    if (hi) {
      ctx.beginPath();
      for (const u of units) if (hi.has(u.n)) for (const r of u.r) ringPath(r, R, c);
      ctx.globalAlpha = 0.35 + 0.65 * Math.min(1, pulse);
      ctx.fillStyle = C.hi; ctx.fill("evenodd");
      ctx.strokeStyle = C.hiStroke; ctx.lineWidth = 1; ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // shading
    const g = ctx.createRadialGradient(c * 0.76, c * 0.64, R * 0.1, c, c, R * 1.05);
    g.addColorStop(0, "rgba(255,255,255,.07)"); g.addColorStop(1, "rgba(0,0,0,.35)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    ctx.restore();
    ctx.beginPath(); ctx.arc(c, c, R - 0.5, 0, Math.PI * 2); ctx.strokeStyle = C.limb; ctx.lineWidth = 1; ctx.stroke();
    // place marker
    if (active) {
      project(active.lon, active.lat, tmp);
      if (tmp[2] > 0) {
        const x = c + R * tmp[0], y = c - R * tmp[1];
        const p = Math.min(1, pulse);
        ctx.strokeStyle = `rgba(210,178,108,${0.6 * (1 - (pulse % 1))})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, 8 + 22 * (pulse % 1), 0, Math.PI * 2); ctx.stroke();
        const d = 6.5 * p;
        ctx.beginPath(); ctx.moveTo(x, y - d); ctx.lineTo(x + d, y); ctx.lineTo(x, y + d); ctx.lineTo(x - d, y); ctx.closePath();
        ctx.fillStyle = C.hi; ctx.fill(); ctx.strokeStyle = C.ocean; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }
  }

  function showCard(stop) {
    card.classList.remove("is-gap", "is-end");
    if (!stop) { card.hidden = true; return; }
    card.hidden = false;
    card.querySelector("[data-k=meta]").textContent = `${stop.topic} · ${stop.kind}${stop.extra ? " + " + stop.extra.length + " claim" : ""}`;
    card.querySelector("[data-k=title]").textContent = stop.title;
    card.querySelector("[data-k=place]").textContent = `${stop.date} · ${stop.places.join(" · ")}`;
    card.querySelector("[data-k=status]").textContent = `Draft · ${stop.evidence} evidence link${stop.evidence === 1 ? "" : "s"} · confidence ${stop.confidence}`;
    card.classList.remove("is-in"); void card.offsetWidth; card.classList.add("is-in");
  }

  function showNote(cls, meta, title, place, status) {
    card.hidden = false;
    card.classList.remove("is-gap", "is-end");
    card.classList.add(cls);
    card.querySelector("[data-k=meta]").textContent = meta;
    card.querySelector("[data-k=title]").textContent = title;
    card.querySelector("[data-k=place]").textContent = place;
    card.querySelector("[data-k=status]").textContent = status;
    card.classList.remove("is-in"); void card.offsetWidth; card.classList.add("is-in");
  }

  function build() {
    // merge records at the same place and date (an event and its claim)
    const merged = [];
    for (const s of stops) {
      const prev = merged[merged.length - 1];
      if (prev && prev.sort === s.sort && prev.lon === s.lon) { (prev.extra = prev.extra || []).push(s.title); continue; }
      merged.push({ ...s });
    }
    timeline = [];
    let y = START;
    for (const s of merged) {
      const ty = yearOf(s.sort);
      const gap = ty - y;
      timeline.push({ kind: "sweep", from: y, to: ty, dur: Math.min(3600, 900 + gap * 70), gap: gap > 12 ? [Math.ceil(y), Math.floor(ty)] : null });
      timeline.push({ kind: "fly", stop: s, dur: 1300 });
      timeline.push({ kind: "hold", stop: s, dur: 3600 });
      y = ty;
    }
    timeline.push({ kind: "sweep", from: y, to: 2026.8, dur: 1600, gap: null });
    timeline.push({ kind: "end", dur: 3200 });
  }

  let flyFrom = null;
  function enter(p) {
    if (p.kind === "sweep") {
      active = null;
      if (p.gap) showNote("is-gap", "Coverage gap", `No records yet, ${p.gap[0]}–${p.gap[1]}`, "Not yet recorded is not the same as nothing happened.", "Shown as a gap, never as an empty world");
      else card.hidden = true;
    } else if (p.kind === "fly") {
      flyFrom = [lon0, lat0];
      active = p.stop; pulse = 0;
      showCard(p.stop);
    } else if (p.kind === "end") {
      active = null;
      showNote("is-end", "The record so far", `${stops.length} located records, all unreviewed drafts`, `As of ${data.as_of} · atlas-data ${data.commit}`, "The chronicle is open: coverage grows by review, not by guesswork");
    }
  }

  function step(dt) {
    let p = timeline[phase];
    phaseT += dt;
    while (phaseT >= p.dur) {
      phaseT -= p.dur;
      phase = (phase + 1) % timeline.length;
      if (phase === 0) year = START;
      p = timeline[phase];
      enter(p);
    }
    const t = phaseT / p.dur;
    if (p.kind === "sweep") {
      year = p.from + (p.to - p.from) * ease(t);
      lon0 += dt * 0.006; // slow drift
      lat0 += (22 - lat0) * 0.02;
    } else if (p.kind === "fly") {
      const k = ease(t);
      lon0 = lerpAngle(flyFrom[0], p.stop.lon, k);
      lat0 = flyFrom[1] + (Math.max(-35, Math.min(40, p.stop.lat)) - flyFrom[1]) * k;
      pulse = k;
    } else if (p.kind === "hold") {
      pulse = 1 + phaseT / 1400;
      lon0 += dt * 0.0015;
    } else if (p.kind === "end") {
      lon0 += dt * 0.006;
    }
    const pos = (year - START) / (END - START);
    if (marker) marker.style.left = `${(pos * 100).toFixed(3)}%`;
    if (dateEl) dateEl.textContent = p.kind === "fly" || p.kind === "hold" ? p.stop.date : p.kind === "end" ? data.as_of : fmtYear(year);
  }

  function frame(ts) {
    const dt = last ? Math.min(64, ts - last) : 16;
    last = ts;
    if (!paused) step(dt);
    draw();
    if (!paused) requestAnimationFrame(frame);
    else last = 0;
  }

  function placeTicks() {
    if (!ruler) return;
    const track = ruler.querySelector(".ruler-records");
    if (!track) return;
    for (const s of stops) {
      const i = document.createElement("span");
      i.className = "ruler-record";
      i.style.left = `${(((yearOf(s.sort) - START) / (END - START)) * 100).toFixed(3)}%`;
      track.appendChild(i);
    }
  }

  fetch(stage.dataset.heroSrc)
    .then((r) => r.json())
    .then((d) => {
      data = d; units = d.units; stops = d.stops;
      stage.classList.add("is-live");
      resize(); placeTicks(); build();
      window.addEventListener("resize", () => { resize(); draw(); });
      if (reduced) {
        // A single still: the lead record, no motion.
        const lead = stops.find((s) => s.id === "event:german-reunification") || stops[0];
        lon0 = lead.lon; lat0 = Math.min(40, lead.lat); active = lead; pulse = 1;
        year = yearOf(lead.sort); showCard(lead);
        if (marker) marker.style.left = `${(((year - START) / (END - START)) * 100).toFixed(3)}%`;
        if (dateEl) dateEl.textContent = lead.date;
        if (toggle) toggle.hidden = true;
        draw();
        return;
      }
      enter(timeline[0]);
      // Development aid: ?hero-at=<ms> starts the sequence at that point.
      const at = Number(new URLSearchParams(location.search).get("hero-at")) || 0;
      for (let t = 0; t < at; t += 16) step(16);
      if (toggle) {
        toggle.hidden = false;
        toggle.addEventListener("click", () => {
          paused = !paused;
          toggle.setAttribute("aria-pressed", String(paused));
          toggle.querySelector("span").textContent = paused ? "Play" : "Pause";
          if (!paused) requestAnimationFrame(frame);
        });
      }
      requestAnimationFrame(frame);
    })
    .catch(() => {});
})();
