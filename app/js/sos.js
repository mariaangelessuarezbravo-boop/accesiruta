/* ============================================
   AccesiRuta — SOS Emergency Module
   Press-and-hold activation, SMS, call 112
   ============================================ */

var SOS = (function () {
  'use strict';

  var HOLD_DURATION = 2000; // 2 seconds
  var CONTACTS_KEY = 'accesiruta_contacts';
  var holdTimer = null;
  var holdStart = 0;
  var isHolding = false;
  var btn = null;

  /* --- Init --- */
  function init() {
    btn = document.getElementById('sos-hold-btn');
    if (!btn) return;

    // Touch events
    btn.addEventListener('touchstart', startHold, { passive: false });
    btn.addEventListener('touchend', cancelHold);
    btn.addEventListener('touchcancel', cancelHold);

    // Mouse events (for desktop testing)
    btn.addEventListener('mousedown', startHold);
    btn.addEventListener('mouseup', cancelHold);
    btn.addEventListener('mouseleave', cancelHold);

    // Call 112 button
    var call112Btn = document.getElementById('sos-call-112');
    if (call112Btn) {
      call112Btn.addEventListener('click', function () {
        window.location.href = 'tel:112';
      });
    }

    // SMS button
    var smsBtn = document.getElementById('sos-send-sms');
    if (smsBtn) {
      smsBtn.addEventListener('click', sendEmergencySMS);
    }

    renderContacts();
  }

  /* --- Hold Mechanism --- */
  function startHold(e) {
    e.preventDefault();
    isHolding = true;
    holdStart = Date.now();
    btn.classList.add('holding');

    // Vibrate on start
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }

    holdTimer = setTimeout(function () {
      if (isHolding) {
        activateSOS();
      }
    }, HOLD_DURATION);
  }

  function cancelHold() {
    isHolding = false;
    btn.classList.remove('holding');
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  }

  /* --- Activate SOS --- */
  function activateSOS() {
    isHolding = false;
    btn.classList.remove('holding');

    // Strong vibration pattern
    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200, 100, 400]);
    }

    App.showToast('¡SOS ACTIVADO! Enviando ubicación...', 4000);

    // Auto-send SMS
    sendEmergencySMS();
  }

  /* --- Send Emergency SMS --- */
  function sendEmergencySMS() {
    var pos = App.getUserPosition();
    var mapsLink = 'https://maps.google.com/?q=' + pos.lat + ',' + pos.lng;
    var message =
      '🆘 EMERGENCIA AccesiRuta\n' +
      'Necesito ayuda. Mi ubicación:\n' +
      mapsLink + '\n' +
      'Coordenadas: ' + pos.lat.toFixed(6) + ', ' + pos.lng.toFixed(6);

    // Get first emergency contact or use 112
    var contacts = getContacts();
    var phoneNumber = contacts.length > 0 ? contacts[0].phone : '112';

    // Encode for SMS URI
    var encodedMsg = encodeURIComponent(message);

    // Try sms: URI (works on most mobile browsers)
    // Use ? for iOS, & for Android - we use ? which works on both
    var smsUri = 'sms:' + phoneNumber + '?body=' + encodedMsg;
    window.location.href = smsUri;
  }

  /* --- Emergency Contacts --- */
  function getContacts() {
    try {
      var data = localStorage.getItem(CONTACTS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  function saveContacts(contacts) {
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
  }

  function addContact(name, phone) {
    if (!name || !phone) return false;
    var contacts = getContacts();
    contacts.push({
      id: 'c_' + Date.now(),
      name: name.trim(),
      phone: phone.trim(),
    });
    saveContacts(contacts);
    renderContacts();
    return true;
  }

  function removeContact(id) {
    var contacts = getContacts();
    contacts = contacts.filter(function (c) { return c.id !== id; });
    saveContacts(contacts);
    renderContacts();
  }

  function renderContacts() {
    // SOS screen contacts
    var sosContainer = document.getElementById('sos-contacts-list');
    // Profile screen contacts
    var profileContainer = document.getElementById('profile-contacts-list');

    var contacts = getContacts();

    var renderTo = function (container) {
      if (!container) return;
      if (contacts.length === 0) {
        container.innerHTML =
          '<p style="font-size:14px;color:var(--gray-400);text-align:center;padding:10px;">No hay contactos de emergencia. Añade uno en tu perfil.</p>';
        return;
      }
      var html = '';
      contacts.forEach(function (c) {
        html +=
          '<div class="contact-entry">' +
          '<div class="ce-info">' +
          '<div class="ce-name">' + App.escapeHtml(c.name) + '</div>' +
          '<div class="ce-phone">' + App.escapeHtml(c.phone) + '</div>' +
          '</div>' +
          '<button class="ce-remove" data-contact-id="' + c.id + '" aria-label="Eliminar contacto">&times;</button>' +
          '</div>';
      });
      container.innerHTML = html;

      // Attach remove handlers
      container.querySelectorAll('.ce-remove').forEach(function (btn) {
        btn.addEventListener('click', function () {
          removeContact(btn.getAttribute('data-contact-id'));
        });
      });
    };

    renderTo(sosContainer);
    renderTo(profileContainer);
  }

  /* --- Public API --- */
  return {
    init: init,
    getContacts: getContacts,
    addContact: addContact,
    removeContact: removeContact,
    renderContacts: renderContacts,
  };
})();
