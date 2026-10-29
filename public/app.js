"use strict";
const Engine = window.FlappyEngine;
const $ = (id) => document.getElementById(id),
  socket = io({ transports: ["websocket", "polling"] });
let state = null,
  course = null,
  myId = null,
  seq = 0,
  offset = 0,
  muted = true,
  audio = null,
  lastState = null,
  lastReceived = 0,
  currentScreen = "home",
  lastCrash = 0,
  lastCheckpoint = 0,
  lastRace = 0,
  toastTimeout,
  lastCountdown = "";
const storage = {
  get(k) {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      sessionStorage.setItem(k, v);
    } catch {}
  },
  remove(k) {
    try {
      sessionStorage.removeItem(k);
    } catch {}
  },
};
$("name").value = storage.get("pilotName") || "Pilot";
function toast(message, error = false) {
  $("toast").textContent = message;
  $("toast").classList.remove("hidden");
  $("toast").classList.toggle("error", error);
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => $("toast").classList.add("hidden"), 4500);
}
function show(screen) {
  if (currentScreen === screen) return;
  currentScreen = screen;
  for (const id of ["home", "lobby", "race", "results"])
    $(id).classList.toggle("hidden", id !== screen);
  if (screen === "race") $("gameCanvas").focus({ preventScroll: true });
}
function tone(freq, duration = 0.1, type = "sine", volume = 0.035) {
  if (muted) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
    const osc = audio.createOscillator(),
      gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audio.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      freq * 0.65,
      audio.currentTime + duration,
    );
    gain.gain.setValueAtTime(volume, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + duration);
  } catch {}
}
$("mute").onclick = () => {
  muted = !muted;
  $("mute").textContent = muted ? "♪ off" : "♪ on";
  $("mute").setAttribute("aria-label", muted ? "Enable sound" : "Mute sound");
  tone(700);
};
function enter(create, code, token) {
  if (!socket.connected)
    return toast("Connecting to the server. Please try again shortly.", true);
  $("create").disabled = true;
  socket.timeout(7000).emit(
    "enter",
    {
      create,
      code,
      token,
      capacity: Number($("capacity").value),
      name: $("name").value,
    },
    (err, res) => {
      $("create").disabled = false;
      if (err) return toast("The server did not respond. Try again.", true);
      if (res.error) {
        if (token) {
          storage.remove("raceSession");
          state = null;
          myId = null;
          show("home");
        }
        return toast(res.error, true);
      }
      myId = res.id;
      course = res.course;
      seq = 0;
      storage.set("pilotName", $("name").value);
      storage.set(
        "raceSession",
        JSON.stringify({ code: res.code, token: res.token }),
      );
      history.replaceState(null, "", `?room=${res.code}`);
      receive(res.state);
    },
  );
}
$("create").onclick = () => enter(true);
$("joinForm").onsubmit = (e) => {
  e.preventDefault();
  enter(false, $("code").value);
};
function ready() {
  tone(620);
  const me = state?.players.find((p) => p.id === myId);
  if (!me || !socket.connected) return toast("Connect to a room first.", true);
  $("ready").disabled = $("rematch").disabled = true;
  socket.timeout(4000).emit("ready", { ready: !me.ready }, (err, res) => {
    $("ready").disabled = $("rematch").disabled = false;
    if (err || res?.error)
      toast(res?.error || "Ready request timed out. Try again.", true);
  });
}
$("renameForm").onsubmit = (event) => {
  event.preventDefault();
  const name = $("lobbyName").value.trim() || "Pilot";
  socket.emit("rename", name);
  storage.set("pilotName", name);
  $("name").value = name;
  toast("Callsign updated.");
};
$("ready").onclick = ready;
$("rematch").onclick = ready;
function leave() {
  socket.emit("leave", {}, () => {});
  storage.remove("raceSession");
  state = null;
  lastState = null;
  myId = null;
  history.replaceState(null, "", "/");
  show("home");
}
$("leave").onclick = leave;
$("resultLeave").onclick = leave;
$("raceLeave").onclick = () => {
  if (confirm("Leave the race? You will forfeit your place in this race."))
    leave();
};
async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    toast(label);
  } catch {
    prompt("Copy this text:", text);
  }
}
$("copy").onclick = () =>
  copyText(
    `${location.origin}/?room=${state.code}`,
    "Invite copied. Send it to your crew.",
  );
$("copyCode").onclick = () => copyText(state.code, "Room code copied.");
function startRace() {
  socket.timeout(6000).emit("start", {}, (err, res) => {
    if (err || res?.error)
      toast(res?.error || "Start request timed out.", true);
  });
}
$("start").onclick = $("rematchStart").onclick = startRace;
$("openLobby").onclick = () =>
  socket.emit("openLobby", {}, (res) => {
    if (res?.error) toast(res.error, true);
  });
socket.on("course", (next) => {
  course = next;
  predicted = null;
});
$("how").onclick = () => $("instructions").showModal();
$("closeHow").onclick = $("gotIt").onclick = () => $("instructions").close();
socket.on("connect", () => {
  $("connection").textContent = "● Connected";
  $("connection").classList.add("online");
  let saved;
  try {
    saved = JSON.parse(storage.get("raceSession"));
  } catch {}
  const invited = new URLSearchParams(location.search).get("room");
  if (saved && (!invited || invited.toUpperCase() === saved.code))
    enter(false, saved.code, saved.token);
  else if (invited) {
    $("code").value = invited.toUpperCase();
    enter(false, invited);
  }
  syncClock();
});
socket.on("disconnect", () => {
  $("connection").textContent = "● Reconnecting…";
  $("connection").classList.remove("online");
  toast("Connection lost. Reconnecting to your pilot…", true);
});
socket.on("expired", () => {
  leave();
  toast("This room has expired. Create a fresh room.", true);
});
socket.on("state", receive);
socket.on("connect_error", () => {
  $("connection").textContent = "● Server unavailable";
});
function syncClock() {
  const start = Date.now();
  socket.emit("pingClock", {}, (res) => {
    offset = res.now - (start + Date.now()) / 2;
  });
}
setInterval(() => {
  if (socket.connected) syncClock();
}, 10000);
function birdSVG(color) {
  return `<svg viewBox="0 0 90 70" aria-hidden="true"><path d="M16 42Q-2 28 10 24L30 31" fill="${color}" opacity=".7"/><ellipse cx="43" cy="36" rx="29" ry="24" fill="${color}"/><path d="M22 42Q34 20 44 39Q33 56 22 42" fill="#101425" opacity=".2"/><path d="M67 30L84 37 67 42" fill="#ffbf77"/><circle cx="56" cy="29" r="10" fill="#fff"/><circle cx="60" cy="28" r="4" fill="#15202d"/><path d="M31 13L36 4 44 13" fill="${color}"/></svg>`;
}
function receive(s) {
  lastState = state;
  state = s;
  lastReceived = performance.now();
  if (!course || !myId) return;
  const me = s.players.find((p) => p.id === myId);
  if (!me) return;
  seq = Math.max(seq, me.inputSeq || 0);
  if (s.race !== lastRace) {
    lastRace = s.race;
    lastCrash = 0;
    lastCheckpoint = 0;
    predicted = null;
  }
  if (me.crashes > lastCrash) {
    tone(150, 0.25, "sawtooth");
    shakeUntil = performance.now() + 220;
    particlesBurst(18);
    lastCrash = me.crashes;
    predicted = null;
  }
  if (me.checkpoint > lastCheckpoint) {
    tone(880, 0.2);
    toast(`Checkpoint ${me.checkpoint + 1} secured ✦`);
    lastCheckpoint = me.checkpoint;
  }
  if (s.phase === "lobby") {
    show("lobby");
    if (document.activeElement !== $("lobbyName"))
      $("lobbyName").value = me.name;
    $("roomCode").textContent = s.code;
    $("coursePreset").textContent =
      `V3 / PROGRESSIVE ${course.preset.toUpperCase()}`;
    $("courseBrief").textContent =
      `${course.obstacles.length} obstacles. ${course.obstacles.filter((o) => o.amplitude > 0).length} moving gates. Faster sweeps, counterflow pairs, and moving tunnels—one continuous race.`;
    renderPilots(s);
    $("ready").textContent = me.ready ? "Ready ✓ · Cancel" : "I'm ready ↗";
    const connected = s.players.filter((p) => p.connected);
    const waiting = connected.filter((p) => !p.ready);
    $("playerCount").textContent =
      `Players: ${connected.length} / ${s.capacity}`;
    $("lobbyStatus").textContent =
      connected.length < 2
        ? me.ready
          ? "You are ready. Invite at least one more pilot to play."
          : "Invite at least one more pilot, then click I’m ready."
        : waiting.length
          ? `Waiting for: ${waiting.map((p) => p.name).join(", ")} to ready up.`
          : s.hostId === myId
            ? "Everyone is ready. Click Start race!"
            : "Everyone is ready. Waiting for the host to start.";
    $("start").classList.toggle("hidden", s.hostId !== myId);
    $("start").disabled = !s.canStart;
    $("start").textContent = s.preparing
      ? "Validating course…"
      : "Start race ↗";
  } else if (s.phase === "countdown" || s.phase === "race") {
    show("race");
    renderProgress(s);
  } else if (s.phase === "results") {
    if (currentScreen !== "results") {
      tone(880, 0.25);
      setTimeout(() => tone(1100, 0.3), 130);
      particlesBurst(75);
    }
    show("results");
    const winner = s.players.find((p) => p.id === s.winner);
    const tied = s.winnerIds?.length > 1;
    $("winner").textContent = winner
      ? `${winner.name} takes the sky!`
      : tied
        ? "A photo finish. It's a tie!"
        : "A flight to remember.";
    $("resultReason").textContent = s.reason;
    $("resultRows").replaceChildren();
    const ordered =
      s.results || s.ranking.map((id) => s.players.find((p) => p.id === id));
    ordered.forEach((p, i) => {
      const row = document.createElement("div");
      row.className = "resultRow";
      const name = document.createElement("b");
      name.textContent = `${p.rank || i + 1}. ${p.name}${p.id === myId ? " (you)" : ""}`;
      name.style.color = p.color;
      const info = document.createElement("span");
      info.textContent =
        p.finishTime !== null
          ? `${p.finishTime.toFixed(2)}s · ${p.crashes} crashes`
          : `${progress(p)}%${p.forfeited ? " · forfeited" : ""} · ${p.crashes} crashes`;
      row.append(name, info);
      $("resultRows").append(row);
    });
    $("rematch").textContent = me.ready ? "Ready ✓ · Cancel" : "Play again ↗";
    $("rematchStatus").textContent = s.canStart
      ? "Everyone ready. The host can start!"
      : "Every connected pilot readies up; the host starts the rematch.";
    $("rematchStart").classList.toggle("hidden", s.hostId !== myId);
    $("rematchStart").disabled = !s.canStart;
    $("rematchStart").textContent = s.preparing
      ? "Validating course…"
      : "Start rematch ↗";
    $("openLobby").classList.toggle("hidden", s.hostId !== myId);
  }
}
function renderPilots(s) {
  $("pilots").replaceChildren();
  for (const p of s.players) {
    const card = document.createElement("div");
    card.className = "pilot" + (p.ready ? " ready" : "");
    card.style.setProperty("--pilot", p.color);
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.innerHTML = birdSVG(p.color);
    const name = document.createElement("b");
    name.textContent = `${p.name}${p.id === myId ? " (you)" : ""}${p.id === s.hostId ? " · HOST" : ""}`;
    const status = document.createElement("p");
    status.textContent = !p.connected
      ? "Reconnecting…"
      : p.ready
        ? "✓ READY TO FLY"
        : "Not ready";
    card.append(avatar, name, status);
    $("pilots").append(card);
  }
}
function progress(p) {
  return Math.max(
    0,
    Math.min(
      100,
      Math.floor(
        ((p.x - course.startX) / (course.finish - course.startX)) * 100,
      ),
    ),
  );
}
function renderProgress(s) {
  $("progress").replaceChildren();
  const me = s.players.find((p) => p.id === myId),
    d = Engine.intensity(me.x, course);
  $("intensity").textContent =
    `↗ ${Engine.difficultyLabel(d)} · ${Math.round(d * 100)}% intensity`;
  $("raceRoster").textContent =
    `${s.roster.length} pilots · ${Math.round(course.durationSeconds)} sec clean flight`;
  for (const [index, id] of s.ranking.entries()) {
    const p = s.players.find((p) => p.id === id),
      div = document.createElement("div");
    div.className = "progressItem" + (p.id === myId ? " local" : "");
    div.style.setProperty("--pilot", p.color);
    const label = document.createElement("div");
    label.className = "progressLabel";
    const name = document.createElement("span");
    name.textContent = `${index + 1}. ${p.name}${p.id === myId ? " · YOU" : ""}`;
    const percent = document.createElement("b");
    percent.textContent = `${progress(p)}%${p.forfeited ? " · OUT" : !p.connected ? " · reconnecting" : ""}`;
    label.append(name, percent);
    const track = document.createElement("div");
    track.className = "progressTrack";
    const fill = document.createElement("div");
    fill.className = "progressFill";
    fill.style.width = progress(p) + "%";
    track.append(fill);
    div.append(label, track);
    $("progress").append(div);
  }
}
let predicted = null,
  shakeUntil = 0,
  particles = [];
function localFlap() {
  if (currentScreen !== "race" || state?.phase !== "race" || !socket.connected)
    return;
  const me = state.players.find((p) => p.id === myId);
  if (!me || Date.now() + offset < me.respawnUntil) return;
  const now = performance.now();
  if (predicted && now - predicted.lastFlap < 115) return;
  predicted = {
    y: predicted?.y ?? me.y,
    vy: course.flap,
    lastFlap: now,
    at: now,
  };
  socket.emit("flap", { seq: ++seq });
  tone(540, 0.065);
}
window.addEventListener("keydown", (e) => {
  if (
    e.code === "Space" &&
    currentScreen === "race" &&
    !$("instructions").open
  ) {
    e.preventDefault();
    if (!e.repeat) localFlap();
  }
});
$("gameCanvas").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  localFlap();
});
function particlesBurst(count) {
  for (let i = 0; i < count; i++)
    particles.push({
      x: 0.5,
      y: 0.45,
      vx: (Math.random() - 0.5) * 0.7,
      vy: (Math.random() - 0.8) * 0.6,
      life: 1,
      color: i % 2 ? "#bcf575" : "#77c6ff",
    });
}
function fit(canvas) {
  const dpr = Math.min(devicePixelRatio || 1, 2),
    w = canvas.clientWidth,
    h = canvas.clientHeight;
  if (
    canvas.width !== Math.round(w * dpr) ||
    canvas.height !== Math.round(h * dpr)
  ) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}
function round(ctx, x, y, w, h, r, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}
function bird(ctx, x, y, size, color, t, vy = 0, shield = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.max(-0.35, Math.min(0.6, vy / 700)));
  const s = size / 30;
  ctx.scale(s, s);
  if (shield) {
    ctx.strokeStyle = color + "aa";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, 25 + Math.sin(t * 9) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = color + "88";
  ctx.beginPath();
  ctx.moveTo(-17, 2);
  ctx.lineTo(-34, -8);
  ctx.lineTo(-29, 8);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, 21, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-7, -14);
  ctx.lineTo(-3, -25);
  ctx.lineTo(5, -15);
  ctx.fill();
  ctx.fillStyle = "#18313733";
  ctx.beginPath();
  ctx.ellipse(-7, 6, 12, 6, Math.sin(t * 18) * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.ellipse(10, -5, 8, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#132334";
  ctx.beginPath();
  ctx.arc(13, -6, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffc58c";
  ctx.beginPath();
  ctx.moveTo(20, -1);
  ctx.lineTo(31, 4);
  ctx.lineTo(20, 8);
  ctx.fill();
  ctx.restore();
}
function background(ctx, w, h, t, camera = 0, difficulty = 0) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, `hsl(${202 + difficulty * 35} 30% 20%)`);
  g.addColorStop(1, `hsl(${150 + difficulty * 35} 28% 28%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#b0e89c08";
  ctx.lineWidth = 1;
  for (let x = -(camera * 0.15) % 45; x < w; x += 45) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += 45) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  for (let layer = 0; layer < 3; layer++) {
    ctx.fillStyle = ["#21423d", "#2b5143", "#376043"][layer];
    ctx.globalAlpha = 0.35;
    for (let i = -1; i < 14; i++) {
      let x = i * 120 - ((camera * (0.1 + layer * 0.1)) % 120);
      let peak = h * (0.62 - layer * 0.1) + Math.sin(i * 3 + layer) * 45;
      ctx.beginPath();
      ctx.moveTo(x - 70, h);
      ctx.quadraticCurveTo(x, peak - 200, x + 90, peak);
      ctx.lineTo(x + 160, h);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 30; i++) {
    const x = (((i * 97.1 - camera * 0.08) % w) + w) % w,
      y = (i * 71.3 + Math.sin(t * 0.4 + i) * 20) % h;
    ctx.fillStyle = i % 3 ? "#bcf57533" : "#d1ffad80";
    ctx.fillRect(x, y, 2, 2);
  }
}
function wall(ctx, x, top, bottom, width, accent = "#a9df75") {
  const h = course?.height || 540;
  for (const [y, height] of [
    [-30, top + 30],
    [bottom, h - bottom + 30],
  ]) {
    const g = ctx.createLinearGradient(x, 0, x + width, 0);
    g.addColorStop(0, "#4b7454");
    g.addColorStop(0.65, "#365d48");
    g.addColorStop(1, "#213d35");
    round(ctx, x, y, width, height, 7, g);
    ctx.strokeStyle = "#94bf6944";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 5, y + 5, width - 10, height - 10);
    ctx.fillStyle = accent;
    ctx.fillRect(x - 3, y === -30 ? top - 7 : bottom, width + 6, 7);
    ctx.fillStyle = "#c7ff9822";
    for (let yy = y + 25; yy < y + height - 10; yy += 35)
      ctx.fillRect(x + 10, yy, width - 20, 2);
  }
}
function hero(t) {
  const { ctx, w, h } = fit($("heroCanvas"));
  background(ctx, w, h, t, t * 14);
  const scale = h / 540;
  ctx.save();
  ctx.scale(w / 520, scale);
  wall(ctx, 100, 145, 350, 65);
  wall(ctx, 365, 260, 435, 72);
  ctx.setLineDash([5, 8]);
  ctx.strokeStyle = "#bcf57544";
  ctx.beginPath();
  ctx.moveTo(20, 300);
  ctx.bezierCurveTo(200, 350, 210, 120, 460, 330);
  ctx.stroke();
  ctx.setLineDash([]);
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = "#bcf57555";
    ctx.beginPath();
    ctx.arc(200 + i * 16, 225 + Math.sin(i) * 13, 2, 0, 7);
    ctx.fill();
  }
  bird(ctx, 263, 232 + Math.sin(t * 2) * 14, 65, "#bcf575", t, -100);
  bird(ctx, 205, 360 + Math.sin(t * 2 + 2) * 12, 47, "#77c6ff", t + 1, -100);
  ctx.fillStyle = "#d1e4d4";
  ctx.font = "10px monospace";
  ctx.fillText("YOU ↗", 240, 185 + Math.sin(t * 2) * 14);
  ctx.fillStyle = "#77c6ff";
  ctx.fillText("YOUR RIVAL", 168, 403 + Math.sin(t * 2 + 2) * 12);
  ctx.restore();
}
let prevFrame = performance.now();
function draw(now) {
  const dt = Math.min(0.04, (now - prevFrame) / 1000);
  prevFrame = now;
  const t = now / 1000;
  if (currentScreen === "home") hero(t);
  if (currentScreen === "results") {
    const { ctx, w, h } = fit($("celebration"));
    ctx.clearRect(0, 0, w, h);
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += dt * 0.4;
      p.life -= dt * 0.45;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x * w, p.y * h);
      ctx.rotate(t * 3 + p.vx * 10);
      ctx.fillRect(0, 0, 6, 11);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    particles = particles.filter((p) => p.life > 0);
  }
  if (currentScreen === "race" && course && state) {
    const { ctx, w, h } = fit($("gameCanvas")),
      me = state.players.find((p) => p.id === myId);
    if (me) {
      const serverNow = Date.now() + offset,
        active = state.phase === "race",
        elapsed =
          state.phase === "countdown"
            ? 0
            : state.raceTime +
              Math.max(0, Math.min(0.15, (serverNow - state.serverNow) / 1000));
      $("timer").textContent =
        `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${(elapsed % 60).toFixed(1).padStart(4, "0")}`;
      $("checkpoint").textContent =
        `CHECKPOINT ${me.checkpoint + 1} / ${course.checkpoints.length}`;
      const cd =
        state.phase === "countdown"
          ? String(Math.max(1, Math.ceil((state.startAt - serverNow) / 1000)))
          : elapsed < 0.65
            ? "GO!"
            : "";
      $("countdown").textContent = cd;
      $("countdown").classList.toggle("hidden", !cd);
      if (cd && cd !== lastCountdown) {
        tone(cd === "GO!" ? 900 : 450, 0.12);
        lastCountdown = cd;
      }
      const respawning = serverNow < me.respawnUntil;
      $("recovery").classList.toggle("hidden", !respawning);
      $("recovery").textContent = "✦ Shake it off. Back to your checkpoint…";
      const extrapolate = active ? Math.min(100, now - lastReceived) / 1000 : 0;
      const mx = me.x + (respawning ? 0 : course.speed * extrapolate);
      const scale = h / course.height;
      const viewWidth = w / scale,
        anchor = Math.min(180, viewWidth * 0.28),
        camera = Math.max(0, mx - anchor);
      background(ctx, w, h, t, camera, Engine.intensity(me.x, course));
      ctx.save();
      if (now < shakeUntil) ctx.translate(Math.sin(now) * 4, Math.cos(now) * 3);
      ctx.scale(scale, scale);
      ctx.translate(-camera, 0);
      for (const o of course.obstacles)
        if (o.x + o.w > camera - 50 && o.x < camera + viewWidth + 60) {
          const bounds = Engine.obstacleAt(o, elapsed);
          const dynamic = o.amplitude > 0 || o.pulse > 0;
          const accent =
            o.type === "moving-tunnel"
              ? "#7cf0e8"
              : o.amplitude
                ? "#ffd087"
                : o.pulse
                  ? "#e8b2ff"
                  : "#b5eb83";
          wall(ctx, o.x, bounds.top, bounds.bottom, o.w, accent);
          if (dynamic) {
            const velocity =
              o.amplitude *
              o.frequency *
              Math.cos(elapsed * o.frequency + o.phase);
            const arrow = o.amplitude
              ? velocity > 12
                ? "↓"
                : velocity < -12
                  ? "↑"
                  : "↕"
              : "◇";
            ctx.fillStyle = accent;
            ctx.font = "bold 19px monospace";
            ctx.fillText(arrow, o.x + o.w / 2 - 8, bounds.top - 17);
            ctx.strokeStyle = accent + "99";
            ctx.lineWidth = 1.5;
            // Motion rail and translucent recent edge positions communicate speed and range.
            const rail = o.x - 13;
            ctx.beginPath();
            ctx.moveTo(rail, o.center - o.amplitude);
            ctx.lineTo(rail, o.center + o.amplitude);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(rail, (bounds.top + bounds.bottom) / 2, 3, 0, Math.PI * 2);
            ctx.fill();
            for (const lag of [0.1, 0.2]) {
              const trail = Engine.obstacleAt(o, Math.max(0, elapsed - lag));
              ctx.strokeStyle = accent + "30";
              ctx.beginPath();
              ctx.moveTo(o.x - 3, trail.top);
              ctx.lineTo(o.x + o.w + 3, trail.top);
              ctx.moveTo(o.x - 3, trail.bottom);
              ctx.lineTo(o.x + o.w + 3, trail.bottom);
              ctx.stroke();
            }
            if (o.pattern === "opposite-pair" || o.type === "moving-tunnel") {
              ctx.fillStyle = accent;
              ctx.font = "8px monospace";
              ctx.textAlign = "center";
              ctx.fillText(
                o.type === "moving-tunnel" ? "MOVING TUNNEL" : "COUNTERFLOW",
                o.x + o.w / 2,
                bounds.bottom + 21,
              );
              ctx.textAlign = "left";
            }
          }
        }
      for (let i = 0; i < course.checkpoints.length; i++) {
        const x = course.checkpoints[i];
        if (x < camera - 30 || x > camera + viewWidth) continue;
        ctx.strokeStyle = "#bcf57533";
        ctx.setLineDash([5, 8]);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 540);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#bcf575";
        ctx.font = "10px monospace";
        ctx.fillText(`CP 0${i + 1}`, x + 8, 40);
      }
      if (course.finish < camera + viewWidth + 100) {
        for (let i = 0; i < 18; i++)
          for (let j = 0; j < 2; j++) {
            ctx.fillStyle = (i + j) % 2 ? "#dff6d9" : "#163331";
            ctx.fillRect(course.finish + j * 16, i * 30, 16, 30);
          }
        ctx.fillStyle = "#bcf575";
        ctx.font = "bold 22px monospace";
        ctx.fillText("FINISH", course.finish - 65, 70);
      }
      for (const p of state.players) {
        if (p.forfeited) continue;
        const local = p.id === myId,
          color = p.color;
        let x =
            p.x +
            (active && p.connected && serverNow >= p.respawnUntil
              ? course.speed * extrapolate
              : 0),
          y = p.y;
        const old = lastState?.players.find((q) => q.id === p.id);
        if (!local && old && Math.abs(old.x - p.x) < 80) {
          const alpha = Math.min(1, (now - lastReceived) / 50);
          x = old.x + (p.x - old.x) * alpha;
          y = old.y + (p.y - old.y) * alpha;
        }
        if (local && predicted && active && !respawning) {
          const age = (now - predicted.at) / 1000;
          if (age < 0.25) {
            predicted.vy += course.gravity * dt;
            predicted.y += predicted.vy * dt;
            y = predicted.y + (p.y - predicted.y) * Math.min(0.4, age * 0.8);
          } else predicted = null;
        }
        if (!local && (x < camera + 25 || x > camera + viewWidth - 25)) {
          const edge = Math.max(
            camera + 30,
            Math.min(camera + viewWidth - 30, x),
          );
          ctx.fillStyle = color;
          ctx.font = "11px monospace";
          ctx.textAlign = x < camera ? "left" : "right";
          ctx.fillText(
            x < camera ? `◀ ${p.name}` : `${p.name} ▶`,
            edge,
            70 + p.slot * 22,
            125,
          );
          ctx.textAlign = "left";
          continue;
        }
        ctx.globalAlpha = local ? 1 : 0.65;
        if (serverNow < p.respawnUntil)
          ctx.globalAlpha = 0.3 + 0.3 * Math.sin(t * 20);
        for (let j = 1; j < 6; j++) {
          ctx.fillStyle = color + (local ? "22" : "11");
          ctx.beginPath();
          ctx.arc(x - j * 12, y + Math.sin(t * 8 - j) * 3, 5 - j * 0.6, 0, 7);
          ctx.fill();
        }
        bird(ctx, x, y, 22, color, t, p.vy, serverNow < p.invulnerableUntil);
        ctx.fillStyle = color;
        ctx.font = "bold 10px monospace";
        ctx.textAlign = "center";
        ctx.fillText(
          local ? `YOU · ${p.name}` : p.name,
          x,
          y - 30 - (!local ? (p.slot % 3) * 13 : 0),
        );
        if (local) {
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, 24, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.textAlign = "left";
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      for (const p of particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += dt * 0.4;
        p.life -= dt;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x * w, p.y * h, 5, 5);
      }
      ctx.globalAlpha = 1;
      particles = particles.filter((p) => p.life > 0);
    }
  }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
