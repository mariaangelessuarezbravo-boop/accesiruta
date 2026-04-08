/* ============================================
   AccesiRuta — Map Module
   Leaflet + OpenStreetMap integration with accessibility markers,
   search integration, OSRM routing, accessibility scoring
   ============================================ */

var MapModule = (function () {
  'use strict';

  var map = null;
  var markers = [];
  var userMarker = null;
  var userCircle = null;
  var userPosition = null;
  var mapInitialized = false;

  // Route state
  var routePolyline = null;
  var destinationMarker = null;
  var routeReportMarkers = [];
  var currentRoute = null; // { origin, dest, distance, duration, score, geometry, steps, nearbyReports }

  // Navigation state
  var navigationActive = false;
  var navigationWatchId = null;
  var navigationArrow = null;
  var currentHeading = 0;
  var lastAnnouncedStep = -1;
  var STEP_ANNOUNCE_RADIUS_M = 30; // Announce turn when within 30m

  // Marker color config per report type
  var MARKER_CONFIG = {
    rampa: { color: '#0EA5E9', emoji: '\u267F', label: 'Rampa' },
    escaleras: { color: '#EAB308', emoji: '\uD83E\uDE9C', label: 'Escaleras' },
    banco: { color: '#22C55E', emoji: '\uD83E\uDE91', label: 'Banco' },
    pendiente: { color: '#EF4444', emoji: '\u26F0\uFE0F', label: 'Pendiente' },
    obstaculo: { color: '#F97316', emoji: '\uD83D\uDEA7', label: 'Obstaculo' },
  };

  function createMarkerIcon(color, emoji, size) {
    size = size || 40;
    return L.divIcon({
      className: 'custom-marker',
      html: '<div style="background:' + color + ';width:' + size + 'px;height:' + size + 'px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:' + Math.round(size * 0.5) + 'px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);">' + emoji + '</div>',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -(size / 2 + 4)],
    });
  }

  function createDestinationIcon() {
    return L.divIcon({
      className: 'custom-marker dest-marker',
      html: '<div class="dest-marker-icon"><span>\uD83D\uDCCD</span></div>',
      iconSize: [44, 44],
      iconAnchor: [22, 44],
      popupAnchor: [0, -48],
    });
  }

  /* --- Initialize Map --- */
  function initMap() {
    if (mapInitialized) return;
    if (typeof L === 'undefined') {
      showOfflineMessage();
      return;
    }

    var pos = userPosition || { lat: 40.4168, lng: -3.7038 };
    var mapEl = document.getElementById('google-map');
    if (!mapEl) return;

    // Clear any offline message
    var offlineEl = document.getElementById('map-offline');
    if (offlineEl) offlineEl.style.display = 'none';
    mapEl.style.display = 'block';

    map = L.map(mapEl, {
      center: [pos.lat, pos.lng],
      zoom: 16,
      zoomControl: false,
    });

    // Add zoom control to right side
    L.control.zoom({ position: 'topright' }).addTo(map);

    // OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    // Add user location marker
    addUserMarker(pos);

    mapInitialized = true;

    // Load existing reports
    loadReportMarkers();

    // Add some demo markers if no reports exist
    var reports = typeof Reports !== 'undefined' ? Reports.getAll() : [];
    if (reports.length === 0) {
      addDemoMarkers(pos);
    }
  }

  /* --- Demo Markers for first-time experience --- */
  function addDemoMarkers(center) {
    var demoData = [
      { type: 'rampa', lat: center.lat + 0.002, lng: center.lng + 0.001, rating: 5, comment: 'Rampa en buen estado, inclinacion adecuada' },
      { type: 'escaleras', lat: center.lat - 0.001, lng: center.lng + 0.003, rating: 2, comment: 'Escaleras sin barandilla, precaucion' },
      { type: 'banco', lat: center.lat + 0.001, lng: center.lng - 0.002, rating: 4, comment: 'Banco con respaldo, zona sombreada' },
      { type: 'pendiente', lat: center.lat - 0.002, lng: center.lng - 0.001, rating: 3, comment: 'Cuesta moderada, 200m de longitud' },
      { type: 'rampa', lat: center.lat + 0.003, lng: center.lng - 0.003, rating: 4, comment: 'Entrada accesible al parque' },
      { type: 'obstaculo', lat: center.lat - 0.003, lng: center.lng + 0.002, rating: 1, comment: 'Obras en la acera, paso bloqueado' },
      { type: 'banco', lat: center.lat + 0.0005, lng: center.lng + 0.004, rating: 5, comment: 'Zona de descanso junto a la fuente' },
    ];

    demoData.forEach(function (d) {
      var config = MARKER_CONFIG[d.type];
      if (!config) return;

      var icon = createMarkerIcon(config.color, config.emoji);
      var marker = L.marker([d.lat, d.lng], { icon: icon }).addTo(map);

      var stars = '';
      for (var i = 0; i < 5; i++) {
        stars += i < d.rating ? '\u2605' : '\u2606';
      }

      marker.bindPopup(
        '<div style="min-width:180px;font-family:-apple-system,sans-serif;">' +
        '<div style="font-size:18px;margin-bottom:4px;">' + config.emoji + ' <strong>' + config.label + '</strong></div>' +
        '<div style="color:#EAB308;font-size:16px;">' + stars + '</div>' +
        '<p style="font-size:13px;color:#4B5563;margin:6px 0 0;">' + d.comment + '</p>' +
        '<div style="font-size:11px;color:#9CA3AF;margin-top:6px;">Ejemplo de reporte</div>' +
        '</div>'
      );
    });
  }

  /* --- User Location Marker --- */
  function addUserMarker(pos) {
    if (!map) return;

    if (userMarker) {
      userMarker.setLatLng([pos.lat, pos.lng]);
      if (userCircle) userCircle.setLatLng([pos.lat, pos.lng]);
      return;
    }

    // Pulsing circle
    userCircle = L.circleMarker([pos.lat, pos.lng], {
      radius: 24,
      color: '#0EA5E9',
      fillColor: '#0EA5E9',
      fillOpacity: 0.15,
      weight: 1,
      opacity: 0.3,
    }).addTo(map);

    // Solid dot
    userMarker = L.circleMarker([pos.lat, pos.lng], {
      radius: 8,
      color: '#FFFFFF',
      fillColor: '#0EA5E9',
      fillOpacity: 1,
      weight: 3,
    }).addTo(map);

    userMarker.bindPopup('<strong>Tu ubicacion</strong>');
  }

  /* --- Set User Position --- */
  function setUserPosition(pos) {
    userPosition = pos;
    addUserMarker(pos);
  }

  /* --- Center on User --- */
  function centerOnUser() {
    var pos = App.getUserPosition();
    if (map && pos) {
      map.setView([pos.lat, pos.lng], 16);
      setUserPosition(pos);
    }
  }

  /* --- Load Report Markers --- */
  function loadReportMarkers() {
    if (!map || typeof Reports === 'undefined') return;

    // Clear existing report markers (not user marker)
    markers.forEach(function (m) {
      map.removeLayer(m);
    });
    markers = [];

    var reports = Reports.getAll();
    reports.forEach(function (report) {
      addReportMarker(report);
    });
  }

  function addReportMarker(report) {
    if (!map) return;

    var config = MARKER_CONFIG[report.type] || {
      color: '#6B7280',
      emoji: '\uD83D\uDCCD',
      label: 'Otro',
    };

    var icon = createMarkerIcon(config.color, config.emoji);
    var marker = L.marker([report.lat, report.lng], { icon: icon }).addTo(map);

    var stars = '';
    for (var i = 0; i < 5; i++) {
      stars += i < report.rating ? '\u2605' : '\u2606';
    }
    var timeAgo = typeof App !== 'undefined' ? App.getTimeAgo(report.timestamp) : '';

    marker.bindPopup(
      '<div style="min-width:180px;font-family:-apple-system,sans-serif;">' +
      '<div style="font-size:18px;margin-bottom:4px;">' + config.emoji + ' <strong>' + config.label + '</strong></div>' +
      '<div style="color:#EAB308;font-size:16px;">' + stars + '</div>' +
      '<p style="font-size:13px;color:#4B5563;margin:6px 0 0;">' +
      (report.comment || 'Sin comentario') +
      '</p>' +
      '<div style="font-size:11px;color:#9CA3AF;margin-top:6px;">' + timeAgo + '</div>' +
      '</div>'
    );

    markers.push(marker);
  }

  /* --- Destination Marker --- */
  function addDestinationMarker(lat, lng, name) {
    removeDestinationMarker();
    if (!map) return;

    var icon = createDestinationIcon();
    destinationMarker = L.marker([lat, lng], { icon: icon }).addTo(map);
    destinationMarker.bindPopup('<strong>' + (name || 'Destino') + '</strong>').openPopup();
  }

  function removeDestinationMarker() {
    if (destinationMarker && map) {
      map.removeLayer(destinationMarker);
      destinationMarker = null;
    }
  }

  /* --- Fly To Location --- */
  function flyTo(lat, lng, zoom) {
    if (!map) return;
    zoom = zoom || 16;
    map.flyTo([lat, lng], zoom, { duration: 1 });
  }

  /* --- Route Drawing --- */
  function drawRoute(geojsonCoords) {
    clearRoute();
    if (!map || !geojsonCoords || !geojsonCoords.length) return;

    // GeoJSON coordinates are [lng, lat], Leaflet needs [lat, lng]
    var latLngs = geojsonCoords.map(function (c) {
      return [c[1], c[0]];
    });

    routePolyline = L.polyline(latLngs, {
      color: '#0EA5E9',
      weight: 5,
      opacity: 0.85,
      dashArray: '10, 6',
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    // Fit map to route bounds with padding
    map.fitBounds(routePolyline.getBounds(), { padding: [50, 50] });
  }

  function clearRoute() {
    if (routePolyline && map) {
      map.removeLayer(routePolyline);
      routePolyline = null;
    }
    // Clear route-specific report markers
    routeReportMarkers.forEach(function (m) {
      if (map) map.removeLayer(m);
    });
    routeReportMarkers = [];
  }

  /* --- Clear All Route Data --- */
  function clearAllRouteData() {
    clearRoute();
    removeDestinationMarker();
    currentRoute = null;

    // Hide route panel
    var panel = document.getElementById('route-panel');
    if (panel) panel.style.display = 'none';
  }

  /* --- Find Reports Near Route --- */
  function findReportsNearRoute(routeCoords, radiusMeters) {
    radiusMeters = radiusMeters || 100;
    if (!routeCoords || !routeCoords.length) return [];
    if (typeof Reports === 'undefined') return [];

    var allReports = Reports.getAll();
    // Also add demo-like data from localStorage
    var nearbyReports = [];
    var radiusKm = radiusMeters / 1000;

    allReports.forEach(function (report) {
      // Check if any point on route is within radius of this report
      for (var i = 0; i < routeCoords.length; i += 5) { // Sample every 5th point for performance
        var rLat = routeCoords[i][1];
        var rLng = routeCoords[i][0];
        var dist = haversineDistance(report.lat, report.lng, rLat, rLng);
        if (dist <= radiusKm) {
          nearbyReports.push(report);
          break;
        }
      }
    });

    return nearbyReports;
  }

  /* --- Show Nearby Report Markers (larger) --- */
  function highlightRouteReports(reports) {
    // Clear previous highlights
    routeReportMarkers.forEach(function (m) {
      if (map) map.removeLayer(m);
    });
    routeReportMarkers = [];

    reports.forEach(function (report) {
      var config = MARKER_CONFIG[report.type] || { color: '#6B7280', emoji: '\uD83D\uDCCD', label: 'Otro' };
      var icon = createMarkerIcon(config.color, config.emoji, 50); // Larger size
      var marker = L.marker([report.lat, report.lng], { icon: icon, zIndexOffset: 500 }).addTo(map);

      var stars = '';
      for (var j = 0; j < 5; j++) {
        stars += j < report.rating ? '\u2605' : '\u2606';
      }
      marker.bindPopup(
        '<div style="min-width:180px;font-family:-apple-system,sans-serif;">' +
        '<div style="font-size:18px;margin-bottom:4px;">' + config.emoji + ' <strong>' + config.label + '</strong> (en ruta)</div>' +
        '<div style="color:#EAB308;font-size:16px;">' + stars + '</div>' +
        '<p style="font-size:13px;color:#4B5563;margin:6px 0 0;">' + (report.comment || 'Sin comentario') + '</p>' +
        '</div>'
      );
      routeReportMarkers.push(marker);
    });
  }

  /* --- Calculate Accessibility Score --- */
  function calculateAccessibilityScore(nearbyReports) {
    var score = 3.0;
    var counts = { rampa: 0, escaleras: 0, banco: 0, pendiente: 0, obstaculo: 0 };

    nearbyReports.forEach(function (r) {
      if (counts.hasOwnProperty(r.type)) {
        counts[r.type]++;
      }
      switch (r.type) {
        case 'rampa':
        case 'banco':
          score += 0.3;
          break;
        case 'obstaculo':
        case 'escaleras':
          score -= 0.5;
          break;
        case 'pendiente':
          score -= 0.3;
          break;
      }
    });

    // Cap between 1 and 5
    score = Math.max(1, Math.min(5, score));
    score = Math.round(score * 10) / 10;

    return { score: score, counts: counts };
  }

  /* --- Get Map Instance --- */
  function getMap() {
    return map;
  }

  /* --- Get/Set Current Route --- */
  function getCurrentRoute() {
    return currentRoute;
  }

  function setCurrentRoute(route) {
    currentRoute = route;
  }

  /* --- On Screen Show --- */
  function onShow() {
    if (!mapInitialized) {
      initMap();
    } else {
      loadReportMarkers();
      if (map) {
        map.invalidateSize();
      }
    }
  }

  /* --- Offline Message --- */
  function showOfflineMessage() {
    var mapEl = document.getElementById('google-map');
    var offlineEl = document.getElementById('map-offline');
    if (mapEl) mapEl.style.display = 'none';
    if (offlineEl) offlineEl.style.display = 'flex';
  }

  /* =============================================
     REAL-TIME NAVIGATION
     ============================================= */

  function createNavigationArrow(heading) {
    return L.divIcon({
      className: 'nav-arrow-marker',
      html: '<div class="nav-arrow" style="transform:rotate(' + (heading || 0) + 'deg)">' +
            '<svg viewBox="0 0 40 40" width="40" height="40">' +
            '<circle cx="20" cy="20" r="18" fill="#0EA5E9" stroke="white" stroke-width="3"/>' +
            '<polygon points="20,8 28,28 20,23 12,28" fill="white"/>' +
            '</svg></div>',
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });
  }

  function startNavigation() {
    if (!currentRoute) return false;
    if (navigationActive) return true;

    navigationActive = true;
    lastAnnouncedStep = -1;

    // Replace user dot with navigation arrow
    if (userMarker && map) map.removeLayer(userMarker);
    if (userCircle && map) map.removeLayer(userCircle);

    var pos = userPosition || { lat: currentRoute.originLat, lng: currentRoute.originLng };
    navigationArrow = L.marker([pos.lat, pos.lng], {
      icon: createNavigationArrow(0),
      zIndexOffset: 1000,
    }).addTo(map);

    // Center on user with high zoom
    map.setView([pos.lat, pos.lng], 18);

    // Start GPS tracking
    if ('geolocation' in navigator) {
      navigationWatchId = navigator.geolocation.watchPosition(
        onNavigationPositionUpdate,
        function (err) {
          console.warn('GPS error:', err.message);
        },
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
      );
    }

    // Announce start
    speak('Navegacion iniciada. Sigue la linea azul.');

    return true;
  }

  function stopNavigation() {
    navigationActive = false;

    // Stop GPS tracking
    if (navigationWatchId !== null) {
      navigator.geolocation.clearWatch(navigationWatchId);
      navigationWatchId = null;
    }

    // Remove arrow, restore user dot
    if (navigationArrow && map) {
      map.removeLayer(navigationArrow);
      navigationArrow = null;
    }

    var pos = userPosition || { lat: 40.4168, lng: -3.7038 };
    userMarker = null;
    userCircle = null;
    addUserMarker(pos);

    lastAnnouncedStep = -1;
  }

  function onNavigationPositionUpdate(position) {
    if (!navigationActive || !currentRoute) return;

    var lat = position.coords.latitude;
    var lng = position.coords.longitude;
    var heading = position.coords.heading;

    // Update position
    userPosition = { lat: lat, lng: lng };

    // Update arrow position and heading
    if (navigationArrow) {
      navigationArrow.setLatLng([lat, lng]);
      if (heading !== null && !isNaN(heading)) {
        currentHeading = heading;
        navigationArrow.setIcon(createNavigationArrow(heading));
      }
    }

    // Auto-center map
    if (map) {
      map.panTo([lat, lng], { animate: true, duration: 0.5 });
    }

    // Check proximity to route steps for voice announcements
    checkStepProximity(lat, lng);

    // Check if arrived at destination
    var distToDest = haversineDistance(lat, lng, currentRoute.destLat, currentRoute.destLng) * 1000;
    if (distToDest < 25) {
      speak('Has llegado a tu destino. ' + (currentRoute.destName || ''));
      stopNavigation();
    }
  }

  function checkStepProximity(lat, lng) {
    if (!currentRoute || !currentRoute.steps) return;

    // Find the route geometry points to determine which step we're near
    var geometry = currentRoute.geometry;
    if (!geometry || !geometry.length) return;

    var steps = currentRoute.steps;
    var cumDist = 0;
    var stepStartIdx = 0;

    for (var s = 0; s < steps.length; s++) {
      if (s <= lastAnnouncedStep) {
        // Skip already announced steps - advance the index
        var stepDist = 0;
        for (var i = stepStartIdx; i < geometry.length - 1 && stepDist < steps[s].distance; i++) {
          stepDist += haversineDistance(geometry[i][1], geometry[i][0], geometry[i + 1][1], geometry[i + 1][0]) * 1000;
          stepStartIdx = i + 1;
        }
        continue;
      }

      // Find the approximate position of this step's start
      var stepLat = geometry[Math.min(stepStartIdx, geometry.length - 1)][1];
      var stepLng = geometry[Math.min(stepStartIdx, geometry.length - 1)][0];

      var distToStep = haversineDistance(lat, lng, stepLat, stepLng) * 1000;

      if (distToStep < STEP_ANNOUNCE_RADIUS_M) {
        lastAnnouncedStep = s;
        speak(steps[s].instruction);
        break;
      }

      // Move past this step in geometry
      var stepDist2 = 0;
      for (var j = stepStartIdx; j < geometry.length - 1 && stepDist2 < steps[s].distance; j++) {
        stepDist2 += haversineDistance(geometry[j][1], geometry[j][0], geometry[j + 1][1], geometry[j + 1][0]) * 1000;
        stepStartIdx = j + 1;
      }
    }
  }

  /* --- Text-to-Speech --- */
  function speak(text) {
    if (!('speechSynthesis' in window)) return;

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    var utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-ES';
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;

    // Try to find a Spanish voice
    var voices = window.speechSynthesis.getVoices();
    for (var i = 0; i < voices.length; i++) {
      if (voices[i].lang && voices[i].lang.indexOf('es') === 0) {
        utterance.voice = voices[i];
        break;
      }
    }

    window.speechSynthesis.speak(utterance);
  }

  function isNavigating() {
    return navigationActive;
  }

  /* --- Haversine --- */
  function haversineDistance(lat1, lng1, lat2, lng2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /* --- Public API --- */
  return {
    initMap: initMap,
    onShow: onShow,
    setUserPosition: setUserPosition,
    centerOnUser: centerOnUser,
    loadReportMarkers: loadReportMarkers,
    flyTo: flyTo,
    addDestinationMarker: addDestinationMarker,
    removeDestinationMarker: removeDestinationMarker,
    drawRoute: drawRoute,
    clearRoute: clearRoute,
    clearAllRouteData: clearAllRouteData,
    findReportsNearRoute: findReportsNearRoute,
    highlightRouteReports: highlightRouteReports,
    calculateAccessibilityScore: calculateAccessibilityScore,
    getMap: getMap,
    getCurrentRoute: getCurrentRoute,
    setCurrentRoute: setCurrentRoute,
    startNavigation: startNavigation,
    stopNavigation: stopNavigation,
    isNavigating: isNavigating,
    speak: speak,
  };
})();

// Compatibility callback
function initGoogleMap() {
  console.log('Map API loaded');
}
