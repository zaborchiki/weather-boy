/* =====================================================================
   WEATHER-BOY MK1 — логика сайта
   Данные берутся с домашнего сервера (InfluxDB через backend /api)
   и дополняются прогнозом Open-Meteo.
   ===================================================================== */
 
const CONFIG = {
  // Сайт раздаётся тем же сервером, что и API, поэтому адрес относительный.
  // Если открыть файл напрямую (file://), подставится резервный адрес.
  API_BASE: location.protocol.startsWith("http")
    ? location.origin + "/api"
    : "http://192.168.1.40:3001/api",
 
  LOCATION: "SANT'ANGELO DI OGLIARA",
 
  // Sant'Angelo di Ogliara, Salerno. Высота станции 257 м.
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
 
const CACHE_KEY = "weatherboy_cache_v2";
 
const state = {
  online: false,
  location: CONFIG.LOCATION,
  timestamp: "--",
  temp: 0,
  humidity: 0,
  pressure: 0,      // приведённое к уровню моря — его показываем
  pressureRaw: 0,   // на высоте станции
  gasKOhm: 0,
  pm1: null, pm25: null, pm10: null,
  uv: null, lux: null,
  lightningDistance: null,
  lightningAgeS: null,
  lightningCount: 0,
  rssi: null, freeHeap: null, uptimeS: null,
 
  wind: null,          // ветра на станции нет — поле остаётся пустым
  windForecast: null,  // ветер из прогноза, показываем отдельно и честно
 
  rainChance: 0,
  rainText: "дождя не ожидается",
  sprite: "perfect",
  skyLabel: "СТАБИЛЬНО",
  statusLabel: "СТАБИЛЬНО",
  tempMood: "-",
  humidityMood: "-",
  pressureMood: "-",
  airLabel: "-",
  airMood: "-",
  rainMood: "-",
  windMood: "Датчика нет",
  forecast: [],
  logs: [],
 
  history: [],
  pressureTrend3h: null,
  lastUpdatedAt: null,
  weatherCode: null,
  sunrise: null,
  sunset: null,
  lastOpenMeteoAt: null,
  sunDate: null,
};
 
const $ = (id) => document.getElementById(id);
 
const ui = {
  dateText: $("dateText"),
  timeText: $("timeText"),
  lastUpdateText: $("lastUpdateText"),
  lastUpdateChip: $("lastUpdateChip"),
  locationText: $("locationText"),
  skyText: $("skyText"),
  tempText: $("tempText"),
  humidityText: $("humidityText"),
  pressureText: $("pressureText"),
  airText: $("airText"),
  rainText: $("rainText"),
  windText: $("windText"),
  tempMood: $("tempMood"),
  humidityMood: $("humidityMood"),
  pressureMood: $("pressureMood"),
  airMood: $("airMood"),
  rainMood: $("rainMood"),
  windMood: $("windMood"),
  statusBadge: $("statusBadge"),
  trendText: $("trendText"),
  trendChart: $("trendChart"),
  vaultboySprite: $("vaultboySprite"),
  forecastGrid: $("forecastGrid"),
  logsList: $("logsList"),
  tempChartWrap: $("tempChartWrap"),
  humidityChartWrap: $("humidityChartWrap"),
  airChartWrap: $("airChartWrap"),
  rainChartWrap: $("rainChartWrap"),
};
 
const spriteMap = {
  perfect: "images/vaultboy_perfect.png",
  sun: "images/vaultboy_sun.png",
  cloudy: "images/vaultboy_cloudy.png",
  rain: "images/vaultboy_rain.png",
  storm: "images/vaultboy_storm.png",
  heat: "images/vaultboy_heat.png",
  cold: "images/vaultboy_cold.png",
  dry: "images/vaultboy_dry.png",
  wind: "images/vaultboy_wind.png",
  airmask: "images/vaultboy_airmask.png",
};
 
/* =====================================================================
   ЗВУК
   Было две ошибки:
   1) разблокировка висела на document и срабатывала ПОСЛЕ обработчика
      кнопки, поэтому первый клик по вкладке всегда был беззвучным;
   2) звук загрузки требовал разблокировки, а кликнуть за 1.3 секунды
      загрузки невозможно — он не играл никогда.
   Теперь: разблокировка на pointerdown (срабатывает раньше click),
   а звук загрузки ставится в очередь и играет при первом касании.
   ===================================================================== */
const Snd = {
  boot: null,
  tab: null,
  unlocked: false,
  pending: null,
  broken: false,
 
  setup() {
    try {
      this.boot = new Audio("sounds/pipboy_boot.mp3");
      this.tab = new Audio("sounds/pipboy_tab.mp3");
      this.boot.volume = 0.5;
      this.tab.volume = 0.4;
      this.boot.preload = "auto";
      this.tab.preload = "auto";
      // Если файлов нет — просто выключаем звук, сайт от этого не ломается.
      this.boot.addEventListener("error", () => { this.broken = true; });
      this.tab.addEventListener("error", () => { this.broken = true; });
    } catch (e) {
      this.broken = true;
    }
 
    const unlock = () => {
      if (this.unlocked || this.broken) return;
      this.unlocked = true;
      // Браузер разрешает звук только внутри жеста пользователя.
      // «Прогреваем» оба файла: запускаем и сразу останавливаем.
      [this.boot, this.tab].forEach((a) => {
        if (!a) return;
        const p = a.play();
        if (p && p.then) p.then(() => { a.pause(); a.currentTime = 0; }).catch(() => {});
      });
      if (this.pending) {
        const name = this.pending;
        this.pending = null;
        setTimeout(() => this.play(name), 60);
      }
    };
 
    // pointerdown идёт раньше click, поэтому первый клик по вкладке уже со звуком
    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("touchstart", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
  },
 
  play(name) {
    if (this.broken) return;
    const a = this[name];
    if (!a) return;
    if (!this.unlocked) {
      if (name === "boot") this.pending = "boot";
      return;
    }
    try {
      a.currentTime = 0;
      const p = a.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  },
};
 
/* =====================================================================
   ПОМОЩНИКИ
   ===================================================================== */
function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
const has = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));
 
function isNightTime() {
  if (state.sunrise instanceof Date && state.sunset instanceof Date) {
    const now = new Date();
    return now < state.sunrise || now > state.sunset;
  }
  const hour = new Date().getHours();
  return hour >= 21 || hour < 6;
}
 
function timeNowRome() {
  const now = new Date();
  const time = new Intl.DateTimeFormat("it-IT", {
    timeZone: CONFIG.TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(now);
  const date = new Intl.DateTimeFormat("ru-RU", {
    timeZone: CONFIG.TIMEZONE, day: "2-digit", month: "2-digit", year: "numeric",
  }).format(now);
  return { time, date };
}
 
function updateClock() {
  const { time, date } = timeNowRome();
  ui.timeText.textContent = time;
  ui.dateText.textContent = date;
}
 
function tempMoodFrom(t) {
  if (t >= 35) return "Жарко";
  if (t >= 25) return "Тепло";
  if (t <= 8) return "Холодно";
  if (t <= 18) return "Прохладно";
  return "Комфортно";
}
 
function humidityMoodFrom(h) {
  if (h >= 70) return "Влажно";
  if (h >= 45) return "Комфортно";
  return "Суховато";
}
 
// Давление приведено к уровню моря, поэтому пороги стандартные.
function pressureMoodFrom(p) {
  if (p < 1005) return "Низкое";
  if (p < 1020) return "Нормальное";
  return "Высокое";
}
 
// Точка росы — честный показатель того, как влажность ощущается телом.
function dewPoint(t, rh) {
  if (!has(t) || !has(rh) || rh <= 0) return null;
  const a = 17.27, b = 237.7;
  const g = (a * t) / (b + t) + Math.log(rh / 100);
  return Math.round(((b * g) / (a - g)) * 10) / 10;
}
 
/* Качество воздуха теперь считается по PM2.5 — это и есть датчик пыли.
   Раньше здесь был газовый датчик, но пороги были написаны для килоом,
   а значение приходило в омах, поэтому всегда выходило «ОТЛИЧНОЕ». */
function airLabelFromPm(pm25) {
  if (!has(pm25)) return "НЕТ ДАННЫХ";
  if (pm25 <= 12) return "ХОРОШЕЕ";
  if (pm25 <= 35) return "СРЕДНЕЕ";
  if (pm25 <= 55) return "ПЛОХОЕ";
  return "ОПАСНОЕ";
}
 
function airMoodFromPm(pm25) {
  if (!has(pm25)) return "Датчик молчит";
  if (pm25 <= 12) return "Чисто";
  if (pm25 <= 35) return "Приемлемо";
  if (pm25 <= 55) return "Вредно для чувствительных";
  return "Лучше не выходить";
}
 
function rainLabelFrom(chance) {
  if (chance <= 8) return "дождя не ожидается";
  if (chance <= 20) return "маловероятен";
  if (chance <= 45) return "возможен";
  if (chance <= 70) return "вероятен";
  return "высокая вероятность";
}
 
function weatherCodeBucket(code) {
  if (code == null) return null;
  const c = Number(code);
  if (!Number.isFinite(c)) return null;
  if (c === 0 || c === 1 || c === 2) return "clear";
  if (c === 3 || c === 45 || c === 48) return "cloudy";
  if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(c)) return "rain";
  if ([71,73,75,77,85,86].includes(c)) return "rain";
  if ([95,96,99].includes(c)) return "storm";
  return null;
}
 
function spriteFromValues(temp, hum, press, pm25, rainChance, codeBucket, lightningFresh) {
  if (lightningFresh) return "storm";
  if (has(pm25) && pm25 > 55) return "airmask";
  if (temp >= 35) return "heat";
  if (temp <= 8) return "cold";
  if (codeBucket === "storm" || rainChance >= 70) return "storm";
  if (codeBucket === "rain" || rainChance >= 55) return "rain";
  if (hum >= 80 && press < 1005) return "cloudy";
  if (hum >= 70) return "cloudy";
  if (hum <= 25 && temp >= 28) return "dry";
  if (codeBucket === "cloudy" && temp < 25) return "cloudy";
  if (temp >= 25) return "sun";
  if (codeBucket === "clear") return "sun";
  return "perfect";
}
 
function skyLabelFromSprite(sprite) {
  const night = isNightTime();
  switch (sprite) {
    case "sun": return night ? "ЯСНАЯ НОЧЬ" : "СОЛНЕЧНО";
    case "cloudy": return "ОБЛАЧНО";
    case "rain": return "ДОЖДЬ";
    case "storm": return "ГРОЗА";
    case "heat": return "ЖАРА";
    case "cold": return "ХОЛОД";
    case "dry": return "СУХО";
    case "wind": return "ВЕТЕР";
    case "airmask": return "ПЛОХОЙ ВОЗДУХ";
    default: return night ? "ЯСНАЯ НОЧЬ" : "СТАБИЛЬНО";
  }
}
 
function statusLabelFromSprite(sprite) {
  switch (sprite) {
    case "airmask": return "ВОЗДУХ";
    case "heat": return "ЖАРА";
    case "cold": return "ХОЛОД";
    case "dry": return "СУХО";
    case "storm": return "ГРОЗА";
    case "rain": return "ДОЖДЬ";
    default: return "СТАБИЛЬНО";
  }
}
 
/* Оценка дождя по своим датчикам — запасной вариант, если прогноз
   недоступен. Работает по классическому правилу барометра:
   низкое и падающее давление плюс высокая влажность = к осадкам. */
function rainChanceFrom(hum, press, trend3h) {
  let score = 0;
  if (hum >= 90) score += 35;
  else if (hum >= 85) score += 25;
  else if (hum >= 80) score += 15;
  else if (hum >= 70) score += 5;
 
  if (press <= 1000) score += 30;
  else if (press <= 1008) score += 18;
  else if (press <= 1013) score += 8;
 
  if (has(trend3h)) {
    if (trend3h <= -2) score += 25;
    else if (trend3h <= -1) score += 12;
    else if (trend3h >= 2) score -= 15;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}
 
function trendWord(d) {
  if (!has(d)) return "Нет данных";
  if (d <= -2) return "Быстро падает";
  if (d <= -1) return "Падает";
  if (d >= 2) return "Быстро растёт";
  if (d >= 1) return "Растёт";
  return "Стабильно";
}
 
function formatRelativeUpdate(ms) {
  if (!ms) return "нет данных";
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 20) return "только что";
  if (s < 60) return `${s} сек назад`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} мин назад`;
  return `${Math.round(m / 60)} ч назад`;
}
 
function durWords(s) {
  if (!has(s)) return "—";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d) return `${d} д ${h} ч`;
  if (h) return `${h} ч ${m} мин`;
  return `${m} мин`;
}
 
/* =====================================================================
   ГРАФИКИ
   ===================================================================== */
function buildSparklineSVG(values, { min = null, max = null } = {}) {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return null;
 
  const lo = min != null ? min : Math.min(...clean);
  const hi = max != null ? max : Math.max(...clean);
  const span = hi - lo || 1;
  const w = 100, h = 30, pad = 3;
 
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const norm = Number.isFinite(v) ? (v - lo) / span : 0.5;
    return [x, h - pad - norm * (h - pad * 2)];
  });
 
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
 
  return `
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="miniChartFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent-2)" stop-opacity="0.55" />
          <stop offset="100%" stop-color="var(--accent-2)" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path class="mini-chart-area" d="${area}" />
      <path class="mini-chart-line" d="${line}" />
    </svg>`;
}
 
function renderMiniChart(wrapEl, values, opts) {
  if (!wrapEl) return;
  const svg = buildSparklineSVG(values, opts);
  wrapEl.innerHTML = svg || `<span class="chart-note">История ещё не накоплена</span>`;
}
 
function renderPressureTrend() {
  if (!ui.trendChart) return;
  const values = state.history.map((r) => r.press).filter(Number.isFinite);
 
  if (values.length < 2) {
    ui.trendChart.innerHTML = `<span class="chart-note">История ещё не накоплена</span>`;
    return;
  }
 
  // 8 столбиков: усредняем историю в 8 корзин
  const buckets = 8;
  const size = Math.ceil(values.length / buckets);
  const bars = [];
  for (let i = 0; i < values.length; i += size) {
    const part = values.slice(i, i + size);
    bars.push(part.reduce((a, b) => a + b, 0) / part.length);
  }
 
  const lo = Math.min(...bars), hi = Math.max(...bars);
  const span = hi - lo || 1;
  ui.trendChart.innerHTML = bars
    .map((v) => `<span style="--h: ${(12 + ((v - lo) / span) * 78).toFixed(1)}%"></span>`)
    .join("");
}
 
function renderCharts() {
  const rows = state.history;
  renderMiniChart(ui.tempChartWrap, rows.map((r) => r.temp));
  renderMiniChart(ui.humidityChartWrap, rows.map((r) => r.hum), { min: 0, max: 100 });
  renderMiniChart(ui.airChartWrap, rows.map((r) => r.pm25), { min: 0 });
  renderMiniChart(
    ui.rainChartWrap,
    rows.map((r) => (Number.isFinite(r.hum) && Number.isFinite(r.press) ? rainChanceFrom(r.hum, r.press, null) : null)),
    { min: 0, max: 100 }
  );
  renderPressureTrend();
}
 
/* =====================================================================
   ОТРИСОВКА
   ===================================================================== */
function renderForecast() {
  const items = state.forecast?.length
    ? state.forecast
    : ["21:00", "00:00", "03:00", "06:00", "09:00"].map((time) => ({ time, temp: null, rain: null }));
 
  ui.forecastGrid.innerHTML = items.map((item) => {
    const ok = item.temp != null && item.rain != null;
    const icon = ok && item.rain >= 20 ? "images/icon_rain.png" : "images/icon_time.png";
    return `
      <article class="forecast-card">
        <img src="${icon}" alt="" class="forecast-icon" aria-hidden="true" />
        <div class="forecast-time">${item.time}</div>
        <div class="forecast-temp">${ok ? item.temp + "°" : "—"}</div>
        <div class="forecast-label">${ok ? item.rain + "%" : "нет данных"}</div>
      </article>`;
  }).join("");
}
 
/* Лента событий собирается из реальных данных станции. */
function buildLogs() {
  const out = [];
  const t = (n) => new Intl.DateTimeFormat("it-IT", {
    timeZone: CONFIG.TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(Date.now() - n * 1000));
 
  if (state.online) {
    out.push({ icon: "icon_status.png", title: "Станция на связи",
               meta: `${t(0)} — данные ${formatRelativeUpdate(state.lastUpdatedAt)}` });
  } else {
    out.push({ icon: "icon_status.png", title: "Станция не отвечает",
               meta: `последние данные ${formatRelativeUpdate(state.lastUpdatedAt)}` });
  }
 
  if (has(state.lightningAgeS) && state.lightningAgeS < 3600) {
    out.push({ icon: "icon_status.png", title: "Зафиксирована молния",
               meta: `${t(state.lightningAgeS)} — ${has(state.lightningDistance) ? state.lightningDistance + " км" : "расстояние неизвестно"}` });
  }
 
  if (has(state.pressureTrend3h)) {
    const d = state.pressureTrend3h;
    out.push({ icon: "icon_pressure.png",
               title: d <= -1 ? "Давление падает" : d >= 1 ? "Давление растёт" : "Давление стабильно",
               meta: `за 3 часа ${d > 0 ? "+" : ""}${d} гПа — ${state.pressure.toFixed(1)} гПа` });
  }
 
  const temps = state.history.map((r) => r.temp).filter(Number.isFinite);
  if (temps.length > 2) {
    out.push({ icon: "icon_temp.png", title: "Сутки по температуре",
               meta: `от ${Math.min(...temps).toFixed(1)}° до ${Math.max(...temps).toFixed(1)}°` });
  }
 
  out.push({ icon: "icon_air.png", title: `Воздух: ${state.airLabel.toLowerCase()}`,
             meta: has(state.pm25) ? `PM2.5 ${state.pm25} мкг/м³, PM10 ${state.pm10 ?? "—"}` : "датчик пыли молчит" });
 
  if (has(state.rssi) && state.rssi < -80) {
    out.push({ icon: "icon_status.png", title: "Слабый сигнал Wi-Fi",
               meta: `${state.rssi} дБм — возможны пропуски в данных` });
  }
 
  if (has(state.uptimeS)) {
    out.push({ icon: "icon_status.png", title: "Время работы",
               meta: `${durWords(state.uptimeS)} без перезагрузки` });
  }
 
  return out;
}
 
function renderLogs() {
  const items = state.logs?.length ? state.logs : buildLogs();
  ui.logsList.innerHTML = items.map((log) => `
    <article class="log-item">
      <img src="images/${log.icon}" alt="" class="log-icon" aria-hidden="true" />
      <div class="log-body">
        <div class="log-title">${log.title}</div>
        <div class="log-meta">${log.meta}</div>
      </div>
    </article>`).join("");
}
 
function renderLastUpdate() {
  if (!ui.lastUpdateText) return;
  ui.lastUpdateText.textContent = formatRelativeUpdate(state.lastUpdatedAt);
  const stale = !state.lastUpdatedAt || (Date.now() - state.lastUpdatedAt) > INTERVALS.station * 4;
  if (ui.lastUpdateChip) ui.lastUpdateChip.classList.toggle("is-stale", stale);
}
 
function renderState() {
  ui.locationText.textContent = state.location;
  ui.skyText.textContent = state.skyLabel;
  ui.tempText.textContent = `${state.temp.toFixed(1)}°C`;
  ui.humidityText.textContent = `${Math.round(state.humidity)}%`;
  ui.pressureText.textContent = `${state.pressure.toFixed(1)} hPa`;
  ui.airText.textContent = state.airLabel;
  ui.rainText.textContent = `${Math.round(state.rainChance)}%`;
 
  // Ветра на станции нет. Показываем прогнозный и честно это подписываем.
  if (has(state.windForecast)) {
    ui.windText.textContent = `${state.windForecast.toFixed(1)} м/с`;
    ui.windMood.textContent = "По прогнозу, датчика нет";
  } else {
    ui.windText.textContent = "Нет датчика";
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
 
  ui.vaultboySprite.src = spriteMap[state.sprite] || spriteMap.perfect;
  ui.vaultboySprite.alt = `Vault Boy: ${state.sprite}`;
 
  renderLastUpdate();
}
 
function setTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tabName));
  document.querySelectorAll(".pane").forEach((p) => p.classList.toggle("active", p.dataset.pane === tabName));
  if (tabName === "logs") { state.logs = buildLogs(); renderLogs(); }
}
 
/* =====================================================================
   КЭШ
   ===================================================================== */
function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ state: { ...state, sunrise: null, sunset: null }, savedAt: Date.now() }));
  } catch (e) {}
}
 
function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
 
function applyCachedSnapshot(snap) {
  if (!snap || !snap.state) return;
  Object.assign(state, snap.state, { online: false, sunrise: null, sunset: null });
  if (!Array.isArray(state.history)) state.history = [];
  renderState(); renderForecast(); renderLogs(); renderCharts();
}
 
/* =====================================================================
   ДАННЫЕ СТАНЦИИ
   ===================================================================== */
async function apiGet(path) {
  const r = await fetch(CONFIG.API_BASE + path, { cache: "no-store" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}
 
function recompute() {
  const bucket = weatherCodeBucket(state.weatherCode);
  const lightningFresh = has(state.lightningAgeS) && state.lightningAgeS < 1800;
 
  state.tempMood = tempMoodFrom(state.temp);
  state.humidityMood = humidityMoodFrom(state.humidity);
  state.pressureMood = pressureMoodFrom(state.pressure);
  state.airLabel = airLabelFromPm(state.pm25);
  state.airMood = airMoodFromPm(state.pm25);
 
  state.rainText = rainLabelFrom(state.rainChance);
  state.rainMood = state.rainChance >= 45 ? "Вероятен" : state.rainChance >= 20 ? "Возможен" : "Маловероятен";
 
  state.sprite = spriteFromValues(state.temp, state.humidity, state.pressure, state.pm25,
                                  state.rainChance, bucket, lightningFresh);
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
    state.pressure = safeNumber(w.pressure_sea_hpa ?? w.pressure_hpa, state.pressure);
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
 
    state.rssi = has(dev.rssi_dbm) ? dev.rssi_dbm : null;
    state.freeHeap = has(dev.free_heap) ? dev.free_heap : null;
    state.uptimeS = has(dev.uptime_s) ? dev.uptime_s : null;
 
    // Если прогноза дождя ещё нет — считаем сами по давлению и влажности
    if (!has(state.rainChanceFromForecast)) {
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
 
    // Собираем ряды в один массив строк по времени
    const map = new Map();
    const put = (field, key) => {
      (s[field] || []).forEach(([ts, v]) => {
        if (!map.has(ts)) map.set(ts, { ts });
        map.get(ts)[key] = v;
      });
    };
    put("temperature_c", "temp");
    put("humidity_pct", "hum");
    put("pressure_hpa", "press");
    put("pm25_ugm3", "pm25");
 
    state.history = [...map.values()].sort((a, b) => a.ts - b.ts);
 
    // Тренд давления за 3 часа — основа прогноза
    const target = Date.now() - 3 * 3600 * 1000;
    let p3 = null, best = Infinity;
    for (const r of state.history) {
      if (!Number.isFinite(r.press)) continue;
      const diff = Math.abs(r.ts - target);
      if (diff < best) { best = diff; p3 = r.press; }
    }
    state.pressureTrend3h = p3 !== null && Number.isFinite(state.pressureRaw)
      ? Math.round((state.pressureRaw - p3) * 10) / 10
      : null;
 
    renderCharts();
    renderState();
    saveCache();
  } catch (err) {
    console.warn("История недоступна:", err);
  }
}
 
async function refreshOpenMeteo() {
  try {
    const url = `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${CONFIG.LAT}&longitude=${CONFIG.LON}` +
      `&current=temperature_2m,weathercode,windspeed_10m,precipitation_probability` +
      `&hourly=temperature_2m,precipitation_probability` +
      `&daily=sunrise,sunset` +
      `&timezone=${encodeURIComponent(CONFIG.TIMEZONE)}` +
      `&forecast_days=2`;
 
    const res = await fetch(url);
    if (!res.ok) throw new Error("Open-Meteo HTTP " + res.status);
    const data = await res.json();
 
    if (data.current) {
      state.weatherCode = safeNumber(data.current.weathercode, state.weatherCode);
      const ws = data.current.windspeed_10m;
      state.windForecast = Number.isFinite(ws) ? ws / 3.6 : state.windForecast;  // км/ч → м/с
      const pp = data.current.precipitation_probability;
      if (Number.isFinite(pp)) {
        state.rainChance = pp;
        state.rainChanceFromForecast = true;
      }
    }
 
    if (data.daily?.sunrise?.length && data.daily?.sunset?.length) {
      const today = new Date().toISOString().slice(0, 10);
      if (state.sunDate !== today) {
        state.sunrise = new Date(data.daily.sunrise[0]);
        state.sunset = new Date(data.daily.sunset[0]);
        state.sunDate = today;
      }
    }
 
    if (data.hourly?.time?.length) {
      const nowMs = Date.now();
      const times = data.hourly.time.map((t) => new Date(t).getTime());
      let start = times.findIndex((t) => t >= nowMs);
      if (start === -1) start = 0;
 
      state.forecast = [3, 6, 9, 12, 15]
        .map((o) => start + o)
        .filter((i) => i < times.length)
        .map((i) => ({
          time: new Intl.DateTimeFormat("ru-RU", {
            timeZone: CONFIG.TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false,
          }).format(new Date(times[i])),
          temp: Number.isFinite(data.hourly.temperature_2m?.[i]) ? Math.round(data.hourly.temperature_2m[i]) : null,
          rain: Number.isFinite(data.hourly.precipitation_probability?.[i]) ? Math.round(data.hourly.precipitation_probability[i]) : null,
        }));
 
      renderForecast();
    }
 
    state.lastOpenMeteoAt = Date.now();
    recompute();
    renderState();
    saveCache();
  } catch (err) {
    console.warn("Open-Meteo недоступен, оставляю прежние данные:", err);
  }
}
 
/* =====================================================================
   ЗАПУСК
   ===================================================================== */
Snd.setup();
 
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    setTab(btn.dataset.tab);
    Snd.play("tab");
  });
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
document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshStatus(); });
 
/* Экран загрузки */
window.addEventListener("load", () => {
  const boot = $("bootScreen"), bar = $("bootProgress"), percent = $("bootPercent");
  if (!boot || !bar || !percent) return;
 
  let value = 0;
  const timer = setInterval(() => {
    value += 2;
    bar.style.width = value + "%";
    percent.textContent = value + "%";
    if (value >= 100) {
      clearInterval(timer);
      setTimeout(() => {
        Snd.play("boot");
        boot.style.transition = "opacity 500ms ease";
        boot.style.opacity = "0";
        setTimeout(() => boot.remove(), 520);
      }, 300);
    }
  }, 25);
});
 
/* Telegram Mini App: развернуть на весь экран, если открыто из бота */
if (window.Telegram && window.Telegram.WebApp) {
  try { window.Telegram.WebApp.ready(); window.Telegram.WebApp.expand(); } catch (e) {}
}
