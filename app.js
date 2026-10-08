import { buildModel, prefixRange, routeOf, resolve } from "./lib/model.js";
import { parseHash, formatHash } from "./lib/route.js";
import { searchIndex, search } from "./lib/search.js";
import { declutter } from "./lib/declutter.js";

const REGION_COLORS = {
  "Red River Delta": "#e53935",
  "Northeast": "#8e24aa",
  "Northwest": "#3949ab",
  "North Central Coast": "#00897b",
  "South Central Coast": "#f9a825",
  "Central Highlands": "#6d4c41",
  "Southeast": "#fb8c00",
  "Mekong Delta": "#43a047",
};
const HOME_VIEW = { center: [16.0, 106.0], zoom: 6 };
const BASE_TITLE = "Mã Bưu Chính Việt Nam";
const SEARCH_LIMIT = 50;

const $ = (id) => document.getElementById(id);
const map = L.map("map").setView(HOME_VIEW.center, HOME_VIEW.zoom);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 18,
}).addTo(map);
const markers = L.layerGroup().addTo(map);
let labels = [];

let model = null;
let index = null;
let activeRegion = null;

const esc = (text) =>
  String(text).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
const hrefOf = (item) => formatHash(routeOf(item)) || "#/";
const colorOf = (province) => REGION_COLORS[province.region] || "#666";
const kindLabel = (province) => (province.city ? "Thành phố" : "Tỉnh");
const isPhone = () => matchMedia("(max-width: 768px)").matches;

// --- Map ---

function clearMap() {
  markers.clearLayers();
  labels = [];
}

function addMarker({ lat, lng, color, label, popup }) {
  if (lat == null) return null;
  const marker = L.circleMarker([lat, lng], { radius: 7, fillColor: color, color: "#fff", weight: 2, fillOpacity: 0.85 })
    .bindPopup(popup)
    .addTo(markers);
  const text = L.marker([lat, lng], {
    icon: L.divIcon({ className: "zip-label", html: esc(label), iconSize: null, iconAnchor: [-10, 8] }),
    interactive: false,
    keyboard: false,
  }).addTo(markers);
  labels.push(text);
  return marker;
}

// Labels are added in priority order; any label that would overlap one before it is hidden.
function declutterLabels() {
  const elements = labels.map((label) => label.getElement()).filter(Boolean);
  const visible = declutter(elements.map((el) => el.getBoundingClientRect()));
  elements.forEach((el, i) => {
    el.style.visibility = visible[i] ? "" : "hidden";
  });
}
map.on("zoomend moveend", () => requestAnimationFrame(declutterLabels));

// On phones the map is hidden while the list shows, and Leaflet cannot frame or size
// popups in a hidden container, so framing waits until the map is shown.
let pendingFrame = null;
function frameMap(frame) {
  pendingFrame = null;
  if ($("map").clientWidth) frame();
  else pendingFrame = frame;
}

function fitPlaces(places) {
  const placed = places.filter((p) => p.lat != null);
  if (placed.length) map.fitBounds(L.latLngBounds(placed.map((p) => [p.lat, p.lng])).pad(0.1));
}

// --- Sidebar ---

function row({ href, title, sub, zip, drill, data = {} }) {
  const li = document.createElement("li");
  Object.assign(li.dataset, data);
  li.innerHTML =
    `<a class="row" href="${esc(href)}"><span class="row-text"><span class="item-name">${esc(title)}</span>` +
    (sub ? `<span class="item-sub">${esc(sub)}</span>` : "") +
    `</span>` +
    (zip ? `<span class="item-zip">${esc(zip)}</span>` : "") +
    (drill ? `<span class="drill-arrow" aria-hidden="true">&rsaquo;</span>` : "") +
    `</a>`;
  return li;
}

function setBreadcrumb(parts) {
  const nav = $("breadcrumb");
  nav.hidden = parts.length === 0;
  nav.innerHTML = parts
    .map((part) => (part.href ? `<a href="${esc(part.href)}">${esc(part.label)}</a>` : `<span>${esc(part.label)}</span>`))
    .join('<span class="sep" aria-hidden="true">&rsaquo;</span>');
}

function setStatus(text) {
  $("status").textContent = text;
}

function setDetail(html) {
  const detail = $("detail");
  detail.hidden = !html;
  detail.innerHTML = html || "";
}

const HOME_CRUMB = { label: "34 tỉnh, thành phố", href: "#/" };

function provinceSummary(p) {
  const kind = p.formerly.length > 1 ? `Gồm ${p.formerly.join(" + ")}` : kindLabel(p);
  return `${kind} · ${p.communes.length} xã, phường`;
}

function communePopup(c) {
  return (
    `<strong>${esc(c.name)}</strong><br>` +
    `<span class="popup-zip">${esc(c.zip)}</span><br>` +
    `<span class="popup-sub">${esc(c.province.full)}</span>` +
    (c.note ? `<br><span class="popup-note">${esc(c.note)}</span>` : "") +
    `<br><a href="${esc(hrefOf(c))}">Chi tiết</a>`
  );
}

// --- Views ---

function showHome() {
  document.title = `${BASE_TITLE} - 34 tỉnh, thành phố`;
  setBreadcrumb([]);
  setDetail("");
  $("region-filters").hidden = false;
  clearMap();
  frameMap(() => map.setView(HOME_VIEW.center, HOME_VIEW.zoom));

  const list = $("list");
  list.replaceChildren();
  for (const p of model.provinces) {
    const prefixes = prefixRange(p.prefixes);
    addMarker({
      lat: p.lat,
      lng: p.lng,
      color: colorOf(p),
      label: `${p.name} ${prefixes}`,
      popup:
        `<strong>${esc(p.full)}</strong><br>` +
        `<span class="popup-zip">${esc(prefixes)}</span><br>` +
        `<span class="popup-sub">${esc(provinceSummary(p))}</span><br>` +
        `<a href="${esc(hrefOf(p))}">Xem các xã, phường</a>`,
    });
    list.append(row({ href: hrefOf(p), title: p.name, sub: provinceSummary(p), zip: prefixes, drill: true, data: { region: p.region } }));
  }
  applyRegion();
}

function showProvince(province, selected) {
  document.title = selected
    ? `${selected.name} ${selected.zip}, ${province.name} - ${BASE_TITLE}`
    : `${province.full} - mã bưu chính ${prefixRange(province.prefixes)} - ${BASE_TITLE}`;
  setBreadcrumb([HOME_CRUMB, selected ? { label: province.full, href: hrefOf(province) } : { label: province.full }]);
  setDetail(selected ? communeDetail(selected) : "");
  $("region-filters").hidden = true;
  setStatus(`${province.communes.length} xã, phường · mã ${prefixRange(province.prefixes)}`);
  clearMap();

  const list = $("list");
  list.replaceChildren();
  let selectedMarker = null;
  const ordered = selected ? [selected, ...province.communes.filter((c) => c !== selected)] : province.communes;
  for (const c of ordered) {
    const marker = addMarker({ lat: c.lat, lng: c.lng, color: colorOf(province), label: c.zip, popup: communePopup(c) });
    if (c === selected) selectedMarker = marker;
  }
  for (const c of province.communes) {
    const li = row({ href: hrefOf(c), title: c.name, sub: c.lat == null ? "Chưa có vị trí trên bản đồ" : "", zip: c.zip });
    if (c === selected) li.classList.add("active");
    list.append(li);
  }

  frameMap(() => {
    if (selectedMarker) {
      map.setView([selected.lat, selected.lng], Math.max(map.getZoom(), 13));
      selectedMarker.openPopup();
    } else {
      fitPlaces(province.communes);
    }
  });
}

function communeDetail(c) {
  return (
    `<h2>${esc(c.name)}</h2>` +
    `<p class="detail-zip">${esc(c.zip)}</p>` +
    `<p class="detail-sub">${esc(c.province.full)}</p>` +
    (c.note ? `<p class="detail-note">${esc(c.note)}</p>` : "") +
    (c.lat == null
      ? `<p class="detail-note">Chưa xác định được vị trí trên bản đồ.</p>`
      : `<button type="button" class="show-map" data-mode="map">Xem trên bản đồ</button>`)
  );
}

function showResults(query) {
  const results = search(index, query, SEARCH_LIMIT);
  setDetail("");
  $("region-filters").hidden = true;
  setStatus(results.length ? `${results.length === SEARCH_LIMIT ? "Hơn " : ""}${results.length} kết quả` : "Không tìm thấy");
  const list = $("list");
  list.replaceChildren(
    ...results.map(({ item }) =>
      item.kind === "province"
        ? row({ href: hrefOf(item), title: item.name, sub: provinceSummary(item), zip: prefixRange(item.prefixes), drill: true })
        : row({ href: hrefOf(item), title: item.name, sub: item.province.full, zip: item.zip }),
    ),
  );
}

function render() {
  const query = $("search").value.trim();
  if (query) {
    showResults(query);
  } else {
    const view = resolve(model, parseHash(location.hash));
    if (view.view === "home") showHome();
    else showProvince(view.province, view.commune);
  }
  // Phones scroll the whole sidebar, so its top (with the detail card) comes back into view.
  if (isPhone()) $("sidebar").scrollTop = 0;
  else $("list").querySelector(".active")?.scrollIntoView({ block: "nearest" });
  requestAnimationFrame(declutterLabels);
}

// --- Controls ---

function applyRegion() {
  let shown = 0;
  for (const li of $("list").children) {
    li.hidden = !!activeRegion && li.dataset.region !== activeRegion;
    if (!li.hidden) shown++;
  }
  setStatus(`${shown} tỉnh, thành phố`);
}

function buildRegionFilters() {
  const container = $("region-filters");
  for (const [region, color] of Object.entries(REGION_COLORS)) {
    const tag = document.createElement("button");
    tag.type = "button";
    tag.className = "region-tag";
    tag.textContent = region;
    tag.style.setProperty("--region", color);
    tag.addEventListener("click", () => {
      activeRegion = activeRegion === region ? null : region;
      container.querySelectorAll(".region-tag").forEach((t) => t.classList.toggle("active", t === tag && !!activeRegion));
      applyRegion();
    });
    container.append(tag);
  }
}

function setMode(mode) {
  document.body.dataset.mode = mode;
  for (const button of document.querySelectorAll("#mode-toggle button")) {
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  }
  if (mode === "map") {
    map.invalidateSize();
    pendingFrame?.();
    pendingFrame = null;
    requestAnimationFrame(declutterLabels);
  }
}

document.addEventListener("click", (event) => {
  const modeButton = event.target.closest("[data-mode]");
  if (modeButton) setMode(modeButton.dataset.mode);
  // Following a link leaves search mode. A link to the view already shown fires no
  // hashchange, so that case is rendered here.
  const link = event.target.closest("a[href^='#']");
  if (link && $("search").value && link.getAttribute("href") === (location.hash || "#/")) {
    $("search").value = "";
    render();
  }
});

$("search").addEventListener("input", () => model && render());
window.addEventListener("hashchange", () => {
  $("search").value = "";
  if (model) render();
});

buildRegionFilters();
setMode("list");

fetch("data/communes.json")
  .then((r) => {
    if (!r.ok) throw new Error(`data/communes.json: HTTP ${r.status}`);
    return r.json();
  })
  .then((json) => {
    model = buildModel(json);
    index = searchIndex(model);
    $("search").value = new URLSearchParams(location.search).get("q") || "";
    render();
  })
  .catch((error) => {
    $("list").innerHTML = `<li class="list-error">Không tải được dữ liệu (${esc(error.message)}).</li>`;
    throw error;
  });
