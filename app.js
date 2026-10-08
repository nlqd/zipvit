import { buildModel, prefixRange } from "./lib/model.js";
import { fold } from "./lib/text.js";

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

const $ = (id) => document.getElementById(id);
const map = L.map("map").setView(HOME_VIEW.center, HOME_VIEW.zoom);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 18,
}).addTo(map);
const markers = L.layerGroup().addTo(map);

let model = null;
let activeRegion = null;

const esc = (text) =>
  String(text).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

const colorOf = (province) => REGION_COLORS[province.region] || "#666";
const kindLabel = (province) => (province.city ? "Thành phố" : "Tỉnh");

function addMarker({ lat, lng, color, label, popup, onClick }) {
  if (lat == null) return null;
  const marker = L.circleMarker([lat, lng], { radius: 7, fillColor: color, color: "#fff", weight: 2, fillOpacity: 0.85 })
    .bindPopup(popup)
    .addTo(markers);
  if (onClick) marker.on("click", onClick);
  L.marker([lat, lng], {
    icon: L.divIcon({ className: "zip-label", html: esc(label), iconAnchor: [-10, 12] }),
    interactive: false,
  }).addTo(markers);
  return marker;
}

function row({ title, sub, zip, drill, onClick, data = {} }) {
  const li = document.createElement("li");
  Object.assign(li.dataset, data);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "row";
  button.innerHTML =
    `<span class="row-text"><span class="item-name">${esc(title)}</span>` +
    (sub ? `<span class="item-sub">${esc(sub)}</span>` : "") +
    `</span>` +
    (zip ? `<span class="item-zip">${esc(zip)}</span>` : "") +
    (drill ? `<span class="drill-arrow" aria-hidden="true">&rsaquo;</span>` : "");
  button.addEventListener("click", onClick);
  li.append(button);
  return li;
}

function setBreadcrumb(parts) {
  const nav = $("breadcrumb");
  nav.hidden = parts.length === 0;
  nav.replaceChildren();
  parts.forEach((part, i) => {
    if (i > 0) nav.insertAdjacentHTML("beforeend", '<span class="sep" aria-hidden="true">&rsaquo;</span>');
    const el = document.createElement(part.onClick ? "button" : "span");
    el.textContent = part.label;
    if (part.onClick) {
      el.type = "button";
      el.addEventListener("click", part.onClick);
    }
    nav.append(el);
  });
}

function provinceSummary(p) {
  const formerly = p.formerly.length > 1 ? `Gồm ${p.formerly.join(" + ")}` : kindLabel(p);
  return `${formerly} · ${p.communes.length} xã, phường`;
}

function showHome() {
  document.title = `${BASE_TITLE} - 34 tỉnh, thành phố`;
  setBreadcrumb([]);
  $("search").value = "";
  $("region-filters").hidden = false;
  markers.clearLayers();
  map.setView(HOME_VIEW.center, HOME_VIEW.zoom);

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
        `<span class="popup-zip">${esc(prefixes)}xxx</span><br>` +
        `<span class="popup-sub">${esc(provinceSummary(p))}</span>`,
      onClick: () => showProvince(p),
    });
    list.append(
      row({
        title: p.name,
        sub: provinceSummary(p),
        zip: prefixes,
        drill: true,
        onClick: () => showProvince(p),
        data: { search: fold(`${p.full} ${p.formerly.join(" ")} ${p.prefixes.join(" ")}`), region: p.region },
      }),
    );
  }
  applyFilter();
}

function showProvince(province, selected = null) {
  document.title = `${selected ? `${selected.name}, ` : ""}${province.name} - ${BASE_TITLE}`;
  setBreadcrumb([{ label: "34 tỉnh, thành phố", onClick: showHome }, { label: province.full }]);
  $("search").value = "";
  $("region-filters").hidden = true;
  markers.clearLayers();

  const list = $("list");
  list.replaceChildren();
  const placed = province.communes.filter((c) => c.lat != null);
  if (placed.length) map.fitBounds(L.latLngBounds(placed.map((c) => [c.lat, c.lng])).pad(0.1));
  for (const c of province.communes) {
    const marker = addMarker({
      lat: c.lat,
      lng: c.lng,
      color: colorOf(province),
      label: c.zip,
      popup: communePopup(c),
    });
    const li = row({
      title: c.name,
      sub: c.lat == null ? "Chưa có vị trí trên bản đồ" : "",
      zip: c.zip,
      onClick: () => selectCommune(c, marker, li),
      data: { search: fold(`${c.name} ${c.zip}`) },
    });
    list.append(li);
    if (c === selected) selectCommune(c, marker, li);
  }
}

function communePopup(c) {
  return (
    `<strong>${esc(c.name)}</strong><br>` +
    `<span class="popup-zip">${esc(c.zip)}</span><br>` +
    `<span class="popup-sub">${esc(c.province.full)}</span>` +
    (c.note ? `<br><span class="popup-note">${esc(c.note)}</span>` : "")
  );
}

function selectCommune(c, marker, li) {
  document.querySelectorAll("#list li.active").forEach((el) => el.classList.remove("active"));
  li.classList.add("active");
  if (marker) {
    map.setView([c.lat, c.lng], Math.max(map.getZoom(), 12));
    marker.openPopup();
  }
}

function applyFilter() {
  const query = fold($("search").value);
  for (const li of $("list").children) {
    const matchesSearch = !query || li.dataset.search.includes(query);
    const matchesRegion = !activeRegion || li.dataset.region === activeRegion;
    li.hidden = !(matchesSearch && matchesRegion);
  }
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
      applyFilter();
    });
    container.append(tag);
  }
}

$("search").addEventListener("input", applyFilter);
buildRegionFilters();

fetch("data/communes.json")
  .then((r) => {
    if (!r.ok) throw new Error(`data/communes.json: HTTP ${r.status}`);
    return r.json();
  })
  .then((json) => {
    model = buildModel(json);
    showHome();
    const q = new URLSearchParams(location.search).get("q");
    if (q) {
      $("search").value = q;
      applyFilter();
    }
  })
  .catch((error) => {
    $("list").innerHTML = `<li class="list-error">Không tải được dữ liệu (${esc(error.message)}).</li>`;
    throw error;
  });
