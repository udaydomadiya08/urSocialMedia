'use strict';

/**
 * Insaysnap — Ephemeral Camera-First Application Engine
 */

(() => {
  const state = {
    currentUser: null,
    activeView: 'camera',
    mediaStream: null,
    activeFilter: 'none',
    selectedDuration: 5,
    capturedDataUrl: null,
    friends: [],
    inbox: [],
    stories: [],
    memories: [],
    facingMode: 'user'
  };

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  function toast(msg) {
    const el = $('#toastMsg');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2600);
  }

  async function api(path, options = {}) {
    const token = localStorage.getItem('insaysnap_token');
    const headers = { ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const res = await fetch(path, { ...options, headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      return data;
    } catch (err) {
      console.error('API Error:', err);
      throw err;
    }
  }

  // Camera Initialization
  async function initCamera() {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        if (state.mediaStream) {
          state.mediaStream.getTracks().forEach(t => t.stop());
        }
        state.mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: state.facingMode, width: { ideal: 1080 }, height: { ideal: 1920 } },
          audio: false
        });
        const video = $('#cameraVideo');
        video.srcObject = state.mediaStream;
        video.style.filter = state.activeFilter;
        video.play().catch(() => {});
      } catch (err) {
        console.warn('Camera access unavailable or denied:', err.message);
        setupFallbackCanvas();
      }
    } else {
      setupFallbackCanvas();
    }
  }

  function setupFallbackCanvas() {
    // Generate synthetic aesthetic viewfinder graphic when camera is not permitted
    const canvas = $('#captureCanvas');
    canvas.style.display = 'block';
    canvas.width = 450;
    canvas.height = 800;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 450, 800);
    grad.addColorStop(0, '#1e1b4b');
    grad.addColorStop(0.5, '#431407');
    grad.addColorStop(1, '#090a0f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 450, 800);

    ctx.fillStyle = '#fffc00';
    ctx.font = 'bold 22px Plus Jakarta Sans';
    ctx.textAlign = 'center';
    ctx.fillText('⚡ insaysnap Camera Ready', 225, 380);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px Plus Jakarta Sans';
    ctx.fillText('Tap Shutter or Upload to create a snap', 225, 420);
  }

  function switchView(viewName) {
    state.activeView = viewName;
    $$('.nav-btn').forEach(b => b.classList.remove('active'));
    const btn = $(`[data-view="${viewName}"]`);
    if (btn) btn.classList.add('active');

    $('#viewCamera').style.display = viewName === 'camera' ? 'block' : 'none';
    $('#viewInbox').style.display = viewName === 'inbox' ? 'block' : 'none';
    $('#viewStories').style.display = viewName === 'stories' ? 'block' : 'none';
    $('#viewMemories').style.display = viewName === 'memories' ? 'block' : 'none';
    $('#viewFriends').style.display = viewName === 'friends' ? 'block' : 'none';

    if (viewName === 'camera') initCamera();
    else if (state.mediaStream) {
      state.mediaStream.getTracks().forEach(t => t.stop());
      state.mediaStream = null;
    }

    if (viewName === 'inbox') loadInbox();
    if (viewName === 'stories') loadStories();
    if (viewName === 'memories') loadMemories();
    if (viewName === 'friends') loadFriends();
  }

  // Auth Flow
  async function checkAuth() {
    try {
      const res = await api('/api/auth/me');
      state.currentUser = res.user;
      if (res.unopenedSnaps > 0) {
        $('#unopenedBadge').textContent = res.unopenedSnaps;
        $('#unopenedBadge').style.display = 'inline-block';
      }
      updateUserUI();
    } catch {
      state.currentUser = null;
      updateUserUI();
    }
  }

  function updateUserUI() {
    const user = state.currentUser;
    if (user) {
      $('#sidebarUsername').textContent = user.displayName || user.username;
      $('#sidebarScore').textContent = user.snapScore || 0;
      $('#sidebarAvatar').src = user.avatarUrl;
      $('#authBtn').textContent = 'Sign Out';
      $('#authBtn').onclick = logout;
    } else {
      $('#sidebarUsername').textContent = 'Guest Snapper';
      $('#sidebarScore').textContent = '0';
      $('#authBtn').textContent = 'Sign In';
      $('#authBtn').onclick = () => $('#authDialog').showModal();
    }
  }

  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
    localStorage.removeItem('insaysnap_token');
    state.currentUser = null;
    updateUserUI();
    toast('Logged out');
  }

  // Camera Actions
  $('#flipCameraBtn').onclick = () => {
    state.facingMode = state.facingMode === 'user' ? 'environment' : 'user';
    initCamera();
  };

  $('#timerToggleBtn').onclick = () => {
    const durations = [3, 5, 10];
    const nextIdx = (durations.indexOf(state.selectedDuration) + 1) % durations.length;
    state.selectedDuration = durations[nextIdx];
    $('#timerVal').textContent = state.selectedDuration;
    toast(`Snap timer: ${state.selectedDuration} seconds`);
  };

  $$('.filter-chip').forEach(chip => {
    chip.onclick = () => {
      $$('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.activeFilter = chip.dataset.filter;
      $('#cameraVideo').style.filter = state.activeFilter;
    };
  });

  // Capture Shutter Button
  $('#shutterBtn').onclick = () => {
    const video = $('#cameraVideo');
    const canvas = $('#captureCanvas');
    canvas.width = video.videoWidth || 450;
    canvas.height = video.videoHeight || 800;
    const ctx = canvas.getContext('2d');

    if (state.activeFilter !== 'none') {
      ctx.filter = state.activeFilter;
    }

    if (video.srcObject && video.videoWidth) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } else {
      // Draw stylized fallback snap
      setupFallbackCanvas();
    }

    state.capturedDataUrl = canvas.toDataURL('image/jpeg', 0.88);
    $('#capturedImage').src = state.capturedDataUrl;
    $('#capturedPreviewOverlay').style.display = 'block';
  };

  // Fallback Upload Trigger
  $('#fallbackTriggerBtn').onclick = () => $('#mediaUploadFallback').click();
  $('#mediaUploadFallback').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      state.capturedDataUrl = ev.target.result;
      $('#capturedImage').src = state.capturedDataUrl;
      $('#capturedPreviewOverlay').style.display = 'block';
    };
    reader.readAsDataURL(file);
  };

  $('#retakeBtn').onclick = () => {
    $('#capturedPreviewOverlay').style.display = 'none';
    state.capturedDataUrl = null;
    $('#snapCaptionInput').value = '';
  };

  // Save to Memories (Vault)
  $('#saveMemoryBtn').onclick = async () => {
    if (!state.currentUser) return $('#authDialog').showModal();
    const caption = $('#snapCaptionInput').value.trim();
    try {
      await api('/api/memories', {
        method: 'POST',
        body: JSON.stringify({
          mediaPath: state.capturedDataUrl,
          mediaType: 'image',
          caption
        })
      });
      toast('Saved to private Memories vault! 💾');
    } catch (err) { toast(err.message); }
  };

  // Open Send Recipient Dialog
  $('#openSendDrawerBtn').onclick = async () => {
    if (!state.currentUser) return $('#authDialog').showModal();
    try {
      const res = await api('/api/friends');
      state.friends = res.friends || [];
      const list = $('#recipientFriendsList');

      list.innerHTML = state.friends.map(f => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:var(--panel2);border-radius:10px">
          <div>
            <b>${f.display_name}</b>
            <span class="streak-badge">🔥 ${f.streak_count}</span>
          </div>
          <button class="btn-primary" style="padding:6px 12px;font-size:12px" onclick="window.sendDirectSnap('${f.id}')">Send ⚡</button>
        </div>
      `).join('') || '<div style="color:var(--muted);font-size:12px">No friends added yet. Post to Story or add friends!</div>';

      $('#sendRecipientDialog').showModal();
    } catch (err) { toast(err.message); }
  };

  // Send Direct Snap
  window.sendDirectSnap = async (recipientId) => {
    const caption = $('#snapCaptionInput').value.trim();
    try {
      await api('/api/snaps', {
        method: 'POST',
        body: JSON.stringify({
          recipientId,
          mediaPath: state.capturedDataUrl,
          mediaType: 'image',
          caption,
          durationSeconds: state.selectedDuration
        })
      });
      $('#sendRecipientDialog').close();
      $('#capturedPreviewOverlay').style.display = 'none';
      toast(`Snap sent! Disappears after ${state.selectedDuration}s.`);
      checkAuth();
    } catch (err) { toast(err.message); }
  };

  // Send to 24h Story
  $('#sendToStoryBtn').onclick = async () => {
    const caption = $('#snapCaptionInput').value.trim();
    try {
      await api('/api/stories', {
        method: 'POST',
        body: JSON.stringify({
          mediaPath: state.capturedDataUrl,
          mediaType: 'image',
          caption
        })
      });
      $('#sendRecipientDialog').close();
      $('#capturedPreviewOverlay').style.display = 'none';
      toast('Added to your 24h story! ✨');
    } catch (err) { toast(err.message); }
  };

  // Load Inbox (Snaps)
  async function loadInbox() {
    if (!state.currentUser) return $('#authDialog').showModal();
    const list = $('#inboxList');
    try {
      const res = await api('/api/snaps/inbox');
      state.inbox = res.inbox || [];

      if (state.inbox.length === 0) {
        list.innerHTML = '<div style="color:var(--muted);text-align:center;padding:40px">No snaps in your inbox. Send one to a friend!</div>';
        return;
      }

      list.innerHTML = state.inbox.map(s => {
        const isPhoto = s.media_type === 'image';
        return `
          <div class="snap-item" onclick="window.openEphemeralSnap('${s.id}')">
            <div style="display:flex;align-items:center;gap:14px">
              <div class="snap-icon-box ${s.is_opened ? 'opened' : (isPhoto ? 'photo-unopened' : 'video-unopened')}">
                ${s.is_opened ? '◽' : '■'}
              </div>
              <div>
                <b>${s.sender_name} (@${s.sender_username})</b>
                <small style="display:block;color:var(--muted)">
                  ${s.is_opened ? 'Opened • Purged from server' : `Tap to view • ${s.duration_seconds}s`}
                </small>
              </div>
            </div>
            <span style="font-size:12px;color:var(--muted)">${formatTimeAgo(s.created_at)}</span>
          </div>
        `;
      }).join('');
    } catch (err) { toast(err.message); }
  }

  // Fullscreen Ephemeral Viewer with Countdown
  let snapCountdownTimer = null;
  window.openEphemeralSnap = async (snapId) => {
    try {
      const res = await api(`/api/snaps/${snapId}/open`, { method: 'POST' });
      const dialog = $('#snapViewerDialog');
      $('#viewerImage').src = res.mediaPath;
      $('#viewerCaption').textContent = res.caption || '';

      let remaining = res.durationSeconds;
      $('#countdownCircle').textContent = remaining;
      dialog.showModal();

      clearInterval(snapCountdownTimer);
      snapCountdownTimer = setInterval(async () => {
        remaining -= 1;
        $('#countdownCircle').textContent = remaining;

        if (remaining <= 0) {
          clearInterval(snapCountdownTimer);
          dialog.close();
          // Notify server to physically delete disk and DB records
          await api(`/api/snaps/${snapId}/consumed`, { method: 'POST' });
          toast('Snap expired & permanently deleted from server. 🗑️');
          loadInbox();
          checkAuth();
        }
      }, 1000);

      dialog.onclose = async () => {
        clearInterval(snapCountdownTimer);
        await api(`/api/snaps/${snapId}/consumed`, { method: 'POST' });
        loadInbox();
        checkAuth();
      };
    } catch (err) {
      toast(err.message);
    }
  };

  // Stories View
  async function loadStories() {
    const list = $('#storiesList');
    try {
      const res = await api('/api/stories');
      state.stories = res.stories || [];

      if (state.stories.length === 0) {
        list.innerHTML = '<div style="color:var(--muted);padding:20px">No active friend stories right now.</div>';
        return;
      }

      list.innerHTML = state.stories.map(u => `
        <div class="community-card" style="cursor:pointer" onclick="window.viewUserStory('${u.userId}')">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
            <img class="user-avatar-sm" src="${u.avatarUrl}" alt="">
            <div>
              <b>${u.displayName}</b>
              <small style="color:var(--muted);display:block">@${u.username} • ${u.stories.length} stories</small>
            </div>
          </div>
          <div style="aspect-ratio:9/14;border-radius:12px;overflow:hidden;background:#111">
            <img src="${u.stories[0].mediaPath}" style="width:100%;height:100%;object-fit:cover" alt="">
          </div>
        </div>
      `).join('');
    } catch (err) { toast(err.message); }
  }

  // Memories View
  async function loadMemories() {
    if (!state.currentUser) return $('#authDialog').showModal();
    const grid = $('#memoriesGrid');
    try {
      const res = await api('/api/memories');
      state.memories = res.memories || [];

      if (state.memories.length === 0) {
        grid.innerHTML = '<div style="color:var(--muted);padding:30px">Your private memories vault is empty. Save snaps from the camera review screen!</div>';
        return;
      }

      grid.innerHTML = state.memories.map(m => `
        <div class="memory-card">
          <img src="${m.media_path}" alt="">
          <div class="memory-caption">${m.caption || new Date(m.created_at).toLocaleDateString()}</div>
        </div>
      `).join('');
    } catch (err) { toast(err.message); }
  }

  // Friends View
  async function loadFriends() {
    if (!state.currentUser) return $('#authDialog').showModal();
    const list = $('#friendsList');
    try {
      const res = await api('/api/friends');
      state.friends = res.friends || [];

      list.innerHTML = state.friends.map(f => `
        <div class="snap-item">
          <div style="display:flex;align-items:center;gap:12px">
            <img class="user-avatar-sm" src="${f.avatar_url}" alt="">
            <div>
              <b>${f.display_name} (@${f.username})</b>
              <small style="color:var(--muted);display:block">Score: ${f.snap_score} pts</small>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:12px">
            <span class="streak-badge" style="font-size:15px">🔥 ${f.streak_count}</span>
            <button class="btn-primary" style="padding:6px 12px;font-size:12px" onclick="switchView('camera')">Snap ⚡</button>
          </div>
        </div>
      `).join('') || '<div style="color:var(--muted)">No friends added.</div>';
    } catch (err) { toast(err.message); }
  }

  // Auth Dialog Handlers
  let authMode = 'login';
  $('#tabLogin').onclick = () => {
    authMode = 'login';
    $('#authTitle').textContent = 'Sign In to insaysnap';
    $('#tabLogin').style.background = 'var(--panel2)';
    $('#tabRegister').style.background = 'transparent';
    $('#groupEmail').style.display = 'none';
    $('#groupDisplayName').style.display = 'none';
  };
  $('#tabRegister').onclick = () => {
    authMode = 'register';
    $('#authTitle').textContent = 'Create insaysnap Account';
    $('#tabRegister').style.background = 'var(--panel2)';
    $('#tabLogin').style.background = 'transparent';
    $('#groupEmail').style.display = 'flex';
    $('#groupDisplayName').style.display = 'flex';
  };

  $('#authForm').onsubmit = async (e) => {
    e.preventDefault();
    const username = $('#authUsername').value.trim();
    const password = $('#authPassword').value;
    const email = $('#authEmail').value.trim();
    const displayName = $('#authDisplayName').value.trim();

    try {
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = authMode === 'login' ? { username, password } : { username, password, email, displayName };
      const res = await api(endpoint, { method: 'POST', body: JSON.stringify(body) });

      if (res.token) localStorage.setItem('insaysnap_token', res.token);
      state.currentUser = res.user;
      updateUserUI();
      $('#authDialog').close();
      toast(`Welcome, ${res.user.displayName}! ⚡`);
    } catch (err) {
      $('#authError').textContent = err.message;
      $('#authError').style.display = 'block';
    }
  };

  $$('.close-dialog').forEach(b => b.onclick = () => b.closest('dialog').close());
  $$('.nav-btn[data-view]').forEach(btn => {
    btn.onclick = () => switchView(btn.dataset.view);
  });
  $('#storyFromCameraBtn').onclick = () => switchView('camera');

  function formatTimeAgo(ts) {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  checkAuth();
  initCamera();
})();
