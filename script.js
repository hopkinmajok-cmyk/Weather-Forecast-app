// ---------- Config ----------
const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const form = $("search-form");
const cityInput = $("city");
const statusEl = $("status");
const currentEl = $("current");
const forecastSection = $("forecast-section");
const forecastEl = $("forecast");
const recentEl = $("recent");
const unitButtons = document.querySelectorAll(".unit button");

// ---------- State ----------
let unit = load("unit", "c");            // "c" or "f"
let place = load("lastPlace", null);     // { name, lat, lon }
let recent = load("recent", []);         // [{ name, lat, lon }]

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

// ---------- Weather codes (WMO) ----------
function describe(code) {
  if (code === 0) return { text: "Clear sky", icon: "☀️", theme: "clear" };
  if (code === 1) return { text: "Mainly clear", icon: "🌤️", theme: "clear" };
  if (code === 2) return { text: "Partly cloudy", icon: "⛅", theme: "cloud" };
  if (code === 3) return { text: "Overcast", icon: "☁️", theme: "cloud" };
  if (code === 45 || code === 48) return { text: "Fog", icon: "🌫️", theme: "cloud" };
  if (code >= 51 && code <= 57) return { text: "Drizzle", icon: "🌦️", theme: "rain" };
  if (code >= 61 && code <= 67) return { text: "Rain", icon: "🌧️", theme: "rain" };
  if (code >= 71 && code <= 77) return { text: "Snow", icon: "❄️", theme: "snow" };
  if (code >= 80 && code <= 82) return { text: "Rain showers", icon: "🌦️", theme: "rain" };
  if (code === 85 || code === 86) return { text: "Snow showers", icon: "🌨️", theme: "snow" };
  if (code >= 95) return { text: "Thunderstorm", icon: "⛈️", theme: "storm" };
  return { text: "Unknown", icon: "❔", theme: "cloud" };
}

// ---------- API ----------
async function geocode(name) {
  const res = await fetch(`${GEO_URL}?name=${encodeURIComponent(name)}&count=1&language=en`);
  if (!res.ok) throw new Error("Could not reach the search service. Try again.");
  const data = await res.json();
  if (!data.results || !data.results.length) {
    throw new Error(`No city found for “${name}”. Check the spelling or try a nearby city.`);
  }
  const r = data.results[0];
  const label = [r.name, r.admin1, r.country].filter(Boolean).join(", ");
  return { name: label, lat: r.latitude, lon: r.longitude };
}

async function fetchWeather({ lat, lon }) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day",
    daily: "weather_code,temperature_2m_max,temperature_2m_min",
    forecast_days: 5,
    timezone: "auto",
    temperature_unit: unit === "c" ? "celsius" : "fahrenheit",
    wind_speed_unit: unit === "c" ? "kmh" : "mph",
  });
  const res = await fetch(`${WEATHER_URL}?${params}`);
  if (!res.ok) throw new Error("Could not load the weather. Try again in a moment.");
  return res.json();
}

// ---------- UI ----------
function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.hidden = !message;
}

function showResults(show) {
  currentEl.hidden = !show;
  forecastSection.hidden = !show;
}

function render(data) {
  const cur = data.current;
  const info = describe(cur.weather_code);
  const deg = unit === "c" ? "°C" : "°F";
  const speed = unit === "c" ? "km/h" : "mph";

  document.body.dataset.theme = cur.is_day === 0 ? "night" : info.theme;

  $("place").textContent = place.name;
  $("temp").textContent = Math.round(cur.temperature_2m);
  $("temp-unit").textContent = deg;
  $("condition").textContent = `${info.icon} ${info.text}`;
  $("feels").textContent = `${Math.round(cur.apparent_temperature)}${deg}`;
  $("humidity").textContent = `${cur.relative_humidity_2m}%`;
  $("wind").textContent = `${Math.round(cur.wind_speed_10m)} ${speed}`;

  renderForecast(data.daily);
  showResults(true);
  setStatus("");
}

function renderForecast(daily) {
  const min = Math.min(...daily.temperature_2m_min);
  const max = Math.max(...daily.temperature_2m_max);
  const span = max - min || 1;

  forecastEl.innerHTML = "";
  daily.time.forEach((dateStr, i) => {
    const lo = daily.temperature_2m_min[i];
    const hi = daily.temperature_2m_max[i];
    const info = describe(daily.weather_code[i]);
    const name = i === 0
      ? "Today"
      : new Date(dateStr + "T00:00").toLocaleDateString("en-US", { weekday: "short" });
    const left = ((lo - min) / span) * 100;
    const width = Math.max(((hi - lo) / span) * 100, 4);

    const li = document.createElement("li");
    li.className = "day";
    li.innerHTML = `
      <span class="day-name">${name}</span>
      <span class="day-icon" role="img" aria-label="${info.text}">${info.icon}</span>
      <span class="range">
        <span class="lo">${Math.round(lo)}°</span>
        <span class="track"><span class="fill" style="left:${left}%;width:${width}%"></span></span>
        <span class="hi">${Math.round(hi)}°</span>
      </span>`;
    forecastEl.appendChild(li);
  });
}

function renderRecent() {
  recentEl.innerHTML = "";
  recent.forEach((p) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = p.name.split(",")[0];
    btn.title = p.name;
    btn.addEventListener("click", () => loadPlace(p));
    li.appendChild(btn);
    recentEl.appendChild(li);
  });
}

function addRecent(p) {
  recent = [p, ...recent.filter((r) => r.name !== p.name)].slice(0, 5);
  save("recent", recent);
  renderRecent();
}

// ---------- Actions ----------
async function loadPlace(p, { remember = true } = {}) {
  place = p;
  showResults(false);
  setStatus("Loading weather…", "loading");
  try {
    const data = await fetchWeather(p);
    save("lastPlace", p);
    if (remember) addRecent(p);
    render(data);
  } catch (err) {
    setStatus(err.message || "Something went wrong. Try again.", "error");
  }
}

async function searchCity(name) {
  showResults(false);
  setStatus("Searching…", "loading");
  try {
    const p = await geocode(name);
    await loadPlace(p);
  } catch (err) {
    setStatus(err.message || "Something went wrong. Try again.", "error");
  }
}

function useMyLocation() {
  if (!navigator.geolocation) {
    setStatus("Your browser doesn’t support location. Search for a city instead.", "error");
    return;
  }
  showResults(false);
  setStatus("Finding your location…", "loading");
  navigator.geolocation.getCurrentPosition(
    (pos) => loadPlace({ name: "Your location", lat: pos.coords.latitude, lon: pos.coords.longitude }, { remember: false }),
    () => setStatus("Location access was blocked. Allow it in your browser, or search for a city.", "error"),
  );
}

function setUnit(next) {
  unit = next;
  save("unit", unit);
  unitButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.unit === unit)));
  if (place) loadPlace(place, { remember: false });
}

// ---------- Events ----------
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = cityInput.value.trim();
  if (name) searchCity(name);
});
$("locate").addEventListener("click", useMyLocation);
unitButtons.forEach((b) => b.addEventListener("click", () => setUnit(b.dataset.unit)));

// ---------- Start ----------
unitButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.unit === unit)));
renderRecent();
if (place) loadPlace(place, { remember: false });