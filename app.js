import { buildModel, attachOldWards, prefixRange, routeOf, resolve } from "./lib/model.js";
import { parseHash, formatHash } from "./lib/route.js";
import { searchIndex, search } from "./lib/search.js";
import { declutter } from "./lib/declutter.js";
import { REGIONS } from "./lib/regions.js";

const HOME_VIEW = { center: [16.0, 106.0], zoom: 6 };
const BASE_TITLE = "Mã Bưu Chính Việt Nam";
const SEARCH_LIMIT = 50;
const OLD_COLOR = "#757575";

const $ = (id) => document.getElementById(id);
const map = L.map("map", { zoomControl: false }).setView(HOME_VIEW.center, HOME_VIEW.zoom);
L.control.zoom({ zoomInTitle: "Phóng to", zoomOutTitle: "Thu nhỏ" }).addTo(map);
map.attributionControl.setPrefix(
  map.attributionControl.options.prefix.replace("A JavaScript library for interactive maps", "Thư viện JavaScript cho bản đồ tương tác"),
);
map.on("popupopen", (e) => e.popup.getElement()?.querySelector(".leaflet-popup-close-button")?.setAttribute("aria-label", "Đóng"));
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; Những người đóng góp <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 18,
}).addTo(map);
const markers = L.layerGroup().addTo(map);
let labels = [];

let model = null;
let index = null;
let activeRegion = null;
let oldWardsLoad = null;

const esc = (text) =>
  String(text).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
const hrefOf = (item) => formatHash(routeOf(item)) || "#/";
const colorOf = (province) => REGIONS[province.region] || "#666";
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
  if (placed.length) map.fitBounds(L.latLngBounds(placed.map((p) => [p.lat, p.lng])).pad(0.1), { maxZoom: 14 });
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
const OLD_CRUMB = { label: "Địa chỉ cũ", href: "#/cu" };

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
    formerWardsHtml(c) +
    (c.lat == null
      ? `<p class="detail-note">Chưa xác định được vị trí trên bản đồ.</p>`
      : `<button type="button" class="show-map" data-mode="map">Xem trên bản đồ</button>`)
  );
}

function formerWardsHtml(c) {
  if (!model.old) return `<p class="detail-sub">Đang tải các xã, phường cũ…</p>`;
  if (!c.formerWards.length) return "";
  const links = c.formerWards
    .map((w) => {
      const partial = w.targets.find((t) => t.commune === c).partial ? " (một phần)" : "";
      return `<li><a href="${esc(hrefOf(w))}">${esc(w.name)}</a>${partial}</li>`;
    })
    .join("");
  return `<p class="detail-label">Trước 01/07/2025 gồm:</p><ul class="former">${links}</ul>`;
}

// --- Old addresses (before 1 July 2025) ---

function loadOldWards() {
  oldWardsLoad ??= fetch("data/old-wards.json?v=4940d86077")
    .then((r) => {
      if (!r.ok) throw new Error(`data/old-wards.json: HTTP ${r.status}`);
      return r.json();
    })
    .then((json) => {
      attachOldWards(model, json);
      index = searchIndex(model);
      render();
    })
    .catch((error) => {
      setStatus(`Không tải được dữ liệu địa chỉ cũ (${error.message}).`);
      oldWardsLoad = null;
      throw error;
    });
  return oldWardsLoad;
}

function nowText(w) {
  const [first, ...rest] = w.targets;
  const names = rest.length ? `chia cho ${w.targets.length} xã, phường` : first.commune.name;
  return `${w.approximate ? "nay (ước tính)" : "nay"}: ${names}`;
}

function oldWardRow(w, context) {
  const single = w.targets.length === 1 ? w.targets[0].commune : null;
  return row({ href: hrefOf(w), title: w.name, sub: [context, nowText(w)].filter(Boolean).join(" · "), zip: single?.zip || "" });
}

function oldWardPopup(w) {
  return (
    `<strong>${esc(w.name)}</strong> <span class="popup-sub">(cũ)</span><br>` +
    `<span class="popup-sub">${esc(nowText(w))}</span><br>` +
    `<a href="${esc(hrefOf(w))}">Chi tiết</a>`
  );
}

function approximationNote(w) {
  if (!w.approximate) return "";
  const guess = w.via
    ? `có lẽ đã nhập vào <a href="${esc(hrefOf(w.via))}">${esc(w.via.name)}</a> (${esc(w.via.district.name)}) trước năm 2025`
    : "theo quận, huyện cũ";
  return (
    `<p class="detail-note">Đơn vị này không có trong bảng chuyển đổi của Cục Thống kê vì đã thay đổi trước năm 2025. ` +
    `Kết quả trên là ước tính: ${guess}.</p>`
  );
}

function oldWardDetail(w) {
  const where = `${w.district.name}, ${w.district.province.name}`;
  const targets = w.targets
    .map(
      ({ commune, partial }) =>
        `<li><a class="row" href="${esc(hrefOf(commune))}"><span class="row-text">` +
        `<span class="item-name">${esc(commune.name)}</span>` +
        `<span class="item-sub">${esc(commune.province.full)}${partial ? " · một phần" : ""}</span></span>` +
        `<span class="item-zip">${esc(commune.zip)}</span></a></li>`,
    )
    .join("");
  const split = w.targets.length > 1
    ? `<p class="detail-sub">Đơn vị này được chia cho ${w.targets.length} xã, phường mới; mã bưu chính tùy theo địa chỉ thuộc phần nào.</p>`
    : "";
  return (
    `<h2>${esc(w.name)}</h2>` +
    `<p class="detail-sub">${esc(where)} (trước 01/07/2025)${w.zip ? ` · mã cũ ${esc(w.zip)}` : ""}</p>` +
    `<p class="detail-label">Nay thuộc:</p><ul class="targets">${targets}</ul>` +
    split +
    approximationNote(w) +
    `<button type="button" class="show-map" data-mode="map">Xem trên bản đồ</button>`
  );
}

function newProvincesOf(oldProvince) {
  const names = new Set(
    oldProvince.districts.flatMap((d) => d.wards.flatMap((w) => w.targets.map((t) => t.commune.province.name))),
  );
  return [...names].join(", ");
}

function showOld(view) {
  $("region-filters").hidden = true;
  setDetail("");
  clearMap();
  const list = $("list");
  list.replaceChildren();
  if (view.pending) {
    document.title = `Tra địa chỉ cũ - ${BASE_TITLE}`;
    setBreadcrumb([{ label: OLD_CRUMB.label }]);
    setStatus("Đang tải dữ liệu địa chỉ cũ…");
    loadOldWards();
    return;
  }
  const { oldProvince, oldDistrict, oldWard } = view;
  if (oldWard) return showOldWard(oldWard);
  if (oldDistrict) return showOldDistrict(oldDistrict);

  if (oldProvince) {
    document.title = `${oldProvince.name} (cũ) - Tra địa chỉ cũ - ${BASE_TITLE}`;
    setBreadcrumb([OLD_CRUMB, { label: oldProvince.name }]);
    setStatus(`${oldProvince.districts.length} quận, huyện cũ · nay thuộc ${newProvincesOf(oldProvince)}`);
    for (const d of oldProvince.districts) list.append(row({ href: hrefOf(d), title: d.name, sub: `${d.wards.length} xã, phường`, drill: true }));
    frameMap(() => fitPlaces(oldProvince.districts.flatMap((d) => d.wards)));
    return;
  }
  document.title = `Tra địa chỉ cũ - ${BASE_TITLE}`;
  setBreadcrumb([{ label: OLD_CRUMB.label }]);
  setStatus("Chọn tỉnh, quận, huyện và xã, phường trước 01/07/2025 để xem mã bưu chính mới.");
  for (const p of model.old.provinces) list.append(row({ href: hrefOf(p), title: p.name, sub: `nay thuộc ${newProvincesOf(p)}`, drill: true }));
  frameMap(() => map.setView(HOME_VIEW.center, HOME_VIEW.zoom));
}

function showOldDistrict(district, selected) {
  const province = district.province;
  document.title = selected
    ? `${selected.name}, ${district.name} (cũ) - mã bưu chính mới - ${BASE_TITLE}`
    : `${district.name}, ${province.name} (cũ) - Tra địa chỉ cũ - ${BASE_TITLE}`;
  setBreadcrumb([
    OLD_CRUMB,
    { label: province.name, href: hrefOf(province) },
    selected ? { label: district.name, href: hrefOf(district) } : { label: district.name },
  ]);
  setStatus(`${district.wards.length} xã, phường cũ`);
  const list = $("list");
  for (const w of district.wards) {
    const li = oldWardRow(w);
    if (w === selected) li.classList.add("active");
    list.append(li);
  }
  if (selected) return;
  for (const w of district.wards) {
    const single = w.targets.length === 1 ? w.targets[0].commune : null;
    addMarker({ lat: w.lat, lng: w.lng, color: OLD_COLOR, label: single ? single.zip : "…", popup: oldWardPopup(w) });
  }
  frameMap(() => fitPlaces(district.wards));
}

function showOldWard(w) {
  setDetail(oldWardDetail(w));
  showOldDistrict(w.district, w);
  for (const { commune } of w.targets) {
    addMarker({ lat: commune.lat, lng: commune.lng, color: colorOf(commune.province), label: commune.zip, popup: communePopup(commune) });
  }
  const oldMarker = addMarker({ lat: w.lat, lng: w.lng, color: OLD_COLOR, label: `${w.name} (cũ)`, popup: oldWardPopup(w) });
  frameMap(() => {
    fitPlaces([w, ...w.targets.map((t) => t.commune)]);
    oldMarker?.openPopup();
  });
}

function showResults(query) {
  const results = search(index, query, SEARCH_LIMIT);
  setBreadcrumb([]);
  setDetail("");
  $("region-filters").hidden = true;
  const loading = model.old ? "" : " · đang tải thêm địa chỉ cũ…";
  setStatus(`${results.length ? `${results.length === SEARCH_LIMIT ? "Hơn " : ""}${results.length} kết quả` : "Không tìm thấy"}${loading}`);
  const list = $("list");
  list.replaceChildren(...results.map(({ item }) => resultRow(item)));
}

function resultRow(item) {
  if (item.kind === "province") {
    return row({ href: hrefOf(item), title: item.name, sub: provinceSummary(item), zip: prefixRange(item.prefixes), drill: true });
  }
  if (item.kind === "commune") return row({ href: hrefOf(item), title: item.name, sub: item.province.full, zip: item.zip });
  const where = `Cũ: ${item.district.name}, ${item.district.province.name}${item.zip ? ` · mã cũ ${item.zip}` : ""}`;
  return oldWardRow(item, where);
}

function render() {
  const query = $("search").value.trim();
  if (query) {
    showResults(query);
  } else {
    const view = resolve(model, parseHash(location.hash));
    setTab(view.view === "old" ? "old" : "new");
    if (view.view === "home") showHome();
    else if (view.view === "old") showOld(view);
    else showProvince(view.province, view.commune);
    if (view.view === "commune") loadOldWards();
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
  for (const [region, color] of Object.entries(REGIONS)) {
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

function setTab(tab) {
  for (const link of document.querySelectorAll("#tabs a")) {
    if (link.dataset.tab === tab) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
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
$("search").addEventListener("focus", () => model && loadOldWards(), { once: true });
window.addEventListener("hashchange", () => {
  $("search").value = "";
  if (model) render();
});

buildRegionFilters();
setMode("list");

fetch("data/communes.json?v=dc87f92a63")
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
