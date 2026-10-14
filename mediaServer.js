const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

let currentPin = null;
const SECRET_FILE = path.join(os.homedir(), '.neonkat-secret');
const TOKEN_TTL_MS = 10 * 365 * 24 * 60 * 60 * 1000;

let secret;
try { secret = fsSync.readFileSync(SECRET_FILE, 'utf8').trim(); } catch {}
if (!secret) {
  secret = crypto.randomBytes(32).toString('hex');
  fsSync.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
}

function sign(data) {
  return crypto.createHmac('sha256', secret + '|' + currentPin).update(data).digest('base64url');
}

function makeToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + TOKEN_TTL_MS })).toString('base64url');
  return payload + '.' + sign(payload);
}

function verifyToken(token) {
  if (!token || !currentPin) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now();
  } catch { return false; }
}

function isAuthed(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ') && verifyToken(h.slice(7))) return true;
  const t = new URL(req.url, 'http://x').searchParams.get('t');
  return verifyToken(t);
}
const MAX_BODY_BYTES = 100 * 1024; 

function hasPin() {
  return !!currentPin;
}

function setPin(pin) {
  currentPin = String(pin);
}

function checkPin(pin) {
  return !!currentPin && String(pin) === currentPin;
}


const failedAttempts = new Map();

function getAttemptKey(sid, req) {
  const xff = req.headers['x-forwarded-for'];
  const ip = xff ? xff.split(',')[0].trim() : (req.socket.remoteAddress || 'unknown');
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


function readBodyLimited(req, maxBytes, cb) {
  let body = '';
  let tooLarge = false;
  req.on('data', chunk => {
    if (tooLarge) return;
    body += chunk;
    if (body.length > maxBytes) {
      tooLarge = true;
      req.destroy();
      cb(new Error('Payload too large'), null);
    }
  });
  req.on('end', () => {
    if (tooLarge) return; 
    cb(null, body);
  });
  req.on('error', (err) => {
    if (!tooLarge) cb(err, null);
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
    padding: 20px 16px 220px;
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

.pill-btn.active { background: var(--primary); color: #000; }
#playlistsPanel .frow {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 14px; border-bottom: 1px solid #232323;
}
#playlistsPanel .frow:last-child { border-bottom: none; }
#playlistsPanel .frow span:first-child { font-size: 13px; }
#playlistsPanel .plist-back-row {
  cursor: pointer; color: var(--primary); font-weight: 600;
}
#playlistsPanel .plist-back-row:active { background: #1f1f1f; }
.plist-del-btn {
  background: none; border: 1px solid #33333300; border-radius: 6px;
  color: #999; font-size: 11px; padding: 5px 10px; cursor: pointer;
}
.plist-del-btn:active { background: #ff0000; color: white; }
#playlist li input[type="checkbox"] {
  width: 16px; height: 16px; margin-right: 4px; flex-shrink: 0;
  accent-color: var(--primary);
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
  <button class="pill-btn" id="downloadAllBtn">Cache Library</button>
  <button class="pill-btn" id="offlineToggleBtn">Go Offline</button>
  <button class="pill-btn" id="clearCacheBtn">Clear Cache</button>
  <button class="pill-btn" id="playlistsBtn" style="flex-basis:100%;">Playlists</button>
  <div id="playlistsPanel" style="display:none; width:100%; box-sizing:border-box; background:#161616; border:1px solid #2c2c2c00; border-radius:8px; margin-bottom:12px; max-height:240px; overflow-y:auto;"></div>
</div>


<div id="folderMenu"></div>

<div id="searchRow">
  <input type="text" id="searchInput" placeholder="Search tracks..." />
  <button id="clearSearchBtn" style="display:none;">×</button>
</div>

<div id="selectRow" style="display:flex; gap:8px; margin-bottom:12px;">
  <button class="pill-btn" id="selectBtn" style="flex:0 0 auto; padding:8px 14px;">Select tracks</button>
  <button class="pill-btn" id="saveSelectionBtn" style="display:none; flex:0 0 auto; padding:8px 14px; background:var(--primary); color:#000;">Save as playlist</button>
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

    <button class="ctl-btn small" id="settingsBtn" title="Settings">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>
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

<div id="settingsSheet" style="
  position: fixed; inset: 0; z-index: 9999;
  display: none;
">
  <div id="settingsOverlay" style="
    position: absolute; inset: 0;
    background: rgba(0,0,0,0.5);
  "></div>
  <div id="settingsPanel" style="
    position: absolute; bottom: 0; left: 0; right: 0;
    background: #141414; border-radius: 16px 16px 0 0;
    border-top: 1px solid #2c2c2c;
    padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
    transform: translateY(100%);
    transition: transform 0.3s ease;
  ">
    <div style="width:40px; height:4px; background:#333; border-radius:2px; margin:0 auto 20px;"></div>
    
    <div style="font-size:13px; color:#aaa; margin-bottom:12px; font-weight:600;">Equalizer</div>
    
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <span style="font-size:12px; color:#666;">Bands</span>
      <button id="eqResetBtn" style="background:none; border:none; color:var(--primary); font-size:12px; cursor:pointer;">Reset</button>
    </div>

    <div style="display:flex; justify-content:space-between; gap:8px; margin-bottom:16px;">
      <div style="display:flex; flex-direction:column; align-items:center; gap:6px; flex:1;">
        <span style="font-size:10px; color:#888;">SUB</span>
        <input type="range" id="eqSubSlider" min="-12" max="18" value="0" step="1" orient="vertical" style="writing-mode:vertical-lr; direction:rtl; height:80px; width:24px;">
        <span id="eqSubVal" style="font-size:10px; color:#aaa;">0</span>
      </div>
      <div style="display:flex; flex-direction:column; align-items:center; gap:6px; flex:1;">
        <span style="font-size:10px; color:#888;">BASS</span>
        <input type="range" id="eqBassSlider" min="-12" max="18" value="0" step="1" orient="vertical" style="writing-mode:vertical-lr; direction:rtl; height:80px; width:24px;">
        <span id="eqBassVal" style="font-size:10px; color:#aaa;">0</span>
      </div>
      <div style="display:flex; flex-direction:column; align-items:center; gap:6px; flex:1;">
        <span style="font-size:10px; color:#888;">MID</span>
        <input type="range" id="eqMidSlider" min="-12" max="18" value="0" step="1" orient="vertical" style="writing-mode:vertical-lr; direction:rtl; height:80px; width:24px;">
        <span id="eqMidVal" style="font-size:10px; color:#aaa;">0</span>
      </div>
      <div style="display:flex; flex-direction:column; align-items:center; gap:6px; flex:1;">
        <span style="font-size:10px; color:#888;">TREBLE</span>
        <input type="range" id="eqTrebleSlider" min="-12" max="18" value="0" step="1" orient="vertical" style="writing-mode:vertical-lr; direction:rtl; height:80px; width:24px;">
        <span id="eqTrebleVal" style="font-size:10px; color:#aaa;">0</span>
      </div>
      <div style="display:flex; flex-direction:column; align-items:center; gap:6px; flex:1;">
        <span style="font-size:10px; color:#888;">PRES</span>
        <input type="range" id="eqPresenceSlider" min="-12" max="18" value="0" step="1" orient="vertical" style="writing-mode:vertical-lr; direction:rtl; height:80px; width:24px;">
        <span id="eqPresenceVal" style="font-size:10px; color:#aaa;">0</span>
      </div>
    </div>

    <div style="display:flex; flex-wrap:wrap; gap:6px;">
      <button class="eq-preset" data-preset="flat" style="flex:1; padding:6px; background:#212121; border:none; border-radius:6px; color:#fff; font-size:11px; cursor:pointer;">Flat</button>
      <button class="eq-preset" data-preset="bassBoost" style="flex:1; padding:6px; background:#212121; border:none; border-radius:6px; color:#fff; font-size:11px; cursor:pointer;">Bass Boost</button>
      <button class="eq-preset" data-preset="vocal" style="flex:1; padding:6px; background:#212121; border:none; border-radius:6px; color:#fff; font-size:11px; cursor:pointer;">Vocal</button>
      <button class="eq-preset" data-preset="electronic" style="flex:1; padding:6px; background:#212121; border:none; border-radius:6px; color:#fff; font-size:11px; cursor:pointer;">Electronic</button>
      <button class="eq-preset" data-preset="rock" style="flex:1; padding:6px; background:#212121; border:none; border-radius:6px; color:#fff; font-size:11px; cursor:pointer;">Rock</button>
    </div>
  </div>
</div>

<script>
function crumb(s) {
  localStorage.setItem('crumb', (localStorage.getItem('crumb') || '') + s + ' ');
}
const old = localStorage.getItem('crumb');
if (old) { alert('LAST RUN: ' + old); localStorage.removeItem('crumb'); }
const TOKEN_KEY = 'neonkat_token';
const tok = () => localStorage.getItem(TOKEN_KEY) || '';
const withTok = (u) => u + (u.includes('?') ? '&' : '?') + 't=' + encodeURIComponent(tok());

const _fetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  if (tok()) {
    init.headers = new Headers(init.headers || {});
    init.headers.set('Authorization', 'Bearer ' + tok());
  }
  return _fetch(input, init);
};

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

function isIOS() {
  const ua = navigator.userAgent;
  const isAppleMobile = /iPad|iPhone|iPod/.test(ua);
  const isIPadOS13Plus = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return isAppleMobile || isIPadOS13Plus;
}
const IS_IOS = isIOS();


let selectedTracks = new Map();
let webAudioCtx = null;
let webGainNode = null;
let eqBands = {};

if (!IS_IOS) {
  webAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  webGainNode = webAudioCtx.createGain();

  const eqSub = webAudioCtx.createBiquadFilter();
  eqSub.type = 'lowshelf'; eqSub.frequency.value = 60;

  const eqBass = webAudioCtx.createBiquadFilter();
  eqBass.type = 'peaking'; eqBass.frequency.value = 200; eqBass.Q.value = 1;

  const eqMid = webAudioCtx.createBiquadFilter();
  eqMid.type = 'peaking'; eqMid.frequency.value = 1000; eqMid.Q.value = 1;

  const eqTreble = webAudioCtx.createBiquadFilter();
  eqTreble.type = 'peaking'; eqTreble.frequency.value = 4000; eqTreble.Q.value = 1;

  const eqPresence = webAudioCtx.createBiquadFilter();
  eqPresence.type = 'highshelf'; eqPresence.frequency.value = 9000;

  const webSource = webAudioCtx.createMediaElementSource(audio);
  webSource.connect(webGainNode);
  webGainNode.connect(eqSub);
  eqSub.connect(eqBass);
  eqBass.connect(eqMid);
  eqMid.connect(eqTreble);
  eqTreble.connect(eqPresence);
  eqPresence.connect(webAudioCtx.destination);

  eqBands = { sub: eqSub, bass: eqBass, mid: eqMid, treble: eqTreble, presence: eqPresence };
  Object.entries(eqBands).forEach(([key, filter]) => {
    filter.gain.value = parseFloat(localStorage.getItem('neonkat_web_eq_' + key) || '0');
  });
}

let loudnessMap = {};

const playlistsBtn = document.getElementById('playlistsBtn');
const playlistsPanel = document.getElementById('playlistsPanel');
const selectBtn = document.getElementById('selectBtn');
const saveSelectionBtn = document.getElementById('saveSelectionBtn');

let _fullLibraryPlaylist = null;
let selectMode = false;
let selectedNames = new Set();

function getCustomPlaylists() {
  return JSON.parse(localStorage.getItem('neonkat_custom_playlists') || '{}');
}
function saveCustomPlaylists(obj) {
  localStorage.setItem('neonkat_custom_playlists', JSON.stringify(obj));
}

function toggleSelectMode() {
  selectMode = !selectMode;
  selectBtn.classList.toggle('active', selectMode);
  saveSelectionBtn.style.display = selectMode ? 'block' : 'none';
  updateSaveSelectionLabel();
  renderPlaylist();
}
function updateSaveSelectionLabel() {
  saveSelectionBtn.textContent = 'Save as playlist' + (selectedTracks.size ? ' (' + selectedTracks.size + ')' : '');
}

function openPlaylistsPanel() {
  const isOpen = playlistsPanel.style.display === 'block';
  if (isOpen) { playlistsPanel.style.display = 'none'; return; }
  renderPlaylistsPanel();
  playlistsPanel.style.display = 'block';
}

function renderPlaylistsPanel() {
  const custom = getCustomPlaylists();
  const names = Object.keys(custom);
  playlistsPanel.innerHTML = '';

  if (names.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No saved playlists yet. Tap "Select tracks" to build one.';
    playlistsPanel.appendChild(empty);
  }

  names.forEach(name => {
    const row = document.createElement('div');
    row.className = 'frow';

    const label = document.createElement('span');
    label.textContent = name + ' (' + getPlaylistTracks(custom[name]).length + ')';
    label.style.flex = '1';
    label.style.cursor = 'pointer';
    label.addEventListener('click', () => loadCustomPlaylist(name));

    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.className = 'plist-del-btn';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm('Delete playlist "' + name + '"?')) return;
      const c = getCustomPlaylists();
      delete c[name];
      saveCustomPlaylists(c);
      renderPlaylistsPanel();
    });

    row.appendChild(label);
    row.appendChild(del);
    playlistsPanel.appendChild(row);
  });
}

function loadCustomPlaylist(name) {
  const custom = getCustomPlaylists();
  const entry = custom[name];
  if (!entry || (!entry.tracks && !entry.names)) {
    alert('This playlist looks corrupted and cant be loaded. Delete it and make a new one.');
    return;
  }

  let tracks = entry.tracks;

  if (!tracks && Array.isArray(entry.names)) {
    const source = _fullLibraryPlaylist || playlist;
    const byName = new Map(source.map(p => [p.name, p]));
    tracks = entry.names.map(n => byName.get(n)).filter(Boolean)
      .map(p => ({ name: p.name, path: p.path, url: p.url }));

    if (tracks.length === 0) {
      alert('This playlist was saved before cross-library support. Load the "' + entry.lib + '" library first, then re-save it.');
      return;
    }
    custom[name] = { tracks };
    saveCustomPlaylists(custom);
  }

  if (!tracks || tracks.length === 0) return;

  if (!_fullLibraryPlaylist) _fullLibraryPlaylist = playlist;
playlist = tracks.map((t, i) => ({
  index: -(1000000 + i), name: t.name, path: t.path, url: t.url, custom: true, lib: t.lib || null
}));
window._currentLibrary = '__playlist__' + name;
currentIndex = -1;
renderPlaylist();
playlistsPanel.style.display = 'none';
if (playlist.length > 0) {
  playIndex(playlist[0].index);
} else {
  nowPlayingEl.textContent = 'Playlist: ' + name;
}
}

function saveSelectionAsPlaylist() {
  if (selectedTracks.size === 0) { alert('Check some tracks first.'); return; }
  const custom = getCustomPlaylists();
  const existingNames = Object.keys(custom);
  const name = prompt(
    'Playlist name (type an existing name to add these tracks to it):' +
    (existingNames.length ? 'Existing: ' + existingNames.join(', ') : '')
  );
  if (!name) return;

  const existing = custom[name];
  const existingTracks = existing ? getPlaylistTracks(existing) : [];
  const seen = new Set(existingTracks.map(t => t.path || t.name));
  const merged = existingTracks.slice();

  selectedTracks.forEach(t => {
    const key = t.path || t.name;
    if (!seen.has(key)) { merged.push(t); seen.add(key); }
  });

  custom[name] = { tracks: merged };
  saveCustomPlaylists(custom);
  selectedTracks.clear();
  toggleSelectMode();
  alert((existing ? 'Updated "' : 'Saved "') + name + '" - now ' + merged.length + ' tracks.');
}
playlistsBtn.addEventListener('click', openPlaylistsPanel);
selectBtn.addEventListener('click', toggleSelectMode);
saveSelectionBtn.addEventListener('click', saveSelectionAsPlaylist);

async function fetchLoudnessMap() {
  try {
    const res = await fetch('/api/loudness-map?sid=' + SID);
    if (res.ok) {
      loudnessMap = await res.json();
    }
  } catch (e) {
    console.warn('Could not fetch loudness map:', e);
  }
}

function applyLoudnessGain(trackName, overrideGain) {
  if (!webAudioCtx) return;
  let gain = overrideGain != null ? overrideGain : loudnessMap[trackName];
  if (gain == null && isOfflineMode) {
    const offlineLoudness = JSON.parse(localStorage.getItem('neonkat_offline_loudness') || '{}');
    gain = offlineLoudness[trackName];
  }
  if (gain != null && isFinite(gain)) {
    const now = webAudioCtx.currentTime;
    webGainNode.gain.cancelScheduledValues(now);
    webGainNode.gain.setValueAtTime(webGainNode.gain.value, now);
    webGainNode.gain.linearRampToValueAtTime(gain, now + 0.3);
  } else {
    webGainNode.gain.setTargetAtTime(1.0, webAudioCtx.currentTime, 0.1);
  }
}

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


const eqPresets = {
  flat:       { sub: 0,  bass: 0,  mid: 0,  treble: 0,  presence: 0  },
  bassBoost:  { sub: 8,  bass: 6,  mid: 0,  treble: 0,  presence: 0  },
  vocal:      { sub: -4, bass: -2, mid: 6,  treble: 3,  presence: 2  },
  electronic: { sub: 10, bass: 6,  mid: -2, treble: 4,  presence: 4  },
  rock:       { sub: 4,  bass: 4,  mid: -2, treble: 4,  presence: 3  }
};

const eqSliderMap = {
  sub: document.getElementById('eqSubSlider'),
  bass: document.getElementById('eqBassSlider'),
  mid: document.getElementById('eqMidSlider'),
  treble: document.getElementById('eqTrebleSlider'),
  presence: document.getElementById('eqPresenceSlider')
};

const eqValMap = {
  sub: document.getElementById('eqSubVal'),
  bass: document.getElementById('eqBassVal'),
  mid: document.getElementById('eqMidVal'),
  treble: document.getElementById('eqTrebleVal'),
  presence: document.getElementById('eqPresenceVal')
};

function setWebEqBand(key, value) {
  if (!eqBands[key]) return;
  const v = Number(value);
  eqBands[key].gain.value = v;
  eqSliderMap[key].value = v;
  eqValMap[key].textContent = v > 0 ? '+' + v : v;
  localStorage.setItem('neonkat_web_eq_' + key, v);
}


Object.keys(eqBands).forEach(key => {
  const saved = parseFloat(localStorage.getItem('neonkat_web_eq_' + key) || '0');
  setWebEqBand(key, saved);
  eqSliderMap[key].addEventListener('input', () => setWebEqBand(key, eqSliderMap[key].value));
});

const settingsBtn = document.getElementById('settingsBtn');
const settingsSheet = document.getElementById('settingsSheet');
const settingsPanel = document.getElementById('settingsPanel');
const settingsOverlay = document.getElementById('settingsOverlay');
if (IS_IOS) settingsBtn.style.display = 'none';

function openSettings() {
  settingsSheet.style.display = 'block';
  requestAnimationFrame(() => {
    settingsPanel.style.transform = 'translateY(0)';
  });
}

function closeSettings() {
  settingsPanel.style.transform = 'translateY(100%)';
  setTimeout(() => { settingsSheet.style.display = 'none'; }, 300);
}

settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  openSettings();
});
settingsOverlay.addEventListener('click', closeSettings);

document.getElementById('eqResetBtn').addEventListener('click', () => {
  Object.keys(eqBands).forEach(key => setWebEqBand(key, 0));
});

document.querySelectorAll('.eq-preset').forEach(btn => {
  btn.addEventListener('click', () => {
    const preset = eqPresets[btn.dataset.preset];
    if (!preset) return;
    Object.entries(preset).forEach(([key, val]) => setWebEqBand(key, val));
    document.querySelectorAll('.eq-preset').forEach(b => { b.style.background = '#212121'; b.style.color = '#fff'; });
    btn.style.background = 'var(--primary)';
    btn.style.color = '#000';
  });
});


async function updateDownloadAllButtonState() {
  if (isCachingAll) return; 
  const btn = document.getElementById('downloadAllBtn');
  if (!('caches' in window) || playlist.length === 0) {
    btn.textContent = 'Cache Library';
    btn.disabled = false;
    return;
  }
  const cache = await caches.open('neonkat-tracks-v1');
  let allCached = true;
  for (const item of playlist) {
    const lib = item.custom ? (item.lib || 'default') : getLibraryName();
    const key = '/offline/' + encodeURIComponent(lib) + '/' + encodeURIComponent(item.name) + '/stream';
    const match = await cache.match(key);
    if (!match) { allCached = false; break; }
  }
  btn.textContent = allCached ? 'Fully cached' : 'Cache Library';
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
    if (cachedStreamPaths.has(streamKeyFor(item))) setIconCached(offlineIcon);
    offlineIcon.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (offlineIcon.dataset.cached === '1') return;
      offlineIcon.textContent = '…';
      await downloadTrackForOffline(item.index, getLibraryName());
      await refreshOfflineIndicators();
    });

    if (selectMode) {
      const key = item.path || item.name;
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = selectedTracks.has(key);
      cb.addEventListener('click', (e) => e.stopPropagation());
      cb.addEventListener('change', () => {
        if (cb.checked) selectedTracks.set(key, { name: item.name, path: item.path, url: item.url, gain: loudnessMap[item.name], lib: getLibraryName() });
        else selectedTracks.delete(key);
        updateSaveSelectionLabel();
      });
      li.appendChild(cb);
    }

    li.appendChild(dot);
    li.appendChild(label);
    li.appendChild(offlineIcon);
    if (item.index === currentIndex) {
      li.classList.add('active');
      dot.style.display = audio.paused ? 'none' : 'block';
    }
    li.addEventListener('click', () => {playIndex(item.index); });
    playlistEl.appendChild(li);
});

refreshOfflineIndicators();
updateDownloadAllButtonState();
}

function getLibraryName() {
  return window._currentLibrary || localStorage.getItem('neonkat_current_lib') || 'default';
}

function getPlaylistTracks(entry) {
  return entry.tracks || entry.names || [];
}

async function downloadTrackForOffline(idx, lib) {
  const item = playlist.find(p => p.index === idx);
  if (!item) return;
  if (!lib) lib = item.custom ? (item.lib || 'default') : getLibraryName();
  const streamUrl = item.custom
    ? '/api/stream-path?path=' + encodeURIComponent(item.path) + '&full=1'
    : '/api/stream/' + idx + '?sid=' + SID + '&full=1';
  const artUrl = item.custom
    ? '/api/art-path?path=' + encodeURIComponent(item.path)
    : '/api/art/' + idx + '?sid=' + SID + '&v=' + encodeURIComponent(item.name);
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

let cachedStreamPaths = new Set();

function streamKeyFor(item) {
  const lib = item.custom ? (item.lib || 'default') : getLibraryName();
  const key = '/offline/' + encodeURIComponent(lib) + '/' + encodeURIComponent(item.name) + '/stream';
  return new URL(key, location.origin).pathname;
}

function setIconCached(icon) {
  icon.textContent = '\u2713';
  icon.dataset.cached = '1';
  icon.style.opacity = '1';
  icon.style.color = 'var(--primary)';
}

async function refreshOfflineIndicators() {
  if (!('caches' in window)) return;
  const cache = await caches.open('neonkat-tracks-v1');
  const reqs = await cache.keys();
  cachedStreamPaths = new Set(reqs.map(r => new URL(r.url).pathname));
  document.querySelectorAll('.offline-icon').forEach(icon => {
    const item = playlist.find(p => p.index === parseInt(icon.dataset.idx));
    if (item && cachedStreamPaths.has(streamKeyFor(item))) setIconCached(icon);
  });
}

function handleAuthFailure() {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(TOKEN_KEY);
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

    if (_fullLibraryPlaylist) {
      _fullLibraryPlaylist = data.tracks;
      if (data.folderName) setCurrentLibrary(data.folderName);
      return;
    }

    const newTracks = data.tracks;
    const changed = JSON.stringify(newTracks) !== JSON.stringify(playlist);

    playlist = newTracks;
    if (data.folderName) setCurrentLibrary(data.folderName);
    if (!preserveIndex) currentIndex = -1;
    if (changed || !preserveIndex) renderPlaylist();
  } catch (e) {
    console.warn('Playlist fetch failed, staying offline');
  }
}

let _lastStreamUrl = null;
let _lastArtUrl = null;




async function playIndex(idx) {
if (webAudioCtx && webAudioCtx.state !== 'running') {
  await webAudioCtx.resume().catch(()=>{});
}
  const item = playlist.find(p => p.index === idx);
  if (!item) return;

const lib = item.custom ? (item.lib || 'default') : (window._currentLibrary || 'default');
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

  let streamSrc = withTok((item.custom
    ? '/api/stream-path?path=' + encodeURIComponent(item.path) + '&sid=' + SID
    : '/api/stream/' + idx + '?sid=' + SID) + '&_=' + Date.now());
  let artSrc = null;

  if (cachedStream) {
    streamSrc = streamKey;
  }
  if (cachedArt) {
    const blob = await cachedArt.blob();
    artSrc = URL.createObjectURL(blob);
    _lastArtUrl = artSrc;
  }

  let onlineArtUrl = null;
  if (artSrc) {
    npArtwork.src = artSrc;
    miniArtwork.src = artSrc;
  } else if (!isOfflineMode) {
    const onlineArt = withTok(item.custom
  ? '/api/art-path?path=' + encodeURIComponent(item.path) + '&sid=' + SID
  : '/api/art/' + idx + '?sid=' + SID + '&v=' + encodeURIComponent(item.name));
    onlineArtUrl = new URL(onlineArt, location.origin).href;
    npArtwork.src = onlineArt;
    miniArtwork.src = onlineArt;
  }

  npArtwork.onerror = () => { npArtwork.src = '/build/kat.png'; };
  miniArtwork.onerror = () => { miniArtwork.src = '/build/kat.png'; };

  audio.src = streamSrc;
  audio.play().catch(e => console.warn('Play blocked:', e));
  nowPlayingEl.textContent = item.name;
  applyLoudnessGain(item.name, item.custom ? item.gain : undefined);
  npTitle.textContent = item.name;
  miniTitle.textContent = item.name;

  renderPlaylist();
  scrollToCurrentTrack();

  if ('mediaSession' in navigator) {
  navigator.mediaSession.metadata = new MediaMetadata({
    title: item.name,
    artist: 'NeonKat',
    artwork: [{ src: artSrc || onlineArtUrl || new URL('/build/kat.png', location.origin).href, sizes: '512x512' }]
  });

  if (!artSrc && onlineArtUrl) {
    const probe = new Image();
    probe.onerror = () => {
      if (currentIndex !== idx) return;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: item.name,
        artist: 'NeonKat',
        artwork: [{ src: new URL('/build/kat.png', location.origin).href, sizes: '512x512' }]
      });
    };
    probe.src = onlineArtUrl;
  }
navigator.mediaSession.setActionHandler('play', () => audio.play().catch(()=>{}));
navigator.mediaSession.setActionHandler('pause', () => audio.pause());
  navigator.mediaSession.setActionHandler('previoustrack', () => prevBtn.click());
  navigator.mediaSession.setActionHandler('nexttrack', () => nextBtn.click());
}
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
  if (!confirm('This will delete all downloaded tracks, cached libraries, and saved playlists. Continue?')) return;

  const btn = document.getElementById('clearCacheBtn');
  btn.textContent = 'Clearing...';

  try {
    if ('caches' in window) {
      await caches.delete('neonkat-tracks-v1');
      await caches.delete('neonkat-shell-v3');
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(AUTH_KEY);
    }
    localStorage.removeItem('neonkat_offline_libs');
    localStorage.removeItem('neonkat_offline_mode');
    localStorage.removeItem('neonkat_current_lib');
    localStorage.removeItem('neonkat_custom_playlists');

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
  const offlineLoudness = JSON.parse(localStorage.getItem('neonkat_offline_loudness') || '{}');
  playlist.forEach(item => {
    const gain = loudnessMap[item.name];
    if (gain != null) offlineLoudness[item.name] = gain;
  });
  localStorage.setItem('neonkat_offline_loudness', JSON.stringify(offlineLoudness));
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
    if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) throw new Error('bad response');
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
      const folderName = p.split(/[\\/]/).filter(Boolean).pop() || p;
      const isCached = cachedLibNames.includes(folderName);
      row.textContent = folderName + (isCached ? ' (cached)' : '');
      row.title = p;
      row.addEventListener('click', async () => {
        _fullLibraryPlaylist = null;
        isOfflineMode = false;
        setCurrentLibrary(folderName);
        await fetch('/api/load-folder?sid=' + SID, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderPath: p })
        });
        folderMenu.style.display = 'none';
        nowPlayingEl.innerHTML = '<span class="mini-spinner"></span><span>Loading library…</span>';
        (async () => {
          const started = Date.now();
          let ok = false;
          while (Date.now() - started < 15000) {
            await new Promise(r => setTimeout(r, 700));
            await loadPlaylist(false, true);
            if (playlist.length > 0 && playlist[0].path && playlist[0].path.startsWith(p)) { ok = true; break; }
          }
          if (ok) {
            await new Promise(r => setTimeout(r, 1000));
            await loadPlaylist(false, true);
          }
          if (playlist.length > 0) {
            playIndex(playlist[0].index);
          } else {
            nowPlayingEl.textContent = 'No track loaded';
          }
        })();
      });
      folderMenu.appendChild(row);
    });
  }

  folderMenu.style.display = 'block';
});

function loadOfflineLibrary(lib) {
_fullLibraryPlaylist = null;
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

async function initApp() {
  clearInterval(playlistPollInterval);
  clearInterval(onlinePollInterval);
  if (!isOfflineMode) {
    const check = await fetch('/api/online-count?sid=' + SID).catch(() => null);
    if (check && check.status === 401) { handleAuthFailure(); return; }
  }
  hideLockScreen();

  const savedLib = localStorage.getItem('neonkat_current_lib');
  if (savedLib) window._currentLibrary = savedLib;

  setOfflineMode(isOfflineMode);

  if (isOfflineMode) {
    loadOfflineLibrary(getLibraryName());
  } else {
    loadPlaylist();
    fetchLoudnessMap();
    setTimeout(fetchLoudnessMap, 3000);
  }
    updateDownloadAllButtonState();

  playlistPollInterval = setInterval(() => {
    if (!isOfflineMode) loadPlaylist(true);
    fetchLoudnessMap();
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
    localStorage.setItem(TOKEN_KEY, result.token);
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
    if (el) el.textContent = data.count + ' Connected';
  } catch (e) {
    console.error('Failed to fetch online count', e);
  }
}



</script>
</body>
</html>`;


let mediaServerLoudnessMap = {};

function syncLoudnessMap(map) {
  mediaServerLoudnessMap = map || {};
}

function startMediaServer() {
  if (mediaServer) return Promise.resolve(mediaServerPort);
  mediaServer = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const pathname = decodeURIComponent(url.pathname);

      if (pathname === '/api/verify-pin' && req.method === 'POST') {
        readBodyLimited(req, MAX_BODY_BYTES, (err, body) => {
          if (err) {
            res.writeHead(413, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Request too large' }));
            return;
          }
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
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, token: makeToken() }));
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
      const isStaticAsset = pathname === '/styles.css' || pathname === '/jsmediatags.min.js' ||
        pathname === '/hls.js@latest' || pathname === '/manifest.json' || pathname === '/sw.js' ||
        pathname.startsWith('/build/');
      if (!isPageShell && !isStaticAsset) {
        if (!isAuthed(req)) {
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




      if (pathname === '/api/loudness-map') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(mediaServerLoudnessMap));
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
        readBodyLimited(req, MAX_BODY_BYTES, (err, body) => {
          if (err) {
            res.writeHead(413, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Request too large' }));
            return;
          }
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
          index: i, name: item.name || 'Unknown Track', type: item.type,
          path: item.path || null, url: item.url || null
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
          const rangeHeader = forceFull ? null : req.headers.range;

          if (rangeHeader) {
            const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
            if (!match || (!match[1] && !match[2])) {
              res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
              res.end();
              return;
            }

            let start;
            let end;
            if (match[1] && match[2]) {
              start = parseInt(match[1], 10);
              end = parseInt(match[2], 10);
            } else if (match[1]) {
              start = parseInt(match[1], 10);
              end = stat.size - 1;
            } else {
              const suffixLen = parseInt(match[2], 10);
              start = Math.max(0, stat.size - suffixLen);
              end = stat.size - 1;
            }

            start = Math.max(0, start);
            end = Math.min(stat.size - 1, end);

            if (isNaN(start) || isNaN(end) || start > end || start >= stat.size) {
              res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
              res.end();
              return;
            }

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

      if (pathname === '/api/stream-path') {
        const raw = url.searchParams.get('path');
        if (!raw) { res.writeHead(400); res.end('Missing path'); return; }
        const p = path.resolve(raw);
        const allowed = mediaServerPlaylist.some(i => i.path && path.resolve(i.path) === p) ||
          mediaServerRecentFolders.some(f => p.startsWith(path.resolve(f) + path.sep));
        if (!allowed) { res.writeHead(403); res.end('Forbidden'); return; }
        const stat = await fs.stat(p).catch(() => null);
        if (!stat) { res.writeHead(404); res.end('File missing'); return; }
        const mime = mimeFromExt(path.extname(p));
        const forceFull = url.searchParams.get('full') === '1';
        const rangeHeader = forceFull ? null : req.headers.range;

        if (rangeHeader) {
          const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
          if (!match || (!match[1] && !match[2])) {
            res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
            res.end();
            return;
          }
          let start, end;
          if (match[1] && match[2]) { start = parseInt(match[1], 10); end = parseInt(match[2], 10); }
          else if (match[1]) { start = parseInt(match[1], 10); end = stat.size - 1; }
          else { start = Math.max(0, stat.size - parseInt(match[2], 10)); end = stat.size - 1; }
          start = Math.max(0, start);
          end = Math.min(stat.size - 1, end);
          if (isNaN(start) || isNaN(end) || start > end || start >= stat.size) {
            res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
            res.end();
            return;
          }
          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Content-Type': mime
          });
          fsSync.createReadStream(p, { start, end }).pipe(res);
        } else {
          res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': mime, 'Accept-Ranges': 'bytes' });
          fsSync.createReadStream(p).pipe(res);
        }
        return;
      }

      if (pathname === '/api/art-path') {
        const raw = url.searchParams.get('path');
        if (!raw) { res.writeHead(400); res.end(); return; }
        const p = path.resolve(raw);
        const allowed = mediaServerPlaylist.some(i => i.path && path.resolve(i.path) === p) ||
          mediaServerRecentFolders.some(f => p.startsWith(path.resolve(f) + path.sep));
        if (!allowed) { res.writeHead(403); res.end('Forbidden'); return; }
        const dir = path.dirname(p);
        for (const name of ['cover.jpg', 'folder.jpg', 'cover.png', 'folder.png']) {
          const cp = path.join(dir, name);
          if (fsSync.existsSync(cp)) {
            res.writeHead(200, { 'Content-Type': mimeFromExt(path.extname(name)) });
            fsSync.createReadStream(cp).pipe(res);
            return;
          }
        }
        if (artCache.has(p)) {
          const { mime, buffer } = artCache.get(p);
          res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' });
          res.end(buffer);
          return;
        }
        try {
          const buffer = await extractEmbeddedArt(p);
          if (buffer) {
            artCache.set(p, { mime: 'image/jpeg', buffer });
            res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' });
            res.end(buffer);
            return;
          }
        } catch (e) {}
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
  resetPin,
  syncLoudnessMap
};