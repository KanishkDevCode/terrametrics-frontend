import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Activity, Map as MapIcon, TrendingUp, Layers, Menu, ChevronLeft, MapPin, Camera } from 'lucide-react';

// --- City Coordinate Database ---
const CITIES = {
  "Dehradun": { lat: 30.3165, lon: 78.0322 },
  "IIT Indore": { lat: 22.5204, lon: 75.9207 },
  "IIT Roorkee": { lat: 29.8649, lon: 77.8966 }
};

// Helper component to smoothly fly the map to new cities
function ChangeView({ center }) {
  const map = useMap();
  
  useEffect(() => {
    map.flyTo(center, 15, { duration: 1.5 });
  }, [center[0], center[1], map]); // <-- THE FIX: Track the exact lat/lon numbers!

  return null;
}

export default function App() {
  const [activeView, setActiveView] = useState('expansion');
  const [telemetryData, setTelemetryData] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [mapTileUrl, setMapTileUrl] = useState(null);
  const [isLoadingMap, setIsLoadingMap] = useState(false);
  const [selectedYear, setSelectedYear] = useState(2022);
  const [isUploading, setIsUploading] = useState(false);
  const [activeCity, setActiveCity] = useState("Dehradun");
  const [activeLayer, setActiveLayer] = useState("urban"); 
  const position = [CITIES[activeCity].lat, CITIES[activeCity].lon];

  const [vehiclePos, setVehiclePos] = useState([30.3244, 78.0339]);

  const fetchSatelliteData = async (year, layer = activeLayer) => {
    setIsLoadingMap(true);
    try {
      const response = await axios.post(`http://127.0.0.1:8000/api/v1/geo/map-layer?year=${year}&layer_type=${layer}`, {
        lon: position[1], 
        lat: position[0]  
      });
      setMapTileUrl(response.data.data.tile_url);
    } catch (error) {
      console.error("Error fetching Earth Engine tile:", error);
    }
    setIsLoadingMap(false);
  };
  
  // Trending Data for the Line Chart
  const trendData = [
    { year: '2020', cost: 1.2 },
    { year: '2021', cost: 2.4 },
    { year: '2022', cost: 4.1 },
    { year: '2023', cost: 7.5 },
    { year: '2024', cost: 11.2 },
    { year: '2025', cost: 15.7 },
  ];

  const potholeCount = telemetryData ? telemetryData.features.length : 0;
  const currentDeficit = trendData[trendData.length - 1].cost + (potholeCount * 0.0015);
  
  const routeCoordinates = telemetryData 
    ? telemetryData.features.map(feature => [
        feature.geometry.coordinates[1], 
        feature.geometry.coordinates[0]  
      ])
    : [];

  useEffect(() => {
    if (activeCity !== "Dehradun") return;

    const fetchTelemetry = async () => {
      try {
        const heatmapResponse = await axios.get('http://127.0.0.1:8000/api/v1/telemetry/pothole-heatmap');
        setTelemetryData(heatmapResponse.data);
        
        const vehicleResponse = await axios.get('http://127.0.0.1:8000/api/v1/telemetry/live-vehicle');
        setVehiclePos([vehicleResponse.data.lat, vehicleResponse.data.lon]);
      } catch (error) {
        console.error("Error fetching telemetry:", error);
      }
    };
    
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 1500); 
    return () => clearInterval(interval);
  }, [activeCity]);

  const geojsonMarkerOptions = {
    radius: 8, fillColor: "#ef4444", color: "#7f1d1d", weight: 1, opacity: 1, fillOpacity: 0.8
  };

  const pointToLayer = (feature, latlng) => L.circleMarker(latlng, geojsonMarkerOptions);

  const truckIcon = L.divIcon({
    html: '<div style="font-size: 24px; filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.5));">🚚</div>',
    className: 'custom-truck-icon', iconSize: [30, 30], iconAnchor: [15, 15]
  });

  // PERFECTLY MAPPED TO RAJPUR ROAD (Clock Tower to Rajpur)
  const plannedRoute = [
    [30.3245, 78.0416], [30.3275, 78.0435], [30.3300, 78.0456],
    [30.3335, 78.0483], [30.3365, 78.0505], [30.3385, 78.0515],
    [30.3420, 78.0535], [30.3460, 78.0558], [30.3495, 78.0583],
    [30.3520, 78.0601], [30.3550, 78.0620], [30.3585, 78.0645],
    [30.3620, 78.0665], [30.3660, 78.0685], [30.3700, 78.0705],
    [30.3750, 78.0725], [30.3800, 78.0750]
  ];

  const handleCameraCapture = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsUploading(true);

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        try {
          await axios.post('http://127.0.0.1:8000/api/v1/telemetry/manual-report', {
            lat: position.coords.latitude,
            lon: position.coords.longitude,
            severity_score: 90.0
          });
          
          alert("✅ Road Hazard Successfully Logged to TerraMetrics!");
          setVehiclePos([position.coords.latitude, position.coords.longitude]);
          
        } catch (error) {
          console.error("Upload failed:", error);
          alert("❌ Failed to log hazard. Is the backend running?");
        } finally {
          setIsUploading(false);
        }
      }, (error) => {
        alert("📍 Please enable GPS Location services to report a hazard.");
        setIsUploading(false);
      });
    } else {
      alert("Geolocation is not supported by your browser.");
      setIsUploading(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-slate-900 text-slate-50 font-sans overflow-hidden">
      
      {/* --- NEW: Smooth Driving Animation (With Zoom Fix) --- */}
      <style>{`
        .custom-truck-icon {
          transition: transform 1.5s linear;
        }
        /* Disable the smooth transition ONLY when the user is zooming the map */
        .leaflet-zoom-anim .custom-truck-icon {
          transition: none !important;
        }
      `}</style>

      {/* SIDEBAR */}
      <div className={`${isSidebarOpen ? 'ml-0' : '-ml-72'} w-72 flex-shrink-0 bg-slate-800 border-r border-slate-700 flex flex-col z-[1000] shadow-xl transition-all duration-300 ease-in-out`}>
        <div className="p-6 border-b border-slate-700 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-blue-400 flex items-center gap-2">
              <Layers size={28} /> TerraMetrics
            </h1>
            <p className="text-slate-400 text-sm mt-1">Urban Infrastructure Intel</p>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="text-slate-400 hover:text-white transition-colors">
            <ChevronLeft size={24} />
          </button>
        </div>

        {/* City Selector Dropdown */}
        <div className="p-4 border-b border-slate-700">
          <label className="text-xs text-slate-400 uppercase font-semibold tracking-wider mb-2 flex items-center gap-1">
            <MapPin size={14} /> Active Region
          </label>
          <select 
            value={activeCity} 
            onChange={(e) => setActiveCity(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5"
          >
            {Object.keys(CITIES).map(city => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <button onClick={() => setActiveView('expansion')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeView === 'expansion' ? 'bg-blue-600 text-white' : 'hover:bg-slate-700 text-slate-300'}`}>
            <MapIcon size={20} /> <span className="font-medium">Urban Expansion</span>
          </button>
          <button onClick={() => setActiveView('telematics')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeView === 'telematics' ? 'bg-blue-600 text-white' : 'hover:bg-slate-700 text-slate-300'}`}>
            <Activity size={20} /> <span className="font-medium">Sensor Telematics</span>
          </button>
          <button onClick={() => setActiveView('economics')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeView === 'economics' ? 'bg-blue-600 text-white' : 'hover:bg-slate-700 text-slate-300'}`}>
            <TrendingUp size={20} /> <span className="font-medium">Economic Analytics</span>
          </button>
        </nav>

        <div className="p-6 border-t border-slate-700">
          <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
            <p className="text-xs text-slate-400 uppercase font-semibold tracking-wider mb-1">System Status</p>
            <div className="flex items-center gap-2 text-sm text-green-400">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
              API Connected
            </div>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 relative">
        {!isSidebarOpen && (
          <button onClick={() => setIsSidebarOpen(true)} className="absolute top-4 left-14 z-[1000] bg-slate-800 p-2 rounded-md shadow-lg border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors">
            <Menu size={24} />
          </button>
        )}
        
        {/* Updated Map Zoom Default to 15 */}
        <MapContainer center={position} zoom={15} style={{ height: '100%', width: '100%', zIndex: 0 }}>
          <ChangeView center={position} /> 
          
          {/* UPDATED: OpenStreetMap TileLayer for Detailed POIs */}
          <TileLayer 
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" 
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' 
          />

          {activeView === 'expansion' && mapTileUrl && (
            <TileLayer key={mapTileUrl} url={mapTileUrl} opacity={0.5} />
          )}
          
          {activeView === 'telematics' && activeCity === 'Dehradun' && (
            <>
              <Polyline positions={plannedRoute} color="#3b82f6" weight={4} dashArray="8, 8" opacity={0.5} />
              {telemetryData && <GeoJSON key={telemetryData.features.length} data={telemetryData} pointToLayer={pointToLayer} />}
              <Marker position={vehiclePos} icon={truckIcon} />
            </>
          )}
        </MapContainer>

        {/* Overlay Panel */}
        <div className="absolute top-6 right-6 w-96 bg-slate-800/90 backdrop-blur-md p-6 rounded-xl border border-slate-700 shadow-2xl z-[1000]">
          
          {activeView === 'expansion' && (
            <div>
              <h2 className="text-lg font-bold mb-2 text-blue-400 flex items-center gap-2">
                <MapIcon size={20} /> Phase A: Spatial Growth
              </h2>
              <p className="text-sm text-slate-300 mb-4">Historical land cover and satellite-detected urban sprawl.</p>
              
              <div className="mb-4 space-y-2">
                <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-2">Google Earth Engine Overlays</p>
                
                <label className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${activeLayer === 'urban' ? 'bg-blue-900/40 border-blue-500' : 'bg-slate-900 border-slate-700 hover:bg-slate-800'}`}>
                  <span className="text-sm font-medium text-slate-200">Urban Sprawl (Built-up)</span>
                  <input type="radio" name="layer" className="w-4 h-4 accent-blue-500" checked={activeLayer === 'urban'} onChange={() => { setActiveLayer('urban'); fetchSatelliteData(selectedYear, 'urban'); }} />
                </label>

                <label className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${activeLayer === 'ndvi' ? 'bg-emerald-900/40 border-emerald-500' : 'bg-slate-900 border-slate-700 hover:bg-slate-800'}`}>
                  <span className="text-sm font-medium text-slate-200">NDVI (Vegetation Loss)</span>
                  <input type="radio" name="layer" className="w-4 h-4 accent-emerald-500" checked={activeLayer === 'ndvi'} onChange={() => { setActiveLayer('ndvi'); fetchSatelliteData(selectedYear, 'ndvi'); }} />
                </label>

                <label className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${activeLayer === 'lst' ? 'bg-orange-900/40 border-orange-500' : 'bg-slate-900 border-slate-700 hover:bg-slate-800'}`}>
                  <span className="text-sm font-medium text-slate-200">LST (Surface Urban Heat)</span>
                  <input type="radio" name="layer" className="w-4 h-4 accent-orange-500" checked={activeLayer === 'lst'} onChange={() => { setActiveLayer('lst'); fetchSatelliteData(selectedYear, 'lst'); }} />
                </label>
              </div>

              <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
                <div className="flex justify-between items-center mb-3">
                  <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Time Slider</p>
                  <span className="bg-blue-900/50 text-blue-400 font-bold px-2 py-1 rounded text-sm">{selectedYear}</span>
                </div>
                <input type="range" min="2001" max="2022" step="1" value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="w-full accent-blue-500 mb-4" />
                <button onClick={() => fetchSatelliteData(selectedYear)} disabled={isLoadingMap} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-4 rounded transition-colors disabled:opacity-50">
                  {isLoadingMap ? 'Rendering Layer...' : `Load ${selectedYear} Map`}
                </button>
              </div>
            </div>
          )}
          
          {activeView === 'telematics' && (
            <div>
              <h2 className="text-lg font-bold mb-2 text-red-400 flex items-center gap-2">
                <Activity size={20} /> Phase B: Infrastructure
              </h2>
              <p className="text-sm text-slate-300 mb-4">Live crowdsourced road degradation mapping.</p>
              
              <div className="bg-slate-900 p-4 rounded-lg border border-slate-700 mb-4">
                <p className="text-sm text-slate-400">Total Anomalies Detected:</p>
                <p className="text-2xl font-bold text-slate-50">{activeCity === 'Dehradun' && telemetryData ? telemetryData.features.length : 0}</p>
              </div>

              <div className="relative">
                <input 
                  type="file" 
                  accept="image/*" 
                  capture="environment" 
                  onChange={handleCameraCapture}
                  disabled={isUploading}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <button className={`w-full flex justify-center items-center gap-2 text-white font-medium py-3 px-4 rounded-lg transition-colors ${isUploading ? 'bg-slate-600' : 'bg-emerald-600 hover:bg-emerald-500'}`}>
                  <Camera size={20} /> 
                  {isUploading ? 'Acquiring GPS...' : 'Capture Road Hazard'}
                </button>
              </div>
            </div>
          )}
          
          {activeView === 'economics' && (
            <div className="flex flex-col h-full">
              <h2 className="text-lg font-bold mb-2 text-emerald-400 flex items-center gap-2">
                <TrendingUp size={20} /> Depreciation Matrix
              </h2>
              
              <div className="grid grid-cols-2 gap-4 mb-4 mt-2">
                <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
                  <p className="text-[11px] text-slate-400 uppercase font-semibold">Est. Maint. Deficit</p>
                  <p className="text-xl font-bold text-red-400 mt-1">₹ {currentDeficit.toFixed(2)} Cr</p>
                </div>
                <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
                  <p className="text-[11px] text-slate-400 uppercase font-semibold">Permeable Surface Lost</p>
                  <p className="text-xl font-bold text-amber-400 mt-1">14.5%</p>
                </div>
              </div>

              <div className="h-64 bg-slate-900 p-4 rounded-lg border border-slate-700">
                <p className="text-xs text-slate-400 mb-2 uppercase tracking-wider font-semibold">Compounding Depreciation</p>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis dataKey="year" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px' }}
                      itemStyle={{ color: '#ef4444', fontWeight: 'bold' }}
                      formatter={(value) => [`₹${value} Cr`, 'Deficit']}
                    />
                    <Line type="monotone" dataKey="cost" stroke="#ef4444" strokeWidth={3} dot={{ r: 4, fill: '#ef4444', strokeWidth: 2, stroke: '#1e293b' }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}