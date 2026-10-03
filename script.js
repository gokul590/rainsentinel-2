/* =========================================================================
   RAINSENTINEL — CLIENT APPLICATION
   Sections: Config/Data | Scoring Engine | Weather API | Nav/State |
             Page renderers | Charts/Map | History | Init
   ========================================================================= */

/* ---------------- Locations ---------------- */
/* All 38 districts of Tamil Nadu, coordinates at district headquarters */
const LOCATIONS = [
  {name:"Ariyalur", lat:11.1401, lon:79.0782},
  {name:"Chengalpattu", lat:12.6819, lon:79.9888},
  {name:"Chennai", lat:13.0827, lon:80.2707},
  {name:"Coimbatore", lat:11.0168, lon:76.9558},
  {name:"Cuddalore", lat:11.7480, lon:79.7714},
  {name:"Dharmapuri", lat:12.1211, lon:78.1582},
  {name:"Dindigul", lat:10.3673, lon:77.9803},
  {name:"Erode", lat:11.3410, lon:77.7172},
  {name:"Kallakurichi", lat:11.7401, lon:78.9597},
  {name:"Kanchipuram", lat:12.8342, lon:79.7036},
  {name:"Kanyakumari (Nagercoil)", lat:8.0883, lon:77.5385},
  {name:"Karur", lat:10.9601, lon:78.0766},
  {name:"Krishnagiri", lat:12.5266, lon:78.2150},
  {name:"Madurai", lat:9.9252, lon:78.1198},
  {name:"Mayiladuthurai", lat:11.1085, lon:79.6510},
  {name:"Nagapattinam", lat:10.7657, lon:79.8420},
  {name:"Namakkal", lat:11.2189, lon:78.1677},
  {name:"Nilgiris (Ooty)", lat:11.4064, lon:76.6932},
  {name:"Perambalur", lat:11.2342, lon:78.8807},
  {name:"Pudukkottai", lat:10.3813, lon:78.8213},
  {name:"Ramanathapuram", lat:9.3639, lon:78.8395},
  {name:"Ranipet", lat:12.9249, lon:79.3308},
  {name:"Salem", lat:11.6643, lon:78.1460},
  {name:"Sivaganga", lat:9.8433, lon:78.4809},
  {name:"Tenkasi", lat:8.9605, lon:77.3152},
  {name:"Thanjavur", lat:10.7870, lon:79.1378},
  {name:"Theni", lat:10.0104, lon:77.4768},
  {name:"Thoothukudi (Tuticorin)", lat:8.7642, lon:78.1348},
  {name:"Tiruchirappalli (Trichy)", lat:10.7905, lon:78.7047},
  {name:"Tirunelveli", lat:8.7139, lon:77.7567},
  {name:"Tirupathur", lat:12.4950, lon:78.5678},
  {name:"Tiruppur", lat:11.1085, lon:77.3411},
  {name:"Tiruvallur", lat:13.1231, lon:79.9120},
  {name:"Tiruvannamalai", lat:12.2253, lon:79.0747},
  {name:"Tiruvarur", lat:10.7661, lon:79.6345},
  {name:"Vellore", lat:12.9165, lon:79.1325},
  {name:"Viluppuram", lat:11.9401, lon:79.4861},
  {name:"Virudhunagar", lat:9.5810, lon:77.9624},
];

/* WMO weather codes -> label */
const WMO = {0:"Clear sky",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",45:"Fog",48:"Depositing rime fog",
51:"Light drizzle",53:"Moderate drizzle",55:"Dense drizzle",61:"Slight rain",63:"Moderate rain",65:"Heavy rain",
66:"Freezing rain",71:"Slight snow",73:"Moderate snow",75:"Heavy snow",80:"Rain showers",81:"Moderate showers",
82:"Violent showers",95:"Thunderstorm",96:"Thunderstorm w/ hail",99:"Severe thunderstorm"};

/* ---------------- Scoring Engine (demo heuristic — clearly labeled) ---------------- */
/* This is the single integration point for a real trained model. Replace the body of
   RS_ENGINE.score() with a call to your backend prediction API and keep the same
   return shape to leave every page working unchanged. */
window.RS_ENGINE = {
  source: "demo-heuristic-v1",
  score(inputs){
    const {temp=28, humidity=60, wind=10, pressure=1010, cloud=50, prevRain=0, soil=40} = inputs;
    const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

    // rainfall estimate (mm) — humidity/cloud driven, pressure suppresses
    const pressureFactor = clamp((1015 - pressure) * 1.8, -10, 30);
    let rainfallEst = clamp((humidity-40)*0.9 + (cloud-30)*0.6 + pressureFactor + prevRain*0.25, 0, 220);

    // flood score 0-100
    let floodScore = clamp(rainfallEst*0.55 + soil*0.35 + (wind>35?8:0), 0, 100);

    // crop risk: penalizes both drought (very low rain+soil) and waterlogging (very high rain+soil)
    let cropScore;
    if (rainfallEst < 8 && soil < 25) cropScore = clamp(55 + (25-soil), 0, 100);
    else cropScore = clamp(rainfallEst*0.4 + soil*0.25 + (soil>75?15:0), 0, 100);

    // overall hazard = weighted max of components + storm factor
    const stormFactor = wind>45 ? 20 : wind>30 ? 8 : 0;
    let overallScore = clamp(Math.max(floodScore, cropScore)*0.75 + Math.min(floodScore,cropScore)*0.15 + stormFactor, 0, 100);

    const level = s => s>=85?"EXTREME": s>=65?"HIGH": s>=40?"MODERATE":"LOW";

    return {
      rainfallMm: Math.round(rainfallEst*10)/10,
      floodScore: Math.round(floodScore), floodLevel: level(floodScore),
      cropScore: Math.round(cropScore), cropLevel: level(cropScore),
      overallScore: Math.round(overallScore), overallLevel: level(overallScore),
      drivers: [
        {name:"Rainfall", weight: clamp(rainfallEst/2.2,0,100)},
        {name:"Humidity", weight: clamp((humidity-30),0,100)},
        {name:"Soil moisture", weight: clamp(soil,0,100)},
        {name:"Pressure", weight: clamp(pressureFactor+40,0,100)},
        {name:"Wind", weight: clamp(wind*1.6,0,100)},
      ].sort((a,b)=>b.weight-a.weight),
      source: this.source
    };
  }
};

/* ---------------- App state ---------------- */
const state = {
  currentView:'home',
  liveData:null,       // last fetched live weather
  history:[],          // in-memory prediction history (session only)
  forecastData:null,
  forecastMetric:'rain',
  mapMarkers:[],
  mapObj:null, dbMapObj:null,
};

/* ---------------- Nav ---------------- */
const NAV = [
  ['home','Home'],['dashboard','Dashboard'],['live','Live Weather'],['prediction','Prediction'],
  ['forecast','Forecast'],['media','Media'],['map','Risk Map'],['warning','Early Warning'],['whatif','What-If Simulator'],
  ['insights','AI Insights'],['history','History'],['about','About']
];
function buildNav(){
  const el = document.getElementById('navLinks');
  el.innerHTML = NAV.map(([id,label])=>`<button data-id="${id}" onclick="go('${id}')">${label}</button>`).join('');
}
function go(id){
  state.currentView = id;
  document.querySelectorAll('section.view').forEach(s=>s.classList.remove('active'));
  document.getElementById('view-'+id).classList.add('active');
  document.querySelectorAll('nav.links button').forEach(b=>b.classList.toggle('active', b.dataset.id===id));
  window.scrollTo({top:0,behavior:'smooth'});
  // lazy init per-page widgets
  if(id==='map') initRiskMap();
  if(id==='dashboard') initDashboardMap();
  if(id==='forecast' && !state.forecastData) loadForecast();
  if(id==='whatif') renderWhatIf();
  if(id==='insights') renderInsights();
  if(id==='history') renderHistory();
}

/* ---------------- Clock ---------------- */
function tickClock(){
  document.getElementById('clockReadout').textContent = new Date().toLocaleTimeString('en-IN',{hour12:false});
}
setInterval(tickClock,1000); tickClock();

/* ---------------- Isobar signature background (SVG, generated once) ---------------- */
function buildIsobars(){
  const n=7; let paths='';
  for(let i=0;i<n;i++){
    const y = 40 + i*46;
    const amp = 18 + i*3;
    paths += `<path d="M -50 ${y} Q 150 ${y-amp}, 350 ${y} T 750 ${y} T 1150 ${y}" stroke="rgba(63,198,207,${0.14 - i*0.012})" stroke-width="1.4" fill="none"/>`;
  }
  document.getElementById('isobarBg').innerHTML = `<svg viewBox="0 0 1100 380" preserveAspectRatio="none">${paths}</svg>`;
}

/* ---------------- Weather API (Open-Meteo, no key required) ---------------- */
async function apiFetchCurrent(lat,lon){
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,pressure_msl,cloud_cover,weather_code&timezone=auto`;
  const res = await fetch(url);
  if(!res.ok) throw new Error('Weather API error '+res.status);
  return res.json();
}
async function apiFetchForecast(lat,lon){
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,wind_speed_10m_max&timezone=auto&forecast_days=7`;
  const res = await fetch(url);
  if(!res.ok) throw new Error('Forecast API error '+res.status);
  return res.json();
}

/* ---------------- Live Weather page ---------------- */
const DEFAULT_LOCATION_INDEX = Math.max(0, LOCATIONS.findIndex(l=>l.name==="Chennai"));
function populateLocationSelect(){
  const sel = document.getElementById('liveLocationSelect');
  sel.innerHTML = LOCATIONS.map((l,i)=>`<option value="${i}">${l.name}</option>`).join('');
  sel.value = DEFAULT_LOCATION_INDEX;
  sel.addEventListener('change', ()=>{
    const loc = LOCATIONS[sel.value];
    document.getElementById('liveLat').value = loc.lat;
    document.getElementById('liveLon').value = loc.lon;
  });
  document.getElementById('liveLat').value = LOCATIONS[DEFAULT_LOCATION_INDEX].lat;
  document.getElementById('liveLon').value = LOCATIONS[DEFAULT_LOCATION_INDEX].lon;
}
function findLocationByName(spoken){
  spoken = spoken.toLowerCase();
  return LOCATIONS.find(l=>spoken.includes(l.name.toLowerCase().split(' (')[0].toLowerCase()));
}

async function fetchLiveWeather(){
  const lat = parseFloat(document.getElementById('liveLat').value);
  const lon = parseFloat(document.getElementById('liveLon').value);
  const sel = document.getElementById('liveLocationSelect');
  const label = LOCATIONS[sel.value] ? LOCATIONS[sel.value].name : `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  const statusEl = document.getElementById('liveStatus');
  statusEl.textContent = 'Fetching live data…';
  try{
    const data = await apiFetchCurrent(lat, lon);
    const c = data.current;
    state.liveData = {
      lat, lon, label,
      temp:c.temperature_2m, humidity:c.relative_humidity_2m, rain:c.precipitation,
      wind:c.wind_speed_10m, pressure:c.pressure_msl, cloud:c.cloud_cover,
      cond: WMO[c.weather_code] || 'Unknown', time:c.time
    };
    renderLiveWeather();
    statusEl.textContent = 'Live data fetched successfully.';
    updateHomeSnapshot();
  }catch(e){
    statusEl.textContent = 'Could not reach the weather service — check your network settings. ('+e.message+')';
  }
}
async function loadMediaAlerts(location) {
  const statusEl = document.getElementById('mediaStatus');
  const listEl = document.getElementById('mediaNewsList');
  const locationEl = document.getElementById('mediaLocation');

  if (!statusEl || !listEl) return;

  locationEl.textContent = location;
  statusEl.textContent = 'Loading latest media information...';

  try {
    const response = await fetch(
      `/api/news?location=${encodeURIComponent(location)}`
    );

    if (!response.ok) {
      throw new Error('News API error: ' + response.status);
    }

    const data = await response.json();

    if (!data.articles || data.articles.length === 0) {
      statusEl.textContent = 'No recent weather news found.';
      return;
    }

    statusEl.textContent =
      `${data.articles.length} recent news reports found.`;

    listEl.innerHTML = data.articles.slice(0, 5).map(article => `
      <div class="card" style="margin-top:12px;padding:15px;">

        <h3>${article.title || 'Weather News'}</h3>

        <p>
          ${article.description || 'No description available.'}
        </p>

        <div class="small-note">
          Source: ${article.source?.name || 'News source'}
        </div>

        <a
          href="${article.url}"
          target="_blank"
          rel="noopener noreferrer"
          class="btn"
          style="display:inline-block;margin-top:10px;"
        >
          Read Full News →
        </a>

      </div>
    `).join('');

  } catch (error) {

    console.error('Media error:', error);

    statusEl.textContent =
      'Unable to load live media information.';
  }
}
function renderLiveWeather(){
  const d = state.liveData; if(!d) return;
  document.getElementById('liveLocLabel').textContent = d.label;
  document.getElementById('lwTemp').textContent = d.temp+'°C';
  document.getElementById('lwHum').textContent = d.humidity+'%';
  document.getElementById('lwRain').textContent = d.rain+' mm';
  document.getElementById('lwWind').textContent = d.wind+' km/h';
  document.getElementById('lwPress').textContent = d.pressure+' hPa';
  document.getElementById('lwCloud').textContent = d.cloud+'%';
  document.getElementById('lwCond').textContent = d.cond;
  document.getElementById('lwUpdated').textContent = new Date(d.time).toLocaleString('en-IN');
}
function useLiveForPrediction(){
  if(!state.liveData){ alert('Fetch live weather first.'); return; }
  go('prediction'); switchPredMode('live');
}

/* ---------------- Prediction page ---------------- */
function switchPredMode(mode){
  document.getElementById('predTabManual').classList.toggle('active', mode==='manual');
  document.getElementById('predTabLive').classList.toggle('active', mode==='live');
  document.getElementById('manualInputs').style.display = mode==='manual' ? 'block':'none';
  document.getElementById('liveInputsNote').style.display = mode==='live' ? 'block':'none';
  if(mode==='live'){
    const box = document.getElementById('livePredSnapshot');
    if(state.liveData){
      const d = state.liveData;
      box.innerHTML = `<div class="row"><span class="k">Location</span><span class="v">${d.label}</span></div>
        <div class="row"><span class="k">Temperature</span><span class="v">${d.temp}°C</span></div>
        <div class="row"><span class="k">Humidity</span><span class="v">${d.humidity}%</span></div>
        <div class="row"><span class="k">Wind</span><span class="v">${d.wind} km/h</span></div>
        <div class="row"><span class="k">Pressure</span><span class="v">${d.pressure} hPa</span></div>
        <div class="row"><span class="k">Cloud cover</span><span class="v">${d.cloud}%</span></div>`;
    } else {
      box.innerHTML = `<div class="empty-state">No live data yet — visit Live Weather and fetch a location first.</div>`;
    }
  }
}
let predBreakdownChart;
function badgeHtml(level){ return `<span class="badge ${level}"><span class="b-dot"></span>${level}</span>`; }

function runManualPrediction(){
  const inputs = {
    temp: +document.getElementById('mTemp').value,
    humidity: +document.getElementById('mHum').value,
    wind: +document.getElementById('mWind').value,
    pressure: +document.getElementById('mPress').value,
    cloud: +document.getElementById('mCloud').value,
    prevRain: +document.getElementById('mPrevRain').value,
    soil: +document.getElementById('mSoil').value,
  };
  const result = RS_ENGINE.score(inputs);
  renderPrediction(result, 'Manual entry');
  logHistory('Manual entry', result);
}
function runLivePrediction(){
  if(!state.liveData){ alert('Fetch live weather first.'); return; }
  const d = state.liveData;
  const inputs = {temp:d.temp, humidity:d.humidity, wind:d.wind, pressure:d.pressure, cloud:d.cloud, prevRain:d.rain, soil:40};
  const result = RS_ENGINE.score(inputs);
  renderPrediction(result, d.label);
  logHistory(d.label, result);
}
function speakLastPrediction(){
  if(!state.lastPrediction){ speak('No prediction generated yet.'); return; }
  speakPredictionResult(state.lastPrediction.r, state.lastPrediction.loc);
}
function renderPrediction(r, locationLabel){
  state.lastPrediction = {r, loc:locationLabel};
  document.getElementById('predRainOut').innerHTML = r.rainfallMm+'<span class="stat-unit">mm</span>';
  document.getElementById('predFloodOut').innerHTML = badgeHtml(r.floodLevel);
  document.getElementById('predCropOut').innerHTML = badgeHtml(r.cropLevel);
  document.getElementById('predOverallOut').innerHTML = badgeHtml(r.overallLevel);

  const ctx = document.getElementById('predBreakdownChart');
  const data = {
    labels:['Rainfall est.','Flood score','Crop score','Overall'],
    datasets:[{label:'Score (0-100)', data:[Math.min(100,r.rainfallMm/2.2), r.floodScore, r.cropScore, r.overallScore],
      backgroundColor:['#3fc6cf','#f2994a','#8b7bf0','#e8544b'], borderRadius:6}]
  };
  if(predBreakdownChart) predBreakdownChart.destroy();
  predBreakdownChart = new Chart(ctx, {type:'bar', data, options: chartBaseOpts({max:100})});

  updateHomeSnapshot(r, locationLabel);
  updateDashboardFromResult(r);
}
function updateHomeSnapshot(r, loc){
  if(loc) document.getElementById('homeLoc').textContent = loc;
  if(r){
    document.getElementById('homeHazard').innerHTML = badgeHtml(r.overallLevel);
    document.getElementById('homeFlood').innerHTML = badgeHtml(r.floodLevel);
    document.getElementById('homeCrop').innerHTML = badgeHtml(r.cropLevel);
  }
}

/* ---------------- Dashboard page ---------------- */
let dbChart;
function chartBaseOpts(extra={}){
  return {
    responsive:true, maintainAspectRatio:false,
    plugins:{legend:{labels:{color:'#aebdd4', font:{family:'IBM Plex Mono', size:11}}}},
    scales:{
      x:{ticks:{color:'#728098', font:{family:'IBM Plex Mono', size:10}}, grid:{color:'#1a2740'}},
      y:{ticks:{color:'#728098', font:{family:'IBM Plex Mono', size:10}}, grid:{color:'#1a2740'}, ...extra}
    }
  };
}
function updateDashboardFromResult(r){
  document.getElementById('dbFloodBadge').innerHTML = badgeHtml(r.floodLevel);
  document.getElementById('dbCropBadge').innerHTML = badgeHtml(r.cropLevel);
  document.getElementById('dbExplain').innerHTML = r.drivers.slice(0,1).map(d=>`Top driver: <b style="color:var(--amber)">${d.name}</b> (${Math.round(d.weight)}/100 influence)`).join('');
  document.getElementById('dbAdvisory').innerHTML = advisoryFor(r).slice(0,2).map(a=>'• '+a).join('<br>');
}
function refreshDashboardStats(){
  if(state.liveData){
    document.getElementById('dbTemp').innerHTML = state.liveData.temp+'<span class="stat-unit">°C</span>';
    document.getElementById('dbRain').innerHTML = state.liveData.rain+'<span class="stat-unit">mm</span>';
  }
}
function initDashboardMap(){
  if(state.dbMapObj) { state.dbMapObj.invalidateSize(); return; }
  state.dbMapObj = L.map('dbMap', {zoomControl:false, attributionControl:false}).setView([10.9,78.4], 6.2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  attribution:'&copy; OpenStreetMap contributors',
  maxZoom:19
}).addTo(state.dbMapObj);
  LOCATIONS.forEach(loc=>{ L.circleMarker([loc.lat,loc.lon],{radius:5,color:'#3fc6cf',fillColor:'#3fc6cf',fillOpacity:0.8,weight:1}).addTo(state.dbMapObj); });
}
function renderDbWarnings(){
  const box = document.getElementById('dbWarnings');
  const recent = state.history.slice(-3).reverse();
  if(!recent.length){ box.innerHTML = '<div class="empty-state">No warnings generated yet — run a prediction.</div>'; return; }
  box.innerHTML = recent.map(h=>`<div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;padding:8px 0;border-bottom:1px solid var(--line-soft);">
    <span>${h.location}</span>${badgeHtml(h.overallLevel)}</div>`).join('');
}

/* ---------------- Forecast page ---------------- */
let forecastChart;
async function loadForecast(){
  const dl = LOCATIONS[DEFAULT_LOCATION_INDEX];
  const loc = state.liveData || {lat:dl.lat, lon:dl.lon, label:dl.name};
  document.getElementById('fcLocLabel').textContent = loc.label;
  try{
    const data = await apiFetchForecast(loc.lat, loc.lon);
    const days = data.daily.time.map((t,i)=>{
      const rain = data.daily.precipitation_sum[i];
      const tmax = data.daily.temperature_2m_max[i];
      const tmin = data.daily.temperature_2m_min[i];
      const hum = data.daily.relative_humidity_2m_mean ? data.daily.relative_humidity_2m_mean[i] : 60;
      const wind = data.daily.wind_speed_10m_max[i];
      const r = RS_ENGINE.score({temp:(tmax+tmin)/2, humidity:hum, wind:wind, pressure:1010, cloud:Math.min(100,rain*3+30), prevRain:rain, soil:40});
      return {date:t, rain, tmax, tmin, hum, floodScore:r.floodScore, floodLevel:r.floodLevel, cropScore:r.cropScore, cropLevel:r.cropLevel};
    });
    state.forecastData = days;
    renderForecastChart(); renderForecastTable(); renderDashboardChart(days);
  }catch(e){
    document.getElementById('fcLocLabel').textContent = loc.label + ' (forecast unavailable — check network)';
  }
}
function setForecastMetric(m){
  state.forecastMetric = m;
  document.querySelectorAll('#view-forecast .tabs-sub button').forEach(b=>b.classList.toggle('active', b.dataset.metric===m));
  renderForecastChart();
}
function renderForecastChart(){
  if(!state.forecastData) return;
  const days = state.forecastData;
  const labels = days.map(d=>new Date(d.date).toLocaleDateString('en-IN',{weekday:'short'}));
  let dataset, color, label;
  switch(state.forecastMetric){
    case 'rain': dataset = days.map(d=>d.rain); color='#3fc6cf'; label='Rainfall (mm)'; break;
    case 'temp': dataset = days.map(d=>d.tmax); color='#f5a623'; label='Max Temp (°C)'; break;
    case 'flood': dataset = days.map(d=>d.floodScore); color='#f2994a'; label='Flood Risk (0-100)'; break;
    case 'crop': dataset = days.map(d=>d.cropScore); color='#8b7bf0'; label='Crop Risk (0-100)'; break;
  }
  const ctx = document.getElementById('forecastChart');
  if(forecastChart) forecastChart.destroy();
  forecastChart = new Chart(ctx, {
    type:'line',
    data:{labels, datasets:[{label, data:dataset, borderColor:color, backgroundColor:color+'33', fill:true, tension:0.35, pointRadius:4}]},
    options:{...chartBaseOpts(), plugins:{...chartBaseOpts().plugins, tooltip:{mode:'index',intersect:false}}}
  });
}
function renderForecastTable(){
  const body = document.querySelector('#forecastTable tbody');
  body.innerHTML = state.forecastData.map(d=>`<tr>
    <td>${new Date(d.date).toLocaleDateString('en-IN',{weekday:'short', day:'numeric', month:'short'})}</td>
    <td>${d.rain} mm</td><td>${d.tmin}–${d.tmax}</td><td>${Math.round(d.hum)}%</td>
    <td>${badgeHtml(d.floodLevel)}</td><td>${badgeHtml(d.cropLevel)}</td></tr>`).join('');
}
function renderDashboardChart(days){
  const ctx = document.getElementById('dbChart');
  if(dbChart) dbChart.destroy();
  dbChart = new Chart(ctx, {
    type:'bar',
    data:{
      labels:days.map(d=>new Date(d.date).toLocaleDateString('en-IN',{weekday:'short'})),
      datasets:[
        {type:'bar', label:'Rainfall (mm)', data:days.map(d=>d.rain), backgroundColor:'#3fc6cf88', borderRadius:5, yAxisID:'y'},
        {type:'line', label:'Overall risk trend', data:days.map(d=>Math.max(d.floodScore,d.cropScore)), borderColor:'#e8544b', yAxisID:'y1', tension:0.3, pointRadius:3}
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{labels:{color:'#aebdd4', font:{family:'IBM Plex Mono', size:10}}}},
      scales:{
        x:{ticks:{color:'#728098', font:{size:10}}, grid:{display:false}},
        y:{position:'left', ticks:{color:'#728098', font:{size:10}}, grid:{color:'#1a2740'}},
        y1:{position:'right', max:100, ticks:{color:'#728098', font:{size:10}}, grid:{display:false}}
      }
    }
  });
  refreshDashboardStats();
}

/* ---------------- Risk Map page ---------------- */
function riskColor(level){ return {LOW:'#3cb878',MODERATE:'#e8c547',HIGH:'#f2994a',EXTREME:'#e8544b'}[level]; }
async function initRiskMap(){
  if(!state.mapObj){
    state.mapObj = L.map('riskMap',{zoomControl:true, attributionControl:true}).setView([10.9,78.4],6.8);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  attribution:'&copy; OpenStreetMap contributors',
  maxZoom:19
}).addTo(state.mapObj);
  } else { state.mapObj.invalidateSize(); }

  document.getElementById('mapUpdated').textContent = 'Loading live risk for '+LOCATIONS.length+' cities…';
  state.mapMarkers.forEach(m=>state.mapObj.removeLayer(m));
  state.mapMarkers = [];

  const results = await Promise.all(LOCATIONS.map(async loc=>{
    try{
      const data = await apiFetchCurrent(loc.lat, loc.lon);
      const c = data.current;
      const r = RS_ENGINE.score({temp:c.temperature_2m, humidity:c.relative_humidity_2m, wind:c.wind_speed_10m,
        pressure:c.pressure_msl, cloud:c.cloud_cover, prevRain:c.precipitation, soil:40});
      return {loc, live:{temp:c.temperature_2m,humidity:c.relative_humidity_2m,rain:c.precipitation,wind:c.wind_speed_10m,cond:WMO[c.weather_code]||'—'}, r};
    }catch(e){ return {loc, live:null, r:null}; }
  }));

  results.forEach(({loc, live, r})=>{
    if(!r) return;
    const marker = L.circleMarker([loc.lat, loc.lon], {
      radius: 9 + r.overallScore/12, color:'#0b1420', weight:1.5, fillColor:riskColor(r.overallLevel), fillOpacity:0.85
    }).addTo(state.mapObj);
    marker.on('click', ()=>{
      document.getElementById('mapSelectedDetail').innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <h3 style="margin:0;">${loc.name}</h3>${badgeHtml(r.overallLevel)}
        </div>
        <div class="grid" style="grid-template-columns:repeat(4,1fr);gap:10px;">
          <div><div class="card-label">Temp</div><div class="stat-num" style="font-size:18px;">${live.temp}°C</div></div>
          <div><div class="card-label">Rain</div><div class="stat-num" style="font-size:18px;">${live.rain}mm</div></div>
          <div><div class="card-label">Flood risk</div>${badgeHtml(r.floodLevel)}</div>
          <div><div class="card-label">Crop risk</div>${badgeHtml(r.cropLevel)}</div>
        </div>`;
    });
    state.mapMarkers.push(marker);
  });
  document.getElementById('mapUpdated').textContent = 'Updated '+new Date().toLocaleTimeString('en-IN');
  renderWarningsFromMapResults(results);
}

/* ---------------- Early Warning page ---------------- */
function renderWarningsFromMapResults(results){
  const risky = results.filter(x=>x.r && x.r.overallScore>=40).sort((a,b)=>b.r.overallScore-a.r.overallScore);
  const box = document.getElementById('warningList');
  if(!risky.length){
    box.innerHTML = `<div class="empty-state">No elevated hazard detected across monitored locations right now. Visit Risk Map to refresh.</div>`;
    return;
  }
  box.innerHTML = risky.map(({loc,live,r})=>{
    const cat = r.floodScore>r.cropScore ? (r.floodScore>=65?'Flood Alert':'Heavy Rainfall Alert') : 'Crop Risk Alert';
    const level = r.overallLevel;
    return `<div class="warn-card ${level}">
      <div class="warn-icon">⚠</div>
      <div>
        <div style="font-family:var(--font-mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--text-2);margin-bottom:4px;">${cat}</div>
        <div style="font-family:var(--font-display);font-weight:700;font-size:17px;margin-bottom:6px;">${level} — ${loc.name}</div>
        <div style="font-size:13.5px;color:var(--text-1);margin-bottom:8px;">Expected rainfall: ${r.rainfallMm} mm · Flood risk ${r.floodLevel} · Crop risk ${r.cropLevel}</div>
        <div style="font-size:12.5px;color:var(--text-2);">Recommended: monitor local weather updates, avoid unnecessary travel in affected areas, and follow official local authority instructions.</div>
        <div class="small-note">This is a system prediction, not an official emergency alert.</div>
      </div>
    </div>`;
  }).join('');
}

/* ---------------- Smart Advisory ---------------- */
function advisoryFor(r){
  const tips = [];
  if(r.floodScore>=65) tips.push('Prepare drainage systems and clear blocked channels before rainfall intensifies.');
  if(r.floodScore>=40 && r.floodScore<65) tips.push('Keep an eye on rising rainfall — check local drainage capacity.');
  if(r.cropLevel==='HIGH'||r.cropLevel==='EXTREME') tips.push('Protect vulnerable crops from excess water; consider temporary field drainage.');
  if(r.rainfallMm<8) tips.push('Avoid unnecessary irrigation only if further rainfall is expected soon — otherwise monitor soil moisture closely.');
  tips.push('Monitor soil moisture regularly and adjust irrigation plans as conditions change.');
  if(!tips.length) tips.push('Conditions are within normal range — routine monitoring is sufficient.');
  return tips;
}

/* ---------------- What-If Simulator ---------------- */
const SCN_FIELDS = [
  ['rainfall','Rainfall (prev., mm)',0,150,20],
  ['temp','Temperature (°C)',15,45,29],
  ['humidity','Humidity (%)',10,100,65],
  ['wind','Wind speed (km/h)',0,80,12],
  ['pressure','Pressure (hPa)',985,1030,1009],
  ['soil','Soil moisture (%)',5,100,35],
];
const scnState = { A:{}, B:{} };
SCN_FIELDS.forEach(f=>{ scnState.A[f[0]]=f[4]; scnState.B[f[0]]=f[4]; });
scnState.B.rainfall = 80; scnState.B.soil = 70; scnState.B.humidity = 88;

function sliderBlock(scn, field){
  const [key,label,min,max,def] = field;
  const val = scnState[scn][key];
  return `<div class="field">
    <label class="field-label">${label}: <span id="${scn}_${key}_v" style="color:var(--cyan)">${val}</span></label>
    <input type="range" min="${min}" max="${max}" value="${val}" oninput="updateScn('${scn}','${key}',this.value)">
  </div>`;
}
function renderWhatIf(){
  document.getElementById('scnA').innerHTML = SCN_FIELDS.map(f=>sliderBlock('A',f)).join('');
  document.getElementById('scnB').innerHTML = SCN_FIELDS.map(f=>sliderBlock('B',f)).join('');
  computeScenarios();
}
function updateScn(scn,key,val){
  scnState[scn][key] = +val;
  document.getElementById(`${scn}_${key}_v`).textContent = val;
  computeScenarios();
}
let scnChart;
function computeScenarios(){
  const rA = RS_ENGINE.score({temp:scnState.A.temp, humidity:scnState.A.humidity, wind:scnState.A.wind, pressure:scnState.A.pressure, cloud:Math.min(100,scnState.A.humidity+10), prevRain:scnState.A.rainfall, soil:scnState.A.soil});
  const rB = RS_ENGINE.score({temp:scnState.B.temp, humidity:scnState.B.humidity, wind:scnState.B.wind, pressure:scnState.B.pressure, cloud:Math.min(100,scnState.B.humidity+10), prevRain:scnState.B.rainfall, soil:scnState.B.soil});
  document.getElementById('scnAResult').innerHTML = `Rain ${rA.rainfallMm}mm · Flood ${badgeHtml(rA.floodLevel)} · Crop ${badgeHtml(rA.cropLevel)} · Overall ${badgeHtml(rA.overallLevel)}`;
  document.getElementById('scnBResult').innerHTML = `Rain ${rB.rainfallMm}mm · Flood ${badgeHtml(rB.floodLevel)} · Crop ${badgeHtml(rB.cropLevel)} · Overall ${badgeHtml(rB.overallLevel)}`;

  const ctx = document.getElementById('scnChart');
  if(scnChart) scnChart.destroy();
  scnChart = new Chart(ctx, {
    type:'bar',
    data:{
      labels:['Rainfall risk','Flood risk','Crop risk','Overall hazard'],
      datasets:[
        {label:'Scenario A', data:[Math.min(100,rA.rainfallMm/2.2), rA.floodScore, rA.cropScore, rA.overallScore], backgroundColor:'#3fc6cf', borderRadius:5},
        {label:'Scenario B', data:[Math.min(100,rB.rainfallMm/2.2), rB.floodScore, rB.cropScore, rB.overallScore], backgroundColor:'#f5a623', borderRadius:5},
      ]
    },
    options: chartBaseOpts({max:100})
  });
}

/* ---------------- AI Insights ---------------- */
function renderInsights(){
  const last = state.history[state.history.length-1];
  const drivers = last ? last.drivers : RS_ENGINE.score({temp:29,humidity:70,wind:14,pressure:1008,cloud:55,prevRain:20,soil:40}).drivers;
  document.getElementById('featImportance').innerHTML = drivers.map(d=>`
    <div class="feat-bar-row">
      <span>${d.name}</span>
      <div class="feat-bar-track"><div class="feat-bar-fill" style="width:${Math.round(d.weight)}%"></div></div>
      <span style="text-align:right;">${Math.round(d.weight)}</span>
    </div>`).join('');
}

/* ---------------- Prediction History ---------------- */
function logHistory(location, r){
  const now = new Date();
  state.history.push({
    date: now.toLocaleDateString('en-IN'), time: now.toLocaleTimeString('en-IN',{hour12:false}),
    location, rainfallMm:r.rainfallMm, floodLevel:r.floodLevel, cropLevel:r.cropLevel, overallLevel:r.overallLevel,
    overallScore:r.overallScore, drivers:r.drivers, _ts: now.getTime()
  });
  renderDbWarnings();
}
function renderHistory(){
  const search = (document.getElementById('histSearch')?.value||'').toLowerCase();
  const filter = document.getElementById('histFilter')?.value||'';
  const sort = document.getElementById('histSort')?.value||'newest';
  let rows = state.history.filter(h=>h.location.toLowerCase().includes(search) && (!filter || h.overallLevel===filter));
  if(sort==='newest') rows = rows.slice().sort((a,b)=>b._ts-a._ts);
  if(sort==='oldest') rows = rows.slice().sort((a,b)=>a._ts-b._ts);
  if(sort==='risk') rows = rows.slice().sort((a,b)=>b.overallScore-a.overallScore);

  const body = document.getElementById('histBody');
  document.getElementById('histEmpty').style.display = rows.length ? 'none':'block';
  body.innerHTML = rows.map(h=>`<tr>
    <td>${h.date}</td><td>${h.time}</td><td>${h.location}</td><td>${h.rainfallMm} mm</td>
    <td>${badgeHtml(h.floodLevel)}</td><td>${badgeHtml(h.cropLevel)}</td><td>${badgeHtml(h.overallLevel)}</td>
    <td><button class="btn ghost" style="padding:5px 10px;" onclick="deleteHistoryEntry(${h._ts})">Delete</button></td>
  </tr>`).join('');
}
function deleteHistoryEntry(ts){ state.history = state.history.filter(h=>h._ts!==ts); renderHistory(); renderDbWarnings(); }
function clearHistory(){ if(confirm('Clear all prediction history for this session?')){ state.history=[]; renderHistory(); renderDbWarnings(); } }

/* ---------------- Theme (dark / light) ---------------- */
let currentTheme = 'dark';
function toggleTheme(){
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', currentTheme);
  document.getElementById('themeToggleBtn').textContent = currentTheme === 'dark' ? '🌙' : '☀️';
  // Chart.js instances read colors from options set at creation time; redraw active charts so
  // axis/legend text stays legible against the new background.
  [predBreakdownChart, forecastChart, dbChart, scnChart].forEach(c=>{ if(c) c.update(); });
}

/* ---------------- Voice interaction ---------------- */
const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognizer = null, listening = false;
const synth = window.speechSynthesis;

function speak(text){
  if(!synth) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.0; u.pitch = 1.0;
  synth.speak(u);
}
function speakLiveWeather(){
  const d = state.liveData;
  if(!d){ speak('No live weather data yet. Fetch a location first.'); return; }
  speak(`Current conditions in ${d.label}: temperature ${d.temp} degrees, humidity ${d.humidity} percent, ` +
        `rainfall ${d.rain} millimetres, wind speed ${d.wind} kilometres per hour, ${d.cond}.`);
}
function speakWarnings(){
  const cards = document.querySelectorAll('#warningList .warn-card');
  if(!cards.length){ speak('No elevated hazard warnings right now.'); return; }
  let text = `There are ${cards.length} active warnings. `;
  cards.forEach(c=>{
    const title = c.querySelector('div[style*="font-family:var(--font-display)"]');
    if(title) text += title.textContent + '. ';
  });
  speak(text);
}
function speakPredictionResult(r, locationLabel){
  speak(`Prediction for ${locationLabel}: rainfall estimate ${r.rainfallMm} millimetres. ` +
        `Flood risk ${r.floodLevel}. Crop risk ${r.cropLevel}. Overall hazard level ${r.overallLevel}.`);
}

function setupVoiceRecognition(){
  const btn = document.getElementById('voiceNavBtn');
  if(!SpeechRecognitionAPI){
    btn.classList.add('unsupported');
    btn.title = 'Voice commands are not supported in this browser';
    return;
  }
  recognizer = new SpeechRecognitionAPI();
  recognizer.lang = 'en-IN';
  recognizer.continuous = false;
  recognizer.interimResults = true;

  recognizer.onstart = ()=>{
    listening = true;
    btn.classList.add('listening');
    document.getElementById('voicePanel').classList.add('show');
    document.getElementById('vpTranscript').textContent = 'Listening…';
  };
  recognizer.onresult = (e)=>{
    let transcript = '';
    for(let i=e.resultIndex;i<e.results.length;i++) transcript += e.results[i][0].transcript;
    document.getElementById('vpTranscript').textContent = transcript;
    if(e.results[e.results.length-1].isFinal) handleVoiceCommand(transcript.trim());
  };
  recognizer.onerror = ()=>{ stopListeningUI(); };
  recognizer.onend = ()=>{ stopListeningUI(); };
}
function stopListeningUI(){
  listening = false;
  document.getElementById('voiceNavBtn').classList.remove('listening');
  setTimeout(()=>document.getElementById('voicePanel').classList.remove('show'), 1400);
}
function toggleVoiceListening(){
  if(!SpeechRecognitionAPI){ alert('Voice commands need Chrome, Edge, or another browser with Web Speech API support.'); return; }
  if(listening){ recognizer.stop(); return; }
  try{ recognizer.start(); }catch(e){ /* already started */ }
}

function handleVoiceCommand(cmd){
  const c = cmd.toLowerCase();
  document.getElementById('vpTranscript').textContent = '“' + cmd + '”';

  if(c.includes('stop listening')){ speak('Voice control stopped.'); return; }
  if(c.includes('dark mode')){ if(currentTheme!=='dark') toggleTheme(); speak('Dark mode on.'); return; }
  if(c.includes('light mode')){ if(currentTheme!=='light') toggleTheme(); speak('Light mode on.'); return; }

  if(c.includes('home')){ go('home'); speak('Showing home.'); return; }
  if(c.includes('dashboard')){ go('dashboard'); speak('Showing dashboard.'); return; }
  if(c.includes('forecast')){ go('forecast'); speak('Showing seven day forecast.'); return; }
  if(c.includes('risk map') || c.includes('map')){ go('map'); speak('Showing the risk map.'); return; }
  if(c.includes('warning') || c.includes('alert')){ go('warning'); speak('Showing early warning center.'); setTimeout(speakWarnings, 600); return; }
  if(c.includes('what if') || c.includes('simulator') || c.includes('scenario')){ go('whatif'); speak('Opening the what if simulator.'); return; }
  if(c.includes('insight') || c.includes('explain')){ go('insights'); speak('Showing A I insights.'); return; }
  if(c.includes('history')){ go('history'); speak('Showing prediction history.'); return; }
  if(c.includes('about')){ go('about'); speak('Showing about page.'); return; }
  if(c.includes('run prediction') || c.includes('predict')){
    go('prediction'); runManualPrediction();
    speak('Running prediction.');
    return;
  }
  if(c.includes('read weather') || c.includes('current weather')){ speakLiveWeather(); return; }
  if(c.includes('weather') || c.includes('live')){
    const loc = findLocationByName(c);
    go('live');
    if(loc){
      const idx = LOCATIONS.indexOf(loc);
      document.getElementById('liveLocationSelect').value = idx;
      document.getElementById('liveLat').value = loc.lat;
      document.getElementById('liveLon').value = loc.lon;
      fetchLiveWeather().then(()=>speakLiveWeather());
      speak(`Checking weather for ${loc.name}.`);
    } else {
      speak('Showing live weather. Fetching the current location.');
      fetchLiveWeather();
    }
    return;
  }
  // bare district name spoken on its own
  const loc = findLocationByName(c);
  if(loc){
    const idx = LOCATIONS.indexOf(loc);
    go('live');
    document.getElementById('liveLocationSelect').value = idx;
    document.getElementById('liveLat').value = loc.lat;
    document.getElementById('liveLon').value = loc.lon;
    fetchLiveWeather().then(()=>speakLiveWeather());
    return;
  }
  speak("Sorry, I didn't catch a command I recognize. Try dashboard, risk map, or a district name.");
}

/* ---------------- Init ---------------- */
function init(){
  buildNav(); buildIsobars(); populateLocationSelect(); setupVoiceRecognition();
  document.documentElement.setAttribute('data-theme', currentTheme);
  fetchLiveWeather();     // initial live fetch for default location
  loadForecast();
  runManualPrediction();  // seed a default prediction so pages aren't empty
  renderWhatIf();
  go('home');
}
window.addEventListener('DOMContentLoaded', init);
