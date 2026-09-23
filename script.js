/* =====================================================================
   WEATHER-BOY MK1 — логика и эффекты
   Данные: домашний сервер (/api) + прогноз Open-Meteo.

   Весь новый CSS встроен прямо сюда, чтобы менять нужно было
   только один файл — script.js. style.css трогать не надо.
   ===================================================================== */

const CONFIG = {
  // Сайт раздаётся тем же сервером, что и API, поэтому адрес относительный.
  // Если открыть файл напрямую (file://) — подставится адрес сервера в сети.
  API_BASE: location.protocol.startsWith("http")
    ? location.origin + "/api"
    : "http://192.168.1.40:3001/api",

  LOCATION: "SANT'ANGELO DI OGLIARA",
  LAT: 40.70,
  LON: 14.74,
  ALTITUDE_M: 257,
  TIMEZONE: "Europe/Rome",
};

const INTERVALS = {
  clock: 1000,
  station: 15000,
  history: 60000,
  openMeteo: 10 * 60 * 1000,
  lastUpdateTick: 15000,
};

const CACHE_KEY = "weatherboy_cache_v3";

/* =====================================================================
   1. СТИЛИ ЭФФЕКТОВ
   ===================================================================== */
const EFFECT_CSS = `
/* ---------- стартовый экран ---------- */
#startGate{
  position:fixed; inset:0; z-index:100000;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:22px; padding:24px; text-align:center; cursor:pointer;
  background:radial-gradient(ellipse 80% 60% at 50% 50%, #0a1f10 0%, #040c06 60%, #000 100%);
  color:#6efc7b; font-family:'Share Tech Mono',monospace;
  -webkit-tap-highlight-color:transparent;
}
#startGate .gate-top{
  font-size:clamp(11px,1.1vw,15px); letter-spacing:.22em; color:#3e8f4c; line-height:2;
}
#startGate .gate-title{
  font-size:clamp(26px,4.4vw,58px); letter-spacing:.16em; color:#c4ff64;
  text-shadow:0 0 26px rgba(196,255,100,.35);
}
#startGate .gate-sub{ font-size:clamp(11px,1vw,14px); color:#3e8f4c; letter-spacing:.14em; }
#startGate .gate-go{
  margin-top:10px; font-size:clamp(13px,1.3vw,19px); letter-spacing:.2em; color:#6efc7b;
  border:1px solid rgba(110,252,123,.35); padding:13px 26px; border-radius:10px;
  background:rgba(6,24,12,.6); animation:gatePulse 1.6s ease-in-out infinite;
}
@keyframes gatePulse{
  0%,100%{ opacity:.55; box-shadow:0 0 0 rgba(110,252,123,0) }
  50%{ opacity:1; box-shadow:0 0 26px rgba(110,252,123,.16) }
}
#startGate .gate-note{ font-size:clamp(10px,.85vw,12px); color:#2c6637; max-width:42ch; line-height:1.7 }
.cursor::after{ content:"\\258C"; animation:cursorBlink 1s steps(2,end) infinite }
@keyframes cursorBlink{ 0%,100%{opacity:1} 50%{opacity:0} }
#startGate.closing{ animation:gateOut .45s ease forwards }
@keyframes gateOut{ to{ opacity:0; visibility:hidden } }

/* ---------- слои ЭЛТ ---------- */
.crt-scan,.crt-sweep,.crt-flicker,.crt-noise,.crt-vignette,.crt-flash{
  position:fixed; inset:0; pointer-events:none;
}
.crt-scan{
  z-index:60;
  background:repeating-linear-gradient(to bottom,
    rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px,
    rgba(0,0,0,.17) 3px, rgba(0,0,0,.17) 4px);
}
.crt-sweep{
  z-index:61; height:140px; inset:auto 0 auto 0;
  background:linear-gradient(to bottom,
    rgba(110,252,123,0) 0%, rgba(110,252,123,.055) 45%,
    rgba(196,255,100,.075) 50%, rgba(110,252,123,.055) 55%, rgba(110,252,123,0) 100%);
  animation:crtSweep 6.5s linear infinite;
}
@keyframes crtSweep{ 0%{transform:translateY(-160px)} 100%{transform:translateY(100vh)} }
.crt-flicker{
  z-index:62; background:#6efc7b; opacity:.012;
  animation:crtFlick 4s steps(3,end) infinite;
}
@keyframes crtFlick{
  0%,100%{opacity:.010} 8%{opacity:.026} 10%{opacity:.008}
  41%{opacity:.020} 43%{opacity:.010} 77%{opacity:.024} 79%{opacity:.009}
}
.crt-noise{
  z-index:59; opacity:.05; mix-blend-mode:screen;
  background-image:NOISE_URL; background-size:170px 170px;
  animation:crtNoise .55s steps(4,end) infinite;
}
@keyframes crtNoise{
  0%{transform:translate(0,0)} 25%{transform:translate(-3%,2%)}
  50%{transform:translate(2%,-3%)} 75%{transform:translate(-2%,-2%)} 100%{transform:translate(0,0)}
}
.crt-vignette{
  z-index:63;
  background:radial-gradient(ellipse 90% 78% at 50% 50%, rgba(0,0,0,0) 42%, rgba(0,0,0,.62) 100%);
}
.crt-flash{ z-index:64; background:#dfffe4; opacity:0 }
.crt-flash.fire{ animation:crtFlash .5s ease-out }
@keyframes crtFlash{
  0%{opacity:0} 6%{opacity:.5} 14%{opacity:.05} 22%{opacity:.34} 100%{opacity:0}
}

/* ---------- включение экрана ---------- */
.app.powering{ animation:powerOn .72s cubic-bezier(.2,.8,.25,1) }
@keyframes powerOn{
  0%{ transform:scaleY(.004) scaleX(1.1); filter:brightness(4) blur(1px); opacity:0 }
  28%{ transform:scaleY(.02) scaleX(1.05); filter:brightness(3); opacity:1 }
  60%{ transform:scaleY(1) scaleX(1); filter:brightness(1.7) }
  100%{ transform:none; filter:none }
}

/* ---------- глитч при переключении ---------- */
.screen.glitch{ animation:glitchShift .26s steps(2,end) }
@keyframes glitchShift{
  0%{ transform:translate(0,0); filter:none }
  20%{ transform:translate(-3px,1px); filter:hue-rotate(35deg) saturate(1.5) }
  40%{ transform:translate(2px,-2px); filter:brightness(1.35) }
  60%{ transform:translate(-2px,0); filter:hue-rotate(-25deg) }
  100%{ transform:translate(0,0); filter:none }
}

/* ---------- обновление значений ---------- */
.metric-value.bump{ animation:valueBump .42s ease-out }
@keyframes valueBump{
  0%{ transform:translateY(-6px); opacity:.25; filter:blur(2px) }
  55%{ transform:translateY(1px); opacity:1; filter:blur(0) }
  100%{ transform:none }
}

/* ---------- экран загрузки: строки терминала ---------- */
#bootLines{
  margin-top:18px; min-height:9.2em; width:min(560px,86vw);
  text-align:left; color:#6efc7b; font-size:clamp(11px,1.05vw,15px);
  line-height:1.85; white-space:pre-wrap; letter-spacing:.04em;
}

/* ---------- починка наложения текста на графике тренда ---------- */
.trend-chart .chart-note{
  grid-column:1 / -1; place-self:center; color:rgba(220,255,217,.45);
  font-size:clamp(10px,.75vw,13px); letter-spacing:.04em;
}
.trend-chart .chart-note::after{ display:none !important }

/* ---------- живой индикатор связи ---------- */
.chip.is-live img{ animation:chipPulse 2.4s ease-in-out infinite }
@keyframes chipPulse{ 0%,100%{opacity:1} 50%{opacity:.35} }

@media (prefers-reduced-motion:reduce){
  .crt-sweep,.crt-flicker,.crt-noise,#startGate .gate-go,.cursor::after,.chip.is-live img{ animation:none }
  .app.powering,.screen.glitch,.metric-value.bump{ animation:none }
}
`;

function injectStyles() {
  // Шум рисуем сами на canvas — внешняя картинка не нужна.
  let noiseUrl = "none";
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 170;
    const g = c.getContext("2d");
    const img = g.createImageData(170, 170);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 22;
    }
    g.putImageData(img, 0, 0);
    noiseUrl = `url(${c.toDataURL()})`;
  } catch (e) {}

  const style = document.createElement("style");
  style.textContent = EFFECT_CSS.replace("NOISE_URL", noiseUrl);
  document.head.appendChild(style);
}

function addCrtLayers() {
  ["crt-noise", "crt-scan", "crt-sweep", "crt-flicker", "crt-vignette", "crt-flash"].forEach((cls) => {
    const d = document.createElement("div");
    d.className = cls;
    if (cls === "crt-flash") d.id = "crtFlash";
    document.body.appendChild(d);
  });
}

/* =====================================================================
   2. ЗВУК
   Браузер не даёт играть звук до первого касания — поэтому всё
   включается на стартовом экране и дальше работает без осечек.
   ===================================================================== */
const Snd = {
  boot: null, tab: null,
  ctx: null, humGain: null,
  ready: false, mp3ok: true,

  prepare() {
    try {
      this.boot = new Audio("sounds/pipboy_boot.mp3");
      this.tab = new Audio("sounds/pipboy_tab.mp3");
      this.boot.volume = 0.55;
      this.tab.volume = 0.4;
      this.boot.preload = "auto";
      this.tab.preload = "auto";
      this.boot.addEventListener("error", () => { this.mp3ok = false; });
      this.tab.addEventListener("error", () => { this.mp3ok = false; });
    } catch (e) { this.mp3ok = false; }
  },

  // вызывается внутри клика по стартовому экрану
  unlock() {
    if (this.ready) return;
    this.ready = true;

    if (this.mp3ok) {
      [this.boot, this.tab].forEach((a) => {
        if (!a) return;
        const p = a.play();
        if (p && p.then) p.then(() => { a.pause(); a.currentTime = 0; }).catch(() => {});
      });
    }

    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.startHum();
      this.scheduleClicks();
    } catch (e) { this.ctx = null; }
  },

  // тихий гул работающей электроники: две низкие частоты с медленным «дыханием»
  startHum() {
    if (!this.ctx) return;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.connect(this.ctx.destination);

    [58, 117].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const og = this.ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      og.gain.value = i === 0 ? 1 : 0.42;
      o.connect(og).connect(g);
      o.start();
    });

    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 0.004;
    lfo.connect(lfoGain).connect(g.gain);
    lfo.start();

    g.gain.setTargetAtTime(0.013, this.ctx.currentTime, 1.6);
    this.humGain = g;
  },

  // редкие щелчки, как у счётчика
  scheduleClicks() {
    const next = () => {
      setTimeout(() => {
        if (!document.hidden) this.click();
        next();
      }, 3500 + Math.random() * 9000);
    };
    next();
  },

  click() {
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = "square";
      o.frequency.setValueAtTime(1400 + Math.random() * 900, t);
      g.gain.setValueAtTime(0.03, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      o.connect(g).connect(this.ctx.destination);
      o.start(t); o.stop(t + 0.06);
    } catch (e) {}
  },

  blip(freq = 900, ms = 45, vol = 0.05) {
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = "square";
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
      o.connect(g).connect(this.ctx.destination);
      o.start(t); o.stop(t + ms / 1000 + 0.02);
    } catch (e) {}
  },

  play(name) {
    if (!this.ready) return;
    if (this.mp3ok && this[name]) {
      try {
        this[name].currentTime = 0;
        const p = this[name].play();
        if (p && p.catch) p.catch(() => {});
        return;
      } catch (e) {}
    }
    // если mp3 не нашлись — свой звук, чтобы интерфейс не был немым
    this.blip(name === "boot" ? 520 : 980, name === "boot" ? 160 : 60, 0.06);
  },

  mute(on) {
    if (this.humGain && this.ctx) {
      this.humGain.gain.setTargetAtTime(on ? 0 : 0.013, this.ctx.currentTime, 0.3);
    }
  },
};

/* =====================================================================
   3. СОСТОЯНИЕ
   ===================================================================== */
const state = {
  online: false,
  location: CONFIG.LOCATION,
  timestamp: "--",
  temp: 0, humidity: 0, pressure: 0, pressureRaw: 0,
  gasKOhm: 0,
  pm1: null, pm25: null, pm10: null,
  uv: null, lux: null,
  lightningDistance: null, lightningAgeS: null, lightningCount: 0,
  rssi: null, freeHeap: null, uptimeS: null,
  wind: null, windForecast: null,
  rainChance: 0, rainFromForecast: false,
  rainText: "дождя не ожидается",
  sprite: "perfect", skyLabel: "СТАБИЛЬНО", statusLabel: "СТАБИЛЬНО",
  tempMood: "-", humidityMood: "-", pressureMood: "-",
  airLabel: "-", airMood: "-", rainMood: "-", windMood: "Датчика нет",
  forecast: [], logs: [], history: [],
  pressureTrend3h: null,
  lastUpdatedAt: null,
  weatherCode: null, sunrise: null, sunset: null, sunDate: null,
};

const $ = (id) => document.getElementById(id);

const ui = {
  dateText: $("dateText"), timeText: $("timeText"),
  lastUpdateText: $("lastUpdateText"), lastUpdateChip: $("lastUpdateChip"),
  locationText: $("locationText"), skyText: $("skyText"),
  tempText: $("tempText"), humidityText: $("humidityText"), pressureText: $("pressureText"),
  airText: $("airText"), rainText: $("rainText"), windText: $("windText"),
  tempMood: $("tempMood"), humidityMood: $("humidityMood"), pressureMood: $("pressureMood"),
  airMood: $("airMood"), rainMood: $("rainMood"), windMood: $("windMood"),
  statusBadge: $("statusBadge"), trendText: $("trendText"), trendChart: $("trendChart"),
  vaultboySprite: $("vaultboySprite"), forecastGrid: $("forecastGrid"), logsList: $("logsList"),
  tempChartWrap: $("tempChartWrap"), humidityChartWrap: $("humidityChartWrap"),
  airChartWrap: $("airChartWrap"), rainChartWrap: $("rainChartWrap"),
};

const spriteMap = {
  perfect: "images/vaultboy_perfect.png", sun: "images/vaultboy_sun.png",
  cloudy: "images/vaultboy_cloudy.png", rain: "images/vaultboy_rain.png",
  storm: "images/vaultboy_storm.png", heat: "images/vaultboy_heat.png",
  cold: "images/vaultboy_cold.png", dry: "images/vaultboy_dry.png",
  wind: "images/vaultboy_wind.png", airmask: "images/vaultboy_airmask.png",
};

/* =====================================================================
   4. ПОМОЩНИКИ
   ===================================================================== */
const safeNumber = (v, f = 0) => (Number.isFinite(Number(v)) ? Number(v) : f);
const has = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));

function isNightTime() {
  if (state.sunrise instanceof Date && state.sunset instanceof Date) {
    const now = new Date();
    return now < state.sunrise || now > state.sunset;
  }
  const h = new Date().getHours();
  return h >= 21 || h < 6;
}

function timeNowRome() {
  const now = new Date();
  return {
    time: new Intl.DateTimeFormat("it-IT", { timeZone: CONFIG.TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(now),
    date: new Intl.DateTimeFormat("ru-RU", { timeZone: CONFIG.TIMEZONE, day: "2-digit", month: "2-digit", year: "numeric" }).format(now),
  };
}

function updateClock() {
  const { time, date } = timeNowRome();
  ui.timeText.textContent = time;
  ui.dateText.textContent = date;
}

const tempMoodFrom = (t) => t >= 35 ? "Жарко" : t >= 25 ? "Тепло" : t <= 8 ? "Холодно" : t <= 18 ? "Прохладно" : "Комфортно";
const humidityMoodFrom = (h) => h >= 70 ? "Влажно" : h >= 45 ? "Комфортно" : "Суховато";
const pressureMoodFrom = (p) => p < 1005 ? "Низкое" : p < 1020 ? "Нормальное" : "Высокое";

function dewPoint(t, rh) {
  if (!has(t) || !has(rh) || rh <= 0) return null;
  const a = 17.27, b = 237.7;
  const g = (a * t) / (b + t) + Math.log(rh / 100);
  return Math.round(((b * g) / (a - g)) * 10) / 10;
}

/* Качество воздуха считаем по PM2.5 — это и есть датчик пыли.
   Раньше пороги были написаны для килоом, а газовый датчик отдаёт омы,
   поэтому всегда выходило «ОТЛИЧНОЕ». */
const airLabelFromPm = (v) => !has(v) ? "НЕТ ДАННЫХ" : v <= 12 ? "ХОРОШЕЕ" : v <= 35 ? "СРЕДНЕЕ" : v <= 55 ? "ПЛОХОЕ" : "ОПАСНОЕ";
const airMoodFromPm = (v) => !has(v) ? "Датчик молчит" : v <= 12 ? "Чисто" : v <= 35 ? "Приемлемо" : v <= 55 ? "Вредно для чувствительных" : "Лучше не выходить";
const rainLabelFrom = (c) => c <= 8 ? "дождя не ожидается" : c <= 20 ? "маловероятен" : c <= 45 ? "возможен" : c <= 70 ? "вероятен" : "высокая вероятность";

function weatherCodeBucket(code) {
  const c = Number(code);
  if (!Number.isFinite(c)) return null;
  if ([0, 1, 2].includes(c)) return "clear";
  if ([3, 45, 48].includes(c)) return "cloudy";
  if ([51,53,55,56,57,61,63,65,66,67,80,81,82,71,73,75,77,85,86].includes(c)) return "rain";
  if ([95, 96, 99].includes(c)) return "storm";
  return null;
}

function spriteFromValues(t, h, p, pm25, rain, bucket, lightningFresh) {
  if (lightningFresh) return "storm";
  if (has(pm25) && pm25 > 55) return "airmask";
  if (t >= 35) return "heat";
  if (t <= 8) return "cold";
  if (bucket === "storm" || rain >= 70) return "storm";
  if (bucket === "rain" || rain >= 55) return "rain";
  if (h >= 80 && p < 1005) return "cloudy";
  if (h >= 70) return "cloudy";
  if (h <= 25 && t >= 28) return "dry";
  if (bucket === "cloudy" && t < 25) return "cloudy";
  if (t >= 25) return "sun";
  if (bucket === "clear") return "sun";
  return "perfect";
}

function skyLabelFromSprite(s) {
  const night = isNightTime();
  const map = { sun: night ? "ЯСНАЯ НОЧЬ" : "СОЛНЕЧНО", cloudy: "ОБЛАЧНО", rain: "ДОЖДЬ",
                storm: "ГРОЗА", heat: "ЖАРА", cold: "ХОЛОД", dry: "СУХО",
                wind: "ВЕТЕР", airmask: "ПЛОХОЙ ВОЗДУХ" };
  return map[s] || (night ? "ЯСНАЯ НОЧЬ" : "СТАБИЛЬНО");
}

function statusLabelFromSprite(s) {
  const map = { airmask: "ВОЗДУХ", heat: "ЖАРА", cold: "ХОЛОД", dry: "СУХО", storm: "ГРОЗА", rain: "ДОЖДЬ" };
  return map[s] || "СТАБИЛЬНО";
}

/* Запасная оценка дождя по своим датчикам — классическое правило
   барометра: низкое и падающее давление плюс влажность = к осадкам. */
function rainChanceFrom(hum, press, trend) {
  let s = 0;
  if (hum >= 90) s += 35; else if (hum >= 85) s += 25; else if (hum >= 80) s += 15; else if (hum >= 70) s += 5;
  if (press <= 1000) s += 30; else if (press <= 1008) s += 18; else if (press <= 1013) s += 8;
  if (has(trend)) { if (trend <= -2) s += 25; else if (trend <= -1) s += 12; else if (trend >= 2) s -= 15; }
  return Math.max(0, Math.min(100, Math.round(s)));
}

const trendWord = (d) => !has(d) ? "Нет данных" : d <= -2 ? "Быстро падает" : d <= -1 ? "Падает" : d >= 2 ? "Быстро растёт" : d >= 1 ? "Растёт" : "Стабильно";

function formatRelativeUpdate(ms) {
  if (!ms) return "нет данных";
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 20) return "только что";
  if (s < 60) return `${s} сек назад`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} мин назад` : `${Math.round(m / 60)} ч назад`;
}

function durWords(s) {
  if (!has(s)) return "—";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d} д ${h} ч` : h ? `${h} ч ${m} мин` : `${m} мин`;
}

// меняем текст с короткой анимацией, только если он реально изменился
function setValue(el, text) {
  if (!el || el.textContent === text) return;
  el.textContent = text;
  el.classList.remove("bump");
  void el.offsetWidth;
  el.classList.add("bump");
}

/* =====================================================================
   5. ГРАФИКИ
   ===================================================================== */
function buildSparklineSVG(values, { min = null, max = null } = {}) {
  const clean = values.filter(Number.isFinite);
  if (clean.length < 2) return null;
  const lo = min != null ? min : Math.min(...clean);
  const hi = max != null ? max : Math.max(...clean);
  const span = hi - lo || 1;
  const w = 100, h = 30, pad = 3;

  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const n = Number.isFinite(v) ? (v - lo) / span : 0.5;
    return [x, h - pad - n * (h - pad * 2)];
  });

  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <defs><linearGradient id="miniChartFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--accent-2)" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="var(--accent-2)" stop-opacity="0"/>
    </linearGradient></defs>
    <path class="mini-chart-area" d="${line} L${w},${h} L0,${h} Z"/>
    <path class="mini-chart-line" d="${line}"/></svg>`;
}

function renderMiniChart(wrap, values, opts) {
  if (!wrap) return;
  wrap.innerHTML = buildSparklineSVG(values, opts) || `<span class="chart-note">История ещё не накоплена</span>`;
}

function renderPressureTrend() {
  if (!ui.trendChart) return;
  const values = state.history.map((r) => r.press).filter(Number.isFinite);
  if (values.length < 2) {
    ui.trendChart.innerHTML = `<span class="chart-note">История ещё не накоплена</span>`;
    return;
  }
  const size = Math.ceil(values.length / 8);
  const bars = [];
  for (let i = 0; i < values.length; i += size) {
    const part = values.slice(i, i + size);
    bars.push(part.reduce((a, b) => a + b, 0) / part.length);
  }
  const lo = Math.min(...bars), hi = Math.max(...bars), span = hi - lo || 1;
  ui.trendChart.innerHTML = bars
    .map((v) => `<span style="--h: ${(14 + ((v - lo) / span) * 76).toFixed(1)}%"></span>`)
    .join("");
}

function renderCharts() {
  const rows = state.history;
  renderMiniChart(ui.tempChartWrap, rows.map((r) => r.temp));
  renderMiniChart(ui.humidityChartWrap, rows.map((r) => r.hum), { min: 0, max: 100 });
  renderMiniChart(ui.airChartWrap, rows.map((r) => r.pm25), { min: 0 });
  renderMiniChart(ui.rainChartWrap,
    rows.map((r) => (Number.isFinite(r.hum) && Number.isFinite(r.press) ? rainChanceFrom(r.hum, r.press, null) : null)),
    { min: 0, max: 100 });
  renderPressureTrend();
}

/* =====================================================================
   6. ОТРИСОВКА
   ===================================================================== */
function renderForecast() {
  const items = state.forecast?.length
    ? state.forecast
    : ["21:00", "00:00", "03:00", "06:00", "09:00"].map((time) => ({ time, temp: null, rain: null }));

  ui.forecastGrid.innerHTML = items.map((it) => {
    const ok = it.temp != null && it.rain != null;
    const icon = ok && it.rain >= 20 ? "images/icon_rain.png" : "images/icon_time.png";
    return `<article class="forecast-card">
      <img src="${icon}" alt="" class="forecast-icon" aria-hidden="true"/>
      <div class="forecast-time">${it.time}</div>
      <div class="forecast-temp">${ok ? it.temp + "°" : "—"}</div>
      <div class="forecast-label">${ok ? it.rain + "%" : "нет данных"}</div>
    </article>`;
  }).join("");
}

function buildLogs() {
  const out = [];
  const at = (sec) => new Intl.DateTimeFormat("it-IT", {
    timeZone: CONFIG.TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(Date.now() - sec * 1000));

  out.push(state.online
    ? { icon: "icon_status.png", title: "Станция на связи", meta: `${at(0)} — данные ${formatRelativeUpdate(state.lastUpdatedAt)}` }
    : { icon: "icon_status.png", title: "Станция не отвечает", meta: `последние данные ${formatRelativeUpdate(state.lastUpdatedAt)}` });

  if (has(state.lightningAgeS) && state.lightningAgeS < 3600) {
    out.push({ icon: "icon_status.png", title: "Зафиксирована молния",
      meta: `${at(state.lightningAgeS)} — ${has(state.lightningDistance) ? state.lightningDistance + " км" : "расстояние неизвестно"}` });
  }

  if (has(state.pressureTrend3h)) {
    const d = state.pressureTrend3h;
    out.push({ icon: "icon_pressure.png",
      title: d <= -1 ? "Давление падает" : d >= 1 ? "Давление растёт" : "Давление стабильно",
      meta: `за 3 часа ${d > 0 ? "+" : ""}${d} гПа — сейчас ${state.pressure.toFixed(1)} гПа` });
  }

  const temps = state.history.map((r) => r.temp).filter(Number.isFinite);
  if (temps.length > 2) {
    out.push({ icon: "icon_temp.png", title: "Сутки по температуре",
      meta: `от ${Math.min(...temps).toFixed(1)}° до ${Math.max(...temps).toFixed(1)}°` });
  }

  out.push({ icon: "icon_air.png", title: `Воздух: ${state.airLabel.toLowerCase()}`,
    meta: has(state.pm25) ? `PM2.5 ${state.pm25}, PM10 ${state.pm10 ?? "—"} мкг/м³` : "датчик пыли молчит" });

  if (has(state.uv) && state.uv >= 3) {
    out.push({ icon: "icon_status.png", title: "Ультрафиолет", meta: `индекс ${state.uv} — нужна защита` });
  }

  if (has(state.rssi) && state.rssi < -80) {
    out.push({ icon: "icon_status.png", title: "Слабый сигнал Wi-Fi", meta: `${state.rssi} дБм — возможны пропуски в данных` });
  }

  if (has(state.uptimeS)) {
    out.push({ icon: "icon_status.png", title: "Время работы", meta: `${durWords(state.uptimeS)} без перезагрузки` });
  }

  return out;
}

function renderLogs() {
  const items = state.logs?.length ? state.logs : buildLogs();
  ui.logsList.innerHTML = items.map((l) => `<article class="log-item">
    <img src="images/${l.icon}" alt="" class="log-icon" aria-hidden="true"/>
    <div class="log-body"><div class="log-title">${l.title}</div><div class="log-meta">${l.meta}</div></div>
  </article>`).join("");
}

function renderLastUpdate() {
  if (!ui.lastUpdateText) return;
  ui.lastUpdateText.textContent = formatRelativeUpdate(state.lastUpdatedAt);
  const stale = !state.lastUpdatedAt || (Date.now() - state.lastUpdatedAt) > INTERVALS.station * 4;
  if (ui.lastUpdateChip) {
    ui.lastUpdateChip.classList.toggle("is-stale", stale);
    ui.lastUpdateChip.classList.toggle("is-live", !stale && state.online);
  }
}

function renderState() {
  ui.locationText.textContent = state.location;
  setValue(ui.skyText, state.skyLabel);
  setValue(ui.tempText, `${state.temp.toFixed(1)}°C`);
  setValue(ui.humidityText, `${Math.round(state.humidity)}%`);
  setValue(ui.pressureText, `${state.pressure.toFixed(1)} hPa`);
  setValue(ui.airText, state.airLabel);
  setValue(ui.rainText, `${Math.round(state.rainChance)}%`);

  // Ветра на станции нет — показываем прогнозный и честно это подписываем
  if (has(state.windForecast)) {
    setValue(ui.windText, `${state.windForecast.toFixed(1)} м/с`);
    ui.windMood.textContent = "По прогнозу, датчика нет";
  } else {
    setValue(ui.windText, "Нет датчика");
    ui.windMood.textContent = "Не установлен";
  }

  const dp = dewPoint(state.temp, state.humidity);
  ui.tempMood.textContent = state.tempMood;
  ui.humidityMood.textContent = dp !== null ? `${state.humidityMood} · точка росы ${dp}°` : state.humidityMood;
  ui.pressureMood.textContent = has(state.pressureTrend3h)
    ? `${state.pressureMood} · за 3ч ${state.pressureTrend3h > 0 ? "+" : ""}${state.pressureTrend3h}`
    : state.pressureMood;
  ui.airMood.textContent = state.airMood;
  ui.rainMood.textContent = state.rainMood;

  ui.statusBadge.textContent = state.statusLabel;
  ui.trendText.textContent = trendWord(state.pressureTrend3h);

  const src = spriteMap[state.sprite] || spriteMap.perfect;
  if (!ui.vaultboySprite.getAttribute("src").endsWith(src)) {
    ui.vaultboySprite.src = src;
    ui.vaultboySprite.alt = `Vault Boy: ${state.sprite}`;
  }

  renderLastUpdate();
}

function setTab(name) {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".pane").forEach((p) => p.classList.toggle("active", p.dataset.pane === name));

  const scr = document.querySelector(".screen");
  if (scr) { scr.classList.remove("glitch"); void scr.offsetWidth; scr.classList.add("glitch"); }

  if (name === "logs") { state.logs = buildLogs(); renderLogs(); }
}

function lightningFlash() {
  const f = $("crtFlash");
  if (!f) return;
  f.classList.remove("fire"); void f.offsetWidth; f.classList.add("fire");
  Snd.blip(180, 220, 0.05);
}

/* =====================================================================
   7. КЭШ
   ===================================================================== */
function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      state: { ...state, sunrise: null, sunset: null }, savedAt: Date.now(),
    }));
  } catch (e) {}
}

function loadCache() {
  try { const r = localStorage.getItem(CACHE_KEY); return r ? JSON.parse(r) : null; }
  catch (e) { return null; }
}

function applyCachedSnapshot(snap) {
  if (!snap || !snap.state) return;
  Object.assign(state, snap.state, { online: false, sunrise: null, sunset: null });
  if (!Array.isArray(state.history)) state.history = [];
  renderState(); renderForecast(); renderLogs(); renderCharts();
}

/* =====================================================================
   8. ДАННЫЕ
   ===================================================================== */
async function apiGet(path) {
  const r = await fetch(CONFIG.API_BASE + path, { cache: "no-store" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

function recompute() {
  const bucket = weatherCodeBucket(state.weatherCode);
  const fresh = has(state.lightningAgeS) && state.lightningAgeS < 1800;

  state.tempMood = tempMoodFrom(state.temp);
  state.humidityMood = humidityMoodFrom(state.humidity);
  state.pressureMood = pressureMoodFrom(state.pressure);
  state.airLabel = airLabelFromPm(state.pm25);
  state.airMood = airMoodFromPm(state.pm25);
  state.rainText = rainLabelFrom(state.rainChance);
  state.rainMood = state.rainChance >= 45 ? "Вероятен" : state.rainChance >= 20 ? "Возможен" : "Маловероятен";

  state.sprite = spriteFromValues(state.temp, state.humidity, state.pressure, state.pm25, state.rainChance, bucket, fresh);
  state.skyLabel = skyLabelFromSprite(state.sprite);
  state.statusLabel = statusLabelFromSprite(state.sprite);
}

async function refreshStatus() {
  try {
    const d = await apiGet("/current");
    const w = d.weather, a = d.air, l = d.lightning, dev = d.device;

    state.online = d.online === true;
    state.location = CONFIG.LOCATION;
    state.timestamp = d.time;
    state.temp = safeNumber(w.temperature_c, state.temp);
    state.humidity = safeNumber(w.humidity_pct, state.humidity);
    state.pressure = safeNumber(w.pressure_sea_hpa !== null && w.pressure_sea_hpa !== undefined ? w.pressure_sea_hpa : w.pressure_hpa, state.pressure);
    state.pressureRaw = safeNumber(w.pressure_hpa, state.pressureRaw);
    state.lux = has(w.lux) ? w.lux : null;
    state.uv = has(w.uv_index) ? w.uv_index : null;

    state.pm1 = has(a.pm1_ugm3) ? a.pm1_ugm3 : null;
    state.pm25 = has(a.pm25_ugm3) ? a.pm25_ugm3 : null;
    state.pm10 = has(a.pm10_ugm3) ? a.pm10_ugm3 : null;
    state.gasKOhm = has(a.gas_ohm) ? Math.round(a.gas_ohm / 1000) : 0;

    const prevAge = state.lightningAgeS;
    state.lightningDistance = has(l.last_distance_km) ? l.last_distance_km : null;
    state.lightningAgeS = has(l.last_age_s) ? l.last_age_s : null;
    state.lightningCount = safeNumber(l.strikes, 0);

    // новая молния — вспышка на весь экран
    if (has(state.lightningAgeS) && state.lightningAgeS < 60 &&
        (!has(prevAge) || state.lightningAgeS < prevAge)) {
      lightningFlash();
    }

    state.rssi = has(dev.rssi_dbm) ? dev.rssi_dbm : null;
    state.freeHeap = has(dev.free_heap) ? dev.free_heap : null;
    state.uptimeS = has(dev.uptime_s) ? dev.uptime_s : null;

    if (!state.rainFromForecast) {
      state.rainChance = rainChanceFrom(state.humidity, state.pressure, state.pressureTrend3h);
    }
    if (state.online) state.lastUpdatedAt = Date.now();

    recompute();
    renderState();
    state.logs = buildLogs();
    renderLogs();
    saveCache();
  } catch (err) {
    console.warn("Сервер недоступен:", err);
    state.online = false;
    renderLastUpdate();
  }
}

async function refreshHistory() {
  try {
    const d = await apiGet("/history?fields=temperature_c,humidity_pct,pressure_hpa,pm25_ugm3&range=24h");
    const s = d.series || {};
    const map = new Map();
    const put = (field, key) => (s[field] || []).forEach((row) => {
      const ts = row[0], v = row[1];
      if (!map.has(ts)) map.set(ts, { ts });
      map.get(ts)[key] = v;
    });
    put("temperature_c", "temp");
    put("humidity_pct", "hum");
    put("pressure_hpa", "press");
    put("pm25_ugm3", "pm25");

    state.history = [...map.values()].sort((a, b) => a.ts - b.ts);

    const target = Date.now() - 3 * 3600 * 1000;
    let p3 = null, best = Infinity;
    for (const r of state.history) {
      if (!Number.isFinite(r.press)) continue;
      const diff = Math.abs(r.ts - target);
      if (diff < best) { best = diff; p3 = r.press; }
    }
    state.pressureTrend3h = p3 !== null && Number.isFinite(state.pressureRaw)
      ? Math.round((state.pressureRaw - p3) * 10) / 10 : null;

    renderCharts();
    renderState();
    saveCache();
  } catch (err) {
    console.warn("История недоступна:", err);
  }
}

async function refreshOpenMeteo() {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${CONFIG.LAT}&longitude=${CONFIG.LON}` +
      `&current=temperature_2m,weathercode,windspeed_10m,precipitation_probability` +
      `&hourly=temperature_2m,precipitation_probability&daily=sunrise,sunset` +
      `&timezone=${encodeURIComponent(CONFIG.TIMEZONE)}&forecast_days=2`;

    const res = await fetch(url);
    if (!res.ok) throw new Error("Open-Meteo HTTP " + res.status);
    const data = await res.json();

    if (data.current) {
      state.weatherCode = safeNumber(data.current.weathercode, state.weatherCode);
      const ws = data.current.windspeed_10m;
      if (Number.isFinite(ws)) state.windForecast = ws / 3.6;   // км/ч → м/с
      const pp = data.current.precipitation_probability;
      if (Number.isFinite(pp)) { state.rainChance = pp; state.rainFromForecast = true; }
    }

    if (data.daily && data.daily.sunrise && data.daily.sunrise.length) {
      const today = new Date().toISOString().slice(0, 10);
      if (state.sunDate !== today) {
        state.sunrise = new Date(data.daily.sunrise[0]);
        state.sunset = new Date(data.daily.sunset[0]);
        state.sunDate = today;
      }
    }

    if (data.hourly && data.hourly.time && data.hourly.time.length) {
      const nowMs = Date.now();
      const times = data.hourly.time.map((t) => new Date(t).getTime());
      let start = times.findIndex((t) => t >= nowMs);
      if (start === -1) start = 0;

      state.forecast = [3, 6, 9, 12, 15].map((o) => start + o).filter((i) => i < times.length).map((i) => {
        const tv = data.hourly.temperature_2m ? data.hourly.temperature_2m[i] : null;
        const rv = data.hourly.precipitation_probability ? data.hourly.precipitation_probability[i] : null;
        return {
          time: new Intl.DateTimeFormat("ru-RU", { timeZone: CONFIG.TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(times[i])),
          temp: Number.isFinite(tv) ? Math.round(tv) : null,
          rain: Number.isFinite(rv) ? Math.round(rv) : null,
        };
      });
      renderForecast();
    }

    recompute();
    renderState();
    saveCache();
  } catch (err) {
    console.warn("Open-Meteo недоступен, оставляю прежние данные:", err);
  }
}

/* =====================================================================
   9. СТАРТОВЫЙ ЭКРАН И ЗАГРУЗКА
   ===================================================================== */
const BOOT_LINES = [
  "ROBCO INDUSTRIES (TM) TERMLINK PROTOCOL",
  "ИНИЦИАЛИЗАЦИЯ WEATHER-BOY MK1 ....... ок",
  "ДАТЧИКИ: BME680 BH1750 LTR390 AS3935",
  "КАНАЛ ТЕЛЕМЕТРИИ .................... ок",
  "БАЗА ДАННЫХ ......................... ок",
  "СОЕДИНЕНИЕ УСТАНОВЛЕНО",
];

function buildStartGate() {
  if ($("startGate")) return;
  const gate = document.createElement("div");
  gate.id = "startGate";
  gate.innerHTML =
    '<div class="gate-top">ROBCO INDUSTRIES UNIFIED OPERATING SYSTEM<br>WEATHER TELEMETRY TERMINAL</div>' +
    '<div class="gate-title">WEATHER-BOY MK1</div>' +
    '<div class="gate-sub">SANT\'ANGELO DI OGLIARA · 257 М НАД МОРЕМ</div>' +
    '<div class="gate-go cursor">НАЖМИТЕ, ЧТОБЫ ВОЙТИ</div>' +
    '<div class="gate-note">Браузер включает звук только после нажатия — поэтому терминал ждёт вас здесь.</div>';
  document.body.appendChild(gate);

  const start = () => {
    gate.removeEventListener("click", start);
    document.removeEventListener("keydown", start);
    Snd.unlock();
    Snd.blip(720, 70, 0.06);
    gate.classList.add("closing");
    setTimeout(() => gate.remove(), 460);
    runBoot();
  };

  gate.addEventListener("click", start);
  document.addEventListener("keydown", start);
}

function runBoot() {
  const boot = $("bootScreen"), bar = $("bootProgress"), percent = $("bootPercent");
  if (!boot || !bar || !percent) { powerOnScreen(); return; }

  boot.style.display = "flex";
  boot.style.opacity = "1";

  let lines = $("bootLines");
  if (!lines) {
    lines = document.createElement("div");
    lines.id = "bootLines";
    boot.appendChild(lines);
  }
  lines.textContent = "";

  Snd.play("boot");

  let li = 0;
  const typeLine = () => {
    if (li >= BOOT_LINES.length) return;
    lines.textContent += BOOT_LINES[li] + "\n";
    Snd.blip(1250 + li * 60, 26, 0.03);
    li++;
    setTimeout(typeLine, 210);
  };
  typeLine();

  let v = 0;
  const timer = setInterval(() => {
    v += 2;
    bar.style.width = v + "%";
    percent.textContent = v + "%";
    if (v >= 100) {
      clearInterval(timer);
      setTimeout(() => {
        boot.style.transition = "opacity 450ms ease";
        boot.style.opacity = "0";
        setTimeout(() => { boot.remove(); powerOnScreen(); }, 470);
      }, 380);
    }
  }, 28);
}

function powerOnScreen() {
  const app = document.querySelector(".app");
  if (!app) return;
  app.classList.add("powering");
  Snd.blip(420, 130, 0.05);
  setTimeout(() => app.classList.remove("powering"), 800);
}

/* =====================================================================
   10. ЗАПУСК
   ===================================================================== */
injectStyles();
addCrtLayers();
Snd.prepare();

// экран загрузки ждёт нажатия на стартовом экране
const bootEl = $("bootScreen");
if (bootEl) bootEl.style.display = "none";

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => { setTab(btn.dataset.tab); Snd.play("tab"); });
});

applyCachedSnapshot(loadCache());
renderState();
renderForecast();
renderLogs();
renderCharts();
updateClock();

refreshStatus();
refreshHistory();
refreshOpenMeteo();

setInterval(updateClock, INTERVALS.clock);
setInterval(refreshStatus, INTERVALS.station);
setInterval(refreshHistory, INTERVALS.history);
setInterval(refreshOpenMeteo, INTERVALS.openMeteo);
setInterval(renderLastUpdate, INTERVALS.lastUpdateTick);

window.addEventListener("online", () => { refreshStatus(); refreshHistory(); refreshOpenMeteo(); });
document.addEventListener("visibilitychange", () => {
  Snd.mute(document.hidden);
  if (!document.hidden) refreshStatus();
});

if (document.readyState === "complete") buildStartGate();
else window.addEventListener("load", buildStartGate);

/* Telegram Mini App: развернуть на весь экран, если открыто из бота */
if (window.Telegram && window.Telegram.WebApp) {
  try { window.Telegram.WebApp.ready(); window.Telegram.WebApp.expand(); } catch (e) {}
}
