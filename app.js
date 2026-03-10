var REGION_COLORS = {
  "Red River Delta": "#e53935",
  "Northeast": "#8e24aa",
  "Northwest": "#3949ab",
  "North Central Coast": "#00897b",
  "South Central Coast": "#f9a825",
  "Central Highlands": "#6d4c41",
  "Southeast": "#fb8c00",
  "Mekong Delta": "#43a047",
};

var map = L.map("map").setView([16.0, 106.0], 6);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 18,
}).addTo(map);

// State
var currentMarkers = [];
var detailData = null;
var currentLevel = "province";
var currentProvince = null;
var currentOldProvince = null;
var currentDistrict = null;
var activeRegion = null;

// Index old provinces by slug for fast lookup
var oldBySlug = {};
VIETNAM_ZIPCODES.forEach(function (p) { oldBySlug[p.slug] = p; });

// Load detailed scrape data, re-render when ready
fetch("data/provinces.json")
  .then(function (r) { return r.ok ? r.json() : null; })
  .then(function (data) {
    if (data) {
      detailData = {};
      data.forEach(function (p) { detailData[p.slug] = p; });
      if (currentLevel === "province") showProvinces();
    }
  })
  .catch(function () { detailData = null; });

function clearMarkers() {
  currentMarkers.forEach(function (m) { map.removeLayer(m); });
  currentMarkers = [];
}

function addMarker(lat, lng, color, label, popupHtml, onClick) {
  var marker = L.circleMarker([lat, lng], {
    radius: 7,
    fillColor: color,
    color: "#fff",
    weight: 2,
    fillOpacity: 0.85,
  }).addTo(map);

  marker.bindPopup(popupHtml);
  if (onClick) marker.on("click", onClick);

  var labelMarker = L.marker([lat, lng], {
    icon: L.divIcon({
      className: "zip-label",
      html: label,
      iconAnchor: [-10, 12],
    }),
  }).addTo(map);

  currentMarkers.push(marker, labelMarker);
  return marker;
}

// --- Breadcrumb ---

function updateBreadcrumb() {
  var bc = document.getElementById("breadcrumb");
  if (currentLevel === "province") {
    bc.className = "";
    bc.innerHTML = "";
    return;
  }
  bc.className = "visible";
  var parts = ['<a onclick="showProvinces()">34 Provinces</a>'];

  if (currentLevel === "old-province" && currentProvince) {
    parts.push('<span class="sep">&rsaquo;</span><span>' + currentProvince.name + '</span>');
  }
  if (currentLevel === "district" && currentProvince && currentOldProvince) {
    parts.push('<span class="sep">&rsaquo;</span><a onclick="showOldProvinces(\'' + currentProvince.slug + '\')">' + currentProvince.name + '</a>');
    parts.push('<span class="sep">&rsaquo;</span><span>' + oldBySlug[currentOldProvince].name + '</span>');
  }
  if (currentLevel === "ward" && currentProvince && currentOldProvince && currentDistrict) {
    parts.push('<span class="sep">&rsaquo;</span><a onclick="showOldProvinces(\'' + currentProvince.slug + '\')">' + currentProvince.name + '</a>');
    parts.push('<span class="sep">&rsaquo;</span><a onclick="showDistricts(\'' + currentProvince.slug + '\', \'' + currentOldProvince + '\')">' + oldBySlug[currentOldProvince].name + '</a>');
    parts.push('<span class="sep">&rsaquo;</span><span>' + currentDistrict.name + '</span>');
  }
  bc.innerHTML = parts.join("");
}

// --- Province level (34 new provinces) ---

function showProvinces() {
  currentLevel = "province";
  currentProvince = null;
  currentOldProvince = null;
  currentDistrict = null;
  activeRegion = null;

  clearMarkers();
  updateBreadcrumb();
  document.getElementById("search").value = "";
  document.getElementById("region-filters").style.display = "";
  buildRegionFilters();
  map.setView([16.0, 106.0], 6);

  var list = document.getElementById("list");
  list.innerHTML = "";

  PROVINCE_MERGERS.forEach(function (merger) {
    var oldProvs = merger.old.map(function (s) { return oldBySlug[s]; }).filter(Boolean);
    if (oldProvs.length === 0) return;

    // Use the first old province's coordinates and region as primary
    var primary = oldBySlug[merger.slug] || oldProvs[0];
    var color = REGION_COLORS[primary.region] || "#666";

    // Average coordinates for merged provinces
    var lat = oldProvs.reduce(function (s, p) { return s + p.lat; }, 0) / oldProvs.length;
    var lng = oldProvs.reduce(function (s, p) { return s + p.lng; }, 0) / oldProvs.length;

    var isMerged = merger.old.length > 1;
    var mergedNames = isMerged ? oldProvs.map(function (p) { return p.name; }).join(" + ") : "";
    var zipCodes = oldProvs.map(function (p) { return p.zipCode; });
    var displayZip = zipCodes[0] + (zipCodes.length > 1 ? "..." : "");

    // Place markers for each constituent province
    oldProvs.forEach(function (p) {
      addMarker(p.lat, p.lng, color, p.zipCode,
        "<strong>" + merger.name + "</strong>" +
        (isMerged ? '<br/><span style="font-size:0.85em;color:#666">Includes: ' + mergedNames + "</span>" : "") +
        '<br/><span style="font-family:monospace;font-size:1.1em;color:' + color + ';font-weight:700">' + p.zipCode + "</span>" +
        ' <span style="color:#888;font-size:0.85em">(' + p.name + ")</span>" +
        '<br/><span style="font-size:0.85em;color:#666">' + primary.region + "</span>",
        function () { showOldProvinces(merger.slug); }
      );
    });

    var li = document.createElement("li");
    li.dataset.name = merger.name.toLowerCase();
    li.dataset.nameEn = oldProvs.map(function (p) { return p.nameEn.toLowerCase(); }).join(" ");
    li.dataset.zip = zipCodes.join(" ");
    li.dataset.region = primary.region;
    li.innerHTML =
      '<span class="drill-arrow">&#9654;</span>' +
      '<span class="item-zip">' + displayZip + "</span>" +
      '<div class="item-name">' + merger.name + "</div>" +
      (isMerged ? '<div class="item-sub">' + mergedNames + "</div>" : '<div class="item-name-en">' + primary.nameEn + "</div>") +
      '<div class="item-region">' + primary.region + "</div>";
    li.addEventListener("click", function () { showOldProvinces(merger.slug); });
    list.appendChild(li);
  });
}

function buildRegionFilters() {
  var container = document.getElementById("region-filters");
  container.innerHTML = "";
  Object.keys(REGION_COLORS).forEach(function (region) {
    var tag = document.createElement("span");
    tag.className = "region-tag";
    tag.textContent = region;
    tag.addEventListener("click", function () {
      if (activeRegion === region) {
        activeRegion = null;
        tag.classList.remove("active");
        tag.style.background = "";
        tag.style.color = "";
      } else {
        document.querySelectorAll(".region-tag").forEach(function (t) {
          t.classList.remove("active");
          t.style.background = "";
          t.style.color = "";
        });
        activeRegion = region;
        tag.classList.add("active");
        tag.style.background = REGION_COLORS[region];
        tag.style.color = "#fff";
      }
      applyFilter();
    });
    container.appendChild(tag);
  });
}

// --- Old province level (constituent provinces of a merged province) ---

function showOldProvinces(mergerSlug) {
  var merger = PROVINCE_MERGERS.find(function (m) { return m.slug === mergerSlug; });
  if (!merger) return;

  // If only one old province, skip directly to districts
  if (merger.old.length === 1) {
    showDistricts(mergerSlug, merger.old[0]);
    return;
  }

  currentLevel = "old-province";
  currentProvince = merger;
  currentOldProvince = null;
  currentDistrict = null;

  clearMarkers();
  updateBreadcrumb();
  document.getElementById("search").value = "";
  document.getElementById("region-filters").style.display = "none";

  var oldProvs = merger.old.map(function (s) { return oldBySlug[s]; }).filter(Boolean);
  var bounds = L.latLngBounds(oldProvs.map(function (p) { return [p.lat, p.lng]; }));
  map.fitBounds(bounds.pad(0.3));

  var list = document.getElementById("list");
  list.innerHTML = "";

  oldProvs.forEach(function (p) {
    var color = REGION_COLORS[p.region] || "#666";
    var detail = detailData && detailData[p.slug];
    var districtCount = detail ? detail.districts.length : 0;

    addMarker(p.lat, p.lng, color, p.zipCode,
      "<strong>" + p.name + "</strong><br/>" +
      '<span style="color:#888">' + p.nameEn + "</span><br/>" +
      '<span style="font-family:monospace;font-size:1.1em;color:' + color + ';font-weight:700">' + p.zipCode + "</span>" +
      (districtCount ? '<br/><span style="font-size:0.85em;color:#666">' + districtCount + " districts</span>" : ""),
      function () { showDistricts(mergerSlug, p.slug); }
    );

    var li = document.createElement("li");
    li.dataset.name = p.name.toLowerCase();
    li.dataset.nameEn = p.nameEn.toLowerCase();
    li.dataset.zip = p.zipCode;
    li.innerHTML =
      '<span class="drill-arrow">&#9654;</span>' +
      '<span class="item-zip">' + p.zipCode + "</span>" +
      '<div class="item-name">' + p.name + "</div>" +
      '<div class="item-name-en">' + p.nameEn + "</div>" +
      (districtCount ? '<div class="item-sub">' + districtCount + " districts</div>" : "");
    li.addEventListener("click", function () { showDistricts(mergerSlug, p.slug); });
    list.appendChild(li);
  });
}

// --- District level ---

function showDistricts(mergerSlug, oldSlug) {
  var detail = detailData && detailData[oldSlug];
  var provInfo = oldBySlug[oldSlug];
  if (!provInfo) return;

  var merger = PROVINCE_MERGERS.find(function (m) { return m.slug === mergerSlug; });

  if (!detail || !detail.districts || detail.districts.length === 0) {
    map.setView([provInfo.lat, provInfo.lng], 10);
    return;
  }

  currentLevel = "district";
  currentProvince = merger;
  currentOldProvince = oldSlug;
  currentDistrict = null;

  clearMarkers();
  updateBreadcrumb();
  document.getElementById("search").value = "";
  document.getElementById("region-filters").style.display = "none";

  // If districts have coordinates, fit bounds; else center on province
  var geocodedDistricts = detail.districts.filter(function (d) { return d.lat && d.lng; });
  if (geocodedDistricts.length > 1) {
    map.fitBounds(L.latLngBounds(geocodedDistricts.map(function (d) { return [d.lat, d.lng]; })).pad(0.2));
  } else {
    map.setView([provInfo.lat, provInfo.lng], 10);
  }

  var list = document.getElementById("list");
  list.innerHTML = "";

  detail.districts.forEach(function (d, idx) {
    var angle = (idx / detail.districts.length) * 2 * Math.PI;
    var dlat = d.lat || (provInfo.lat + 0.08 * Math.cos(angle));
    var dlng = d.lng || (provInfo.lng + 0.08 * Math.sin(angle));

    var hasWards = d.wards && d.wards.length > 0;

    addMarker(dlat, dlng, "#1976d2", d.zip,
      "<strong>" + d.name + "</strong><br/>" +
      '<span style="font-family:monospace;font-size:1.1em;color:#1976d2;font-weight:700">' + d.zip + "</span><br/>" +
      '<span style="font-size:0.85em;color:#666">' + provInfo.name + "</span>" +
      (hasWards ? '<br/><span style="font-size:0.8em;color:#999">' + d.wards.length + " wards</span>" : ""),
      hasWards ? (function (district) { return function () { showWards(mergerSlug, oldSlug, district); }; })(d) : null
    );

    var li = document.createElement("li");
    li.dataset.name = d.name.toLowerCase();
    li.dataset.zip = d.zip;
    li.innerHTML =
      (hasWards ? '<span class="drill-arrow">&#9654;</span>' : "") +
      '<span class="item-zip">' + d.zip + "</span>" +
      '<div class="item-name">' + d.name + "</div>" +
      (hasWards ? '<div class="item-sub">' + d.wards.length + " wards</div>" : "");
    li.addEventListener("click", function () {
      if (hasWards) {
        showWards(mergerSlug, oldSlug, d);
      } else {
        map.setView([dlat, dlng], 13);
      }
    });
    list.appendChild(li);
  });
}

// --- Ward level ---

function showWards(mergerSlug, oldSlug, district) {
  var detail = detailData && detailData[oldSlug];
  var provInfo = oldBySlug[oldSlug];
  if (!detail || !provInfo) return;

  var merger = PROVINCE_MERGERS.find(function (m) { return m.slug === mergerSlug; });

  currentLevel = "ward";
  currentProvince = merger;
  currentOldProvince = oldSlug;
  currentDistrict = district;

  clearMarkers();
  updateBreadcrumb();
  document.getElementById("search").value = "";
  document.getElementById("region-filters").style.display = "none";

  map.setView([provInfo.lat, provInfo.lng], 13);

  var list = document.getElementById("list");
  list.innerHTML = "";

  // Use district center if geocoded, else province center
  var centerLat = district.lat || provInfo.lat;
  var centerLng = district.lng || provInfo.lng;
  var geocodedWards = district.wards.filter(function (w) { return w.lat && w.lng; });
  if (geocodedWards.length > 1) {
    map.fitBounds(L.latLngBounds(geocodedWards.map(function (w) { return [w.lat, w.lng]; })).pad(0.2));
  } else if (district.lat && district.lng) {
    map.setView([district.lat, district.lng], 13);
  }

  district.wards.forEach(function (w, idx) {
    var angle = (idx / district.wards.length) * 2 * Math.PI;
    var wlat = w.lat || (centerLat + 0.02 * Math.cos(angle));
    var wlng = w.lng || (centerLng + 0.02 * Math.sin(angle));

    addMarker(wlat, wlng, "#43a047", w.zip,
      "<strong>" + w.name + "</strong><br/>" +
      '<span style="font-family:monospace;font-size:1.1em;color:#43a047;font-weight:700">' + w.zip + "</span><br/>" +
      '<span style="font-size:0.85em;color:#666">' + district.name + ", " + provInfo.name + "</span>"
    );

    var li = document.createElement("li");
    li.dataset.name = w.name.toLowerCase();
    li.dataset.zip = w.zip;
    li.innerHTML =
      '<span class="item-zip">' + w.zip + "</span>" +
      '<div class="item-name">' + w.name + "</div>";
    li.addEventListener("click", function () {
      map.setView([wlat, wlng], 15);
    });
    list.appendChild(li);
  });
}

// --- Search/filter ---

function applyFilter() {
  var query = document.getElementById("search").value.toLowerCase().trim();
  var items = document.querySelectorAll("#list li");
  items.forEach(function (li) {
    var matchesSearch = !query ||
      (li.dataset.name && li.dataset.name.indexOf(query) >= 0) ||
      (li.dataset.nameEn && li.dataset.nameEn.indexOf(query) >= 0) ||
      (li.dataset.zip && li.dataset.zip.indexOf(query) >= 0);
    var matchesRegion = !activeRegion || li.dataset.region === activeRegion;
    li.style.display = (matchesSearch && matchesRegion) ? "" : "none";
  });
}

document.getElementById("search").addEventListener("input", applyFilter);

// --- Init ---
showProvinces();
