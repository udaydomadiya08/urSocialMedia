'use strict';

/**
 * Insaycord — Client Application Engine
 * Pure Vanilla JavaScript — High performance, Zero external client frameworks
 */

(function () {
  let currentUser = null;
  let currentServerId = null;
  let currentChannelId = null;
  let activeVoiceChannelId = null;
  let ws = null;
  let isMuted = false;
  let isDeafened = false;
  let localMediaStream = null;
  let voiceInterval = null;

  // DOM Elements
  const dynamicServersList = document.getElementById('dynamicServersList');
  const currentServerName = document.getElementById('currentServerName');
  const textChannelsContainer = document.getElementById('textChannelsContainer');
  const voiceChannelsContainer = document.getElementById('voiceChannelsContainer');
  const membersContainer = document.getElementById('membersContainer');
  const messagesStream = document.getElementById('messagesStream');
  const messageForm = document.getElementById('messageForm');
  const messageInput = document.getElementById('messageInput');
  const messageSearch = document.getElementById('messageSearch');
  const typingIndicator = document.getElementById('typingIndicator');
  const activeChannelPrefix = document.getElementById('activeChannelPrefix');
  const activeChannelName = document.getElementById('activeChannelName');
  const activeChannelTopic = document.getElementById('activeChannelTopic');
  const chatInputArea = document.getElementById('chatInputArea');

  // User mini-bar
  const myAvatar = document.getElementById('myAvatar');
  const myDisplayName = document.getElementById('myDisplayName');
  const myUsername = document.getElementById('myUsername');
  const myStatusDot = document.getElementById('myStatusDot');
  const toggleMicBtn = document.getElementById('toggleMicBtn');
  const toggleDeafenBtn = document.getElementById('toggleDeafenBtn');
  const authTriggerBtn = document.getElementById('authTriggerBtn');

  // Voice stage
  const voiceStageOverlay = document.getElementById('voiceStageOverlay');
  const voiceRoomTitle = document.getElementById('voiceRoomTitle');
  const voiceParticipantsGrid = document.getElementById('voiceParticipantsGrid');
  const voiceMuteToggle = document.getElementById('voiceMuteToggle');
  const voiceDeafenToggle = document.getElementById('voiceDeafenToggle');
  const voiceDisconnectBtn = document.getElementById('voiceDisconnectBtn');

  // Dialogs
  const createServerDialog = document.getElementById('createServerDialog');
  const createServerForm = document.getElementById('createServerForm');
  const createChannelDialog = document.getElementById('createChannelDialog');
  const createChannelForm = document.getElementById('createChannelForm');
  const authDialog = document.getElementById('authDialog');
  const authForm = document.getElementById('authForm');
  const toastMsg = document.getElementById('toastMsg');

  function showToast(msg) {
    if (!toastMsg) return;
    toastMsg.textContent = msg;
    toastMsg.classList.add('show');
    setTimeout(() => toastMsg.classList.remove('show'), 3500);
  }

  // --- API HELPER ---
  async function api(path, options = {}) {
    const opts = {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    };
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
      opts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(path, opts);
    const data = await res.json().catch(() => ({ ok: false, error: 'Invalid JSON response' }));
    if (!res.ok && !data.error) {
      data.error = `HTTP error ${res.status}`;
    }
    return data;
  }

  // --- WEBSOCKET CLIENT ---
  function initWebSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${location.host}`);

    ws.onopen = () => {
      console.log('[Insaycord WS] Connected.');
      if (currentUser) {
        ws.send(JSON.stringify({
          type: 'auth',
          userId: currentUser.id,
          username: currentUser.username
        }));
      }
      if (currentChannelId) {
        ws.send(JSON.stringify({ type: 'join', room: currentChannelId }));
      }
    };

    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        handleWsEvent(data);
      } catch (e) {
        console.error('[WS Parse Error]', e);
      }
    };

    ws.onclose = () => {
      console.log('[Insaycord WS] Disconnected. Reconnecting in 3s...');
      setTimeout(initWebSocket, 3000);
    };
  }

  function handleWsEvent(data) {
    if (data.type === 'channel_message' && data.message) {
      if (data.message.channel_id === currentChannelId) {
        appendMessage(data.message);
        messagesStream.scrollTop = messagesStream.scrollHeight;
      }
    } else if (data.type === 'message_edited') {
      const el = document.getElementById(`msg-text-${data.messageId}`);
      if (el) {
        el.textContent = data.content;
        const parent = el.closest('.message-card');
        if (parent && !parent.querySelector('.edited-badge')) {
          const badge = document.createElement('small');
          badge.className = 'edited-badge';
          badge.style.color = 'var(--text-muted)';
          badge.style.fontSize = '10px';
          badge.style.marginLeft = '4px';
          badge.textContent = '(edited)';
          el.appendChild(badge);
        }
      }
    } else if (data.type === 'message_deleted') {
      const card = document.getElementById(`msg-card-${data.messageId}`);
      if (card) card.remove();
    } else if (data.type === 'typing') {
      if (data.channelId === currentChannelId && data.username !== currentUser?.username) {
        showTypingIndicator(data.username);
      }
    } else if (data.type === 'voice_state_update') {
      if (data.channelId === activeVoiceChannelId) {
        renderVoiceParticipants(data.participants || []);
      }
    }
  }

  let typingTimeout = null;
  function showTypingIndicator(username) {
    typingIndicator.textContent = `${username} is typing...`;
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      typingIndicator.textContent = '';
    }, 2500);
  }

  // --- INITIALIZATION ---
  async function init() {
    setupEventListeners();
    await checkAuth();
    if (!currentUser) {
      // Auto login with default demo account
      const loginRes = await api('/api/auth/login', {
        method: 'POST',
        body: { username: 'alex_architect', password: 'insaypass123' }
      });
      if (loginRes.ok) {
        currentUser = loginRes.user;
        updateUserUI();
      }
    }
    initWebSocket();
    await loadServers();
  }

  async function checkAuth() {
    try {
      const res = await api('/api/auth/me');
      if (res.ok && res.user) {
        currentUser = res.user;
        updateUserUI();
      }
    } catch (e) {
      console.warn('Auth check failed:', e);
    }
  }

  function updateUserUI() {
    if (currentUser) {
      myAvatar.src = currentUser.avatar_url || currentUser.avatarUrl || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="16" fill="%235865f2"/></svg>';
      myDisplayName.textContent = currentUser.display_name || currentUser.displayName || currentUser.username;
      myUsername.textContent = `@${currentUser.username}`;
      myStatusDot.className = `status-dot status-${currentUser.status || 'online'}`;
      authTriggerBtn.textContent = 'Logout';
    } else {
      myAvatar.src = '';
      myDisplayName.textContent = 'Guest';
      myUsername.textContent = 'Offline';
      authTriggerBtn.textContent = 'Auth';
    }
  }

  // --- SERVERS & CHANNELS ---
  async function loadServers() {
    if (!currentUser) return;
    const res = await api('/api/servers');
    if (res.ok && res.servers) {
      dynamicServersList.innerHTML = '';
      res.servers.forEach((srv, index) => {
        const pill = document.createElement('div');
        pill.className = `server-pill ${index === 0 ? 'active' : ''}`;
        pill.dataset.id = srv.id;
        pill.title = srv.name;
        // Initials
        const initials = srv.name.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase();
        pill.textContent = initials || 'SRV';
        pill.addEventListener('click', () => selectServer(srv.id, srv.name));
        dynamicServersList.appendChild(pill);
      });

      if (res.servers.length > 0) {
        selectServer(res.servers[0].id, res.servers[0].name);
      }
    }
  }

  async function selectServer(serverId, serverName) {
    currentServerId = serverId;
    currentServerName.textContent = serverName;

    // Highlight active pill
    document.querySelectorAll('.servers-rail .server-pill').forEach(p => {
      p.classList.toggle('active', p.dataset.id === serverId);
    });

    const res = await api(`/api/servers/${serverId}`);
    if (res.ok) {
      renderChannels(res.channels || []);
      renderMembers(res.members || []);

      // Auto-select first text channel
      const textChannels = (res.channels || []).filter(c => c.type === 'text');
      if (textChannels.length > 0) {
        selectChannel(textChannels[0].id, textChannels[0].name, textChannels[0].topic, 'text');
      }
    }
  }

  function renderChannels(channels) {
    textChannelsContainer.innerHTML = '';
    voiceChannelsContainer.innerHTML = '';

    channels.forEach(ch => {
      const item = document.createElement('div');
      item.className = 'channel-item';
      item.dataset.id = ch.id;
      item.innerHTML = `
        <span class="channel-icon">${ch.type === 'voice' ? '🔊' : '#'}</span>
        <span style="overflow:hidden;text-overflow:ellipsis">${ch.name}</span>
      `;
      item.addEventListener('click', () => {
        if (ch.type === 'voice') {
          joinVoiceChannel(ch.id, ch.name);
        } else {
          selectChannel(ch.id, ch.name, ch.topic, 'text');
        }
      });

      if (ch.type === 'voice') {
        voiceChannelsContainer.appendChild(item);
      } else {
        textChannelsContainer.appendChild(item);
      }
    });
  }

  function renderMembers(members) {
    membersContainer.innerHTML = '';
    members.forEach(m => {
      const item = document.createElement('div');
      item.className = 'member-item';
      const roleBadge = m.role === 'owner' ? '<span class="role-badge role-owner">OWNER</span>' :
                        m.role === 'admin' ? '<span class="role-badge role-admin">ADMIN</span>' :
                        m.role === 'moderator' ? '<span class="role-badge role-mod">MOD</span>' : '';
      item.innerHTML = `
        <div class="user-avatar-wrap">
          <img src="${m.avatar_url || 'data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"28\" height=\"28\"><circle cx=\"14\" cy=\"14\" r=\"14\" fill=\"%235865f2\"/></svg>'}" style="width:28px;height:28px;border-radius:50%">
          <span class="status-dot status-${m.status || 'offline'}"></span>
        </div>
        <div style="flex:1;min-width:0;display:flex;align-items:center;gap:6px">
          <span style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.display_name || m.username}</span>
          ${roleBadge}
        </div>
      `;
      membersContainer.appendChild(item);
    });
  }

  // --- TEXT CHANNEL & MESSAGING ---
  async function selectChannel(channelId, channelName, channelTopic, type) {
    if (activeVoiceChannelId && type === 'text') {
      voiceStageOverlay.style.display = 'none';
      messagesStream.style.display = 'flex';
      chatInputArea.style.display = 'block';
    }

    currentChannelId = channelId;
    activeChannelPrefix.textContent = '#';
    activeChannelName.textContent = channelName;
    activeChannelTopic.textContent = channelTopic || '';
    messageInput.placeholder = `Message #${channelName}...`;

    // Highlight channel
    document.querySelectorAll('.channel-item').forEach(el => {
      el.classList.toggle('active', el.dataset.id === channelId);
    });

    // Join room over WebSocket
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'join', room: channelId }));
    }

    // Load messages
    messagesStream.innerHTML = '<div style="color:var(--text-muted);padding:20px;text-align:center">Loading messages...</div>';
    const res = await api(`/api/channels/${channelId}/messages`);
    messagesStream.innerHTML = '';

    if (res.ok && res.messages) {
      if (res.messages.length === 0) {
        messagesStream.innerHTML = `
          <div style="padding:40px 20px;color:var(--text-muted)">
            <h2 style="color:white;font-size:24px;margin-bottom:8px">Welcome to #${channelName}!</h2>
            <p style="font-size:14px">This is the start of the #${channelName} channel.</p>
          </div>
        `;
      } else {
        res.messages.forEach(msg => appendMessage(msg));
        messagesStream.scrollTop = messagesStream.scrollHeight;
      }
    }
  }

  function appendMessage(msg) {
    const card = document.createElement('div');
    card.className = 'message-card';
    card.id = `msg-card-${msg.id}`;

    const date = new Date(msg.created_at);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isAuthor = currentUser && (currentUser.id === msg.sender_id || currentUser.username === msg.username);

    // Reactions HTML
    let reactionsHtml = '';
    if (msg.reactions && msg.reactions.length > 0) {
      reactionsHtml = `<div class="reactions-row">` +
        msg.reactions.map(r => `
          <button class="reaction-badge" data-msg-id="${msg.id}" data-emoji="${r.emoji}">
            <span>${r.emoji}</span> <span class="rx-count">${r.count}</span>
          </button>
        `).join('') + `</div>`;
    }

    card.innerHTML = `
      <img src="${msg.avatar_url || 'data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"40\" height=\"40\"><circle cx=\"20\" cy=\"20\" r=\"20\" fill=\"%235865f2\"/></svg>'}" class="msg-avatar" alt="">
      <div class="msg-content-wrap">
        <div class="msg-header">
          <span class="msg-author">${msg.display_name || msg.username}</span>
          <span class="msg-time">${timeStr}</span>
          ${msg.is_edited ? '<small style="color:var(--text-muted);font-size:10px">(edited)</small>' : ''}
        </div>
        <div class="msg-body" id="msg-text-${msg.id}">${msg.content}</div>
        ${msg.media_url ? `<img src="${msg.media_url}" style="max-width:320px;max-height:240px;border-radius:6px;margin-top:8px;object-fit:cover;display:block">` : ''}
        ${reactionsHtml}
      </div>
      <div class="msg-actions">
        <button class="msg-act-btn react-btn" data-id="${msg.id}" title="Add Reaction">👍</button>
        <button class="msg-act-btn react-btn" data-id="${msg.id}" data-emoji="❤️" title="Heart">❤️</button>
        <button class="msg-act-btn react-btn" data-id="${msg.id}" data-emoji="🔥" title="Fire">🔥</button>
        ${isAuthor ? `
          <button class="msg-act-btn edit-btn" data-id="${msg.id}" title="Edit Message">✏️</button>
          <button class="msg-act-btn del-btn" data-id="${msg.id}" title="Delete Message" style="color:var(--accent-red)">🗑️</button>
        ` : ''}
      </div>
    `;

    // Reaction clicks
    card.querySelectorAll('.react-btn, .reaction-badge').forEach(btn => {
      btn.addEventListener('click', async () => {
        const msgId = btn.dataset.id || btn.dataset.msgId;
        const emoji = btn.dataset.emoji || '👍';
        const rxRes = await api(`/api/messages/${msgId}/react`, {
          method: 'POST',
          body: { emoji }
        });
        if (rxRes.ok && rxRes.reactions) {
          msg.reactions = rxRes.reactions;
          let rxRow = card.querySelector('.reactions-row');
          if (!rxRow) {
            rxRow = document.createElement('div');
            rxRow.className = 'reactions-row';
            card.querySelector('.msg-content-wrap').appendChild(rxRow);
          }
          rxRow.innerHTML = rxRes.reactions.map(r => `
            <button class="reaction-badge" data-msg-id="${msgId}" data-emoji="${r.emoji}">
              <span>${r.emoji}</span> <span class="rx-count">${r.count}</span>
            </button>
          `).join('');
        }
      });
    });

    // Edit message
    const editBtn = card.querySelector('.edit-btn');
    if (editBtn) {
      editBtn.addEventListener('click', async () => {
        const textEl = document.getElementById(`msg-text-${msg.id}`);
        const currentText = textEl.textContent;
        const newText = prompt('Edit your message:', currentText);
        if (newText !== null && newText.trim() !== '' && newText.trim() !== currentText) {
          const editRes = await api(`/api/messages/${msg.id}`, {
            method: 'PATCH',
            body: { content: newText.trim() }
          });
          if (editRes.ok) {
            textEl.textContent = newText.trim();
          }
        }
      });
    }

    // Delete message
    const delBtn = card.querySelector('.del-btn');
    if (delBtn) {
      delBtn.addEventListener('click', async () => {
        if (confirm('Delete this message?')) {
          const delRes = await api(`/api/messages/${msg.id}`, { method: 'DELETE' });
          if (delRes.ok) {
            card.remove();
          }
        }
      });
    }

    messagesStream.appendChild(card);
  }

  // --- VOICE ROOM FUNCTIONALITY ---
  async function joinVoiceChannel(channelId, channelName) {
    activeVoiceChannelId = channelId;
    voiceRoomTitle.textContent = `🔊 ${channelName}`;

    // Switch view to Voice Stage
    messagesStream.style.display = 'none';
    chatInputArea.style.display = 'none';
    voiceStageOverlay.style.display = 'flex';
    activeChannelPrefix.textContent = '🔊';
    activeChannelName.textContent = channelName;
    activeChannelTopic.textContent = 'Voice connected — WebRTC audio relay';

    // Broadcast join via WebSocket
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'join', room: channelId }));
      ws.send(JSON.stringify({
        type: 'voice_join',
        channelId,
        muted: isMuted,
        deafened: isDeafened
      }));
    }

    // Request local audio if available
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        localMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
      }
    } catch (e) {
      console.log('[Voice Audio Notice] Standard microphone stream simulated/optional');
    }

    // Fetch existing room participants
    const res = await api(`/api/voice/rooms/${channelId}`);
    if (res.ok) {
      let parts = res.participants || [];
      if (!parts.some(p => p.userId === currentUser.id)) {
        parts.push({
          userId: currentUser.id,
          username: currentUser.username,
          displayName: currentUser.display_name || currentUser.displayName || currentUser.username,
          muted: isMuted,
          deafened: isDeafened
        });
      }
      renderVoiceParticipants(parts);
    }

    startSpeakingSimulation();
    showToast(`Connected to voice channel: ${channelName}`);
  }

  function leaveVoiceChannel() {
    if (!activeVoiceChannelId) return;

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'voice_leave',
        channelId: activeVoiceChannelId
      }));
    }

    if (localMediaStream) {
      localMediaStream.getTracks().forEach(t => t.stop());
      localMediaStream = null;
    }

    clearInterval(voiceInterval);
    activeVoiceChannelId = null;

    voiceStageOverlay.style.display = 'none';
    messagesStream.style.display = 'flex';
    chatInputArea.style.display = 'block';

    showToast('Disconnected from voice channel.');
  }

  function renderVoiceParticipants(participants) {
    voiceParticipantsGrid.innerHTML = '';
    participants.forEach(p => {
      const card = document.createElement('div');
      card.className = 'voice-participant-card';
      card.id = `voice-user-${p.userId}`;

      const avatar = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><circle cx="40" cy="40" r="40" fill="%235865f2"/><text x="40" y="50" font-size="32" font-family="sans-serif" font-weight="bold" fill="white" text-anchor="middle">${(p.username || 'U').slice(0, 2).toUpperCase()}</text></svg>`;

      card.innerHTML = `
        <div class="voice-avatar-wrap">
          <img src="${p.avatarUrl || avatar}" style="width:72px;height:72px;border-radius:50%;object-fit:cover">
        </div>
        <div style="font-weight:700;font-size:14px;color:white">${p.displayName || p.username}</div>
        <div class="voice-status-badges">
          ${p.muted ? '<span class="voice-badge badge-mute">MUTED</span>' : '<span class="voice-badge badge-live">LIVE</span>'}
          ${p.deafened ? '<span class="voice-badge badge-deafen">DEAF</span>' : ''}
        </div>
      `;
      voiceParticipantsGrid.appendChild(card);
    });
  }

  function startSpeakingSimulation() {
    clearInterval(voiceInterval);
    voiceInterval = setInterval(() => {
      const wraps = document.querySelectorAll('.voice-avatar-wrap');
      wraps.forEach(w => {
        if (!isMuted && Math.random() > 0.4) {
          w.classList.add('speaking');
        } else {
          w.classList.remove('speaking');
        }
      });
    }, 1200);
  }

  // --- EVENT LISTENERS ---
  function setupEventListeners() {
    // Send Message
    messageForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const content = messageInput.value.trim();
      if (!content || !currentChannelId) return;

      messageInput.value = '';
      const res = await api(`/api/channels/${currentChannelId}/messages`, {
        method: 'POST',
        body: { content }
      });

      if (!res.ok) {
        showToast(res.error || 'Failed to send message');
      }
    });

    // Typing Event
    let lastTypingSent = 0;
    messageInput.addEventListener('input', () => {
      const now = Date.now();
      if (now - lastTypingSent > 2000 && ws && ws.readyState === WebSocket.OPEN && currentChannelId) {
        lastTypingSent = now;
        ws.send(JSON.stringify({
          type: 'typing',
          room: currentChannelId,
          channelId: currentChannelId,
          username: currentUser?.username || 'Guest'
        }));
      }
    });

    // Search Messages Filter
    if (messageSearch) {
      messageSearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        document.querySelectorAll('.message-card').forEach(card => {
          const text = card.querySelector('.msg-body')?.textContent.toLowerCase() || '';
          const author = card.querySelector('.msg-author')?.textContent.toLowerCase() || '';
          if (query === '' || text.includes(query) || author.includes(query)) {
            card.style.display = 'flex';
          } else {
            card.style.display = 'none';
          }
        });
      });
    }

    // Toggle Mic
    const toggleMic = () => {
      isMuted = !isMuted;
      toggleMicBtn.textContent = isMuted ? '🔇' : '🎤';
      voiceMuteToggle.textContent = isMuted ? '🔇' : '🎤';
      if (activeVoiceChannelId && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'voice_join',
          channelId: activeVoiceChannelId,
          muted: isMuted,
          deafened: isDeafened
        }));
      }
      showToast(isMuted ? 'Microphone muted' : 'Microphone unmuted');
    };
    toggleMicBtn.addEventListener('click', toggleMic);
    voiceMuteToggle.addEventListener('click', toggleMic);

    // Toggle Deafen
    const toggleDeafen = () => {
      isDeafened = !isDeafened;
      toggleDeafenBtn.textContent = isDeafened ? '🔕' : '🎧';
      voiceDeafenToggle.textContent = isDeafened ? '🔕' : '🎧';
      if (activeVoiceChannelId && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'voice_join',
          channelId: activeVoiceChannelId,
          muted: isMuted,
          deafened: isDeafened
        }));
      }
      showToast(isDeafened ? 'Deafened' : 'Undeafened');
    };
    toggleDeafenBtn.addEventListener('click', toggleDeafen);
    voiceDeafenToggle.addEventListener('click', toggleDeafen);

    // Voice Disconnect
    voiceDisconnectBtn.addEventListener('click', leaveVoiceChannel);

    // Add Server Dialog
    const addServerBtn = document.getElementById('addServerBtn');
    addServerBtn.addEventListener('click', () => createServerDialog.showModal());

    createServerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('serverNameInput').value.trim();
      const description = document.getElementById('serverDescInput').value.trim();

      const res = await api('/api/servers', {
        method: 'POST',
        body: { name, description }
      });

      if (res.ok) {
        createServerDialog.close();
        createServerForm.reset();
        await loadServers();
        selectServer(res.serverId, name);
        showToast(`Server "${name}" created!`);
      } else {
        showToast(res.error || 'Failed to create server');
      }
    });

    // Add Channel Dialog
    const addChannelBtn = document.getElementById('addChannelBtn');
    addChannelBtn.addEventListener('click', () => {
      if (!currentServerId) return;
      createChannelDialog.showModal();
    });

    createChannelForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('channelNameInput').value.trim().toLowerCase().replace(/\s+/g, '-');
      const type = document.getElementById('channelTypeInput').value;

      const res = await api(`/api/servers/${currentServerId}/channels`, {
        method: 'POST',
        body: { name, type }
      });

      if (res.ok) {
        createChannelDialog.close();
        createChannelForm.reset();
        await selectServer(currentServerId, currentServerName.textContent);
        showToast(`Channel #${name} created!`);
      } else {
        showToast(res.error || 'Failed to create channel');
      }
    });

    // Close Modals
    document.querySelectorAll('.close-dialog').forEach(btn => {
      btn.addEventListener('click', () => {
        createServerDialog.close();
        createChannelDialog.close();
        authDialog.close();
      });
    });

    // Auth Dialog & Tabs
    let isRegisterMode = false;
    authTriggerBtn.addEventListener('click', async () => {
      if (currentUser) {
        await api('/api/auth/logout', { method: 'POST' });
        currentUser = null;
        updateUserUI();
        showToast('Logged out.');
        authDialog.showModal();
      } else {
        authDialog.showModal();
      }
    });

    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');
    const groupEmail = document.getElementById('groupEmail');
    const groupDisplayName = document.getElementById('groupDisplayName');
    const authTitle = document.getElementById('authTitle');

    tabLogin.addEventListener('click', () => {
      isRegisterMode = false;
      tabLogin.style.background = '#2b2d31';
      tabRegister.style.background = 'transparent';
      groupEmail.style.display = 'none';
      groupDisplayName.style.display = 'none';
      authTitle.textContent = 'Welcome back!';
    });

    tabRegister.addEventListener('click', () => {
      isRegisterMode = true;
      tabRegister.style.background = '#2b2d31';
      tabLogin.style.background = 'transparent';
      groupEmail.style.display = 'block';
      groupDisplayName.style.display = 'block';
      authTitle.textContent = 'Create an account';
    });

    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('authUsername').value.trim();
      const password = document.getElementById('authPassword').value;
      const email = document.getElementById('authEmail').value.trim();
      const displayName = document.getElementById('authDisplayName').value.trim();

      const endpoint = isRegisterMode ? '/api/auth/register' : '/api/auth/login';
      const payload = isRegisterMode ? { username, password, email, displayName } : { username, password };

      const res = await api(endpoint, { method: 'POST', body: payload });
      if (res.ok) {
        currentUser = res.user;
        updateUserUI();
        authDialog.close();
        initWebSocket();
        await loadServers();
        showToast(`Welcome, ${currentUser.displayName || currentUser.username}!`);
      } else {
        const authError = document.getElementById('authError');
        authError.textContent = res.error || 'Authentication failed';
        authError.style.display = 'block';
      }
    });
  }

  // Run on DOM loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
