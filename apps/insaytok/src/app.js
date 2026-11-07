'use strict';

/**
 * Insaytok — Vertical Video Client Application
 * Includes snap scrolling, HTML5 video controls, and explainable recommendations.
 */

(() => {
  const state = {
    currentUser: null,
    activeTab: 'foryou',
    videos: [],
    activeVideoId: null,
    activeCommentVideoId: null
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
    const token = localStorage.getItem('insaytok_token');
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

  // View Navigation
  function switchView(viewName) {
    $$('.nav-btn').forEach(b => b.classList.remove('active'));
    const btn = $(`[data-view="${viewName}"]`);
    if (btn) btn.classList.add('active');

    $('#viewFeed').style.display = (viewName === 'feed' || viewName === 'following') ? 'block' : 'none';
    $('#viewDiscover').style.display = viewName === 'discover' ? 'block' : 'none';
    $('#viewProfile').style.display = viewName === 'profile' ? 'block' : 'none';

    if (viewName === 'feed') {
      state.activeTab = 'foryou';
      $('#tabForYou').classList.add('active');
      $('#tabFollowing').classList.remove('active');
      loadFeed();
    } else if (viewName === 'following') {
      state.activeTab = 'following';
      $('#tabFollowing').classList.add('active');
      $('#tabForYou').classList.remove('active');
      loadFeed();
    } else if (viewName === 'discover') {
      loadDiscover();
    } else if (viewName === 'profile') {
      loadProfile(state.currentUser ? state.currentUser.username : 'buildwithlee');
    }
  }

  // Auth Flow
  async function checkAuth() {
    try {
      const res = await api('/api/auth/me');
      state.currentUser = res.user;
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
      $('#authBtn').textContent = 'Profile';
      $('#authBtn').onclick = () => switchView('profile');
    } else {
      $('#sidebarUsername').textContent = 'Guest Explorer';
      $('#sidebarRole').textContent = 'Short Video';
      $('#authBtn').textContent = 'Sign In';
      $('#authBtn').onclick = () => $('#authDialog').showModal();
    }
  }

  // Feed Loading & Rendering
  async function loadFeed() {
    const feed = $('#viewFeed');
    try {
      const res = await api(`/api/feed?type=${state.activeTab}`);
      state.videos = res.videos || [];

      if (state.videos.length === 0) {
        feed.innerHTML = `
          <div class="video-card">
            <div style="text-align:center;color:var(--muted)">
              <h3>No videos found in this feed.</h3>
              <p>Explore trending creators or publish the first video!</p>
            </div>
          </div>
        `;
        return;
      }

      feed.innerHTML = state.videos.map(v => renderVideoCard(v)).join('');
      attachVideoCardEvents();
      setupObserver();
    } catch (err) {
      feed.innerHTML = `<div class="video-card"><div style="color:#ee3d68">${err.message}</div></div>`;
    }
  }

  function renderVideoCard(v) {
    const isSvg = v.video_url.startsWith('data:image/svg+xml') || v.video_url.endsWith('.svg');
    const reasons = v.recommendation_meta ? v.recommendation_meta.reasons[0] : '+15pts: Algorithmic Discovery';

    return `
      <div class="video-card" id="card-${v.id}" data-id="${v.id}">
        <div class="video-container">
          ${isSvg ? `
            <img src="${v.video_url}" class="video-player" alt="Video">
          ` : `
            <video class="video-player" src="${v.video_url}" loop playsinline preload="metadata"></video>
          `}

          <!-- Right Floating Interaction Sidebar -->
          <div class="video-actions-rail">
            <div class="action-creator-avatar" style="cursor:pointer" onclick="window.viewCreatorProfile('${v.username}')">
              <img src="${v.avatar_url}" alt="">
              ${!v.is_following ? `<span class="follow-plus-badge" onclick="event.stopPropagation(); window.toggleFollowCreator('${v.user_id}', this)">＋</span>` : ''}
            </div>

            <button class="rail-btn ${v.liked_by_me ? 'liked' : ''}" data-action="like">
              <div class="rail-icon">♥</div>
              <span class="rail-count like-count">${v.like_count}</span>
            </button>

            <button class="rail-btn" data-action="comment">
              <div class="rail-icon">💬</div>
              <span class="rail-count comment-count">${v.comment_count}</span>
            </button>

            <button class="rail-btn ${v.saved_by_me ? 'saved' : ''}" data-action="save">
              <div class="rail-icon">♧</div>
              <span class="rail-count">Save</span>
            </button>

            <button class="rail-btn" data-action="share">
              <div class="rail-icon">↗</div>
              <span class="rail-count">Share</span>
            </button>

            <div class="sound-disc">
              <div class="sound-disc-center"></div>
            </div>
          </div>

          <!-- Bottom Video Information Overlay -->
          <div class="video-metadata-overlay">
            <div class="ai-badge" onclick="window.showAiTransparency('${v.id}')">
              ⚡ AI Score: ${v.recommendation_score || 75} (${reasons.split(':')[0]})
            </div>
            <br>
            <b class="creator-handle" onclick="window.viewCreatorProfile('${v.username}')">@${v.username}</b>
            <p class="video-caption">${formatCaption(v.caption)}</p>
            <div class="video-sound-ticker">♫ ${v.sound_title}</div>
          </div>
        </div>
      </div>
    `;
  }

  function attachVideoCardEvents() {
    $$('.video-card').forEach(card => {
      const videoId = card.dataset.id;
      const videoEl = card.querySelector('video');

      // Play/Pause on click
      if (videoEl) {
        card.querySelector('.video-container').onclick = (e) => {
          if (e.target.closest('.video-actions-rail') || e.target.closest('.ai-badge')) return;
          if (videoEl.paused) videoEl.play();
          else videoEl.pause();
        };
      }

      // Like
      const likeBtn = card.querySelector('[data-action="like"]');
      if (likeBtn) {
        likeBtn.onclick = async () => {
          if (!state.currentUser) return $('#authDialog').showModal();
          try {
            const res = await api(`/api/videos/${videoId}/like`, { method: 'POST' });
            likeBtn.classList.toggle('liked', res.liked);
            card.querySelector('.like-count').textContent = res.likeCount;
          } catch (err) { toast(err.message); }
        };
      }

      // Save
      const saveBtn = card.querySelector('[data-action="save"]');
      if (saveBtn) {
        saveBtn.onclick = async () => {
          if (!state.currentUser) return $('#authDialog').showModal();
          try {
            const res = await api(`/api/videos/${videoId}/save`, { method: 'POST' });
            saveBtn.classList.toggle('saved', res.saved);
            toast(res.saved ? 'Saved to collection' : 'Removed from saves');
          } catch (err) { toast(err.message); }
        };
      }

      // Share
      const shareBtn = card.querySelector('[data-action="share"]');
      if (shareBtn) {
        shareBtn.onclick = () => {
          navigator.clipboard.writeText(`${location.origin}/#card-${videoId}`);
          toast('Video link copied!');
        };
      }

      // Comments Drawer
      const commentBtn = card.querySelector('[data-action="comment"]');
      if (commentBtn) {
        commentBtn.onclick = () => openCommentsDrawer(videoId);
      }
    });
  }

  // Intersection Observer for autoplay & watch tracking
  function setupObserver() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const video = entry.target.querySelector('video');
        if (entry.isIntersecting) {
          if (video) video.play().catch(() => {});
          state.activeVideoId = entry.target.dataset.id;
          // Track watch
          api(`/api/videos/${state.activeVideoId}/watch`, {
            method: 'POST',
            body: JSON.stringify({ completionRate: 1.0 })
          }).catch(() => {});
        } else {
          if (video) video.pause();
        }
      });
    }, { threshold: 0.65 });

    $$('.video-card').forEach(card => observer.observe(card));
  }

  // Keyboard navigation (Arrow keys up/down)
  window.addEventListener('keydown', (e) => {
    if (state.activeView !== 'feed' && state.activeView !== 'following') return;
    const cards = Array.from($$('.video-card'));
    const currentIdx = cards.findIndex(c => c.dataset.id === state.activeVideoId);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = cards[Math.min(currentIdx + 1, cards.length - 1)];
      if (next) next.scrollIntoView({ behavior: 'smooth' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = cards[Math.max(currentIdx - 1, 0)];
      if (prev) prev.scrollIntoView({ behavior: 'smooth' });
    }
  });

  // Comments Sheet
  async function openCommentsDrawer(videoId) {
    state.activeCommentVideoId = videoId;
    const drawer = $('#commentsSheet');
    drawer.classList.add('open');

    try {
      const res = await api(`/api/videos/${videoId}/comments`);
      const stream = $('#commentsStream');
      stream.innerHTML = res.comments.map(c => `
        <div class="comment-bubble">
          <img class="user-avatar-sm" src="${c.avatar_url}" style="width:32px;height:32px" alt="">
          <div>
            <b style="font-size:12px;color:var(--accent)">@${c.username}</b>
            <p style="font-size:13px;color:#f1f5f9;margin-top:2px">${c.text}</p>
          </div>
        </div>
      `).join('') || '<div style="color:var(--muted);font-size:13px;text-align:center;padding:20px">No comments yet. Start the conversation!</div>';
    } catch (err) { toast(err.message); }
  }

  $('#closeCommentsBtn').onclick = () => $('#commentsSheet').classList.remove('open');

  $('#commentPostForm').onsubmit = async (e) => {
    e.preventDefault();
    if (!state.currentUser) return $('#authDialog').showModal();
    const input = $('#commentTextInput');
    const text = input.value.trim();
    if (!text || !state.activeCommentVideoId) return;

    try {
      const res = await api(`/api/videos/${state.activeCommentVideoId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ text })
      });
      input.value = '';
      $('#commentsStream').insertAdjacentHTML('beforeend', `
        <div class="comment-bubble">
          <img class="user-avatar-sm" src="${res.comment.avatarUrl}" style="width:32px;height:32px" alt="">
          <div>
            <b style="font-size:12px;color:var(--accent)">@${res.comment.username}</b>
            <p style="font-size:13px;color:#f1f5f9;margin-top:2px">${res.comment.text}</p>
          </div>
        </div>
      `);
      toast('Comment posted');
    } catch (err) { toast(err.message); }
  };

  // Explainable AI Recommendation Transparency
  window.showAiTransparency = (videoId) => {
    const video = state.videos.find(v => v.id === videoId);
    if (!video || !video.recommendation_meta) return;

    const meta = video.recommendation_meta;
    const b = meta.breakdown;

    const html = `
      <div><b>Final Ranking Score:</b> <span style="color:var(--accent)">${meta.finalScore} / 100</span></div>
      <div style="margin:8px 0;padding-left:10px;border-left:2px solid var(--accent)">
        • Tag Affinity: <b>+${b.tagScore}</b> (from your watch history & likes)<br>
        • Viral Engagement Velocity: <b>+${b.velocityScore}</b> (likes/views ratio)<br>
        • Recency Decay Curve: <b>+${b.recencyScore}</b> (exponential 3-day half-life)<br>
        • Novelty Bonus: <b>+${b.noveltyScore}</b> (rising creator weighting)<br>
        • Diversity Penalty: <b>-${b.diversityPenalty}</b> (fatigue suppression)
      </div>
      <div style="margin-top:8px"><b>Primary Algorithmic Driver:</b><br>${meta.reasons.join('<br>')}</div>
    `;

    $('#aiBreakdownDetails').innerHTML = html;
    $('#aiTransparencyModal').showModal();
  };

  // Video Upload
  $('#openUploadBtn').onclick = () => {
    if (!state.currentUser) return $('#authDialog').showModal();
    $('#uploadDialog').showModal();
  };

  $('#uploadForm').onsubmit = async (e) => {
    e.preventDefault();
    const fileInput = $('#videoFileInput');
    const caption = $('#videoCaptionInput').value.trim();
    const soundTitle = $('#videoSoundInput').value.trim();

    if (!fileInput.files.length) return toast('Select a video file to upload.');

    $('#submitUploadBtn').disabled = true;
    $('#submitUploadBtn').textContent = 'Uploading...';

    try {
      const formData = new FormData();
      formData.append('file', fileInput.files[0]);
      const uploadRes = await api('/api/upload', { method: 'POST', body: formData });

      if (!uploadRes.files || !uploadRes.files.length) throw new Error('Upload failed');
      const videoUrl = uploadRes.files[0].url;

      await api('/api/videos', {
        method: 'POST',
        body: JSON.stringify({ videoUrl, caption, soundTitle })
      });

      $('#uploadDialog').close();
      $('#uploadForm').reset();
      toast('Video published to For You feed! ▶');
      loadFeed();
    } catch (err) {
      toast(err.message);
    } finally {
      $('#submitUploadBtn').disabled = false;
      $('#submitUploadBtn').textContent = 'Publish Video';
    }
  };

  // Creator Follow
  window.toggleFollowCreator = async (creatorId, badgeEl) => {
    if (!state.currentUser) return $('#authDialog').showModal();
    try {
      const res = await api(`/api/users/${creatorId}/follow`, { method: 'POST' });
      if (badgeEl) badgeEl.style.display = 'none';
      toast(res.following ? 'Following creator!' : 'Unfollowed');
    } catch (err) { toast(err.message); }
  };

  window.viewCreatorProfile = (username) => {
    switchView('profile');
    loadProfile(username);
  };

  // Discover View
  async function loadDiscover() {
    try {
      const res = await api('/api/discover');
      const tagsStrip = $('#trendingTagsStrip');
      tagsStrip.innerHTML = res.trendingTags.map(tag => `
        <button class="filter-chip" onclick="window.filterByTag('${tag}')">#${tag}</button>
      `).join('');

      const creatorsGrid = $('#popularCreatorsGrid');
      creatorsGrid.innerHTML = res.popularCreators.map(c => `
        <div style="background:var(--panel2);border:1px solid var(--line);border-radius:14px;padding:16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer" onclick="window.viewCreatorProfile('${c.username}')">
          <div style="display:flex;align-items:center;gap:12px">
            <img class="user-avatar-sm" src="${c.avatar_url}" alt="">
            <div>
              <b>${c.display_name}</b>
              <small style="color:var(--muted);display:block">@${c.username}</small>
            </div>
          </div>
          <span style="font-size:12px;color:var(--accent)">${c.follower_count} fans</span>
        </div>
      `).join('');
    } catch (err) { toast(err.message); }
  }

  window.filterByTag = (tag) => {
    switchView('feed');
    api(`/api/feed?tag=${tag}`).then(res => {
      state.videos = res.videos || [];
      $('#viewFeed').innerHTML = state.videos.map(v => renderVideoCard(v)).join('');
      attachVideoCardEvents();
      setupObserver();
    });
  };

  // Creator Profile View
  async function loadProfile(username) {
    try {
      const res = await api(`/api/users/${username}`);
      const u = res.user;
      $('#profileAvatar').src = u.avatar_url;
      $('#profileDisplayName').textContent = u.display_name;
      $('#profileUsername').textContent = `@${u.username}`;
      $('#profileFollowing').textContent = u.following_count;
      $('#profileFollowers').textContent = u.follower_count;

      const grid = $('#profileVideosGrid');
      grid.innerHTML = res.videos.map(v => `
        <div style="aspect-ratio:9/16;border-radius:12px;overflow:hidden;background:#111;position:relative;cursor:pointer" onclick="window.jumpToVideo('${v.id}')">
          <img src="${v.video_url}" style="width:100%;height:100%;object-fit:cover" alt="">
          <div style="position:absolute;bottom:8px;left:8px;font-size:11px;font-weight:700;color:white;text-shadow:0 1px 4px #000">▶ ${v.view_count}</div>
        </div>
      `).join('') || '<div style="color:var(--muted)">No videos published yet.</div>';
    } catch (err) { toast(err.message); }
  }

  window.jumpToVideo = (videoId) => {
    switchView('feed');
    setTimeout(() => {
      const card = $(`#card-${videoId}`);
      if (card) card.scrollIntoView({ behavior: 'smooth' });
    }, 200);
  };

  // Auth Dialog Handlers
  let authMode = 'login';
  $('#tabLogin').onclick = () => {
    authMode = 'login';
    $('#authTitle').textContent = 'Sign In to insaytok';
    $('#tabLogin').style.background = 'var(--panel2)';
    $('#tabRegister').style.background = 'transparent';
    $('#groupEmail').style.display = 'none';
    $('#groupDisplayName').style.display = 'none';
  };
  $('#tabRegister').onclick = () => {
    authMode = 'register';
    $('#authTitle').textContent = 'Create insaytok Account';
    $('#tabRegister').style.background = 'var(--panel2)';
    $('#tabLogin').style.background = 'transparent';
    $('#groupEmail').style.display = 'block';
    $('#groupDisplayName').style.display = 'block';
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

      if (res.token) localStorage.setItem('insaytok_token', res.token);
      state.currentUser = res.user;
      updateUserUI();
      $('#authDialog').close();
      toast(`Welcome, ${res.user.displayName}! ▶`);
      loadFeed();
    } catch (err) {
      $('#authError').textContent = err.message;
      $('#authError').style.display = 'block';
    }
  };

  $('#tabForYou').onclick = () => switchView('feed');
  $('#tabFollowing').onclick = () => switchView('following');
  $$('.close-dialog').forEach(b => b.onclick = () => b.closest('dialog').close());
  $$('.nav-btn[data-view]').forEach(btn => {
    btn.onclick = () => switchView(btn.dataset.view);
  });

  function formatCaption(caption) {
    return caption.replace(/#(\w+)/g, '<span style="color:var(--accent);font-weight:700">#$1</span>');
  }

  checkAuth();
  loadFeed();
})();
