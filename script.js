const CONFIG = {
  API_BASE: "http://100.126.25.87:3001/api",
  LOCATION_FALLBACK: "SANT'ANGELO A CUPOLO",
  // Coordinates of Sant'Angelo a Cupolo, Benevento, Campania, Italy.
  LAT: 41.0691,
  LON: 14.8037,
  TIMEZONE: "Europe/Rome",
};
 
const SUPABASE_URL =
"https://tgmvzgvuhfmvpdreunim.supabase.co/rest/v1/weather";
 
const SUPABASE_KEY =
"sb_publishable_oINVjfPFwYsVLZcHutdjIQ_gFAqFTcp";
 
// How often each data source is allowed to be refreshed (ms).
const INTERVALS = {
  clock: 1000,
  station: 15000,      // local station via Supabase: every 10-15s
  history: 30000,      // history/log rows for charts + logs
  openMeteo: 10 * 60 * 1000,   // Open-Meteo: no more than once per 10 min
  lastUpdateTick: 15000,       // just re-renders the "updated X ago" label
};
 
const CACHE_KEY = "weatherboy_cache_v1";
 
const state = {
  online: false,
  location: CONFIG.LOCATION_FALLBACK,
  timestamp: "--",
  temp: 0,
  humidity: 0,
  pressure: 0,
  gas: 0,
  wind: null,
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
  windMood: "Нет данных",
  forecast: [],
  logs: [],
 
  // --- extended runtime state ---
  history: [],            // chronological (oldest -> newest) raw station rows, for charts
  lastUpdatedAt: null,     // ms epoch of the last successful station read
  weatherCode: null,       // last Open-Meteo weathercode (current conditions)
  sunrise: null,           // Date | null
  sunset: null,            // Date | null
  lastOpenMeteoAt: null,   // ms epoch of last successful Open-Meteo read
  sunDate: null,           // "YYYY-MM-DD" the cached sunrise/sunset belongs to
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
 
function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
 
// Falls back to a fixed hour window only until real sunrise/sunset data
// has arrived from Open-Meteo; after that, uses the real values.
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
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
 
  const date = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(now);
 
  return { time, date };
}
 
function updateClock() {
  const { time, date } = timeNowRome();
  ui.timeText.textContent = time;
  ui.dateText.textContent = date;
}
 
function tempMoodFrom(temp) {
  if (temp >= 35) return "Жарко";
  if (temp >= 25) return "Тепло";
  if (temp <= 8) return "Холодно";
  if (temp <= 18) return "Прохладно";
  return "Комфортно";
}
 
function humidityMoodFrom(h) {
  if (h >= 70) return "Влажно";
  if (h >= 45) return "Комфортно";
  return "Суховато";
}
 
function pressureMoodFrom(p) {
  if (p < 995) return "Низкое";
  if (p < 1002) return "Нормальное";
  return "Высокое";
}
 
function airLabelFromGas(gas) {
  if (gas < 18) return "ПЛОХОЕ";
  if (gas < 30) return "СРЕДНЕЕ";
  if (gas < 60) return "ХОРОШЕЕ";
  return "ОТЛИЧНОЕ";
}
 
function airMoodFromGas(gas) {
  if (gas < 18) return "Плохое";
  if (gas < 30) return "Среднее";
  if (gas < 60) return "Хорошее";
  return "Отличное";
}
 
function rainLabelFrom(chance) {
  if (chance <= 8) return "дождя не ожидается";
  if (chance <= 20) return "маловероятен";
  if (chance <= 45) return "возможен";
  if (chance <= 70) return "вероятен";
  return "высокая вероятность дождя";
}
 
function windMoodFromSpeed(speedMs) {
  if (speedMs == null || !Number.isFinite(speedMs)) return "Нет данных";
  if (speedMs < 1.6) return "Штиль";
  if (speedMs < 3.4) return "Лёгкий";
  if (speedMs < 7.9) return "Умеренный";
  if (speedMs < 13.9) return "Сильный";
  return "Штормовой";
}
 
// Groups Open-Meteo WMO weather codes into broad buckets so real observed
// sky conditions can corroborate the sensor-based sprite heuristic.
function weatherCodeBucket(code) {
  if (code == null) return null;
  const c = Number(code);
  if (!Number.isFinite(c)) return null;
  if (c === 0) return "clear";
  if (c === 1 || c === 2) return "clear";
  if (c === 3) return "cloudy";
  if ([45, 48].includes(c)) return "cloudy";
  if ([51, 53, 55, 56, 57, 61, 63, 66, 80, 81].includes(c)) return "rain";
  if ([65, 67, 82].includes(c)) return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(c)) return "rain";
  if ([95, 96, 99].includes(c)) return "storm";
  return null;
}
 
function spriteFromValues(temp, hum, press, gas, rainChance, codeBucket = null) {
 
  if (gas < 18) return "airmask";
 
  if (temp >= 35) return "heat";
 
  if (temp <= 8) return "cold";
 
  if (codeBucket === "storm" || rainChance >= 70) return "storm";
 
  if (codeBucket === "rain" || rainChance >= 55) return "rain";
 
  if (hum >= 80 && press < 992)
    return "cloudy";
 
  if (hum >= 70)
    return "cloudy";
 
  if (hum <= 25 && temp >= 28)
    return "dry";
 
  if (codeBucket === "cloudy" && temp < 25)
    return "cloudy";
 
  if (temp >= 25)
    return "sun";
 
  if (codeBucket === "clear")
    return "sun";
 
  return "perfect";
}
 
function skyLabelFromSprite(sprite) {
 
  const night = isNightTime();
 
  switch (sprite) {
 
    case "sun":
      return night ? "ЯСНАЯ НОЧЬ" : "СОЛНЕЧНО";
 
    case "cloudy":
      return "ОБЛАЧНО";
 
    case "rain":
      return "ДОЖДЬ";
 
    case "storm":
      return "ШТОРМ";
 
    case "heat":
      return "ЖАРА";
 
    case "cold":
      return "ХОЛОД";
 
    case "dry":
      return "СУХО";
 
    case "wind":
      return "ВЕТЕР";
 
    case "airmask":
      return "ПЛОХОЙ ВОЗДУХ";
 
    default:
      return night ? "ЯСНАЯ НОЧЬ" : "СТАБИЛЬНО";
  }
}
 
function statusLabelFromSprite(sprite) {
  switch (sprite) {
    case "airmask": return "ВОЗДУХ";
    case "heat": return "ЖАРА";
    case "cold": return "ХОЛОД";
    case "dry": return "СУХО";
    case "storm": return "ШТОРМ";
    case "rain": return "ДОЖДЬ";
    default: return "СТАБИЛЬНО";
  }
}
 
function rainChanceFrom(hum, press) {
 
  let score = 0;
 
  if (hum >= 90)
    score += 35;
  else if (hum >= 85)
    score += 25;
  else if (hum >= 80)
    score += 15;
 
  if (press <= 985)
    score += 40;
  else if (press <= 988)
    score += 25;
  else if (press <= 991)
    score += 10;
 
  if (score > 100)
    score = 100;
 
  if (score < 0)
    score = 0;
 
  return score;
}
 
// Honest placeholder used only until real forecast data (station-provided
// or Open-Meteo) is available. No invented temperatures/percentages.
function placeholderForecast() {
  const slots = ["21:00", "00:00", "03:00", "06:00", "09:00"];
  return slots.map((time) => ({ time, temp: null, rain: null }));
}
 
function fallbackLogs() {
  return [
    { icon: "icon_status.png", title: "Нет истории", meta: "Данные ещё не накопились" },
    { icon: "icon_temp.png", title: "Станция онлайн", meta: "Ожидаются новые записи" },
  ];
}
 
function iconFromKind(kind) {
  const k = String(kind || "").toLowerCase();
  if (k.includes("temp")) return "icon_temp.png";
  if (k.includes("humid")) return "icon_humidity.png";
  if (k.includes("press")) return "icon_pressure.png";
  if (k.includes("air")) return "icon_air.png";
  if (k.includes("rain")) return "icon_rain.png";
  if (k.includes("wind")) return "icon_wind.png";
  if (k.includes("boot") || k.includes("status")) return "icon_status.png";
  return "icon_status.png";
}
 
function parseHistoryText(text) {
  if (!text || !text.trim()) return [];
 
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-10)
    .map((line) => {
      const parts = line.split("|").map((s) => s.trim());
      if (parts.length >= 3) {
        return {
          icon: iconFromKind(parts[1]),
          title: parts[1],
          meta: `${parts[0]} — ${parts.slice(2).join(" |")}`,
        };
      }
 
      return {
        icon: "icon_status.png",
        title: "Запись",
        meta: line,
      };
    });
}
 
// ---------------------------------------------------------------------
// Real-data sparkline charts (temp / humidity / pressure / rain / air)
// ---------------------------------------------------------------------
 
function buildSparklineSVG(values, { min = null, max = null } = {}) {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return null;
 
  const lo = min != null ? min : Math.min(...clean);
  const hi = max != null ? max : Math.max(...clean);
  const span = hi - lo || 1;
 
  const w = 100;
  const h = 30;
  const pad = 3;
 
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const norm = Number.isFinite(v) ? (v - lo) / span : 0.5;
    const y = h - pad - norm * (h - pad * 2);
    return [x, y];
  });
 
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${w},${h} L0,${h} Z`;
  const gradientId = `miniChartFade`;
 
  return `
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent-2)" stop-opacity="0.55" />
          <stop offset="100%" stop-color="var(--accent-2)" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path class="mini-chart-area" d="${areaPath}" />
      <path class="mini-chart-line" d="${linePath}" />
    </svg>
  `;
}
 
function renderMiniChart(wrapEl, values, opts) {
  if (!wrapEl) return;
 
  const svg = buildSparklineSVG(values, opts);
 
  if (!svg) {
    wrapEl.innerHTML = `<span class="chart-note">История ещё не накоплена</span>`;
    return;
  }
 
  wrapEl.innerHTML = svg;
}
 
function renderPressureTrend() {
  if (!ui.trendChart) return;
 
  const rows = state.history;
  const values = rows.map((r) => r.press).filter((v) => Number.isFinite(v));
 
  if (values.length < 2) {
    ui.trendChart.innerHTML = `<span class="chart-note">История ещё не накоплена</span>`;
    return;
  }
 
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
 
  ui.trendChart.innerHTML = values.map((v) => {
    const pct = 12 + ((v - lo) / span) * 78; // keep bars visible even when flat
    return `<span style="--h: ${pct.toFixed(1)}%"></span>`;
  }).join("");
}
 
function renderCharts() {
  const rows = state.history;
 
  renderMiniChart(ui.tempChartWrap, rows.map((r) => r.temp));
  renderMiniChart(ui.humidityChartWrap, rows.map((r) => r.hum), { min: 0, max: 100 });
  renderMiniChart(ui.airChartWrap, rows.map((r) => r.gas));
  renderMiniChart(
    ui.rainChartWrap,
    rows.map((r) => (Number.isFinite(r.hum) && Number.isFinite(r.press) ? rainChanceFrom(r.hum, r.press) : null)),
    { min: 0, max: 100 }
  );
 
  renderPressureTrend();
}
 
// ---------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------
 
function renderForecast() {
  const items = state.forecast?.length ? state.forecast : placeholderForecast();
 
  ui.forecastGrid.innerHTML = items.map((item) => {
    const hasData = item.temp != null && item.rain != null;
    const icon = hasData && item.rain >= 20 ? "images/icon_rain.png" : "images/icon_time.png";
    const tempLabel = hasData ? `${item.temp}°` : "—";
    const rainLabel = hasData ? `${item.rain}%` : "нет данных";
    return `
      <article class="forecast-card">
        <img src="${icon}" alt="" class="forecast-icon" aria-hidden="true" />
        <div class="forecast-time">${item.time}</div>
        <div class="forecast-temp">${tempLabel}</div>
        <div class="forecast-label">${rainLabel}</div>
      </article>
    `;
  }).join("");
}
 
function renderLogs() {
  const items = state.logs?.length ? state.logs : fallbackLogs();
 
  ui.logsList.innerHTML = items.map((log) => `
    <article class="log-item">
      <img src="images/${log.icon}" alt="" class="log-icon" aria-hidden="true" />
      <div class="log-body">
        <div class="log-title">${log.title}</div>
        <div class="log-meta">${log.meta}</div>
      </div>
    </article>
  `).join("");
}
 
function formatRelativeUpdate(ms) {
  if (!ms) return "нет данных";
 
  const diffSec = Math.max(0, Math.round((Date.now() - ms) / 1000));
 
  if (diffSec < 20) return "только что";
  if (diffSec < 60) return `${diffSec} сек назад`;
 
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} мин назад`;
 
  const diffHr = Math.round(diffMin / 60);
  return `${diffHr} ч назад`;
}
 
function renderLastUpdate() {
  if (!ui.lastUpdateText) return;
 
  ui.lastUpdateText.textContent = formatRelativeUpdate(state.lastUpdatedAt);
 
  const staleMs = INTERVALS.station * 4; // no fresh data for a while -> flag as stale
  const isStale = !state.lastUpdatedAt || (Date.now() - state.lastUpdatedAt) > staleMs;
 
  if (ui.lastUpdateChip) {
    ui.lastUpdateChip.classList.toggle("is-stale", isStale);
  }
}
 
function renderState() {
  ui.locationText.textContent = state.location;
  ui.skyText.textContent = state.skyLabel;
  ui.tempText.textContent = `${state.temp.toFixed(1)}°C`;
  ui.humidityText.textContent = `${Math.round(state.humidity)}%`;
  ui.pressureText.textContent = `${state.pressure.toFixed(1)} hPa`;
  ui.airText.textContent = state.airLabel;
  ui.rainText.textContent = state.rainText || `${Math.round(state.rainChance)}%`;
  ui.windText.textContent = state.wind == null ? "Нет данных" : `${state.wind.toFixed(1)} м/с`;
 
  ui.tempMood.textContent = state.tempMood;
  ui.humidityMood.textContent = state.humidityMood;
  ui.pressureMood.textContent = state.pressureMood;
  ui.airMood.textContent = state.airMood;
  ui.rainMood.textContent = state.rainMood;
  ui.windMood.textContent = state.windMood;
 
  ui.statusBadge.textContent = state.statusLabel;
  ui.trendText.textContent = state.pressureMood === "Низкое" ? "Падает" : "Стабильно";
 
  ui.vaultboySprite.src = spriteMap[state.sprite] || spriteMap.perfect;
  ui.vaultboySprite.alt = `Vault Boy: ${state.sprite || "perfect"}`;
 
  renderLastUpdate();
}
 
function setTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });
 
  document.querySelectorAll(".pane").forEach((pane) => {
    pane.classList.toggle("active", pane.dataset.pane === tabName);
  });
 
  if (tabName === "logs") refreshHistory();
}
 
// ---------------------------------------------------------------------
// Local cache (offline resilience)
// ---------------------------------------------------------------------
 
function saveCache() {
  try {
    const snapshot = {
      state: {
        location: state.location,
        timestamp: state.timestamp,
        temp: state.temp,
        humidity: state.humidity,
        pressure: state.pressure,
        gas: state.gas,
        wind: state.wind,
        rainChance: state.rainChance,
        rainText: state.rainText,
        sprite: state.sprite,
        skyLabel: state.skyLabel,
        statusLabel: state.statusLabel,
        tempMood: state.tempMood,
        humidityMood: state.humidityMood,
        pressureMood: state.pressureMood,
        airLabel: state.airLabel,
        airMood: state.airMood,
        rainMood: state.rainMood,
        windMood: state.windMood,
        forecast: state.forecast,
        history: state.history,
        lastUpdatedAt: state.lastUpdatedAt,
        weatherCode: state.weatherCode,
        sunrise: state.sunrise ? state.sunrise.toISOString() : null,
        sunset: state.sunset ? state.sunset.toISOString() : null,
        sunDate: state.sunDate,
      },
      savedAt: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
  } catch (err) {
    // Storage can fail (quota, privacy mode) - never let that break the UI.
    console.warn("Cache save skipped:", err);
  }
}
 
function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn("Cache read skipped:", err);
    return null;
  }
}
 
function applyCachedSnapshot(snapshot) {
  if (!snapshot || !snapshot.state) return;
  const s = snapshot.state;
 
  const history = Array.isArray(s.history) ? s.history : [];
  const cachedLogs = history
    .slice(-10)
    .reverse()
    .map((row) => ({
      icon: "icon_status.png",
      title: Number.isFinite(row.temp) ? `${row.temp.toFixed(1)}°C` : "—",
      meta: `${row.timestamp || "—"} | H:${row.hum ?? "—"}% P:${row.press ?? "—"} G:${row.gas ?? "—"}`,
    }));
 
  Object.assign(state, s, {
    online: false, // we don't actually know yet - a live fetch will confirm
    sunrise: s.sunrise ? new Date(s.sunrise) : null,
    sunset: s.sunset ? new Date(s.sunset) : null,
    history,
    logs: cachedLogs,
  });
 
  renderState();
  renderForecast();
  renderLogs();
  renderCharts();
}
 
function applyStatus(payload) {
  if (!payload) return;
 
  const temp = safeNumber(payload.temp, state.temp);
  const hum = safeNumber(payload.hum ?? payload.humidity, state.humidity);
  const press = safeNumber(payload.press ?? payload.pressure, state.pressure);
  const gas = safeNumber(payload.gas, state.gas);
  const windValue = payload.wind == null ? state.wind : safeNumber(payload.wind, state.wind);
  const rainChance = safeNumber(payload.rainChance, rainChanceFrom(hum, press));
  const codeBucket = weatherCodeBucket(state.weatherCode);
  const sprite = payload.sprite || spriteFromValues(temp, hum, press, gas, rainChance, codeBucket);
 
  state.online = payload.online !== false;
  state.location = payload.location || CONFIG.LOCATION_FALLBACK;
  state.timestamp = payload.timestamp || state.timestamp;
  state.temp = temp;
  state.humidity = hum;
  state.pressure = press;
  state.gas = gas;
  state.pm1 = payload.pm1 ?? state.pm1;

state.pm25 = payload.pm25 ?? state.pm25;

state.pm10 = payload.pm10 ?? state.pm10;

state.uv = payload.uv ?? state.uv;

state.lux = payload.lux ?? state.lux;

state.lightningDistance =
    payload.lightningDistance ?? state.lightningDistance;

state.lightningEnergy =
    payload.lightningEnergy ?? state.lightningEnergy;
  state.wind = windValue;
  state.rainChance = rainChance;
  state.rainText = payload.rainText || rainLabelFrom(rainChance);
  state.sprite = sprite;
  state.skyLabel = skyLabelFromSprite(sprite);
  state.statusLabel = payload.statusLabel || statusLabelFromSprite(sprite);
  state.tempMood = payload.tempMood || tempMoodFrom(temp);
  state.humidityMood = payload.humidityMood || humidityMoodFrom(hum);
  state.pressureMood = payload.pressureMood || pressureMoodFrom(press);
  state.airLabel = payload.airLabel || airLabelFromGas(gas);
  state.airMood = payload.airMood || airMoodFromGas(gas);
  state.rainMood = payload.rainMood || (rainChance >= 45 ? "Вероятен" : rainChance >= 20 ? "Возможен" : "Маловероятен");
  state.windMood = payload.windMood || windMoodFromSpeed(state.wind);
 
  if (Array.isArray(payload.forecast) && payload.forecast.length) {
    state.forecast = payload.forecast;
  } else if (!state.forecast || !state.forecast.length) {
    state.forecast = placeholderForecast();
  }
 
  if (payload.online !== false) {
    state.lastUpdatedAt = Date.now();
  }
}
 
function applyCsvLine(line) {
  if (!line || !line.trim()) return false;
 
  const parts = line.trim().split(",");
  if (parts.length < 5) return false;
 
  const temp = safeNumber(parts[1], state.temp);
  const hum = safeNumber(parts[2], state.humidity);
  const press = safeNumber(parts[3], state.pressure);
  const gas = safeNumber(parts[4], state.gas);
  const rainChance = rainChanceFrom(hum, press);
  const sprite = spriteFromValues(temp, hum, press, gas, rainChance, weatherCodeBucket(state.weatherCode));
 
  applyStatus({
    online: true,
    location: state.location,
    timestamp: parts[0],
    temp,
    hum,
    press,
    gas,
    wind: null,
    rainChance,
    rainText: rainLabelFrom(rainChance),
    sprite,
    skyLabel: skyLabelFromSprite(sprite),
    statusLabel: statusLabelFromSprite(sprite),
    tempMood: tempMoodFrom(temp),
    humidityMood: humidityMoodFrom(hum),
    pressureMood: pressureMoodFrom(press),
    airLabel: airLabelFromGas(gas),
    airMood: airMoodFromGas(gas),
    rainMood: rainChance >= 45 ? "Вероятен" : rainChance >= 20 ? "Возможен" : "Маловероятен",
    windMood: windMoodFromSpeed(state.wind),
  });
 
  return true;
}
 
// ---------------------------------------------------------------------
// Data sources
// ---------------------------------------------------------------------
 
async function refreshStatus() {

  try {

    const res = await fetch(`${CONFIG.API_BASE}/status`, {
      cache: "no-store"
    });

    if (!res.ok) {
      throw new Error(`Backend HTTP ${res.status}`);
    }

    const row = await res.json();

    applyStatus({

      online: true,

      location: CONFIG.LOCATION_FALLBACK,

      timestamp: row.updated || row.timestamp,

      temp: row.temperature,

      hum: row.humidity,

      press: row.pressure,

      gas: row.gas,

      wind: row.wind,

      rainChance: row.rainChance,

      uv: row.uv,

      lux: row.lux,

      pm1: row.pm1,

      pm25: row.pm25,

      pm10: row.pm10,

      lightningDistance: row.lightningDistance,

      lightningEnergy: row.lightningEnergy

    });

    renderState();

    renderForecast();

    saveCache();

  } catch (err) {

    console.warn("Backend unavailable:", err);

    state.online = false;

    renderLastUpdate();

  }

}
 
async function refreshHistory() {

    try {

        const res = await fetch(`${CONFIG.API_BASE}/history`, {
            cache: "no-store"
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const history = await res.json();

        state.history = history;

        renderChart();

    } catch (err) {

        console.error("History error:", err);

    }

}
 
async function refreshOpenMeteo() {
 
  try {
 
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${CONFIG.LAT}&longitude=${CONFIG.LON}` +
      `&current=temperature_2m,weathercode,windspeed_10m` +
      `&hourly=temperature_2m,precipitation_probability` +
      `&daily=sunrise,sunset` +
      `&timezone=${encodeURIComponent(CONFIG.TIMEZONE)}` +
      `&forecast_days=2`;
 
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
 
    const data = await res.json();
 
    if (data.current) {
      state.weatherCode = safeNumber(data.current.weathercode, state.weatherCode);
      const windSpeed = safeNumber(data.current.windspeed_10m, null);
      // Open-Meteo returns km/h; convert to m/s to match the station's unit.
      state.wind = windSpeed == null ? state.wind : windSpeed / 3.6;
      state.windMood = windMoodFromSpeed(state.wind);
    }
 
    if (data.daily?.sunrise?.length && data.daily?.sunset?.length) {
      const today = new Date().toISOString().slice(0, 10);
      // Only actually replace the cached sunrise/sunset once per calendar
      // day, per spec, even though this call itself runs every 10 min.
      if (state.sunDate !== today) {
        state.sunrise = new Date(data.daily.sunrise[0]);
        state.sunset = new Date(data.daily.sunset[0]);
        state.sunDate = today;
      }
    }
 
    if (data.hourly?.time?.length) {
      const nowMs = Date.now();
      const times = data.hourly.time.map((t) => new Date(t).getTime());
      let startIdx = times.findIndex((t) => t >= nowMs);
      if (startIdx === -1) startIdx = 0;
 
      const steps = [3, 6, 9, 12, 15];
      const forecast = steps
        .map((offset) => startIdx + offset)
        .filter((idx) => idx < times.length)
        .map((idx) => {
          const d = new Date(times[idx]);
          const label = new Intl.DateTimeFormat("ru-RU", {
            timeZone: CONFIG.TIMEZONE,
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).format(d);
          const temp = data.hourly.temperature_2m?.[idx];
          const rain = data.hourly.precipitation_probability?.[idx];
          return {
            time: label,
            temp: Number.isFinite(temp) ? Math.round(temp) : null,
            rain: Number.isFinite(rain) ? Math.round(rain) : null,
          };
        });
 
      if (forecast.length) {
        state.forecast = forecast;
        renderForecast();
      }
    }
 
    state.lastOpenMeteoAt = Date.now();
 
    // Weather-code can change which sprite/sky label fits best - re-apply
    // with the latest station readings so the UI stays reactive.
    applyStatus({
      online: state.online,
      location: state.location,
      timestamp: state.timestamp,
      temp: state.temp,
      hum: state.humidity,
      press: state.pressure,
      gas: state.gas,
      wind: state.wind,
    });
 
    renderState();
    saveCache();
 
  } catch (err) {
 
    console.warn("Open-Meteo unavailable, keeping last known data:", err);
 
  }
 
}
 
window.setWeatherBoy = function setWeatherBoy(nextData) {
  applyStatus(nextData);
  renderState();
  renderForecast();
  saveCache();
};
 
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => setTab(btn.dataset.tab));
});
 
// Paint immediately from cache (if any) so the UI never shows an empty
// screen while the network requests are still in flight.
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
 
window.addEventListener("online", () => {
  refreshStatus();
  refreshHistory();
  refreshOpenMeteo();
});
 
const bootSound = new Audio("sounds/pipboy_boot.mp3");
const tabSound = new Audio("sounds/pipboy_tab.mp3");
 
let audioUnlocked = false;
 
document.addEventListener("click", () => {
 
  if (audioUnlocked) return;
 
  audioUnlocked = true;
 
  bootSound.volume = 0.5;
  tabSound.volume = 0.4;
 
}, { once: true });
 
window.addEventListener("load", () => {
 
  const boot = document.getElementById("bootScreen");
  const bar = document.getElementById("bootProgress");
  const percent = document.getElementById("bootPercent");
 
  if (!boot || !bar || !percent) {
    console.warn("Boot screen not found");
    return;
  }
 
  let value = 0;
 
  const timer = setInterval(() => {
 
    value += 2;
 
    bar.style.width = value + "%";
    percent.textContent = value + "%";
 
    if (value >= 100) {
 
      clearInterval(timer);
 
      setTimeout(() => {
 
        if (audioUnlocked) {
          bootSound.currentTime = 0;
          bootSound.play().catch(() => {});
        }
 
        boot.style.opacity = "0";
 
        setTimeout(() => {
 
          boot.remove();
 
        }, 500);
 
      }, 300);
 
    }
 
  }, 25);
 
});
 
document.querySelectorAll(".tab-btn").forEach(btn => {
 
  btn.addEventListener("click", () => {
 
    if (!audioUnlocked) return;
 
    tabSound.currentTime = 0;
 
    tabSound.play().catch(() => {});
 
  });
 
});
