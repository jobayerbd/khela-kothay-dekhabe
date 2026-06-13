import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocationItem } from '../types';

interface MapComponentProps {
  locations: LocationItem[];
  selectedLocation: LocationItem | null;
  onSelectLocation: (location: LocationItem) => void;
  onMapClickToAdd: (coords: { lat: number; lng: number }) => void;
  userCoords: { lat: number; lng: number } | null;
  setUserCoords: (coords: { lat: number; lng: number }) => void;
}

// Custom Leaflet marker with modern status indicators & colors
const createCustomIcon = (status: 'upcoming' | 'streaming' | 'inactive', isSelected: boolean) => {
  let color = '#64748b'; // default slate-gray
  let emoji = '🔴';
  let pulseClass = '';

  if (status === 'streaming') {
    color = '#10b981'; // emerald green
    emoji = '🟢';
    pulseClass = 'animate-pulse';
  } else if (status === 'upcoming') {
    color = '#f59e0b'; // amber
    emoji = '🟡';
  }

  const size = isSelected ? 42 : 32;
  
  return L.divIcon({
    className: 'custom-leaflet-marker-icon',
    html: `
      <div class="flex flex-col items-center justify-center transition-all ${isSelected ? 'scale-115' : 'hover:scale-105'}" style="width: ${size}px; height: ${size}px;">
        <div class="rounded-full bg-white flex items-center justify-center border-2 shadow-md transition-shadow ${pulseClass}" 
             style="background-color: ${color}; width: ${size}px; height: ${size}px; border-color: ${isSelected ? '#3b82f6' : '#ffffff'}; box-shadow: ${isSelected ? '0 0 8px #3b82f6' : '0 2px 4px rgba(0,0,0,0.15)'};">
          <span style="font-size: ${isSelected ? '15px' : '11px'}; line-height: 1;">${emoji}</span>
        </div>
        <div class="w-1.5 h-1.5 bg-black/20 blur-[1px] rounded-full mt-0.5"></div>
      </div>
    `,
    iconSize: [size, size + 10],
    iconAnchor: [size / 2, size + 10]
  });
};

// Custom User GPS location pulse marker
const createUserIcon = () => {
  return L.divIcon({
    className: 'custom-user-gps-icon',
    html: `
      <div class="relative flex h-6 w-6 items-center justify-center">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-3.5 w-3.5 bg-blue-600 border-2 border-white shadow-lg"></span>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
};

export default function MapComponent({
  locations,
  selectedLocation,
  onSelectLocation,
  onMapClickToAdd,
  userCoords,
  setUserCoords
}: MapComponentProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ [key: string]: L.Marker }>({});
  const userMarkerRef = useRef<L.Marker | null>(null);

  // 1. Initialize Map on Load
  useEffect(() => {
    if (!containerRef.current) return;

    // Center on Dhaka, Bangladesh initially
    const initialLat = 23.777176;
    const initialLng = 90.399452;

    if (!mapRef.current) {
      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true
      }).setView([initialLat, initialLng], 12);

      // Set up clean CartoDB Positron tile layer for road-only display with zero landmark clutter
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank">CARTO</a>'
      }).addTo(map);

      // Click on map listener to trigger Add Spot popup/modal
      map.on('click', (e: L.LeafletMouseEvent) => {
        onMapClickToAdd({ lat: e.latlng.lat, lng: e.latlng.lng });
      });

      mapRef.current = map;
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // 2. Geolocation Lookup to orient Map Center on user load
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setUserCoords(coords);
          if (mapRef.current) {
            mapRef.current.setView([coords.lat, coords.lng], 14, { animate: true });
          }
        },
        (error) => {
          console.warn("Geolocation access denied or unavailable:", error);
        }
      );
    }
  }, [setUserCoords]);

  // 3. Render and sync User GPS Marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userCoords) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userCoords.lat, userCoords.lng]);
    } else {
      const marker = L.marker([userCoords.lat, userCoords.lng], {
        icon: createUserIcon(),
        zIndexOffset: 1000 // Ensure user blue pin is high up
      }).addTo(map);
      userMarkerRef.current = marker;
    }
  }, [userCoords]);

  // 4. Center map when a location is explicitly selected
  useEffect(() => {
    if (selectedLocation && mapRef.current) {
      mapRef.current.setView([selectedLocation.lat, selectedLocation.lng], 15, { animate: true });
    }
  }, [selectedLocation]);

  // 5. Locations and Marker sync reconciler
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentActiveIds = new Set<string>();

    locations.forEach((loc) => {
      const isSelected = selectedLocation?.id === loc.id;
      const icon = createCustomIcon(loc.liveStatus, isSelected);
      currentActiveIds.add(loc.id);

      if (markersRef.current[loc.id]) {
        // Marker exists, update placement and style context
        const marker = markersRef.current[loc.id];
        marker.setLatLng([loc.lat, loc.lng]);
        marker.setIcon(icon);
        marker.setZIndexOffset(isSelected ? 500 : 0);
      } else {
        // Create new marker
        const marker = L.marker([loc.lat, loc.lng], {
          icon: icon,
          title: loc.title
        }).addTo(map);

        marker.on('click', (e) => {
          // Prevent map click trigger when clicking markers
          L.DomEvent.stopPropagation(e as any);
          onSelectLocation(loc);
        });

        markersRef.current[loc.id] = marker;
      }
    });

    // Clean up outdated or deleted listings
    Object.keys(markersRef.current).forEach((id) => {
      if (!currentActiveIds.has(id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });
  }, [locations, selectedLocation, onSelectLocation]);

  return (
    <div className="relative w-full h-[380px] md:h-[calc(100vh-140px)] rounded-2xl overflow-hidden shadow-lg border border-slate-200">
      
      {/* Map Division Ref Node */}
      <div ref={containerRef} className="w-full h-full bg-slate-50" style={{ zIndex: 1 }} />
    </div>
  );
}
