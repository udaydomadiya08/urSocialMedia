'use strict';

/**
 * Insaybook — Frontend Client Application
 * Full community social platform with groups, marketplace, events, and friends.
 */

(() => {
  const state = {
    currentUser: null,
    activeView: 'feed',
    activeChatUser: null,
    feedPosts: [],
    groups: [],
    events: [],
    marketplaceItems: [],
    friends: [],
    pendingRequests: []
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
    const token = localStorage.getItem('insaybook_token');
    const headers = { ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const res = await fetch(path, { ...options, headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Server error');
      return data;
    } catch (err) {
      console.error('API Error:', err);
      throw err;
    }
  }

  // Navigation
  function switchView(viewName) {
    state.activeView = viewName;
    $$('.nav-btn').forEach(b => b.classList.remove('active'));
    const btn = $(`[data-view="${viewName}"]`);
    if (btn) btn.classList.add('active');

    $('#viewFeed').style.display = viewName === 'feed' ? 'block' : 'none';
    $('#viewFriends').style.display = viewName === 'friends' ? 'block' : 'none';
    $('#viewGroups').style.display = viewName === 'groups' ? 'block' : 'none';
    $('#viewEvents').style.display = viewName === 'events' ? 'block' : 'none';
    $('#viewMarketplace').style.display = viewName === 'marketplace' ? 'block' : 'none';
    $('#viewMessenger').style.display = viewName === 'messenger' ? 'block' : 'none';
    $('#viewProfile').style.display = viewName === 'profile' ? 'block' : 'none';

    if (viewName === 'feed') loadFeed();
    if (viewName === 'friends') loadFriends();
    if (viewName === 'groups') loadGroups();
    if (viewName === 'events') loadEvents();
    if (viewName === 'marketplace') loadMarketplace();
    if (viewName === 'messenger') loadMessengerConversations();
    if (viewName === 'profile') loadProfile(state.currentUser ? state.currentUser.username : 'ashapatel');
  }

  // Auth
  async function checkAuth() {
    try {
      const res = await api('/api/auth/me');
      state.currentUser = res.user;
      if (res.pendingFriends > 0) {
        $('#pendingFriendsBadge').textContent = res.pendingFriends;
        $('#pendingFriendsBadge').style.display = 'inline-block';
        $('#requestsCount').textContent = res.pendingFriends;
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
      $('#sidebarRole').textContent = `@${user.username}`;
      $('#sidebarAvatar').src = user.avatarUrl;
      $('#composerAvatar').src = user.avatarUrl;
      $('#authBtn').textContent = 'Profile';
      $('#authBtn').onclick = () => switchView('profile');
    } else {
      $('#sidebarUsername').textContent = 'Guest Explorer';
      $('#sidebarRole').textContent = 'Local Community';
      $('#authBtn').textContent = 'Sign In';
      $('#authBtn').onclick = () => $('#authDialog').showModal();
    }
  }

  // Feed
  async function loadFeed(filter = 'recent', groupId = null) {
    const stream = $('#postsStream');
    try {
      const search = $('#globalSearch').value.trim();
      let query = `?filter=${filter}`;
      if (groupId) query += `&groupId=${groupId}`;
      if (search) query += `&search=${encodeURIComponent(search)}`;

      const res = await api(`/api/feed${query}`);
      state.feedPosts = res.posts || [];

      if (state.feedPosts.length === 0) {
        stream.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">No community posts found. Be the first to post!</div>';
        return;
      }

      stream.innerHTML = state.feedPosts.map(p => renderPostCard(p)).join('');
      attachFeedEvents(stream);
      loadSidebarWidgets();
    } catch (err) {
      stream.innerHTML = `<div style="color:#f43f5e;padding:30px">Error loading feed: ${err.message}</div>`;
    }
  }

  function renderPostCard(p) {
    const timeAgo = formatTimeAgo(p.created_at);
    const reactions = p.reactions || {};
    const reactionEmojis = { like: '👍', love: '❤️', haha: '😂', wow: '😮', sad: '😢', angry: '😡' };

    return `
      <article class="post-card" id="post-${p.id}" data-id="${p.id}">
        <div class="post-header">
          <div class="post-author" style="cursor:pointer" onclick="window.viewUserProfile('${p.username}')">
            <img class="user-avatar-sm" src="${p.avatar_url}" alt="">
            <div class="post-meta">
              <b>${p.display_name} ${p.group_name ? `<span class="group-badge">▸ ${p.group_name}</span>` : ''}</b>
              <small>${timeAgo} • ${p.audience === 'public' ? '🌐 Public' : '👥 Friends'}</small>
            </div>
          </div>
          <button class="btn-outline" style="padding:4px 8px;font-size:12px" onclick="window.reportContent('post', '${p.id}')">···</button>
        </div>

        <div class="post-content">${p.content}</div>

        ${p.media_url ? `
          <div class="post-media">
            <img src="${p.media_url}" alt="Post Media">
          </div>
        ` : ''}

        <div class="post-stats-row">
          <span>${p.reaction_count > 0 ? `👍❤️ ${p.reaction_count} Reactions` : 'Be the first to react'}</span>
          <span>${p.comment_count} Comments</span>
        </div>

        <div class="post-buttons">
          <div class="react-btn-container">
            <button class="react-btn ${p.my_reaction ? 'reacted' : ''}" data-action="quick-react">
              ${p.my_reaction ? reactionEmojis[p.my_reaction] + ' ' + capitalize(p.my_reaction) : '👍 Like'}
            </button>
            <div class="reaction-palette">
              <span class="reaction-emoji" data-react="like">👍</span>
              <span class="reaction-emoji" data-react="love">❤️</span>
              <span class="reaction-emoji" data-react="haha">😂</span>
              <span class="reaction-emoji" data-react="wow">😮</span>
              <span class="reaction-emoji" data-react="sad">😢</span>
              <span class="reaction-emoji" data-react="angry">😡</span>
            </div>
          </div>
          <button class="react-btn" data-action="toggle-comments">💬 Comment</button>
          <button class="react-btn" data-action="share-post">↗ Share</button>
        </div>

        <div class="comments-section" style="display:none" id="comments-${p.id}">
          <div class="comments-list" id="comments-list-${p.id}"></div>
          <div style="display:flex;gap:10px;margin-top:10px">
            <input type="text" placeholder="Write a comment..." class="form-input comment-input" style="flex:1">
            <button type="button" class="btn-primary" data-action="post-comment" style="padding:8px 14px">Send</button>
          </div>
        </div>
      </article>
    `;
  }

  function attachFeedEvents(container) {
    container.querySelectorAll('.post-card').forEach(card => {
      const postId = card.dataset.id;

      // Reactions Palette Click
      card.querySelectorAll('.reaction-emoji').forEach(emoji => {
        emoji.onclick = async () => {
          if (!state.currentUser) return $('#authDialog').showModal();
          const reaction = emoji.dataset.react;
          try {
            await api(`/api/posts/${postId}/react`, {
              method: 'POST',
              body: JSON.stringify({ reaction })
            });
            loadFeed();
          } catch (err) { toast(err.message); }
        };
      });

      // Quick Like Click
      const quickReact = card.querySelector('[data-action="quick-react"]');
      if (quickReact) {
        quickReact.onclick = async () => {
          if (!state.currentUser) return $('#authDialog').showModal();
          try {
            await api(`/api/posts/${postId}/react`, {
              method: 'POST',
              body: JSON.stringify({ reaction: 'like' })
            });
            loadFeed();
          } catch (err) { toast(err.message); }
        };
      }

      // Toggle Comments
      const commentBtn = card.querySelector('[data-action="toggle-comments"]');
      const commentsSection = card.querySelector(`#comments-${postId}`);
      const commentsList = card.querySelector(`#comments-list-${postId}`);
      if (commentBtn && commentsSection) {
        commentBtn.onclick = async () => {
          if (commentsSection.style.display === 'none') {
            commentsSection.style.display = 'block';
            const res = await api(`/api/posts/${postId}/comments`);
            commentsList.innerHTML = res.comments.map(c => `
              <div class="comment-bubble">
                <b>${c.display_name} (@${c.username})</b>
                ${c.text}
              </div>
            `).join('') || '<div style="color:var(--muted);font-size:12px;margin-bottom:8px">No comments yet.</div>';
          } else {
            commentsSection.style.display = 'none';
          }
        };
      }

      // Submit Comment
      const commentInput = card.querySelector('.comment-input');
      const submitCommentBtn = card.querySelector('[data-action="post-comment"]');
      if (commentInput && submitCommentBtn) {
        const send = async () => {
          const text = commentInput.value.trim();
          if (!text) return;
          if (!state.currentUser) return $('#authDialog').showModal();
          try {
            const res = await api(`/api/posts/${postId}/comments`, {
              method: 'POST',
              body: JSON.stringify({ text })
            });
            commentInput.value = '';
            commentsList.insertAdjacentHTML('beforeend', `
              <div class="comment-bubble">
                <b>${res.comment.displayName} (@${res.comment.username})</b>
                ${res.comment.text}
              </div>
            `);
            toast('Comment added');
          } catch (err) { toast(err.message); }
        };
        submitCommentBtn.onclick = send;
        commentInput.onkeydown = (e) => { if (e.key === 'Enter') send(); };
      }

      // Share post
      const shareBtn = card.querySelector('[data-action="share-post"]');
      if (shareBtn) {
        shareBtn.onclick = () => {
          navigator.clipboard.writeText(`${location.origin}/#post-${postId}`);
          toast('Post permalink copied!');
        };
      }
    });
  }

  // Friends Hub
  async function loadFriends() {
    if (!state.currentUser) return $('#authDialog').showModal();
    try {
      const res = await api('/api/friends');
      state.friends = res.friends || [];
      state.pendingRequests = res.incomingRequests || [];

      // Pending
      const pendingGrid = $('#pendingFriendsGrid');
      if (state.pendingRequests.length === 0) {
        pendingGrid.innerHTML = '<div style="color:var(--muted)">No pending requests.</div>';
      } else {
        pendingGrid.innerHTML = state.pendingRequests.map(r => `
          <div class="community-card" style="display:flex;align-items:center;justify-content:space-between">
            <div style="display:flex;align-items:center;gap:12px">
              <img class="user-avatar-sm" src="${r.avatar_url}" alt="">
              <div>
                <b>${r.display_name}</b>
                <small style="display:block;color:var(--muted)">@${r.username}</small>
              </div>
            </div>
            <div style="display:flex;gap:8px">
              <button class="btn-primary" style="padding:6px 12px;font-size:12px" onclick="window.respondFriend('${r.id}', 'accept')">Accept</button>
              <button class="btn-outline" style="padding:6px 12px;font-size:12px" onclick="window.respondFriend('${r.id}', 'decline')">Decline</button>
            </div>
          </div>
        `).join('');
      }

      // Friends
      const friendsGrid = $('#friendsGrid');
      if (state.friends.length === 0) {
        friendsGrid.innerHTML = '<div style="color:var(--muted)">No friends added yet. Connect with neighbors!</div>';
      } else {
        friendsGrid.innerHTML = state.friends.map(f => `
          <div class="community-card" style="display:flex;align-items:center;justify-content:space-between">
            <div style="display:flex;align-items:center;gap:12px;cursor:pointer" onclick="window.viewUserProfile('${f.username}')">
              <img class="user-avatar-sm" src="${f.avatar_url}" alt="">
              <div>
                <b>${f.display_name}</b>
                <small style="display:block;color:var(--muted)">${f.hometown || 'Community Member'}</small>
              </div>
            </div>
            <button class="btn-outline" style="padding:6px 12px;font-size:12px" onclick="window.openMessenger('${f.id}', '${f.display_name}')">Message</button>
          </div>
        `).join('');
      }
    } catch (err) { toast(err.message); }
  }

  window.respondFriend = async (requesterId, action) => {
    try {
      await api(`/api/friends/respond/${requesterId}`, {
        method: 'POST',
        body: JSON.stringify({ action })
      });
      toast(`Friend request ${action}ed`);
      loadFriends();
      checkAuth();
    } catch (err) { toast(err.message); }
  };

  // Groups Hub
  async function loadGroups() {
    try {
      const res = await api('/api/groups');
      state.groups = res.groups || [];
      const grid = $('#groupsGrid');

      // Populate group select in composer
      const select = $('#postGroupSelect');
      select.innerHTML = '<option value="">Personal Timeline</option>' + state.groups.map(g => `
        <option value="${g.id}">${g.name}</option>
      `).join('');

      grid.innerHTML = state.groups.map(g => `
        <div class="community-card">
          <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px">
            <div>
              <h3 style="font:700 18px 'Plus Jakarta Sans';margin-bottom:4px">${g.name}</h3>
              <small style="color:var(--muted)">👥 ${g.member_count} Members • ${capitalize(g.privacy)} Group</small>
            </div>
            <button class="btn-outline" style="padding:6px 14px;font-size:12px" onclick="window.toggleGroupMembership('${g.id}', ${Boolean(g.my_role)})">
              ${g.my_role ? 'Joined' : 'Join'}
            </button>
          </div>
          <p style="font-size:13px;color:#cbd5e1;line-height:1.6;margin-bottom:14px">${g.description}</p>
          <button class="btn-outline" style="width:100%" onclick="window.filterByGroup('${g.id}')">View Group Feed</button>
        </div>
      `).join('');
    } catch (err) { toast(err.message); }
  }

  window.toggleGroupMembership = async (groupId, isMember) => {
    if (!state.currentUser) return $('#authDialog').showModal();
    const endpoint = isMember ? `/api/groups/${groupId}/leave` : `/api/groups/${groupId}/join`;
    try {
      await api(endpoint, { method: 'POST' });
      toast(isMember ? 'Left group' : 'Joined group!');
      loadGroups();
    } catch (err) { toast(err.message); }
  };

  window.filterByGroup = (groupId) => {
    switchView('feed');
    loadFeed('recent', groupId);
  };

  // Events Hub
  async function loadEvents() {
    try {
      const res = await api('/api/events');
      state.events = res.events || [];
      const grid = $('#eventsGrid');

      grid.innerHTML = state.events.map(ev => {
        const dateStr = new Date(ev.event_date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
        return `
          <div class="community-card">
            <small style="color:var(--accent-cyan);font-weight:700;display:block;margin-bottom:6px">📅 ${dateStr}</small>
            <h3 style="font:700 18px 'Plus Jakarta Sans';margin-bottom:8px">${ev.title}</h3>
            <p style="font-size:13px;color:var(--muted);margin-bottom:6px">📍 ${ev.location}</p>
            <p style="font-size:13px;color:#cbd5e1;line-height:1.5;margin-bottom:16px">${ev.description}</p>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <small style="color:var(--muted)">${ev.going_count} Going</small>
              <div style="display:flex;gap:6px">
                <button class="btn-primary" style="padding:6px 12px;font-size:12px;${ev.my_rsvp === 'going' ? 'opacity:0.8' : ''}" onclick="window.rsvpEvent('${ev.id}', 'going')">
                  ${ev.my_rsvp === 'going' ? '✓ Going' : 'Going'}
                </button>
                <button class="btn-outline" style="padding:6px 12px;font-size:12px" onclick="window.rsvpEvent('${ev.id}', 'interested')">
                  Interested
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) { toast(err.message); }
  }

  window.rsvpEvent = async (eventId, status) => {
    if (!state.currentUser) return $('#authDialog').showModal();
    try {
      await api(`/api/events/${eventId}/rsvp`, {
        method: 'POST',
        body: JSON.stringify({ status })
      });
      toast(`RSVP updated: ${status}`);
      loadEvents();
    } catch (err) { toast(err.message); }
  };

  // Marketplace
  async function loadMarketplace() {
    try {
      const res = await api('/api/marketplace');
      state.marketplaceItems = res.items || [];
      const grid = $('#marketplaceGrid');

      grid.innerHTML = state.marketplaceItems.map(item => `
        <div class="item-card">
          <img class="item-image" src="${item.image_url}" alt="">
          <div class="item-details">
            <div class="item-price">$${item.price.toFixed(2)}</div>
            <div class="item-title">${item.title}</div>
            <p style="font-size:12px;color:#94a3b8;margin-bottom:12px">${item.description}</p>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:auto">
              <small class="item-location">📍 ${item.location}</small>
              <button class="btn-outline" style="padding:4px 10px;font-size:11px" onclick="window.openMessenger('${item.seller_id}', '${item.seller_name}')">Message Seller</button>
            </div>
          </div>
        </div>
      `).join('') || '<div style="color:var(--muted)">No items currently listed.</div>';
    } catch (err) { toast(err.message); }
  }

  // Messenger
  async function loadMessengerConversations() {
    if (!state.currentUser) return $('#authDialog').showModal();
    try {
      const res = await api('/api/messenger/conversations');
      const list = $('#messengerConvList');

      list.innerHTML = res.conversations.map(c => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;cursor:pointer" onclick="window.openMessenger('${c.user.id}', '${c.user.display_name}')">
          <img class="user-avatar-sm" src="${c.user.avatar_url}" alt="">
          <div>
            <b>${c.user.display_name}</b>
            <small style="display:block;color:var(--muted)">${c.lastMessage || 'Chat'}</small>
          </div>
        </div>
      `).join('') || '<div style="color:var(--muted);font-size:12px">No active chats.</div>';
    } catch (err) { toast(err.message); }
  }

  window.openMessenger = async (userId, displayName) => {
    switchView('messenger');
    state.activeChatUser = { id: userId, displayName };
    $('#messengerHeader').textContent = `Chat with ${displayName}`;
    $('#messengerForm').style.display = 'flex';

    try {
      const res = await api(`/api/messenger/${userId}`);
      const container = $('#messengerMessages');
      container.innerHTML = res.messages.map(m => `
        <div style="align-self:${m.sender_id === state.currentUser.id ? 'flex-end' : 'flex-start'};background:${m.sender_id === state.currentUser.id ? 'var(--accent)' : 'var(--panel2)'};padding:8px 14px;border-radius:14px;max-width:70%;font-size:13px">
          ${m.text}
        </div>
      `).join('');
      container.scrollTop = container.scrollHeight;
    } catch (err) { toast(err.message); }
  };

  $('#messengerForm').onsubmit = async (e) => {
    e.preventDefault();
    if (!state.activeChatUser) return;
    const input = $('#messengerInput');
    const text = input.value.trim();
    if (!text) return;

    try {
      await api(`/api/messenger/${state.activeChatUser.id}`, {
        method: 'POST',
        body: JSON.stringify({ text })
      });
      input.value = '';
      const container = $('#messengerMessages');
      container.insertAdjacentHTML('beforeend', `
        <div style="align-self:flex-end;background:var(--accent);padding:8px 14px;border-radius:14px;max-width:70%;font-size:13px">
          ${text}
        </div>
      `);
      container.scrollTop = container.scrollHeight;
    } catch (err) { toast(err.message); }
  };

  // Sidebar Widgets
  async function loadSidebarWidgets() {
    try {
      const resFriends = await api('/api/friends');
      const reqEl = $('#requestsWidget');
      if (resFriends.incomingRequests && resFriends.incomingRequests.length > 0) {
        reqEl.innerHTML = resFriends.incomingRequests.map(r => `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <span style="font-size:13px;font-weight:600">${r.display_name}</span>
            <button class="btn-primary" style="padding:4px 8px;font-size:11px" onclick="window.respondFriend('${r.id}', 'accept')">Confirm</button>
          </div>
        `).join('');
      } else {
        reqEl.innerHTML = '<div style="font-size:12px;color:var(--muted)">No pending requests.</div>';
      }

      const resEvents = await api('/api/events');
      const evEl = $('#upcomingEventsWidget');
      if (resEvents.events && resEvents.events.length > 0) {
        evEl.innerHTML = resEvents.events.slice(0, 2).map(ev => `
          <div style="margin-bottom:10px">
            <b style="font-size:13px;display:block">${ev.title}</b>
            <small style="color:var(--muted)">📍 ${ev.location}</small>
          </div>
        `).join('');
      } else {
        evEl.innerHTML = '<div style="font-size:12px;color:var(--muted)">No upcoming events.</div>';
      }
    } catch {}
  }

  // Profile View
  async function loadProfile(username) {
    try {
      const res = await api(`/api/users/${username}`);
      const u = res.user;
      $('#profileAvatar').src = u.avatar_url;
      $('#profileDisplayName').textContent = u.display_name;
      $('#profileUsername').textContent = `@${u.username}`;
      $('#profileBio').textContent = u.bio || 'Community member.';
      $('#profileHometown').textContent = `📍 ${u.hometown || 'Earth'}`;
      $('#profileOccupation').textContent = `💼 ${u.occupation || 'Explorer'}`;
      $('#profileFriendCount').textContent = `👥 ${res.friendCount} Friends`;

      const feed = $('#profileFeed');
      feed.innerHTML = res.posts.map(p => `
        <article class="post-card">
          <p style="font-size:14px;line-height:1.6">${p.content}</p>
          <small style="color:var(--muted);display:block;margin-top:10px">${formatTimeAgo(p.created_at)}</small>
        </article>
      `).join('') || '<div style="color:var(--muted)">No timeline updates yet.</div>';
    } catch (err) { toast(err.message); }
  }

  window.viewUserProfile = (username) => {
    switchView('profile');
    loadProfile(username);
  };

  // Compose Post Event
  $('#composeForm').onsubmit = async (e) => {
    e.preventDefault();
    if (!state.currentUser) return $('#authDialog').showModal();

    const content = $('#postContentInput').value.trim();
    const audience = $('#postAudience').value;
    const groupId = $('#postGroupSelect').value || null;
    const fileInput = $('#postMediaFile');

    $('#submitPostBtn').disabled = true;

    try {
      let mediaUrl = '';
      if (fileInput.files.length > 0) {
        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        const uploadRes = await api('/api/upload', { method: 'POST', body: formData });
        if (uploadRes.files && uploadRes.files.length > 0) {
          mediaUrl = uploadRes.files[0].url;
        }
      }

      await api('/api/posts', {
        method: 'POST',
        body: JSON.stringify({ content, audience, groupId, mediaUrl })
      });

      $('#composeDialog').close();
      $('#composeForm').reset();
      toast('Post published to community!');
      loadFeed();
    } catch (err) { toast(err.message); }
    finally { $('#submitPostBtn').disabled = false; }
  };

  // Group Create Event
  $('#createGroupForm').onsubmit = async (e) => {
    e.preventDefault();
    if (!state.currentUser) return $('#authDialog').showModal();

    const name = $('#groupNameInput').value.trim();
    const description = $('#groupDescInput').value.trim();
    const privacy = $('#groupPrivacyInput').value;

    try {
      await api('/api/groups', {
        method: 'POST',
        body: JSON.stringify({ name, description, privacy })
      });
      $('#createGroupDialog').close();
      $('#createGroupForm').reset();
      toast('Community Group created!');
      loadGroups();
    } catch (err) { toast(err.message); }
  };

  // Event Create Event
  $('#createEventForm').onsubmit = async (e) => {
    e.preventDefault();
    if (!state.currentUser) return $('#authDialog').showModal();

    const title = $('#eventTitleInput').value.trim();
    const location = $('#eventLocationInput').value.trim();
    const eventDate = $('#eventDateInput').value;
    const description = $('#eventDescInput').value.trim();

    try {
      await api('/api/events', {
        method: 'POST',
        body: JSON.stringify({ title, location, eventDate, description })
      });
      $('#createEventDialog').close();
      $('#createEventForm').reset();
      toast('Community Event scheduled!');
      loadEvents();
    } catch (err) { toast(err.message); }
  };

  // Marketplace Item Create
  $('#createItemForm').onsubmit = async (e) => {
    e.preventDefault();
    if (!state.currentUser) return $('#authDialog').showModal();

    const title = $('#itemTitleInput').value.trim();
    const price = parseFloat($('#itemPriceInput').value);
    const category = $('#itemCategoryInput').value;
    const location = $('#itemLocationInput').value.trim();
    const description = $('#itemDescInput').value.trim();
    const photoFile = $('#itemPhotoFile');

    try {
      let imageUrl = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="%23334155"/><text x="200" y="160" font-size="24" fill="white" text-anchor="middle">Marketplace Item</text></svg>';
      if (photoFile.files.length > 0) {
        const formData = new FormData();
        formData.append('file', photoFile.files[0]);
        const uploadRes = await api('/api/upload', { method: 'POST', body: formData });
        if (uploadRes.files && uploadRes.files.length > 0) {
          imageUrl = uploadRes.files[0].url;
        }
      }

      await api('/api/marketplace', {
        method: 'POST',
        body: JSON.stringify({ title, price, category, location, description, imageUrl })
      });

      $('#createItemDialog').close();
      $('#createItemForm').reset();
      toast('Item listed on Marketplace!');
      loadMarketplace();
    } catch (err) { toast(err.message); }
  };

  // Auth Dialog Controls
  let authMode = 'login';
  $('#tabLogin').onclick = () => {
    authMode = 'login';
    $('#authTitle').textContent = 'Sign In to insaybook';
    $('#tabLogin').style.background = 'var(--panel2)';
    $('#tabRegister').style.background = 'transparent';
    $('#groupEmail').style.display = 'none';
    $('#groupDisplayName').style.display = 'none';
  };
  $('#tabRegister').onclick = () => {
    authMode = 'register';
    $('#authTitle').textContent = 'Join the insaybook Community';
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

      if (res.token) localStorage.setItem('insaybook_token', res.token);
      state.currentUser = res.user;
      updateUserUI();
      $('#authDialog').close();
      toast(`Welcome, ${res.user.displayName}!`);
      loadFeed();
    } catch (err) {
      $('#authError').textContent = err.message;
      $('#authError').style.display = 'block';
    }
  };

  $('#logoutTrigger').onclick = async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
    localStorage.removeItem('insaybook_token');
    state.currentUser = null;
    updateUserUI();
    toast('Logged out');
    switchView('feed');
  };

  // Modals Toggles
  $$('.close-dialog').forEach(b => b.onclick = () => b.closest('dialog').close());
  $('#openComposerBtn').onclick = () => $('#composeDialog').showModal();
  $('#composerTrigger').onclick = () => $('#composeDialog').showModal();
  $('#toolPhoto').onclick = () => $('#composeDialog').showModal();
  $('#toolGroup').onclick = () => $('#composeDialog').showModal();
  $('#createGroupBtn').onclick = () => $('#createGroupDialog').showModal();
  $('#createEventBtn').onclick = () => $('#createEventDialog').showModal();
  $('#createListingBtn').onclick = () => $('#createItemDialog').showModal();

  $$('.nav-btn[data-view]').forEach(btn => {
    btn.onclick = () => switchView(btn.dataset.view);
  });
  $('#globalSearch').oninput = () => loadFeed();

  function formatTimeAgo(ts) {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }
  function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }

  checkAuth();
  loadFeed();
})();
