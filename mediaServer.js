const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const http = require('http');
const os = require('os');
const { spawn } = require('child_process');


let currentPin = null;


const authenticatedSids = new Set();

function hasPin() {
  return !!currentPin;
}

function setPin(pin) {
  currentPin = String(pin);
  authenticatedSids.clear();
}

function checkPin(pin) {
  return !!currentPin && String(pin) === currentPin;
}

function isAuthed(sid) {
  return !!sid && authenticatedSids.has(sid);
}

const failedAttempts = new Map();

function getAttemptKey(sid, req) {
  const ip = req.socket.remoteAddress || 'unknown';
  return ip;
}

function getCooldownMs(count) {
  const tiers = [0, 0, 0, 5000, 15000, 30000, 60000, 120000, 300000];
  return tiers[Math.min(count, tiers.length - 1)];
}

function checkAttemptAllowed(key) {
  const entry = failedAttempts.get(key);
  if (!entry) return { allowed: true };
  if (entry.lockedUntil && Date.now() < entry.lockedUntil) {
    return { allowed: false, retryAfterMs: entry.lockedUntil - Date.now() };
  }
  return { allowed: true };
}

function recordFailedAttempt(key) {
  const entry = failedAttempts.get(key) || { count: 0, lockedUntil: 0 };
  entry.count += 1;
  entry.lockedUntil = Date.now() + getCooldownMs(entry.count);
  failedAttempts.set(key, entry);
}

function recordSuccessfulAttempt(key) {
  failedAttempts.delete(key);
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of failedAttempts) {
    if (entry.lockedUntil < now - 10 * 60 * 1000) failedAttempts.delete(key);
  }
}, 10 * 60 * 1000);

let mediaServer = null;
let mediaServerPort = null;
let mediaServerPlaylist = [];
let mediaServerRecentFolders = [];
let mainWindowRef = null;

const sessionPlaylists = new Map();
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const ONLINE_WINDOW_MS = 15 * 1000;

function pruneSessions() {
  const now = Date.now();
  for (const [sid, s] of sessionPlaylists) {
    if (now - s.lastAccess > SESSION_TTL_MS) sessionPlaylists.delete(sid);
  }
}
setInterval(pruneSessions, 30 * 60 * 1000);

function getSessionPlaylist(sid, forceRefresh = false) {
  if (!sid) return mediaServerPlaylist;
  let entry = sessionPlaylists.get(sid);
  if (!entry || forceRefresh) {
    entry = { playlist: mediaServerPlaylist.slice(), lastAccess: Date.now() };
    sessionPlaylists.set(sid, entry);
  } else {
    entry.lastAccess = Date.now();
  }
  return entry.playlist;
}

function touchSession(sid) {
  if (!sid) return;
  let entry = sessionPlaylists.get(sid);
  if (!entry) {
    entry = { playlist: mediaServerPlaylist.slice(), lastAccess: Date.now() };
    sessionPlaylists.set(sid, entry);
  } else {
    entry.lastAccess = Date.now();
  }
}

function getOnlineCount() {
  const now = Date.now();
  let count = 0;
  for (const [, s] of sessionPlaylists) {
    if (now - s.lastAccess <= ONLINE_WINDOW_MS) count++;
  }
  return count;
}

function getLocalIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

function mimeFromExt(ext) {
  const map = {
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4', '.flac': 'audio/flac', '.opus': 'audio/opus', '.aac': 'audio/aac'
  };
  return map[ext.toLowerCase()] || 'application/octet-stream';
}

const artCache = new Map();

function extractEmbeddedArt(filePath) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const proc = spawn('ffmpeg', [
      '-i', filePath, '-an', '-vcodec', 'copy',
      '-f', 'image2pipe', '-frames:v', '1', 'pipe:1'
    ]);
    proc.stdout.on('data', (d) => chunks.push(d));
    proc.stderr.on('data', () => {});
    proc.on('close', (code) => {
      if (code === 0 && chunks.length) resolve(Buffer.concat(chunks));
      else resolve(null);
    });
    proc.on('error', reject);
  });
}

function serveStaticFile(res, filePath, fallbackMime = 'application/octet-stream') {
  fsSync.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = {
      '.css': 'text/css', '.js': 'application/javascript',
      '.svg': 'image/svg+xml', '.png': 'image/png', '.gif': 'image/gif',
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon'
    };
    res.writeHead(200, { 'Content-Type': mimeMap[ext] || fallbackMime });
    res.end(data);
  });
}

const REMOTE_PLAYER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<link rel="icon" type="image/svg+xml" href="/build/kat.png">
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>NeonKat</title>
<style>
  :root { --primary: #a88cff; --primary-dark: #7a5fd6; }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; margin:0; padding:0; }
  body {
    font-family: -apple-system, system-ui, sans-serif;
    background: #0d0d0d;
    color: #fff;
    padding: 20px 16px 140px;
    min-height: 100vh;
  }
  h1 {
    display: flex; align-items: center; gap: 10px;
    font-size: 20px; margin-bottom: 4px; color: var(--primary);
  }
  

  h1 img { height: 34px; }
  h1 span { font-size: 13px; color: #888; font-weight: normal; }
  
  #pinLockScreen {
    position: fixed; inset: 0; background: #0d0d0d;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    z-index: 100000; padding: 20px;
  }
  #pinLockScreen h2 { color: var(--primary); margin-bottom: 8px; font-size: 18px; }
  #pinLockScreen p { color: #888; font-size: 13px; margin-bottom: 20px; text-align: center; }
  #pinInput {
    width: 100%; max-width: 260px; padding: 14px; background: #1c1c1c;
    border: 1px solid #2c2c2c; border-radius: 8px; color: #fff;
    font-size: 20px; text-align: center; letter-spacing: 4px; margin-bottom: 12px;
    outline: none;
  }
  #pinInput:focus { border-color: var(--primary); }
  #pinSubmitBtn {
    width: 100%; max-width: 260px; padding: 12px; background: var(--primary);
    border: none; border-radius: 8px; color: #000; font-weight: 600;
    font-size: 15px; cursor: pointer;
  }
  #pinError { color: #ff5555; font-size: 12px; margin-top: 10px; min-height: 16px; }

  #onlineBadge {
    margin-left: auto;
    font-size: 12px; color: #aaa;
    display: flex; align-items: center; gap: 5px;
    background: #1c1c1c; border: 3px solid transparent;
    padding: 4px 10px; border-radius: 9px;
  }
  #onlineBadge .dot-live {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--primary); flex-shrink: 0;
  }

  #folderRow {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 16px 0 12px;
  }
  .pill-btn {
    flex: 1 1 calc(50% - 4px);
    min-width: 120px;
    padding: 10px 14px;
    background: #1c1c1c;
    border: 3px solid transparent;
    border-radius: 8px;
    color: #fff;
    font-size: 13px;
    cursor: pointer;
  }
  .pill-btn:active { background: #262626; }

  #folderMenu {
    display: none; background: #161616; border: 1px solid #2c2c2c; border-radius: 8px;
    margin-bottom: 12px; max-height: 240px; overflow-y: auto;
  }
  #folderMenu .frow {
    padding: 10px 14px; font-size: 13px; border-bottom: 1px solid #232323; cursor: pointer;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  #folderMenu .frow:active { background: var(--primary); color:#000; }
  #folderMenu .empty { padding: 14px; color: #666; font-size: 13px; text-align:center; }

  #playlist {
    list-style: none;
    border: 3px solid #232323;
    border-radius: 10px;
    overflow: hidden;
    margin-bottom: 20px;
    max-height: 46vh;
    overflow-y: auto;
  }
  #playlist li {
    padding: 12px 14px;
    font-size: 14px;
    border-bottom: 1px solid #1c1c1c;
    cursor: pointer;
    display: flex; align-items: center; gap: 8px;
  }
  #playlist li:last-child { border-bottom: none; }
  #playlist li.active { background: var(--primary); color: #000; font-weight: 600; }
  #playlist li .dot {
  width: 16px; height: 16px; object-fit: contain; flex-shrink: 0; display: none;
  }
  #playlist li.active .dot { display: block;}
  #playlist .empty { padding: 20px; text-align:center; color:#666; font-size: 13px; }

  #nowPlaying {
    font-size: 14px; color: #ccc; margin-bottom: 10px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    display: flex; align-items: center; gap: 8px;
  }
  .mini-spinner {
    width: 12px; height: 12px; flex-shrink: 0;
    border: 2px solid #444; border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  #bar {
    position: fixed; bottom: 0; left: 0; right: 0;
    background: #141414; border-top: 1px solid #262626;
    padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  }

  #progressRow { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  #progressRow span { font-size: 11px; color: #999; width: 34px; flex-shrink: 0; }

  #volumeRow { display: none; align-items: center; gap: 8px; margin-bottom: 10px; }
  #volumeRow svg { width: 18px; height: 18px; flex-shrink: 0; opacity: 0.7; }
  #volumeRow input[type=range] { flex: 1; }
    input[type=range] {
    -webkit-appearance: none; appearance: none; flex: 1; height: 4px;
    border-radius: 2px; outline: none;
    background: linear-gradient(to right, var(--primary) 0%, var(--primary) 0%, #333 0%, #333 100%);
    }
    input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%;
    background: var(--primary); cursor: pointer;
    }

  #controls { display: flex; align-items: center; justify-content: center; gap: 26px; margin-bottom: 10px; }
  .ctl-btn {
    background: none; border: none; cursor: pointer; color: #fff;
    display: flex; align-items: center; justify-content: center;
  }
  .ctl-btn.play { 
    background: var(--primary); width: 54px; height: 54px; border-radius: 50%;
  }
  .ctl-btn svg { width: 22px; height: 22px; }
  .ctl-btn.play svg { width: 24px; height: 24px; }
    #searchRow {
    position: relative;
    margin-bottom: 12px;
  }
  #searchInput {
    width: 100%;
    padding: 10px 36px 10px 14px;
    background: #1c1c1c;
    border: 3px solid transparent;
    border-radius: 8px;
    color: #fff;
    font-size: 14px;
    outline: none;
  }
  #searchInput:focus {
    border-color: var(--primary);
  }
  #clearSearchBtn {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: #888;
    font-size: 18px;
    cursor: pointer;
    padding: 4px 6px;
    line-height: 1;
  }

    #bar { cursor: pointer; }

  #nowPlayingView {
    position: fixed;
    inset: 0;
    background: #0d0d0d;
    z-index: 999;
    display: none;
    flex-direction: column;
    padding: 20px 24px calc(24px + env(safe-area-inset-bottom));
  }
  #nowPlayingView.open { display: flex; }

  #npHeader {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 30px; font-size: 13px; color: #999;
  }
  #npCollapseBtn {
    background: none; border: none; color: #fff; font-size: 18px; cursor: pointer;
    width: 24px;
  }

  #npArtworkWrap {
    flex: 1;
    display: flex; align-items: center; justify-content: center;
    min-height: 0;
  }
  #npArtworkWrap {
    flex: 1;
    display: flex; align-items: center; justify-content: center;
    min-height: 0;
    width: 100%;
  }
  #npArtwork {
    width: min(100%, 340px);
    height: min(100%, 340px);
    aspect-ratio: 1 / 1;
    object-fit: fill;
    object-position: center;
    display: block;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
  }

  #npTitle {
    font-size: 18px; font-weight: 600; text-align: center;
    margin: 24px 0 16px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  #npProgressRow { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
  #npProgressRow span { font-size: 12px; color: #999; width: 36px; flex-shrink: 0; }

  #npControls {
    display: flex; align-items: center; justify-content: center; gap: 28px;
  }

    #miniNowPlaying {
    display: flex; align-items: center; gap: 10px;
    margin-bottom: 10px; cursor: pointer;
  }
  #miniArtwork {
    width: 40px; height: 40px; border-radius: 6px; object-fit: cover;
    flex-shrink: 0; background: #222;
  }
  #miniTitle {
    flex: 1; font-size: 13px; color: #ddd;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  #playlist::-webkit-scrollbar {
  width: 6px;
}
#playlist::-webkit-scrollbar-track {
  border-radius: 5px;
  background: rgba(33, 33, 33, 0.5);
  backdrop-filter: blur(4px);
}
#playlist::-webkit-scrollbar-thumb {
  background: var(--primary);
  border-radius: 5px;
}
#playlist::-webkit-scrollbar-thumb:hover {
  background: var(--primary-dark);
}

#onlineBadge.offline-mode {
    background: var(--primary);
    color: #000000;
}


  #expandHint { color: #666; font-size: 12px; }
  .ctl-btn.play.big { width: 68px; height: 68px; }
  .ctl-btn.play.big svg { width: 28px; height: 28px; }

    .ctl-btn.small svg { width: 18px; height: 18px; opacity: 0.6; }
  .ctl-btn.small.active svg { opacity: 1; }
  .ctl-btn.small.active { color: var(--primary); }
</style>
<link rel="manifest" href="/manifest.json">
</head>
<body>
<div id="pinLockScreen">
  <h2>Enter PIN</h2>
  <p>This player is locked. Ask the host for the PIN.</p>
  <input type="text" id="pinInput" placeholder="••••" inputmode="numeric" maxlength="20" />
  <button id="pinSubmitBtn">Unlock</button>
  <div id="pinError"></div>
</div>

<h1><img src="/build/kat.png" /> NeonKat <span></span></h1>

<div id="installBanner" style="display:none; align-items:center; justify-content:space-between; background:#1c1c1c; border-radius:8px; padding:10px 14px; margin-bottom:12px; font-size:13px;">
  <span>Install NeonKat for offline access</span>
  <div style="display:flex; gap:8px;">
    <button id="installBtn" style="background:var(--primary); border:none; color:#000; padding:6px 12px; border-radius:6px; font-size:12px; cursor:pointer;">Install</button>
    <button id="dismissInstallBtn" style="background:none; border:none; color:#888; padding:6px; cursor:pointer; font-size:12px;">✕</button>
  </div>
</div>

<div id="onlineBadge"><span class="dot-live"></span><span id="onlineCount">1</span></div>

<div id="folderRow">
  <button class="pill-btn" id="folderBtn">Switch Library</button>
  <button class="pill-btn" id="downloadAllBtn">Cache playlist</button>
  <button class="pill-btn" id="offlineToggleBtn">Go Offline</button>
  <button class="pill-btn" id="clearCacheBtn">Clear Cache</button>
</div>


<div id="folderMenu"></div>

<div id="searchRow">
  <input type="text" id="searchInput" placeholder="Search tracks..." />
  <button id="clearSearchBtn" style="display:none;">×</button>
</div>

<div id="nowPlaying">No track loaded</div>

<ul id="playlist"><li class="empty">Loading playlist…</li></ul>

<div id="bar">

<div id="miniNowPlaying">
  <img id="miniArtwork" src="/build/kat.png" />
  <span id="miniTitle">Nothing playing</span>
  <span id="expandHint">▲</span>
</div>
  <div id="progressRow">
    <span id="curTime">0:00</span>
    <input type="range" id="seek" min="0" max="100" value="0" step="0.1">
    <span id="durTime">0:00</span>
  </div>
  <div id="volumeRow">
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-.77-3.29-2-4.24v8.48c1.23-.95 2-2.47 2-4.24z"/></svg>
    <input type="range" id="volumeSlider" min="0" max="1" value="1" step="0.01">
  </div>
  <div id="controls">
    <button class="ctl-btn small" id="shuffleBtn" title="Shuffle">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
    </button>
    <button class="ctl-btn" id="prevBtn" title="Previous">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
    </button>
    <button class="ctl-btn play" id="playBtn" title="Play">
      <svg id="playIcon" viewBox="0 0 24 24" fill="black"><path d="M8 5v14l11-7z"/></svg>
    </button>
    <button class="ctl-btn" id="nextBtn" title="Next">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z"/></svg>
    </button>
    <button class="ctl-btn small" id="repeatBtn" title="Repeat">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
    </button>
  </div>
</div>

<audio id="audio"></audio>
<div id="nowPlayingView">
  <div id="npHeader">
    <button id="npCollapseBtn">▼</button>
    <span>Now Playing</span>
    <div style="width:24px;"></div>
  </div>
  <div id="npArtworkWrap">
    <img id="npArtwork" src="/build/kat.png" />
  </div>
  <div id="npTitle">No track loaded</div>
  <div id="npProgressRow">
    <span id="npCurTime">0:00</span>
    <input type="range" id="npSeek" min="0" max="100" value="0" step="0.1">
    <span id="npDurTime">0:00</span>
  </div>
  <div id="npControls">
    <button class="ctl-btn small" id="npShuffleBtn" title="Shuffle">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
    </button>
    <button class="ctl-btn" id="npPrevBtn" title="Previous">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
    </button>
    <button class="ctl-btn play big" id="npPlayBtn" title="Play">
      <svg id="npPlayIcon" viewBox="0 0 24 24" fill="black"><path d="M8 5v14l11-7z"/></svg>
    </button>
    <button class="ctl-btn" id="npNextBtn" title="Next">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z"/></svg>
    </button>
    <button class="ctl-btn small" id="npRepeatBtn" title="Repeat">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
    </button>
  </div>
</div>

<script>
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(reg => console.log('SW registered', reg))
    .catch(err => {
      document.title = 'SW FAILED: ' + err.message;
      alert('SW registration failed: ' + err.message);
    });
} else {
  alert('serviceWorker not supported in this context');
}
let playlist = [];
let currentIndex = -1;

const SID = (() => {
  let s = localStorage.getItem('neonkat_sid');
  if (!s) {
    s = 'sid-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    localStorage.setItem('neonkat_sid', s);
  }
  return s;
})();

function isMobileDevice() {
  var uaMobile = /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(navigator.userAgent);
  var noFinePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  return uaMobile || noFinePointer;
}



const audio = document.getElementById('audio');
const playlistEl = document.getElementById('playlist');
const nowPlayingEl = document.getElementById('nowPlaying');
const playBtn = document.getElementById('playBtn');
const playIcon = document.getElementById('playIcon');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const seek = document.getElementById('seek');
const curTime = document.getElementById('curTime');
const durTime = document.getElementById('durTime');
const folderBtn = document.getElementById('folderBtn');
const folderMenu = document.getElementById('folderMenu');
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
let searchTerm = '';
let isShuffled = false;
let repeatMode = false; 
const shuffleBtn = document.getElementById('shuffleBtn');
const repeatBtn = document.getElementById('repeatBtn');
const nowPlayingView = document.getElementById('nowPlayingView');
const npCollapseBtn = document.getElementById('npCollapseBtn');
const npArtwork = document.getElementById('npArtwork');
const npTitle = document.getElementById('npTitle');
const npSeek = document.getElementById('npSeek');
const npCurTime = document.getElementById('npCurTime');
const npDurTime = document.getElementById('npDurTime');
const npPlayBtn = document.getElementById('npPlayBtn');
const npPlayIcon = document.getElementById('npPlayIcon');
const npPrevBtn = document.getElementById('npPrevBtn');
const npNextBtn = document.getElementById('npNextBtn');
const npShuffleBtn = document.getElementById('npShuffleBtn');
const npRepeatBtn = document.getElementById('npRepeatBtn');
const bar = document.getElementById('bar');
const volumeRow = document.getElementById('volumeRow');
const volumeSlider = document.getElementById('volumeSlider');
const miniTitle = document.getElementById('miniTitle');
const miniArtwork = document.getElementById('miniArtwork');
let playlistPollInterval = null;
let onlinePollInterval = null;
const offlineToggleBtn = document.getElementById('offlineToggleBtn');

if (!isMobileDevice()) {
  volumeRow.style.display = 'flex';
  var savedVol = localStorage.getItem('neonkat_web_volume');
  if (savedVol !== null) {
    audio.volume = parseFloat(savedVol);
    volumeSlider.value = savedVol;
  }
  volumeSlider.addEventListener('input', () => {
    audio.volume = parseFloat(volumeSlider.value);
    localStorage.setItem('neonkat_web_volume', volumeSlider.value);
  });
}

let isCachingAll = false;

async function updateDownloadAllButtonState() {
  if (isCachingAll) return; 
  const btn = document.getElementById('downloadAllBtn');
  if (!('caches' in window) || playlist.length === 0) {
    btn.textContent = 'Cache playlist';
    btn.disabled = false;
    return;
  }
  const cache = await caches.open('neonkat-tracks-v1');
  const lib = getLibraryName();
  let allCached = true;
  for (const item of playlist) {
    const key = '/offline/' + encodeURIComponent(lib) + '/' + encodeURIComponent(item.name) + '/stream';
    const match = await cache.match(key);
    if (!match) { allCached = false; break; }
  }
  btn.textContent = allCached ? 'Fully cached' : 'Cache playlist';
  btn.disabled = allCached;
}

function formatTime(s) {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return m + ':' + sec;
}


function updateRangeFill(input) {
  const min = parseFloat(input.min) || 0;
  const max = parseFloat(input.max) || 100;
  const val = parseFloat(input.value) || 0;
  const pct = ((val - min) / (max - min)) * 100;
  input.style.background = 'linear-gradient(to right, var(--primary) ' + pct + '%, #333 ' + pct + '%)';
}

[seek, npSeek, volumeSlider].forEach(input => {
  input.addEventListener('input', () => updateRangeFill(input));
  input.addEventListener('change', () => updateRangeFill(input));
  updateRangeFill(input);
});



function renderPlaylist() {
  playlistEl.innerHTML = '';

  const filtered = searchTerm
    ? playlist.filter(item => item.name.toLowerCase().includes(searchTerm))
    : playlist;

  if (playlist.length === 0) {
    playlistEl.innerHTML = '<li class="empty">Playlist is empty  load a folder on the desktop app.</li>';
    return;
  }

  if (filtered.length === 0) {
    playlistEl.innerHTML = '<li class="empty">No tracks match your search.</li>';
    return;
  }

filtered.forEach(item => {
    const li = document.createElement('li');
    const dot = document.createElement('img');
    dot.className = 'dot';
    dot.src = '/build/bars.gif';
    const label = document.createElement('span');
    label.textContent = item.name;
    label.style.flex = '1';

    const offlineIcon = document.createElement('span');
    offlineIcon.className = 'offline-icon';
    offlineIcon.dataset.idx = item.index;
    offlineIcon.style.cssText = 'font-size:14px; cursor:pointer; opacity:0.5; padding:4px;';
    offlineIcon.textContent = '⬇';
    offlineIcon.title = 'Download for offline';
    offlineIcon.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (offlineIcon.dataset.cached === '1') return;
      offlineIcon.textContent = '…';
      await downloadTrackForOffline(item.index, getLibraryName());
      offlineIcon.textContent = '\u2713';
      offlineIcon.dataset.cached = '1';
      offlineIcon.style.opacity = '1';
      offlineIcon.style.color = 'var(--primary)';
    });

    li.appendChild(dot);
    li.appendChild(label);
    li.appendChild(offlineIcon);
    if (item.index === currentIndex) li.classList.add('active');
    li.addEventListener('click', () => playIndex(item.index));
    playlistEl.appendChild(li);
});

refreshOfflineIndicators();
updateDownloadAllButtonState();
}

function getLibraryName() {
  return window._currentLibrary || localStorage.getItem('neonkat_current_lib') || 'default';
}

async function downloadTrackForOffline(idx, lib) {
  if (!lib) lib = getLibraryName();
  const item = playlist.find(p => p.index === idx);
  if (!item) return;
  const streamUrl = '/api/stream/' + idx + '?sid=' + SID + '&full=1';
  const artUrl = '/api/art/' + idx + '?sid=' + SID + '&v=' + encodeURIComponent(item.name);
  const streamKey = '/offline/' + encodeURIComponent(lib) + '/' + encodeURIComponent(item.name) + '/stream';
  const artKey = '/offline/' + encodeURIComponent(lib) + '/' + encodeURIComponent(item.name) + '/art';
  const cache = await caches.open('neonkat-tracks-v1');
  const existing = await cache.match(streamKey);
  if (existing) return;
  const [streamRes, artRes] = await Promise.all([
    fetch(streamUrl),
    fetch(artUrl).catch(() => null)
  ]);
  if (streamRes && streamRes.ok) await cache.put(streamKey, streamRes.clone());
  if (artRes && artRes.ok) await cache.put(artKey, artRes.clone());
}

async function refreshOfflineIndicators() {
  if (!('caches' in window)) return;
  const cache = await caches.open('neonkat-tracks-v1');
  const lib = getLibraryName();
  const icons = document.querySelectorAll('.offline-icon');
  for (const icon of icons) {
    const idx = icon.dataset.idx;
    const item = playlist.find(p => p.index === parseInt(idx));
    if (!item) continue;
    const key = '/offline/' + encodeURIComponent(lib) + '/' + encodeURIComponent(item.name) + '/stream';
    const match = await cache.match(key);
    if (match) {
      icon.textContent = '\u2713';
      icon.dataset.cached = '1';
      icon.style.opacity = '1';
      icon.style.color = 'var(--primary)';
    }
  }
}

function handleAuthFailure() {
  localStorage.removeItem(AUTH_KEY);
  showLockScreen();
  var pinInputEl = document.getElementById('pinInput');
  if (pinInputEl) pinInputEl.focus();
}

let isOfflineMode = localStorage.getItem('neonkat_offline_mode') === '1';

async function loadPlaylist(preserveIndex, fresh) {
  if (isOfflineMode) return;
  if (preserveIndex === undefined) preserveIndex = true;
  if (fresh === undefined) fresh = false;
  try {
    const url = '/api/playlist?sid=' + SID + (fresh ? '&fresh=1' : '');
    const res = await fetch(url);
    if (res.status === 401) { handleAuthFailure(); return; }
    const data = await res.json();
    playlist = data.tracks;
    if (data.folderName) setCurrentLibrary(data.folderName);
    if (!preserveIndex) currentIndex = -1;
    renderPlaylist();
  } catch (e) {
    console.warn('Playlist fetch failed, staying offline');
  }
}

let _lastStreamUrl = null;
let _lastArtUrl = null;

async function playIndex(idx) {
  const item = playlist.find(p => p.index === idx);
  if (!item) return;

  const lib = window._currentLibrary || 'default';
  const streamKey = '/offline/' + encodeURIComponent(lib) + '/' + encodeURIComponent(item.name) + '/stream';
  const artKey = '/offline/' + encodeURIComponent(lib) + '/' + encodeURIComponent(item.name) + '/art';

  let cachedStream = null;
  let cachedArt = null;
  if ('caches' in window) {
    const cache = await caches.open('neonkat-tracks-v1');
    cachedStream = await cache.match(streamKey);
    cachedArt = await cache.match(artKey);
  }

  if (isOfflineMode && !cachedStream) {
    alert('"' + item.name + '" is not downloaded for offline playback.');
    return;
  }

  currentIndex = idx;

  npArtwork.src = '/build/kat.png';
  miniArtwork.src = '/build/kat.png';

  if (_lastStreamUrl && _lastStreamUrl.startsWith('blob:')) URL.revokeObjectURL(_lastStreamUrl);
  if (_lastArtUrl && _lastArtUrl.startsWith('blob:')) URL.revokeObjectURL(_lastArtUrl);
  _lastStreamUrl = null;
  _lastArtUrl = null;

  let streamSrc = '/api/stream/' + idx + '?sid=' + SID;
  let artSrc = null;

  if (cachedStream) {
    const blob = await cachedStream.blob();
    streamSrc = URL.createObjectURL(blob);
    _lastStreamUrl = streamSrc;
  }
  if (cachedArt) {
    const blob = await cachedArt.blob();
    artSrc = URL.createObjectURL(blob);
    _lastArtUrl = artSrc;
  }

  if (artSrc) {
    npArtwork.src = artSrc;
    miniArtwork.src = artSrc;
  } else if (!isOfflineMode) {
    const onlineArt = '/api/art/' + idx + '?sid=' + SID + '&v=' + encodeURIComponent(item.name);
    npArtwork.src = onlineArt;
    miniArtwork.src = onlineArt;
  }

  npArtwork.onerror = () => { npArtwork.src = '/build/kat.png'; };
  miniArtwork.onerror = () => { miniArtwork.src = '/build/kat.png'; };

  audio.src = streamSrc;
  audio.play().catch(e => console.warn('Play blocked:', e));
  nowPlayingEl.textContent = item.name;
  npTitle.textContent = item.name;
  miniTitle.textContent = item.name;

  renderPlaylist();
  scrollToCurrentTrack();
}

function scrollToCurrentTrack() {
  const activeEl = playlistEl.querySelector('li.active');
  if (!activeEl) return;
  activeEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

let deferredInstallPrompt = null;
const installBanner = document.getElementById('installBanner');
const installBtn = document.getElementById('installBtn');
const dismissInstallBtn = document.getElementById('dismissInstallBtn');

document.getElementById('clearCacheBtn').addEventListener('click', async () => {
  if (!confirm('This will delete all downloaded tracks and cached libraries. Continue?')) return;

  const btn = document.getElementById('clearCacheBtn');
  btn.textContent = 'Clearing...';

  try {
    if ('caches' in window) {
      await caches.delete('neonkat-tracks-v1');
      await caches.delete('neonkat-shell-v2');
    }
    localStorage.removeItem('neonkat_offline_libs');
    localStorage.removeItem('neonkat_offline_mode');
    localStorage.removeItem('neonkat_current_lib');

    isOfflineMode = false;
    setOfflineMode(false);

    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) await r.unregister();
    }

    alert('Cache cleared. Reloading…');
    location.reload();
  } catch (e) {
    console.error('Clear cache failed', e);
    btn.textContent = '🗑 Clear Cache';
    alert('Failed to clear cache: ' + e.message);
  }
});


document.getElementById('downloadAllBtn').addEventListener('click', async () => {
  const btn = document.getElementById('downloadAllBtn');
  if (btn.disabled || isCachingAll) return;
  isCachingAll = true;
  btn.textContent = 'Caching...';
  const lib = getLibraryName();

  const offlineLibs = JSON.parse(localStorage.getItem('neonkat_offline_libs') || '{}');
  offlineLibs[lib] = playlist.map(p => ({ index: p.index, name: p.name }));
  localStorage.setItem('neonkat_offline_libs', JSON.stringify(offlineLibs));

  const BATCH_SIZE = 3;
  for (let i = 0; i < playlist.length; i += BATCH_SIZE) {
    const batch = playlist.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(item => downloadTrackForOffline(item.index, lib)));
    btn.textContent = 'Caching... ' + Math.min(i + BATCH_SIZE, playlist.length) + '/' + playlist.length;
  }

  isCachingAll = false;
  refreshOfflineIndicators();
  await updateDownloadAllButtonState();
  alert('Library "' + lib + '" cached for offline.');
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (localStorage.getItem('neonkat_install_dismissed') !== '1') {
    installBanner.style.display = 'flex';
  }
});

installBtn.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installBanner.style.display = 'none';
});

dismissInstallBtn.addEventListener('click', () => {
  installBanner.style.display = 'none';
  localStorage.setItem('neonkat_install_dismissed', '1');
});

window.addEventListener('appinstalled', () => {
  installBanner.style.display = 'none';
});

playBtn.addEventListener('click', () => {
  if (currentIndex === -1 && playlist.length > 0) {
    playIndex(playlist[0].index);
    return;
  }
  if (audio.paused) audio.play().catch(()=>{});
  else audio.pause();
});

function getNextIndex() {
  if (playlist.length === 0) return -1;
  if (isShuffled) {
    if (playlist.length === 1) return playlist[0].index;
    let randomPos;
    let pos = playlist.findIndex(p => p.index === currentIndex);
    do {
      randomPos = Math.floor(Math.random() * playlist.length);
    } while (randomPos === pos);
    return playlist[randomPos].index;
  }
  const pos = playlist.findIndex(p => p.index === currentIndex);
  const newPos = pos === -1 || pos >= playlist.length - 1 ? 0 : pos + 1;
  return playlist[newPos].index;
}

function getPrevIndex() {
  if (playlist.length === 0) return -1;
  if (isShuffled) {
    return getNextIndex(); 
  }
  const pos = playlist.findIndex(p => p.index === currentIndex);
  const newPos = pos <= 0 ? playlist.length - 1 : pos - 1;
  return playlist[newPos].index;
}


audio.addEventListener('play', () => {
  const icon = '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>';
  playIcon.innerHTML = icon;
  npPlayIcon.innerHTML = icon;
  const activeDot = playlistEl.querySelector('li.active .dot');
  if (activeDot) activeDot.style.display = 'block';
});

audio.addEventListener('pause', () => {
  const icon = '<path d="M8 5v14l11-7z"/>';
  playIcon.innerHTML = icon;
  npPlayIcon.innerHTML = icon;
  const activeDot = playlistEl.querySelector('li.active .dot');
  if (activeDot) activeDot.style.display = 'none';
});


bar.addEventListener('click', (e) => {
  if (e.target.closest('.ctl-btn') || e.target.closest('#seek') || e.target.closest('#volumeRow')) return;
  if (currentIndex === -1) return;
  nowPlayingView.classList.add('open');
});

npCollapseBtn.addEventListener('click', () => {
  nowPlayingView.classList.remove('open');
});

prevBtn.addEventListener('click', () => {
  const idx = getPrevIndex();
  if (idx !== -1) playIndex(idx);
});

nextBtn.addEventListener('click', () => {
  const idx = getNextIndex();
  if (idx !== -1) playIndex(idx);
});

shuffleBtn.addEventListener('click', () => {
  isShuffled = !isShuffled;
  shuffleBtn.classList.toggle('active', isShuffled);
  npShuffleBtn.classList.toggle('active', isShuffled);
});

repeatBtn.addEventListener('click', () => {
  repeatMode = !repeatMode;
  repeatBtn.classList.toggle('active', repeatMode);
  npRepeatBtn.classList.toggle('active', repeatMode);
});

npPlayBtn.addEventListener('click', () => {
  if (currentIndex === -1 && playlist.length > 0) {
    playIndex(playlist[0].index);
    return;
  }
  if (audio.paused) audio.play().catch(()=>{});
  else audio.pause();
});

npPrevBtn.addEventListener('click', () => {
  const idx = getPrevIndex();
  if (idx !== -1) playIndex(idx);
});

npNextBtn.addEventListener('click', () => {
  const idx = getNextIndex();
  if (idx !== -1) playIndex(idx);
});

npShuffleBtn.addEventListener('click', () => {
  isShuffled = !isShuffled;
  shuffleBtn.classList.toggle('active', isShuffled);
  npShuffleBtn.classList.toggle('active', isShuffled);
});

npRepeatBtn.addEventListener('click', () => {
  repeatMode = !repeatMode;
  repeatBtn.classList.toggle('active', repeatMode);
  npRepeatBtn.classList.toggle('active', repeatMode);
});




audio.addEventListener('ended', () => {
  if (repeatMode) {
    audio.currentTime = 0;
    audio.play();
    return;
  }
  nextBtn.click();
});
audio.addEventListener('timeupdate', () => {
  if (audio.duration && isFinite(audio.duration) && !isDraggingSeek) {
    seek.max = audio.duration;
    seek.value = audio.currentTime;
    updateRangeFill(seek);
    updateRangeFill(npSeek);
    curTime.textContent = formatTime(audio.currentTime);
    durTime.textContent = formatTime(audio.duration);

    npSeek.max = audio.duration;
    npSeek.value = audio.currentTime;
    npCurTime.textContent = formatTime(audio.currentTime);
    npDurTime.textContent = formatTime(audio.duration);
  }
});

npSeek.addEventListener('input', () => {
  isDraggingSeek = true;
  npCurTime.textContent = formatTime(parseFloat(npSeek.value));
});
npSeek.addEventListener('change', () => {
  const t = parseFloat(npSeek.value);
  if (!isNaN(t) && audio.duration) audio.currentTime = t;
  isDraggingSeek = false;
});
let isDraggingSeek = false;

searchInput.addEventListener('input', () => {
  searchTerm = searchInput.value.toLowerCase().trim();
  clearSearchBtn.style.display = searchTerm ? 'block' : 'none';
  renderPlaylist();
});

clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  searchTerm = '';
  clearSearchBtn.style.display = 'none';
  renderPlaylist();
});

seek.addEventListener('input', () => {
  isDraggingSeek = true;
  curTime.textContent = formatTime(parseFloat(seek.value));
});

seek.addEventListener('change', () => {
  const t = parseFloat(seek.value);
  if (!isNaN(t) && audio.duration) audio.currentTime = t;
  isDraggingSeek = false;
});


folderBtn.addEventListener('click', async () => {
  const isOpen = folderMenu.style.display === 'block';
  if (isOpen) { folderMenu.style.display = 'none'; return; }
  folderMenu.innerHTML = '';

  if (isOfflineMode) {
    const offlineLibs = JSON.parse(localStorage.getItem('neonkat_offline_libs') || '{}');
    const libNames = Object.keys(offlineLibs);
    if (libNames.length === 0) {
      folderMenu.innerHTML = '<div class="empty">No cached libraries</div>';
    } else {
      libNames.forEach(lib => {
        const row = document.createElement('div');
        row.className = 'frow';
        row.textContent = lib + ' (cached)';
        row.addEventListener('click', () => {
          loadOfflineLibrary(lib);
          folderMenu.style.display = 'none';
        });
        folderMenu.appendChild(row);
      });
    }
    folderMenu.style.display = 'block';
    return;
  }

  let folders = [];
  let isOffline = false;

  try {
    const res = await fetch('/api/recent-folders?sid=' + SID);
    if (res.status === 401) { handleAuthFailure(); return; }
    folders = await res.json();
  } catch (e) {
    isOffline = true;
  }

  if (isOffline || folders.length === 0) {
    const offlineLibs = JSON.parse(localStorage.getItem('neonkat_offline_libs') || '{}');
    const libNames = Object.keys(offlineLibs);
    if (libNames.length === 0) {
      folderMenu.innerHTML = '<div class="empty">No cached libraries</div>';
    } else {
      libNames.forEach(lib => {
        const row = document.createElement('div');
        row.className = 'frow';
        row.textContent = '💾 ' + lib;
        row.addEventListener('click', () => {
          loadOfflineLibrary(lib);
          folderMenu.style.display = 'none';
        });
        folderMenu.appendChild(row);
      });
    }
  } else {
    const offlineLibs = JSON.parse(localStorage.getItem('neonkat_offline_libs') || '{}');
    const cachedLibNames = Object.keys(offlineLibs);

    folders.forEach(p => {
      const row = document.createElement('div');
      row.className = 'frow';
      const folderName = p.split(/[\\/]/).pop();
      const isCached = cachedLibNames.includes(folderName);
      row.textContent = folderName + (isCached ? ' (cached)' : '');
      row.title = p;
      row.addEventListener('click', async () => {
        isOfflineMode = false;
        setCurrentLibrary(folderName);
        await fetch('/api/load-folder?sid=' + SID, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderPath: p })
        });
        folderMenu.style.display = 'none';
        nowPlayingEl.innerHTML = '<span class="mini-spinner"></span><span>Loading library…</span>';
        setTimeout(async () => {
          await loadPlaylist(false, true);
          if (currentIndex === -1) nowPlayingEl.textContent = 'No track loaded';
        }, 1500);
      });
      folderMenu.appendChild(row);
    });
  }

  folderMenu.style.display = 'block';
});

function loadOfflineLibrary(lib) {
  const offlineLibs = JSON.parse(localStorage.getItem('neonkat_offline_libs') || '{}');
  const tracks = offlineLibs[lib];
  if (!tracks) {
    playlist = [];
    currentIndex = -1;
    renderPlaylist();
    nowPlayingEl.textContent = 'No offline library cached for "' + lib + '"';
    npTitle.textContent = 'No offline library cached';
    return;
  }
  isOfflineMode = true;
  setCurrentLibrary(lib);
  playlist = tracks;
  currentIndex = -1;
  renderPlaylist();
  nowPlayingEl.textContent = 'Offline: ' + lib;
  npTitle.textContent = 'Offline: ' + lib;
}

function setOfflineMode(val) {
  isOfflineMode = val;
  localStorage.setItem('neonkat_offline_mode', val ? '1' : '0');
  offlineToggleBtn.textContent = val ? 'Go Online' : 'Go Offline';
  offlineToggleBtn.classList.toggle('active', val);

  const badge = document.getElementById('onlineBadge');
  badge.classList.toggle('offline-mode', val);
  badge.innerHTML = val
    ? '<span class="dot-live"></span>Offline'
    : '<span class="dot-live"></span><span id="onlineCount">' + (document.getElementById('onlineCount')?.textContent || '1') + '</span>';
}

const AUTH_KEY = 'neonkat_authed';

async function verifyPin(pin) {
  try {
    const res = await fetch('/api/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sid: SID, pin: pin })
    });
    return await res.json();
  } catch (e) {
    return { success: false, message: 'Connection error' };
  }
}

function showLockScreen() {
  document.getElementById('pinLockScreen').style.display = 'flex';
}

function hideLockScreen() {
  document.getElementById('pinLockScreen').style.display = 'none';
}

function initApp() {
  hideLockScreen();

  const savedLib = localStorage.getItem('neonkat_current_lib');
  if (savedLib) window._currentLibrary = savedLib;

  setOfflineMode(isOfflineMode);

  if (isOfflineMode) {
    loadOfflineLibrary(getLibraryName());
  } else {
    loadPlaylist();
  }
    updateDownloadAllButtonState();

  playlistPollInterval = setInterval(() => {
    if (!isOfflineMode) loadPlaylist(true);
  }, 6000);

  onlinePollInterval = setInterval(() => {
    if (!isOfflineMode) pollOnlineCount();
  }, 8000);

  if (!isOfflineMode) pollOnlineCount();
}
function setCurrentLibrary(name) {
  window._currentLibrary = name;
  localStorage.setItem('neonkat_current_lib', name);
}

const pinInput = document.getElementById('pinInput');
const pinSubmitBtn = document.getElementById('pinSubmitBtn');
const pinError = document.getElementById('pinError');

let lockoutTimer = null;

async function submitPinAttempt() {
  const pin = pinInput.value.trim();
  if (!pin) return;
  pinSubmitBtn.disabled = true;
  pinSubmitBtn.textContent = 'Checking...';
  const result = await verifyPin(pin);
  if (result.success) {
    localStorage.setItem(AUTH_KEY, '1');
    initApp();
    return;
  }

  pinError.textContent = result.message || 'Wrong PIN';
  pinInput.value = '';

  if (result.retryAfterMs && result.retryAfterMs > 0) {
    startLockoutCountdown(result.retryAfterMs);
  } else {
    pinSubmitBtn.disabled = false;
    pinSubmitBtn.textContent = 'Unlock';
    pinInput.focus();
  }
}

function startLockoutCountdown(ms) {
  clearInterval(lockoutTimer);
  let remaining = Math.ceil(ms / 1000);
  pinSubmitBtn.disabled = true;
  const tick = () => {
    if (remaining <= 0) {
      clearInterval(lockoutTimer);
      pinSubmitBtn.disabled = false;
      pinSubmitBtn.textContent = 'Unlock';
      pinError.textContent = '';
      pinInput.focus();
      return;
    }
    pinSubmitBtn.textContent = 'Wait ' + remaining + 's';
    remaining -= 1;
  };
  tick();
  lockoutTimer = setInterval(tick, 1000);
}


pinSubmitBtn.addEventListener('click', submitPinAttempt);
pinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitPinAttempt(); });
if (localStorage.getItem(AUTH_KEY) === '1') {
  initApp();
} else {
  showLockScreen();
  pinInput.focus();
}

offlineToggleBtn.addEventListener('click', () => {
  if (isOfflineMode) {
    setOfflineMode(false);
    loadPlaylist(false, true);
  } else {
    setOfflineMode(true);
    loadOfflineLibrary(getLibraryName());
  }
});

async function pollOnlineCount() {
  try {
    const res = await fetch('/api/online-count?sid=' + SID);
    if (res.status === 401) { handleAuthFailure(); return; }
    const data = await res.json();
    const el = document.getElementById('onlineCount');
    if (el) el.textContent = data.count;
  } catch (e) {
    console.error('Failed to fetch online count', e);
  }
}

</script>
</body>
</html>`;

function startMediaServer() {
  if (mediaServer) return Promise.resolve(mediaServerPort);
  mediaServer = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const pathname = decodeURIComponent(url.pathname);
if (pathname === '/api/verify-pin' && req.method === 'POST') {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const { sid, pin } = JSON.parse(body);
      const attemptKey = getAttemptKey(sid, req);

      const gate = checkAttemptAllowed(attemptKey);
      if (!gate.allowed) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          message: 'Too many attempts. Try again in ' + Math.ceil(gate.retryAfterMs / 1000) + 's',
          retryAfterMs: gate.retryAfterMs
        }));
        return;
      }

      if (!hasPin()) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Server not set up yet' }));
        return;
      }

      if (checkPin(pin)) {
        recordSuccessfulAttempt(attemptKey);
        authenticatedSids.add(sid);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } else {
        recordFailedAttempt(attemptKey);
        const entry = failedAttempts.get(attemptKey);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          message: 'Wrong PIN',
          retryAfterMs: entry ? getCooldownMs(entry.count) : 0
        }));
      }
    } catch (e) {
      res.writeHead(400); res.end('Bad request');
    }
  });
  return;
}

      const isPageShell = pathname === '/' || pathname === '/index.html';
      const isStaticAsset = pathname === '/styles.css' || pathname === '/jsmediatags.min.js' || pathname === '/hls.js@latest' || pathname === '/manifest.json' || pathname === '/sw.js' || pathname.startsWith('/build/');
      if (!isPageShell && !isStaticAsset) {
        const sid = url.searchParams.get('sid');
        if (!isAuthed(sid)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'unauthorized' }));
          return;
        }
      }

      if (pathname === '/sw.js') {
        serveStaticFile(res, path.join(__dirname, 'public/sw.js'), 'application/javascript');
        return;
      }
      if (pathname === '/manifest.json') {
        serveStaticFile(res, path.join(__dirname, 'public/manifest.json'), 'application/json');
        return;
      }

      if (pathname === '/kat.svg') {
        res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
        res.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="8" fill="#1a1a2e"/>
            <polygon points="8,20 4,6 13,13" fill="#a88cff"/>
            <polygon points="24,20 28,6 19,13" fill="#a88cff"/>
            <ellipse cx="16" cy="21" rx="13" ry="11" fill="#1a1a2e" stroke="#a88cff" stroke-width="1.5"/>
            <ellipse cx="11" cy="19" rx="3" ry="3.5" fill="#a88cff"/>
            <ellipse cx="21" cy="19" rx="3" ry="3.5" fill="#a88cff"/>
            <ellipse cx="11" cy="20" rx="1.2" ry="2.5" fill="#1a1a2e"/>
            <ellipse cx="21" cy="20" rx="1.2" ry="2.5" fill="#1a1a2e"/>
            <polygon points="16,25 14,27.5 18,27.5" fill="#ff88cc"/>
        </svg>`);
        return;
        }

       if (pathname === '/api/recent-folders') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(mediaServerRecentFolders));
        return;
      }

      if (pathname === '/api/online-count') {
        const sid = url.searchParams.get('sid');
        touchSession(sid);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ count: getOnlineCount() }));
        return;
      }

      const loadFolderMatch = pathname === '/api/load-folder' && req.method === 'POST';
      if (loadFolderMatch) {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const { folderPath } = JSON.parse(body);
            if (mainWindowRef) mainWindowRef.webContents.send('remote-requested-folder', folderPath);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } catch (e) {
            res.writeHead(400); res.end('Bad request');
          }
        });
        return;
      }

      if (pathname === '/' || pathname === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(REMOTE_PLAYER_HTML);
        return;
      }

      if (pathname === '/styles.css') {
        serveStaticFile(res, path.join(__dirname, 'styles.css'));
        return;
      }

      if (pathname === '/jsmediatags.min.js' || pathname === '/hls.js@latest') {
        serveStaticFile(res, path.join(__dirname, pathname), 'application/javascript');
        return;
      }

        if (pathname.startsWith('/build/')) {
        const safePath = path.join(__dirname, pathname).normalize();
        if (!safePath.startsWith(path.join(__dirname, 'build'))) {
            res.writeHead(403); res.end('Forbidden'); return;
        }
        serveStaticFile(res, safePath);
        return;
        }

      if (pathname === '/api/playlist') {
        const sid = url.searchParams.get('sid');
        const fresh = url.searchParams.get('fresh') === '1';
        const list = getSessionPlaylist(sid, fresh);
        const list2 = list.map((item, i) => ({
          index: i, name: item.name || 'Unknown Track', type: item.type
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
        tracks: list2,
        folderName: list.length > 0 && list[0].path 
          ? path.basename(path.dirname(list[0].path)) 
          : 'Library'
      }));
        return;
      }


      const streamMatch = pathname.match(/^\/api\/stream\/(\d+)$/);
      if (streamMatch) {
        const idx = parseInt(streamMatch[1], 10);
        const sid = url.searchParams.get('sid');
        const forceFull = url.searchParams.get('full') === '1';
        const item = getSessionPlaylist(sid)[idx];
        if (!item) { res.writeHead(404); res.end('Not found'); return; }

        if (item.type === 'file') {
          const filePath = item.path;
          const stat = await fs.stat(filePath).catch(() => null);
          if (!stat) { res.writeHead(404); res.end('File missing'); return; }
          const ext = path.extname(filePath);
          const mime = mimeFromExt(ext);
          const range = forceFull ? null : req.headers.range;

          if (range) {
            const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
            const start = parseInt(startStr, 10);
            const end = endStr ? parseInt(endStr, 10) : stat.size - 1;
            res.writeHead(206, {
              'Content-Range': `bytes ${start}-${end}/${stat.size}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': end - start + 1,
              'Content-Type': mime
            });
            fsSync.createReadStream(filePath, { start, end }).pipe(res);
            } else {
                  res.writeHead(200, {
                    'Content-Length': stat.size,
                    'Content-Type': mime,
                    'Accept-Ranges': 'bytes'
                  });
                  fsSync.createReadStream(filePath).pipe(res);
                }
                return;
              }

        if (item.url) {
          res.writeHead(302, { Location: item.url });
          res.end();
          return;
        }

        res.writeHead(404); res.end('No source');
        return;
      }

      const artMatch = pathname.match(/^\/api\/art\/(\d+)$/);
      if (artMatch) {
        const idx = parseInt(artMatch[1], 10);
        const sid = url.searchParams.get('sid');
        const item = getSessionPlaylist(sid)[idx];
        if (!item) { res.writeHead(404); res.end(); return; }

        if (item.albumArt || item.artwork) {
          res.writeHead(302, { Location: item.albumArt || item.artwork });
          res.end();
          return;
        }

        if (item.type === 'file') {
          const dir = path.dirname(item.path);
          const candidates = ['cover.jpg', 'folder.jpg', 'cover.png', 'folder.png'];
          let foundFolderArt = false;
          for (const name of candidates) {
            const p = path.join(dir, name);
            if (fsSync.existsSync(p)) {
              res.writeHead(200, { 'Content-Type': mimeFromExt(path.extname(name)) });
              fsSync.createReadStream(p).pipe(res);
              foundFolderArt = true;
              break;
            }
          }
          if (foundFolderArt) return;

          if (artCache.has(item.path)) {
            const { mime, buffer } = artCache.get(item.path);
            res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' });
            res.end(buffer);
            return;
          }

          try {
            const buffer = await extractEmbeddedArt(item.path);
            if (buffer) {
              artCache.set(item.path, { mime: 'image/jpeg', buffer });
                 res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' });
              res.end(buffer);
              return;
            }
          } catch (e) {
            console.warn('[art] embedded extraction failed:', e.message);
          }
        }

        res.writeHead(404); res.end();
        return;
      }

      res.writeHead(404); res.end('Not found');
    } catch (err) {
      console.error('[MediaServer] error:', err);
      res.writeHead(500); res.end('Server error');
    }
  });

  return new Promise((resolve) => {
    mediaServer.listen(13337, '0.0.0.0', () => {
      mediaServerPort = mediaServer.address().port;
      resolve(mediaServerPort);
    });
  });
}

function stopMediaServer() {
  if (mediaServer) {
    mediaServer.close();
    mediaServer = null;
    mediaServerPort = null;
  }
}

function getMediaServerStatus() {
  return mediaServer
    ? { running: true, url: `http://${getLocalIp()}:${mediaServerPort}` }
    : { running: false };
}

function syncPlaylist(playlist) {
  mediaServerPlaylist = Array.isArray(playlist) ? playlist : [];
  artCache.clear();
}

function syncRecentFolders(folders) {
  mediaServerRecentFolders = Array.isArray(folders) ? folders : [];
}

function setMainWindow(win) {
  mainWindowRef = win;
}

function resetPin() {
  currentPin = null;
  authenticatedSids.clear();
  failedAttempts.clear();
}



module.exports = {
  startMediaServer,
  stopMediaServer,
  getMediaServerStatus,
  syncPlaylist,
  syncRecentFolders,
  setMainWindow,
  getLocalIp,
  hasPin,
  setPin,
  resetPin
};

