/**
 * CapitalFlow — Firebase-Powered EMI Tracker
 * Phone Authentication + Firestore Backend
 */

document.addEventListener('DOMContentLoaded', () => {

  // ==========================================
  // STATE MANAGEMENT & CONFIG
  // ==========================================
  const STATE = {
    currentUser: null,       // Firebase Auth user object
    userProfile: null,       // Firestore user profile { displayName, role, plan, phone }
    activeRole: 'client',    // 'client' | 'admin'
    activeClientId: null,    // Firestore UID of client being viewed
    clients: [],             // Array of client objects (admin view)
    confirmationResult: null // Firebase phone auth confirmation
  };

  const PLAN_CONFIGS = {
    5000:  { principal: 5000,  totalPayable: 6000,  emi: 600  },
    10000: { principal: 10000, totalPayable: 12000, emi: 1200 },
    15000: { principal: 15000, totalPayable: 18000, emi: 1800 },
    20000: { principal: 20000, totalPayable: 24000, emi: 2400 }
  };

  // ==========================================
  // DOM ELEMENT SELECTORS
  // ==========================================
  const loadingOverlay = document.getElementById('loading-overlay');
  const loaderText = document.getElementById('loader-text');

  const loginView = document.getElementById('login-view');
  const dashboardView = document.getElementById('dashboard-view');
  const loginForm = document.getElementById('login-form');

  // Login Elements
  const loginUsername = document.getElementById('login-username');
  const loginPassword = document.getElementById('login-password');
  const loginBtn = document.getElementById('login-btn');
  const loginErrorMsg = document.getElementById('login-error-msg');
  const errorText = document.getElementById('error-text');

  // Dashboard Elements
  const displayUserName = document.getElementById('display-user-name');
  const displayRoleBadge = document.getElementById('display-role-badge');
  const logoutBtn = document.getElementById('logout-btn');
  const headerClientSelect = document.getElementById('header-client-select');
  const adminTotalClientsLabel = document.getElementById('admin-total-clients-label');

  const statRealPrincipal = document.getElementById('stat-real-principal');
  const statPercentageText = document.getElementById('stat-percentage-text');
  const statTotalPayable = document.getElementById('stat-total-payable');
  const statTotalPaid = document.getElementById('stat-total-paid');
  const statOutstanding = document.getElementById('stat-outstanding');
  const statOutstandingPercentage = document.getElementById('stat-outstanding-percentage');
  const statRemainingCount = document.getElementById('stat-remaining-count');
  const statEmiProgressBar = document.getElementById('stat-emi-progress-bar');
  const progressCircle = document.getElementById('progress-indicator-circle');

  const schedulerClientTitle = document.getElementById('scheduler-client-title');
  const badgeCountPaid = document.getElementById('badge-count-paid');
  const badgeCountPending = document.getElementById('badge-count-pending');
  const badgeCountOverdue = document.getElementById('badge-count-overdue');

  const emiListContainer = document.getElementById('emi-list-container');
  const confettiCanvas = document.getElementById('confetti-canvas');

  // Admin Modal Selectors
  const modalAddClient = document.getElementById('modal-add-client');
  const modalEditClient = document.getElementById('modal-edit-client');
  const addClientForm = document.getElementById('add-client-form');
  const editClientForm = document.getElementById('edit-client-form');
  const btnAddClientTrigger = document.getElementById('admin-btn-add-client');
  const btnEditClientTrigger = document.getElementById('admin-btn-edit-client');
  const btnDeleteClient = document.getElementById('admin-btn-delete-client');

  // ==========================================
  // LOADING OVERLAY CONTROL
  // ==========================================
  function showLoading(text = 'Loading...') {
    loaderText.textContent = text;
    loadingOverlay.classList.add('active');
  }

  function hideLoading() {
    loadingOverlay.classList.remove('active');
  }

  // ==========================================
  // FIREBASE PHONE AUTHENTICATION
  // ==========================================
  // ==========================================
  // DIRECT FIRESTORE LOGIN (Bypassing Firebase Auth)
  // ==========================================

  function showError(bannerEl, textEl, message) {
    textEl.textContent = message;
    bannerEl.classList.remove('hidden');
    // Auto-hide after 5 seconds
    setTimeout(() => bannerEl.classList.add('hidden'), 5000);
  }

  // Check if already logged in via localStorage
  const savedUid = localStorage.getItem('capitalflow_uid');
  if (savedUid) {
    autoLogin(savedUid);
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = loginUsername.value.trim();
    const password = loginPassword.value.trim();

    if (!username || !password) {
      showError(loginErrorMsg, errorText, 'Please enter both username and password.');
      return;
    }

    loginBtn.disabled = true;
    loginBtn.querySelector('span').textContent = 'Logging in...';
    showLoading('Authenticating...');

    try {
      const fullPhone = password.startsWith('+91') ? password : `+91${password}`;
      
      // Admin bypass based on hardcoded requirement
      if (username.toLowerCase() === 'gopal chandro kar' && password === '7828123727') {
        // Find or create admin
        let adminDocs = await db.collection('users').where('phone', '==', '+917828123727').get();
        let adminUid;
        
        if (adminDocs.empty) {
          const newAdmin = await db.collection('users').add({
            displayName: 'Gopal Chandro Kar',
            phone: '+917828123727',
            role: 'admin',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          adminUid = newAdmin.id;
        } else {
          adminUid = adminDocs.docs[0].id;
        }
        
        await handleSuccessfulLogin(adminUid, { displayName: 'Gopal Chandro Kar', phone: '+917828123727', role: 'admin' });
      } else {
        // Client login
        const userDocs = await db.collection('users')
          .where('displayName', '==', username)
          .where('phone', '==', fullPhone)
          .get();

        if (userDocs.empty) {
          hideLoading();
          showError(loginErrorMsg, errorText, 'Invalid username or password.');
          loginBtn.disabled = false;
          loginBtn.querySelector('span').textContent = 'Login securely';
          return;
        }

        const userDoc = userDocs.docs[0];
        await handleSuccessfulLogin(userDoc.id, userDoc.data());
      }
    } catch (err) {
      console.error('Login error:', err);
      hideLoading();
      showError(loginErrorMsg, errorText, 'An error occurred during login. Check console.');
      loginBtn.disabled = false;
      loginBtn.querySelector('span').textContent = 'Login securely';
    }
  });

  async function autoLogin(uid) {
    showLoading('Loading your dashboard...');
    try {
      const userDoc = await db.collection('users').doc(uid).get();
      if (userDoc.exists) {
        await handleSuccessfulLogin(uid, userDoc.data());
      } else {
        localStorage.removeItem('capitalflow_uid');
        hideLoading();
      }
    } catch (err) {
      console.error('Auto login error:', err);
      localStorage.removeItem('capitalflow_uid');
      hideLoading();
    }
  }

  async function handleSuccessfulLogin(uid, profileData) {
    STATE.currentUser = { uid: uid }; // Mock user object
    STATE.userProfile = profileData;
    STATE.activeRole = profileData.role || 'client';
    
    localStorage.setItem('capitalflow_uid', uid);

    if (STATE.activeRole === 'admin') {
      await loadAdminView();
    } else {
      await loadClientView(uid);
    }

    // Show dashboard
    displayUserName.textContent = STATE.userProfile.displayName || 'User';
    displayRoleBadge.textContent = STATE.activeRole === 'admin' ? 'Admin' : 'Client';
    document.body.className = `role-${STATE.activeRole}`;

    transitionViews(loginView, dashboardView);
    renderDashboard();
    hideLoading();
    
    // Reset button state
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.querySelector('span').textContent = 'Login securely';
    }
  }

  // ==========================================
  // FIRESTORE DATA OPERATIONS
  // ==========================================

  // Load admin view — fetch ALL client users
  async function loadAdminView() {
    const snapshot = await db.collection('users')
      .where('role', '==', 'client')
      .get();

    STATE.clients = [];

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const emisSnapshot = await db.collection('users').doc(doc.id)
        .collection('emis').orderBy('id').get();

      const emis = emisSnapshot.docs.map(e => ({ docId: e.id, ...e.data() }));

      STATE.clients.push({
        id: doc.id,
        name: data.displayName,
        phone: data.phone,
        plan: data.plan,
        emis: emis
      });
    }

    if (STATE.clients.length > 0) {
      STATE.activeClientId = STATE.clients[0].id;
    }

    populateClientSelectors();
  }

  // Load client view — fetch only this user's EMI data
  async function loadClientView(uid) {
    const emisSnapshot = await db.collection('users').doc(uid)
      .collection('emis').orderBy('id').get();

    const emis = emisSnapshot.docs.map(e => ({ docId: e.id, ...e.data() }));

    STATE.clients = [{
      id: uid,
      name: STATE.userProfile.displayName,
      phone: STATE.userProfile.phone,
      plan: STATE.userProfile.plan,
      emis: emis
    }];

    STATE.activeClientId = uid;
  }

  // Generate 10 sequential weekly EMI dates starting from today
  function getWeeklyDates() {
    const dates = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 10; i++) {
      const due = new Date(today);
      due.setDate(today.getDate() + (i * 7));

      const yyyy = due.getFullYear();
      const mm = String(due.getMonth() + 1).padStart(2, '0');
      const dd = String(due.getDate()).padStart(2, '0');
      dates.push(`${yyyy}-${mm}-${dd}`);
    }
    return dates;
  }

  // Create a new client in Firestore (Admin action)
  async function createClientInFirestore(name, phone, plan) {
    showLoading('Creating client profile...');

    try {
      // Create a document with a generated ID (since client hasn't signed in yet)
      // We use the phone number as a lookup key
      const clientRef = db.collection('users').doc();
      const dates = getWeeklyDates();
      const config = PLAN_CONFIGS[plan];

      await clientRef.set({
        displayName: name,
        phone: `+91${phone}`,
        role: 'client',
        plan: plan,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Create 10 EMI sub-documents
      const batch = db.batch();
      for (let i = 1; i <= 10; i++) {
        const emiRef = clientRef.collection('emis').doc(`emi_${i}`);
        batch.set(emiRef, {
          id: i,
          amount: config.emi,
          dueDate: dates[i - 1],
          status: 'Pending'
        });
      }
      await batch.commit();

      // Reload admin view
      await loadAdminView();
      STATE.activeClientId = clientRef.id;
      populateClientSelectors();
      renderDashboard();

      hideLoading();
      return clientRef.id;

    } catch (err) {
      console.error('Error creating client:', err);
      hideLoading();
      alert('Failed to create client. Error: ' + err.message);
      return null;
    }
  }

  // Update a single EMI field in Firestore
  async function updateEmiInFirestore(clientUid, emiDocId, field, value) {
    try {
      await db.collection('users').doc(clientUid)
        .collection('emis').doc(emiDocId)
        .update({ [field]: value });
    } catch (err) {
      console.error('Error updating EMI:', err);
      alert('Failed to update EMI. Error: ' + err.message);
    }
  }

  // Update client profile in Firestore
  async function updateClientInFirestore(clientUid, data) {
    showLoading('Updating client...');
    try {
      await db.collection('users').doc(clientUid).update(data);

      // If plan changed, regenerate EMIs
      if (data.plan) {
        const dates = getWeeklyDates();
        const config = PLAN_CONFIGS[data.plan];

        // Delete existing EMIs
        const existingEmis = await db.collection('users').doc(clientUid)
          .collection('emis').get();
        const deleteBatch = db.batch();
        existingEmis.docs.forEach(doc => deleteBatch.delete(doc.ref));
        await deleteBatch.commit();

        // Create new EMIs
        const createBatch = db.batch();
        for (let i = 1; i <= 10; i++) {
          const emiRef = db.collection('users').doc(clientUid)
            .collection('emis').doc(`emi_${i}`);
          createBatch.set(emiRef, {
            id: i,
            amount: config.emi,
            dueDate: dates[i - 1],
            status: 'Pending'
          });
        }
        await createBatch.commit();
      }

      await loadAdminView();
      STATE.activeClientId = clientUid;
      populateClientSelectors();
      renderDashboard();
      hideLoading();

    } catch (err) {
      console.error('Error updating client:', err);
      hideLoading();
      alert('Failed to update client. Error: ' + err.message);
    }
  }

  // Delete a client from Firestore
  async function deleteClientFromFirestore(clientUid) {
    showLoading('Deleting client...');
    try {
      // Delete EMIs subcollection first
      const emisSnapshot = await db.collection('users').doc(clientUid)
        .collection('emis').get();
      const batch = db.batch();
      emisSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();

      // Delete user document
      await db.collection('users').doc(clientUid).delete();

      await loadAdminView();
      if (STATE.clients.length > 0) {
        STATE.activeClientId = STATE.clients[0].id;
      }
      populateClientSelectors();
      renderDashboard();
      hideLoading();

    } catch (err) {
      console.error('Error deleting client:', err);
      hideLoading();
      alert('Failed to delete client. Error: ' + err.message);
    }
  }

  // ==========================================
  // BUSINESS LOGIC ENGINE
  // ==========================================

  function evaluateOverdueStatus(dueDate, currentStatus) {
    if (currentStatus === 'Paid') return 'Paid';

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);

    if (due < today) {
      return 'Overdue';
    }
    return 'Pending';
  }

  function getActiveClient() {
    return STATE.clients.find(c => c.id === STATE.activeClientId) || STATE.clients[0];
  }

  function computeClientMetrics(client) {
    if (!client) return null;

    const config = PLAN_CONFIGS[client.plan];
    let paidCount = 0;
    let pendingCount = 0;
    let overdueCount = 0;
    let totalPaid = 0;

    client.emis.forEach(emi => {
      const status = evaluateOverdueStatus(emi.dueDate, emi.status);
      if (status === 'Paid') {
        paidCount++;
        totalPaid += emi.amount;
      } else if (status === 'Overdue') {
        overdueCount++;
      } else {
        pendingCount++;
      }
    });

    const totalOutstanding = config.totalPayable - totalPaid;
    const remainingCount = 10 - paidCount;
    const completionPercent = Math.round((totalPaid / config.totalPayable) * 100);

    return {
      paidCount,
      pendingCount,
      overdueCount,
      totalPaid,
      totalOutstanding,
      remainingCount,
      completionPercent
    };
  }

  // ==========================================
  // RENDERING & INTERACTIVE DASHBOARD
  // ==========================================

  function populateClientSelectors() {
    headerClientSelect.innerHTML = '';
    
    if (STATE.clients.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No members';
      headerClientSelect.appendChild(option);
      adminTotalClientsLabel.textContent = 'No members';
    } else {
      STATE.clients.forEach(client => {
        const option = document.createElement('option');
        option.value = client.id;
        option.textContent = `${client.name} (₹${client.plan.toLocaleString()} Plan)`;
        if (client.id === STATE.activeClientId) {
          option.selected = true;
        }
        headerClientSelect.appendChild(option);
      });
      adminTotalClientsLabel.textContent = `${STATE.clients.length} Client${STATE.clients.length === 1 ? '' : 's'} Registered`;
    }
  }

  function renderDashboard() {
    const client = getActiveClient();
    if (!client) {
      schedulerClientTitle.textContent = "No Client Selected";
      statRealPrincipal.textContent = `₹0`;
      statPercentageText.textContent = `0% Paid`;
      statTotalPayable.textContent = `₹0`;
      statTotalPaid.textContent = `₹0`;
      statOutstanding.textContent = `₹0`;
      statOutstandingPercentage.textContent = `0% of payable amount remaining`;
      statRemainingCount.textContent = `0 / 10`;
      statEmiProgressBar.style.width = `0%`;
      badgeCountPaid.textContent = 0;
      badgeCountPending.textContent = 0;
      badgeCountOverdue.textContent = 0;
      progressCircle.style.strokeDashoffset = 534;
      progressCircle.style.stroke = 'var(--text-muted)';
      emiListContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 40px; font-size: 14px;">No members available. Please add a client to see the schedule.</div>';
      return;
    }

    const config = PLAN_CONFIGS[client.plan];
    const metrics = computeClientMetrics(client);

    // 1. Set titles
    schedulerClientTitle.textContent = `${client.name}'s Weekly Installment Schedule`;

    // 2. Text & Stats Card updates
    statRealPrincipal.textContent = `₹${config.principal.toLocaleString()}`;
    statPercentageText.textContent = `${metrics.completionPercent}% Paid`;
    statTotalPayable.textContent = `₹${config.totalPayable.toLocaleString()}`;
    statTotalPaid.textContent = `₹${metrics.totalPaid.toLocaleString()}`;
    statOutstanding.textContent = `₹${metrics.totalOutstanding.toLocaleString()}`;

    const outstandingPercent = Math.round((metrics.totalOutstanding / config.totalPayable) * 100);
    statOutstandingPercentage.textContent = `${outstandingPercent}% of payable amount remaining`;

    statRemainingCount.textContent = `${metrics.remainingCount} / 10`;
    statEmiProgressBar.style.width = `${metrics.completionPercent}%`;

    // 3. Set badging counts
    badgeCountPaid.textContent = metrics.paidCount;
    badgeCountPending.textContent = metrics.pendingCount;
    badgeCountOverdue.textContent = metrics.overdueCount;

    // 4. Progress Ring dash updates
    const offset = 534 - (metrics.completionPercent / 100) * 534;
    progressCircle.style.strokeDashoffset = offset;

    if (metrics.overdueCount > 0) {
      progressCircle.style.stroke = 'var(--color-overdue)';
    } else if (metrics.completionPercent === 100) {
      progressCircle.style.stroke = 'url(#ring-gradient-success)';
    } else {
      progressCircle.style.stroke = 'url(#ring-gradient-pending)';
    }

    // 5. Render EMI Slots
    emiListContainer.innerHTML = '';
    client.emis.forEach(emi => {
      const status = evaluateOverdueStatus(emi.dueDate, emi.status);
      const row = document.createElement('div');
      row.className = `emi-row ${status.toLowerCase()}-row`;
      row.setAttribute('data-id', emi.id);

      let dateDisplay = `<span class="emi-date-text">${formatDisplayDate(emi.dueDate)}</span>`;
      let statusDisplay = `<span class="status-badge badge-${status.toLowerCase()}">${status}</span>`;
      let actionsDisplay = '';

      if (STATE.activeRole === 'admin') {
        const isPaid = status === 'Paid';
        
        if (isPaid) {
          dateDisplay = `<input type="date" class="admin-input-date admin-only-element" value="${emi.dueDate}" disabled style="opacity: 0.7; cursor: not-allowed;">`;
          statusDisplay = `
            <select class="admin-select-status admin-only-element val-paid" disabled style="opacity: 0.8; cursor: not-allowed;">
              <option value="Paid" selected>Paid</option>
            </select>
          `;
          actionsDisplay = `
            <div class="col-actions admin-only-element">
              <button class="btn-quick-pay" disabled style="opacity: 0.5; cursor: not-allowed;" title="Payment locked">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M20 6L9 17l-5-5"></path>
                </svg>
                <span>Paid</span>
              </button>
            </div>
          `;
        } else {
          dateDisplay = `<input type="date" class="admin-input-date admin-only-element" value="${emi.dueDate}">`;
          statusDisplay = `
            <select class="admin-select-status admin-only-element val-${status.toLowerCase()}">
              <option value="Paid" ${status === 'Paid' ? 'selected' : ''}>Paid</option>
              <option value="Pending" ${status === 'Pending' ? 'selected' : ''}>Pending</option>
              <option value="Overdue" ${status === 'Overdue' ? 'selected' : ''}>Overdue</option>
            </select>
          `;
          actionsDisplay = `
            <div class="col-actions admin-only-element">
              <button class="btn-quick-pay" data-id="${emi.id}" data-doc-id="${emi.docId || ''}">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <span>Pay</span>
              </button>
            </div>
          `;
        }
      }

      row.innerHTML = `
        <div class="col-num emi-num">${emi.id.toString().padStart(2, '0')}</div>
        <div class="col-amount emi-amount">₹${emi.amount.toLocaleString()}</div>
        <div class="col-date">${dateDisplay}</div>
        <div class="col-status">${statusDisplay}</div>
        ${actionsDisplay}
      `;

      if (STATE.activeRole === 'admin') {
        const dateInput = row.querySelector('.admin-input-date');
        const statusSelect = row.querySelector('.admin-select-status');
        const quickPayBtn = row.querySelector('.btn-quick-pay');

        dateInput.addEventListener('change', async (e) => {
          const newDate = e.target.value;
          if (newDate) {
            await handleEmiUpdate(emi, 'dueDate', newDate);
          }
        });

        statusSelect.addEventListener('change', async (e) => {
          const newStatus = e.target.value;
          await handleEmiUpdate(emi, 'status', newStatus);
        });

        quickPayBtn.addEventListener('click', async () => {
          const targetStatus = emi.status === 'Paid' ? 'Pending' : 'Paid';
          await handleEmiUpdate(emi, 'status', targetStatus);
        });
      }

      emiListContainer.appendChild(row);
    });
  }

  // Handle EMI update — update local state + Firestore
  async function handleEmiUpdate(emi, field, value) {
    const client = getActiveClient();
    if (!client) return;

    const oldMetrics = computeClientMetrics(client);

    // Update local state
    const localEmi = client.emis.find(e => e.id === emi.id);
    if (localEmi) {
      localEmi[field] = value;
      if (field === 'dueDate' || field === 'status') {
        localEmi.status = evaluateOverdueStatus(localEmi.dueDate, localEmi.status);
      }
    }

    renderDashboard();

    // Persist to Firestore
    const emiDocId = emi.docId || `emi_${emi.id}`;
    await updateEmiInFirestore(client.id, emiDocId, field, value);

    const newMetrics = computeClientMetrics(client);
    if (newMetrics.completionPercent === 100 && oldMetrics.completionPercent < 100) {
      triggerConfettiCelebration();
    }
  }

  function formatDisplayDate(dateStr) {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const day = String(date.getDate()).padStart(2, '0');
    const month = date.toLocaleString('en-US', { month: 'short' });
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  }

  // ==========================================
  // EVENT HANDLERS & ROUTING
  // ==========================================

  // Logout Handler
  logoutBtn.addEventListener('click', async () => {
    showLoading('Signing out...');
    try {
      await auth.signOut();
    } catch (err) {
      console.error('Logout error:', err);
      hideLoading();
    }
  });

  // Client Selector (Admin View)
  headerClientSelect.addEventListener('change', (e) => {
    STATE.activeClientId = e.target.value;
    renderDashboard();
  });

  // View transition helper
  function transitionViews(fromView, toView) {
    fromView.style.opacity = '0';
    fromView.style.transform = 'translateY(15px)';

    setTimeout(() => {
      fromView.classList.remove('active');
      toView.classList.add('active');

      toView.offsetHeight; // repaint force

      toView.style.opacity = '1';
      toView.style.transform = 'translateY(0)';
    }, 300);
  }

  function resetLoginForm() {
    phoneStep.classList.add('active');
    otpStep.classList.remove('active');
    phoneInput.value = '';
    otpDigits.forEach(d => d.value = '');
    loginErrorMsg.classList.add('hidden');
    otpErrorMsg.classList.add('hidden');
    clearInterval(resendCountdownInterval);
  }

  // ==========================================
  // MODAL CONTROLS (ADMIN ONLY)
  // ==========================================

  // Close Modals
  document.querySelectorAll('.btn-modal-close').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modalId = e.currentTarget.getAttribute('data-target');
      document.getElementById(modalId).classList.remove('active');
    });
  });

  // Close modals on clicking overlay background
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('active');
      }
    });
  });

  // Add Client Trigger
  btnAddClientTrigger.addEventListener('click', () => {
    addClientForm.reset();
    modalAddClient.classList.add('active');
  });

  // Add Client Form Submission
  addClientForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('new-client-name').value.trim();
    const phone = document.getElementById('new-client-phone').value.trim();
    const plan = parseInt(document.querySelector('input[name="new-client-plan"]:checked').value);

    if (!/^\d{10}$/.test(phone)) {
      alert('Please enter a valid 10-digit phone number.');
      return;
    }

    modalAddClient.classList.remove('active');
    await createClientInFirestore(name, phone, plan);
  });

  // Edit Client Trigger
  btnEditClientTrigger.addEventListener('click', () => {
    const client = getActiveClient();
    if (!client) return;

    document.getElementById('edit-client-id').value = client.id;
    document.getElementById('edit-client-name').value = client.name;
    document.getElementById('edit-client-phone').value = (client.phone || '').replace('+91', '');

    // Check corresponding plan radio
    const planRadio = document.getElementById(`edit-plan-${client.plan}`);
    if (planRadio) planRadio.checked = true;

    modalEditClient.classList.add('active');
  });

  // Edit Client Form Save
  editClientForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-client-id').value;
    const name = document.getElementById('edit-client-name').value.trim();
    const phone = document.getElementById('edit-client-phone').value.trim();
    const plan = parseInt(document.querySelector('input[name="edit-client-plan"]:checked').value);

    const client = STATE.clients.find(c => c.id === id);
    if (!client) return;

    const updateData = {
      displayName: name,
      phone: `+91${phone}`
    };

    // Only include plan if it changed (triggers EMI regeneration)
    if (client.plan !== plan) {
      updateData.plan = plan;
    }

    modalEditClient.classList.remove('active');
    await updateClientInFirestore(id, updateData);
  });

  // Delete Client Button
  btnDeleteClient.addEventListener('click', async () => {
    const id = document.getElementById('edit-client-id').value;
    const client = STATE.clients.find(c => c.id === id);

    if (client) {
      if (confirm(`Are you sure you want to delete client "${client.name}"? This action is irreversible.`)) {
        modalEditClient.classList.remove('active');
        await deleteClientFromFirestore(id);
      }
    }
  });

  // ==========================================
  // CONFETTI PHYSICS CELEBRATION
  // ==========================================
  let confettiAnimationId = null;

  function triggerConfettiCelebration() {
    const ctx = confettiCanvas.getContext('2d');
    resizeConfettiCanvas();
    window.addEventListener('resize', resizeConfettiCanvas);

    const particles = [];
    const colors = ['#a78bfa', '#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ec4899'];

    for (let i = 0; i < 150; i++) {
      particles.push({
        x: Math.random() * confettiCanvas.width,
        y: Math.random() * confettiCanvas.height - confettiCanvas.height,
        r: Math.random() * 6 + 4,
        d: Math.random() * confettiCanvas.height,
        color: colors[Math.floor(Math.random() * colors.length)],
        tilt: Math.random() * 10 - 5,
        tiltAngleIncremental: Math.random() * 0.07 + 0.02,
        tiltAngle: 0,
        vy: Math.random() * 3 + 2,
        vx: Math.random() * 2 - 1
      });
    }

    let animationFrames = 0;

    function drawConfetti() {
      ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
      let alive = false;

      particles.forEach(p => {
        p.tiltAngle += p.tiltAngleIncremental;
        p.y += p.vy;
        p.x += p.vx + Math.sin(p.tiltAngle) * 0.5;
        p.tilt = Math.sin(p.tiltAngle - (p.r / 2)) * 10;

        if (p.y <= confettiCanvas.height) {
          alive = true;
        }

        ctx.beginPath();
        ctx.lineWidth = p.r;
        ctx.strokeStyle = p.color;
        ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
        ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
        ctx.stroke();
      });

      animationFrames++;

      if (alive && animationFrames < 300) {
        confettiAnimationId = requestAnimationFrame(drawConfetti);
      } else {
        ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
        cancelAnimationFrame(confettiAnimationId);
        window.removeEventListener('resize', resizeConfettiCanvas);
      }
    }

    if (confettiAnimationId) {
      cancelAnimationFrame(confettiAnimationId);
    }
    drawConfetti();
  }

  function resizeConfettiCanvas() {
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
  }

  // ==========================================
  // APP LIFECYCLE
  // ==========================================
  
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      STATE.currentUser = null;
      STATE.userProfile = null;
      STATE.clients = [];
      STATE.activeClientId = null;
      document.body.className = '';
      
      // Clear inputs
      if (loginUsername) loginUsername.value = '';
      if (loginPassword) loginPassword.value = '';
      
      localStorage.removeItem('capitalflow_uid');
      
      if (dashboardView.classList.contains('active')) {
        transitionViews(dashboardView, loginView);
      }
    });
  }

  // Hide overlay if not auto-logging in
  if (!localStorage.getItem('capitalflow_uid')) {
    hideLoading();
  }

});
