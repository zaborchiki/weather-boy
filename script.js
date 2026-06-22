const CONFIG = {
  API_BASE: "http://192.168.1.19",
  LOCATION_FALLBACK: "SANT'ANGELO A CUPOLO",
};

const STATUS_URL = `${CONFIG.API_BASE}/api/status`;
const LATEST_URL = `${CONFIG.API_BASE}/latest`;
const HISTORY_URL = `${CONFIG.API_BASE}/history?limit=10`;

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
};

const $ = (id) => document.getElementById(id);

const ui = {
  dateText: $("dateText"),
  timeText: $("timeText"),
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
  vaultboySprite: $("vaultboySprite"),
  forecastGrid: $("forecastGrid"),
  logsList: $("logsList"),
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

function isNightTime() {
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

function spriteFromValues(temp, hum, press, gas, rainChance) {

  if (gas < 18) return "airmask";

  if (temp >= 35) return "heat";

  if (temp <= 8) return "cold";

  if (rainChance >= 70) return "storm";

  if (rainChance >= 55) return "rain";

  if (hum >= 80 && press < 992)
    return "cloudy";

  if (hum >= 70)
    return "cloudy";

  if (hum <= 25 && temp >= 28)
    return "dry";

  if (temp >= 25)
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

function buildForecast(temp, rainChance) {
  const base = Math.round(temp);
  return [
    { time: "21:00", temp: base - 7, rain: Math.min(80, rainChance + 5) },
    { time: "00:00", temp: base - 8, rain: Math.min(70, rainChance) },
    { time: "03:00", temp: base - 9, rain: Math.max(5, rainChance - 2) },
    { time: "06:00", temp: base - 8, rain: Math.max(5, rainChance - 5) },
    { time: "09:00", temp: base - 4, rain: Math.max(5, rainChance - 3) },
  ];
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

function renderForecast() {
  const items = state.forecast?.length ? state.forecast : buildForecast(state.temp, state.rainChance);

  ui.forecastGrid.innerHTML = items.map((item) => {
    const icon = item.rain >= 20 ? "images/icon_rain.png" : "images/icon_time.png";
    return `
      <article class="forecast-card">
        <img src="${icon}" alt="" class="forecast-icon" aria-hidden="true" />
        <div class="forecast-time">${item.time}</div>
        <div class="forecast-temp">${item.temp}°</div>
        <div class="forecast-label">${item.rain}%</div>
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

function applyStatus(payload) {
  if (!payload) return;

  const temp = safeNumber(payload.temp, state.temp);
  const hum = safeNumber(payload.hum ?? payload.humidity, state.humidity);
  const press = safeNumber(payload.press ?? payload.pressure, state.pressure);
  const gas = safeNumber(payload.gas, state.gas);
  const windValue = payload.wind == null ? null : safeNumber(payload.wind, 0);
  const rainChance = safeNumber(payload.rainChance, rainChanceFrom(hum, press));
  const sprite = payload.sprite || spriteFromValues(temp, hum, press, gas, rainChance);

  state.online = payload.online !== false;
  state.location = payload.location || CONFIG.LOCATION_FALLBACK;
  state.timestamp = payload.timestamp || state.timestamp;
  state.temp = temp;
  state.humidity = hum;
  state.pressure = press;
  state.gas = gas;
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
  state.windMood = payload.windMood || "Нет данных";
  state.forecast = Array.isArray(payload.forecast) && payload.forecast.length ? payload.forecast : buildForecast(temp, rainChance);
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
  const sprite = spriteFromValues(temp, hum, press, gas, rainChance);

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
    windMood: "Нет данных",
  });

  return true;
}

async function refreshStatus() {
  try {
    const res = await fetch(STATUS_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    applyStatus(payload);
    renderState();
    renderForecast();
  } catch (jsonError) {
    try {
      const res = await fetch(LATEST_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (applyCsvLine(text)) {
        renderState();
        renderForecast();
      }
    } catch (csvError) {
      console.warn("Station fetch failed:", jsonError, csvError);
    }
  }
}

async function refreshHistory() {
  try {
    const res = await fetch(HISTORY_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    state.logs = parseHistoryText(text);
    renderLogs();
  } catch (error) {
    if (!state.logs.length) {
      state.logs = fallbackLogs();
      renderLogs();
    }
    console.warn("History fetch failed:", error);
  }
}

window.setWeatherBoy = function setWeatherBoy(nextData) {
  applyStatus(nextData);
  renderState();
  renderForecast();
};

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => setTab(btn.dataset.tab));
});

renderState();
renderForecast();
renderLogs();
updateClock();
refreshStatus();
refreshHistory();
setInterval(updateClock, 1000);
setInterval(refreshStatus, 15000);
setInterval(refreshHistory, 30000);

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