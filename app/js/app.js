/* ============================================
   AccesiRuta — Main App Controller
   Hash-based routing, geolocation, PWA install,
   Auth state management (Firebase + demo mode),
   Search (Nominatim) + Routing (OSRM)
   ============================================ */

var App = (function () {
  'use strict';

  // Screen IDs mapped to hash routes
  var SCREENS = {
    '#inicio': 'screen-home',
    '#mapa': 'screen-map',
    '#reportar': 'screen-report',
    '#sos': 'screen-sos',
    '#perfil': 'screen-profile',
    '#ruta': 'screen-route',
  };

  var NAV_TABS = ['#inicio', '#mapa', '#reportar', '#sos', '#perfil'];

  var currentScreen = null;
  var userPosition = null;
  var deferredInstallPrompt = null;

  // Auth state
  var AUTH_KEY = 'accesiruta_auth';
  var authState = null; // { type: 'google'|'demo'|'guest', name, photo, uid }

  // Search state
  var searchDebounceTimer = null;
  var SEARCH_DEBOUNCE_MS = 300;

  /* --- Initialize --- */
  function init() {
    // Register service worker
    registerServiceWorker();

    // Try to initialize Firebase
    if (typeof FirebaseConfig !== 'undefined') {
      FirebaseConfig.initialize();
    }

    // Check if user has a saved session
    authState = loadAuthState();

    if (authState) {
      // User already logged in, show app
      showApp();
      bootApp();
    } else {
      // Show login screen
      showLoginScreen();
    }
  }

  /* --- Login Screen --- */
  function showLoginScreen() {
    var loginScreen = document.getElementById('login-screen');
    var appShell = document.getElementById('app-shell');
    if (loginScreen) loginScreen.classList.remove('hidden');
    if (appShell) appShell.style.display = 'none';

    var firebaseConfigured = typeof FirebaseConfig !== 'undefined' && FirebaseConfig.isConfigured();

    // Show/hide Google button vs demo section
    var googleBtn = document.getElementById('login-google-btn');
    var demoSection = document.getElementById('login-demo-section');

    if (firebaseConfigured) {
      if (googleBtn) googleBtn.style.display = 'flex';
      if (demoSection) demoSection.style.display = 'none';
    } else {
      if (googleBtn) googleBtn.style.display = 'none';
      if (demoSection) demoSection.style.display = 'block';
    }

    // Set up login handlers
    setupLoginHandlers(firebaseConfigured);
  }

  function setupLoginHandlers(firebaseConfigured) {
    // Google sign-in
    var googleBtn = document.getElementById('login-google-btn');
    if (googleBtn && firebaseConfigured) {
      googleBtn.addEventListener('click', function () {
        googleBtn.disabled = true;
        googleBtn.querySelector('span').textContent = 'Conectando...';

        FirebaseConfig.signInWithGoogle()
          .then(function (result) {
            var user = result.user;
            authState = {
              type: 'google',
              name: user.displayName || 'Usuario',
              photo: user.photoURL || null,
              uid: user.uid,
              email: user.email,
            };
            saveAuthState(authState);
            hideLoginScreen();
            bootApp();
          })
          .catch(function (err) {
            console.error('Error Google sign-in:', err);
            googleBtn.disabled = false;
            googleBtn.querySelector('span').textContent = 'Iniciar sesion con Google';
            if (err.code !== 'auth/popup-closed-by-user') {
              alert('Error al iniciar sesion: ' + err.message);
            }
          });
      });
    }

    // Demo mode sign-in
    var demoBtn = document.getElementById('login-demo-btn');
    var demoInput = document.getElementById('login-demo-name');
    if (demoBtn) {
      demoBtn.addEventListener('click', function () {
        var name = demoInput ? demoInput.value.trim() : '';
        if (!name) {
          if (demoInput) demoInput.focus();
          return;
        }
        authState = {
          type: 'demo',
          name: name,
          photo: null,
          uid: 'demo_' + Date.now(),
        };
        saveAuthState(authState);
        // Also update legacy profile name
        localStorage.setItem('accesiruta_profile', name);
        hideLoginScreen();
        bootApp();
      });

      // Allow Enter key on input
      if (demoInput) {
        demoInput.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            demoBtn.click();
          }
        });
      }
    }

    // Guest mode
    var guestBtn = document.getElementById('login-guest-btn');
    if (guestBtn) {
      guestBtn.addEventListener('click', function () {
        authState = {
          type: 'guest',
          name: 'Invitado',
          photo: null,
          uid: 'guest_' + Date.now(),
        };
        saveAuthState(authState);
        hideLoginScreen();
        bootApp();
      });
    }
  }

  function hideLoginScreen() {
    var loginScreen = document.getElementById('login-screen');
    if (loginScreen) loginScreen.classList.add('hidden');
    showApp();
  }

  function showApp() {
    var appShell = document.getElementById('app-shell');
    if (appShell) appShell.style.display = 'flex';
  }

  /* --- Boot App (after auth) --- */
  function bootApp() {
    // Set up navigation
    setupNavigation();

    // Set up hash routing
    window.addEventListener('hashchange', handleRoute);
    handleRoute();

    // Get user location
    requestGeolocation();

    // PWA install prompt
    setupInstallPrompt();

    // Initialize modules
    if (typeof Reports !== 'undefined') Reports.init();
    if (typeof SOS !== 'undefined') SOS.init();
    if (typeof Profile !== 'undefined') Profile.init();

    // Load font size preference
    loadFontSize();

    // Populate home screen
    populateHome();

    // Update UI with auth info
    updateAuthUI();

    // Initialize search
    setupSearch();

    // Initialize route panel buttons
    setupRoutePanelButtons();

    // Listen for Firebase auth state changes (if configured)
    if (typeof FirebaseConfig !== 'undefined' && FirebaseConfig.isConfigured()) {
      FirebaseConfig.onAuthStateChanged(function (user) {
        if (user) {
          authState = {
            type: 'google',
            name: user.displayName || 'Usuario',
            photo: user.photoURL || null,
            uid: user.uid,
            email: user.email,
          };
          saveAuthState(authState);
          updateAuthUI();
        }
      });
    }

    console.log('AccesiRuta inicializada');
  }

  /* --- Auth State Persistence --- */
  function loadAuthState() {
    try {
      var data = localStorage.getItem(AUTH_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  }

  function saveAuthState(state) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(state));
  }

  function clearAuthState() {
    localStorage.removeItem(AUTH_KEY);
    authState = null;
  }

  function getAuthState() {
    return authState;
  }

  function getUserName() {
    if (authState && authState.name) return authState.name;
    // Fallback to legacy profile name
    return localStorage.getItem('accesiruta_profile') || 'Usuario';
  }

  function getUserPhoto() {
    return (authState && authState.photo) ? authState.photo : null;
  }

  function getUserUid() {
    return (authState && authState.uid) ? authState.uid : 'anonymous';
  }

  function isFirebaseAuth() {
    return authState && authState.type === 'google';
  }

  /* --- Update UI with auth info --- */
  function updateAuthUI() {
    // Update greeting on home
    var homeGreeting = document.getElementById('home-greeting-name');
    if (homeGreeting) homeGreeting.textContent = getUserName();

    // Update profile display
    if (typeof Profile !== 'undefined') Profile.refresh();

    // Update sync indicators
    updateSyncIndicators();
  }

  /* --- Sync indicators --- */
  function updateSyncIndicators() {
    var isCloud = typeof FirebaseConfig !== 'undefined' && FirebaseConfig.isConfigured();
    var indicators = document.querySelectorAll('.sync-indicator');

    indicators.forEach(function (el) {
      el.style.display = 'flex';
      el.classList.remove('sync-cloud', 'sync-local');

      var iconEl = el.querySelector('.sync-icon');
      var textEl = el.querySelector('.sync-text');

      if (isCloud) {
        el.classList.add('sync-cloud');
        if (iconEl) iconEl.textContent = '\u2601\uFE0F'; // cloud
        if (textEl) textEl.textContent = 'Guardado en la nube';
      } else {
        el.classList.add('sync-local');
        if (iconEl) iconEl.textContent = '\uD83D\uDCF1'; // phone
        if (textEl) textEl.textContent = 'Guardado localmente';
      }
    });
  }

  /* --- Logout --- */
  function logout() {
    // Sign out from Firebase if applicable
    if (typeof FirebaseConfig !== 'undefined' && FirebaseConfig.isConfigured()) {
      FirebaseConfig.signOut().catch(function (err) {
        console.warn('Error signing out:', err);
      });
    }

    clearAuthState();

    // Reload to show login screen
    window.location.hash = '';
    window.location.reload();
  }

  /* --- Service Worker --- */
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('./sw.js')
        .then(function (reg) {
          console.log('Service Worker registrado:', reg.scope);
        })
        .catch(function (err) {
          console.warn('Error registrando SW:', err);
        });
    }
  }

  /* --- Navigation --- */
  function setupNavigation() {
    var navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(function (item) {
      item.addEventListener('click', function (e) {
        e.preventDefault();
        var target = item.getAttribute('data-screen');
        if (target) {
          window.location.hash = target;
        }
      });
    });
  }

  function handleRoute() {
    var hash = window.location.hash || '#inicio';
    var screenId = SCREENS[hash];

    if (!screenId) {
      hash = '#inicio';
      screenId = SCREENS[hash];
    }

    showScreen(screenId, hash);
  }

  function showScreen(screenId, hash) {
    // Hide all screens
    var screens = document.querySelectorAll('.screen');
    screens.forEach(function (s) {
      s.classList.remove('active', 'screen-transition');
    });

    // Show target
    var target = document.getElementById(screenId);
    if (target) {
      target.classList.add('active', 'screen-transition');
      currentScreen = screenId;
    }

    // Update nav active state
    updateNavActive(hash);

    // Screen-specific hooks
    if (screenId === 'screen-map' && typeof MapModule !== 'undefined') {
      MapModule.onShow();
    }
    if (screenId === 'screen-home') {
      populateHome();
    }
    if (screenId === 'screen-profile' && typeof Profile !== 'undefined') {
      Profile.refresh();
    }
    if (screenId === 'screen-route') {
      populateRouteDetail();
    }
  }

  function updateNavActive(hash) {
    var navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(function (item) {
      var screen = item.getAttribute('data-screen');
      if (screen === hash) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  function navigate(hash) {
    window.location.hash = hash;
  }

  /* --- Geolocation --- */
  function requestGeolocation() {
    if (!navigator.geolocation) {
      console.warn('Geolocalizacion no disponible');
      userPosition = { lat: 40.4168, lng: -3.7038 }; // Madrid fallback
      return;
    }

    navigator.geolocation.getCurrentPosition(
      function (pos) {
        userPosition = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        console.log('Ubicacion obtenida:', userPosition);
        // Update map if open
        if (typeof MapModule !== 'undefined') {
          MapModule.setUserPosition(userPosition);
        }
      },
      function (err) {
        console.warn('Error obteniendo ubicacion:', err.message);
        userPosition = { lat: 40.4168, lng: -3.7038 };
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );

    // Watch position
    navigator.geolocation.watchPosition(
      function (pos) {
        userPosition = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        if (typeof MapModule !== 'undefined') {
          MapModule.setUserPosition(userPosition);
        }
      },
      function () {},
      { enableHighAccuracy: false, timeout: 30000, maximumAge: 120000 }
    );
  }

  function getUserPosition() {
    return userPosition || { lat: 40.4168, lng: -3.7038 };
  }

  /* --- PWA Install --- */
  function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredInstallPrompt = e;
      showInstallBanner();
    });
  }

  function showInstallBanner() {
    var banner = document.getElementById('install-banner');
    if (banner) {
      banner.classList.add('show');
    }
  }

  function installApp() {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(function (result) {
      console.log('Instalacion:', result.outcome);
      deferredInstallPrompt = null;
      var banner = document.getElementById('install-banner');
      if (banner) banner.classList.remove('show');
    });
  }

  function dismissInstallBanner() {
    var banner = document.getElementById('install-banner');
    if (banner) banner.classList.remove('show');
  }

  /* --- Font Size --- */
  function loadFontSize() {
    var size = localStorage.getItem('accesiruta_fontsize') || 'normal';
    applyFontSize(size);
  }

  function applyFontSize(size) {
    document.body.classList.remove('font-size-large', 'font-size-xlarge');
    if (size === 'large') document.body.classList.add('font-size-large');
    if (size === 'xlarge') document.body.classList.add('font-size-xlarge');
    localStorage.setItem('accesiruta_fontsize', size);
  }

  function getFontSize() {
    return localStorage.getItem('accesiruta_fontsize') || 'normal';
  }

  /* --- Toast --- */
  function showToast(message, duration) {
    duration = duration || 3000;
    var toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(function () {
      toast.classList.remove('show');
    }, duration);
  }

  /* --- Home Screen --- */
  function populateHome() {
    var recentContainer = document.getElementById('home-recent-reports');
    if (!recentContainer || typeof Reports === 'undefined') return;

    var reports = Reports.getAll();
    // Show last 3 reports
    var recent = reports.slice(-3).reverse();

    if (recent.length === 0) {
      recentContainer.innerHTML =
        '<p style="color:var(--gray-400);font-size:14px;text-align:center;padding:20px 0;">Aun no hay reportes. Se el primero!</p>';
      return;
    }

    var typeIcons = {
      rampa: '\u267F',
      escaleras: '\uD83E\uDE9C',
      banco: '\uD83E\uDE91',
      pendiente: '\u26F0\uFE0F',
      obstaculo: '\uD83D\uDEA7',
    };
    var typeBgs = {
      rampa: 'background:var(--sky-100)',
      escaleras: 'background:var(--yellow-100)',
      banco: 'background:var(--green-100)',
      pendiente: 'background:var(--red-100)',
      obstaculo: 'background:var(--orange-100)',
    };
    var typeNames = {
      rampa: 'Rampa',
      escaleras: 'Escaleras',
      banco: 'Banco/Descanso',
      pendiente: 'Pendiente',
      obstaculo: 'Obstaculo',
    };

    var html = '';
    recent.forEach(function (r) {
      var icon = typeIcons[r.type] || '\uD83D\uDCCD';
      var bg = typeBgs[r.type] || 'background:var(--gray-100)';
      var name = typeNames[r.type] || r.type;
      var stars = '';
      for (var i = 0; i < 5; i++) {
        stars += i < r.rating ? '\u2605' : '\u2606';
      }
      var timeAgo = getTimeAgo(r.timestamp);

      // Show user name if available on the report
      var authorName = r.userName || getUserName();

      html +=
        '<div class="report-card" role="article">' +
        '<div class="rc-icon" style="' + bg + '">' + icon + '</div>' +
        '<div class="rc-info">' +
        '<div class="rc-type">' + escapeHtml(name) + '</div>' +
        '<div class="rc-detail">' + escapeHtml(r.comment || 'Sin comentario') + ' \u00B7 ' + escapeHtml(authorName) + ' \u00B7 ' + timeAgo + '</div>' +
        '</div>' +
        '<div class="rc-rating">' + stars + '</div>' +
        '</div>';
    });

    recentContainer.innerHTML = html;

    // Update home stats
    var countEl = document.getElementById('home-report-count');
    if (countEl) countEl.textContent = reports.length;
  }

  /* =============================================
     SEARCH (Nominatim Geocoding)
     ============================================= */
  function setupSearch() {
    // Home search
    var homeInput = document.getElementById('home-search');
    var homeResults = document.getElementById('home-search-results');
    if (homeInput && homeResults) {
      setupSearchInput(homeInput, homeResults, true);
    }

    // Map search
    var mapInput = document.getElementById('map-search');
    var mapResults = document.getElementById('map-search-results');
    var mapClear = document.getElementById('map-search-clear');
    if (mapInput && mapResults) {
      setupSearchInput(mapInput, mapResults, false);

      if (mapClear) {
        mapClear.addEventListener('click', function () {
          mapInput.value = '';
          mapClear.style.display = 'none';
          hideDropdown(mapResults);
          if (typeof MapModule !== 'undefined') {
            MapModule.clearAllRouteData();
          }
        });
      }
    }

    // Close dropdowns when clicking outside
    document.addEventListener('click', function (e) {
      if (homeResults && !homeInput.contains(e.target) && !homeResults.contains(e.target)) {
        hideDropdown(homeResults);
      }
      if (mapResults && !mapInput.contains(e.target) && !mapResults.contains(e.target)) {
        hideDropdown(mapResults);
      }
    });
  }

  function setupSearchInput(input, dropdown, navigateToMap) {
    input.addEventListener('input', function () {
      var query = input.value.trim();
      if (query.length < 3) {
        hideDropdown(dropdown);
        return;
      }

      // Show clear button on map
      var clearBtn = document.getElementById('map-search-clear');
      if (clearBtn && input.id === 'map-search') {
        clearBtn.style.display = query.length > 0 ? 'flex' : 'none';
      }

      // Debounce
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(function () {
        searchNominatim(query, dropdown, input, navigateToMap);
      }, SEARCH_DEBOUNCE_MS);
    });

    // Also search on Enter
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var query = input.value.trim();
        if (query.length >= 3) {
          clearTimeout(searchDebounceTimer);
          searchNominatim(query, dropdown, input, navigateToMap);
        }
      }
    });

    // Show dropdown on focus if there are results
    input.addEventListener('focus', function () {
      if (dropdown.children.length > 0 && !dropdown.querySelector('.search-loading')) {
        showDropdown(dropdown);
      }
    });
  }

  function searchNominatim(query, dropdown, input, navigateToMap) {
    // Show loading
    dropdown.innerHTML = '<div class="search-loading">Buscando...</div>';
    showDropdown(dropdown);

    var url = 'https://nominatim.openstreetmap.org/search?q=' +
      encodeURIComponent(query) +
      '&format=json&limit=8&accept-language=es&addressdetails=1';

    fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Error de red');
        return res.json();
      })
      .then(function (results) {
        renderSearchResults(results, dropdown, input, navigateToMap);
      })
      .catch(function (err) {
        console.warn('Error buscando:', err);
        dropdown.innerHTML = '<div class="search-loading">Error al buscar. Intenta de nuevo.</div>';
      });
  }

  function renderSearchResults(results, dropdown, input, navigateToMap) {
    if (!results || results.length === 0) {
      dropdown.innerHTML = '<div class="search-loading">No se encontraron resultados</div>';
      return;
    }

    var html = '';
    results.forEach(function (r, idx) {
      var name = r.display_name.split(',')[0];
      var address = r.display_name.split(',').slice(1, 4).join(',').trim();
      html +=
        '<div class="search-result-item" role="option" data-lat="' + r.lat + '" data-lng="' + r.lon + '" data-name="' + escapeHtml(name) + '" data-address="' + escapeHtml(address) + '" tabindex="0">' +
        '<span class="search-result-name">' + escapeHtml(name) + '</span>' +
        '<span class="search-result-address">' + escapeHtml(address) + '</span>' +
        '</div>';
    });

    dropdown.innerHTML = html;

    // Attach click handlers
    var items = dropdown.querySelectorAll('.search-result-item');
    items.forEach(function (item) {
      item.addEventListener('click', function () {
        var lat = parseFloat(item.getAttribute('data-lat'));
        var lng = parseFloat(item.getAttribute('data-lng'));
        var name = item.getAttribute('data-name');
        var address = item.getAttribute('data-address');

        // Update search input text
        input.value = name;
        hideDropdown(dropdown);

        // If from home, also update map search
        if (navigateToMap) {
          var mapInput = document.getElementById('map-search');
          if (mapInput) mapInput.value = name;
          var mapClear = document.getElementById('map-search-clear');
          if (mapClear) mapClear.style.display = 'flex';
        }

        // Navigate to map if needed
        if (navigateToMap) {
          navigate('#mapa');
          // Small delay to let map initialize
          setTimeout(function () {
            onSearchResultSelected(lat, lng, name, address);
          }, 400);
        } else {
          onSearchResultSelected(lat, lng, name, address);
        }
      });

      // Allow Enter key on result items
      item.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          item.click();
        }
      });
    });
  }

  function showDropdown(el) {
    el.classList.add('visible');
  }

  function hideDropdown(el) {
    el.classList.remove('visible');
  }

  /* --- Search Result Selected: Trigger Routing --- */
  function onSearchResultSelected(lat, lng, name, address) {
    if (typeof MapModule === 'undefined') return;

    // Ensure map is initialized
    MapModule.onShow();

    // Add destination marker
    MapModule.addDestinationMarker(lat, lng, name);

    // Fly to destination
    MapModule.flyTo(lat, lng, 15);

    // Get walking route from OSRM
    var origin = getUserPosition();
    fetchWalkingRoute(origin.lat, origin.lng, lat, lng, name, address);
  }

  /* =============================================
     ROUTING (OSRM)
     ============================================= */
  function fetchWalkingRoute(lat1, lng1, lat2, lng2, destName, destAddress) {
    showToast('Calculando ruta a pie...');

    var url = 'https://router.project-osrm.org/route/v1/foot/' +
      lng1 + ',' + lat1 + ';' + lng2 + ',' + lat2 +
      '?overview=full&geometries=geojson&steps=true';

    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error('Error de red');
        return res.json();
      })
      .then(function (data) {
        if (!data.routes || data.routes.length === 0) {
          showToast('No se encontro ruta a pie');
          return;
        }

        var route = data.routes[0];
        var geometry = route.geometry;
        var coords = geometry.coordinates;
        var distanceMeters = route.distance;
        var durationSeconds = route.duration;

        // Draw route on map
        MapModule.drawRoute(coords);

        // Find nearby reports
        var nearbyReports = MapModule.findReportsNearRoute(coords, 100);
        MapModule.highlightRouteReports(nearbyReports);

        // Calculate accessibility score
        var a11y = MapModule.calculateAccessibilityScore(nearbyReports);

        // Extract turn-by-turn steps
        var steps = [];
        if (route.legs && route.legs[0] && route.legs[0].steps) {
          steps = route.legs[0].steps.map(function (s) {
            return {
              instruction: translateManeuver(s.maneuver, s.name),
              distance: s.distance,
              duration: s.duration,
            };
          });
        }

        // Store current route data
        var routeData = {
          originLat: lat1,
          originLng: lng1,
          destLat: lat2,
          destLng: lng2,
          destName: destName || 'Destino',
          destAddress: destAddress || '',
          distance: distanceMeters,
          duration: durationSeconds,
          score: a11y.score,
          counts: a11y.counts,
          nearbyReports: nearbyReports,
          steps: steps,
          geometry: coords,
        };

        MapModule.setCurrentRoute(routeData);

        // Show route panel on map
        showRoutePanel(routeData);
      })
      .catch(function (err) {
        console.warn('Error calculando ruta:', err);
        showToast('Error al calcular la ruta');
      });
  }

  /* --- Translate OSRM maneuver to Spanish --- */
  function translateManeuver(maneuver, streetName) {
    if (!maneuver) return 'Continua recto';

    var type = maneuver.type || '';
    var modifier = maneuver.modifier || '';
    var street = streetName ? ' por ' + streetName : '';

    var translations = {
      'depart': 'Inicia el recorrido' + street,
      'arrive': 'Has llegado a tu destino',
      'turn-left': 'Gira a la izquierda' + street,
      'turn-right': 'Gira a la derecha' + street,
      'turn-slight left': 'Gira ligeramente a la izquierda' + street,
      'turn-slight right': 'Gira ligeramente a la derecha' + street,
      'turn-sharp left': 'Gira fuerte a la izquierda' + street,
      'turn-sharp right': 'Gira fuerte a la derecha' + street,
      'turn-uturn': 'Da media vuelta' + street,
      'turn-straight': 'Continua recto' + street,
      'continue-': 'Continua recto' + street,
      'continue-straight': 'Continua recto' + street,
      'continue-left': 'Continua ligeramente a la izquierda' + street,
      'continue-right': 'Continua ligeramente a la derecha' + street,
      'roundabout-': 'Toma la rotonda' + street,
      'fork-left': 'Toma el desvio a la izquierda' + street,
      'fork-right': 'Toma el desvio a la derecha' + street,
      'end of road-left': 'Al final del camino, gira a la izquierda' + street,
      'end of road-right': 'Al final del camino, gira a la derecha' + street,
      'new name-': 'Continua' + street,
      'new name-straight': 'Continua' + street,
    };

    var key = type + '-' + modifier;
    if (translations[key]) return translations[key];
    if (translations[type + '-']) return translations[type + '-'];

    // Fallback
    if (modifier.indexOf('left') !== -1) return 'Gira a la izquierda' + street;
    if (modifier.indexOf('right') !== -1) return 'Gira a la derecha' + street;
    return 'Continua recto' + street;
  }

  /* --- Show Route Panel --- */
  function showRoutePanel(routeData) {
    var panel = document.getElementById('route-panel');
    if (!panel) return;

    // Distance
    var distKm = (routeData.distance / 1000).toFixed(1);
    var distEl = document.getElementById('rp-distance');
    if (distEl) distEl.textContent = distKm + 'km';

    // Time
    var mins = Math.ceil(routeData.duration / 60);
    var timeStr = mins < 60 ? mins + ' min' : Math.floor(mins / 60) + 'h ' + (mins % 60) + 'min';
    var timeEl = document.getElementById('rp-time');
    if (timeEl) timeEl.textContent = timeStr;

    // Score with stars
    var scoreEl = document.getElementById('rp-score');
    if (scoreEl) scoreEl.textContent = routeData.score.toFixed(1) + '\u2605';

    // Terrain summary
    var summaryEl = document.getElementById('rp-terrain-summary');
    if (summaryEl) {
      var c = routeData.counts;
      var parts = [];
      if (c.rampa > 0) parts.push(c.rampa + ' rampa' + (c.rampa > 1 ? 's' : ''));
      if (c.escaleras > 0) parts.push(c.escaleras + ' escalera' + (c.escaleras > 1 ? 's' : ''));
      if (c.banco > 0) parts.push(c.banco + ' banco' + (c.banco > 1 ? 's' : ''));
      if (c.pendiente > 0) parts.push(c.pendiente + ' cuesta' + (c.pendiente > 1 ? 's' : ''));
      if (c.obstaculo > 0) parts.push(c.obstaculo + ' obstaculo' + (c.obstaculo > 1 ? 's' : ''));
      summaryEl.textContent = parts.length > 0
        ? parts.join(', ') + ' encontrado' + (routeData.nearbyReports.length > 1 ? 's' : '') + ' en la ruta'
        : 'No se encontraron reportes en la ruta';
    }

    // Turn-by-turn instructions
    var dirList = document.getElementById('rp-directions-list');
    if (dirList && routeData.steps) {
      var stepsHtml = '';
      routeData.steps.forEach(function (step, idx) {
        var stepDist = step.distance >= 1000
          ? (step.distance / 1000).toFixed(1) + ' km'
          : Math.round(step.distance) + ' m';
        stepsHtml +=
          '<li class="rp-direction-item">' +
          '<span class="rp-direction-num">' + (idx + 1) + '</span>' +
          '<span>' + escapeHtml(step.instruction) + ' (' + stepDist + ')</span>' +
          '</li>';
      });
      dirList.innerHTML = stepsHtml;
    }

    // Show/hide transit button for long routes (> 2km)
    var transitBtn = document.getElementById('rp-transit');
    if (transitBtn) {
      if (routeData.distance > 2000) {
        transitBtn.style.display = 'flex';
        transitBtn.onclick = function () {
          var origin = routeData.originLat + ',' + routeData.originLng;
          var dest = routeData.destLat + ',' + routeData.destLng;
          var url = 'https://www.google.com/maps/dir/?api=1&origin=' + origin +
            '&destination=' + dest + '&travelmode=transit';
          window.open(url, '_blank');
        };
      } else {
        transitBtn.style.display = 'none';
      }
    }

    panel.style.display = 'block';
  }

  /* --- Route Panel Button Handlers --- */
  function setupRoutePanelButtons() {
    // Start navigation button
    var startBtn = document.getElementById('rp-start-nav');
    if (startBtn) {
      startBtn.addEventListener('click', function () {
        if (MapModule.isNavigating()) {
          MapModule.stopNavigation();
          startBtn.textContent = 'Iniciar navegacion';
          startBtn.classList.remove('btn-danger');
          showToast('Navegacion detenida');
        } else {
          var started = MapModule.startNavigation();
          if (started) {
            startBtn.textContent = 'Detener navegacion';
            startBtn.classList.add('btn-danger');
            showToast('Navegacion con voz activada');
          }
        }
      });
    }

    // View detail button
    var detailBtn = document.getElementById('rp-view-detail');
    if (detailBtn) {
      detailBtn.addEventListener('click', function () {
        navigate('#ruta');
      });
    }

    // Cancel button
    var cancelBtn = document.getElementById('rp-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        if (MapModule.isNavigating()) MapModule.stopNavigation();
        MapModule.clearAllRouteData();
        var mapInput = document.getElementById('map-search');
        if (mapInput) mapInput.value = '';
        var mapClear = document.getElementById('map-search-clear');
        if (mapClear) mapClear.style.display = 'none';
        var rpBtn = document.getElementById('rp-start-nav');
        if (rpBtn) {
          rpBtn.textContent = 'Iniciar navegacion';
          rpBtn.classList.remove('btn-danger');
        }
      });
    }

    // Route detail screen: center on route button
    var rdCenterBtn = document.getElementById('rd-center-route');
    if (rdCenterBtn) {
      rdCenterBtn.addEventListener('click', function () {
        navigate('#mapa');
        setTimeout(function () {
          var started = MapModule.startNavigation();
          if (started) {
            var rpBtn = document.getElementById('rp-start-nav');
            if (rpBtn) {
              rpBtn.textContent = 'Detener navegacion';
              rpBtn.classList.add('btn-danger');
            }
            showToast('Navegacion con voz activada');
          }
        }, 400);
      });
    }
  }

  /* --- Populate Route Detail Screen --- */
  function populateRouteDetail() {
    var route = typeof MapModule !== 'undefined' ? MapModule.getCurrentRoute() : null;
    if (!route) return;

    // Origin/dest names
    var originEl = document.getElementById('route-origin-name');
    if (originEl) originEl.textContent = 'Tu ubicacion';

    var destEl = document.getElementById('route-dest-name');
    if (destEl) destEl.textContent = route.destName || 'Destino';

    // Distance
    var distEl = document.getElementById('rd-distance');
    if (distEl) distEl.textContent = (route.distance / 1000).toFixed(1) + 'km';

    // Time
    var mins = Math.ceil(route.duration / 60);
    var timeStr = mins < 60 ? mins + 'min' : Math.floor(mins / 60) + 'h ' + (mins % 60) + 'min';
    var timeEl = document.getElementById('rd-time');
    if (timeEl) timeEl.textContent = timeStr;

    // Score
    var scoreEl = document.getElementById('rd-score');
    if (scoreEl) scoreEl.textContent = route.score.toFixed(1) + '\u2605';

    // Accessibility tags
    var tagsEl = document.getElementById('rd-a11y-tags');
    if (tagsEl) {
      var c = route.counts;
      var tagsHtml = '';
      if (c.rampa > 0) tagsHtml += '<span class="a11y-tag">\u267F ' + c.rampa + ' rampa' + (c.rampa > 1 ? 's' : '') + '</span>';
      if (c.banco > 0) tagsHtml += '<span class="a11y-tag">\uD83E\uDE91 ' + c.banco + ' banco' + (c.banco > 1 ? 's' : '') + '</span>';
      if (c.escaleras > 0) tagsHtml += '<span class="a11y-tag" style="border-color:var(--yellow-500);color:var(--yellow-500);">\uD83E\uDE9C ' + c.escaleras + ' escalera' + (c.escaleras > 1 ? 's' : '') + '</span>';
      if (c.pendiente > 0) tagsHtml += '<span class="a11y-tag" style="border-color:var(--red-500);color:var(--red-500);">\u26F0\uFE0F ' + c.pendiente + ' cuesta' + (c.pendiente > 1 ? 's' : '') + '</span>';
      if (c.obstaculo > 0) tagsHtml += '<span class="a11y-tag" style="border-color:var(--orange-500);color:var(--orange-500);">\uD83D\uDEA7 ' + c.obstaculo + ' obstaculo' + (c.obstaculo > 1 ? 's' : '') + '</span>';

      if (route.score >= 4) tagsHtml += '<span class="a11y-tag">\u2705 Ruta accesible</span>';
      else if (route.score <= 2) tagsHtml += '<span class="a11y-tag" style="border-color:var(--red-500);color:var(--red-500);">\u26A0\uFE0F Precaucion: baja accesibilidad</span>';

      if (!tagsHtml) tagsHtml = '<span class="a11y-tag">Sin datos de accesibilidad en esta ruta</span>';
      tagsEl.innerHTML = tagsHtml;
    }

    // Transit button for long routes
    var rdTransit = document.getElementById('rd-transit');
    if (rdTransit) {
      if (route.distance > 2000) {
        rdTransit.style.display = 'block';
        rdTransit.onclick = function () {
          var origin = route.originLat + ',' + route.originLng;
          var dest = route.destLat + ',' + route.destLng;
          var url = 'https://www.google.com/maps/dir/?api=1&origin=' + origin +
            '&destination=' + dest + '&travelmode=transit';
          window.open(url, '_blank');
        };
      } else {
        rdTransit.style.display = 'none';
      }
    }

    // Reports list
    var reportsEl = document.getElementById('route-reports');
    if (reportsEl && route.nearbyReports) {
      if (route.nearbyReports.length === 0) {
        reportsEl.innerHTML = '<p style="color:var(--gray-400);font-size:14px;text-align:center;">No hay reportes en esta ruta aun.</p>';
      } else {
        var typeNames = { rampa: 'Rampa', escaleras: 'Escaleras', banco: 'Banco', pendiente: 'Pendiente', obstaculo: 'Obstaculo' };
        var typeIcons = { rampa: '\u267F', escaleras: '\uD83E\uDE9C', banco: '\uD83E\uDE91', pendiente: '\u26F0\uFE0F', obstaculo: '\uD83D\uDEA7' };
        var typeBgs = { rampa: 'var(--sky-100)', escaleras: 'var(--yellow-100)', banco: 'var(--green-100)', pendiente: 'var(--red-100)', obstaculo: 'var(--orange-100)' };

        var rhtml = '';
        route.nearbyReports.forEach(function (r) {
          var icon = typeIcons[r.type] || '\uD83D\uDCCD';
          var name = typeNames[r.type] || r.type;
          var stars = '';
          for (var i = 0; i < 5; i++) {
            stars += i < r.rating ? '\u2605' : '\u2606';
          }
          rhtml +=
            '<div class="report-card" role="article">' +
            '<div class="rc-icon" style="background:' + (typeBgs[r.type] || 'var(--gray-100)') + '">' + icon + '</div>' +
            '<div class="rc-info">' +
            '<div class="rc-type">' + escapeHtml(name) + '</div>' +
            '<div class="rc-detail">' + escapeHtml(r.comment || 'Sin comentario') + '</div>' +
            '</div>' +
            '<div class="rc-rating">' + stars + '</div>' +
            '</div>';
        });
        reportsEl.innerHTML = rhtml;
      }
    }
  }

  /* --- Helpers --- */
  function getTimeAgo(timestamp) {
    var diff = Date.now() - timestamp;
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return 'ahora';
    if (mins < 60) return mins + ' min';
    var hours = Math.floor(mins / 60);
    if (hours < 24) return hours + 'h';
    var days = Math.floor(hours / 24);
    return days + 'd';
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  /* --- Public API --- */
  return {
    init: init,
    navigate: navigate,
    getUserPosition: getUserPosition,
    showToast: showToast,
    installApp: installApp,
    dismissInstallBanner: dismissInstallBanner,
    applyFontSize: applyFontSize,
    getFontSize: getFontSize,
    escapeHtml: escapeHtml,
    getTimeAgo: getTimeAgo,
    // Auth API
    getAuthState: getAuthState,
    getUserName: getUserName,
    getUserPhoto: getUserPhoto,
    getUserUid: getUserUid,
    isFirebaseAuth: isFirebaseAuth,
    logout: logout,
    updateSyncIndicators: updateSyncIndicators,
    populateHome: populateHome,
  };
})();

// Boot
document.addEventListener('DOMContentLoaded', App.init);
