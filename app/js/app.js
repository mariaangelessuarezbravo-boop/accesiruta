/* ============================================
   AccesiRuta — Main App Controller
   Hash-based routing, geolocation, PWA install,
   Auth state management (Firebase + demo mode)
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
