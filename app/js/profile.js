/* ============================================
   AccesiRuta — Profile & Community Module
   User profile with Google photo support,
   stats, settings, community feed (Firestore or localStorage)
   ============================================ */

var Profile = (function () {
  'use strict';

  var PROFILE_KEY = 'accesiruta_profile';
  var POINTS_KEY = 'accesiruta_points';
  var VIEWS_KEY = 'accesiruta_views';

  /* --- Init --- */
  function init() {
    setupProfileName();
    setupFontSize();
    setupAddContact();
    setupLogout();
    refresh();
  }

  /* --- Profile Name --- */
  function setupProfileName() {
    var nameEl = document.getElementById('profile-name-display');
    var editBtn = document.getElementById('profile-name-edit');
    if (!nameEl || !editBtn) return;

    editBtn.addEventListener('click', function () {
      var authState = typeof App !== 'undefined' ? App.getAuthState() : null;

      // If logged in with Google, name comes from Google
      if (authState && authState.type === 'google') {
        App.showToast('El nombre viene de tu cuenta de Google');
        return;
      }

      var current = getName();
      var newName = prompt('Tu nombre:', current);
      if (newName !== null && newName.trim() !== '') {
        saveName(newName.trim());

        // Update auth state if in demo mode
        if (authState && authState.type === 'demo') {
          authState.name = newName.trim();
          localStorage.setItem('accesiruta_auth', JSON.stringify(authState));
        }

        refresh();
        App.showToast('Nombre actualizado');
      }
    });
  }

  function getName() {
    // Prefer auth state name
    if (typeof App !== 'undefined' && App.getUserName) {
      return App.getUserName();
    }
    return localStorage.getItem(PROFILE_KEY) || 'Usuario';
  }

  function saveName(name) {
    localStorage.setItem(PROFILE_KEY, name);
  }

  /* --- Points --- */
  function getPoints() {
    return parseInt(localStorage.getItem(POINTS_KEY)) || 0;
  }

  function addPoints(amount) {
    var current = getPoints();
    localStorage.setItem(POINTS_KEY, (current + amount).toString());
  }

  /* --- Route Views --- */
  function getViews() {
    return parseInt(localStorage.getItem(VIEWS_KEY)) || 0;
  }

  function addView() {
    var current = getViews();
    localStorage.setItem(VIEWS_KEY, (current + 1).toString());
  }

  /* --- Font Size --- */
  function setupFontSize() {
    var decreaseBtn = document.getElementById('font-decrease');
    var increaseBtn = document.getElementById('font-increase');
    var fontLabel = document.getElementById('font-size-label');

    var sizes = ['normal', 'large', 'xlarge'];
    var sizeLabels = { normal: 'Normal', large: 'Grande', xlarge: 'Muy grande' };

    function updateLabel() {
      var current = App.getFontSize();
      if (fontLabel) fontLabel.textContent = sizeLabels[current] || 'Normal';
    }

    if (decreaseBtn) {
      decreaseBtn.addEventListener('click', function () {
        var current = App.getFontSize();
        var idx = sizes.indexOf(current);
        if (idx > 0) {
          App.applyFontSize(sizes[idx - 1]);
          updateLabel();
          App.showToast('Tamano: ' + sizeLabels[sizes[idx - 1]]);
        }
      });
    }

    if (increaseBtn) {
      increaseBtn.addEventListener('click', function () {
        var current = App.getFontSize();
        var idx = sizes.indexOf(current);
        if (idx < sizes.length - 1) {
          App.applyFontSize(sizes[idx + 1]);
          updateLabel();
          App.showToast('Tamano: ' + sizeLabels[sizes[idx + 1]]);
        }
      });
    }

    updateLabel();
  }

  /* --- Add Contact --- */
  function setupAddContact() {
    var addBtn = document.getElementById('add-contact-btn');
    if (!addBtn) return;

    addBtn.addEventListener('click', function () {
      var nameInput = document.getElementById('contact-name-input');
      var phoneInput = document.getElementById('contact-phone-input');
      if (!nameInput || !phoneInput) return;

      var name = nameInput.value.trim();
      var phone = phoneInput.value.trim();

      if (!name || !phone) {
        App.showToast('Introduce nombre y telefono');
        return;
      }

      if (typeof SOS !== 'undefined') {
        SOS.addContact(name, phone);
        nameInput.value = '';
        phoneInput.value = '';
        App.showToast('Contacto anadido');
      }
    });
  }

  /* --- Logout --- */
  function setupLogout() {
    var logoutBtn = document.getElementById('profile-logout-btn');
    if (!logoutBtn) return;

    logoutBtn.addEventListener('click', function () {
      if (confirm('Seguro que quieres cerrar sesion?')) {
        if (typeof App !== 'undefined') {
          App.logout();
        }
      }
    });
  }

  /* --- Refresh Profile Screen --- */
  function refresh() {
    var userName = getName();
    var userPhoto = typeof App !== 'undefined' ? App.getUserPhoto() : null;
    var authState = typeof App !== 'undefined' ? App.getAuthState() : null;

    // Name
    var nameDisplay = document.getElementById('profile-name-display');
    if (nameDisplay) nameDisplay.textContent = userName;

    // Greeting on home
    var homeGreeting = document.getElementById('home-greeting-name');
    if (homeGreeting) homeGreeting.textContent = userName;

    // Avatar
    var avatarEl = document.getElementById('profile-avatar');
    if (avatarEl) {
      if (userPhoto) {
        avatarEl.innerHTML = '<img src="' + escapeAttr(userPhoto) + '" alt="Foto de perfil" referrerpolicy="no-referrer">';
      } else {
        avatarEl.innerHTML = '\u267F'; // wheelchair symbol
      }
    }

    // Auth info badge
    var authInfoEl = document.getElementById('profile-auth-info');
    var authBadge = document.getElementById('auth-badge');
    if (authInfoEl && authBadge && authState) {
      authInfoEl.style.display = 'block';
      if (authState.type === 'google') {
        authBadge.textContent = 'Google \u00B7 ' + (authState.email || '');
      } else if (authState.type === 'demo') {
        authBadge.textContent = 'Modo demo';
      } else {
        authBadge.textContent = 'Invitado';
      }
    }

    // Show/hide logout button
    var logoutSection = document.getElementById('profile-logout-section');
    if (logoutSection) {
      logoutSection.style.display = authState ? 'block' : 'none';
    }

    // Show/hide edit name button (hide for Google users)
    var editNameBtn = document.getElementById('profile-name-edit');
    if (editNameBtn && authState && authState.type === 'google') {
      editNameBtn.style.visibility = 'hidden';
    } else if (editNameBtn) {
      editNameBtn.style.visibility = 'visible';
    }

    // Stats
    var reportCount = document.getElementById('stat-reports');
    var viewCount = document.getElementById('stat-views');
    var pointCount = document.getElementById('stat-points');

    if (reportCount && typeof Reports !== 'undefined') {
      reportCount.textContent = Reports.getCount();
    }
    if (viewCount) viewCount.textContent = getViews();
    if (pointCount) pointCount.textContent = getPoints();

    // Community feed
    renderCommunityFeed();

    // Render contacts
    if (typeof SOS !== 'undefined') {
      SOS.renderContacts();
    }

    // Sync indicator
    if (typeof App !== 'undefined' && App.updateSyncIndicators) {
      App.updateSyncIndicators();
    }
  }

  /* --- Community Feed --- */
  function renderCommunityFeed() {
    var container = document.getElementById('community-feed');
    if (!container || typeof Reports === 'undefined') return;

    var reports = Reports.getAll();
    var recent = reports.slice(-5).reverse();

    if (recent.length === 0) {
      container.innerHTML =
        '<p style="font-size:14px;color:var(--gray-400);text-align:center;padding:16px;">La comunidad aun no tiene actividad.</p>';
      return;
    }

    var typeNames = {
      rampa: 'rampa accesible',
      escaleras: 'escaleras',
      banco: 'zona de descanso',
      pendiente: 'pendiente pronunciada',
      obstaculo: 'obstaculo en la via',
    };

    var html = '';
    recent.forEach(function (r) {
      var timeAgo = App.getTimeAgo(r.timestamp);
      var typeName = typeNames[r.type] || r.type;
      var stars = '';
      for (var i = 0; i < 5; i++) {
        stars += i < r.rating ? '\u2605' : '\u2606';
      }

      // Use report's stored user info, or fall back to current user
      var reportName = r.userName || getName();
      var reportPhoto = r.userPhoto || null;

      // Build avatar HTML
      var avatarHtml;
      if (reportPhoto) {
        avatarHtml = '<img src="' + escapeAttr(reportPhoto) + '" alt="" referrerpolicy="no-referrer">';
      } else {
        avatarHtml = '\uD83D\uDC64'; // bust silhouette
      }

      html +=
        '<div class="community-item">' +
        '<div class="ci-header">' +
        '<div class="ci-avatar">' + avatarHtml + '</div>' +
        '<span class="ci-name">' + App.escapeHtml(reportName) + '</span>' +
        '<span class="ci-time">' + timeAgo + '</span>' +
        '</div>' +
        '<div class="ci-body">' +
        'Report\u00F3 <strong>' + App.escapeHtml(typeName) + '</strong> ' +
        '<span style="color:var(--yellow-500);">' + stars + '</span>' +
        (r.comment ? '<br>' + App.escapeHtml(r.comment) : '') +
        '</div>' +
        '</div>';
    });

    container.innerHTML = html;
  }

  /* --- Helper --- */
  function escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* --- Public API --- */
  return {
    init: init,
    refresh: refresh,
    getName: getName,
    getPoints: getPoints,
    addPoints: addPoints,
    addView: addView,
  };
})();
