let map;
let boundaryPolygon = null;
let sampleMarkers = [];
let roverMarker = null;
let routePolyline = null;
let currentPoints = [];
let drawingManager;
let locationWatchId = null;
let soilResults = [];
let missionAccepted = false;
let missionRunning = false;
let roverStartPosition = null;

/* ========== ONBOARDING ========== */
function setupOnboarding() {
  const onboarding = document.getElementById("onboarding");
  const buyModal = document.getElementById("buyModal");
  const appShell = document.getElementById("appShell");
  const hasBtn = document.getElementById("hasAgriBotBtn");
  const noBtn = document.getElementById("noAgriBotBtn");
  const backBtn = document.getElementById("buyBackBtn");
  const exploreBtn = document.getElementById("exploreAnywayBtn");
  const resetBtn = document.getElementById("resetChoiceBtn");

  if (!onboarding || !appShell) return;

  hasBtn?.addEventListener("click", () => {
    hideOnboarding();
    showApp();
  });

  noBtn?.addEventListener("click", () => {
    onboarding.hidden = true;
    if (buyModal) buyModal.hidden = false;
  });

  backBtn?.addEventListener("click", () => {
    if (buyModal) buyModal.hidden = true;
    onboarding.hidden = false;
  });

  exploreBtn?.addEventListener("click", () => {
    if (buyModal) buyModal.hidden = true;
    hideOnboarding();
    showApp();
  });

  resetBtn?.addEventListener("click", () => {
    onboarding.hidden = false;
    if (buyModal) buyModal.hidden = true;
    appShell.hidden = true;
    showToast("Onboarding is visible now.");
  });

  // The AgriBot choice is intentionally NOT persisted (no localStorage) —
  // onboarding is shown on every visit/reload.
  onboarding.hidden = false;
  if (buyModal) buyModal.hidden = true;
  appShell.hidden = true;
}
function hideOnboarding() {
  const onboarding = document.getElementById("onboarding");
  onboarding.hidden = true;
}

function showApp() {
  const appShell = document.getElementById("appShell");
  const buyModal = document.getElementById("buyModal");
  appShell.hidden = false;
  buyModal.hidden = true;
  if (typeof lucide !== "undefined") lucide.createIcons();
}

/* ========== SOIL RESULTS ========== */
function resultsEndpointFromMissionUrl(missionUrl) {
  try {
    const u = new URL(missionUrl);
    // Replace trailing /mission (with optional slash) with /results
    let path = u.pathname.replace(/\/?$/, "");
    if (path.toLowerCase().endsWith("/mission")) {
      path = path.slice(0, -"/mission".length) + "/results";
    } else {
      path = path + "/results";
    }
    u.pathname = path;
    return u.toString();
  } catch {
    // Fallback string replace
    return missionUrl.replace(/\/mission\/?$/i, "/results").replace(/\/?$/, "") + "/results";
  }
}

function renderSoilResults(results) {
  soilResults = Array.isArray(results) ? results : [];
  const tbody = document.getElementById("resultsBody");
  const status = document.getElementById("resultsStatus");
  const count = document.getElementById("soilSampleCount");
  const state = document.getElementById("soilResultState");

  if (!tbody || !status) return;
  if (!soilResults.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-row">NO SOIL DATA YET</td></tr>';
    status.textContent = "NO SOIL DATA YET — Send the AgriBot on a mission and return here when measurements are available.";
    if (count) count.textContent = "0";
    if (state) state.textContent = "WAITING";
    return;
  }

  status.textContent = `${soilResults.length} sample result${soilResults.length === 1 ? "" : "s"} loaded from rover data.`;
  if (count) count.textContent = String(soilResults.length);
  if (state) state.textContent = "MEASUREMENTS RECEIVED";

  tbody.innerHTML = soilResults.map((r, i) => {
    const id = r?.point_id ?? r?.id ?? i + 1;
    const moisture = r?.moisture != null && Number.isFinite(Number(r.moisture)) ? `${Number(r.moisture).toFixed(1)}%` : "—";
    const ph = r?.ph != null && Number.isFinite(Number(r.ph)) ? Number(r.ph).toFixed(1) : "—";
    const condition = r?.condition != null && String(r.condition).trim() ? String(r.condition).trim() : "—";
    const pointLabel = typeof id === "number" || /^\d+$/.test(String(id)) ? `P${String(id).padStart(2, "0")}` : String(id);
    return `<tr><td>${pointLabel}</td><td>${moisture}</td><td>${ph}</td><td><span class="condition-pill">${condition}</span></td></tr>`;
  }).join("");

  renderSoilMap();
}

function renderSoilMap(){
  const wrap=document.getElementById("soilResultsMap");
  const el=document.getElementById("soilMap");
  if(!wrap || !el || !soilResults.length || typeof google==="undefined" || !google.maps) return;
  wrap.hidden=false;
  if(!window.soilMapInstance){
    window.soilMapInstance=new google.maps.Map(el,{center:{lat:20.2961,lng:85.8245},zoom:15,mapTypeId:"satellite",streetViewControl:false,fullscreenControl:true});
  }
  const markers=[];
  const bounds=new google.maps.LatLngBounds();
  soilResults.forEach((r,i)=>{
    const lat=Number(r.latitude ?? r.lat), lng=Number(r.longitude ?? r.lng ?? r.lon);
    if(!Number.isFinite(lat)||!Number.isFinite(lng)) return;
    const condition=String(r.condition||"").toUpperCase();
    const marker=new google.maps.Marker({position:{lat,lng},map:window.soilMapInstance,title:`P${i+1} ${condition}`});
    markers.push(marker); bounds.extend({lat,lng});
  });
  if(markers.length) window.soilMapInstance.fitBounds(bounds);
}
async function getRoverResults() {
  const missionUrl = document.getElementById("roverUrl")?.value.trim();
  if (!missionUrl) {
    showToast("Enter the rover endpoint first.");
    return;
  }
  const resultsUrl = resultsEndpointFromMissionUrl(missionUrl);
  const status = document.getElementById("resultsStatus");
  status.textContent = `Requesting ${resultsUrl}…`;
  const btn = document.getElementById("getResultsBtn");
  btn.disabled = true;

  try {
    const r = await fetch(resultsUrl, { method: "GET" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const list = data.results || data.samples || (Array.isArray(data) ? data : []);
    renderSoilResults(list);
    if (list.length) {
      showToast(`Loaded ${list.length} soil result(s).`);
    } else {
      showToast("Rover returned no results.");
    }
  } catch (e) {
    status.textContent = `Could not fetch results: ${e.message}`;
    showToast("Failed to get rover results.");
  } finally {
    btn.disabled = false;
  }
}

function setupResultsImport() {
  const input = document.getElementById("importResultsInput");
  if (!input) return;
  input.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const list = data.results || data.samples || (Array.isArray(data) ? data : []);
      if (!Array.isArray(list) || !list.length) {
        showToast("JSON has no results array.");
        document.getElementById("resultsStatus").textContent = "Import failed: no results found.";
        return;
      }
      renderSoilResults(list);
      showToast(`Imported ${list.length} soil result(s).`);
    } catch (err) {
      showToast("Invalid results JSON.");
      document.getElementById("resultsStatus").textContent = "Import failed: invalid JSON.";
    }
    input.value = "";
  });
}

function setupResultsUI() {
  document.getElementById("getResultsBtn")?.addEventListener("click", getRoverResults);
  setupResultsImport();
}

function updateTopMissionStatus(text, active=false){
  const el=document.getElementById("topMissionStatus");
  const orb=document.querySelector(".mission-chip-orb");
  if(el) el.textContent=text;
  if(orb){
    orb.style.background=active?"#70b25a":"#b7c0bb";
    orb.style.boxShadow=active?"0 0 0 5px rgba(112,178,90,.14),0 0 15px rgba(112,178,90,.3)":"0 0 0 5px rgba(183,192,187,.13)";
  }
}

/* ========== MULTI-PAGE WORKSPACE ========== */
function refreshFieldMap() {
  if (!map) return;
  const fieldPage = document.getElementById("fieldPage");
  if (!fieldPage || !fieldPage.classList.contains("active")) return;

  // Google Maps was initialized while this page may have been hidden.
  // Force a layout recalculation after it becomes visible.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      google.maps.event.trigger(map, "resize");
      const center = map.getCenter();
      if (center) map.setCenter(center);
      map.setOptions({gestureHandling:"greedy"});
    });
  });
}

function setupPages() {
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.page;
      document.querySelectorAll(".nav-item").forEach(x => x.classList.toggle("active", x === btn));
      document.querySelectorAll(".app-page").forEach(p => p.classList.toggle("active", p.id === target));
      window.dispatchEvent(new Event("resize"));
      if (target === "fieldPage") refreshFieldMap();
    });
  });
  document.getElementById("regionLocateBtn")?.addEventListener("click", analyzeLiveRegion);
  document.getElementById("fieldLocateBtn")?.addEventListener("click", () => {
    refreshFieldMap();
    locateMe();
  });
}

async function analyzeLiveRegion() {
  const state = document.getElementById("intelState");
  if (state) state.textContent = "ANALYZING";
  if (!navigator.geolocation) {
    showToast("Live location is not available in this browser.");
    return;
  }
  navigator.geolocation.getCurrentPosition(async pos => {
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    document.getElementById("regionLat").textContent = lat.toFixed(5);
    document.getElementById("regionLon").textContent = lon.toFixed(5);
    try {
      const [weatherRes, placeRes] = await Promise.all([
        fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,soil_moisture_0_to_1cm,soil_temperature_0_to_7cm&timezone=auto`),
        fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`)
      ]);
      const weather = await weatherRes.json();
      const place = await placeRes.json();
      const c = weather.current || {};
      const addr = place.address || {};
      const region = addr.city || addr.town || addr.village || addr.county || addr.state || "Current location";
      document.getElementById("regionName").textContent = region;
      const moisture = Number(c.soil_moisture_0_to_1cm);
      const wind = Number(c.wind_speed_10m);
      const rain = Number(c.precipitation);
      const temp = Number(c.temperature_2m);

      let score = 86;
      let reasons = [];
      if (Number.isFinite(moisture)) {
        if (moisture > 0.42) { score -= 28; reasons.push("high surface moisture"); }
        else if (moisture > 0.30) { score -= 12; reasons.push("moderately moist ground"); }
        else if (moisture < 0.10) { score -= 4; reasons.push("dry surface layer"); }
      }
      if (Number.isFinite(rain) && rain > 3) { score -= 20; reasons.push("active precipitation"); }
      if (Number.isFinite(wind) && wind > 35) { score -= 15; reasons.push("strong wind"); }
      score = Math.max(5, Math.min(98, Math.round(score)));

      const verdict = score >= 75 ? "GOOD TO DEPLOY" : score >= 50 ? "USE CAUTION" : "POOR CONDITIONS";
      const advice = score >= 75 ? "Ground conditions look favorable for rover movement." : score >= 50 ? "Rover movement may be possible, but inspect the field before deployment." : "Delay deployment if possible; current environmental conditions may make movement difficult.";

      document.getElementById("intelState").textContent = "ANALYZED";
      document.getElementById("intelSummary").textContent = `${region}: ${advice}${reasons.length ? " Main factors: " + reasons.join(", ") + "." : ""}`;
      document.getElementById("roverScore").textContent = `${score}%`;
      document.getElementById("roverScoreBar").style.width = `${score}%`;
      document.getElementById("intelSoilMoisture").textContent = Number.isFinite(moisture) ? `${(moisture*100).toFixed(1)}%` : "—";
      document.getElementById("intelWeather").textContent = Number.isFinite(temp) ? `${temp.toFixed(1)}°C` : "—";
      document.getElementById("intelWeatherDetail").textContent = `RH ${c.relative_humidity_2m ?? "—"}%`;
      document.getElementById("intelWind").textContent = Number.isFinite(wind) ? `${wind.toFixed(0)} km/h` : "—";
      document.getElementById("intelRain").textContent = Number.isFinite(rain) ? `${rain.toFixed(1)} mm` : "—";
      document.getElementById("weatherCardValue").textContent = Number.isFinite(temp) ? `${temp.toFixed(1)}°C` : "Unavailable";
      document.getElementById("weatherCardText").textContent = `Humidity ${c.relative_humidity_2m ?? "—"}% · wind ${Number.isFinite(wind) ? wind.toFixed(0) : "—"} km/h.`;
      document.getElementById("soilCardValue").textContent = Number.isFinite(moisture) ? `${(moisture*100).toFixed(1)}% moisture` : "Unavailable";
      document.getElementById("soilCardText").textContent = "Modeled surface-layer moisture; confirm actual soil condition with rover sensors.";
      document.getElementById("roverAdviceValue").textContent = verdict;
      document.getElementById("roverAdviceText").textContent = advice;
      if (typeof map !== "undefined" && map) {
        map.setCenter({lat, lng:lon});
      }
      if (navigator.geolocation && typeof updateGPSUI === "function") updateGPSUI(true, lat, lon);
    } catch (err) {
      state.textContent = "PARTIAL";
      document.getElementById("intelSummary").textContent = "Location was found, but environmental data could not be loaded right now.";
      showToast("Location found; weather service unavailable.");
    }
  }, err => {
    state.textContent = "LOCATION NEEDED";
    showToast("Please allow location access to analyze your region.");
  }, {enableHighAccuracy:true, timeout:12000, maximumAge:30000});
}

function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    center: {lat: 20.2961, lng: 85.8245},
    zoom: 17,
    mapTypeId: "satellite",
    streetViewControl: false,
    fullscreenControl: true,
    mapTypeControl: true,
    mapTypeControlOptions: {
      style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
      position: google.maps.ControlPosition.TOP_RIGHT,
      mapTypeIds: ["satellite", "hybrid", "roadmap"]
    },
    gestureHandling: "greedy"
  });
document.getElementById("locateBtn")?.addEventListener("click", locateMe);
  document.getElementById("clearBtn")?.addEventListener("click", clearMission);
  document.getElementById("sendBtn")?.addEventListener("click", sendMission);
  document.getElementById("downloadBtn")?.addEventListener("click", exportMission);
  document.getElementById("testBtn")?.addEventListener("click", testRover);
  document.getElementById("getRoverGpsBtn")?.addEventListener("click", getRoverGPS);
  document.getElementById("startBtn")?.addEventListener("click", startAgriBot);
  setupRoverEndpointPersistence();
  setupBoundaryTool();
  setupResultsUI();

  // Keep the map clickable after the Field Mapper page is revealed.
  const mapEl=document.getElementById("map");
  if(mapEl){
    mapEl.addEventListener("click",()=>{
      if(drawingActive) map.setOptions({gestureHandling:"greedy"});
    }, {passive:true});
  }

  updateTopMissionStatus("Satellite field view", false);
  showToast("Satellite field view ready.");
}

function attachPolygonListeners() {
  ["set_at", "insert_at", "remove_at"].forEach(eventName => {
    boundaryPolygon.getPath().addListener(eventName, generateMission);
  });
}


// Explicit, visible field-boundary drawing tool.
let drawingActive=false, drawingPath=[], drawingLine=null, drawingPreview=null;
let drawingClickListener=null, drawingDblListener=null, drawingMoveListener=null, drawingDots=[];

function setupBoundaryTool(){
  const draw = document.getElementById("drawBoundaryBtn");
  const finish = document.getElementById("finishBoundaryBtn");
  const cancel = document.getElementById("cancelBoundaryBtn");
  draw?.addEventListener("click", startBoundaryDrawing);
  finish?.addEventListener("click", finishBoundaryDrawing);
  cancel?.addEventListener("click", cancelBoundaryDrawing);
}

function updateFinishButton(){
  const finish = document.getElementById("finishBoundaryBtn");
  if (finish) finish.disabled = !drawingActive || drawingPath.length < 3;
}

function startBoundaryDrawing(){
  if (!map) {
    showToast("MAP COULD NOT LOAD");
    return;
  }
  stopDrawingOverlays();
  drawingPath=[];
  drawingActive=true;
  updateFinishButton();
  map.setOptions({disableDoubleClickZoom:true, draggableCursor:"crosshair"});

  const btn=document.getElementById("drawBoundaryBtn");
  if(btn){
    btn.classList.add("active");
    const strong=btn.querySelector("strong");
    const small=btn.querySelector("small");
    if(strong) strong.textContent="Drawing field…";
    if(small) small.textContent="Click each field corner";
  }
  const cancelBtn=document.getElementById("cancelBoundaryBtn");
  if(cancelBtn) cancelBtn.hidden=false;
  const mapEl=document.getElementById("map");
  mapEl?.classList.add("drawing-mode");

  drawingClickListener=map.addListener("click", e=>{
    if (!drawingActive || !e?.latLng) return;
    drawingPath.push(e.latLng);
    drawingDots.push(new google.maps.Marker({
      position:e.latLng,map,clickable:false,zIndex:2000,
      icon:{path:google.maps.SymbolPath.CIRCLE,scale:5,fillColor:"#d8f297",fillOpacity:1,strokeColor:"#294d40",strokeWeight:2}
    }));
    if(!drawingLine) drawingLine=new google.maps.Polyline({
      map,strokeColor:"#416b59",strokeOpacity:.95,strokeWeight:3,clickable:false
    });
    drawingLine.setPath(drawingPath);
    updateFinishButton();
  });

  drawingMoveListener=map.addListener("mousemove", e=>{
    if(!drawingActive || !drawingPath.length || !e?.latLng) return;
    if(!drawingPreview) drawingPreview=new google.maps.Polyline({
      map,strokeColor:"#9fc06f",strokeOpacity:.65,strokeWeight:2,clickable:false
    });
    drawingPreview.setPath(drawingPath.concat([e.latLng]));
  });

  showToast("Drawing mode: click 3+ field corners, then press FINISH BOUNDARY.");
}

function finishBoundaryDrawing(){
  if(drawingPath.length<3){
    showToast("Select at least 3 corners.");
    return;
  }
  if(boundaryPolygon) boundaryPolygon.setMap(null);
  clearSamples();
  boundaryPolygon=new google.maps.Polygon({
    paths:drawingPath.slice(), editable:true, draggable:false, map,
    fillColor:"#6f9a84",fillOpacity:.16,strokeColor:"#416b59",strokeOpacity:.95,strokeWeight:3
  });
  ["set_at","insert_at","remove_at"].forEach(ev=>boundaryPolygon.getPath().addListener(ev,generateMission));
  stopDrawingOverlays();
  generateMission();
  const b=new google.maps.LatLngBounds();
  boundaryPolygon.getPath().forEach(p=>b.extend(p));
  map.fitBounds(b,40);
  showToast("Field boundary saved.");
}

function stopDrawingOverlays(){
  drawingActive=false;
  [drawingClickListener,drawingMoveListener].forEach(x=>{if(x)google.maps.event.removeListener(x)});
  drawingClickListener=drawingMoveListener=null;
  if(drawingLine)drawingLine.setMap(null);
  if(drawingPreview)drawingPreview.setMap(null);
  drawingLine=drawingPreview=null;
  drawingDots.forEach(d=>d.setMap(null)); drawingDots=[];
  updateFinishButton();
  const btn=document.getElementById("drawBoundaryBtn");
  if(btn){
    btn.classList.remove("active");
    const strong=btn.querySelector("strong");
    const small=btn.querySelector("small");
    if(strong) strong.textContent="Draw Field";
    if(small) small.textContent="Click corners";
  }
  const cancelBtn=document.getElementById("cancelBoundaryBtn");
  if(cancelBtn) cancelBtn.hidden=true;
  if(map) map.setOptions({disableDoubleClickZoom:false, draggableCursor:null});
  document.getElementById("map")?.classList.remove("drawing-mode");
}

function cancelBoundaryDrawing(){
  stopDrawingOverlays();
  drawingPath=[];
  updateFinishButton();
}
function polygonPoints() {
  const path = boundaryPolygon.getPath();
  const out = [];
  for (let i = 0; i < path.getLength(); i++) out.push(path.getAt(i).toJSON());
  return out;
}

function pointInPolygon(lat, lng, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i].lat, xi = poly[i].lng;
    const yj = poly[j].lat, xj = poly[j].lng;
    const hit = ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / ((yj - yi) || 1e-12) + xi);
    if (hit) inside = !inside;
  }
  return inside;
}

function bounds(poly) {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  poly.forEach(p => {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  });
  return {minLat, maxLat, minLng, maxLng};
}

function centroid(poly) {
  const c = poly.reduce(
    (a,p) => ({lat:a.lat+p.lat, lng:a.lng+p.lng}),
    {lat:0,lng:0}
  );
  return {lat:c.lat/poly.length, lng:c.lng/poly.length};
}

/*
 Adaptive sampling:
 - tiny field  -> 4 points
 - ~1 hectare  -> 9 points
 - ~4 hectares -> 36 points
 - larger field -> progressively more, capped at 49
 The number is driven by actual geodesic area, not by the map zoom.
*/
function gridDimensions(areaM2, poly) {
  /*
   * Density model (fixed thresholds, in square meters):
   *  - area < 500 m²             -> 4 points
   *  - 500 m² <= area < 1000 m²  -> 6 points
   *  - area >= 1000 m²           -> 9 points
   */
  const hectares = areaM2 / 10000;
  const target = areaM2 < 500 ? 4 : (areaM2 < 1000 ? 6 : 9);

  const b = bounds(poly);
  const midLat = (b.minLat + b.maxLat) / 2;
  const northSouth = Math.max(1, google.maps.geometry.spherical.computeDistanceBetween(
    {lat:b.minLat,lng:b.minLng},{lat:b.maxLat,lng:b.minLng}
  ));
  const eastWest = Math.max(1, google.maps.geometry.spherical.computeDistanceBetween(
    {lat:midLat,lng:b.minLng},{lat:midLat,lng:b.maxLng}
  ));

  const aspect = eastWest / northSouth;
  let cols = Math.max(2, Math.round(Math.sqrt(target * aspect)));
  let rows = Math.max(2, Math.ceil(target / cols));

  while (rows * cols < target) rows++;
  while (rows * cols > target && rows > 2 && (rows-1) * cols >= target) rows--;

  return {rows, cols, target: rows * cols, hectares};
}

function makeAdaptiveGrid(poly, rows, cols) {
  const b = bounds(poly);
  const target = rows * cols;
  const candidates = [];
  // Oversample the bounding box, keep only points actually inside the polygon,
  // then choose evenly distributed candidates. No generated waypoint is pushed
  // outside the field just to hit a target count.
  const densityRows = Math.max(rows * 4, 12);
  const densityCols = Math.max(cols * 4, 12);

  for (let r=0; r<densityRows; r++) {
    const y=(r+0.5)/densityRows;
    for (let c=0; c<densityCols; c++) {
      const x=(c+0.5)/densityCols;
      const p={
        lat:b.minLat+(b.maxLat-b.minLat)*y,
        lng:b.minLng+(b.maxLng-b.minLng)*x
      };
      if (pointInPolygon(p.lat,p.lng,poly)) candidates.push(p);
    }
  }

  // Prefer the polygon centroid when it is inside.
  const center = centroid(poly);
  if (pointInPolygon(center.lat, center.lng, poly)) candidates.push(center);

  if (!candidates.length) return [];

  // Select evenly through the spatially ordered candidates.
  candidates.sort((a,b) => a.lat-b.lat || a.lng-b.lng);
  const count = Math.min(target, candidates.length);
  if (count === candidates.length) return candidates;

  const selected=[];
  for(let i=0;i<count;i++){
    const idx=Math.min(candidates.length-1, Math.floor((i+0.5)*candidates.length/count));
    selected.push(candidates[idx]);
  }
  // Deduplicate while preserving order.
  return selected.filter((p,i,arr)=>i===0 || p.lat!==arr[i-1].lat || p.lng!==arr[i-1].lng);
}

function refreshRouteVisualization() {
  if (!map || typeof google === "undefined" || !google.maps) return;

  sampleMarkers.forEach(m => { try { m.setMap(null); } catch (_) {} });
  sampleMarkers = [];

  if (routePolyline) {
    routePolyline.setMap(null);
    routePolyline = null;
  }

  currentPoints.forEach((p, i) => {
    const pointName = `P${String(i + 1).padStart(2, "0")}`;
    const latText = Number(p.lat).toFixed(7);
    const lngText = Number(p.lng).toFixed(7);

    const marker = new google.maps.Marker({
      position: {lat: Number(p.lat), lng: Number(p.lng)},
      map,
      title: `${pointName} · ${latText}, ${lngText}`,
      label: {text: String(i + 1), color: "#294d40", fontWeight: "800", fontSize: "9px"},
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 13,
        fillColor: "#d8f297",
        fillOpacity: 0.96,
        strokeColor: "#294d40",
        strokeWeight: 2
      }
    });

    const info = new google.maps.InfoWindow({
      content: `<div class="tg-point-info"><strong>${pointName}</strong><div><span>LATITUDE</span><b>${latText}</b></div><div><span>LONGITUDE</span><b>${lngText}</b></div></div>`
    });

    marker.addListener("click", () => {
      sampleMarkers.forEach(m => { if (m.__tgInfo) m.__tgInfo.close(); });
      marker.__tgInfo = info;
      info.open({map, anchor: marker});
    });
    sampleMarkers.push(marker);
  });

  if (currentPoints.length >= 2) {
    routePolyline = new google.maps.Polyline({
      path: currentPoints.map(p => ({lat: Number(p.lat), lng: Number(p.lng)})),
      geodesic: true,
      strokeOpacity: 0.85,
      strokeWeight: 3,
      map
    });
  }

  if (roverMarker) {
    roverMarker.setMap(null);
    roverMarker = null;
  }

  if (roverStartPosition) {
    roverMarker = new google.maps.Marker({
      position: {lat: Number(roverStartPosition.latitude), lng: Number(roverStartPosition.longitude)},
      map,
      title: "AgriBot starting GPS position",
      label: {text: "R", color: "#ffffff", fontWeight: "900"},
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: "#173f30",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2
      },
      zIndex: 999
    });
  }
}

function generateMission() {
  if (!boundaryPolygon) return;

  const poly = polygonPoints();
  const area = google.maps.geometry.spherical.computeArea(boundaryPolygon.getPath());
  const dims = gridDimensions(area, poly);
  currentPoints = makeAdaptiveGrid(poly, dims.rows, dims.cols);

  // Render immediately after the adaptive grid is calculated.
  // This guarantees the latitude/longitude table is populated with the
  // exact same points that are shown on the map.
  renderPoints();

  if (!currentPoints.length) {
    showToast("Could not place sampling points inside this boundary.");
    return;
  }
  clearSamples();

  currentPoints.forEach((p, i) => {
    const pointName = `P${String(i + 1).padStart(2, "0")}`;
    const latText = p.lat.toFixed(7);
    const lngText = p.lng.toFixed(7);
    const marker = new google.maps.Marker({
      position: p,
      map,
      title: `${pointName} · Latitude ${latText} · Longitude ${lngText}`,
      label: {
        text: String(i + 1),
        color: "#294d40",
        fontWeight: "800",
        fontSize: "9px"
      },
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 13,
        fillColor: "#d8f297",
        fillOpacity: 0.96,
        strokeColor: "#294d40",
        strokeWeight: 2
      }
    });

    // Show the exact GPS coordinates at the sampling point when tapped/clicked.
    // This keeps the map clean while making every waypoint's coordinates directly accessible.
    const pointInfo = new google.maps.InfoWindow({
      content: `
        <div class="tg-point-info">
          <strong>${pointName}</strong>
          <div><span>LATITUDE</span><b>${latText}</b></div>
          <div><span>LONGITUDE</span><b>${lngText}</b></div>
        </div>`
    });
    marker.addListener("click", () => {
      sampleMarkers.forEach(m => { if (m.__tgInfo) m.__tgInfo.close(); });
      marker.__tgInfo = pointInfo;
      pointInfo.open({ map, anchor: marker });
    });
    sampleMarkers.push(marker);
  });

  refreshRouteVisualization();
  updateTopMissionStatus(`${currentPoints.length} waypoints ready`, true);
  const areaLabel = formatArea(area);
  const hectares = area / 10000;

  // Enable the mission-critical controls FIRST. If anything below throws
  // (e.g. a status label element is missing), the Send/Download buttons
  // must still end up enabled — they should never depend on cosmetic UI.
  renderPoints();
  document.getElementById("sendBtn")?.removeAttribute("disabled");
  document.getElementById("downloadBtn")?.removeAttribute("disabled");
  missionAccepted = false;
  const startBtn = document.getElementById("startBtn");
  if (startBtn) startBtn.disabled = true;
  setMissionState("MISSION READY");

  // Cosmetic status labels — guarded so a missing/renamed element can't
  // throw and abort the function partway through.
  const boundaryTextEl = document.getElementById("boundaryText");
  if (boundaryTextEl) {
    boundaryTextEl.textContent =
      `${areaLabel} field · TerraGrid selected ${currentPoints.length} points for balanced coverage.`;
  }
  const vertexCountEl = document.getElementById("vertexCount");
  if (vertexCountEl) vertexCountEl.textContent = poly.length;
  const areaValueEl = document.getElementById("areaValue");
  if (areaValueEl) areaValueEl.textContent = areaLabel;

  const fieldStatusTagEl = document.getElementById("fieldStatusTag");
  if (fieldStatusTagEl) fieldStatusTagEl.textContent = "DEFINED";
  const heroPointCountEl = document.getElementById("heroPointCount");
  if (heroPointCountEl) heroPointCountEl.textContent = currentPoints.length;
  const heroAreaEl = document.getElementById("heroArea");
  if (heroAreaEl) heroAreaEl.textContent = areaLabel;
  const gridBadgeEl = document.getElementById("gridBadge");
  if (gridBadgeEl) gridBadgeEl.textContent = `${dims.rows} × ${dims.cols}`;

  const densityTitle = document.getElementById("densityTitle");
  const densityText = document.getElementById("densityText");
  if (densityTitle) densityTitle.textContent = `${currentPoints.length} sampling points`;
  if (densityText) {
    densityText.textContent = hectares < 1
      ? "Compact field density · close coverage"
      : `${hectares.toFixed(2)} ha · area-scaled rover coverage`;
  }

  const ready = document.getElementById("missionReady");
  if (ready) {
    ready.classList.add("ready");
    const strongEl = ready.querySelector("strong");
    const smallEl = ready.querySelector("small");
    if (strongEl) strongEl.textContent = "Mission ready";
    if (smallEl) {
      smallEl.textContent = `${currentPoints.length} waypoints generated and ready for the rover.`;
    }
  }
}

function formatArea(area) {
  if (area < 10000) return `${Math.round(area).toLocaleString()} m²`;
  return `${(area / 10000).toFixed(2)} ha`;
}

function clearSamples() {
  sampleMarkers.forEach(m => m.setMap(null));
  sampleMarkers = [];
}

function clearMission() {
  if (routePolyline) { routePolyline.setMap(null); routePolyline = null; }
  if (roverMarker) { roverMarker.setMap(null); roverMarker = null; }
  cancelBoundaryDrawing();
  updateTopMissionStatus("Awaiting field", false);
  if (boundaryPolygon) {
    boundaryPolygon.setMap(null);
    boundaryPolygon = null;
  }
  clearSamples();
  currentPoints = [];
  document.getElementById("boundaryText").textContent = "No boundary selected yet.";
  document.getElementById("vertexCount").textContent = "—";
  document.getElementById("areaValue").textContent = "—";
  document.getElementById("fieldStatusTag").textContent = "WAITING";
  document.getElementById("heroPointCount").textContent = "0";
  document.getElementById("heroArea").textContent = "—";
  document.getElementById("gridBadge").textContent = "ADAPTIVE";
  document.getElementById("densityTitle").textContent = "Awaiting field";
  document.getElementById("densityText").textContent = "Draw a boundary to calculate sampling density.";
  const ready = document.getElementById("missionReady");
  ready.classList.remove("ready");
  ready.querySelector("strong").textContent = "Mission planner ready";
  ready.querySelector("small").textContent = "Draw a field to unlock the rover mission.";
  document.getElementById("pointsBody").innerHTML =
    '<tr><td colspan="3" class="empty-row">Draw a boundary to generate points.</td></tr>';
  const sendBtn = document.getElementById("sendBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  if (sendBtn) sendBtn.disabled = true;
  if (downloadBtn) downloadBtn.disabled = true;
  const startBtn = document.getElementById("startBtn");
  if (startBtn) startBtn.disabled = true;
  missionAccepted = false;
  missionRunning = false;
  roverStartPosition = null;
  setMissionState("MISSION PLANNER READY");
  showToast("Mission cleared.");
}

function renderPoints() {
  const body = document.getElementById("pointsBody");
  if (!body) return;

  if (!Array.isArray(currentPoints) || currentPoints.length === 0) {
    body.innerHTML = '<tr><td colspan="3" class="empty-row">Draw a boundary to generate points.</td></tr>';
    return;
  }

  body.innerHTML = currentPoints.map((p, i) => {
    const lat = Number(p?.lat);
    const lng = Number(p?.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return `<tr><td>P${i + 1}</td><td colspan="2">Coordinate unavailable</td></tr>`;
    }

    return `
      <tr class="waypoint-row" data-point-index="${i}">
        <td><strong>P${String(i + 1).padStart(2, "0")}</strong></td>
        <td class="coordinate-value">${lat.toFixed(7)}</td>
        <td class="coordinate-value">${lng.toFixed(7)}</td>
      </tr>`;
  }).join("");

  // Keep the coordinate table in sync even when the Field Mapper page
  // was previously hidden and then made visible.
  requestAnimationFrame(() => {
    const latestBody = document.getElementById("pointsBody");
    if (latestBody && currentPoints.length) {
      latestBody.innerHTML = currentPoints.map((p, i) => {
        const lat = Number(p?.lat);
        const lng = Number(p?.lng);
        return `<tr class="waypoint-row" data-point-index="${i}">
          <td><strong>P${String(i + 1).padStart(2, "0")}</strong></td>
          <td class="coordinate-value">${Number.isFinite(lat) ? lat.toFixed(7) : "—"}</td>
          <td class="coordinate-value">${Number.isFinite(lng) ? lng.toFixed(7) : "—"}</td>
        </tr>`;
      }).join("");
    }
  });
}

function payload() {
  return {
    mission_id: `TG-${Date.now()}`,
    created_at: new Date().toISOString(),
    sampling_points: currentPoints.length,
    grid: "adaptive",
    start: roverStartPosition ? {
      latitude: Number(roverStartPosition.latitude.toFixed(7)),
      longitude: Number(roverStartPosition.longitude.toFixed(7))
    } : null,
    start_latitude: roverStartPosition ? Number(roverStartPosition.latitude.toFixed(7)) : null,
    start_longitude: roverStartPosition ? Number(roverStartPosition.longitude.toFixed(7)) : null,
    points: currentPoints.map((p,i) => ({
      id: p.id ?? i + 1,
      latitude: Number(p.lat.toFixed(7)),
      longitude: Number(p.lng.toFixed(7))
    }))
  };
}

function missionStartUrl(missionUrl) {
  try {
    const u = new URL(missionUrl);
    const path = u.pathname.replace(/\/+$/, "");
    u.pathname = /\/mission$/i.test(path) ? path.replace(/\/mission$/i, "/start") : `${path}/start`;
    return u.toString();
  } catch {
    return missionUrl.replace(/\/mission\/?$/i, "/start").replace(/\/?$/, "/start");
  }
}

function setMissionState(state, detail="") {
  const stateEl=document.getElementById("missionState");
  const endpoint=document.getElementById("endpointStatus");
  if(stateEl) stateEl.textContent=state;
  if(endpoint && detail) endpoint.textContent=detail;
  const pageStatus=document.getElementById("roverPageStatus");
  if(pageStatus) pageStatus.textContent=state.replaceAll("_"," ");
}


function roverGpsUrl(missionUrl) {
  try {
    const u = new URL(missionUrl);
    let path = u.pathname.replace(/\/+$/, "");
    if (/\/mission$/i.test(path)) {
      path = path.replace(/\/mission$/i, "/gps");
    } else {
      path += "/gps";
    }
    u.pathname = path;
    return u.toString();
  } catch {
    return missionUrl.replace(/\/mission\/?$/i, "/gps").replace(/\/?$/, "");
  }
}

function distanceBetweenLatLng(a, b) {
  const R = 6371000;
  const p1 = a.latitude * Math.PI / 180;
  const p2 = b.latitude * Math.PI / 180;
  const dp = (b.latitude - a.latitude) * Math.PI / 180;
  const dl = (b.longitude - a.longitude) * Math.PI / 180;
  const x = Math.sin(dp/2)**2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

function orderPointsFromRoverStart() {
  if (!roverStartPosition || !Array.isArray(currentPoints) || currentPoints.length < 2) {
    return;
  }

  // Nearest-neighbour route:
  // first point = closest field waypoint to the actual rover position,
  // then each following waypoint is the nearest unvisited waypoint.
  const remaining = currentPoints.slice();
  const ordered = [];
  let origin = {
    latitude: roverStartPosition.latitude,
    longitude: roverStartPosition.longitude
  };

  while (remaining.length) {
    let bestIndex = 0;
    let bestDistance = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const p = remaining[i];
      const d = distanceBetweenLatLng(origin, {
        latitude: p.lat,
        longitude: p.lng
      });
      if (d < bestDistance) {
        bestDistance = d;
        bestIndex = i;
      }
    }

    const next = remaining.splice(bestIndex, 1)[0];
    ordered.push(next);
    origin = { latitude: next.lat, longitude: next.lng };
  }

  currentPoints = ordered;

  // Re-render the table and the map in the exact route order sent to ESP32.
  if (typeof renderPoints === "function") renderPoints();
  refreshRouteVisualization();

  const heroPointCountEl = document.getElementById("heroPointCount");
  if (heroPointCountEl) heroPointCountEl.textContent = String(currentPoints.length);
}

async function getRoverGPS() {
  const missionUrl = document.getElementById("roverUrl")?.value.trim();

  if (!missionUrl) {
    showToast("Enter the ESP32 endpoint first.");
    return;
  }

  const gpsUrl = roverGpsUrl(missionUrl);
  const btn = document.getElementById("getRoverGpsBtn");

  if (btn) {
    btn.disabled = true;
    btn.textContent = "Reading GPS…";
  }

  setMissionState("READING ROVER GPS", "Getting the rover's real starting position…");

  try {
    const r = await fetch(gpsUrl, { method: "GET", cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    const data = await r.json();

    const latitude = Number(data.latitude ?? data.lat);
    const longitude = Number(data.longitude ?? data.lon ?? data.lng);

    if (!data.valid || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error("ESP32 does not have a valid GPS fix yet.");
    }

    roverStartPosition = { latitude, longitude };

    // Re-order the already generated field points so navigation begins
    // from the point closest to the rover's actual starting position.
    orderPointsFromRoverStart();

    setMissionState(
      "ROVER GPS LOCKED",
      `Start: ${latitude.toFixed(7)}, ${longitude.toFixed(7)}`
    );

    document.getElementById("roverDot")?.classList.add("ok");

    const gpsLabel = document.getElementById("roverGpsValue");
    if (gpsLabel) {
      gpsLabel.textContent =
        `${latitude.toFixed(7)}, ${longitude.toFixed(7)}`;
    }

    showToast("ROVER START POSITION RECEIVED");
  } catch (e) {
    roverStartPosition = null;
    setMissionState("ROVER GPS FAILED", e.message || "GPS unavailable");
    showToast(`ROVER GPS FAILED: ${e.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Get rover GPS";
    }
  }
}

async function sendMission() {
  const url = document.getElementById("roverUrl")?.value.trim();
  if (!currentPoints.length || !url) {
    showToast("Draw a field and enter the ESP32 mission endpoint first.");
    return;
  }

  if (!roverStartPosition) {
    showToast("Get the rover GPS position before sending the mission.");
    return;
  }

  const btn = document.getElementById("sendBtn");
  if (btn) { btn.disabled=true; btn.textContent="Sending coordinates…"; }
  setMissionState("SENDING COORDINATES","Connecting to rover…");

  try {
    const r = await fetch(url, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(payload())
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    // A successful HTTP response is the only condition used to accept the mission.
    missionAccepted=true;
    const startBtn=document.getElementById("startBtn");
    if(startBtn) startBtn.disabled=false;
    document.getElementById("roverDot")?.classList.add("ok");
    setMissionState("COORDINATES SENT",`Mission accepted by ESP32 (${currentPoints.length} points).`);
    showToast("COORDINATES SENT");
  } catch(e) {
    missionAccepted=false;
    document.getElementById("roverDot")?.classList.remove("ok");
    const startBtn=document.getElementById("startBtn");
    if(startBtn) startBtn.disabled=true;
    setMissionState("ROVER CONNECTION FAILED","COORDINATES COULD NOT BE SENT");
    showToast("COORDINATES COULD NOT BE SENT");
  } finally {
    if(btn){
      btn.disabled=!currentPoints.length;
      btn.innerHTML='<i data-lucide="send"></i><span>Send coordinates</span>';
      if(typeof lucide!=="undefined") lucide.createIcons();
    }
  }
}

async function testRover() {
  const url=document.getElementById("roverUrl")?.value.trim();
  if(!url){showToast("Enter the ESP32 endpoint first.");return;}
  setMissionState("TESTING CONNECTION","Checking rover endpoint…");
  try{
    // GET is broadly supported by simple ESP32 HTTP servers. A 2xx/3xx response
    // proves reachability; CORS errors are surfaced instead of being hidden.
    const r=await fetch(url,{method:"GET",cache:"no-store"});
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    document.getElementById("roverDot")?.classList.add("ok");
    setMissionState("ROVER CONNECTED",`Endpoint reachable (HTTP ${r.status}).`);
    showToast("ROVER CONNECTED");
  }catch(e){
    document.getElementById("roverDot")?.classList.remove("ok");
    setMissionState("ROVER CONNECTION FAILED","ROVER CONNECTION FAILED");
    showToast("ROVER CONNECTION FAILED");
  }
}

async function startAgriBot(){
  const missionUrl=document.getElementById("roverUrl")?.value.trim();
  const btn=document.getElementById("startBtn");
  if(!missionAccepted || !missionUrl){
    showToast("Send coordinates successfully before starting.");
    return;
  }
  if(btn) btn.disabled=true;
  missionRunning=true;
  setMissionState("AGRIBOT STARTING","Sending start command to ESP32…");
  try{
    const r=await fetch(missionStartUrl(missionUrl),{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({mission_id:payload().mission_id, command:"start"})
    });
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    setMissionState("AGRIBOT RUNNING","AGRIBOT RUNNING");
    showToast("AGRIBOT RUNNING");
  }catch(e){
    missionRunning=false;
    if(btn) btn.disabled=false;
    setMissionState("START COMMAND FAILED","AGRIBOT COULD NOT START");
    showToast("AGRIBOT COULD NOT START");
  }
}

function setupRoverEndpointPersistence(){
  const input=document.getElementById("roverUrl");
  if(!input) return;
  const KEY="terragrid_rover_endpoint";
  const saved=localStorage.getItem(KEY);
  if(saved) input.value=saved;
  input.addEventListener("change",()=>localStorage.setItem(KEY,input.value.trim()));
  input.addEventListener("blur",()=>localStorage.setItem(KEY,input.value.trim()));
}

function exportMission() {
  if(!currentPoints.length){showToast("No mission coordinates to export.");return;}
  const blob = new Blob([JSON.stringify(payload(),null,2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "terragrid-mission.json";
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

function locateMe() {
  if (!navigator.geolocation) {
    showToast("This browser does not support location.");
    return;
  }

  const status = document.getElementById("gpsStatus");
  const button = document.getElementById("locateBtn");
  if(!status || !button) return;
  status.querySelector("span").textContent = "Finding location…";
  button.disabled = true;
  button.innerHTML = "Locating…";

  // A single getCurrentPosition() call often returns an early, low-quality
  // fix (commonly 100-200+ m on laptops/Wi-Fi based positioning). GPS/location
  // accuracy improves as more fixes come in, so we watch position for a short
  // window and keep the single best (lowest accuracy-value) reading, instead
  // of accepting whatever arrives first. This gets us as close as the device's
  // hardware allows — true 2-5 m accuracy still requires a real GPS chip
  // (e.g. a phone outdoors); a laptop with only Wi-Fi/IP based location will
  // never report better than what its OS can actually provide.
  const GOOD_ENOUGH_M = 5;   // stop early once we get a fix this good
  const MAX_WAIT_MS = 15000; // otherwise settle for the best fix within this window

  let bestPos = null;
  let watchId = null;
  let settled = false;

  const finish = (pos, err) => {
    if (settled) return;
    settled = true;
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);

    if (!pos) {
      button.disabled = false;
      button.innerHTML = '<i data-lucide="navigation"></i><span>Locate me</span>';
      if (typeof lucide !== "undefined") lucide.createIcons();
      status.classList.remove("live");
      const messages = {
        1: "Location permission was denied. Allow location for localhost in your browser.",
        2: "Your device could not determine a location. Turn on Windows/browser location services.",
        3: "Location request timed out. Try again outdoors or near a window."
      };
      status.querySelector("span").textContent = "GPS unavailable";
      showToast(messages[err?.code] || "Could not get your location.");
      return;
    }

    const p = {lat: pos.coords.latitude, lng: pos.coords.longitude};

    status.classList.add("live");
    status.querySelector("span").textContent =
      `GPS ±${Math.round(pos.coords.accuracy)} m`;

    if (roverMarker) roverMarker.setMap(null);

    roverMarker = new google.maps.Marker({
      position: p,
      map,
      title: "Your live location",
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 12,
        fillColor: "#294d40",
        fillOpacity: 1,
        strokeColor: "#eff8d3",
        strokeWeight: 4
      }
    });

    map.setZoom(19);
    map.panTo(p);
    showToast(`Live location found (±${Math.round(pos.coords.accuracy)} m).`);
    button.disabled = false;
    button.innerHTML = '<i data-lucide="navigation"></i><span>Locate me</span>';
    if (typeof lucide !== "undefined") lucide.createIcons();
  };

  const timeoutHandle = setTimeout(() => finish(bestPos, {code: 3}), MAX_WAIT_MS);

  watchId = navigator.geolocation.watchPosition(
    pos => {
      if (!bestPos || pos.coords.accuracy < bestPos.coords.accuracy) {
        bestPos = pos;
      }
      if (pos.coords.accuracy <= GOOD_ENOUGH_M) {
        clearTimeout(timeoutHandle);
        finish(pos);
      }
    },
    err => {
      // Keep watching unless we never got any fix at all before the timeout.
      if (!bestPos) {
        clearTimeout(timeoutHandle);
        finish(null, err);
      }
    },
    {
      enableHighAccuracy: true,
      timeout: MAX_WAIT_MS,
      maximumAge: 0
    }
  );
}

let toastTimer;
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
}


/* ========== DARK MODE ========== */
function setupDarkMode() {
  const btn = document.getElementById("darkModeBtn");
  if (!btn) return;
  const KEY = "terragrid_dark_mode";
  function apply(dark) {
    document.body.classList.toggle("dark-mode", dark);
    const icon = document.getElementById("darkModeIcon");
    if (icon) {
      icon.setAttribute("data-lucide", dark ? "sun" : "moon");
      if (typeof lucide !== "undefined") lucide.createIcons();
    }
    localStorage.setItem(KEY, dark ? "1" : "0");
  }
  const saved = localStorage.getItem(KEY);
  if (saved === "1") apply(true);
  btn.addEventListener("click", () => {
    apply(!document.body.classList.contains("dark-mode"));
  });
}

// Boot onboarding as soon as DOM is ready (before or after maps)
document.addEventListener("DOMContentLoaded", () => {
  setupOnboarding();
  setupDarkMode();
  if (typeof lucide !== "undefined") lucide.createIcons();
});




document.addEventListener("DOMContentLoaded",()=>{ try{setupPages();}catch(e){console.warn(e);} });


