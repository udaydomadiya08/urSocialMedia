'use strict';

/**
 * Insaygram — Frontend Client Application
 * Full real-time visual social network experience.
 */

(() => {
  // Application State
  const state = {
    currentUser: null,
    activeView: 'feed',
    activeChatUser: null,
    posts: [],
    stories: [],
    reels: [],
    ws: null
  };

  // DOM Selectors Helper
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  function toast(msg) {
    const el = $('#toastMsg');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2600);
  }

  // API Client
  async function api(path, options = {}) {
    const token = localStorage.getItem('insaygram_token');
    const headers = { ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const res = await fetch(path, { ...options, headers });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Server request failed');
      }
      return data;
    } catch (err) {
      console.error('API Error:', err);
      throw err;
    }
  }

  // WebSocket Setup
  function initWebSocket() {
    if (state.ws) return;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    state.ws = new WebSocket(`${protocol}//${location.host}`);

    state.ws.onopen = () => {
      if (state.currentUser) {
        state.ws.send(JSON.stringify({
          type: 'auth',
          userId: state.currentUser.id,
          username: state.currentUser.username
        }));
      }
    };

    state.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'direct_message') {
          if (state.activeChatUser && state.activeChatUser.id === msg.message.senderId) {
            appendChatMessage(msg.message, false);
          } else {
            toast(`New message from @${msg.message.senderName}`);
            loadConversations();
          }
        } else if (msg.type === 'new_post') {
          toast(`@${msg.post.username} shared a new moment.`);
        }
      } catch (e) {}
    };

    state.ws.onclose = () => {
      state.ws = null;
      setTimeout(initWebSocket, 3000);
    };
  }

  // View Navigation
  function switchView(viewName) {
    state.activeView = viewName;
    $$('.nav-btn').forEach(b => b.classList.remove('active'));
    const btn = $(`[data-view="${viewName}"]`);
    if (btn) btn.classList.add('active');

    $('#viewFeed').style.display = viewName === 'feed' ? 'block' : 'none';
    $('#viewExplore').style.display = viewName === 'explore' ? 'block' : 'none';
    $('#viewReels').style.display = viewName === 'reels' ? 'block' : 'none';
    $('#viewMessages').style.display = viewName === 'messages' ? 'block' : 'none';
    $('#viewProfile').style.display = viewName === 'profile' ? 'block' : 'none';

    if (viewName === 'feed') loadFeed();
    if (viewName === 'explore') loadExplore();
    if (viewName === 'reels') loadReels();
    if (viewName === 'messages') loadConversations();
    if (viewName === 'profile') loadProfile(state.currentUser ? state.currentUser.username : 'mirachen');
  }

  // Authentication Flow
  async function checkAuth() {
    try {
      const res = await api('/api/auth/me');
      if (res.user) {
        state.currentUser = res.user;
        updateUserUI();
        initWebSocket();
      } else {
        // Fallback to local demo session if none
        state.currentUser = null;
        updateUserUI();
      }
    } catch {
      state.currentUser = null;
      updateUserUI();
    }
  }

  function updateUserUI() {
    const user = state.currentUser;
    if (user) {
      $('#sidebarUsername').textContent = user.displayName || user.username;
      $('#sidebarTagline').textContent = `@${user.username}`;
      $('#sidebarAvatar').src = user.avatarUrl;
      $('#myStoryAvatar').src = user.avatarUrl;
      $('#authTriggerBtn').textContent = 'Profile';
      $('#authTriggerBtn').onclick = () => switchView('profile');
    } else {
      $('#sidebarUsername').textContent = 'Guest Explorer';
      $('#sidebarTagline').textContent = 'Sign in to share';
      $('#sidebarAvatar').src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="20" fill="%23666"/></svg>';
      $('#myStoryAvatar').src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="20" fill="%23666"/></svg>';
      $('#authTriggerBtn').textContent = 'Sign In';
      $('#authTriggerBtn').onclick = () => $('#authDialog').showModal();
    }
  }

  // Stories Loading
  async function loadStories() {
    try {
      const res = await api('/api/stories');
      const users = res.users || [];
      state.stories = users;

      const container = $('#dynamicStories');
      container.innerHTML = users.map(u => `
        <div class="story-item" data-story-user="${u.userId}">
          <div class="story-ring ${u.allViewed ? 'viewed' : ''}">
            <img class="story-avatar" src="${u.avatarUrl}" alt="${u.displayName}">
          </div>
          <span class="story-name">${u.displayName.split(' ')[0]}</span>
        </div>
      `).join('');

      container.querySelectorAll('[data-story-user]').forEach(el => {
        el.onclick = () => {
          const userStories = users.find(u => u.userId === el.dataset.storyUser);
          if (userStories) openStoryViewer(userStories);
        };
      });
    } catch (err) {
      console.error(err);
    }
  }

  // Story Viewer
  let storyTimer = null;
  function openStoryViewer(userStories) {
    const dialog = $('#storyViewerDialog');
    $('#viewerUserAvatar').src = userStories.avatarUrl;
    $('#viewerUsername').textContent = userStories.username;

    let index = 0;
    const stories = userStories.stories;

    function showStory(i) {
      if (i >= stories.length) {
        dialog.close();
        loadStories();
        return;
      }
      const s = stories[i];
      $('#viewerTime').textContent = new Date(s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      $('#storyViewerCaption').textContent = s.caption || '';
      $('#storyViewerMedia').innerHTML = `<img src="${s.mediaUrl}" style="width:100%;height:100%;object-fit:contain" alt="">`;

      // Mark view on server
      api(`/api/stories/${s.id}/view`, { method: 'POST' }).catch(() => {});

      // Progress animation
      const fill = $('#storyProgressFill');
      fill.style.width = '0%';
      clearInterval(storyTimer);

      let pct = 0;
      storyTimer = setInterval(() => {
        pct += 2;
        fill.style.width = pct + '%';
        if (pct >= 100) {
          clearInterval(storyTimer);
          showStory(i + 1);
        }
      }, 100);
    }

    dialog.showModal();
    showStory(index);

    dialog.onclose = () => {
      clearInterval(storyTimer);
    };
  }

  // Feed Loading
  async function loadFeed() {
    const stream = $('#feedStream');
    try {
      const q = $('#globalSearch').value.trim();
      const res = await api(`/api/posts?search=${encodeURIComponent(q)}`);
      state.posts = res.posts || [];

      if (state.posts.length === 0) {
        stream.innerHTML = `<div style="text-align:center;padding:50px;color:var(--muted)">No posts found. Start sharing or follow creators!</div>`;
        return;
      }

      stream.innerHTML = state.posts.map(post => renderPostCard(post)).join('');
      attachPostEvents(stream);
      loadSuggestedUsers();
    } catch (err) {
      stream.innerHTML = `<div style="text-align:center;padding:50px;color:#f43f5e">Failed to load feed: ${err.message}</div>`;
    }
  }

  function renderPostCard(p) {
    const timeAgo = formatTimeAgo(p.created_at);
    const mediaItem = p.media && p.media.length > 0 ? p.media[0] : null;

    return `
      <article class="post-card" id="post-${p.id}" data-id="${p.id}">
        <div class="post-header">
          <div class="post-author" style="cursor:pointer" onclick="window.viewUser('${p.username}')">
            <img class="post-avatar" src="${p.avatar_url}" alt="${p.username}">
            <div class="post-author-name">
              <b>${p.display_name} ${p.is_verified ? '<span class="verified-badge">✓</span>' : ''}</b>
              <small>${p.location ? p.location + ' • ' : ''}${timeAgo}</small>
            </div>
          </div>
          <button class="action-btn" onclick="window.reportContent('post', '${p.id}')">···</button>
        </div>

        ${mediaItem ? `
          <div class="post-media-container" data-post-id="${p.id}">
            <img src="${mediaItem.media_url}" alt="Post Media">
            ${p.media.length > 1 ? `<span class="media-badge">1/${p.media.length}</span>` : ''}
          </div>
        ` : ''}

        <div class="post-actions">
          <div class="action-group">
            <button class="action-btn ${p.liked_by_me ? 'liked' : ''}" data-action="like">♥</button>
            <button class="action-btn" data-action="comment">◯</button>
            <button class="action-btn" data-action="share">↗</button>
          </div>
          <button class="action-btn ${p.saved_by_me ? 'saved' : ''}" data-action="save">♧</button>
        </div>

        <div class="post-likes"><span class="like-counter">${p.like_count}</span> likes</div>
        ${p.caption ? `<div class="post-caption"><b>${p.username}</b>${formatCaption(p.caption)}</div>` : ''}

        <div class="comments-toggle" data-action="toggle-comments">${p.comment_count > 0 ? `View all ${p.comment_count} comments` : 'Add a comment...'}</div>
        <div class="comments-drawer" style="display:none" id="comments-${p.id}"></div>

        <div class="comment-input-bar">
          <input type="text" placeholder="Add a thoughtful comment..." maxlength="300" class="comment-field">
          <button type="button" data-action="post-comment">Post</button>
        </div>
      </article>
    `;
  }

  function attachPostEvents(container) {
    container.querySelectorAll('.post-card').forEach(card => {
      const postId = card.dataset.id;

      // Like Button
      const likeBtn = card.querySelector('[data-action="like"]');
      if (likeBtn) {
        likeBtn.onclick = async () => {
          if (!state.currentUser) return $('#authDialog').showModal();
          try {
            const res = await api(`/api/posts/${postId}/like`, { method: 'POST' });
            likeBtn.classList.toggle('liked', res.liked);
            card.querySelector('.like-counter').textContent = res.likeCount;
          } catch (err) { toast(err.message); }
        };
      }

      // Save Button
      const saveBtn = card.querySelector('[data-action="save"]');
      if (saveBtn) {
        saveBtn.onclick = async () => {
          if (!state.currentUser) return $('#authDialog').showModal();
          try {
            const res = await api(`/api/posts/${postId}/save`, { method: 'POST' });
            saveBtn.classList.toggle('saved', res.saved);
            toast(res.saved ? 'Saved to collection' : 'Removed from saves');
          } catch (err) { toast(err.message); }
        };
      }

      // Share Button
      const shareBtn = card.querySelector('[data-action="share"]');
      if (shareBtn) {
        shareBtn.onclick = () => {
          navigator.clipboard.writeText(`${location.origin}/#post-${postId}`);
          toast('Post link copied to clipboard!');
        };
      }

      // Comments Toggle
      const toggleBtn = card.querySelector('[data-action="toggle-comments"]');
      const commentsDrawer = card.querySelector(`#comments-${postId}`);
      if (toggleBtn && commentsDrawer) {
        toggleBtn.onclick = async () => {
          if (commentsDrawer.style.display === 'none') {
            commentsDrawer.style.display = 'flex';
            const res = await api(`/api/posts/${postId}/comments`);
            commentsDrawer.innerHTML = res.comments.map(c => `
              <div class="comment-line"><b>${c.username}</b> ${c.text}</div>
            `).join('');
          } else {
            commentsDrawer.style.display = 'none';
          }
        };
      }

      // Post Comment
      const commentInput = card.querySelector('.comment-field');
      const postCommentBtn = card.querySelector('[data-action="post-comment"]');
      if (commentInput && postCommentBtn) {
        const sendComment = async () => {
          const text = commentInput.value.trim();
          if (!text) return;
          if (!state.currentUser) return $('#authDialog').showModal();
          try {
            const res = await api(`/api/posts/${postId}/comments`, {
              method: 'POST',
              body: JSON.stringify({ text })
            });
            commentInput.value = '';
            commentsDrawer.style.display = 'flex';
            commentsDrawer.insertAdjacentHTML('beforeend', `<div class="comment-line"><b>${res.comment.username}</b> ${res.comment.text}</div>`);
            toast('Comment published');
          } catch (err) { toast(err.message); }
        };
        postCommentBtn.onclick = sendComment;
        commentInput.onkeydown = (e) => { if (e.key === 'Enter') sendComment(); };
      }
    });
  }

  // Explore Loading
  async function loadExplore() {
    const grid = $('#exploreGrid');
    try {
      const res = await api('/api/explore');
      grid.innerHTML = res.items.map(item => `
        <div class="explore-item" onclick="window.viewUser('${item.username}')">
          <img src="${item.media_url}" alt="">
          <div class="explore-overlay">
            <span>♥ ${item.like_count}</span>
            <span>◯ ${item.comment_count}</span>
          </div>
        </div>
      `).join('');
    } catch (err) {
      grid.innerHTML = `<div style="color:var(--muted)">Explore feed unavailable: ${err.message}</div>`;
    }
  }

  // Reels Loading
  async function loadReels() {
    const container = $('#reelsContainer');
    try {
      const res = await api('/api/reels');
      state.reels = res.reels || [];

      if (state.reels.length === 0) {
        container.innerHTML = '<div style="color:var(--muted)">No reels available.</div>';
        return;
      }

      container.innerHTML = state.reels.map(r => `
        <div class="reel-wrapper">
          <div class="reel-video" style="background:#111;display:grid;place-items:center">
            <img src="${r.video_url}" style="width:100%;height:100%;object-fit:cover" alt="">
          </div>
          <div class="reel-overlay">
            <div style="font-size:12px;color:rgba(255,255,255,0.8)">Reels Feed</div>
            <div class="reel-meta">
              <b style="font-size:15px;color:white">@${r.username}</b>
              <p style="font-size:13px;color:#eee;margin:6px 0">${r.caption}</p>
              <small style="color:#aaa">♫ ${r.audio_title}</small>
            </div>
            <div class="reel-actions">
              <button class="reel-action-btn ${r.liked_by_me ? 'liked' : ''}">♥<small>${r.like_count}</small></button>
              <button class="reel-action-btn">◯<small>Chat</small></button>
              <button class="reel-action-btn">↗<small>Share</small></button>
            </div>
          </div>
        </div>
      `).join('');
    } catch (err) {
      container.innerHTML = `<div style="color:var(--muted)">Error loading reels: ${err.message}</div>`;
    }
  }

  // Direct Messages
  async function loadConversations() {
    if (!state.currentUser) return;
    try {
      const res = await api('/api/messages/conversations');
      const list = $('#conversationsList');
      list.innerHTML = res.conversations.map(c => `
        <div class="suggested-user" style="padding:8px;border-radius:8px;cursor:pointer" onclick="window.openChat('${c.user.id}', '${c.user.username}', '${c.user.avatar_url}')">
          <div class="suggested-user-info">
            <img class="suggested-avatar" src="${c.user.avatar_url}" alt="">
            <div>
              <b>${c.user.display_name}</b>
              <small style="display:block;color:var(--muted)">${c.lastMessage || 'Start conversation'}</small>
            </div>
          </div>
          ${c.unread ? '<span style="width:8px;height:8px;background:var(--accent);border-radius:50%"></span>' : ''}
        </div>
      `).join('') || '<div style="color:var(--muted);font-size:12px">No conversations yet.</div>';
    } catch (err) {}
  }

  window.openChat = async (userId, username, avatarUrl) => {
    state.activeChatUser = { id: userId, username, avatarUrl };
    $('#chatHeader').innerHTML = `<span style="color:var(--muted)">Chat with</span> @${username}`;
    $('#chatForm').style.display = 'flex';

    try {
      const res = await api(`/api/messages/${userId}`);
      const container = $('#chatMessages');
      container.innerHTML = res.messages.map(m => `
        <div style="align-self:${m.sender_id === state.currentUser.id ? 'flex-end' : 'flex-start'};background:${m.sender_id === state.currentUser.id ? 'var(--accent)' : 'var(--panel2)'};padding:8px 14px;border-radius:14px;max-width:70%;font-size:13px">
          ${m.text}
        </div>
      `).join('');
      container.scrollTop = container.scrollHeight;
    } catch (err) { toast(err.message); }
  };

  function appendChatMessage(msg, isSelf) {
    const container = $('#chatMessages');
    container.insertAdjacentHTML('beforeend', `
      <div style="align-self:${isSelf ? 'flex-end' : 'flex-start'};background:${isSelf ? 'var(--accent)' : 'var(--panel2)'};padding:8px 14px;border-radius:14px;max-width:70%;font-size:13px">
        ${msg.text}
      </div>
    `);
    container.scrollTop = container.scrollHeight;
  }

  $('#chatForm').onsubmit = async (e) => {
    e.preventDefault();
    if (!state.activeChatUser) return;
    const input = $('#chatInput');
    const text = input.value.trim();
    if (!text) return;

    try {
      const res = await api(`/api/messages/${state.activeChatUser.id}`, {
        method: 'POST',
        body: JSON.stringify({ text })
      });
      input.value = '';
      appendChatMessage({ text }, true);
    } catch (err) { toast(err.message); }
  };

  // Profile Loading
  async function loadProfile(username) {
    try {
      const res = await api(`/api/users/${username}`);
      const u = res.user;
      $('#profileHeaderAvatar').src = u.avatar_url;
      $('#profileHeaderUsername').textContent = `@${u.username}`;
      $('#profileHeaderDisplayName').textContent = u.display_name;
      $('#profileHeaderBio').textContent = u.bio || 'No bio provided.';
      $('#statPosts').textContent = u.post_count;
      $('#statFollowers').textContent = u.follower_count;
      $('#statFollowing').textContent = u.following_count;

      const grid = $('#profileGrid');
      grid.innerHTML = res.posts.map(p => `
        <div class="explore-item">
          <img src="${p.thumbnail_url}" alt="">
          <div class="explore-overlay">
            <span>♥ ${p.like_count}</span>
            <span>◯ ${p.comment_count}</span>
          </div>
        </div>
      `).join('') || '<div style="color:var(--muted)">No posts shared yet.</div>';
    } catch (err) {
      toast(err.message);
    }
  }

  // Suggested Users
  async function loadSuggestedUsers() {
    const rail = $('#suggestedUsers');
    const creators = [
      { id: 'usr_mira', username: 'mirachen', name: 'Mira Chen', avatar: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><circle cx="18" cy="18" r="18" fill="%23d9468f"/><text x="18" y="23" font-size="14" fill="white" text-anchor="middle">MC</text></svg>' },
      { id: 'usr_noah', username: 'noahrivera', name: 'Noah Rivera', avatar: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><circle cx="18" cy="18" r="18" fill="%238b5cf6"/><text x="18" y="23" font-size="14" fill="white" text-anchor="middle">NR</text></svg>' },
      { id: 'usr_forma', username: 'studioforma', name: 'Studio Forma', avatar: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><circle cx="18" cy="18" r="18" fill="%23ec4899"/><text x="18" y="23" font-size="14" fill="white" text-anchor="middle">SF</text></svg>' }
    ];

    rail.innerHTML = creators.map(c => `
      <div class="suggested-user">
        <div class="suggested-user-info" style="cursor:pointer" onclick="window.viewUser('${c.username}')">
          <img class="suggested-avatar" src="${c.avatar}" alt="">
          <div>
            <b style="font-size:13px">${c.name}</b>
            <small style="color:var(--muted)">@${c.username}</small>
          </div>
        </div>
        <button class="follow-btn" onclick="window.toggleFollow('${c.id}', this)">Follow</button>
      </div>
    `).join('');
  }

  window.toggleFollow = async (userId, btn) => {
    if (!state.currentUser) return $('#authDialog').showModal();
    try {
      const res = await api(`/api/users/${userId}/follow`, { method: 'POST' });
      btn.textContent = res.following ? 'Following' : 'Follow';
      btn.classList.toggle('following', res.following);
      toast(res.following ? 'Following creator' : 'Unfollowed');
    } catch (err) { toast(err.message); }
  };

  window.viewUser = (username) => {
    switchView('profile');
    loadProfile(username);
  };

  window.reportContent = async (type, id) => {
    const reason = prompt('Reason for reporting this content (e.g., spam, harassment, inappropriate):');
    if (!reason) return;
    try {
      await api('/api/reports', {
        method: 'POST',
        body: JSON.stringify({ targetType: type, targetId: id, reason })
      });
      toast('Thank you. Content submitted for moderation review.');
    } catch (err) { toast(err.message); }
  };

  // Post & Story Upload Event Handlers
  $('#createPostForm').onsubmit = async (e) => {
    e.preventDefault();
    if (!state.currentUser) return $('#authDialog').showModal();

    const fileInput = $('#postFileInput');
    const caption = $('#postCaptionInput').value.trim();
    const location = $('#postLocationInput').value.trim();
    const media = [];

    $('#publishPostBtn').disabled = true;
    $('#publishPostBtn').textContent = 'Uploading...';

    try {
      if (fileInput.files.length > 0) {
        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        const uploadRes = await api('/api/upload', {
          method: 'POST',
          body: formData
        });
        if (uploadRes.files && uploadRes.files.length > 0) {
          media.push({ url: uploadRes.files[0].url, type: uploadRes.files[0].type });
        }
      }

      await api('/api/posts', {
        method: 'POST',
        body: JSON.stringify({ caption, location, media })
      });

      $('#createPostDialog').close();
      $('#createPostForm').reset();
      toast('Post published successfully!');
      loadFeed();
    } catch (err) {
      toast(err.message);
    } finally {
      $('#publishPostBtn').disabled = false;
      $('#publishPostBtn').textContent = 'Publish';
    }
  };

  $('#createStoryForm').onsubmit = async (e) => {
    e.preventDefault();
    if (!state.currentUser) return $('#authDialog').showModal();

    const fileInput = $('#storyFileInput');
    const caption = $('#storyCaptionInput').value.trim();

    try {
      if (fileInput.files.length === 0) return toast('Please select an image or clip for your story.');
      const formData = new FormData();
      formData.append('file', fileInput.files[0]);
      const uploadRes = await api('/api/upload', { method: 'POST', body: formData });

      await api('/api/stories', {
        method: 'POST',
        body: JSON.stringify({
          mediaUrl: uploadRes.files[0].url,
          mediaType: uploadRes.files[0].type,
          caption
        })
      });

      $('#createStoryDialog').close();
      $('#createStoryForm').reset();
      toast('Added to your 24h story!');
      loadStories();
    } catch (err) { toast(err.message); }
  };

  // Auth Dialog Tabs & Submit
  let authMode = 'login';
  $('#tabLogin').onclick = () => {
    authMode = 'login';
    $('#authTitle').textContent = 'Sign In to insaygram';
    $('#tabLogin').style.background = 'var(--panel2)';
    $('#tabRegister').style.background = 'transparent';
    $('#groupEmail').style.display = 'none';
    $('#groupDisplayName').style.display = 'none';
  };
  $('#tabRegister').onclick = () => {
    authMode = 'register';
    $('#authTitle').textContent = 'Create an insaygram Account';
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

    const errEl = $('#authError');
    errEl.style.display = 'none';

    try {
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = authMode === 'login' ? { username, password } : { username, password, email, displayName };
      const res = await api(endpoint, { method: 'POST', body: JSON.stringify(body) });

      if (res.token) {
        localStorage.setItem('insaygram_token', res.token);
      }
      state.currentUser = res.user;
      updateUserUI();
      $('#authDialog').close();
      toast(`Welcome, ${res.user.displayName}!`);
      loadFeed();
      loadStories();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    }
  };

  $('#logoutBtn').onclick = async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {}
    localStorage.removeItem('insaygram_token');
    state.currentUser = null;
    updateUserUI();
    toast('Logged out successfully');
    switchView('feed');
  };

  // Dialog Controls
  $$('.close-dialog').forEach(btn => btn.onclick = () => btn.closest('dialog').close());
  $('#topCreateBtn').onclick = () => $('#createPostDialog').showModal();
  $('#navCreateBtn').onclick = () => $('#createPostDialog').showModal();
  $('#newStoryBtn').onclick = () => $('#createStoryDialog').showModal();
  $('#addStoryTrigger').onclick = () => $('#createStoryDialog').showModal();
  $('#globalSearch').oninput = () => loadFeed();

  $$('.nav-btn[data-view]').forEach(btn => {
    btn.onclick = () => switchView(btn.dataset.view);
  });

  // Format Helpers
  function formatTimeAgo(ts) {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  function formatCaption(caption) {
    return caption.replace(/#(\w+)/g, '<span style="color:var(--accent);font-weight:600">#$1</span>');
  }

  // Initialization
  checkAuth();
  loadStories();
  loadFeed();
})();
