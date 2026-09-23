/* =====================================================================
   WEATHER-BOY MK1 — логика, прогноз и эффекты
   Данные: домашний сервер (/api) + модель ICON через Open-Meteo.

   Весь новый CSS и вся разметка вкладок собираются здесь,
   поэтому менять нужно только этот файл.
   ===================================================================== */

const CONFIG = {
  API_BASE: location.protocol.startsWith("http")
    ? location.origin + "/api"
    : "http://192.168.1.40:3001/api",

  LOCATION: "SANT'ANGELO DI OGLIARA",
  LAT: 40.70,
  LON: 14.74,
  ALTITUDE_M: 257,
  TIMEZONE: "Europe/Rome",

  // ВАЖНО: когда станция переедет на крышу — поставь false.
  // Пока true, сайт не доверяет датчику света и датчику молний,
  // потому что в помещении они врут: света мало, а помехи от
  // электроники датчик молний принимает за разряды.
  STATION_INDOORS: false,
};

const INTERVALS = {
  clock: 1000,
  station: 15000,
  history: 60000,
  openMeteo: 10 * 60 * 1000,
  lastUpdateTick: 15000,
};

const CACHE_KEY = "weatherboy_cache_v4";
const STRIKE_KEY = "weatherboy_strikes_v1";

/* =====================================================================
   1. СТИЛИ
   ===================================================================== */
const EFFECT_CSS = `
/* ---------- стартовый экран ---------- */
#startGate{
  position:fixed; inset:0; z-index:100000;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:20px; padding:24px; text-align:center; cursor:pointer;
  background:radial-gradient(ellipse 80% 60% at 50% 50%, #0a1f10 0%, #040c06 60%, #000 100%);
  color:#6efc7b; font-family:'Share Tech Mono',monospace;
  -webkit-tap-highlight-color:transparent;
}
#startGate .gate-top{ font-size:clamp(10px,1.05vw,14px); letter-spacing:.2em; color:#3e8f4c; line-height:2 }
#startGate .gate-title{
  font-size:clamp(28px,4.6vw,60px); letter-spacing:.16em; color:#c4ff64;
  text-shadow:0 0 28px rgba(196,255,100,.35);
}
#startGate .gate-sub{ font-size:clamp(11px,1vw,14px); color:#3e8f4c; letter-spacing:.14em }
#startGate .gate-go{
  margin-top:8px; font-size:clamp(13px,1.3vw,19px); letter-spacing:.2em; color:#6efc7b;
  border:1px solid rgba(110,252,123,.35); padding:13px 26px; border-radius:10px;
  background:rgba(6,24,12,.6); animation:gatePulse 1.6s ease-in-out infinite;
}
@keyframes gatePulse{
  0%,100%{ opacity:.55; box-shadow:0 0 0 rgba(110,252,123,0) }
  50%{ opacity:1; box-shadow:0 0 26px rgba(110,252,123,.16) }
}
#startGate .gate-note{ font-size:clamp(10px,.85vw,12px); color:#2c6637; max-width:44ch; line-height:1.7 }
.cursor::after{ content:"\\258C"; animation:cursorBlink 1s steps(2,end) infinite }
@keyframes cursorBlink{ 0%,100%{opacity:1} 50%{opacity:0} }
#startGate.closing{ animation:gateOut .45s ease forwards }
@keyframes gateOut{ to{ opacity:0; visibility:hidden } }

/* ---------- слои ЭЛТ ---------- */
.crt-scan,.crt-sweep,.crt-flicker,.crt-noise,.crt-vignette,.crt-flash{ position:fixed; inset:0; pointer-events:none }
.crt-scan{ z-index:60; background:repeating-linear-gradient(to bottom,
  rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,.16) 3px, rgba(0,0,0,.16) 4px) }
.crt-sweep{
  z-index:61; height:140px; inset:auto 0 auto 0;
  background:linear-gradient(to bottom, rgba(110,252,123,0) 0%, rgba(110,252,123,.05) 45%,
    rgba(196,255,100,.07) 50%, rgba(110,252,123,.05) 55%, rgba(110,252,123,0) 100%);
  animation:crtSweep 6.5s linear infinite;
}
@keyframes crtSweep{ 0%{transform:translateY(-160px)} 100%{transform:translateY(100vh)} }
.crt-flicker{ z-index:62; background:#6efc7b; opacity:.012; animation:crtFlick 4s steps(3,end) infinite }
@keyframes crtFlick{ 0%,100%{opacity:.010} 8%{opacity:.024} 10%{opacity:.008}
  41%{opacity:.019} 43%{opacity:.010} 77%{opacity:.022} 79%{opacity:.009} }
.crt-noise{ z-index:59; opacity:.045; mix-blend-mode:screen;
  background-image:NOISE_URL; background-size:170px 170px; animation:crtNoise .55s steps(4,end) infinite }
@keyframes crtNoise{ 0%{transform:translate(0,0)} 25%{transform:translate(-3%,2%)}
  50%{transform:translate(2%,-3%)} 75%{transform:translate(-2%,-2%)} 100%{transform:translate(0,0)} }
.crt-vignette{ z-index:63; background:radial-gradient(ellipse 90% 78% at 50% 50%, rgba(0,0,0,0) 42%, rgba(0,0,0,.6) 100%) }
.crt-flash{ z-index:64; background:#dfffe4; opacity:0 }
.crt-flash.fire{ animation:crtFlash .5s ease-out }
@keyframes crtFlash{ 0%{opacity:0} 6%{opacity:.45} 14%{opacity:.05} 22%{opacity:.3} 100%{opacity:0} }

/* ---------- включение экрана ---------- */
.app.powering{ animation:powerOn .72s cubic-bezier(.2,.8,.25,1) }
@keyframes powerOn{
  0%{ transform:scaleY(.004) scaleX(1.1); filter:brightness(4) blur(1px); opacity:0 }
  28%{ transform:scaleY(.02) scaleX(1.05); filter:brightness(3); opacity:1 }
  60%{ transform:scaleY(1) scaleX(1); filter:brightness(1.7) }
  100%{ transform:none; filter:none }
}

/* ---------- глитч ---------- */
.screen.glitch{ animation:glitchShift .24s steps(2,end) }
@keyframes glitchShift{
  0%{ transform:translate(0,0); filter:none }
  25%{ transform:translate(-3px,1px); filter:hue-rotate(30deg) saturate(1.4) }
  55%{ transform:translate(2px,-2px); filter:brightness(1.3) }
  100%{ transform:translate(0,0); filter:none }
}

/* ---------- смена значений ---------- */
.metric-value.bump{ animation:valueBump .4s ease-out }
@keyframes valueBump{
  0%{ transform:translateY(-5px); opacity:.3; filter:blur(2px) }
  55%{ transform:translateY(1px); opacity:1; filter:blur(0) }
  100%{ transform:none }
}

/* ---------- загрузка ---------- */
#bootLines{
  margin-top:18px; min-height:9.2em; width:min(560px,86vw); text-align:left;
  color:#6efc7b; font-size:clamp(11px,1.05vw,15px); line-height:1.85;
  white-space:pre-wrap; letter-spacing:.04em;
}

/* ---------- Vault Boy крупнее ---------- */
#vaultboySprite{ width:min(104%,40vw) !important; max-height:100% !important; transform:translateY(4px) }
.hero-ring{ width:min(80%,30vw) !important }

/* ---------- панель прогноза ---------- */
.fc-verdict{
  border:1px solid rgba(110,252,123,.22); border-radius:16px;
  padding:clamp(12px,1.1vw,20px);
  background:linear-gradient(180deg, rgba(7,24,12,.75), rgba(4,16,8,.45));
}
.fc-head{
  color:#c4ff64; font-size:clamp(19px,1.75vw,32px); line-height:1.2;
  text-shadow:0 0 16px rgba(196,255,100,.16);
}
.fc-body{ color:rgba(220,255,217,.85); font-size:clamp(12px,.92vw,16px); margin-top:8px; line-height:1.6 }
.fc-conf{ display:flex; align-items:center; gap:10px; margin-top:12px }
.fc-conf-bar{ flex:1; height:7px; background:rgba(110,252,123,.14); border-radius:99px; overflow:hidden }
.fc-conf-bar i{ display:block; height:100%; background:linear-gradient(90deg,#6efc7b,#c4ff64); width:0; transition:width .6s ease }
.fc-conf span{ color:rgba(220,255,217,.7); font-size:clamp(10px,.75vw,13px); white-space:nowrap }

.fc-signals{ display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:8px }
.fc-sig{
  border:1px solid rgba(110,252,123,.16); border-radius:12px; padding:10px 12px;
  background:rgba(4,16,8,.4);
}
.fc-sig .sk{ color:#c4ff64; font-size:clamp(10px,.72vw,12px); letter-spacing:.08em; text-transform:uppercase }
.fc-sig .sv{ color:var(--text); font-size:clamp(13px,.95vw,17px); margin-top:4px; line-height:1.35 }
.fc-sig .sn{ color:rgba(220,255,217,.55); font-size:clamp(10px,.7vw,12px); margin-top:4px }
.fc-sig.weak{ opacity:.55 }

/* ---------- вкладка датчиков ---------- */
.sensor-grid{ display:grid; grid-template-columns:repeat(auto-fit,minmax(215px,1fr)); gap:8px }
.sensor{
  border:1px solid rgba(110,252,123,.18); border-radius:12px; padding:11px 13px;
  background:linear-gradient(180deg, rgba(7,24,12,.7), rgba(4,16,8,.4));
  display:flex; flex-direction:column; gap:4px;
}
.sensor .s-top{ display:flex; justify-content:space-between; align-items:baseline; gap:8px }
.sensor .s-name{ color:#c4ff64; font-size:clamp(11px,.8vw,14px); letter-spacing:.05em }
.sensor .s-chip{ font-size:clamp(9px,.65vw,11px); padding:2px 7px; border-radius:99px; border:1px solid currentColor }
.sensor .s-val{ color:var(--text); font-size:clamp(15px,1.15vw,21px); line-height:1.2 }
.sensor .s-note{ color:rgba(220,255,217,.55); font-size:clamp(10px,.7vw,12px); line-height:1.5 }
.ok-col{ color:#6efc7b } .warn-col{ color:#ffcf5c } .bad-col{ color:#ff8b6e } .off-col{ color:#4e7a58 }

.sys-rows{ display:flex; flex-direction:column; gap:1px; background:rgba(110,252,123,.12);
  border:1px solid rgba(110,252,123,.14); border-radius:12px; overflow:hidden }
.sys-row{ display:flex; justify-content:space-between; gap:12px; padding:9px 13px;
  background:rgba(4,16,8,.72); font-size:clamp(11px,.82vw,14px) }
.sys-row dt{ color:rgba(220,255,217,.6) } .sys-row dd{ color:var(--text); text-align:right }
.sys-note{ color:rgba(220,255,217,.5); font-size:clamp(10px,.72vw,12px); line-height:1.65;
  border:1px dashed rgba(110,252,123,.18); border-radius:10px; padding:10px 12px }

/* ---------- прокрутка вкладок ---------- */
.page-shell{ overflow-y:auto }
.page-shell::-webkit-scrollbar{ width:6px }
.page-shell::-webkit-scrollbar-thumb{ background:#2f7a3d; border-radius:99px }

/* ---------- починка наложения текста на графике ---------- */
.trend-chart .chart-note{
  grid-column:1 / -1; place-self:center; color:rgba(220,255,217,.45);
  font-size:clamp(10px,.75vw,13px); letter-spacing:.04em;
}
.trend-chart .chart-note::after{ display:none !important }
.trend-chart{ min-height:110px }

/* ---------- живой индикатор ---------- */
.chip.is-live img{ animation:chipPulse 2.4s ease-in-out infinite }
@keyframes chipPulse{ 0%,100%{opacity:1} 50%{opacity:.35} }

/* ---------- телефон ---------- */
@media (max-width:900px){
  #vaultboySprite{ width:min(78%,240px) !important }
  .hero-ring{ width:min(74%,220px) !important }
  .hero{ min-height:250px }
  .fc-signals{ grid-template-columns:1fr }
  .sensor-grid{ grid-template-columns:1fr }
  .forecast-grid{ grid-template-columns:repeat(3,minmax(0,1fr)) }
  .tabs{ position:sticky; bottom:0; z-index:5 }
}

@media (prefers-reduced-motion:reduce){
  .crt-sweep,.crt-flicker,.crt-noise,#startGate .gate-go,.cursor::after,.chip.is-live img{ animation:none }
  .app.powering,.screen.glitch,.metric-value.bump{ animation:none }
}
`;

function injectStyles() {
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
    noiseUrl = "url(" + c.toDataURL() + ")";
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
   2. ПЕРЕСБОРКА ВКЛАДОК
   Делается до того, как код запомнит ссылки на элементы.
   ===================================================================== */
function rebuildPanes() {
  const weather = document.querySelector('.pane[data-pane="weather"] .page-shell');
  if (weather) {
    weather.innerHTML =
      '<div class="page-title"><span class="page-kicker">ПРОГНОЗ</span>' +
      '<span class="page-note">барометр станции + модель ICON</span></div>' +
      '<div class="fc-verdict">' +
        '<div class="fc-head" id="fcHead">Собираю данные…</div>' +
        '<div class="fc-body" id="fcBody">Для прогноза нужна история давления хотя бы за 3 часа.</div>' +
        '<div class="fc-conf"><div class="fc-conf-bar"><i id="fcConfBar"></i></div>' +
        '<span id="fcConfText">уверенность —</span></div>' +
      '</div>' +
      '<div class="fc-signals" id="fcSignals"></div>' +
      '<div class="forecast-grid" id="forecastGrid"></div>' +
      '<div class="trend-panel">' +
        '<div class="trend-head"><div>' +
          '<div class="trend-title">Тенденция давления</div>' +
          '<div class="trend-sub" id="trendText">—</div>' +
        '</div><img src="images/icon_pressure.png" alt="" class="trend-icon" aria-hidden="true"/></div>' +
        '<div class="trend-chart" id="trendChart" aria-hidden="true"></div>' +
      '</div>';
  }

  const logs = document.querySelector('.pane[data-pane="logs"] .page-shell');
  if (logs) {
    logs.innerHTML =
      '<div class="page-title"><span class="page-kicker">ДАТЧИКИ</span>' +
      '<span class="page-note">что именно сейчас измеряется</span></div>' +
      '<div class="sensor-grid" id="sensorGrid"></div>' +
      '<dl class="sys-rows" id="sysRows"></dl>' +
      '<p class="sys-note" id="sysNote"></p>';
  }

  const names = { status: "СТАТУС", weather: "ПРОГНОЗ", logs: "ДАТЧИКИ" };
  document.querySelectorAll(".tab-btn").forEach((b) => {
    if (names[b.dataset.tab]) b.textContent = names[b.dataset.tab];
  });
}

/* =====================================================================
   3. ЗВУК
   ===================================================================== */
const BOOT_FILES = ["sounds/pipboy_boot.mp3", "sounds/boot.mp3", "sounds/pipboy-boot.mp3",
                    "sounds/pipboy_boot.wav", "sounds/startup.mp3", "sounds/pipboy_startup.mp3"];
const TAB_FILES = ["sounds/pipboy_tab.mp3", "sounds/tab.mp3", "sounds/pipboy-tab.mp3",
                   "sounds/pipboy_tab.wav", "sounds/click.mp3", "sounds/pipboy_click.mp3"];

const Snd = {
  boot: null, tab: null, ctx: null, humGain: null, ready: false,

  // пробуем несколько имён файлов и берём то, которое реально загрузилось
  resolve(list, volume) {
    let chosen = null;
    list.forEach((src) => {
      const a = new Audio(src);
      a.preload = "auto";
      a.volume = volume;
      a.addEventListener("canplaythrough", () => { if (!chosen) chosen = a; }, { once: true });
      a.addEventListener("loadedmetadata", () => { if (!chosen) chosen = a; }, { once: true });
      a.load();
    });
    return () => chosen;
  },

  prepare() {
    try {
      this.getBoot = this.resolve(BOOT_FILES, 0.55);
      this.getTab = this.resolve(TAB_FILES, 0.4);
    } catch (e) {
      this.getBoot = () => null;
      this.getTab = () => null;
    }
  },

  unlock() {
    if (this.ready) return;
    this.ready = true;
    [this.getBoot(), this.getTab()].forEach((a) => {
      if (!a) return;
      const p = a.play();
      if (p && p.then) p.then(() => { a.pause(); a.currentTime = 0; }).catch(() => {});
    });
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.startHum();
      this.scheduleClicks();
    } catch (e) { this.ctx = null; }
  },

  startHum() {
    if (!this.ctx) return;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.connect(this.ctx.destination);
    [58, 117].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const og = this.ctx.createGain();
      o.type = "sine"; o.frequency.value = f;
      og.gain.value = i === 0 ? 1 : 0.42;
      o.connect(og).connect(g); o.start();
    });
    const lfo = this.ctx.createOscillator();
    const lg = this.ctx.createGain();
    lfo.frequency.value = 0.07; lg.gain.value = 0.004;
    lfo.connect(lg).connect(g.gain); lfo.start();
    g.gain.setTargetAtTime(0.013, this.ctx.currentTime, 1.6);
    this.humGain = g;
  },

  scheduleClicks() {
    const next = () => setTimeout(() => {
      if (!document.hidden) this.click();
      next();
    }, 3500 + Math.random() * 9000);
    next();
  },

  click() {
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = "square";
      o.frequency.setValueAtTime(1400 + Math.random() * 900, t);
      g.gain.setValueAtTime(0.028, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      o.connect(g).connect(this.ctx.destination);
      o.start(t); o.stop(t + 0.06);
    } catch (e) {}
  },

  blip(freq, ms, vol) {
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
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
    const a = name === "boot" ? this.getBoot() : this.getTab();
    if (a) {
      try {
        a.currentTime = 0;
        const p = a.play();
        if (p && p.catch) p.catch(() => {});
        return;
      } catch (e) {}
    }
    this.blip(name === "boot" ? 520 : 980, name === "boot" ? 170 : 60, 0.06);
  },

  mute(on) {
    if (this.humGain && this.ctx) this.humGain.gain.setTargetAtTime(on ? 0 : 0.013, this.ctx.currentTime, 0.3);
  },
};

/* =====================================================================
   4. СОСТОЯНИЕ
   ===================================================================== */
const state = {
  online: false, location: CONFIG.LOCATION, timestamp: "--",
  temp: 0, humidity: 0, pressure: 0, pressureRaw: 0, gasKOhm: 0,
  pm1: null, pm25: null, pm10: null, uv: null, lux: null,
  lightningDistance: null, lightningAgeS: null, lightningCount: 0, disturbers: 0,
  strikes30: 0, stormConfirmed: false, stormPossible: false,
  rssi: null, freeHeap: null, uptimeS: null, micBaseline: null,
  windForecast: null, rainChance: 0, rainFromForecast: false,
  tempTrend3h: null, pressureTrend3h: null, humTrend3h: null,
  cloudIndex: null, sunElevation: null,
  sprite: "perfect", skyLabel: "СТАБИЛЬНО", statusLabel: "СТАБИЛЬНО",
  tempMood: "-", humidityMood: "-", pressureMood: "-",
  airLabel: "-", airMood: "-", rainText: "-", rainMood: "-",
  forecast: [], history: [],
  lastUpdatedAt: null, weatherCode: null,
  sunrise: null, sunset: null, sunDate: null,
  verdict: null,
};

const $ = (id) => document.getElementById(id);
let ui = {};

function captureUI() {
  ui = {
    dateText: $("dateText"), timeText: $("timeText"),
    lastUpdateText: $("lastUpdateText"), lastUpdateChip: $("lastUpdateChip"),
    locationText: $("locationText"), skyText: $("skyText"),
    tempText: $("tempText"), humidityText: $("humidityText"), pressureText: $("pressureText"),
    airText: $("airText"), rainText: $("rainText"), windText: $("windText"),
    tempMood: $("tempMood"), humidityMood: $("humidityMood"), pressureMood: $("pressureMood"),
    airMood: $("airMood"), rainMood: $("rainMood"), windMood: $("windMood"),
    statusBadge: $("statusBadge"), trendText: $("trendText"), trendChart: $("trendChart"),
    vaultboySprite: $("vaultboySprite"), forecastGrid: $("forecastGrid"),
    tempChartWrap: $("tempChartWrap"), humidityChartWrap: $("humidityChartWrap"),
    airChartWrap: $("airChartWrap"), rainChartWrap: $("rainChartWrap"),
    fcHead: $("fcHead"), fcBody: $("fcBody"), fcConfBar: $("fcConfBar"), fcConfText: $("fcConfText"),
    fcSignals: $("fcSignals"), sensorGrid: $("sensorGrid"), sysRows: $("sysRows"), sysNote: $("sysNote"),
  };
}

const spriteMap = {
  perfect: "images/vaultboy_perfect.png", sun: "images/vaultboy_sun.png",
  cloudy: "images/vaultboy_cloudy.png", rain: "images/vaultboy_rain.png",
  storm: "images/vaultboy_storm.png", heat: "images/vaultboy_heat.png",
  cold: "images/vaultboy_cold.png", dry: "images/vaultboy_dry.png",
  wind: "images/vaultboy_wind.png", airmask: "images/vaultboy_airmask.png",
};

/* =====================================================================
   5. ПОМОЩНИКИ
   ===================================================================== */
const safeNumber = (v, f = 0) => (Number.isFinite(Number(v)) ? Number(v) : f);
const has = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function timeNowRome() {
  const now = new Date();
  return {
    time: new Intl.DateTimeFormat("it-IT", { timeZone: CONFIG.TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(now),
    date: new Intl.DateTimeFormat("ru-RU", { timeZone: CONFIG.TIMEZONE, day: "2-digit", month: "2-digit", year: "numeric" }).format(now),
  };
}

function updateClock() {
  if (!ui.timeText) return;
  const { time, date } = timeNowRome();
  ui.timeText.textContent = time;
  ui.dateText.textContent = date;
}

function isNightTime() {
  if (state.sunrise instanceof Date && state.sunset instanceof Date) {
    const n = new Date();
    return n < state.sunrise || n > state.sunset;
  }
  if (has(state.sunElevation)) return state.sunElevation < -1;
  const h = new Date().getHours();
  return h >= 21 || h < 6;
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

function formatRelativeUpdate(ms) {
  if (!ms) return "нет данных";
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 20) return "только что";
  if (s < 60) return s + " сек назад";
  const m = Math.round(s / 60);
  return m < 60 ? m + " мин назад" : Math.round(m / 60) + " ч назад";
}

function durWords(s) {
  if (!has(s)) return "—";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? d + " д " + h + " ч" : h ? h + " ч " + m + " мин" : m + " мин";
}

function setValue(el, text) {
  if (!el || el.textContent === text) return;
  el.textContent = text;
  el.classList.remove("bump");
  void el.offsetWidth;
  el.classList.add("bump");
}

/* Высота солнца над горизонтом — нужна, чтобы понять,
   сколько света должно быть при безоблачном небе. */
function solarElevation(lat, lon, date) {
  const rad = Math.PI / 180;
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const doy = Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start) / 86400000);
  const frac = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const B = (360 / 365) * (doy - 81) * rad;
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  const solarTime = frac + (4 * lon + eot) / 60;
  const H = (solarTime - 12) * 15 * rad;
  const decl = 23.45 * Math.sin(B) * rad;
  const el = Math.asin(Math.sin(lat * rad) * Math.sin(decl) + Math.cos(lat * rad) * Math.cos(decl) * Math.cos(H));
  return el / rad;
}

/* Облачность: сравниваем измеренную освещённость с той,
   которая была бы при чистом небе. Работает только днём. */
function cloudIndexFromLux(lux, elevationDeg) {
  if (!has(lux) || !has(elevationDeg) || elevationDeg < 8) return null;
  const expected = 128000 * Math.pow(Math.sin(elevationDeg * Math.PI / 180), 1.15);
  if (expected < 1000) return null;
  return clamp(1 - lux / expected, 0, 1);
}

/* =====================================================================
   6. ПРОГНОЗ ЗАМБРЕТТИ
   Классический барометрический метод (1915): по давлению на уровне
   моря и его тенденции выдаёт один из 26 вариантов погоды.
   ===================================================================== */
const Z_TEXT = [
  "Устойчиво ясно", "Ясно", "Проясняется", "Ясно, но менее устойчиво",
  "Ясно, возможны кратковременные дожди", "Довольно ясно, улучшение",
  "Довольно ясно, ранние дожди возможны", "Довольно ясно, дожди позже",
  "Дожди рано, затем улучшение", "Переменчиво, налаживается",
  "Довольно ясно, дожди вероятны", "Неустойчиво, прояснение позже",
  "Неустойчиво, вероятно улучшение", "Дожди с прояснениями",
  "Дожди, погода портится", "Переменчиво, местами дождь",
  "Неустойчиво, короткие прояснения", "Неустойчиво, дождь позже",
  "Неустойчиво, дождь временами", "Очень неустойчиво, прояснения редки",
  "Дождь временами, позже хуже", "Дождь временами, погода портится",
  "Частые дожди", "Очень неустойчиво, дождь",
  "Шторм, возможно улучшение", "Шторм, сильный дождь",
];
const Z_RISE   = [25,25,25,24,24,19,16,12,11,9,8,6,5,2,1,1,0,0,0,0,0,0];
const Z_STEADY = [25,25,25,25,25,25,23,23,22,18,15,13,10,4,1,1,0,0,0,0,0,0];
const Z_FALL   = [25,25,25,25,25,25,25,25,23,23,21,20,17,14,7,3,1,1,1,0,0,0];

function zambretti(pSea, trend3h) {
  if (!has(pSea) || !has(trend3h)) return null;
  let z, table, dir;
  if (trend3h <= -1.0) { z = Math.round(127 - 0.12 * pSea); table = Z_FALL; dir = "падает"; }
  else if (trend3h >= 1.0) { z = Math.round(185 - 0.16 * pSea); table = Z_RISE; dir = "растёт"; }
  else { z = Math.round(144 - 0.13 * pSea); table = Z_STEADY; dir = "стабильно"; }
  const idx = table[clamp(z, 0, 21)];
  return { text: Z_TEXT[idx], wet: idx / 25, dir: dir };
}

/* =====================================================================
   7. ПРОВЕРКА ГРОЗЫ
   Датчик AS3935 ловит электромагнитный импульс и рядом с электроникой
   регулярно принимает помеху за разряд. Одиночное срабатывание не
   считается грозой: нужно подтверждение другими признаками.
   ===================================================================== */
function trackStrikes(count) {
  let log = [];
  try { log = JSON.parse(localStorage.getItem(STRIKE_KEY) || "[]"); } catch (e) {}
  const now = Date.now();

  // станция перезагрузилась — счётчик обнулился, историю сбрасываем
  if (log.length && count < log[log.length - 1].c) log = [];

  log.push({ t: now, c: count });
  log = log.filter((r) => now - r.t < 2 * 3600 * 1000);
  try { localStorage.setItem(STRIKE_KEY, JSON.stringify(log)); } catch (e) {}

  const win = log.filter((r) => now - r.t < 30 * 60 * 1000);
  if (win.length < 2) return 0;
  return Math.max(0, win[win.length - 1].c - win[0].c);
}

function evaluateStorm() {
  const s30 = state.strikes30;
  const bucket = weatherCodeBucket(state.weatherCode);
  const modelStorm = bucket === "storm";
  const heavyRainForecast = state.rainFromForecast && state.rainChance >= 50;
  const pressureCrash = has(state.pressureTrend3h) && state.pressureTrend3h <= -1.5;
  const humidHot = state.humidity >= 75 && state.temp >= 20;

  // подтверждённая гроза: несколько разрядов И независимое подтверждение
  const confirmed = s30 >= 2 && (modelStorm || heavyRainForecast || pressureCrash);
  // возможная: разряд есть, но подтверждение слабое
  const possible = !confirmed && s30 >= 1 && (modelStorm || state.rainChance >= 30 || humidHot);

  state.stormConfirmed = confirmed;
  state.stormPossible = possible;
  return { confirmed: confirmed, possible: possible, s30: s30, modelStorm: modelStorm };
}

/* =====================================================================
   8. СБОРКА ПРОГНОЗА
   ===================================================================== */
function buildVerdict() {
  const sig = [];
  let wetSum = 0, wetWeight = 0;
  const agree = [];

  // --- барометр станции ---
  const z = zambretti(state.pressure, state.pressureTrend3h);
  if (z) {
    wetSum += z.wet * 45; wetWeight += 45; agree.push(z.wet);
    sig.push({ k: "Барометр станции", v: z.text,
      n: state.pressure.toFixed(1) + " гПа, за 3 ч " + (state.pressureTrend3h > 0 ? "+" : "") + state.pressureTrend3h + " (" + z.dir + ")" });
  } else {
    sig.push({ k: "Барометр станции", v: "нужно больше истории", n: "тренд считается за 3 часа наблюдений", weak: true });
  }

  // --- модель ICON ---
  if (state.rainFromForecast) {
    const w = state.rainChance / 100;
    wetSum += w * 40; wetWeight += 40; agree.push(w);
    const bucket = weatherCodeBucket(state.weatherCode);
    const names = { clear: "ясно", cloudy: "облачно", rain: "осадки", storm: "гроза" };
    sig.push({ k: "Модель ICON", v: (names[bucket] || "нет кода") + ", осадки " + state.rainChance + "%",
      n: "европейская модель для твоих координат" });
  } else {
    sig.push({ k: "Модель ICON", v: "нет связи с Open-Meteo", n: "работаю только по своим датчикам", weak: true });
  }

  // --- влажность и точка росы ---
  const dp = dewPoint(state.temp, state.humidity);
  const spread = has(dp) ? Math.round((state.temp - dp) * 10) / 10 : null;
  if (has(spread)) {
    const w = clamp((10 - spread) / 10, 0, 1) * 0.6;
    wetSum += w * 15; wetWeight += 15;
    const fog = spread <= 2.5 && (has(state.tempTrend3h) ? state.tempTrend3h <= 0 : true);
    sig.push({ k: "Влажность воздуха", v: fog ? "воздух почти насыщен, возможен туман" : "запас до насыщения " + spread + "°",
      n: "точка росы " + dp + "°, влажность " + Math.round(state.humidity) + "%" });
  }

  // --- облачность по датчику света ---
  if (CONFIG.STATION_INDOORS) {
    sig.push({ k: "Облачность по свету", v: "датчик в помещении",
      n: "оценка станет доступна, когда станция переедет на крышу", weak: true });
  } else if (has(state.cloudIndex)) {
    const pct = Math.round(state.cloudIndex * 100);
    wetSum += state.cloudIndex * 20; wetWeight += 20; agree.push(state.cloudIndex);
    sig.push({ k: "Облачность по свету", v: pct + "% неба закрыто",
      n: "сравнение яркости с расчётом для ясного неба (солнце " + Math.round(state.sunElevation) + "° над горизонтом)" });
  } else {
    sig.push({ k: "Облачность по свету", v: has(state.sunElevation) && state.sunElevation < 8 ? "солнце низко, оценка невозможна" : "нет данных",
      n: "метод работает только днём", weak: true });
  }

  // --- гроза ---
  const storm = evaluateStorm();
  if (storm.confirmed) {
    wetSum += 25; wetWeight += 25;
    sig.push({ k: "Гроза", v: "подтверждена",
      n: storm.s30 + " разряда за 30 мин, совпадает с другими признаками" });
  } else if (storm.possible) {
    sig.push({ k: "Гроза", v: "возможна, но не подтверждена",
      n: "срабатывания есть, независимых признаков мало" });
  } else if (state.strikes30 > 0 || state.lightningCount > 0) {
    sig.push({ k: "Гроза", v: "срабатывания есть, гроза не подтверждена",
      n: CONFIG.STATION_INDOORS
        ? "станция в помещении — это почти наверняка помеха от электроники"
        : "нет совпадения с падением давления и прогнозом", weak: true });
  } else {
    sig.push({ k: "Гроза", v: "разрядов не зафиксировано", n: "датчик AS3935 на связи", weak: true });
  }

  // --- воздух ---
  if (has(state.pm25)) {
    sig.push({ k: "Частицы в воздухе", v: airLabelFromPm(state.pm25).toLowerCase(),
      n: "PM2.5 " + state.pm25 + ", PM10 " + (has(state.pm10) ? state.pm10 : "—") + " мкг/м³" });
  }

  // --- итог ---
  const wetness = wetWeight > 0 ? wetSum / wetWeight : null;
  let head, body;

  if (wetness === null) {
    head = "Данных пока недостаточно";
    body = "Нужно хотя бы три часа наблюдений, чтобы посчитать тенденцию давления.";
  } else if (storm.confirmed) {
    head = "Гроза рядом";
    body = "Разряды подтверждены несколькими признаками сразу. Лучше не находиться на открытом месте.";
  } else {
    const w = wetness;
    if (w < 0.15) { head = "Сухо и устойчиво"; body = "Осадков не ожидается, погода спокойная."; }
    else if (w < 0.3) { head = "Преимущественно ясно"; body = "Возможна переменная облачность, но дождь маловероятен."; }
    else if (w < 0.5) { head = "Переменная облачность"; body = "Осадки возможны, но не обязательны. Погода может измениться в течение дня."; }
    else if (w < 0.68) { head = "Возможны осадки"; body = "Признаки склоняются к дождю в ближайшие часы. Зонт не помешает."; }
    else if (w < 0.85) { head = "Дождь вероятен"; body = "Несколько независимых признаков указывают на осадки."; }
    else { head = "Ненастье"; body = "Давление и прогноз сходятся на затяжных осадках."; }

    if (z && state.pressureTrend3h <= -2) body += " Давление падает быстро — это обычно означает скорое ухудшение.";
    else if (z && state.pressureTrend3h >= 2) body += " Давление быстро растёт — погода налаживается.";
  }

  // --- уверенность: насколько источники согласны между собой ---
  let conf = 0;
  if (agree.length >= 2) {
    let maxDiff = 0;
    for (let i = 0; i < agree.length; i++)
      for (let j = i + 1; j < agree.length; j++)
        maxDiff = Math.max(maxDiff, Math.abs(agree[i] - agree[j]));
    conf = Math.round(clamp((1 - maxDiff) * 100, 25, 95));
  } else if (agree.length === 1) {
    conf = 45;
  } else {
    conf = 15;
  }
  if (state.history.length < 10) conf = Math.min(conf, 40);

  let confWord = conf >= 75 ? "источники согласны" : conf >= 50 ? "источники расходятся частично" : "мало данных";

  state.verdict = { head: head, body: body, conf: conf, confWord: confWord, signals: sig, wetness: wetness };
}

function renderVerdict() {
  const v = state.verdict;
  if (!v || !ui.fcHead) return;
  setValue(ui.fcHead, v.head);
  ui.fcBody.textContent = v.body;
  ui.fcConfBar.style.width = v.conf + "%";
  ui.fcConfText.textContent = "уверенность " + v.conf + "% · " + v.confWord;
  ui.fcSignals.innerHTML = v.signals.map((s) =>
    '<div class="fc-sig' + (s.weak ? " weak" : "") + '">' +
    '<div class="sk">' + s.k + '</div><div class="sv">' + s.v + '</div>' +
    (s.n ? '<div class="sn">' + s.n + '</div>' : '') + '</div>').join("");
}

/* =====================================================================
   9. СПРАЙТ
   ===================================================================== */
function spriteFromState() {
  // гроза показывается только если она подтверждена
  if (state.stormConfirmed) return "storm";
  if (has(state.pm25) && state.pm25 > 55) return "airmask";
  if (state.temp >= 35) return "heat";
  if (state.temp <= 8) return "cold";

  const bucket = weatherCodeBucket(state.weatherCode);
  if (bucket === "storm") return "storm";
  if (bucket === "rain" || state.rainChance >= 55) return "rain";
  if (state.humidity >= 80 && state.pressure < 1005) return "cloudy";
  if (has(state.cloudIndex) && !CONFIG.STATION_INDOORS && state.cloudIndex > 0.6) return "cloudy";
  if (state.humidity >= 70) return "cloudy";
  if (state.humidity <= 25 && state.temp >= 28) return "dry";
  if (bucket === "cloudy" && state.temp < 25) return "cloudy";
  if (state.temp >= 25) return "sun";
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

/* =====================================================================
   10. ГРАФИКИ
   ===================================================================== */
function buildSparklineSVG(values, opts) {
  opts = opts || {};
  const clean = values.filter(Number.isFinite);
  if (clean.length < 2) return null;
  const lo = opts.min != null ? opts.min : Math.min.apply(null, clean);
  const hi = opts.max != null ? opts.max : Math.max.apply(null, clean);
  const span = hi - lo || 1;
  const w = 100, h = 30, pad = 3;

  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const n = Number.isFinite(v) ? (v - lo) / span : 0.5;
    return [x, h - pad - n * (h - pad * 2)];
  });
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");

  return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
    '<defs><linearGradient id="miniChartFade" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="var(--accent-2)" stop-opacity="0.55"/>' +
    '<stop offset="100%" stop-color="var(--accent-2)" stop-opacity="0"/></linearGradient></defs>' +
    '<path class="mini-chart-area" d="' + line + ' L' + w + ',' + h + ' L0,' + h + ' Z"/>' +
    '<path class="mini-chart-line" d="' + line + '"/></svg>';
}

function renderMiniChart(wrap, values, opts) {
  if (!wrap) return;
  wrap.innerHTML = buildSparklineSVG(values, opts) || '<span class="chart-note">История ещё не накоплена</span>';
}

function renderPressureTrend() {
  if (!ui.trendChart) return;
  const values = state.history.map((r) => r.press).filter(Number.isFinite);
  if (values.length < 2) {
    ui.trendChart.innerHTML = '<span class="chart-note">История ещё не накоплена</span>';
    return;
  }
  const size = Math.ceil(values.length / 8);
  const bars = [];
  for (let i = 0; i < values.length; i += size) {
    const part = values.slice(i, i + size);
    bars.push(part.reduce((a, b) => a + b, 0) / part.length);
  }
  const lo = Math.min.apply(null, bars), hi = Math.max.apply(null, bars), span = hi - lo || 1;
  ui.trendChart.innerHTML = bars.map((v) =>
    '<span style="--h: ' + (14 + ((v - lo) / span) * 76).toFixed(1) + '%"></span>').join("");
}

function renderCharts() {
  const rows = state.history;
  renderMiniChart(ui.tempChartWrap, rows.map((r) => r.temp));
  renderMiniChart(ui.humidityChartWrap, rows.map((r) => r.hum), { min: 0, max: 100 });
  renderMiniChart(ui.airChartWrap, rows.map((r) => r.pm25), { min: 0 });
  renderMiniChart(ui.rainChartWrap, rows.map((r) => r.press));
  renderPressureTrend();
}

/* =====================================================================
   11. ОТРИСОВКА
   ===================================================================== */
function renderForecast() {
  if (!ui.forecastGrid) return;
  const items = state.forecast && state.forecast.length
    ? state.forecast
    : ["—", "—", "—", "—", "—"].map((t) => ({ time: t, temp: null, rain: null }));

  ui.forecastGrid.innerHTML = items.map((it) => {
    const ok = it.temp != null && it.rain != null;
    const icon = ok && it.rain >= 20 ? "images/icon_rain.png" : "images/icon_time.png";
    return '<article class="forecast-card">' +
      '<img src="' + icon + '" alt="" class="forecast-icon" aria-hidden="true"/>' +
      '<div class="forecast-time">' + it.time + '</div>' +
      '<div class="forecast-temp">' + (ok ? it.temp + "°" : "—") + '</div>' +
      '<div class="forecast-label">' + (ok ? it.rain + "%" : "нет данных") + '</div></article>';
  }).join("");
}

function sensorCard(name, value, status, note) {
  const col = { ok: "ok-col", warn: "warn-col", bad: "bad-col", off: "off-col" }[status] || "off-col";
  const word = { ok: "норма", warn: "внимание", bad: "проблема", off: "нет данных" }[status] || "нет данных";
  return '<div class="sensor"><div class="s-top"><span class="s-name">' + name + '</span>' +
    '<span class="s-chip ' + col + '">' + word + '</span></div>' +
    '<div class="s-val">' + value + '</div>' +
    (note ? '<div class="s-note">' + note + '</div>' : '') + '</div>';
}

function renderSensors() {
  if (!ui.sensorGrid) return;
  const dp = dewPoint(state.temp, state.humidity);
  const cards = [];

  cards.push(sensorCard("BME680 · температура", has(state.temp) ? state.temp.toFixed(1) + " °C" : "—",
    state.online ? "ok" : "off", has(dp) ? "точка росы " + dp + "°" : ""));

  cards.push(sensorCard("BME680 · влажность", Math.round(state.humidity) + " %",
    state.online ? "ok" : "off", humidityMoodFrom(state.humidity)));

  cards.push(sensorCard("BME680 · давление", state.pressure.toFixed(1) + " гПа",
    state.online ? "ok" : "off",
    "на высоте станции " + state.pressureRaw.toFixed(1) + " гПа, приведено к уровню моря"));

  cards.push(sensorCard("BME680 · газ", state.gasKOhm ? state.gasKOhm + " кОм" : "—",
    state.gasKOhm ? "ok" : "off", "чем выше сопротивление, тем чище воздух; важно изменение, не само число"));

  const pmStatus = !has(state.pm25) ? "off" : state.pm25 > 55 ? "bad" : state.pm25 > 35 ? "warn" : "ok";
  cards.push(sensorCard("PMS5003 · частицы",
    has(state.pm25) ? "PM2.5 " + state.pm25 + " · PM10 " + (has(state.pm10) ? state.pm10 : "—") : "—",
    pmStatus, "опрашивается раз в 5 минут с прогревом вентилятора"));

  cards.push(sensorCard("BH1750 · освещённость", has(state.lux) ? state.lux + " лк" : "—",
    has(state.lux) ? "ok" : "off",
    CONFIG.STATION_INDOORS ? "станция в помещении — показания не отражают уличный свет"
      : has(state.sunElevation) ? "солнце " + Math.round(state.sunElevation) + "° над горизонтом" : ""));

  const uvStatus = !has(state.uv) ? "off" : state.uv >= 8 ? "bad" : state.uv >= 3 ? "warn" : "ok";
  cards.push(sensorCard("LTR390 · ультрафиолет", has(state.uv) ? "индекс " + state.uv : "—",
    uvStatus, "значение приблизительное, датчик не сертифицирован"));

  const asStatus = state.stormConfirmed ? "bad" : state.strikes30 > 0 ? "warn" : "ok";
  cards.push(sensorCard("AS3935 · молнии",
    state.strikes30 > 0 ? state.strikes30 + " срабатыв. за 30 мин" : "разрядов нет",
    asStatus,
    state.stormConfirmed ? "гроза подтверждена другими признаками"
      : state.strikes30 > 0 ? "не подтверждено — вероятно помеха от электроники"
      : "помех отсеяно: " + state.disturbers));

  cards.push(sensorCard("Микрофон · гром", has(state.micBaseline) ? "фон " + state.micBaseline : "—",
    has(state.micBaseline) ? "ok" : "off", "слушает раскат после вспышки молнии"));

  cards.push(sensorCard("Ветер", "датчика нет", "off", "место в базе зарезервировано"));

  ui.sensorGrid.innerHTML = cards.join("");

  if (ui.sysRows) {
    const rssiWord = !has(state.rssi) ? "—" : state.rssi >= -55 ? "отличный" : state.rssi >= -65 ? "хороший"
      : state.rssi >= -75 ? "средний" : state.rssi >= -85 ? "слабый" : "очень слабый";
    const rows = [
      ["Связь со станцией", state.online ? "на связи" : "нет связи"],
      ["Последние данные", formatRelativeUpdate(state.lastUpdatedAt)],
      ["Сигнал Wi-Fi", has(state.rssi) ? state.rssi + " дБм · " + rssiWord : "—"],
      ["Свободная память", has(state.freeHeap) ? Math.round(state.freeHeap / 1024) + " КБ" : "—"],
      ["Время без перезагрузки", durWords(state.uptimeS)],
      ["Высота над морем", CONFIG.ALTITUDE_M + " м"],
    ];
    ui.sysRows.innerHTML = rows.map((r) =>
      '<div class="sys-row"><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>').join("");
  }

  if (ui.sysNote) {
    ui.sysNote.textContent = CONFIG.STATION_INDOORS
      ? "Станция сейчас в помещении. Датчик света видит комнату, а не небо, и датчик молний ловит помехи от электроники — поэтому сайт не строит на них выводы. Когда станция переедет на крышу, поменяй STATION_INDOORS на false в начале script.js, и оба датчика подключатся к прогнозу."
      : "Станция работает на улице. Все датчики участвуют в прогнозе.";
  }
}

function renderState() {
  if (!ui.tempText) return;
  ui.locationText.textContent = state.location;
  setValue(ui.skyText, state.skyLabel);
  setValue(ui.tempText, state.temp.toFixed(1) + "°C");
  setValue(ui.humidityText, Math.round(state.humidity) + "%");
  setValue(ui.pressureText, state.pressure.toFixed(1) + " hPa");
  setValue(ui.airText, state.airLabel);
  setValue(ui.rainText, Math.round(state.rainChance) + "%");

  if (has(state.windForecast)) {
    setValue(ui.windText, state.windForecast.toFixed(1) + " м/с");
    ui.windMood.textContent = "По прогнозу, датчика нет";
  } else {
    setValue(ui.windText, "Нет датчика");
    ui.windMood.textContent = "Не установлен";
  }

  const dp = dewPoint(state.temp, state.humidity);
  ui.tempMood.textContent = state.tempMood;
  ui.humidityMood.textContent = dp !== null ? state.humidityMood + " · точка росы " + dp + "°" : state.humidityMood;
  ui.pressureMood.textContent = has(state.pressureTrend3h)
    ? state.pressureMood + " · за 3ч " + (state.pressureTrend3h > 0 ? "+" : "") + state.pressureTrend3h
    : state.pressureMood;
  ui.airMood.textContent = state.airMood;
  ui.rainMood.textContent = state.rainMood;

  ui.statusBadge.textContent = state.statusLabel;
  if (ui.trendText) {
    ui.trendText.textContent = !has(state.pressureTrend3h) ? "Нет данных"
      : state.pressureTrend3h <= -2 ? "Быстро падает" : state.pressureTrend3h <= -1 ? "Падает"
      : state.pressureTrend3h >= 2 ? "Быстро растёт" : state.pressureTrend3h >= 1 ? "Растёт" : "Стабильно";
  }

  const src = spriteMap[state.sprite] || spriteMap.perfect;
  const cur = ui.vaultboySprite.getAttribute("src") || "";
  if (!cur.endsWith(src)) {
    ui.vaultboySprite.src = src;
    ui.vaultboySprite.alt = "Vault Boy: " + state.sprite;
  }

  renderLastUpdate();
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

function setTab(name) {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".pane").forEach((p) => p.classList.toggle("active", p.dataset.pane === name));
  const scr = document.querySelector(".screen");
  if (scr) { scr.classList.remove("glitch"); void scr.offsetWidth; scr.classList.add("glitch"); }
  if (name === "logs") renderSensors();
  if (name === "weather") { buildVerdict(); renderVerdict(); }
}

function lightningFlash() {
  const f = $("crtFlash");
  if (!f) return;
  f.classList.remove("fire"); void f.offsetWidth; f.classList.add("fire");
  Snd.blip(180, 220, 0.05);
}

/* =====================================================================
   12. КЭШ
   ===================================================================== */
function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      state: Object.assign({}, state, { sunrise: null, sunset: null, verdict: null }),
      savedAt: Date.now(),
    }));
  } catch (e) {}
}

function loadCache() {
  try { const r = localStorage.getItem(CACHE_KEY); return r ? JSON.parse(r) : null; }
  catch (e) { return null; }
}

function applyCachedSnapshot(snap) {
  if (!snap || !snap.state) return;
  Object.assign(state, snap.state, { online: false, sunrise: null, sunset: null, verdict: null });
  if (!Array.isArray(state.history)) state.history = [];
}

/* =====================================================================
   13. ДАННЫЕ
   ===================================================================== */
async function apiGet(path) {
  const r = await fetch(CONFIG.API_BASE + path, { cache: "no-store" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

function recompute() {
  state.sunElevation = solarElevation(CONFIG.LAT, CONFIG.LON, new Date());
  state.cloudIndex = CONFIG.STATION_INDOORS ? null : cloudIndexFromLux(state.lux, state.sunElevation);

  state.tempMood = tempMoodFrom(state.temp);
  state.humidityMood = humidityMoodFrom(state.humidity);
  state.pressureMood = pressureMoodFrom(state.pressure);
  state.airLabel = airLabelFromPm(state.pm25);
  state.airMood = airMoodFromPm(state.pm25);
  state.rainText = rainLabelFrom(state.rainChance);
  state.rainMood = state.rainChance >= 45 ? "Вероятен" : state.rainChance >= 20 ? "Возможен" : "Маловероятен";

  evaluateStorm();
  state.sprite = spriteFromState();
  state.skyLabel = skyLabelFromSprite(state.sprite);
  state.statusLabel = statusLabelFromSprite(state.sprite);

  buildVerdict();
}

function renderAll() {
  renderState();
  renderVerdict();
  renderCharts();
  const active = document.querySelector('.pane.active');
  if (active && active.dataset.pane === "logs") renderSensors();
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
    state.pressure = safeNumber(has(w.pressure_sea_hpa) ? w.pressure_sea_hpa : w.pressure_hpa, state.pressure);
    state.pressureRaw = safeNumber(w.pressure_hpa, state.pressureRaw);
    state.lux = has(w.lux) ? w.lux : null;
    state.uv = has(w.uv_index) ? w.uv_index : null;

    state.pm1 = has(a.pm1_ugm3) ? a.pm1_ugm3 : null;
    state.pm25 = has(a.pm25_ugm3) ? a.pm25_ugm3 : null;
    state.pm10 = has(a.pm10_ugm3) ? a.pm10_ugm3 : null;
    state.gasKOhm = has(a.gas_ohm) ? Math.round(a.gas_ohm / 1000) : 0;

    state.lightningDistance = has(l.last_distance_km) ? l.last_distance_km : null;
    state.lightningAgeS = has(l.last_age_s) ? l.last_age_s : null;
    state.lightningCount = safeNumber(l.strikes, 0);
    state.disturbers = safeNumber(l.disturbers, 0);
    state.strikes30 = trackStrikes(state.lightningCount);

    state.rssi = has(dev.rssi_dbm) ? dev.rssi_dbm : null;
    state.freeHeap = has(dev.free_heap) ? dev.free_heap : null;
    state.uptimeS = has(dev.uptime_s) ? dev.uptime_s : null;
    state.micBaseline = d.raw && has(d.raw.mic_baseline) ? d.raw.mic_baseline : null;

    if (!state.rainFromForecast) {
      // запасная оценка, пока нет прогноза: правило барометра
      const z = zambretti(state.pressure, state.pressureTrend3h);
      state.rainChance = z ? Math.round(z.wet * 100) : 0;
    }
    if (state.online) state.lastUpdatedAt = Date.now();

    const wasStorm = state.stormConfirmed;
    recompute();
    if (!wasStorm && state.stormConfirmed) lightningFlash();

    renderAll();
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
      if (!map.has(ts)) map.set(ts, { ts: ts });
      map.get(ts)[key] = v;
    });
    put("temperature_c", "temp");
    put("humidity_pct", "hum");
    put("pressure_hpa", "press");
    put("pm25_ugm3", "pm25");

    state.history = Array.from(map.values()).sort((a, b) => a.ts - b.ts);

    const at3h = (key, current) => {
      const target = Date.now() - 3 * 3600 * 1000;
      let best = null, bd = Infinity;
      for (const r of state.history) {
        if (!Number.isFinite(r[key])) continue;
        const diff = Math.abs(r.ts - target);
        if (diff < bd) { bd = diff; best = r[key]; }
      }
      return best !== null && Number.isFinite(current) ? Math.round((current - best) * 10) / 10 : null;
    };

    state.pressureTrend3h = at3h("press", state.pressureRaw);
    state.tempTrend3h = at3h("temp", state.temp);
    state.humTrend3h = at3h("hum", state.humidity);

    recompute();
    renderAll();
    saveCache();
  } catch (err) {
    console.warn("История недоступна:", err);
  }
}

async function refreshOpenMeteo() {
  try {
    const url = "https://api.open-meteo.com/v1/forecast?latitude=" + CONFIG.LAT + "&longitude=" + CONFIG.LON +
      "&current=temperature_2m,weathercode,windspeed_10m,precipitation_probability" +
      "&hourly=temperature_2m,precipitation_probability&daily=sunrise,sunset" +
      "&timezone=" + encodeURIComponent(CONFIG.TIMEZONE) + "&forecast_days=2";

    const res = await fetch(url);
    if (!res.ok) throw new Error("Open-Meteo HTTP " + res.status);
    const data = await res.json();

    if (data.current) {
      state.weatherCode = safeNumber(data.current.weathercode, state.weatherCode);
      const ws = data.current.windspeed_10m;
      if (Number.isFinite(ws)) state.windForecast = ws / 3.6;
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
    renderAll();
    saveCache();
  } catch (err) {
    console.warn("Open-Meteo недоступен, оставляю прежние данные:", err);
  }
}

/* =====================================================================
   14. СТАРТОВЫЙ ЭКРАН И ЗАГРУЗКА
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
    Snd.blip(1250 + li * 60, 26, 0.028);
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
   15. ЗАПУСК
   ===================================================================== */
injectStyles();
addCrtLayers();
rebuildPanes();
captureUI();
Snd.prepare();

const bootEl = $("bootScreen");
if (bootEl) bootEl.style.display = "none";

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => { setTab(btn.dataset.tab); Snd.play("tab"); });
});

applyCachedSnapshot(loadCache());
recompute();
renderAll();
renderForecast();
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

if (window.Telegram && window.Telegram.WebApp) {
  try { window.Telegram.WebApp.ready(); window.Telegram.WebApp.expand(); } catch (e) {}
}
