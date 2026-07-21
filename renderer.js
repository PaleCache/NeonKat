 const bubbleImages = [
  new Image(),
  new Image()
];
  bubbleImages[0].src = 'build/note.png'; 
  bubbleImages[1].src = 'build/note1.png'; 
  
 const katbubbleImages = [
  new Image()
];

 const nukebubbleImages = [
  new Image()
];
nukebubbleImages[0].src = 'build/nuke.png';
katbubbleImages[0].src = 'build/kat.png';
  const savePlaylistBtn = document.getElementById('savePlaylistBtn');
  const loadPlaylistBtn = document.getElementById('loadPlaylistBtn');
  let visualizerMode = localStorage.getItem('visualizerMode') || 'bars';
  const barsToggle = document.getElementById('barsToggle');
  const bubblesToggle = document.getElementById('bubblesToggle');
  const katbubblesToggle = document.getElementById('katbubblesToggle');
  const nukebubblesToggle = document.getElementById('nukebubblesToggle');
  const barsCheckbox = document.getElementById('barsCheckbox');
  const bubblesCheckbox = document.getElementById('bubblesCheckbox');
  let skipVideo = localStorage.getItem('skipVideo') === 'true';
  let videoQuality = localStorage.getItem('videoQuality') || '480';
  let selectedDuration = localStorage.getItem('videoDuration') || 30;
  const playlistElem = document.getElementById('playlist');
  const audio = document.getElementById('audio');
  const visualizerCanvas = document.getElementById('visualizer');
  const ctx = visualizerCanvas.getContext('2d');
  const volumeSlider = document.getElementById('volume');
  const progressBar = document.getElementById('progressBar');
  const currentTimeElem = document.getElementById('currentTime');
  const durationElem = document.getElementById('duration');
  const sortBtn = document.getElementById('sortBtn');
  const sortMenu = document.getElementById('sortMenu');
  let resilientAudioHls = null;
  let resilientVizHls = null;
  const audioHlsRef = { current: null };
  const vizHlsRef = { current: null };
  let audioFiles = [];
  let rainbowIntervalId = null;
  let currentIndex = 0;
  let flashIntensity = 0; 
  let isSeeking = false;
  let repeatTrack = false;
  let shuffleTrack = false;
  let notifyEnabled = localStorage.getItem('notifyEnabled') === 'true';
  let visualizerToggle = localStorage.getItem('visualizerToggle') === 'true';
  let animationFrameId = null;
  let themeColor = localStorage.getItem('themeColor') || '#a88cff';
  let isRainbowActive = localStorage.getItem('isRainbowActive') === 'true';
  const rainbowIcon = document.getElementById('rainbowIcon');
  rainbowIcon.src = isRainbowActive ? 'build/flash.svg' : 'build/flashoff.svg';
  const rainbowToggleBtn = document.getElementById('rainbowToggleBtn');
  const barsToggleBtn = document.getElementById('barsToggleBtn');
  const bubblesToggleBtn = document.getElementById('bubblesToggleBtn');
  const katbubblesToggleBtn = document.getElementById('katbubblesToggleBtn');
  const nukebubblesToggleBtn = document.getElementById('nukebubblesToggleBtn');
  let rainbowFrameId = null;
  let currentArtImage = null;
  let currentMetadataCache = new Map();
  let activeExtraArgs = localStorage.getItem('lastYtdlpArgs') || '';
  let searchLoopEnabled = localStorage.getItem('searchLoopEnabled') === 'true';
const searchLoopCheckbox = document.getElementById('searchLoopCheckbox');
const searchLoopToggle = document.getElementById('searchLoopToggle');

if (searchLoopCheckbox) searchLoopCheckbox.checked = searchLoopEnabled;

if (searchLoopToggle) {
  searchLoopToggle.addEventListener('click', (e) => {
    if (e.target.closest('input[type="checkbox"]') || e.target.closest('.slider')) return;
    searchLoopEnabled = !searchLoopEnabled;
    localStorage.setItem('searchLoopEnabled', searchLoopEnabled);
    if (searchLoopCheckbox) searchLoopCheckbox.checked = searchLoopEnabled;
  });
}

if (searchLoopCheckbox) {
  searchLoopCheckbox.addEventListener('change', () => {
    searchLoopEnabled = searchLoopCheckbox.checked;
    localStorage.setItem('searchLoopEnabled', searchLoopEnabled);
  });
}
  
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const analyser = audioCtx.createAnalyser();
analyser.fftSize = 128;
const source = audioCtx.createMediaElementSource(audio);





const makeupGain = audioCtx.createGain();
makeupGain.gain.value = 0.7;

const limiter = audioCtx.createDynamicsCompressor();
limiter.threshold.value = -9;
limiter.ratio.value = 4;
limiter.knee.value = 3;
limiter.attack.value = 0.005;
limiter.release.value = 0.100;
const inputGain = audioCtx.createGain();
inputGain.gain.value = 0.7;
const trackNormGain = audioCtx.createGain();
trackNormGain.gain.value = 1;

const postEqLimiter = audioCtx.createDynamicsCompressor();
postEqLimiter.threshold.value = 10;
postEqLimiter.ratio.value = 8;
postEqLimiter.knee.value = 6;
postEqLimiter.attack.value = 0.02;
postEqLimiter.release.value = 0.4; 

const masterGain = audioCtx.createGain();
masterGain.gain.value = 0.8;

const eqSubFilter = audioCtx.createBiquadFilter();
eqSubFilter.type = 'lowshelf';
eqSubFilter.frequency.value = 60;

const eqBassFilter = audioCtx.createBiquadFilter();
eqBassFilter.type = 'lowshelf';   
eqBassFilter.frequency.value = 200;


let bassFilterMode = localStorage.getItem('bassFilterMode') || 'peaking'; 
eqBassFilter.type = bassFilterMode;
if (bassFilterMode === 'lowshelf') eqBassFilter.frequency.value = 200;

const eqMidFilter = audioCtx.createBiquadFilter();
eqMidFilter.type = 'peaking';
eqMidFilter.frequency.value = 1000;
eqMidFilter.Q.value = 1;

const eqTrebleFilter = audioCtx.createBiquadFilter();
eqTrebleFilter.type = 'peaking';
eqTrebleFilter.frequency.value = 4000;
eqTrebleFilter.Q.value = 1;

const eqPresenceFilter = audioCtx.createBiquadFilter();
eqPresenceFilter.type = 'highshelf';
eqPresenceFilter.frequency.value = 9000;

const eqBands = {
  sub: eqSubFilter,
  bass: eqBassFilter,
  mid: eqMidFilter,
  treble: eqTrebleFilter,
  presence: eqPresenceFilter
};


Object.entries(eqBands).forEach(([key, filter]) => {
  filter.gain.value = Number(localStorage.getItem('eq_' + key) || 0);
});



const equalizerBtn = document.getElementById('equalizerBtn');
const eqModal = document.getElementById('eqModal');

const eqSliders = {
  sub: document.getElementById('eqSub'),
  bass: document.getElementById('eqBass'),
  mid: document.getElementById('eqMid'),
  treble: document.getElementById('eqTreble'),
  presence: document.getElementById('eqPresence')
};
const eqValueLabels = {
  sub: document.getElementById('eqSubValue'),
  bass: document.getElementById('eqBassValue'),
  mid: document.getElementById('eqMidValue'),
  treble: document.getElementById('eqTrebleValue'),
  presence: document.getElementById('eqPresenceValue')
};

function eqLabel(val) {
  const v = Number(val);
  if (v >= 20) return `${v} dB (HIGH)`;
  if (v <= -20) return `${v} dB (LOW)`;
  return `${v} dB`;
}

function setEqBand(key, value, save = true) {
  const v = Number(value);
  eqBands[key].gain.value = v;
  eqSliders[key].value = v;
  eqValueLabels[key].textContent = eqLabel(v);
  updateSliderBackground(eqSliders[key]);
  if (save) localStorage.setItem('eq_' + key, v);
}


Object.keys(eqBands).forEach(key => setEqBand(key, eqBands[key].gain.value, false));

equalizerBtn.addEventListener('click', () => {
  hamburgerMenu.style.display = 'none';
  menuOpen = false;
  eqModal.style.display = 'flex';
});

document.getElementById('eqCloseBtn').addEventListener('click', () => { eqModal.style.display = 'none'; });
eqModal.addEventListener('click', (e) => { if (e.target === eqModal) eqModal.style.display = 'none'; });

Object.keys(eqSliders).forEach(key => {
  eqSliders[key].addEventListener('input', () => setEqBand(key, eqSliders[key].value));
});

document.getElementById('eqResetBtn').addEventListener('click', () => {
  Object.keys(eqBands).forEach(key => setEqBand(key, 0));
});


const eqPresets = {
  flat:            { sub: 0,  bass: 0,  mid: 0,  treble: 0,  presence: 0  },
  bassBoost:       { sub: 8,  bass: 6,  mid: 0,  treble: 0,  presence: 0  },
  superBassBoost:  { sub: 12, bass: 10.5, mid: -3, treble: -2, presence: -2 },
  vocal:           { sub: -4, bass: -2, mid: 6,  treble: 3,  presence: 2  },
  trebleBoost:     { sub: -2, bass: 0,  mid: 0,  treble: 8,  presence: 6  },
  electronic:      { sub: 10, bass: 6,  mid: -2, treble: 4,  presence: 4  },
  rock:            { sub: 4,  bass: 4,  mid: -2, treble: 4,  presence: 3  }
};

document.querySelectorAll('.eq-preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const preset = eqPresets[btn.dataset.preset];
    if (!preset) return;
    Object.entries(preset).forEach(([key, val]) => setEqBand(key, val));

    document.querySelectorAll('.eq-preset-btn').forEach(b => b.style.background = '#212121');
    btn.style.background = 'var(--primary-color)';

    if (notifyEnabled && Notification.permission === 'granted') {
      window.electronAPI.notify(`EQ Preset: ${btn.textContent}`);
    }
  });
});



function buildNormChain() {
  try { source.disconnect(); } catch(e) {}
  try { trackNormGain.disconnect(); } catch(e) {}
  try { inputGain.disconnect(); } catch(e) {}
  try { makeupGain.disconnect(); } catch(e) {}
  try { limiter.disconnect(); } catch(e) {}
  Object.values(eqBands).forEach(f => { try { f.disconnect(); } catch(e) {} });
  try { postEqLimiter.disconnect(); } catch(e) {}
  try { analyser.disconnect(); } catch(e) {}
  try { masterGain.disconnect(); } catch(e) {}

  source.connect(trackNormGain);

if (normEnabled) {
    trackNormGain.connect(inputGain);
    makeupGain.connect(limiter);
    limiter.connect(eqSubFilter);
} else {
    trackNormGain.connect(eqSubFilter);
}
  eqSubFilter.connect(eqBassFilter);
  eqBassFilter.connect(eqMidFilter);   
  eqMidFilter.connect(eqTrebleFilter);
  eqTrebleFilter.connect(eqPresenceFilter);
  eqPresenceFilter.connect(postEqLimiter);
  postEqLimiter.connect(analyser);

  analyser.connect(masterGain);
  masterGain.connect(audioCtx.destination);
}

  const radioIconImg = new Image();
  radioIconImg.src = 'build/radio.svg';
  let currentSearchTerm = '';
  let src;
  let displayName;
  const repeatBtn = document.getElementById('repeatBtn');
  const shuffleBtn = document.getElementById('shuffleBtn');
  const visualizerColorPicker = document.getElementById('visualizerColor');
  const miniBtn = document.getElementById('miniPlayerBtn');
  let isMini = false;
   let jellyfinConfig = {
  server: localStorage.getItem('jellyfinServer') || '',
  token: localStorage.getItem('jellyfinToken') || '',
  userId: localStorage.getItem('jellyfinUserId') || '',
  deviceId: 'neonkat-' + Math.random().toString(36).substring(7)
};

const jellyfinStatus = document.getElementById('jellyfinStatus');
if (jellyfinConfig.token) {
  jellyfinStatus.style.display = 'block';
  jellyfinStatus.textContent = 'Connected to Jellyfin';
} else {
  jellyfinStatus.style.display = 'none';
}

updateJellyfinModalButtons();
let recentFolders = JSON.parse(localStorage.getItem('neonkatRecentFolders') || '[]');

const MAX_RECENT_FOLDERS = 100;
function addToRecentFolders(folderPath) {
  if (!folderPath || typeof folderPath !== 'string') return;
  recentFolders = recentFolders.filter(p => p !== folderPath);
  recentFolders.unshift(folderPath);
  if (recentFolders.length > MAX_RECENT_FOLDERS) {
    recentFolders = recentFolders.slice(0, MAX_RECENT_FOLDERS);
  }
  
  localStorage.setItem('neonkatRecentFolders', JSON.stringify(recentFolders));
  renderRecentFolders();
}

function getShortFolderName(fullPath) {
  const parts = fullPath.split(/[\\/]/).filter(Boolean);
  let name = parts[parts.length - 1] || 'Unknown';

  if (name.length > 45) {
    name = '…' + name.slice(-42);
  }
  return name;
}

function renderRecentFolders() {
  const container = document.getElementById('recentFolders');
   const countBadge = document.getElementById('folderCountBadge');
   countBadge.textContent = `${recentFolders.length}/100`;
  if (!container) return;

  container.innerHTML = '';

  if (recentFolders.length === 0) {
    const empty = document.createElement('div');
    empty.style.padding = '10px';
    empty.style.color = '#777';
    empty.textContent = 'No recent folders yet';
    container.appendChild(empty);
    return;
  }

  recentFolders.forEach((path, idx) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.padding = '8px 12px';
    row.style.cursor = 'pointer';
    row.style.transition = 'background 0.12s';

    row.addEventListener('mouseenter', () => {
      row.style.setProperty('background', 'var(--primary-color)', 'important');
    });
    row.addEventListener('mouseleave', () => {
      row.style.background = '';
    });

    const label = document.createElement('span');
    const parts = path.split(/[\\/]/).filter(Boolean);
    let display = getShortFolderName(path);
    label.textContent = display;
    if (parts.length > 2) display = '… → ' + display;

    label.textContent = display;
    label.title = path;
    label.style.flex = '1';
    label.style.whiteSpace = 'nowrap';
    label.style.overflow = 'hidden';
    label.style.textOverflow = 'ellipsis';
    label.style.fontSize = '13px';

    const removeBtn = document.createElement('button');
    removeBtn.textContent = '×';
    removeBtn.style.cssText = `
      background: none;
      border: none;
      color: #ff5555;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
      padding: 2px 8px;
      margin-left: 12px;
      opacity: 0.6;
      transition: all 0.15s;
      line-height: 1;
    `;

    removeBtn.addEventListener('mouseenter', () => {
      removeBtn.style.opacity = '1';
      removeBtn.style.transform = 'scale(1.15)';
    });
    removeBtn.addEventListener('mouseleave', () => {
      removeBtn.style.opacity = '0.6';
      removeBtn.style.transform = 'scale(1)';
    });

    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Remove "${display}" from recent folders?`)) {
        recentFolders.splice(idx, 1);
        localStorage.setItem('neonkatRecentFolders', JSON.stringify(recentFolders));
        renderRecentFolders();
      }
    });

    row.addEventListener('click', async (e) => {
      if (e.target === removeBtn) return;

      document.getElementById('folderMenu').style.display = 'none';

      try {
        const result = await window.electronAPI.loadFolderDirect(path);
        if (result && !result.canceled && result.audioFilePaths?.length > 0) {
          audioFiles = result.audioFilePaths;
          addToRecentFolders(path);
          updateFolderButtonDisplay(path);
          savedSortedOrder = [];
          isShuffled = false;
          shuffleBtn.classList.remove('enabled');
          currentSearchTerm = '';
          document.getElementById('playlistQuickSearch').value = '';
          document.getElementById('clearQuickSearch').style.display = 'none';
          renderPlaylist();
          
          await applySavedSort();
          currentIndex = 0;
          playTrack(0);
          scrollToCurrentTrack(true);
        } else {
          alert("Folder is empty or no audio files found.");
        }
      } catch (err) {
        console.error("Failed to load recent folder:", err);
        alert("Couldn't open that folder anymore (moved/deleted?)");
        recentFolders = recentFolders.filter(p => p !== path);
        localStorage.setItem('neonkatRecentFolders', JSON.stringify(recentFolders));
        renderRecentFolders();
      }
    });

    row.appendChild(label);
    row.appendChild(removeBtn);
    container.appendChild(row);
  });
}

let currentFolderPath = null;
let currentFolderName = 'Choose Folder';
function updateFolderButtonDisplay(folderPath) {
  if (!folderPath) {
    document.getElementById('folderNameDisplay').textContent = 'Choose Folder';
    return;
  }

  currentFolderPath = folderPath;
  window.electronAPI.pathBasename(folderPath).then(folderName => {
    const maxLength = 26;

    let displayName = `Loaded `+folderName;

    if (folderName.length > maxLength) {
      displayName = '…' + folderName.slice(-(maxLength - 1));
    }

    document.getElementById('folderNameDisplay').textContent = displayName;
    document.getElementById('folderMenuBtn').title = folderPath;
  }).catch(err => {
    console.error("Failed to get basename:", err);
    document.getElementById('folderNameDisplay').textContent = 'Folder Loaded';
  });
}

let normEnabled = localStorage.getItem('normEnabled') === 'true';

const normCheckbox = document.getElementById('normCheckbox');
const normToggleRow = document.getElementById('normToggle');

if (normCheckbox) {
  normCheckbox.checked = normEnabled;
}

function applyNormalization(enabled) {
  normEnabled = enabled;
  buildNormChain();
}

function updateNormUI() {
  if (normEnabled) {
    normToggleRow.classList.add('active');
  } else {
    normToggleRow.classList.remove('active');
  }
}


if (normToggleRow) {
  normToggleRow.addEventListener('click', (e) => {
    if (e.target.closest('input[type="checkbox"]') || e.target.closest('.slider')) return;

    normEnabled = !normEnabled;
    localStorage.setItem('normEnabled', normEnabled ? 'true' : 'false');
    normCheckbox.checked = normEnabled;
    applyNormalization(normEnabled);
    updateNormUI();

    if (notifyEnabled && Notification.permission === 'granted') {
      window.electronAPI.notify(
        normEnabled 
          ? "Normalization Enabled" 
          : "Normalization Disabled"
      );
    }
  });
}

if (normCheckbox) {
  normCheckbox.addEventListener('change', () => {
    normEnabled = normCheckbox.checked;
    localStorage.setItem('normEnabled', normEnabled ? 'true' : 'false');
    applyNormalization(normEnabled);
    updateNormUI();
  });
}


applyNormalization(normEnabled);
updateNormUI();
const artworkDurationSelect = document.getElementById('artworkDurationSelect');
const customArtworkInput = document.getElementById('customArtworkSeconds');


function updateArtworkDuration() {
    const val = artworkDurationSelect.value;
    
    if (val === 'custom') {
        customArtworkInput.style.display = 'inline-block';
        customArtworkInput.focus();
        let sec = parseInt(customArtworkInput.value, 10);
        selectedDuration = (isNaN(sec) || sec < 5) ? 30 : Math.min(sec, 600);
        localStorage.setItem('videoDuration', selectedDuration);
    } else {
        customArtworkInput.style.display = 'none';
        selectedDuration = (val === 'full') ? Infinity : Number(val);
        localStorage.setItem('videoDuration', selectedDuration);
    }
}







const customBgToggle = document.getElementById('customBgToggle');
const customBgModal = document.getElementById('customBgModal');
const customBgInput = document.getElementById('customBgInput');
const applyBgBtn = document.getElementById('applyBgBtn');
const cancelBgBtn = document.getElementById('cancelBgBtn');
const container = document.getElementById('container');

function applyCustomBackground(url = null) {
    const container = document.getElementById('container');

    if (!url || url.trim() === '') {
        container.style.backgroundImage = 'none';
        container.style.backgroundColor = '#111';
        container.classList.remove('custom-bg');          
        localStorage.removeItem('customBackgroundUrl');
        return;
    }

    const img = new Image();
    img.onload = () => {
        container.style.backgroundImage = `url("${url}")`;
        container.style.backgroundSize = 'contain';
        container.style.backgroundPosition = 'center';
        container.style.backgroundRepeat = 'no-repeat';
        container.classList.add('custom-bg');            
        localStorage.setItem('customBackgroundUrl', url);
        if (notifyEnabled && Notification.permission === 'granted') {
        window.electronAPI.notify('Background set! ♡(>ᴗ<)♡');
        }
        else{
        alert("Background set! ♡(>ᴗ<)♡");
        }
    };
    img.onerror = () => {
      if (notifyEnabled && Notification.permission === 'granted') {
        window.electronAPI.notify("Oopsie! Couldn't load that image... (´；ω；`) Check the URL please");
        }
        else{
        alert("Oopsie! Couldn't load that image... (´；ω；`) Check the URL please");
        }
    };
    img.src = url;
}

const brightnessSlider = document.getElementById('bgBrightness');
const brightnessValueDisplay = document.getElementById('brightnessValue');
let currentBrightness = 65;
function loadSavedBrightness() {
  const params = new URLSearchParams(window.location.search);
  const urlBrightness = params.get('bg-brightness');
  
  if (urlBrightness !== null) {
    currentBrightness = Math.max(0, Math.min(100, Number(urlBrightness)));
  } else {
    const saved = localStorage.getItem('customBgBrightness');
    if (saved !== null) {
      currentBrightness = Number(saved);
    }
  }
  
  brightnessSlider.value = currentBrightness;
  brightnessValueDisplay.textContent = currentBrightness + '%';
  applyBrightness();
  document.documentElement.style.setProperty(
    '--brightness-fill', 
    currentBrightness + '%'
  );
}


function applyBrightness() {
  const opacity = (100 - currentBrightness) / 100;
  container.style.setProperty('--bg-overlay-opacity', opacity.toFixed(3));
}



let previewBrightness = currentBrightness; 

brightnessSlider.addEventListener('input', () => {
  previewBrightness = Number(brightnessSlider.value);
  brightnessValueDisplay.textContent = previewBrightness + '%';
  document.documentElement.style.setProperty(
    '--brightness-fill', 
    previewBrightness + '%'
  );
  
  const tempOpacity = (100 - previewBrightness) / 100;
  container.style.setProperty('--bg-overlay-opacity', tempOpacity.toFixed(3));
});




applyBgBtn.addEventListener('click', () => {
  const url = customBgInput.value.trim();
  localStorage.setItem('customBgBrightness', currentBrightness);
  const params = new URLSearchParams(window.location.search);
  params.set('bg-brightness', currentBrightness);
  const newUrl = window.location.pathname + '?' + params.toString();
  window.history.replaceState({}, '', newUrl);
  applyCustomBackground(url);
  currentBrightness = previewBrightness;
  localStorage.setItem('customBgBrightness', currentBrightness);
  customBgModal.style.display = 'none';
});


customBgToggle.addEventListener('click', () => {
  customBgInput.value = localStorage.getItem('customBackgroundUrl') || '';
  brightnessSlider.value = currentBrightness;         
  document.documentElement.style.setProperty('--brightness-fill', currentBrightness + '%');

  brightnessValueDisplay.textContent = currentBrightness + '%';
  
  customBgModal.style.display = 'flex';
  customBgInput.focus();
});


loadSavedBrightness();




const saved = localStorage.getItem('autoUpdateEnabled');
const isEnabled = saved === 'true'; 

if (window.electronAPI && window.electronAPI.sendAutoUpdateState) {
  window.electronAPI.sendAutoUpdateState(isEnabled);
}

const savedCustomBg = localStorage.getItem('customBackgroundUrl');
if (savedCustomBg) {
    const container = document.getElementById('container');
    container.style.backgroundImage = `url("${savedCustomBg}")`;
    container.style.backgroundSize = 'contain';
    
    container.style.backgroundPosition = 'center';
    container.style.backgroundRepeat = 'no-repeat';
    container.classList.add('custom-bg');
}


audio.addEventListener('play',   () => visualizerVideo.play().catch(e=>0));
audio.addEventListener('pause',  () => visualizerVideo.pause());
audio.addEventListener('seeking',() => {
  if (visualizerVideo.src) {
    visualizerVideo.currentTime = audio.currentTime % (visualizerVideo.duration || 1) || 0;
  }
});

audio.addEventListener('timeupdate', () => {
  if (!visualizerVideo.src || visualizerVideo.paused) return;
  const diff = Math.abs(visualizerVideo.currentTime - (audio.currentTime % visualizerVideo.duration));
  if (diff > 0.4) {
    visualizerVideo.currentTime = audio.currentTime % visualizerVideo.duration;
  }
});




cancelBgBtn.addEventListener('click', () => {
  brightnessSlider.value = currentBrightness;
  brightnessValueDisplay.textContent = currentBrightness + '%';
  document.documentElement.style.setProperty(
    '--brightness-fill', 
    currentBrightness + '%'
  );
  applyBrightness(); 
  customBgModal.style.display = 'none';
});


customBgModal.addEventListener('click', (e) => {
    if (e.target === customBgModal) customBgModal.style.display = 'none';
});


let lowPerfMode = localStorage.getItem('lowPerfMode') === 'true';

const lowPerfCheckbox = document.getElementById('lowPerfCheckbox');
const lowPerfRow = document.getElementById('lowPerfToggle');


if (lowPerfCheckbox) {
  lowPerfCheckbox.checked = lowPerfMode;
}

applyLowPerfMode();
function applyLowPerfMode() {
  if (lowPerfMode) {
    document.body.classList.add('low-perf');
    localStorage.setItem('lowPerfMode', 'true');
  } else {
    document.body.classList.remove('low-perf');
    localStorage.setItem('lowPerfMode', 'false');
  }
  renderPlaylist();
}


if (lowPerfRow) {
  lowPerfRow.addEventListener('click', (e) => {
    if (e.target.closest('.switch, input[type="checkbox"]')) return;

    lowPerfMode = !lowPerfMode;
    if (lowPerfCheckbox) lowPerfCheckbox.checked = lowPerfMode;
    applyLowPerfMode();

    if (notifyEnabled && Notification.permission === 'granted') {
      window.electronAPI.notify(
        lowPerfMode ? "Low Performance UI ON ♡" : "Low Performance UI OFF"
      );
    }
  });
}

if (lowPerfCheckbox) {
  lowPerfCheckbox.addEventListener('change', () => {
    lowPerfMode = lowPerfCheckbox.checked;
    applyLowPerfMode();
  });
}
let filteredIndices = [];

function initializeFilteredIndices() {
  filteredIndices = audioFiles.map((_, i) => i);
}
function buildFilteredIndices() {
  filteredIndices = [];
  audioFiles.forEach((item, realIndex) => {
    let text = '';
    if (typeof item === 'string') {
      text = item.split(/[\\/]/).pop().toLowerCase();
    } else if (item.isStream || item.isJellyfin) {
      text = (item.name || '').toLowerCase();
    }
    if (!currentSearchTerm || text.includes(currentSearchTerm)) {
      filteredIndices.push(realIndex);
    }
  });
}

function quickSearchPlaylist() {
  const input = document.getElementById('playlistQuickSearch');
  const clearBtn = document.getElementById('clearQuickSearch');
  
  currentSearchTerm = input.value.toLowerCase().trim();
  clearBtn.style.display = currentSearchTerm ? 'block' : 'none';
  
  if (currentSearchTerm) {
    buildFilteredIndices();
  } else {
    initializeFilteredIndices();
  }
  
  renderPlaylist();
}


document.getElementById('prevBtn').addEventListener('click', () => {
  if (currentSearchTerm && searchLoopEnabled) {
    let prevFound = false;
    for (let i = currentIndex - 1; i >= 0; i--) {
      const item = audioFiles[i];
      let text = typeof item === 'string'
        ? item.split(/[\\/]/).pop().toLowerCase()
        : (item.name || '').toLowerCase();
      if (text.includes(currentSearchTerm)) {
        currentIndex = i;
        prevFound = true;
        break;
      }
    }

    if (!prevFound) {
      for (let i = audioFiles.length - 1; i > currentIndex; i--) {
        const item = audioFiles[i];
        let text = typeof item === 'string'
          ? item.split(/[\\/]/).pop().toLowerCase()
          : (item.name || '').toLowerCase();
        if (text.includes(currentSearchTerm)) {
          currentIndex = i;
          break;
        }
      }
    }
  } else {
    if (currentIndex > 0) {
      currentIndex--;
    } else {
      currentIndex = audioFiles.length - 1;
    }
  }
  playTrack(currentIndex);
});


document.getElementById('nextBtn').addEventListener('click', () => {
  if (currentSearchTerm && searchLoopEnabled) {
    let nextFound = false;
    for (let i = currentIndex + 1; i < audioFiles.length; i++) {
      const item = audioFiles[i];
      let text = typeof item === 'string'
        ? item.split(/[\\/]/).pop().toLowerCase()
        : (item.name || '').toLowerCase();
      if (text.includes(currentSearchTerm)) {
        currentIndex = i;
        nextFound = true;
        break;
      }
    }

    if (!nextFound) {
      for (let i = 0; i < currentIndex; i++) {
        const item = audioFiles[i];
        let text = typeof item === 'string'
          ? item.split(/[\\/]/).pop().toLowerCase()
          : (item.name || '').toLowerCase();
        if (text.includes(currentSearchTerm)) {
          currentIndex = i;
          break;
        }
      }
    }
  } else {
    if (currentIndex < audioFiles.length - 1) {
      currentIndex++;
    } else {
      currentIndex = 0;
    }
  }
  playTrack(currentIndex);
});


document.getElementById('playlistQuickSearch').addEventListener('input', quickSearchPlaylist);


document.getElementById('clearQuickSearch').addEventListener('click', () => {
  const input = document.getElementById('playlistQuickSearch');
  input.value = '';
  currentSearchTerm = '';
  document.getElementById('clearQuickSearch').style.display = 'none';
  renderPlaylist();
  scrollToCurrentTrack();
});


document.getElementById('closeSortMenuBtn').addEventListener('click', () => {
    document.getElementById('sortMenu').style.display = 'none';
});


document.getElementById('playlistQuickSearch').addEventListener('click', e => e.stopPropagation());

document.getElementById('playlistQuickSearch').addEventListener('keydown', (e) => {
 if (e.key === 'Enter') {
    e.preventDefault();
    const input = e.target;
    const clearBtn = document.getElementById('clearQuickSearch');
    input.value = '';
    clearBtn.style.display = 'none';
    input.blur();
    document.getElementById('sortMenu').style.display = 'none';
  }
});

const connectJellyfinBtn = document.getElementById('connectJellyfinBtn');
const jellyfinModal = document.getElementById('jellyfinModal');
const serverInput = document.getElementById('jellyfinServerInput');
const userInput = document.getElementById('jellyfinUserInput');
const passInput = document.getElementById('jellyfinPassInput');
const cancelBtn = document.getElementById('cancelJellyfinBtn');
const confirmBtn = document.getElementById('connectJellyfinConfirmBtn');

connectJellyfinBtn.addEventListener('click', () => {
  serverInput.value = jellyfinConfig.server;
  jellyfinModal.style.display = 'flex';
});

cancelBtn.addEventListener('click', () => jellyfinModal.style.display = 'none');
jellyfinModal.addEventListener('click', (e) => { if (e.target === jellyfinModal) jellyfinModal.style.display = 'none'; });

confirmBtn.addEventListener('click', async () => {
  const server = serverInput.value.trim().replace(/\/$/, '');
  const username = userInput.value.trim();
  const password = passInput.value;
  if (notifyEnabled && Notification.permission === 'granted') {
    window.electronAPI.notify('Connecting To Jellyfin Server');
  }
  else{alert('Connecting To Jellyfin Server');}
  if (!server || !username || !password) {
    alert('Fill in all the fucking fields!');
    return;
  }

  try {
    const authResponse = await fetch(`${server}/Users/AuthenticateByName`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Emby-Authorization': `MediaBrowser Client="NeonKat", Device="Desktop", DeviceId="${jellyfinConfig.deviceId}", Version="0.1.6 alpha"` },
      body: JSON.stringify({ Username: username, Pw: password })
    });

    if (!authResponse.ok) throw new Error('Auth failed – wrong creds?');

    const authData = await authResponse.json();
    jellyfinConfig = {
      server,
      token: authData.AccessToken,
      userId: authData.User.Id,
      deviceId: jellyfinConfig.deviceId
    };

    localStorage.setItem('jellyfinServer', server);
    localStorage.setItem('jellyfinToken', jellyfinConfig.token);
    localStorage.setItem('jellyfinUserId', jellyfinConfig.userId);
    jellyfinStatus.style.display = 'block';
    jellyfinStatus.textContent = `Connected as ${authData.User.Name}`;
    await loadJellyfinLibrary();
    updateJellyfinModalButtons();
  } catch (err) {
    alert(`Connection fucked up: ${err.message}`);
  }
});


function stopVideoSync() {
    clearInterval(syncInterval);
}


async function loadJellyfinLibrary() {
  if (!jellyfinConfig.token) return;

  try {
    const viewsRes = await fetch(`${jellyfinConfig.server}/Users/${jellyfinConfig.userId}/Views?api_key=${jellyfinConfig.token}`);
    if (!viewsRes.ok) throw new Error(`Views fetch failed: ${viewsRes.status}`);
    const views = await viewsRes.json();
    const musicView = views.Items.find(v => v.CollectionType === 'music' || v.Name.toLowerCase().includes('music'));
    if (!musicView) throw new Error('No music library found – check your Jellyfin setup');

    const fields = 'Name,Artists,AlbumArtists,ArtistItems,Album,AlbumPrimaryImageTag,ImageTags,MediaSources,Container,Path,ProductionLocations,SortName,DateCreated,PremiereDate,ProductionYear';
    const searchInput = document.getElementById('jellyfinSearchInput');
    const searchTerm = searchInput ? searchInput.value.trim() : '';

    let itemsUrl = `${jellyfinConfig.server}/Items?IncludeItemTypes=Audio&Recursive=true&Fields=${fields}&Limit=3000&SortBy=SortName&api_key=${jellyfinConfig.token}`;
    let statusMsg = 'Loading all tracks...';
    document.getElementById('folderNameDisplay').textContent = 'Choose Folder';
    if (searchTerm) {
      try {
  const lowerSearch = searchTerm.toLowerCase();
  const genresRes = await fetch(`${jellyfinConfig.server}/MusicGenres?searchTerm=${encodeURIComponent(lowerSearch)}&api_key=${jellyfinConfig.token}`);
  const genresData = await genresRes.json();
  let foundGenres = genresData.Items || [];
  if (foundGenres.length === 0) {
    const exactRes = await fetch(`${jellyfinConfig.server}/MusicGenres?nameStartsWith=${encodeURIComponent(searchTerm)}&api_key=${jellyfinConfig.token}`);
    const exactData = await exactRes.json();
    foundGenres = exactData.Items || [];
  }
  
  if (foundGenres.length > 0) {
    const genreIds = foundGenres.map(item => item.Id).join(',');
    itemsUrl += `&GenreIds=${genreIds}&ParentId=${musicView.Id}`;
    statusMsg = `Loading ${foundGenres.length} genres matching "${searchTerm}"`;
  } else {
    itemsUrl += `&SearchTerm=${encodeURIComponent(searchTerm)}&ParentId=${musicView.Id}`;
    statusMsg = `No genre found – searching titles/artists for: ${searchTerm}`;
  }
} catch (genreErr) {
  console.warn('Genre fuckup, full fallback:', genreErr);
  itemsUrl += `&SearchTerm=${encodeURIComponent(searchTerm)}&ParentId=${musicView.Id}`;
}
    } else {
      itemsUrl += `&ParentId=${musicView.Id}`;
    }

    jellyfinStatus.textContent = statusMsg;
    const itemsRes = await fetch(itemsUrl);
    if (!itemsRes.ok) throw new Error(`Tracks fetch failed: ${itemsRes.status}`);
    const data = await itemsRes.json();

    audioFiles = [];
    initializeFilteredIndices();

    for (const item of data.Items) {
      if (!item.MediaSources || item.MediaSources.length === 0) continue;

      const mediaSource = item.MediaSources[0];
      const container = mediaSource.Container || 'mp3';

      const streamParams = new URLSearchParams({
        api_key: jellyfinConfig.token,
        UserId: jellyfinConfig.userId,
        DeviceId: jellyfinConfig.deviceId,
        static: 'true',
        Container: container,
        AudioCodec: mediaSource.AudioCodec || '',
        PlaySessionId: 'neonkat-' + Date.now()
      });

      const streamUrl = `${jellyfinConfig.server}/Audio/${item.Id}/stream?${streamParams}`;
      let fullName = item.Name || 'Unknown Track';
      let artists = 'Unknown Artist';
      let title = fullName.trim();

      const firstDashMatch = fullName.match(/[-–—]\s*/);
      if (firstDashMatch) {
        const dashIndex = firstDashMatch.index;
        const dashLength = firstDashMatch[0].length;
        artists = fullName.substring(0, dashIndex).trim();
        title = fullName.substring(dashIndex + dashLength).trim();
      } else if (item.Path) {
        const filename = item.Path.split(/[\\/]/).pop().replace(/\.[^.]+$/, '').trim();
        const filenameMatch = filename.match(/[-–—]\s*/);
        if (filenameMatch) {
          const dashIndex = filenameMatch.index;
          const dashLength = filenameMatch[0].length;
          artists = filename.substring(0, dashIndex).trim();
          title = filename.substring(dashIndex + dashLength).trim();
        } else {
          title = filename;
        }
      }

      title = title
        .replace(/\s*\(Audio\)$/i, '')
        .replace(/\s*\(Music Video\).*?$/i, '')
        .replace(/\s*-\s*YouTube$/i, '')
        .replace(/\s*_\s*@[^@]+$/i, '')
        .replace(/^["']|["']$/g, '')
        .trim();

      if (artists.startsWith('-') || artists === '') {
        artists = 'Unknown Artist';
      }

      const displayName = `${artists} - ${title}`;
      let albumArt = 'build/default-artwork.jpg';
      if (item.AlbumPrimaryImageTag) {
        albumArt = `${jellyfinConfig.server}/Items/${item.AlbumId || item.Id}/Images/Primary?tag=${item.AlbumPrimaryImageTag}&api_key=${jellyfinConfig.token}`;
      } else if (item.ImageTags && item.ImageTags.Primary) {
        albumArt = `${jellyfinConfig.server}/Items/${item.Id}/Images/Primary?api_key=${jellyfinConfig.token}`;
      }

   audioFiles.push({
    url: streamUrl,
    name: displayName,
    isJellyfin: true,
    itemId: item.Id,
    albumArt: albumArt,
    dateCreated: item.DateCreated ? new Date(item.DateCreated).getTime() : 0,
  });
    }

    applySavedSort();
    scrollToCurrentTrack(true);
    jellyfinStatus.textContent = `Connected – Loaded ${audioFiles.length} tracks`;
    const input = document.getElementById('playlistQuickSearch');
    input.value = '';
    currentSearchTerm = '';
    document.getElementById('clearQuickSearch').style.display = 'none';
    savedSortedOrder = [];
    isShuffled = false;
    shuffleBtn.classList.remove('enabled');

    currentIndex = 0;
    renderPlaylist();
    if (audioFiles.length > 0) {
      currentIndex = 0;
      playTrack(0);
    }
  } catch (err) {
    console.error(err);
    alert(`Load fucked up: ${err.message}`);
    jellyfinStatus.textContent = 'Connected (load error)';
  }
}


function updateJellyfinModalButtons() {
  const connected = !!jellyfinConfig.token;
  document.getElementById('connectJellyfinConfirmBtn').style.display = connected ? 'none' : 'block';
  document.getElementById('refreshJellyfinBtn').style.display = connected ? 'block' : 'none';
  document.getElementById('disconnectJellyfinBtn').style.display = connected ? 'block' : 'none';
  document.getElementById('jellyfinServerInput').disabled = connected;
  document.getElementById('jellyfinUserInput').disabled = connected;
  document.getElementById('jellyfinPassInput').disabled = connected;
}


connectJellyfinBtn.addEventListener('click', () => {
  serverInput.value = jellyfinConfig.server;
  userInput.value = '';
  passInput.value = '';
  jellyfinModal.style.display = 'flex';
  updateJellyfinModalButtons();
});

document.getElementById('refreshJellyfinBtn').addEventListener('click', async () => {
  if (!jellyfinConfig.token) return;
  jellyfinStatus.textContent = 'Refreshing...';
  await loadJellyfinLibrary();
});


document.getElementById('disconnectJellyfinBtn').addEventListener('click', () => {
  localStorage.removeItem('jellyfinServer');
  localStorage.removeItem('jellyfinToken');
  localStorage.removeItem('jellyfinUserId');
  jellyfinConfig = { server: '', token: '', userId: '', deviceId: jellyfinConfig.deviceId };
  jellyfinStatus.style.display = 'none';
  audioFiles = audioFiles.filter(item => typeof item === 'string' || item.isStream);
  renderPlaylist();
  jellyfinModal.style.display = 'none';
  audioFiles = [];
  currentIndex = 0;
  audio.pause();
  audio.src = '';
  visualizerCanvas.style.backgroundImage = 'none';
  visualizerCanvas.style.backgroundColor = '#111111';
  renderPlaylist();
  stopVideo();
  clearBackground();
  alert('Disconnected from Jellyfin');
  updateJellyfinModalButtons();
});


function updateVisualizerModeUI() {
  barsToggle.classList.remove('active');
  bubblesToggle.classList.remove('active');
  katbubblesToggle.classList.remove('active');
  nukebubblesToggle.classList.remove('active');


  barsCheckbox.checked = false;
  bubblesCheckbox.checked = false;
  katbubblesCheckbox.checked = false;
  nukebubblesCheckbox.checked = false;


  if (visualizerMode === 'bars') {
    barsToggle.classList.add('active');
    barsCheckbox.checked = true;
  } else if (visualizerMode === 'bubbles') {
    bubblesToggle.classList.add('active');
    bubblesCheckbox.checked = true;
  } else if (visualizerMode === 'katbubbles') {
    katbubblesToggle.classList.add('active');
    katbubblesCheckbox.checked = true;
  } else if (visualizerMode === 'nukebubbles') {
    nukebubblesToggle.classList.add('active');
    nukebubblesCheckbox.checked = true;
  }
}


barsToggle.addEventListener('click', () => {
  visualizerMode = 'bars';
  localStorage.setItem('visualizerMode', visualizerMode);
  updateVisualizerModeUI();
  if (visualizerToggle && !audio.paused) visualize();
});

bubblesToggle.addEventListener('click', () => {
  visualizerMode = 'bubbles';
  localStorage.setItem('visualizerMode', visualizerMode);
  updateVisualizerModeUI();
  if (visualizerToggle && !audio.paused) visualize();
});


katbubblesToggle.addEventListener('click', () => {
  visualizerMode = 'katbubbles';
  localStorage.setItem('visualizerMode', visualizerMode);
  updateVisualizerModeUI();
  if (visualizerToggle && !audio.paused) visualize();
});

nukebubblesToggle.addEventListener('click', () => {
  visualizerMode = 'nukebubbles';
  localStorage.setItem('visualizerMode', visualizerMode);
  updateVisualizerModeUI();
  if (visualizerToggle && !audio.paused) visualize();
});


updateVisualizerModeUI();

const hamburgerBtn = document.getElementById('hamburgerBtn');
const hamburgerMenu = document.getElementById('hamburgerMenu');
const downloadYoutubeBtn = document.getElementById('downloadYoutubeBtn');
let downloadFolder = localStorage.getItem('lastDownloadFolder') || null;
let removeProgressListener = null;

let menuOpen = false;

hamburgerBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  menuOpen = !menuOpen;
  hamburgerMenu.style.display = menuOpen ? 'block' : 'none';
});


document.addEventListener('click', () => {
  if (menuOpen) {
    menuOpen = false;
    hamburgerMenu.style.display = 'none';
  }
});


hamburgerMenu.addEventListener('click', (e) => {
  e.stopPropagation();
});

downloadYoutubeBtn.addEventListener('click', () => {
  hamburgerMenu.style.display = 'none';
  menuOpen = false;

  if (document.getElementById('ytModal')) {
    document.getElementById('ytModal').style.display = 'flex';
    return;
  }



 const modalHTML = `
<div id="ytModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 99999;">
  <div style="background: #111; padding: 25px; border-radius: 12px; width: 85%; max-width: 420px; border: 3px solid var(--primary-color);">
    <h3 style="margin-top: 0; color: var(--primary-color); text-align: center;">Download With Yt-Dlp</h3>

    <div style="background: #330000; border: 1px solid #ff3333; padding: 12px; border-radius: 8px; margin: 15px 0 20px 0; font-size: 13px; color: #ffaaaa; text-align: center;">
      <strong>⚠️ HEADS UP ⚠️</strong><br><br>
      Downloading more than 50 songs at once can result in a temporary IP rate-limit from YouTube (up to 24 hours). 
    </div>

    <input type="text" id="ytUrlInput" placeholder="Paste YouTube / Soundcloud URL here..." style="width: 100%; padding: 12px; background: #222; border: none; border-radius: 6px; color: white; margin-bottom: 10px; font-size: 14px;" />

   <div style="position: relative; margin-bottom: 15px;">
  <button id="chooseDlFolderBtn" style="padding: 10px 15px; background: #212121; border: none; border-radius: 6px; color: white; cursor: pointer; width: 100%; display: flex; justify-content: space-between; align-items: center;"><span>Choose Folder</span> ▼</button>
  <span id="selectedDlFolder" style="color: var(--primary-color); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; margin-top: 8px; padding: 0 10px;">No folder selected</span>

  <div id="recentDlFoldersMenu" style="
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  min-width: 100%;
  border: 2px solid var(--primary-color);
  border-radius: 6px;
  margin-top: 4px;
  z-index: 10000;
  backdrop-filter: blur(8px) !important;
  background: rgba(34, 34, 34, 0.92) !important;
  max-height: 311px; 
  overflow-y: auto;
">
<button id="pickNewDlFolder" style="width: 95%; margin: 8px 0; margin-left: 10px; padding: 8px; background: none; border: none; border-radius: 6px; color: white; font-weight: bold; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-size: 14px;">
  <span>Choose new folder…</span>
  <span id="dlFolderCountBadge" style="font-size: 12px; opacity: 0.7;"></span>
</button>
  <hr style="border: none; border-top: 1px solid #444; margin: 0px 0;">
 <div id="recentDlFolders" style="max-height: 400px; min-height: 150px; overflow-y: auto; padding: 2px 0;">
  </div>
</div>
</div>

<div style="margin-bottom: 15px; position: relative;">
  <label style="color: white; font-size: 14px; display: block; margin-bottom: 8px;"></label>
  <button id="ytdlpArgsBtn" type="button" style="padding: 10px 15px; background: #212121; border: none; border-radius: 6px; color: white; cursor: pointer; width: 100%; display: flex; justify-content: space-between; align-items: center;"><span>Yt-Dlp Arguments</span> ▼</button>
  <span id="selectedYtdlpArgs" style="color: var(--primary-color); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; margin-top: 8px; padding: 0 10px;">No extra arguments</span>

  <div id="ytdlpArgsMenu" style="
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    min-width: 100%;
    border: 2px solid var(--primary-color);
    border-radius: 6px;
    margin-top: 4px;
    z-index: 10000;
    backdrop-filter: blur(8px) !important;
    background: rgba(34, 34, 34, 0.92) !important;
    max-height: 311px;
    overflow-y: auto;
  ">
    <div style="padding: 10px;">
      <input type="text" id="ytdlp-extra-args" placeholder="e.g. --cookies-from-browser firefox -4" style="width: 100%; padding: 10px; background: #111; border: 1px solid #444; border-radius: 6px; color: white; font-size: 13px; box-sizing: border-box;" />
     <button id="useYtdlpArgsBtn" style="width: 100%; margin-top: 8px; padding: 8px; background: none; border: none; border-radius: 6px; color: white; font-weight: bold; cursor: pointer; display: flex; justify-content: space-between; align-items: center;"><span>Add</span><span id="ytdlpArgsCountBadge" style="font-size: 12px; opacity: 0.7;"></span></button>
    </div>
    
    <hr style="border: none; border-top: 1px solid #444; margin: 0;">
     <div id="ytdlpArgsHistoryList" style="max-height: 400px; min-height: 0; overflow-y: auto; padding: 2px 0;"></div>
  </div>
</div>


<div style="margin-bottom: 15px; position: relative;">
  <label style="color: white; font-size: 14px; display: block; margin-bottom: 8px;"></label>
  <button id="genreBtn" type="button" style="padding: 10px 15px; background: #212121; border: none; border-radius: 6px; color: white; cursor: pointer; width: 100%; display: flex; justify-content: space-between; align-items: center;"><span>Genre Tags</span> ▼</button>
  <span id="selectedGenreDisplay" style="color: var(--primary-color); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; margin-top: 8px; padding: 0 10px;">No genre selected (default: Music)</span>
  <input type="hidden" id="genreInput" value="Music" />
  <div id="genreMenu" style="display: none; position: absolute; top: 100%; left: 0; right: 0; min-width: 100%; border: 2px solid var(--primary-color); border-radius: 6px; margin-top: 4px; z-index: 10000; backdrop-filter: blur(8px) !important; background: rgba(34, 34, 34, 0.92) !important; max-height: 206px; overflow-y: auto;">
    <div style="padding: 10px;">
      <input type="text" id="genreCustomInput" placeholder="e.g. EDM, Country, Hip-Hop" style="width: 100%; padding: 10px; background: #111; border: 1px solid #444; border-radius: 6px; color: white; font-size: 13px; box-sizing: border-box;" />
      <button id="useGenreBtn" style="width: 100%; margin-top: 8px; padding: 8px; background: none; border: none; border-radius: 6px; color: white; font-weight: bold; cursor: pointer; display: flex; justify-content: space-between; align-items: center;"><span>Add</span><span id="genreCountBadge2" style="font-size: 12px; opacity: 0.7;"></span></button>
    </div>
    <hr style="border: none; border-top: 1px solid #444; margin: 0;">
    <div id="genreHistoryList" style="max-height: 400px; min-height: 0; overflow-y: auto; padding: 2px 0;"></div>
  </div>
</div>

<div style="position: relative; width: 100%; margin-bottom: 4px">
  <select id="videoQualitySelect" style="width: 100%; padding: 10px 15px; background: #212121; color: white; border: none; border-radius: 6px; font-size: 14px; appearance: none; -webkit-appearance: none; -moz-appearance: none; cursor: pointer;">
    <option value="bestvideo+bestaudio/best">Best quality (highest available)</option>
    <option value="bestvideo[height<=1080]+bestaudio/best">1080p</option>
    <option value="bestvideo[height<=720]+bestaudio/best">720p</option>
    <option value="bestvideo[height<=480]+bestaudio/best" selected>480p (recommended)</option>
  </select>
  <span style="position: absolute; right: 15px; top: 50%; transform: translateY(-50%); color: white; pointer-events: none; font-size: 14px;">▼</span>
</div>
    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
      <span style="color: white; font-size: 14px;">Audio only (skip gif preview)</span>
      <div id="skipVideoToggle" style="width: 40px; height: 20px; background: #444; border-radius: 10px; position: relative; cursor: pointer;">
        <div id="skipVideoThumb" style="width: 18px; height: 18px; background: #444; border-radius: 50%; position: absolute; top: 1px; left: 1px; transition: left 0.2s;"></div>
      </div>
    </div>
<div style="display: flex; align-items: center; gap: 12px; margin: 8px 0; flex-wrap: wrap;">
  <label style="color: #ccc; font-size: 13px;">Gif preview length:</label>
  
  
  <select id="exportDurationSelect" style="
    background: #222;
    color: white;
    border: 1px solid #444;
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 13px;
  ">
    <option value="Infinity">Full song</option>
    <option value="15">15 seconds</option>
    <option value="30">30 seconds</option>
    <option value="60">60 seconds</option>
    <option value="90">90 seconds</option>
    <option value="custom">Custom...</option>
  </select>

  <input type="number" id="customExportSeconds"
         placeholder="seconds"
         min="5" max="600"
         style="display:none; width: 90px; background:#222; color:white; border:1px solid #444; border-radius:6px; padding:6px; font-size:13px;" />
</div>



  <div style="display: flex; gap: 10px; justify-content: flex-end;">
  <button id="cancelYtBtn" style="padding: 10px 20px; background: #444; border: none; border-radius: 5px; color: white; cursor: pointer;">Cancel</button>
  <button id="addToQueueBtn" style="padding: 10px 20px; background: #444; border: none; border-radius: 5px; color: white; cursor: pointer;">+ Queue</button>
  <button id="downloadYtConfirmBtn" style="padding: 10px 20px; background: var(--primary-color); border: none; border-radius: 6px; color: black; cursor: pointer; font-weight: bold;">Download</button>
</div>

 <div id="dlQueuePanel" style="margin-top: 15px; background: #1a1a1a; border-radius: 6px; padding: 10px; display: none;">
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
  </div>

  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
  <span style="font-size: 13px; color: var(--primary-color); font-weight: bold;">Download Queue</span>
  <div style="display: flex; gap: 6px;">
    <button id="startQueueBtn" class="control-btn" style="flex: none !important; width: auto !important; padding: 4px 12px; font-size: 11px; height: auto; background: var(--primary-color); color: black;">▶ Start</button>
    <button id="clearQueueBtn" class="control-btn" style="flex: none !important; width: auto !important; padding: 4px 12px; font-size: 11px; height: auto;">Clear All</button>
  </div>
</div>
  <ul id="dlQueueList" style="list-style: none; padding: 0; margin: 0; max-height: 50px; overflow-y: auto;"></ul>
</div>
    
  </div>
</div>`;





  document.body.insertAdjacentHTML('beforeend', modalHTML);
  initDownloadFolderDropdown();
  initYtdlpArgsDropdown();
  initGenreDropdown();
  
   const skipToggle = document.getElementById('skipVideoToggle');
  const skipThumb = document.getElementById('skipVideoThumb');
  const ytModal = document.getElementById('ytModal');
  const ytUrlInput = document.getElementById('ytUrlInput');
  const cancelBtn = document.getElementById('cancelYtBtn');
  const confirmBtn = document.getElementById('downloadYtConfirmBtn');
  const chooseFolderBtn = document.getElementById('chooseDlFolderBtn');
  const selectedFolderSpan = document.getElementById('selectedDlFolder');

  const artworkDurationSelect = document.getElementById('exportDurationSelect');
  const customExportInput   = document.getElementById('customExportSeconds');
   if (videoQuality) {
    videoQualitySelect.value = videoQuality;
  }
 
 if (selectedDuration === Infinity) {
   artworkDurationSelect.value = "Infinity";
} else if (selectedDuration !== null) {
  selectedDuration = Number(selectedDuration);
   artworkDurationSelect.value = selectedDuration;
}
  

const qualitySelect = document.getElementById('videoQualitySelect');

if (qualitySelect) {
  qualitySelect.addEventListener('change', () => {
    const val = qualitySelect.value;
    videoQuality = val;
    localStorage.setItem('videoQuality', videoQuality);
  });
  videoQuality = qualitySelect.value || videoQuality;
}

 

  if (artworkDurationSelect) {
    artworkDurationSelect.addEventListener('change', () => {
      
      const val = artworkDurationSelect.value;
      if (val === 'custom') {
        customExportInput.style.display = 'inline-block';
        let sec = parseInt(customExportInput.value) || 30;
        selectedDuration = Math.max(5, Math.min(600, sec));
        localStorage.setItem('videoDuration', selectedDuration);
      } else {
        customExportInput.style.display = 'none';
        selectedDuration = val === 'full' ? Infinity : Number(val);
        localStorage.setItem('videoDuration', selectedDuration);
      }
    });
  }

  if (customExportInput) {
    customExportInput.addEventListener('input', () => {
      let sec = parseInt(customExportInput.value) || 30;
      selectedDuration = Math.max(5, Math.min(600, sec));
      localStorage.setItem('videoDuration', selectedDuration);
    });
  }




function updateToggleUI() {
    if (skipVideo) {
        skipThumb.style.left = '21px';
        skipToggle.style.background = 'var(--primary-color)'; 
    } else {
        skipThumb.style.left = '1px';
        skipToggle.style.background = '#333'; 
    }
}

updateToggleUI();

  ytUrlInput.focus();


cancelBtn.addEventListener('click', () => {
  if (window.electronAPI.cancelDownload) {
    window.electronAPI.cancelDownload();
  }
  ytModal.remove();
  if (removeProgressListener) {
    removeProgressListener();
    removeProgressListener = null;
  }
  confirmBtn.textContent = 'Download';
  confirmBtn.disabled = false;
});

  ytModal.addEventListener('click', (e) => { if (e.target === ytModal) ytModal.remove(); });

removeProgressListener = window.electronAPI.onDownloadProgress((data) => {
  const percent = Math.round(data.percent || 0);
  const status = data.status || 'downloading';
  confirmBtn.disabled = true;

  let buttonText = `Downloading… ${percent}%`;
  if (status === 'starting') {
    buttonText = `Starting… ${percent}%`;
  } else if (status === 'fetching-info') {
    buttonText = `Fetching info… ${percent}%`;
  } else if (status === 'info-fetched') {
    buttonText = `Metadata OK… ${percent}%`;
  } else if (status === 'thumbnail') {
    buttonText = `Thumbnail… ${percent}%`;
  } else if (status === 'audio') {
    buttonText = `Audio only… ${percent}%`;
  } else if (status === 'video') {
    buttonText = `Video + audio… ${percent}%`;
  } else if (status === 'processing' || status === 'audio-processing') {
    buttonText = `Processing… ${percent}%`;
  } else if (status === 'audio-extract') {
    buttonText = `Extracting MP3… ${percent}%`;
  } else if (status === 'finished') {
    buttonText = 'Done! 100%';
    setTimeout(() => {
      confirmBtn.textContent = 'Download';
      confirmBtn.disabled = false;
    }, 1800);
  } else if (status === 'error') {
    buttonText = 'Failed – try again';
    setTimeout(() => alert(`Download failed:\n\n${data.message}`), 100);
    setTimeout(() => {
      confirmBtn.textContent = 'Download';
      confirmBtn.disabled = false;
    }, 2500);
  }

  
  confirmBtn.textContent = buttonText;
});

skipToggle.addEventListener('click', () => {
    skipVideo = !skipVideo;
    localStorage.setItem('skipVideo', skipVideo);
    updateToggleUI();
});
  let dlQueue = [];
let isQueueRunning = false;

function buildQueueItem(url, opts, id) {
  return { id, url, opts, status: 'pending' };
}

function renderDlQueue() {
  const list = document.getElementById('dlQueueList');
  const panel = document.getElementById('dlQueuePanel');
  if (!list || !panel) return;
  panel.style.display = dlQueue.length > 0 ? 'block' : 'none';
  list.innerHTML = '';
   list.style.maxHeight = dlQueue.length > 0 ? '50px' : 'none';
  list.style.overflowY = dlQueue.length > 0 ? 'auto' : 'visible';
  dlQueue.forEach((item) => {
    const li = document.createElement('li');
    li.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:5px 4px; border-bottom:1px solid #2a2a2a; font-size:12px;';
    const statusColor = item.status === 'downloading' ? 'var(--primary-color)' : item.status === 'done' ? 'var(--primary-color)' : item.status === 'error' ? '#f44336' : '#aaa';
    const shortUrl = item.url.length > 38 ? item.url.slice(0, 35) + '...' : item.url;
    li.innerHTML = `
      <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${item.url}">${shortUrl}</span>
      <span style="color:${statusColor}; margin: 0 8px; min-width:72px; text-align:right;">${item.status}</span>
      <button data-id="${item.id}" style="background:none; border:none; color:#ff5555; font-size:15px; cursor:pointer; padding:0 4px; line-height:1;">×</button>
    `;
    li.querySelector('button').addEventListener('click', () => {
      const idx = dlQueue.findIndex(q => q.id === item.id);
      if (idx !== -1 && dlQueue[idx].status === 'pending') {
        dlQueue.splice(idx, 1);
        renderDlQueue();
      }
    });
    list.appendChild(li);
  });
}

async function processQueue() {
  if (isQueueRunning) return;
  isQueueRunning = true;
  for (const item of dlQueue) {
    if (item.status !== 'pending') continue;
    item.status = 'downloading';
    renderDlQueue();
    try {
      addToYtdlpArgsHistory(document.getElementById('ytdlp-extra-args').value.trim());
      const result = await window.electronAPI.downloadYoutube(item.opts);
      item.status = result.success ? 'done' : 'error';
    } catch {
      item.status = 'error';
    }
    confirmBtn.textContent = 'Download'; 
    confirmBtn.disabled = false;       
    renderDlQueue();
  }
  isQueueRunning = false;
  setTimeout(() => {
    dlQueue = dlQueue.filter(i => i.status === 'pending');
    renderDlQueue();
  }, 3000);
  if (Notification.permission === 'granted') {
    window.electronAPI.notify('Download queue finished');
  }
}


document.getElementById('addToQueueBtn').addEventListener('click', () => {
   const inputVal = document.getElementById('ytdlp-extra-args').value.trim();
  if (inputVal) activeExtraArgs = inputVal;
  addToYtdlpArgsHistory(document.getElementById('ytdlp-extra-args').value.trim());
  const url = document.getElementById('ytUrlInput').value.trim();
  const extraArgs = document.getElementById('ytdlp-extra-args').value.trim();
  addToYtdlpArgsHistory(extraArgs);
  if (!url) { alert('Paste a URL first!'); return; }
  if (!downloadFolder) { alert('Choose a download folder first!'); return; }
  if (url.includes('list=')) { alert('Playlists are disabled.'); return; }
  if (!url.includes('youtube.com') && !url.includes('youtu.be') && !url.includes('soundcloud.com')) {
    alert('YouTube or SoundCloud only.');
    return;
  }
  if (url.includes('soundcloud.com') && !skipVideo) {
    alert('Enable Audio Only for SoundCloud.');
    return;
  }
  const qualityFormat = document.getElementById('videoQualitySelect').value;
  const genre = document.getElementById('genreInput').value.trim() || 'Music';
  const id = Date.now() + Math.random();
dlQueue.push(buildQueueItem(url, {
  url,
  downloadFolder,
  skipVideo,
  format: qualityFormat,
  artworkDuration: selectedDuration,
  genre,
  extraYtdlpArgs: activeExtraArgs
}, id));
  document.getElementById('ytUrlInput').value = '';
  renderDlQueue();
});


document.getElementById('clearQueueBtn').addEventListener('click', () => {
  dlQueue = dlQueue.filter(i => i.status === 'downloading');
  renderDlQueue();
});

document.getElementById('startQueueBtn').addEventListener('click', () => {
  processQueue();
});


confirmBtn.addEventListener('click', async () => {
  const url = document.getElementById('ytUrlInput').value.trim();
   const inputVal = document.getElementById('ytdlp-extra-args').value.trim();
  if (inputVal) activeExtraArgs = inputVal;
 
  if (!url) { alert('Paste a URL first!'); return; }
  if (url.includes('soundcloud.com') && !skipVideo) { alert('Enable Audio Only for SoundCloud.'); return; }
  if (!url.includes('youtube.com') && !url.includes('youtu.be') && !url.includes('soundcloud.com')) {
    alert('YouTube or SoundCloud only.');
    return;
  }
  if ((url.includes('youtube.com') || url.includes('youtu.be')) && url.includes('list=')) {
    alert('Playlists are disabled.');
    return;
  }
  const qualityFormat = document.getElementById('videoQualitySelect').value;
  const genre = document.getElementById('genreInput').value.trim() || 'Music';
  confirmBtn.textContent = 'Downloading...';
  confirmBtn.disabled = true;
  try {
     addToYtdlpArgsHistory(document.getElementById('ytdlp-extra-args').value.trim());
 const result = await window.electronAPI.downloadYoutube({
  url, downloadFolder, skipVideo, format: qualityFormat, artworkDuration: selectedDuration, genre,
  extraYtdlpArgs: activeExtraArgs
});



    if (result.success) {
      renderPlaylist();
      if (Notification.permission === 'granted') {
        window.electronAPI.notify(`Download complete → ${downloadFolder}`);
      } else { alert('Download complete :)'); }
    } else {
      alert(`Download failed: ${result.message || 'Unknown error'}`);
    }
  } catch (err) {
    alert('Something went wrong: ' + err.message);
  }
  confirmBtn.textContent = 'Download';
  confirmBtn.disabled = false;
});
})


const aboutBtn = document.getElementById('aboutBtn');
aboutBtn.addEventListener('click', () => {
  hamburgerMenu.style.display = 'none';
  menuOpen = false;
  let aboutModal = document.getElementById('aboutModal');
  if (aboutModal) {
    aboutModal.style.display = 'flex';
    return;
  }

  aboutModal = document.createElement('div');
  aboutModal.id = 'aboutModal';
  aboutModal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 99999;';
  aboutModal.innerHTML = `
    <div style="background: #111; padding: 30px; border-radius: 12px; width: 90%; max-width: 400px; border: 3px solid var(--primary-color); text-align: center; color: white;">
      <h3 style="margin-top: 0; color: var(--primary-color);">About NeonKat</h3>
      <p style="font-size: 16px; margin: 15px 0;">Made With ❤️ By <strong>PaleCache</strong></p>
      <p style="font-size: 14px; margin-bottom: 20px;">A music player with yt-dlp support, streams, and neon vibes. Check out the source and star it if you love it!</p>
      <button id="openGitHubBtn" style="padding: 10px 20px; background: var(--primary-color); border: none; border-radius: 6px; color: black; cursor: pointer; font-weight: bold; margin-bottom: 15px;">Source Code ♡</button>
      <button id="patchBtn" style="padding: 10px 20px; background: #444; border: none; border-radius: 6px; color: white; cursor: pointer; margin-bottom: 15px;">Patch Notes</button>
      <button id="closeAboutBtn" style="padding: 10px 20px; background: #444; border: none; border-radius: 6px; color: white; cursor: pointer;">Close</button>
       <p style="font-size: 14px;margin: 15px 0; right: 10px; position: fixed;"></strong>📦 V0.4.1 alpha</p>
      </div>
  </div>
  `;

  document.body.appendChild(aboutModal);
  const closeBtn = document.getElementById('closeAboutBtn');
  const gitHubBtn = document.getElementById('openGitHubBtn');
  const patchBtn = document.getElementById('patchBtn');
  gitHubBtn.addEventListener('click', async () => {
    await window.electronAPI.openExternal('https://github.com/PaleCache/NeonKat');
  });

  patchBtn.addEventListener('click', async () => {
    await window.electronAPI.openExternal('https://github.com/PaleCache/NeonKat/releases/latest');
  });
  closeBtn.addEventListener('click', () => aboutModal.remove());
  aboutModal.addEventListener('click', (e) => {
    if (e.target === aboutModal) aboutModal.remove();
  });
});

    miniBtn.addEventListener('click', () => {
      isMini = !isMini;
      document.body.classList.toggle('mini-mode', isMini);
      window.electronAPI.setMiniMode(isMini);
       wrapper.classList.remove("playing");
      setTimeout(visualize, 100);
     if (!isMini) {
      selectedIndices.clear();
      selectedIndices.add(currentIndex);
      renderPlaylist();
      updateSelectionVisuals();
       wrapper.classList.add("playing");
      setTimeout(() => {
       scrollToCurrentTrack();
      }, 150);
    }
    });


 
  function updateSliderBackground(slider) {
    const value = (slider.value - slider.min) / (slider.max - slider.min) * 100;
    slider.style.background = `linear-gradient(to right, var(--primary-color) 0%, var(--primary-color) ${value}%, #444 ${value}%, #444 100%)`;
  }

  function updateThemeColor(color, isRainbow = isRainbowActive) {
    themeColor = color;
    isRainbowActive = isRainbow;
    localStorage.setItem('themeColor', themeColor);
    localStorage.setItem('isRainbowActive', isRainbowActive);

    if (isRainbowActive) {
    } else {
      document.documentElement.style.setProperty('--primary-color', themeColor);
      document.documentElement.style.setProperty('--primary-dark', adjustColor(themeColor, -20));
    }

    updateSliderBackground(volumeSlider);
    updateSliderBackground(progressBar);
  }

  visualizerColorPicker.value = themeColor;
  updateThemeColor(themeColor, isRainbowActive);

  visualizerColorPicker.addEventListener('input', (e) => {
    updateThemeColor(e.target.value, false);
  });

rainbowToggleBtn.addEventListener('click', () => {
  isRainbowActive = !isRainbowActive;
  rainbowIcon.src = isRainbowActive ? 'build/flash.svg' : 'build/flashoff.svg';
  localStorage.setItem('isRainbowActive', isRainbowActive);
  if (isRainbowActive) {
    updateThemeColor(themeColor, true);
  } else {
    updateThemeColor(themeColor, false);
  }
});


const addStreamBtn = document.getElementById('addStreamBtn');
const streamModal = document.getElementById('streamModal');
const streamUrlInput = document.getElementById('streamUrlInput');
const streamNameInput = document.getElementById('streamNameInput');
const streamArtworkInput = document.getElementById('streamArtworkInput');
const cancelStreamBtn = document.getElementById('cancelStreamBtn');
const addStreamConfirmBtn = document.getElementById('addStreamConfirmBtn');

addStreamBtn.addEventListener('click', () => {
  streamUrlInput.value = '';
  streamNameInput.value = '';
  streamArtworkInput.value = '';
  streamModal.style.display = 'flex';
  streamUrlInput.focus();
});

cancelStreamBtn.addEventListener('click', () => {
  streamModal.style.display = 'none';
});

addStreamConfirmBtn.addEventListener('click', async () => {
  let url = streamUrlInput.value.trim();
  if (!url) { alert('Enter a URL first!'); return; }

  let name = streamNameInput.value.trim() || new URL(url).hostname;
  let artUrl = streamArtworkInput.value.trim() || null;
  const looksLikeDirectManifest = /\.(m3u8|pls|m3u)(\?|$)/i.test(url);

  if (url.toLowerCase().endsWith('.pls') || url.toLowerCase().endsWith('.m3u')) {
    fetch(url)
      .then(r => r.text())
      .then(text => {
        const lines = text.split('\n');
        for (let line of lines) {
          line = line.trim();
          if (line.startsWith('File1=') || line.toLowerCase().includes('http')) {
            const match = line.match(/(https?:\/\/[^\s]+)/i);
            if (match) {
              addStreamToPlaylist(match[1], name, artUrl, null, null);
              streamModal.style.display = 'none';
              return;
            }
          }
        }
        alert('No valid stream found in that playlist file');
      })
      .catch(() => alert('Couldn\'t fetch the playlist file.'));
    return;
  }

 
  if (!looksLikeDirectManifest) {
    addStreamConfirmBtn.textContent = 'Resolving...';
    addStreamConfirmBtn.disabled = true;
    try {
      const result = await window.electronAPI.resolveStreamUrl(url);
   if (result.success && result.url) {
  addStreamToPlaylist(result.url, name, artUrl, url, result.videoUrl);
      } else {
        alert(`Couldn't resolve stream: ${result.message || 'unknown error'}`);
      }
    } catch (err) {
      alert('Resolution failed: ' + err.message);
    }
    addStreamConfirmBtn.textContent = 'Add';
    addStreamConfirmBtn.disabled = false;
  } else {
    const result = await window.electronAPI.resolveStreamUrl(url);
    addStreamToPlaylist(result.url, name, artUrl, url, result.videoUrl);
  }

  streamModal.style.display = 'none';
});


streamModal.addEventListener('click', (e) => {
  if (e.target === streamModal) {
    streamModal.style.display = 'none';
  }
});



function addStreamToPlaylist(url, customName = null, artUrl = null, pageUrl = null, videoUrl = null) {
  const name = customName || new URL(url).hostname;
  const streamEntry = {
    url: url,
    videoUrl: videoUrl || null,
    originalUrl: pageUrl || null,
    name: name,
    isStream: true,
    artwork: artUrl
  };

  audioFiles.push(streamEntry);
  renderPlaylist();
  updateStoredPlaylist();
  currentIndex = audioFiles.length - 1;
  playTrack(currentIndex);
}

async function tryResolveAndRestartHls(item, resilientHlsRef, mediaEl, opts) {
  if (!item?.originalUrl) {
    console.warn('[HLS] No original page URL stored — cannot re-resolve, giving up.');
    return false;
  }

  console.log('[HLS] Token expired, asking yt-dlp for a fresh URL...');
  const result = await window.electronAPI.resolveStreamUrl(item.originalUrl);

  if (!result.success || !result.url) {
    console.warn('[HLS] yt-dlp could not re-resolve stream:', result.message);
    return false;
  }

  item.url = result.url;

  if (resilientHlsRef.current) resilientHlsRef.current.destroy();
 item.url = result.url;
resilientHlsRef.current = createResilientHls(() => item.url, mediaEl, opts);
  resilientHlsRef.current.start();
  return true;
}



let savedSortedOrder = []; 
let isShuffled = false;
shuffleBtn.classList.toggle('enabled', isShuffled);

shuffleBtn.addEventListener('click', () => {
  isShuffled = !isShuffled;
  shuffleBtn.classList.toggle('enabled', isShuffled);

  if (notifyEnabled && Notification.permission === 'granted') {
    window.electronAPI.notify(isShuffled ? 'Shuffle Enabled' : 'Shuffle Disabled');
  }

  if (audioFiles.length === 0) return;
  const currentSong = audioFiles[currentIndex];

  if (isShuffled) {
    if (savedSortedOrder.length === 0) {
      savedSortedOrder = [...audioFiles];
      
    }

    let remaining = [...audioFiles];
    remaining.splice(currentIndex, 1);
    shuffleArray(remaining);
    audioFiles = [currentSong, ...remaining];
    currentIndex = 0;
    selectedIndices.clear();
    selectedIndices.add(currentIndex);

  } else {
    audioFiles = [...savedSortedOrder];
    const newIndex = audioFiles.findIndex(song => {
      if (typeof song === 'string' && typeof currentSong === 'string') {
        return song === currentSong;
      }
      if (song?.isStream && currentSong?.isStream) {
        return song.url === currentSong.url;
      }
      if (song?.isJellyfin && currentSong?.isJellyfin) {
        return song.itemId === currentSong.itemId;
      }
      return false;
    });

    currentIndex = newIndex !== -1 ? newIndex : 0;
    selectedIndices.clear();
    selectedIndices.add(currentIndex);
  }

  renderPlaylist();
  updateSelectionVisuals();
  scrollToCurrentTrack();
});



function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

  repeatBtn.addEventListener('click', () => {
    repeatTrack = !repeatTrack;
    repeatBtn.classList.toggle('enabled', repeatTrack);

    if (notifyEnabled && repeatTrack && Notification.permission === 'granted') {
    window.electronAPI.notify('Repeat Enabled');
  }

  if (notifyEnabled && !repeatTrack && Notification.permission === 'granted') {
    window.electronAPI.notify('Repeat Disabled');
  }
  });

  sortBtn.addEventListener('click', () => {
    if (sortMenu.style.display === 'block') {
      sortMenu.style.display = 'none';
    } else {
      sortMenu.style.display = 'block';
    }
  });

  const contextMenu = document.getElementById('contextMenu');
const removeTrackBtn = document.getElementById('removeTrackBtn');

removeTrackBtn.addEventListener('click', () => {
  if (selectedIndices.size === 0) return;

  const indicesToRemove = Array.from(selectedIndices).sort((a, b) => b - a);

  let shouldStopPlayback = false;
  indicesToRemove.forEach(idx => {
    if (idx === currentIndex) shouldStopPlayback = true;
    audioFiles.splice(idx, 1);
  });

  if (shouldStopPlayback || audioFiles.length === 0) {
    audio.pause();
    stopVideo();
    clearBackground();
    updateVideoSongName(`No Track`)
    audio.src = '';
    currentIndex = 0;
  } else if (currentIndex >= audioFiles.length) {
    currentIndex = audioFiles.length - 1;
  }

  selectedIndices.clear();
  lastSelectedIndex = null;
  renderPlaylist();
  if (audioFiles.length > 0) playTrack(currentIndex);

  contextMenu.style.display = 'none';
  contextMenuOpen = false;
});

playlistElem.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const li = e.target.closest('li');
  if (!li) return;

  const index = Array.from(playlistElem.children).indexOf(li);
  showContextMenu(e.clientX, e.clientY, index);
});

let contextMenuOpen = false;

function showContextMenu(x, y, index) {
  contextMenuOpen = true;
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
  contextMenu.style.display = 'block';
}


document.addEventListener('click', (e) => {
  if (contextMenuOpen && !contextMenu.contains(e.target)) {
    contextMenu.style.display = 'none';
    contextMenuOpen = false;
  }
});

  document.getElementById('sortNameAsc').addEventListener('click', () => {
    sortPlaylist('name', true);
    sortMenu.style.display = 'none';
  });

  document.getElementById('sortNameDesc').addEventListener('click', () => {
    sortPlaylist('name', false);
    sortMenu.style.display = 'none';
  });

  document.getElementById('sortDateAsc').addEventListener('click', () => {
    sortPlaylist('date', true);
    sortMenu.style.display = 'none';
  });

  document.getElementById('sortDateDesc').addEventListener('click', () => {
    sortPlaylist('date', false);
    sortMenu.style.display = 'none';
  });

  document.addEventListener('click', (e) => {
    if (!sortBtn.contains(e.target) && !sortMenu.contains(e.target)) {
      sortMenu.style.display = 'none';
    }
  });

async function sortPlaylist(criteria, ascending) {
  if (audioFiles.length === 0) return;

  let sortedFiles = [...audioFiles];
  const currentItem = audioFiles[currentIndex];

if (criteria === 'name') {
    sortedFiles.sort((a, b) => {
        const getName = (item) => {
            if (typeof item === 'string')
                return item.split(/[\\/]/).pop().toLowerCase();

            if (item?.isJellyfin)
                return (item.sortName || item.name || item.Name || 'unknown')
                    .toString()
                    .toLowerCase();

            if (item?.isStream)
                return (item.name || 'unknown').toLowerCase();

            return 'unknown';
        };

        const nameA = getName(a);
        const nameB = getName(b);

        return ascending
            ? nameA.localeCompare(nameB)
            : nameB.localeCompare(nameA);
    });

   audioFiles = sortedFiles;
    currentIndex = audioFiles.indexOf(currentItem);
    if (currentIndex === -1) currentIndex = 0;

    selectedIndices.clear();
    selectedIndices.add(currentIndex);

    renderPlaylist();
    updateSelectionVisuals();
    scrollToCurrentTrack();
    

  } else if (criteria === 'date') {
    const wasPlaying = audioFiles[currentIndex];
    let playingId = null;

    if (wasPlaying) {
        if (typeof wasPlaying === 'string') {
            playingId = wasPlaying;                     
        } else if (wasPlaying.isJellyfin) {
            playingId = `jellyfin:${wasPlaying.itemId}`;
        } else if (wasPlaying.isStream) {
            playingId = `stream:${wasPlaying.url}`;
        }
    }
    const hasLocalFiles = audioFiles.some(item => typeof item === 'string');
    const hasJellyfin   = audioFiles.some(item => item?.isJellyfin);

    if (hasLocalFiles && !hasJellyfin) {
        try {
            const filesWithDates = await Promise.all(
                audioFiles.map(async (path) => {
                    if (typeof path === 'string') {
                        try {
                            const stats = await window.electronAPI.getFileStats(path);
                            return { item: path, date: stats?.mtimeMs ?? 0 };
                        } catch (err) {
                            console.warn("Failed to get stats for:", path, err);
                            return { item: path, date: 0 };
                        }
                    }
                    return { item: path, date: 0 };
                })
            );

            filesWithDates.sort((a, b) =>
                ascending ? a.date - b.date : b.date - a.date
            );

            audioFiles = filesWithDates.map(x => x.item);
        } catch (err) {
            console.error("Local files date sort failed:", err);
            sortPlaylist('name', ascending);
            return;
        }
    }
    else if (hasJellyfin && !hasLocalFiles) {
        audioFiles.sort((a, b) => {
            const timeA = a.isJellyfin ? (a.dateCreated || 0) : 0;
            const timeB = b.isJellyfin ? (b.dateCreated || 0) : 0;

            return ascending ? timeA - timeB : timeB - timeA;
        });
    }
    else if (hasLocalFiles && hasJellyfin) {
        try {
            const filesWithDates = await Promise.all(
                audioFiles.map(async (item) => {
                    if (typeof item === 'string') {
                        try {
                            const stats = await window.electronAPI.getFileStats(item);
                            return { item, date: stats?.mtimeMs ?? 0 };
                        } catch {
                            return { item, date: 0 };
                        }
                    }
                    if (item?.isJellyfin) {
                        return { item, date: item.dateCreated || 0 };
                    }
                    return { item, date: 0 };
                })
            );

            filesWithDates.sort((a, b) =>
                ascending ? a.date - b.date : b.date - a.date
            );

            audioFiles = filesWithDates.map(x => x.item);
        } catch (err) {
            console.error("Mixed sort failed:", err);
            sortPlaylist('name', ascending);
            return;
        }
    }
 
    if (playingId) {
        currentIndex = audioFiles.findIndex(item => {
            if (typeof item === 'string') return item === playingId;
            if (item?.isJellyfin) return `jellyfin:${item.itemId}` === playingId;
            if (item?.isStream) return `stream:${item.url}` === playingId;
            return false;
        });

        if (currentIndex === -1) {
            console.warn("Playing track lost after sort – resetting to 0");
            currentIndex = 0;
        }
    } else {
        currentIndex = 0;
    }
    selectedIndices.clear();
    selectedIndices.add(currentIndex);

    renderPlaylist();
    updateSelectionVisuals();
    scrollToCurrentTrack();
}

  localStorage.setItem('sortCriteria', criteria);
  localStorage.setItem('sortOrder', ascending ? 'asc' : 'desc');
}

 
const sortOptions = document.querySelectorAll('#sortMenu .sort-btn');

sortOptions.forEach(btn => {
  btn.addEventListener('click', () => {
    sortOptions.forEach(b => {
      b.textContent = b.textContent.replace(' ✓', '');
    });
    btn.textContent += ' ✓';
    document.getElementById('sortMenu').style.display = 'none';
  });
});

  function updateSortCheckmark(selectedId) {
    sortOptions.forEach(btn => {
      if (btn.id === selectedId) {
        if (!btn.textContent.includes(' ✓')) {
          btn.textContent += ' ✓';
        }
      } else {
        btn.textContent = btn.textContent.replace(' ✓', '');
      }
    });
  }

  const dropWarning = document.getElementById('drop-warning');
  playlistElem.addEventListener('dragover', (event) => {
    event.preventDefault();
    playlistElem.style.border = '2px dashed #212121';
    dropWarning.style.display = 'block';
  });

  window.addEventListener('resize', () => {
  setTimeout(visualize, 50);
});

  playlistElem.addEventListener('dragleave', (event) => {
    event.preventDefault();
    playlistElem.style.border = '';
    dropWarning.style.display = 'none';
  });
  const SAFE_DROP_LIMIT = 50;

playlistElem.addEventListener('drop', async (event) => {
  event.preventDefault();
  playlistElem.style.border = '';
  dropWarning.style.display = 'none';
  let files = Array.from(event.dataTransfer.files || []);
  const audioExts = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.opus'];
  let collectedAudioPaths = [];
  for (const file of files) {
    const filePath = file.path;
    let folderResultsObj = null;
    try {
      folderResultsObj = await window.electronAPI.loadFolderDirect(filePath);
    } catch (err) {
      console.error("Folder load failed:", err);
    }

    if (
      folderResultsObj &&
      Array.isArray(folderResultsObj.audioFilePaths) &&
      folderResultsObj.audioFilePaths.length > 0
    ) {
      collectedAudioPaths.push(...folderResultsObj.audioFilePaths);
    } else {
      const ext = '.' + filePath.split('.').pop().toLowerCase();
      if (audioExts.includes(ext)) collectedAudioPaths.push(filePath);
    }
  }
  collectedAudioPaths = collectedAudioPaths.filter(filePath => {
    const ext = '.' + filePath.split('.').pop().toLowerCase();
    return audioExts.includes(ext);
  });
  if (!collectedAudioPaths.length) {
    alert("Now you did it LOL, drag and drop in electron could now be broken due to a bug in electron :( if you dragged too many files like 200+ you're done for pal... if you dragged a non audio file you should be fine still");
    if (event.dataTransfer) {
      try {
        event.dataTransfer.clearData();
      } catch {}
    }
    return;
  }

  audioFiles = audioFiles.concat(collectedAudioPaths);
  if (event.dataTransfer) {
    try {
      event.dataTransfer.clearData();
    } catch {}
  }
  renderPlaylist();
  await applySavedSort();
  currentIndex = 0;
  playTrack(0);
  scrollToCurrentTrack();
});



  const clearPlaylistBtn = document.getElementById('clearPlaylistBtn');

 clearPlaylistBtn.addEventListener('click', () => {
    if (audioFiles.length === 0) return;
    stopStreamRefresh();
    if (audioHlsRef.current) { audioHlsRef.current.destroy(); audioHlsRef.current = null; }
    if (resilientVizHls) { resilientVizHls.destroy(); resilientVizHls = null; }
    if (resilientAudioHls) { resilientAudioHls.destroy(); resilientAudioHls = null; }

    audioFiles = [];
    currentIndex = 0;
    audio.currentTime = 0;
    currentTimeElem.textContent = '0:00';
    durationElem.textContent = '0:00';
    progressBar.value = 0;
    progressBar.max = 1;
    audio.pause();
    audio.src = '';
    visualizerCanvas.style.backgroundImage = 'none';
    visualizerCanvas.style.backgroundColor = '#111111';
    renderPlaylist();
    stopVideo();
    clearBackground();
    updateVideoSongName(`No Track`)
    document.getElementById('folderNameDisplay').textContent = 'Choose Folder';
    document.getElementById('folderMenuBtn').title = '';
    wrapper.classList.remove("playing");
});

  [volumeSlider, progressBar].forEach(slider => {
    updateSliderBackground(slider);
    slider.addEventListener('input', () => updateSliderBackground(slider));
  });



const folderMenuBtn = document.getElementById('folderMenuBtn');
const folderMenu   = document.getElementById('folderMenu');
const pickNewFolderBtn = document.getElementById('pickNewFolder');

if (folderMenuBtn && folderMenu) {
  folderMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = folderMenu.style.display === 'block';
    folderMenu.style.display = isOpen ? 'none' : 'block';

    if (!isOpen) {
      renderRecentFolders();
    }
  });

  document.addEventListener('click', (e) => {
    if (!folderMenuBtn.contains(e.target) && !folderMenu.contains(e.target)) {
      folderMenu.style.display = 'none';
    }
  });
}

if (pickNewFolderBtn) {
  pickNewFolderBtn.addEventListener('click', async () => {
    folderMenu.style.display = 'none';

    try {
      const result = await window.electronAPI.pickFolder();
      if (result && !result.canceled && result.audioFilePaths?.length > 0) {
        audioFiles = result.audioFilePaths;
        initializeFilteredIndices();
     

        addToRecentFolders(result.folderPath);

        savedSortedOrder = [];
        isShuffled = false;
        shuffleBtn.classList.remove('enabled');
        currentSearchTerm = '';
        document.getElementById('playlistQuickSearch').value = '';
        document.getElementById('clearQuickSearch').style.display = 'none';
        updateFolderButtonDisplay(result.folderPath);
        renderPlaylist();
        await applySavedSort();
        currentIndex = 0;
        playTrack(0);
        scrollToCurrentTrack(true);
      } else if (result && !result.canceled) {
        alert('No audio files found in that folder');
      }
    } catch (err) {
      console.error('Folder picker error:', err);
      alert('Error opening folder picker');
    }
  });
}

 savePlaylistBtn.addEventListener('click', async () => {
  if (audioFiles.length === 0) {
    alert('No tracks to save!');
    return;
  }

  const serializablePlaylist = audioFiles.map(item => {
    if (typeof item === 'string') {
      return { type: 'file', path: item };
    } else if (item.isStream) {
      return {
        type: 'stream',
        url: item.url,
        name: item.name,
        artwork: item.artwork || null
      };
    } else if (item.isJellyfin) {
      return {
        type: 'jellyfin',
        url: item.url,
        name: item.name,
        itemId: item.itemId,
        albumArt: item.albumArt
      };
    }
    return null;
  }).filter(Boolean);

  const success = await window.electronAPI.savePlaylist(serializablePlaylist);
  if (success) {
    alert('Playlist saved!');
  } else {
    alert('Failed to save playlist');
  }
});

 loadPlaylistBtn.addEventListener('click', async () => {
  const { canceled, filePaths } = await window.electronAPI.openFile();
  if (canceled || !filePaths.length) return;

  const playlistPath = filePaths[0];
  const ext = playlistPath.split('.').pop().toLowerCase();

  let loadedItems = [];

  if (ext === 'playlist') {
    const raw = await window.electronAPI.readFile(playlistPath);
    const data = JSON.parse(raw);

    loadedItems = data.map(entry => {
      if (entry.type === 'file') return entry.path;
      if (entry.type === 'stream') {
        return {
          url: entry.url,
          name: entry.name,
          isStream: true,
          artwork: entry.artwork || null
        };
      }
      if (entry.type === 'jellyfin') {
        return {
          url: entry.url,
          name: entry.name,
          isJellyfin: true,
          itemId: entry.itemId,
          albumArt: entry.albumArt
        };
      }
      return null;
    }).filter(Boolean);
  } 
  else if (ext === 'm3u') {
    loadedItems = await parseM3UFile(playlistPath);
  } 
  else {
    alert('Unsupported playlist format');
    return;
  }

  audioFiles = loadedItems;
  savedSortedOrder = [];
  isShuffled = false;
  shuffleBtn.classList.remove('enabled');
  await applySavedSort();

  currentIndex = 0;
  renderPlaylist();
  updateSelectionVisuals();
  scrollToCurrentTrack();

  if (audioFiles.length > 0) {
    playTrack(0);
  }
});

  const volumePercent = document.getElementById('volumePercent');
  var maffs = 0;
  var checkTimer = null;
  volumeSlider.addEventListener('input', (e) => {
    audio.volume = e.target.value;
    volumePercent.textContent = Math.round(e.target.value * 100) + '%';
    localStorage.setItem('volumeLevel', e.target.value);
    if(volumePercent.textContent === '3%' && !Number.isNaN(audio.duration) && checkTimer === null){
      checkTimer = setInterval(() => {
      maffs++
      if(maffs === 10 && volumePercent.textContent === '3%'){
        clearInterval(checkTimer)
        checkTimer = null;
        const katLogo = document.getElementById('kat-logo');
        katLogo.src = 'build/gnomed-gnome.gif'
        alert(`⚠️ FLASHING LIGHT WARNING ⚠️ \n \n🧙🏼‍♂️ Congratulations you have stumbled across an easter egg and a dead meme all at once, Enjoy the dead meme for the rest of this song, if this is the volume you set it to all the time i'm sorry LOL`)
        maffs = 0;
        const remainingMs = (audio.duration - audio.currentTime) * 1000;
        startRainbowColorLoop();
        setTimeout(() => {
        stopRainbowLoop();
        katLogo.src = 'build/kat.png'
      },remainingMs);
      }

      if(maffs === 11)
      {
        clearInterval(checkTimer)
        checkTimer = null;
        maffs = 0;
      }
     
    }, 1000);
    
  }
      
  });

  const savedVolume = localStorage.getItem('volumeLevel');
  if (savedVolume !== null) {
    volumeSlider.value = savedVolume;
    audio.volume = savedVolume;
    volumePercent.textContent = Math.round(savedVolume * 100) + '%';
    updateSliderBackground(volumeSlider);
  } else {
    volumeSlider.value = 1;
    audio.volume = 1;
    volumePercent.textContent = '100%';
    updateSliderBackground(volumeSlider);
  }

 let lastSelectedIndex = null;

function renderPlaylist() {
  playlistElem.innerHTML = '';
  
  audioFiles.forEach((item, realIndex) => {
    let text = '';
    
    if (typeof item === 'string') {
      text = item.split(/[\\/]/).pop().toLowerCase();
    } else if (item.isStream || item.isJellyfin) {
      text = (item.name || '').toLowerCase();
    }
    
    if (currentSearchTerm && !text.includes(currentSearchTerm)) {
      return;
    }
    
    const li = document.createElement('li');
    if (typeof item === 'string') {
      li.textContent = item.split(/[\\/]/).pop();
    } else if (item.isStream) {
      li.innerHTML = '';
      const icon = document.createElement('img');
      icon.src = 'build/radio.svg';
      icon.style.width = '16px';
      icon.style.height = '16px';
      icon.style.marginRight = '8px';
      icon.style.verticalAlign = 'middle';
      icon.style.filter = 'brightness(0) invert(1)';
      const textSpan = document.createElement('span');
      textSpan.textContent = item.name || 'Unknown Station';
      li.appendChild(icon);
      li.appendChild(textSpan);
    } else if (item.isJellyfin) {
      li.textContent = item.name || 'Unknown Track';
    } else {
      li.textContent = 'Unknown Track';
    }
    
    const isActive = (realIndex === currentIndex);
    const isPlaying = isActive && !audio.paused && audioFiles.length > 0;
    
    if (isPlaying) {
      const gifWrapper = document.createElement('div');
      gifWrapper.style.position = 'absolute';
      gifWrapper.style.left = '9px';
      gifWrapper.style.top = '42%';
      gifWrapper.style.transform = 'translateY(-50%)';
      gifWrapper.style.pointerEvents = 'none';
      gifWrapper.style.zIndex = '10';
      const gifImg = document.createElement('img');
      gifImg.src = 'build/bars.gif';
      gifImg.style.width = '25px';
      gifImg.style.height = '25px';
      gifImg.style.objectFit = 'contain';
      gifWrapper.appendChild(gifImg);
      li.style.paddingLeft = '37px';
      li.style.position = 'relative';
      if (lowPerfMode) {
    gifWrapper.style.display = 'none';
  }
      li.appendChild(gifWrapper);
    }
    
    li.dataset.realIndex = realIndex;
    
    li.addEventListener('click', (e) => {
      if (contextMenuOpen) {
        contextMenu.style.display = 'none';
        contextMenuOpen = false;
        e.stopPropagation();
        return;
      }
      
      const realIdx = parseInt(li.dataset.realIndex);
      
      if (e.shiftKey && lastSelectedIndex !== null) {
        const start = Math.min(lastSelectedIndex, realIdx);
        const end = Math.max(lastSelectedIndex, realIdx);
        selectedIndices.clear();
        for (let i = start; i <= end; i++) selectedIndices.add(i);
      } else if (e.ctrlKey || e.metaKey) {
        if (selectedIndices.has(realIdx)) selectedIndices.delete(realIdx);
        else selectedIndices.add(realIdx);
        lastSelectedIndex = realIdx;
      } else {
        selectedIndices.clear();
        selectedIndices.add(realIdx);
        lastSelectedIndex = realIdx;
        currentIndex = realIdx;
        playTrack(realIdx);
      }
      
      updateSelectionVisuals();
    });
    
    if (selectedIndices.has(realIndex)) {
      li.classList.add('selected');
    }
    if (isActive) {
      li.classList.add('active');
    }
    
    playlistElem.appendChild(li);
  });
  
  updateSelectionVisuals();
}


const selectedIndices = new Set();

function updateSelectionVisuals() {
  const items = playlistElem.querySelectorAll('li');
  items.forEach(li => {
    const idx = parseInt(li.dataset.realIndex);
    li.classList.toggle('selected', selectedIndices.has(idx));
    li.classList.toggle('active', idx === currentIndex);
  });
}

  async function parseM3UFile(filePath) {
    const content = await window.electronAPI.readFile(filePath);
    const lines = content
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));

    const pathSeparator = window.navigator.platform.startsWith('Win') ? '\\' : '/';
    const baseDir = filePath.substring(0, filePath.lastIndexOf(pathSeparator));

    const audioPaths = lines.map(line => {
      if (line.startsWith('/') || /^[a-zA-Z]:\\/.test(line)) return line;
      return baseDir + (baseDir.endsWith(pathSeparator) ? '' : pathSeparator) + line;
    });

    return audioPaths;
  }

 async function getAlbumArtUrl(filePath) {
  const defaultImage = 'build/default-artwork.jpg';
  if (typeof filePath !== 'string') return defaultImage;
  let embeddedArt = null;
  try {
    const buffer = await window.electronAPI.readFileBuffer(filePath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const blob = new Blob([arrayBuffer]);

    embeddedArt = await new Promise((resolve) => {
      jsmediatags.read(blob, {
        onSuccess: (tag) => {
          const picture = tag.tags?.picture;
          if (picture) {
            let binary = '';
            const uint8Array = new Uint8Array(picture.data);
            for (let i = 0; i < uint8Array.length; i++) binary += String.fromCharCode(uint8Array[i]);
            const base64 = btoa(binary);
            const mime = picture.format || 'image/jpeg';
            resolve(`data:${mime};base64,${base64}`);
          } else resolve(null);
        },
        onError: (err) => {
          console.debug(`No embedded art in ${filePath.split('/').pop()}: ${err.info}`);
          resolve(null);
        }
      });
    });
  } catch (err) {
    console.debug('jsmediatags skipped or failed (normal for many files)');
  }

  if (embeddedArt) return embeddedArt;
  try {
    const ext = await window.electronAPI.pathExtname(filePath);
    const baseName = await window.electronAPI.pathBasename(filePath, ext);
    const dir = await window.electronAPI.pathDirname(filePath);

    const candidates = [
      baseName + '.jpg',
      baseName + '.jpeg',
      baseName + '.png',
      baseName + '.webp',
      baseName + '.gif',
      'cover.jpg',
      'folder.jpg',
      'albumart.jpg',
      'front.jpg',
      'cover.png',
      'cover.jpeg',
      'folder.png'
    ];

    for (const name of candidates) {
      const candidatePath = await window.electronAPI.pathJoin(dir, name);
      if (await window.electronAPI.fileExists(candidatePath)) {
        const normalized = candidatePath.replace(/\\/g, '/');
        const url = `file://${encodeURI(normalized).replace(/#/g, '%23')}`;
        return url;
      }
    }
  } catch (err) {
    console.warn('External art search failed:', err);
  }
  return defaultImage;
}


function stopVideo() {
    if (visualizerVideo) {
        visualizerVideo.pause();
        visualizerVideo.src = '';
        visualizerVideo.load();
        visualizerVideo.style.display = 'none';
        visualizerVideo.style.opacity = '0';
    }
    if (resilientVizHls) {
        resilientVizHls.destroy();
        resilientVizHls = null;
    }
}

function clearBackground() {
  visualizerCanvas.style.backgroundImage = 'none';
  visualizerCanvas.style.backgroundColor = '#111111';
  currentArtImage = null;
  visualizerCanvas.style.backgroundColor = 'transparent';
  document.getElementById('visualizerBgGif').style.display = 'none';
}

const visualizerVideo = document.getElementById('visualizerVideo');
const songNameOverlay = document.getElementById('videoSongName');

let videoOnlyMode = false;
let originalWindowWidth =  441;
let originalWindowHeight = 743;



async function setVideoOnlyBackground(item) {
    const artworkEl = document.getElementById('artworkLayer');
    const videoEl = document.getElementById('visualizerVideo');
    if (!artworkEl || !videoEl) return;
    artworkEl.style.opacity = '1';
    artworkEl.style.display = 'block';
    videoEl.style.opacity = '0';
    videoEl.style.display = 'none';

if (!videoEl || !artworkEl) return;
if (videoEl.src && videoEl.readyState >= 2) {
    videoEl.style.display = 'block';
    videoEl.style.opacity = '1';
    artworkEl.style.opacity = '0';

    if (!audio.paused) {
        videoEl.currentTime = audio.currentTime;
        videoEl.play().catch(() => {});
    }

    return;
}
    if (videoEl.currentSrc && !videoEl.paused && videoEl.videoWidth > 0) {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = videoEl.videoWidth;
            canvas.height = videoEl.videoHeight;
            canvas.getContext('2d').drawImage(videoEl, 0, 0);
            artworkEl.src = canvas.toDataURL('image/jpeg');
        } catch (e) {
            console.warn("Couldn't snapshot video frame:", e);
        }
    }

    let foundContent = false;

   if (item?.isStream && item.url?.includes('.m3u8')) {
    visualizerVideo.style.display = 'block';
    visualizerVideo.loop = true;
    visualizerVideo.muted = true;
    visualizerVideo.playsInline = true;
    visualizerVideo.style.opacity = '1';
    visualizerVideo.style.zIndex = '0';
    visualizerCanvas.style.backgroundColor = 'transparent';

    if (vizHlsRef.current) vizHlsRef.current.destroy();

   vizHlsRef.current = createResilientHls(() => item.url, visualizerVideo, {
      isVisualizer: true,
      onDead: async () => {
        const result = await window.electronAPI.resolveStreamUrl(item.originalUrl);
        if (result.success) {
          item.url = result.url;
          audioHlsRef.current = createResilientHls(result.url, audio, {});
          audioHlsRef.current.start();
        }
      }
    });
    vizHlsRef.current.start();
    return;
}

    if (typeof item === 'string') {
        const filePath = item;
        const dir = await window.electronAPI.pathDirname(filePath);
        const ext = await window.electronAPI.pathExtname(filePath);
        const baseName = await window.electronAPI.pathBasename(filePath, ext);
        const videoCandidates = [
            baseName + '.mp4',
            baseName + '.webm',
            baseName + '-video.mp4',
            baseName + '-preview.mp4'
        ];

        for (const name of videoCandidates) {
            const candidatePath = await window.electronAPI.pathJoin(dir, name);
            if (await window.electronAPI.fileExists(candidatePath) && gifPreviewEnabled) {
                const url = `file://${candidatePath.replace(/\\/g, '/').replace(/#/g, '%23')}`;
                videoEl.src = url;
                videoEl.load();

                await new Promise(resolve => {
                    const onCanPlay = () => {
                        videoEl.removeEventListener('canplay', onCanPlay);
                        videoEl.style.display = 'block';
                        videoEl.style.opacity = '1';
                        artworkEl.style.opacity = '0';
                        videoEl.currentTime = audio.currentTime % (videoEl.duration || 1) || 0;
                        videoEl.play().catch(() => {});
                        foundContent = true;
                        resolve();
                    };
                    videoEl.addEventListener('canplay', onCanPlay, { once: true });
                    setTimeout(() => {
                        if (!foundContent) {
                            videoEl.style.opacity = '0';
                            videoEl.style.display = 'none';
                            resolve();
                        }
                    }, 500);
                });

                if (foundContent) return;
                break;
            }
        }

        if (!foundContent) {
            const artUrl = await getAlbumArtUrl(filePath);
            if (artUrl && artUrl !== 'build/default-artwork.jpg') {
                artworkEl.src = artUrl;

                await new Promise(resolve => {
                    const onLoad = () => {
                        artworkEl.style.opacity = '1';
                        foundContent = true;
                        resolve();
                    };
                    artworkEl.addEventListener('load', onLoad, { once: true });
                    artworkEl.addEventListener('error', () => resolve(), { once: true });
                });

                if (foundContent) return;
            }
        }

        if (!foundContent && gifPreviewEnabled) {
            const gifCandidates = [baseName + '.gif', 'cover.gif'];
            for (const name of gifCandidates) {
                const gifPath = await window.electronAPI.pathJoin(dir, name);
                if (await window.electronAPI.fileExists(gifPath)) {
                    const url = `file://${gifPath.replace(/\\/g, '/').replace(/#/g, '%23')}`;
                    artworkEl.src = url;

                    await new Promise(resolve => {
                        const onLoad = () => {
                            artworkEl.style.opacity = '1';
                            foundContent = true;
                            resolve();
                        };
                        artworkEl.addEventListener('load', onLoad, { once: true });
                        artworkEl.addEventListener('error', () => resolve(), { once: true });
                    });

                    if (foundContent) return;
                    break;
                }
            }
        }
    }


    else if (item?.isJellyfin && item.albumArt) {
        artworkEl.src = item.albumArt;

        await new Promise(resolve => {
            const onLoad = () => {
                artworkEl.style.opacity = '1';
                foundContent = true;
                resolve();
            };
            artworkEl.addEventListener('load', onLoad, { once: true });
            artworkEl.addEventListener('error', () => resolve(), { once: true });
        });

        if (foundContent) return;
    }

    if (!foundContent) {
        artworkEl.src = 'build/default-artwork.jpg';
        artworkEl.style.opacity = '1';
         if (item?.isStream && item.artwork) {
        artworkEl.src = item.artwork;
        artworkEl.onload = () => {
            artworkEl.style.opacity = '1';
            foundContent = true;
        };
        artworkEl.onerror = () => {
            console.warn("Stream artwork failed in video-only mode:", item.artwork);
            artworkEl.src = 'build/default-artwork.jpg';
            artworkEl.style.opacity = '1';
        };
    } else if (item?.isJellyfin && item.albumArt) {
        artworkEl.src = item.albumArt;
    } else {
        artworkEl.src = 'build/default-artwork.jpg';
        artworkEl.style.opacity = '1';
    }
  }

   
}


document.getElementById('popoutVideoBtn').addEventListener('click', async () => {
    videoOnlyMode = !videoOnlyMode;
    const container = document.getElementById('container');
    const btn = document.getElementById('popoutVideoBtn');
    const btnImg = btn.querySelector('img');
    const currentSongTitle = displayName || 'Unknown Track';
    if (videoOnlyMode && !originalWindowWidth) {
        originalWindowWidth = window.innerWidth;
        originalWindowHeight = window.innerHeight;
    }

    if (videoOnlyMode) {
      
        window.electronAPI?.resizeWindow?.(1241, 743);
        window.electronAPI.setResizable(true)
         wrapper.classList.remove("playing");
        document.body.classList.add('video-only');
        updateVideoSongName(currentSongTitle);
        songNameOverlay.style.display = 'block';
        btnImg.style.filter = 'invert(1)';
        btn.style.backdropFilter = 'blur(10px)';
        btn.style.borderRadius = '50%';
        btn.style.padding = '12px';
        btn.style.boxShadow = '0 6px 20px rgba(0,0,0,0.7)';
        let artworkEl = document.getElementById('artworkLayer');
        if (!artworkEl) {
            artworkEl = document.createElement('img');
            artworkEl.id = 'artworkLayer';
            artworkEl.style.cssText = `
                position: absolute;
                inset: 0;
                width: 100%;
                height: 100%;
                object-fit: cover;
                z-index: 5;
                pointer-events: none;
                display: block;
            `;
            container.prepend(artworkEl);
        }
        const currentItem = audioFiles[currentIndex];
        if (currentItem) {
            await setVideoOnlyBackground(currentItem);
        } else {
            artworkEl.src = 'build/default-artwork.jpg';
            artworkEl.style.opacity = '1';
        }

        const videoEl = document.getElementById('visualizerVideo');
        if (videoEl && videoEl.src) {
            try {
                videoEl.currentTime = 0;
                await videoEl.play();
            } catch (err) {
                console.warn("Video-only playback failed:", err);
            }
        }

         if (videoOnlyMode && visualizerVideo.src) {
          visualizerVideo.currentTime =
              audio.currentTime % visualizerVideo.duration || 0;

          if (!audio.paused) {
              visualizerVideo.play().catch(() => {});
          }
          else {
            visualizerVideo.pause();
          }
      }  
    } else {

        
        document.body.classList.remove('video-only');
        songNameOverlay.style.display = 'none';
         wrapper.classList.add("playing");
        
        const artworkEl = document.getElementById('artworkLayer');
        if (artworkEl) artworkEl.remove();

        if (originalWindowWidth && originalWindowHeight) {
            window.electronAPI?.resizeWindow?.(originalWindowWidth, originalWindowHeight);
        }

        setTimeout(() => window.dispatchEvent(new Event('resize')), 120);
        const videoEl = document.getElementById('visualizerVideo');
         window.electronAPI.setResizable(false)
        if (videoEl && videoEl.src) {
            videoEl.play().catch(() => {});
        }
         if (visualizerVideo.src) {
        const shouldPlayVideo =
            !audio.paused &&
            audio.currentSrc &&
            !isNaN(audio.duration) &&
            audio.duration > 0;

        if (shouldPlayVideo) {
            setTimeout(() => {
                if (!isNaN(visualizerVideo.duration) && isFinite(visualizerVideo.duration)) {
                    visualizerVideo.currentTime = audio.currentTime % visualizerVideo.duration || 0;
                }
                visualizerVideo.play().catch(err => {});
            }, 100);
        } else {
            visualizerVideo.pause();
        }
    }
  selectedIndices.clear();
  selectedIndices.add(currentIndex);
  renderPlaylist();
  updateSelectionVisuals();
  setTimeout(() => {
  scrollToCurrentTrack();
  }, 150);
}
});


let isWidgetMode = false;
let originalVolumeParent = null;

const widgetBtn = document.getElementById('widgetModeBtn');
if (widgetBtn) {
  widgetBtn.addEventListener('click', () => {
    isWidgetMode = !isWidgetMode;
    document.body.classList.toggle('widget-mode', isWidgetMode);
    if (isWidgetMode) {
      const vol = document.querySelector('.volume-control');
      if (vol && !originalVolumeParent) {
        originalVolumeParent = vol.parentElement;
      }

      
      window.electronAPI?.AlwaysOnTop(true, 'screen-saver');
      window.electronAPI?.resizeWindow?.(380, 110);
      try { window.resizeTo(380, 110); } catch(e) { console.error('[Resize fallback failed]', e); }
      const backBtn = document.getElementById('widgetBackBtn');
      if (backBtn) backBtn.style.display = 'flex';
      let right = document.querySelector('.widget-right') || document.createElement('div');
      right.className = 'widget-right';
      document.getElementById('container').appendChild(right);

    let titleEl = document.getElementById('widgetSongTitle');
   
  if (!titleEl) {
    titleEl = document.createElement('div');
    titleEl.id = 'widgetSongTitle';
    right.appendChild(titleEl);
  }


    updateWidgetSongName(displayName);
     wrapper.classList.remove("playing");
      if (vol) right.appendChild(vol);

      const vis = document.getElementById('visualizerWrapper');
      if (vis) {
        vis.style.marginLeft = '0px';
        vis.style.paddingLeft = '0px';
      }
  } else {
 
   wrapper.classList.add("playing");
  window.electronAPI?.resizeWindow?.(441, 743);
  window.electronAPI?.AlwaysOnTop(false, 'screen-saver');
  try { window.resizeTo(441, 743); } catch(e) {}

  if (window.electronAPI?.setResizable) {
    window.electronAPI.setResizable(false);
  }

  const backBtn = document.getElementById('widgetBackBtn');
  if (backBtn) backBtn.style.display = 'none';

  const vol = document.querySelector('.volume-control');
  if (vol && vol.parentElement !== originalVolumeParent) {
    const progress = document.getElementById('progressContainer');
    if (progress && progress.parentElement === originalVolumeParent) {
      originalVolumeParent.insertBefore(vol, progress);
    } 
    else if (document.getElementById('visualizerWrapper')) {
      const vis = document.getElementById('visualizerWrapper');
      originalVolumeParent.insertBefore(vol, vis.nextElementSibling || null);
    } 
    else {
      originalVolumeParent.appendChild(vol);
    }

    vol.style.display = 'none';
    vol.offsetHeight;              
    vol.style.display = 'flex';

    const slider = vol.querySelector('#volume');
    if (slider) {
      const val = slider.value;
      slider.value = '0.123';     
      slider.offsetHeight;
      slider.value = val;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  document.getElementById('widgetSongTitle')?.remove();
  document.querySelector('.widget-right')?.remove();

  const vis = document.getElementById('visualizerWrapper');
  if (vis) {
    vis.style.marginLeft = '';
    vis.style.paddingLeft = '';
    vis.style.marginBottom = '';
  }
      selectedIndices.clear();
      selectedIndices.add(currentIndex);
      renderPlaylist();
      updateSelectionVisuals();
      setTimeout(() => {
       scrollToCurrentTrack();
      }, 150);

  setTimeout(visualize, 120);
}
  });
}

const backBtn = document.getElementById('widgetBackBtn');
if (backBtn) {
  backBtn.addEventListener('click', () => {
    if (isWidgetMode && widgetBtn) widgetBtn.click();
  });
}





function updateVideoSongName(title) {
  const maxLength = 60;
  if (title.length > maxLength) {
    songNameOverlay.textContent = title.slice(0, maxLength - 3) + "...";
  } else {
    songNameOverlay.textContent = title;
  }
}

function updateWidgetSongName(title) {
  const maxLength = 35;
  const titleEl = document.getElementById('widgetSongTitle');
  if (!titleEl) {
    console.warn("Widget title element not found");
    return;
  }
  const chars = [...title];
  if (chars.length > maxLength) {
    titleEl.textContent = chars.slice(0, maxLength).join('') + "...";
  } else {
    titleEl.textContent = title;
  }
}


async function setVisualizerBackground(item) {
    stopVideo();
    visualizerCanvas.style.backgroundImage = 'none';
    visualizerCanvas.style.backgroundColor = '#111111';
    visualizerVideo.style.display = 'none';
    visualizerVideo.pause();
    visualizerVideo.src = '';
    currentArtImage = null;

    let artUrl = null;
    let usedGifOrVideo = false;

    if (item?.artwork) {
        const loader = document.getElementById('artLoader');
        if (loader) {
            loader.crossOrigin = "anonymous";
            loader.src = item.artwork;
            await new Promise((resolve, reject) => {
                loader.onload = () => {
                    currentArtImage = loader;
                    resolve();
                };
                loader.onerror = () => {
                    console.warn("Custom artwork failed to load:", item.artwork);
                    reject();
                };
            }).catch(() => {
             
            });

            if (currentArtImage) {
                visualize();
                return;  
            }
        }
    }

    if (item?.isStream && item.videoUrl) {
    visualizerVideo.src = item.videoUrl;
    visualizerVideo.style.display = 'block';
    visualizerVideo.style.opacity = '1';
    visualizerVideo.style.zIndex = '0';
    visualizerVideo.loop = true;
    visualizerVideo.muted = true;
    visualizerVideo.playsInline = true;
    visualizerVideo.play().catch(() => {});
    visualizerCanvas.style.backgroundColor = 'transparent';
    return;
}
   
if (item?.isStream && item.url?.includes('.m3u8')) {
    visualizerVideo.style.display = 'block';
    visualizerVideo.loop = true;
    visualizerVideo.muted = true;
    visualizerVideo.playsInline = true;
    visualizerVideo.style.opacity = '1';
    visualizerVideo.style.zIndex = '0';
    visualizerCanvas.style.backgroundColor = 'transparent';

    if (resilientVizHls) resilientVizHls.destroy();
    resilientVizHls = createResilientHls(() => item.url, visualizerVideo, {
        isVisualizer: true,
        onDead: async () => {
            if (resilientVizHls) resilientVizHls.destroy();
            resilientVizHls = createResilientHls(() => item.url, visualizerVideo, { isVisualizer: true });
            resilientVizHls.start();
        }
    });
    resilientVizHls.start();
    return;
}

if (item?.isStream) {
    if (item.artwork) {
        const loader = document.getElementById('artLoader');
        loader.crossOrigin = "anonymous";
        loader.src = item.artwork;
        loader.onload = () => { currentArtImage = loader; };
        loader.onerror = () => {
            visualizerCanvas.style.backgroundImage = `url('build/default-artwork.jpg')`;
            visualizerCanvas.style.backgroundSize = 'cover';
            visualizerCanvas.style.backgroundPosition = 'center';
        };
    } else {
        visualizerCanvas.style.backgroundImage = `url('build/default-artwork.jpg')`;
        visualizerCanvas.style.backgroundSize = 'cover';
        visualizerCanvas.style.backgroundPosition = 'center';
    }
    return;
}

    if (typeof item === 'string') {
        const filePath = item;
        const dir = await window.electronAPI.pathDirname(filePath);
        const ext = await window.electronAPI.pathExtname(filePath);
        const baseName = await window.electronAPI.pathBasename(filePath, ext);
        const videoCandidates = [
            baseName + '.mp4',
            baseName + '.webm',
            baseName + '-video.mp4',
            baseName + '-preview.mp4'
        ];

        for (const name of videoCandidates) {
            const candidatePath = await window.electronAPI.pathJoin(dir, name);
            if (await window.electronAPI.fileExists(candidatePath) && gifPreviewEnabled) {
                const normalized = candidatePath.replace(/\\/g, '/');
                const encoded = encodeURI(normalized).replace(/#/g, '%23');
                visualizerVideo.src = `file://${encoded}`;
                visualizerVideo.style.display = 'block';
                visualizerVideo.style.opacity = '1';
                visualizerVideo.style.zIndex = '0';
                visualizerVideo.currentTime = 0;
                visualizerVideo.loop = true;
                visualizerVideo.muted = true;
                visualizerVideo.playsInline = true;
                try {
                    await visualizerVideo.play();
                    visualizerCanvas.style.backgroundColor = 'transparent';
                    visualizerCanvas.style.backgroundImage = 'none';
                } catch (err) {
                    console.error("Video play failed:", err);
                }
                usedGifOrVideo = true;
                break;
            }
        }

        if (usedGifOrVideo) return;
        const sameNameGif = baseName + '.gif';
        const sameNameGifPath = await window.electronAPI.pathJoin(dir, sameNameGif);
        if (await window.electronAPI.fileExists(sameNameGifPath) && gifPreviewEnabled) {
            const normalized = sameNameGifPath.replace(/\\/g, '/');
            const encoded = encodeURI(normalized).replace(/#/g, '%23');
            const gifElement = document.getElementById('visualizerBgGif');
            if (gifElement) {
                gifElement.src = `file://${encoded}`;
                gifElement.style.display = 'block';
                gifElement.style.objectFit = 'contain';
                gifElement.style.objectPosition = 'center';
            }
            usedGifOrVideo = true;
        }

        if (usedGifOrVideo) return;
        artUrl = await getAlbumArtUrl(filePath);
        if (artUrl && artUrl !== 'build/default-artwork.jpg') {
            const loader = document.getElementById('artLoader');
            if (loader) {
                loader.src = artUrl;
                loader.onload = () => { currentArtImage = loader; };
                loader.onerror = () => {
                    console.warn("[ART] Album art failed to load");
                    visualizerCanvas.style.backgroundImage = `url('build/default-artwork.jpg')`;
                };
            }
            return;
        }

        const coverGifName = 'cover.gif';
        const coverGifPath = await window.electronAPI.pathJoin(dir, coverGifName);
        if (await window.electronAPI.fileExists(coverGifPath) && gifPreviewEnabled) {
            const normalized = coverGifPath.replace(/\\/g, '/');
            const encoded = encodeURI(normalized).replace(/#/g, '%23');
            visualizerCanvas.style.backgroundImage = `url("file://${encoded}")`;
            visualizerCanvas.style.backgroundSize = 'cover';
            visualizerCanvas.style.backgroundPosition = 'center';
            visualizerCanvas.style.backgroundRepeat = 'no-repeat';
            visualizerCanvas.style.imageRendering = 'auto';
            usedGifOrVideo = true;
        }
    }

    else if (item?.isJellyfin && item.albumArt) {
        artUrl = item.albumArt;
        const loader = document.getElementById('artLoader');
        if (loader) {
            loader.src = artUrl;
            loader.onload = () => { currentArtImage = loader; };
            loader.onerror = () => {
                visualizerCanvas.style.backgroundImage = `url('build/default-artwork.jpg')`;
            };
        }
        return;
    }

    if (!usedGifOrVideo && (!artUrl || artUrl === 'build/default-artwork.jpg')) {
        visualizerCanvas.style.backgroundImage = `url('build/default-artwork.jpg')`;
        visualizerCanvas.style.backgroundSize = 'cover';
        visualizerCanvas.style.backgroundPosition = 'center';
    }
}


const TRACK_LOUDNESS_CACHE_KEY = 'neonkatTrackLoudness';
let trackLoudnessCache = {};
try {
  trackLoudnessCache = JSON.parse(localStorage.getItem(TRACK_LOUDNESS_CACHE_KEY) || '{}');
} catch (e) {
  trackLoudnessCache = {};
}

function saveTrackLoudnessCache() {
  try {
    localStorage.setItem(TRACK_LOUDNESS_CACHE_KEY, JSON.stringify(trackLoudnessCache));
  } catch (e) {
    console.warn('Failed to save loudness cache (probably full):', e);
  }
}


function getTrackLoudnessKey(item) {
  if (typeof item === 'string') return `file:${item}`;
  if (item?.isJellyfin) return `jellyfin:${item.itemId}`;
  return null;
}


function computeRmsLoudnessDb(audioBuffer) {
  const channelCount = audioBuffer.numberOfChannels;
  let sumSquares = 0;
  let sampleCount = 0;
  const stride = 4;

  for (let ch = 0; ch < channelCount; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < data.length; i += stride) {
      const v = data[i];
      sumSquares += v * v;
      sampleCount++;
    }
  }

  if (sampleCount === 0) return -60;
  const rms = Math.sqrt(sumSquares / sampleCount);
  if (rms <= 0) return -60;
  return 20 * Math.log10(rms);
}

const TARGET_LOUDNESS_DB = -18;
const MAX_GAIN_BOOST_DB = 12;
const MAX_GAIN_CUT_DB = 12;

async function analyzeAndCacheTrackLoudness(item) {
  const key = getTrackLoudnessKey(item);
  if (!key) return null;
  if (trackLoudnessCache[key] !== undefined) return trackLoudnessCache[key];

  let fetchUrl;
  if (typeof item === 'string') {
    const normalized = item.replace(/\\/g, '/');
    fetchUrl = `file://${encodeURI(normalized).replace(/#/g, '%23')}`;
  } else if (item.isJellyfin) {
    fetchUrl = item.url;
  } else {
    return null;
  }

  try {
    const res = await fetch(fetchUrl);
    const arrayBuffer = await res.arrayBuffer();
    const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    const loudnessDb = computeRmsLoudnessDb(decoded);

    let gainDb = TARGET_LOUDNESS_DB - loudnessDb;
    gainDb = Math.max(-MAX_GAIN_CUT_DB, Math.min(MAX_GAIN_BOOST_DB, gainDb));
    const gainLinear = Math.pow(10, gainDb / 20);

    trackLoudnessCache[key] = gainLinear;
    saveTrackLoudnessCache();
    return gainLinear;
  } catch (err) {
    console.warn('Loudness analysis failed for', key, err);
    trackLoudnessCache[key] = 1;
    saveTrackLoudnessCache();
    return 1;
  }
}

function applyTrackNormGain(gainLinear) {
  const now = audioCtx.currentTime;
  trackNormGain.gain.cancelScheduledValues(now);
  trackNormGain.gain.setValueAtTime(trackNormGain.gain.value, now);
  trackNormGain.gain.linearRampToValueAtTime(gainLinear, now + 0.3);
}


let loudnessScanQueue = [];
let loudnessScanRunning = false;
let loudnessScanCancelled = false;
let loudnessScanProgress = { done: 0, total: 0 };

function buildLoudnessScanQueue() {
  loudnessScanQueue = audioFiles.filter(item => {
    const key = getTrackLoudnessKey(item);
    return key && trackLoudnessCache[key] === undefined;
  });
  loudnessScanProgress = { done: 0, total: loudnessScanQueue.length };
}

async function runLoudnessScan() {
  if (loudnessScanRunning) return;
  buildLoudnessScanQueue();
  if (loudnessScanQueue.length === 0) {
    const label = document.getElementById('loudnessScanStatus');
    if (label) {
      label.textContent = 'All tracks already scanned';
      label.style.display = 'block';
      setTimeout(() => { label.style.display = 'none'; }, 2500);
    }
    return;
  }

  loudnessScanRunning = true;
  loudnessScanCancelled = false;
  updateLoudnessScanUI();

  for (const item of loudnessScanQueue) {
    if (loudnessScanCancelled) break;

    await analyzeAndCacheTrackLoudness(item);
    loudnessScanProgress.done++;
    updateLoudnessScanUI();

    const key = getTrackLoudnessKey(item);
    if (key && audioFiles[currentIndex] === item && trackLoudnessCache[key] !== undefined) {
      applyTrackNormGain(trackLoudnessCache[key]);
    }

    await new Promise(r => setTimeout(r, 30));
  }

  loudnessScanRunning = false;
  updateLoudnessScanUI();
}

function cancelLoudnessScan() {
  loudnessScanCancelled = true;
}

function updateLoudnessScanUI() {
  const label = document.getElementById('loudnessScanStatus');
  const btn = document.getElementById('scanLoudnessBtn');
  if (!label) return;
  if (loudnessScanRunning) {
    label.textContent = `Scanning loudness… ${loudnessScanProgress.done}/${loudnessScanProgress.total}`;
    label.style.display = 'block';
    if (btn) btn.textContent = 'Cancel Scan';
  } else if (loudnessScanProgress.total > 0 && loudnessScanProgress.done >= loudnessScanProgress.total) {
    label.textContent = `Loudness scan complete (${loudnessScanProgress.total} tracks)`;
    setTimeout(() => { label.style.display = 'none'; }, 3000);
    if (btn) btn.textContent = 'Scan Library for Loudness';
  } else {
    label.style.display = 'none';
    if (btn) btn.textContent = 'Scan Library for Loudness';
  }
}

const scanLoudnessBtn = document.getElementById('scanLoudnessBtn');
if (scanLoudnessBtn) {
  scanLoudnessBtn.addEventListener('click', () => {
    if (loudnessScanRunning) {
      cancelLoudnessScan();
    } else {
      runLoudnessScan();
    }
  });
}

let hlsInstance = null;
const wrapper = document.getElementById("visualizerWrapper");
 async function playTrack(index) {
  stopVideo();
  stopStreamRefresh();
    if (resilientAudioHls) {
    resilientAudioHls.destroy();
    resilientAudioHls = null;
  }
 
  if (index < 0 || index >= audioFiles.length) return;
  currentIndex = index;
  selectedIndices.clear();
  selectedIndices.add(currentIndex);
  lastSelectedIndex = currentIndex;

  const item = audioFiles[index];


  if (typeof item === 'string') {
  const normalizedPath = item.replace(/\\/g, '/');
  const encodedPath = encodeURI(normalizedPath).replace(/#/g, '%23');
  src = `file://${encodedPath}`;

  displayName = getCleanName(item);



  } else if (item.isStream) {
    src = item.url;
    displayName = item.name || 'Radio Stream';
} else if (item.isJellyfin) {
    src = item.url;
    displayName = item.name;
} else {
    return;
}


  const loudnessKey = getTrackLoudnessKey(item);
  if (loudnessKey && trackLoudnessCache[loudnessKey] !== undefined) {
    applyTrackNormGain(trackLoudnessCache[loudnessKey]);
  } else {
    trackNormGain.gain.value = 1;
  }

 const isHlsSource = src.includes('.m3u8');


if (isHlsSource) {
  if (audioHlsRef.current) audioHlsRef.current.destroy();

  const hlsItem = item;

  audioHlsRef.current = createResilientHls(() => hlsItem.url, audio, {
onDead: async (reason) => {
  console.warn('[HLS] Main stream dead:', reason);
  if (hlsItem.originalUrl) {
    const result = await window.electronAPI.resolveStreamUrl(hlsItem.originalUrl);
    if (result.success && result.url) {
      hlsItem.url = result.url;
      if (audioHlsRef.current) audioHlsRef.current.destroy();
      audioHlsRef.current = createResilientHls(() => hlsItem.url, audio, {});
      audioHlsRef.current.start();

      if (resilientVizHls) {
        resilientVizHls.destroy();
        resilientVizHls = createResilientHls(() => hlsItem.url, visualizerVideo, { isVisualizer: true });
        resilientVizHls.start();
      }
      return;
    }
  }
  audio.pause();

    }
  });
  audioHlsRef.current.start();

} else {
  if (audioHlsRef.current) { audioHlsRef.current.destroy(); audioHlsRef.current = null; }
  audio.src = src;
  audio.play().catch(console.error);
}
  await setVisualizerBackground(item);

  const trackData = {
    songName: displayName,
    artUrl: visualizerCanvas.style.backgroundImage.slice(5, -2) || null,
    isPlaying: true,
    volume: audio.volume
  };

  if (!videoOnlyMode && !isMini && !isWidgetMode) {
    wrapper.classList.add("playing");
  } else {
    wrapper.classList.remove("playing");
  }

 if (videoOnlyMode && !item.isJellyfin) {
  updateVideoSongName(displayName);
}
  setVideoOnlyBackground(item)
  renderPlaylist();
  updateSelectionVisuals();
  visualize();
  scrollToCurrentTrack();
  if(isWidgetMode){
  updateWidgetSongName(displayName);
  }


if (item.isStream) {
    currentTimeElem.textContent = 'LIVE';
    durationElem.textContent = '∞';
    startStreamRefresh(item, 90 * 1000);
  } else {
    currentTimeElem.textContent = '0:00';
    durationElem.textContent = '0:00';
  }

  if (notifyEnabled && Notification.permission === 'granted') {
    window.electronAPI.notify('Now Playing', displayName);
  }
}


const playPauseBtn = document.getElementById('playPauseBtn');
const playPauseIcon = document.getElementById('playPauseIcon');

playPauseBtn.addEventListener('click', () => {
  if (audio.paused) {
    audio.play();
    visualizerVideo.play();
    if (notifyEnabled && Notification.permission === 'granted') {
    window.electronAPI.notify(`Resuming`, displayName);
  }
  } else {
    audio.pause();
    visualizerVideo.pause();
    if (notifyEnabled && Notification.permission === 'granted') {
    window.electronAPI.notify('Paused', displayName);
  }
  }
});


audio.addEventListener('play', () => {
  renderPlaylist();
  playPauseIcon.src = 'build/pause.svg';
  playPauseIcon.alt = 'Pause';
});

audio.addEventListener('pause', () => {
  renderPlaylist();
  playPauseIcon.src = 'build/play.svg';
  playPauseIcon.alt = 'Play';
});


if (audio.paused) {
  playPauseIcon.src = 'build/play.svg';
} else {
  playPauseIcon.src = 'build/pause.svg';
}

  volumeSlider.addEventListener('input', (e) => {
    audio.volume = e.target.value;
  });


  audio.addEventListener('timeupdate', () => {
  const currentItem = audioFiles[currentIndex];

  if (!isSeeking) {
    if (currentItem && currentItem.isStream) {
      currentTimeElem.textContent = 'LIVE';
      durationElem.textContent = '∞';
      progressBar.value = 0;
      progressBar.max = 1;
    } else if (audio.duration && isFinite(audio.duration)) {
      progressBar.max = audio.duration;
      progressBar.value = audio.currentTime;
      currentTimeElem.textContent = formatTime(audio.currentTime);
      durationElem.textContent = formatTime(audio.duration);
    }
    updateSliderBackground(progressBar);
  }
});


progressBar.addEventListener('input', () => {
    const newTime = parseFloat(progressBar.value);
    if (!isNaN(newTime) && audio.duration) {
        audio.currentTime = newTime;
    }
    if (gifPreviewEnabled && visualizerVideo.src && visualizerVideo.style.display !== 'none') {
        if (!isNaN(visualizerVideo.duration) && isFinite(visualizerVideo.duration)) {
            const target = newTime % visualizerVideo.duration;
            if (Math.abs(visualizerVideo.currentTime - target) > 0.3) {
                visualizerVideo.currentTime = target;
            }
        }
    }
});


progressBar.addEventListener('change', () => {
    const newTime = parseFloat(progressBar.value);
    if (!isNaN(newTime) && audio.duration) {
        audio.currentTime = newTime;
    }
    
    isSeeking = false;
});

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }
  function getCleanName(item) {
  if (!item) return 'Unknown Track';
  if (typeof item === 'string') {
    return item.split(/[\\/]/).pop().replace(/\.[^.]+$/, '').trim();
  }
  return item.name || 'Unknown Track';
}

let energyHistory;
let lastBeat = false;
let lastWidth = 0;
let lastHeight = 0;

function visualize() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  const canvas = visualizerCanvas;
  const width = canvas.offsetWidth;
  const height = canvas.offsetHeight;

  if (width !== lastWidth || height !== lastHeight) {
    canvas.width = width;
    canvas.height = height;
    lastWidth = width;
    lastHeight = height;
  }

  const ctx = canvas.getContext('2d');
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  let frameCounter = 0;
  let lastTime = 0;
  var lastBeatTime = 0;
  async function draw(timestamp) {
    animationFrameId = requestAnimationFrame(draw);
   
    lastTime = timestamp || performance.now();
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    ctx.clearRect(0, 0, width, height);
    if (currentArtImage && currentArtImage.complete && currentArtImage.naturalWidth > 0) {
      try {
        ctx.globalAlpha = 0.4;
        ctx.drawImage(
          currentArtImage,
          0, 0, currentArtImage.naturalWidth, currentArtImage.naturalHeight,
          0, 0, width, height
        );
        ctx.globalAlpha = 1.0;
      } catch (e) {
        console.warn('[VISUALIZER] Failed to draw art this frame:', e);
      }
    }

    let songName = 'No Track';
    let isRadioStream = false;
    const currentItem = audioFiles[currentIndex];
    if (currentItem) {
      if (typeof currentItem === 'string') {
        songName = getCleanName(currentItem) || 'Unknown Track';
      } else if (currentItem.isStream) {
        isRadioStream = true;
        songName = currentItem.name?.trim() || (new URL(currentItem.url).hostname || 'Radio Stream');
      } else if (currentItem.isJellyfin) {
        songName = currentItem.name || 'Unknown Track';
      }
    }
    if (songName.length > 50) songName = songName.slice(0, 47) + '...';

    const isMini = document.body.classList.contains('mini-mode');
    const iconSize = isMini ? 10 : 14;
    const textY = isMini ? 14 : 18;
    const maxWidth = width * 0.92;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    

    let displayText = songName;
    let textWidth = ctx.measureText(displayText).width;
    if (textWidth > maxWidth) {
      const ellipsis = '...';
      let availableWidth = maxWidth - ctx.measureText(ellipsis).width;
      let low = 0, high = songName.length;
      while (low < high) {
        let mid = Math.floor((low + high + 1) / 2);
        let testText = songName.slice(0, mid);
        if (ctx.measureText(testText).width <= availableWidth) low = mid;
        else high = mid - 1;
      }
      displayText = songName.slice(0, low) + ellipsis;
    }

    let textX = width / 2;
    if (isRadioStream && radioIconImg.complete && !document.body.classList.contains('widget-mode')) {
    const totalWidth = ctx.measureText(displayText).width + iconSize + 8;
    const startX = width / 2 - totalWidth / 2;

    ctx.save();
    ctx.filter = 'brightness(0) invert(1)';
    ctx.drawImage(radioIconImg, startX, textY - iconSize + 2, iconSize, iconSize);
    ctx.restore();

    textX = startX + iconSize + 8 + ctx.measureText(displayText).width / 2;
    } else if (isRadioStream) {
        textX = width / 2;
    }
    if(!isWidgetMode){
    ctx.globalAlpha = 1.0;
 
    ctx.fillText(displayText, textX, textY);
    
    }

   if (!isWidgetMode && !isMini) {
      let infoLines = [];
      const totalTracks = audioFiles.length;
      if (totalTracks > 0) {
        infoLines.push(`${totalTracks} track${totalTracks > 1 ? 's' : ''} in playlist`);
      }
      const currentItem = audioFiles[currentIndex];
    if (currentItem && typeof currentItem === 'string') {
      const filePath = currentItem;

      let meta = currentMetadataCache.get(filePath);
      if (!meta) {
        meta = await window.electronAPI.getAudioMetadata(filePath);
        if (meta) currentMetadataCache.set(filePath, meta);
      }

      if (meta) {
        const parts = [];

        if (meta.codec) parts.push(meta.codec);
        if (meta.bitrate) parts.push(meta.bitrate);
        if (meta.sampleRate) parts.push(meta.sampleRate);
        if (meta.bitDepth) parts.push(meta.bitDepth);
        if (meta.duration) {
          const min = Math.floor(meta.duration / 60);
          const sec = Math.floor(meta.duration % 60);
          parts.push(`${min}:${sec.toString().padStart(2, '0')}`);
        }

        if (parts.length > 0) {
          infoLines.push(parts.join(' • '));
        }
      } else {
        const ext = filePath.split('.').pop().toUpperCase();
        infoLines.push(ext);
      }
    } 
      else if (currentItem?.isStream) {
        infoLines.push('LIVE STREAM');
      } 
      else if (currentItem?.isJellyfin) {
        infoLines.push('Jellyfin');
      }
      if (infoLines.length > 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.80)';
        ctx.textAlign = 'center';
        ctx.shadowBlur = 0;

        const startY = textY + 18;

        infoLines.forEach((line, i) => {
          ctx.fillText(line, width / 2, startY + (i * 14));
        });
      }
   }

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    if (!visualizerToggle || !analyser || !isMainWindowVisible) return;

    analyser.getByteFrequencyData(dataArray);
    frameCounter++;

     let bassEnergy = 0;
    for (let i = 1; i <= 4; i++) bassEnergy += dataArray[i];
    bassEnergy /= 4;

    if (!energyHistory) energyHistory = [];
    energyHistory.push(bassEnergy);
    if (energyHistory.length > 32) energyHistory.shift();

    const avgEnergy =
      energyHistory.reduce((a, b) => a + b, 0) / energyHistory.length;

    const sensitivity = 1.25;
    const threshold = avgEnergy * sensitivity;
    let isBeat = false;
    const now = performance.now();
    const REFRACTORY_MS = 200;

    if (bassEnergy > threshold && now - lastBeatTime > REFRACTORY_MS) {
        isBeat = true;
        lastBeatTime = now;
    } else {
        isBeat = false;
    }

    const currentPrimaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim() || '#a88cff';

    if (isRainbowActive) {
      let bass = 0, mids = 0;
      for (let i = 0; i < 6; i++) bass += dataArray[i];
      for (let i = 12; i < 22; i++) mids += dataArray[i];
      bass /= 6; mids /= 10;

      if (window.prevBass === undefined) window.prevBass = bass;
      if (window.prevMids === undefined) window.prevMids = mids;

      const bassDelta = bass - window.prevBass;
      const midDelta = mids - window.prevMids;
      window.prevBass = bass;
      window.prevMids = mids;

      if (!window.bassDeltaHist) window.bassDeltaHist = [];
      window.bassDeltaHist.push(bassDelta);
      if (window.bassDeltaHist.length > 20) window.bassDeltaHist.shift();

      const avgBassDelta = window.bassDeltaHist.reduce((a, b) => a + b, 0) / window.bassDeltaHist.length;
      const now = performance.now();
      if (!window.lastBeatTime) window.lastBeatTime = 0;

      let triggerBeat = false;
      if (bassDelta > avgBassDelta * 1.8 && bassDelta > 4 && bassDelta > midDelta * 1.5 && now - window.lastBeatTime > 1) {
        triggerBeat = true;
        window.lastBeatTime = now;
      }

      if (window.rainbowHue === undefined) window.rainbowHue = Math.floor(Math.random() * 360);
      if (triggerBeat) window.rainbowHue = (window.rainbowHue + 60) % 360;

      const color = `hsl(${window.rainbowHue}, 100%, ${triggerBeat ? 70 : 55}%)`;
      const darkColor = `hsl(${window.rainbowHue}, 100%, ${triggerBeat ? 40 : 30}%)`;
      document.documentElement.style.setProperty('--primary-color', color);
      document.documentElement.style.setProperty('--primary-dark', darkColor);
    }

   if (visualizerMode === 'bars') {
  const barCount = isMini ? 48 : 64;
  const skipBins = 3;
  const usableBins = bufferLength - skipBins;
  const step = Math.max(1, Math.floor(usableBins / barCount));
  const barWidth = Math.max(1.5, (width / barCount) * 0.8);
  const centerX = width / 2;
  const spacing = 1;
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, currentPrimaryColor);
  gradient.addColorStop(0.5, adjustColor(currentPrimaryColor, -20));
  gradient.addColorStop(1, currentPrimaryColor);
  ctx.fillStyle = gradient;

  for (let i = 0; i < barCount; i++) {
    const value = dataArray[skipBins + i * step] || 0;
    const barHeight = value * (height / 255) * (isMini ? 0.7 : 0.55);
    const xLeft = centerX - (i + 1) * (barWidth + spacing);
    const xRight = centerX + i * (barWidth + spacing);
    const y = height - barHeight;

    if (xLeft + barWidth > 0) ctx.fillRect(xLeft, y, barWidth, barHeight);
    if (xRight < width) ctx.fillRect(xRight, y, barWidth, barHeight);
  }

    }  else if (visualizerMode === 'bubbles') {
        if (window.katBubbles) window.katBubbles = [];
        if (window.nukeBubbles) window.nukeBubbles = [];
        if (!window.bubbles) window.bubbles = [];

        const MAX_BUBBLES = 25;
        const bassLevel = bassEnergy / 255;

  if (Math.random() < bassLevel * 0.35) {
    const img = getRandomBubbleImage(bubbleImages);
    if (img) {
      window.bubbles.push({
        x: Math.random() * width,
        y: height + 30,
        img: img,
        size: 20 + Math.random() * 30,
        speedY: 1.2 + Math.random() * 2,
        speedX: (Math.random() - 0.5) * 1,
        opacity: 0.7 + Math.random() * 0.3
      });
    }
  }

  if (isBeat && window.bubbles.length < MAX_BUBBLES) {
    const burstCount = 3 + Math.floor(Math.random() * 5);
    for (let i = 0; i < burstCount; i++) {
      const img = getRandomBubbleImage(bubbleImages);
      if (img) {
        window.bubbles.push({
          x: Math.random() * width,
          y: height + 50,
          img: img,
          size: 50 + Math.random() * 60,
          speedY: 3 + Math.random() * 5,
          speedX: (Math.random() - 0.5) * 4,
          opacity: 1
        });
      }
    }
  }

  for (let i = window.bubbles.length - 1; i >= 0; i--) {
  const b = window.bubbles[i];
  b.y -= b.speedY;
  b.x += b.speedX;
  b.opacity -= 0.004;

  const x = b.x - b.size / 2;
  const y = b.y - b.size / 2;

  ctx.globalAlpha = Math.max(0, b.opacity);

  ctx.save();
  ctx.drawImage(b.img, x, y, b.size, b.size);
  const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim() || '#a88cff';
  ctx.shadowColor = primary;
  ctx.shadowBlur = b.size * 0.4;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(b.img, x, y, b.size, b.size);
  ctx.shadowBlur = 0;
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.restore();

  if (b.y + b.size < -50 || b.opacity <= 0) {
    window.bubbles.splice(i, 1);
  }
}

    } else if (visualizerMode === 'katbubbles') {
      if (window.bubbles) window.bubbles = [];
      if (window.nukeBubbles) window.nukeBubbles = [];
      if (!window.katBubbles) window.katBubbles = [];

      const MAX_KAT_BUBBLES = 25;
      const bassLevel = bassEnergy / 255;

      if (Math.random() < bassLevel * 0.35) {
        const img = getRandomBubbleImage(katbubbleImages);
        if (img) {
          window.katBubbles.push({
            x: Math.random() * width,
            y: height + 30,
            img: img,
            size: 15 + Math.random() * 20,
            speedY: 1.2 + Math.random() * 2,
            speedX: (Math.random() - 0.5) * 1,
            opacity: 0.7 + Math.random() * 0.3
          });
        }
      }

      if (isBeat && window.katBubbles.length < MAX_KAT_BUBBLES) {
        const burstCount = 3 + Math.floor(Math.random() * 5);
        for (let i = 0; i < burstCount; i++) {
          const img = getRandomBubbleImage(katbubbleImages);
          if (img) {
            window.katBubbles.push({
              x: Math.random() * width,
              y: height + 50,
              img: img,
              size: 30 + Math.random() * 40,
              speedY: 3 + Math.random() * 5,
              speedX: (Math.random() - 0.5) * 4,
              opacity: 1
            });
          }
        }
      }

      for (let i = window.katBubbles.length - 1; i >= 0; i--) {
        const b = window.katBubbles[i];
        b.y -= b.speedY;
        b.x += b.speedX;
        b.opacity -= 0.004;
        ctx.save();
        ctx.drawImage(b.img, b.x, b.y, b.size, b.size);
        const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim() || '#a88cff';
        ctx.shadowColor = primary;
        ctx.shadowBlur = b.size * 0.4;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.globalAlpha = 0.3;
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(b.img, b.x, b.y, b.size, b.size);
        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.11;
        ctx.restore();
        if (b.y + b.size < -50 || b.opacity <= 0) {
          window.katBubbles.splice(i, 1);
        }
      }
    } else if (visualizerMode === 'nukebubbles') {
      if (window.bubbles) window.bubbles = [];
      if (window.katBubbles) window.katBubbles = [];
      if (!window.nukeBubbles) window.nukeBubbles = [];

      const MAX_NUKE_BUBBLES = 25;
      const bassLevel = bassEnergy / 255;

      if (Math.random() < bassLevel * 0.35) {
        const img = getRandomBubbleImage(nukebubbleImages);
        if (img) {
          window.nukeBubbles.push({
            x: Math.random() * width,
            y: height + 30,
            img: img,
            size: 15 + Math.random() * 20,
            speedY: 1.2 + Math.random() * 2,
            speedX: (Math.random() - 0.5) * 1,
            opacity: 0.7 + Math.random() * 0.3
          });
        }
      }

      if (isBeat && window.nukeBubbles.length < MAX_NUKE_BUBBLES) {
        const burstCount = 3 + Math.floor(Math.random() * 5);
        for (let i = 0; i < burstCount; i++) {
          const img = getRandomBubbleImage(nukebubbleImages);
          if (img) {
            window.nukeBubbles.push({
              x: Math.random() * width,
              y: height + 50,
              img: img,
              size: 30 + Math.random() * 40,
              speedY: 3 + Math.random() * 5,
              speedX: (Math.random() - 0.5) * 4,
              opacity: 1
            });
          }
        }
      }

      for (let i = window.nukeBubbles.length - 1; i >= 0; i--) {
        const b = window.nukeBubbles[i];
        b.y -= b.speedY;
        b.x += b.speedX;
        b.opacity -= 0.004;
        ctx.save();
        ctx.drawImage(b.img, b.x, b.y, b.size, b.size);
        const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim() || '#a88cff';
        ctx.shadowColor = primary;
        ctx.shadowBlur = b.size * 0.4;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.globalAlpha = 0.5;
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(b.img, b.x, b.y, b.size, b.size);
        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.11;
        ctx.restore();
        if (b.y + b.size < -50 || b.opacity <= 0) {
          window.nukeBubbles.splice(i, 1);
        }
      }
    }
  }

  animationFrameId = requestAnimationFrame(draw);
}


function getRandomBubbleImage(version) {
  const loaded = version.filter(img => img.complete);
  if (loaded.length === 0) return null;
  return loaded[Math.floor(Math.random() * loaded.length)];
}

let isMainWindowVisible = true;

document.addEventListener('visibilitychange', () => {
  isMainWindowVisible = !document.hidden;
  if (!isMainWindowVisible) {
       document.body.classList.add('minimized');
    stopVisualizer();
  } else {
    document.body.classList.remove('minimized');
    if (visualizerToggle) visualize();
  }
});

  function adjustColor(color, percent) {
    if (color.startsWith('hsl')) {
      const match = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
      if (!match) return color;
      let [, hue, saturation, lightness] = match;
      hue = parseInt(hue);
      saturation = parseInt(saturation);
      lightness = parseInt(lightness);
      lightness = Math.min(100, Math.max(0, lightness + percent));
      return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }

    let hex = color.replace('#', '');
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return color;

    let r = parseInt(hex.slice(0, 2), 16);
    let g = parseInt(hex.slice(2, 4), 16);
    let b = parseInt(hex.slice(4, 6), 16);

    r = Math.min(255, Math.max(0, Math.round(r * (1 + percent / 100))));
    g = Math.min(255, Math.max(0, Math.round(g * (1 + percent / 100))));
    b = Math.min(255, Math.max(0, Math.round(b * (1 + percent / 100))));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  const notifyToggleBtn = document.getElementById('notifyToggleBtn');
  const bellIcon = document.getElementById('bellIcon');
  bellIcon.src = notifyEnabled ? 'build/bell-ring.svg' : 'build/bell.svg';

  notifyToggleBtn.addEventListener('click', () => {
    notifyEnabled = !notifyEnabled;
    localStorage.setItem('notifyEnabled', notifyEnabled);
    bellIcon.src = notifyEnabled ? 'build/bell-ring.svg' : 'build/bell.svg';
    if (notifyEnabled && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        if (permission !== 'granted') {
          notifyEnabled = false;
          localStorage.setItem('notifyEnabled', 'false');
          alert('Notifications not enabled in browser.');
        }
      });
    }
  });

let gifPreviewEnabled = localStorage.getItem('gifPreviewEnabled') === 'true';
document.getElementById('gifIcon').src = 'build/gif.svg';
updateGifIcon();

gifPreviewToggleBtn.addEventListener('click', async () => {
    const wasEnabled = gifPreviewEnabled;

    gifPreviewEnabled = !gifPreviewEnabled;
    localStorage.setItem('gifPreviewEnabled', gifPreviewEnabled);
    updateGifIcon();

    if (currentIndex >= audioFiles.length || !audioFiles[currentIndex]) return;

    const currentTrack = audioFiles[currentIndex];
    if (typeof currentTrack !== 'string') return;

    if (gifPreviewEnabled && !wasEnabled) {
        stopVideo();

        const dir = await window.electronAPI.pathDirname(currentTrack);
        const ext = await window.electronAPI.pathExtname(currentTrack);
        const baseName = await window.electronAPI.pathBasename(currentTrack, ext);

        const possibleVideos = [
            baseName + '.mp4',
            baseName + '.webm',
            baseName + '-video.mp4',
            baseName + '-preview.mp4'
        ];

        for (const name of possibleVideos) {
            const candidatePath = await window.electronAPI.pathJoin(dir, name);
            if (await window.electronAPI.fileExists(candidatePath)) {
                const url = `file://${candidatePath.replace(/\\/g, '/').replace(/#/g, '%23')}`;
                visualizerVideo.src = url;
                visualizerVideo.style.display = 'block';
                visualizerVideo.style.opacity = '1';
                visualizerVideo.style.zIndex = '0';
                visualizerVideo.loop = true;
                visualizerVideo.muted = true;
                visualizerVideo.playsInline = true;
                clearBackground();

                visualizerVideo.onloadedmetadata = () => {
                    const videoDuration = visualizerVideo.duration;
                    const songDuration = audio.duration;
                    if (isFinite(videoDuration) && isFinite(songDuration) &&
                        Math.abs(videoDuration - songDuration) / songDuration <= 0.12) {
                        visualizerVideo.currentTime = audio.currentTime % videoDuration;
                    } else {
                        visualizerVideo.currentTime = 0;
                    }
                    if (!audio.paused) {
                        visualizerVideo.play().catch(err => console.warn("Video play blocked:", err));
                    }
                };
                break;
            }
        }
    }
    else if (!gifPreviewEnabled && wasEnabled) {
        stopVideo();
        visualizerVideo.style.display = 'none';
        visualizerVideo.style.opacity = '0';
        visualizerVideo.style.zIndex = '-1';
        await setVisualizerBackground(currentTrack);
    }
});

function updateGifIcon() {
  const img = document.getElementById('gifIcon');
  
  if (gifPreviewEnabled) {
    img.style.filter = 'none';
    img.style.opacity = '1';
  } else {
    img.style.filter = 'brightness(0) invert(1)';
    img.style.opacity = '0.6';
  }
}


  const visualizerToggleBtn = document.getElementById('visualizerToggleBtn');
  const visualizerIcon = document.getElementById('visualizerIcon');
  visualizerIcon.src = visualizerToggle ? 'build/visualizer.svg' : 'build/visualizeroff.svg';

  visualizerToggleBtn.addEventListener('click', () => {
  visualizerToggle = !visualizerToggle;
  localStorage.setItem('visualizerToggle', visualizerToggle);
  visualizerIcon.src = visualizerToggle ? 'build/visualizer.svg' : 'build/visualizeroff.svg';

  if (visualizerToggle) {
    if (!audio.paused) visualize();
    audio.addEventListener('play', visualize);
  } else {
    audio.removeEventListener('play', visualize);
    if (!animationFrameId && !audio.paused) visualize();
  }
});

  if (visualizerToggle) {
    audio.addEventListener('play', visualize);
  }

audio.addEventListener('ended', () => {
  if (repeatTrack) {
    playTrack(currentIndex);
    return;
  }

  if (currentSearchTerm && searchLoopEnabled) {
    let nextFound = false;
    for (let i = currentIndex + 1; i < audioFiles.length; i++) {
      const item = audioFiles[i];
      let text = typeof item === 'string'
        ? item.split(/[\\/]/).pop().toLowerCase()
        : (item.name || '').toLowerCase();
      if (text.includes(currentSearchTerm)) {
        currentIndex = i;
        nextFound = true;
        break;
      }
    }

    if (!nextFound) {
      for (let i = 0; i < audioFiles.length; i++) {
        const item = audioFiles[i];
        let text = typeof item === 'string'
          ? item.split(/[\\/]/).pop().toLowerCase()
          : (item.name || '').toLowerCase();
        if (text.includes(currentSearchTerm)) {
          currentIndex = i;
          break;
        }
      }
    }

    playTrack(currentIndex);
  } else {
    currentIndex++;
    if (currentIndex >= audioFiles.length) {
      currentIndex = 0;
    }
    playTrack(currentIndex);
  }
});

  async function applySavedSort() {
    const criteria = localStorage.getItem('sortCriteria');
    const order = localStorage.getItem('sortOrder');
    if (criteria && order) {
      const sortIdMap = {
        'name-asc': 'sortNameAsc',
        'name-desc': 'sortNameDesc',
        'date-asc': 'sortDateAsc',
        'date-desc': 'sortDateDesc'
      };

      const key = `${criteria}-${order}`;
      const buttonId = sortIdMap[key];

      if (buttonId) {
        updateSortCheckmark(buttonId);
      }

      return await sortPlaylist(criteria, order === 'asc');
    }
    return 0;
  }

  function updateStoredPlaylist() {
    try {
      localStorage.setItem('sortedPlaylist', JSON.stringify(audioFiles));
    } catch (e) {
      console.error('Failed to save playlist:', e);
    }
  }

function scrollToCurrentTrack(forceTop = false) {
  const currentItem = playlistElem.querySelector(`li[data-real-index="${currentIndex}"]`);
  
  if (!currentItem) return;

  if (forceTop) {
    playlistElem.scrollTop = 0;
    return;
  }

  const isShortList = playlistElem.scrollHeight <= playlistElem.clientHeight + 50;
  const searchActive = currentSearchTerm !== '';

  if (isShortList || searchActive) {
    currentItem.scrollIntoView({
      behavior: 'smooth',
      block: 'center', 
      inline: 'nearest'
    });
  } else {
    currentItem.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }
}

  let rainbowHue = 0;
function stopVisualizer() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  ctx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
  window.electronAPI.disableVisualizer();
}





function startRainbowColorLoop() {
  rainbowIntervalId = setInterval(() => {
    rainbowHue = (rainbowHue + 5) % 360;
    const color = `hsl(${rainbowHue}, 100%, 65%)`;
    const darkColor = `hsl(${rainbowHue}, 100%, 45%)`;

    document.documentElement.style.setProperty('--primary-color', color);
    document.documentElement.style.setProperty('--primary-dark', darkColor);

    updateSliderBackground(volumeSlider);
    updateSliderBackground(progressBar);
  }, 1);
}

function stopRainbowLoop() {
  if (rainbowIntervalId) {
    clearInterval(rainbowIntervalId);
    rainbowIntervalId = null;
    let defaultColor = localStorage.getItem('themeColor');
    document.documentElement.style.setProperty('--primary-color', defaultColor);
  }
}





  window.electronAPI.onRequestCurrentState(() => {
  if (audioFiles[currentIndex]) {
    const filePath = audioFiles[currentIndex];
    setVisualizerBackground(filePath).then(() => {
      const trackData = {
        songName: filePath.split(/[\\/]/).pop(),
        artUrl: visualizerCanvas.style.backgroundImage.slice(5, -2),
        isPlaying: !audio.paused,
        filePath: filePath,
        volume: audio.volume
      };
    });
  } else {
  }
});



document.addEventListener('DOMContentLoaded', () => {
  const toggleRow = document.getElementById('autoUpdateAppToggle');
  const checkbox = document.getElementById('autoUpdateAppCheckbox');

  let isEnabled = localStorage.getItem('autoUpdateEnabled') === 'true';
  checkbox.checked = isEnabled;
  toggleRow.classList.toggle('active', isEnabled);
  window.electronAPI?.setAutoUpdateEnabled?.(isEnabled);
  toggleRow.addEventListener('click', (e) => {
    if (e.target.closest('.switch')) return;

    isEnabled = !isEnabled;
    localStorage.setItem('autoUpdateEnabled', isEnabled ? 'true' : 'false');

    checkbox.checked = isEnabled;
    toggleRow.classList.toggle('active', isEnabled);
    window.electronAPI?.setAutoUpdateEnabled?.(isEnabled);

    if (isEnabled) {
      window.electronAPI?.checkForUpdates?.();
      if (notifyEnabled && Notification.permission === 'granted') {
        window.electronAPI.notify("Auto-updates ON – checking now");
      }
    } else {
      if (notifyEnabled && Notification.permission === 'granted') {
        window.electronAPI.notify("Auto-updates OFF – no more bullshit checks");
      }
    }
  });
});

function checkForUpdatesSilently() {
  if (typeof autoUpdater !== 'undefined' && autoUpdater.checkForUpdates) {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {
    });
  }
}


function createResilientHls(getUrl, mediaEl, { isVisualizer = false, onDead = null } = {}) {
  let hls = null;
  let retryCount = 0;
  const MAX_RETRIES = 8;
  let retryTimer = null;
  let dead = false;

  function destroy() {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    if (hls) { hls.destroy(); hls = null; }
  }

  function start() {
    destroy();
    dead = false;
    const url = typeof getUrl === 'function' ? getUrl() : getUrl;
    if (!Hls.isSupported()) {
      mediaEl.src = url;
      mediaEl.play().catch(() => {});
      return null;
    }

    hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      liveSyncDuration: 6,
      liveMaxLatencyDuration: 12,
      backBufferLength: 10,
      maxBufferLength: 30,
      manifestLoadingTimeOut: 10000,
      manifestLoadingMaxRetry: 6,
      manifestLoadingRetryDelay: 1000,
      fragLoadingTimeOut: 20000,
      fragLoadingMaxRetry: 6,
      fragLoadingRetryDelay: 1000,
      xhrSetup: (xhr) => { xhr.withCredentials = true; }
    });

    hls.loadSource(url);
    hls.attachMedia(mediaEl);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      retryCount = 0;
      mediaEl.play().catch(() => {});
    });

    hls.on(Hls.Events.ERROR, (event, data) => {
      if (!data.fatal) return;
      console.log(`[HLS${isVisualizer ? ' viz' : ''} Error]`, data.details, data);

 if (
  data.details === 'manifestLoadError' ||
  data.details === 'manifestLoadTimeOut' ||
  (data.details === 'levelLoadError' && data.response?.code === 403)
) {
  destroy();
  dead = true;
  if (onDead) onDead(data.details);
  return;
}

      if (retryCount >= MAX_RETRIES) {
        destroy();
        dead = true;
        if (onDead) onDead('max retries');
        return;
      }

      retryCount++;
      const delay = Math.min(1000 * 2 ** retryCount, 15000);

      switch (data.type) {
        case Hls.ErrorTypes.NETWORK_ERROR:
          retryTimer = setTimeout(() => {
            if (dead) return;
            console.log(`[HLS${isVisualizer ? ' viz' : ''}] Reconnecting (attempt ${retryCount})`);
            start();
          }, delay);
          break;
        case Hls.ErrorTypes.MEDIA_ERROR:
          try { hls.recoverMediaError(); }
          catch (e) { retryTimer = setTimeout(() => { if (!dead) start(); }, delay); }
          break;
        default:
          retryTimer = setTimeout(() => { if (!dead) start(); }, delay);
      }
    });

    return hls;
  }

  return { start, destroy, get instance() { return hls; } };
}

let streamRefreshTimer = null;

function startStreamRefresh(item, intervalMs = 2 * 60 * 1000) {
  stopStreamRefresh();
  streamRefreshTimer = setInterval(async () => {
    if (!item?.originalUrl) return;
    console.log('[Stream] Background pre-fetching fresh URL...');
    const result = await window.electronAPI.resolveStreamUrl(item.originalUrl);
    if (!result.success || !result.url) {
      console.warn('[Stream] Pre-fetch failed:', result.message);
      return;
    }
    item.url = result.url;
    console.log('[Stream] Fresh URL ready, will use on next reconnect');
  }, intervalMs);
}

function stopStreamRefresh() {
  if (streamRefreshTimer) {
    clearInterval(streamRefreshTimer);
    streamRefreshTimer = null;
  }
}


const allModalsFromHamburger = [
  document.getElementById('ytModal'),         
  document.getElementById('aboutModal'),       
  document.getElementById('customBgModal'),  
  document.getElementById('eqModal'),
 
];

allModalsFromHamburger.forEach(modal => {
  if (modal) {
    const observer = new MutationObserver(() => {
      if (modal.style.display === 'flex' || modal.style.display === 'block') {
        hamburgerMenu.style.display = 'none';
        menuOpen = false;
      }
    });
    observer.observe(modal, { attributes: true, attributeFilter: ['style'] });
  }
});

let recentDlFolders = JSON.parse(localStorage.getItem('neonkatRecentDlFolders') || '[]');

function addToRecentDlFolders(folderPath) {
  if (!folderPath || typeof folderPath !== 'string') return;
  recentDlFolders = recentDlFolders.filter(p => p !== folderPath);
  recentDlFolders.unshift(folderPath);
  if (recentDlFolders.length > 100) {
    recentDlFolders = recentDlFolders.slice(0, 100);
  }
  localStorage.setItem('neonkatRecentDlFolders', JSON.stringify(recentDlFolders));
   localStorage.setItem('lastDownloadFolder', folderPath);
  renderRecentDlFolders();
}

function renderRecentDlFolders() {
  const container = document.getElementById('recentDlFolders');
    const countBadge = document.getElementById('dlFolderCountBadge');
  countBadge.textContent = `${recentDlFolders.length}/100`;
  if (!container) return;

  container.innerHTML = '';

  if (recentDlFolders.length === 0) {
    const empty = document.createElement('div');
    empty.style.padding = '10px';
    empty.style.color = '#777';
    empty.textContent = 'No recent folders yet';
    container.appendChild(empty);
    return;
  }

  recentDlFolders.forEach((path, idx) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.padding = '8px 12px';
    row.style.cursor = 'pointer';
    row.style.transition = 'background 0.12s';

    row.addEventListener('mouseenter', () => {
      row.style.setProperty('background', 'var(--primary-color)', 'important');
    });
    row.addEventListener('mouseleave', () => {
      row.style.background = '';
    });

    const label = document.createElement('span');
    let display = path.split(/[\\/]/).pop() || path;
    if (display.length > 45) {
      display = '…' + display.slice(-42);
    }
    label.textContent = display;
    label.title = path;
    label.style.flex = '1';
    label.style.whiteSpace = 'nowrap';
    label.style.overflow = 'hidden';
    label.style.textOverflow = 'ellipsis';
    label.style.fontSize = '13px';

    const removeBtn = document.createElement('button');
    removeBtn.textContent = '×';
    removeBtn.style.cssText = `
      background: none;
      border: none;
      color: #ff5555;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
      padding: 2px 8px;
      margin-left: 12px;
      opacity: 0.6;
      transition: all 0.15s;
      line-height: 1;
    `;

    removeBtn.addEventListener('mouseenter', () => {
      removeBtn.style.opacity = '1';
      removeBtn.style.transform = 'scale(1.15)';
    });
    removeBtn.addEventListener('mouseleave', () => {
      removeBtn.style.opacity = '0.6';
      removeBtn.style.transform = 'scale(1)';
    });

    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      recentDlFolders.splice(idx, 1);
      localStorage.setItem('neonkatRecentDlFolders', JSON.stringify(recentDlFolders));
      renderRecentDlFolders();
    });

    row.addEventListener('click', () => {
      downloadFolder = path;
      document.getElementById('selectedDlFolder').textContent = path;
      addToRecentDlFolders(path);
      document.getElementById('recentDlFoldersMenu').style.display = 'none';
    });

    row.appendChild(label);
    row.appendChild(removeBtn);
    container.appendChild(row);
  });
}

function initDownloadFolderDropdown() {
  const chooseDlFolderBtn = document.getElementById('chooseDlFolderBtn');
  const recentDlFoldersMenu = document.getElementById('recentDlFoldersMenu');
  const pickNewDlFolderBtn = document.getElementById('pickNewDlFolder');

  if (downloadFolder) {
    document.getElementById('selectedDlFolder').textContent = downloadFolder;
  }

  downloadFolder = localStorage.getItem('lastDownloadFolder') || null;
  if (downloadFolder) {
    document.getElementById('selectedDlFolder').textContent = downloadFolder;
  }

  if (!chooseDlFolderBtn || !recentDlFoldersMenu) return;
  chooseDlFolderBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = recentDlFoldersMenu.style.display === 'block';
    recentDlFoldersMenu.style.display = isOpen ? 'none' : 'block';
    
    if (!isOpen) {
      renderRecentDlFolders();
    }
  });

  if (pickNewDlFolderBtn) {
    pickNewDlFolderBtn.addEventListener('click', async () => {
      recentDlFoldersMenu.style.display = 'none';
      const result = await window.electronAPI.pickDownloadFolder();
      if (result.success) {
        downloadFolder = result.folderPath;
        document.getElementById('selectedDlFolder').textContent = downloadFolder;
        addToRecentDlFolders(result.folderPath);
      }
    });
  }
}


let ytdlpArgsHistory = JSON.parse(localStorage.getItem('neonkatYtdlpArgsHistory') || '[]');
const MAX_YTDLP_ARGS_HISTORY = 50;

function addToYtdlpArgsHistory(value) {
  if (!value || typeof value !== 'string') return;
  value = value.trim();
  if (!value) return;
  ytdlpArgsHistory = ytdlpArgsHistory.filter(v => v !== value);
  ytdlpArgsHistory.unshift(value);
  if (ytdlpArgsHistory.length > MAX_YTDLP_ARGS_HISTORY) {
    ytdlpArgsHistory = ytdlpArgsHistory.slice(0, MAX_YTDLP_ARGS_HISTORY);
  }
  localStorage.setItem('neonkatYtdlpArgsHistory', JSON.stringify(ytdlpArgsHistory));
  localStorage.setItem('lastYtdlpArgs', value);
}

function updateSelectedYtdlpArgsDisplay() {
  const span = document.getElementById('selectedYtdlpArgs');
  const val = localStorage.getItem('lastYtdlpArgs');
  if (span) span.textContent = val ? val : 'No extra arguments';
}

function renderYtdlpArgsHistory() {
  const container = document.getElementById('ytdlpArgsHistoryList');
  const countBadge = document.getElementById('ytdlpArgsCountBadge');
  if (!container) return;
  if (countBadge) countBadge.textContent = `${ytdlpArgsHistory.length}/${MAX_YTDLP_ARGS_HISTORY}`;

  container.innerHTML = '';

  if (ytdlpArgsHistory.length === 0) {
    const empty = document.createElement('div');
    empty.style.padding = '10px';
    empty.style.color = '#777';
    empty.textContent = 'No saved arguments yet';
    container.appendChild(empty);
    return;
  }

  ytdlpArgsHistory.forEach((value, idx) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.padding = '8px 12px';
    row.style.cursor = 'pointer';
    row.style.transition = 'background 0.12s';

    row.addEventListener('mouseenter', () => {
      row.style.setProperty('background', 'var(--primary-color)', 'important');
    });
    row.addEventListener('mouseleave', () => { row.style.background = ''; });

    const label = document.createElement('span');
    let display = value.length > 40 ? value.slice(0, 37) + '...' : value;
    label.textContent = display;
    label.title = value;
    label.style.flex = '1';
    label.style.whiteSpace = 'nowrap';
    label.style.overflow = 'hidden';
    label.style.textOverflow = 'ellipsis';
    label.style.fontSize = '13px';

    const removeBtn = document.createElement('button');
    removeBtn.textContent = '×';
    removeBtn.style.cssText = `
      background: none; border: none; color: #ff5555; font-size: 16px;
      font-weight: bold; cursor: pointer; padding: 2px 8px; margin-left: 12px;
      opacity: 0.6; transition: all 0.15s; line-height: 1;
    `;
    removeBtn.addEventListener('mouseenter', () => { removeBtn.style.opacity = '1'; removeBtn.style.transform = 'scale(1.15)'; });
    removeBtn.addEventListener('mouseleave', () => { removeBtn.style.opacity = '0.6'; removeBtn.style.transform = 'scale(1)'; });
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      ytdlpArgsHistory.splice(idx, 1);
      localStorage.setItem('neonkatYtdlpArgsHistory', JSON.stringify(ytdlpArgsHistory));
      renderYtdlpArgsHistory();
    });

row.addEventListener('click', (e) => {
      if (e.target === removeBtn) return;
      const input = document.getElementById('ytdlp-extra-args');
      if (input) input.value = value;
      activeExtraArgs = value;
      addToYtdlpArgsHistory(value);
      updateSelectedYtdlpArgsDisplay();
      renderYtdlpArgsHistory();
      document.getElementById('ytdlpArgsMenu').style.display = 'none';
    });

    row.appendChild(label);
    row.appendChild(removeBtn);
    container.appendChild(row);
  });
}

function initYtdlpArgsDropdown() {
  const btn = document.getElementById('ytdlpArgsBtn');
  const menu = document.getElementById('ytdlpArgsMenu');
  const useBtn = document.getElementById('useYtdlpArgsBtn');
  const input = document.getElementById('ytdlp-extra-args');
  if (!btn || !menu) return;
  updateSelectedYtdlpArgsDisplay();

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = menu.style.display === 'block';
    menu.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) renderYtdlpArgsHistory();
  });

  document.addEventListener('click', (e) => {
    if (!btn.contains(e.target) && !menu.contains(e.target)) {
      menu.style.display = 'none';
    }
  });

if (useBtn) {
    useBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const val = input?.value.trim();
       if (val) {
      addToYtdlpArgsHistory(val);
      activeExtraArgs = val;
    }
      input.value = '';
      updateSelectedYtdlpArgsDisplay();
      renderYtdlpArgsHistory();
      menu.style.display = 'none';
    });
  }

  const clearArgsBtn = document.createElement('button');
  clearArgsBtn.textContent = 'Clear';
  clearArgsBtn.style.cssText = 'width: 100%; margin-top: 4px; padding: 8px; background: none; border: none; border-radius: 6px; color: white; font-weight: bold; cursor: pointer; text-align: left; font-size: 13px;';
  clearArgsBtn.addEventListener('mouseenter', () => { clearArgsBtn.style.background = 'var(--primary-color)'; clearArgsBtn.style.color = 'white'; });
  clearArgsBtn.addEventListener('mouseleave', () => { clearArgsBtn.style.background = 'none'; });
  clearArgsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (input) input.value = '';
  activeExtraArgs = '';                 
  localStorage.removeItem('lastYtdlpArgs');
  const span = document.getElementById('selectedYtdlpArgs');
  if (span) span.textContent = 'No extra arguments';
  menu.style.display = 'none';
});;
menu.querySelector('div').appendChild(clearArgsBtn);

  if (input) {
    input.addEventListener('click', e => e.stopPropagation());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        activeExtraArgs = input.value.trim();
        updateSelectedYtdlpArgsDisplay();
        menu.style.display = 'none';
      }
    });
  }
}



let genreHistory = JSON.parse(localStorage.getItem('neonkatGenreHistory') || '[]');
const MAX_GENRE_HISTORY = 50;

function addToGenreHistory(value) {
  if (!value || typeof value !== 'string') return;
  value = value.trim();
  if (!value) return;
  genreHistory = genreHistory.filter(v => v !== value);
  genreHistory.unshift(value);
  if (genreHistory.length > MAX_GENRE_HISTORY) genreHistory = genreHistory.slice(0, MAX_GENRE_HISTORY);
  localStorage.setItem('neonkatGenreHistory', JSON.stringify(genreHistory));
  localStorage.setItem('lastGenre', value);
}
function updateSelectedGenreDisplay() {
  const span = document.getElementById('selectedGenreDisplay');
  const val = localStorage.getItem('lastGenre');
  if (span) span.textContent = val ? val : 'No genre selected (default: Music)';
}

function renderGenreHistory() {
  const container = document.getElementById('genreHistoryList');
  const countBadge = document.getElementById('genreCountBadge');
  const countBadge2 = document.getElementById('genreCountBadge2');
  if (!container) return;
  if (countBadge) countBadge.textContent = `${genreHistory.length}/${MAX_GENRE_HISTORY}`;
  if (countBadge2) countBadge2.textContent = `${genreHistory.length}/${MAX_GENRE_HISTORY}`;

  container.innerHTML = '';

  genreHistory.forEach((value, idx) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.padding = '8px 12px';
    row.style.cursor = 'pointer';

    row.addEventListener('mouseenter', () => row.style.setProperty('background', 'var(--primary-color)', 'important'));
    row.addEventListener('mouseleave', () => row.style.background = '');

    const label = document.createElement('span');
    label.textContent = value.length > 40 ? value.slice(0, 37) + '...' : value;
    label.title = value;
    label.style.flex = '1';
    label.style.whiteSpace = 'nowrap';
    label.style.overflow = 'hidden';
    label.style.textOverflow = 'ellipsis';
    label.style.fontSize = '13px';

    const removeBtn = document.createElement('button');
    removeBtn.textContent = '×';
    removeBtn.style.cssText = `background: none; border: none; color: #ff5555; font-size: 16px; font-weight: bold; cursor: pointer; padding: 2px 8px; margin-left: 12px; opacity: 0.6; transition: all 0.15s; line-height: 1;`;
    removeBtn.addEventListener('mouseenter', () => { removeBtn.style.opacity = '1'; removeBtn.style.transform = 'scale(1.15)'; });
    removeBtn.addEventListener('mouseleave', () => { removeBtn.style.opacity = '0.6'; removeBtn.style.transform = 'scale(1)'; });
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      genreHistory.splice(idx, 1);
      localStorage.setItem('neonkatGenreHistory', JSON.stringify(genreHistory));
      renderGenreHistory();
    });

    row.addEventListener('click', (e) => {
      if (e.target === removeBtn) return;
      document.getElementById('genreInput').value = value;
      addToGenreHistory(value);
      updateSelectedGenreDisplay();
      renderGenreHistory();
      document.getElementById('genreMenu').style.display = 'none';
    });

    row.appendChild(label);
    row.appendChild(removeBtn);
    container.appendChild(row);
  });
}

function initGenreDropdown() {
  const btn = document.getElementById('genreBtn');
  const menu = document.getElementById('genreMenu');
  const useBtn = document.getElementById('useGenreBtn');
  const customInput = document.getElementById('genreCustomInput');
  const hiddenInput = document.getElementById('genreInput');
  if (!btn || !menu) return;

  const lastUsed = localStorage.getItem('lastGenre');
  hiddenInput.value = lastUsed || 'Music';
  updateSelectedGenreDisplay();

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = menu.style.display === 'block';
    menu.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) renderGenreHistory();
  });

  document.addEventListener('click', (e) => {
    if (!btn.contains(e.target) && !menu.contains(e.target)) {
      menu.style.display = 'none';
    }
  });

  if (useBtn) {
    useBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const val = customInput?.value.trim();
      if (val) {
        hiddenInput.value = val;
        addToGenreHistory(val);
        updateSelectedGenreDisplay();
        renderGenreHistory();
      }
      customInput.value = '';
      menu.style.display = 'none';
    });
  }

  if (customInput) {
    customInput.addEventListener('click', e => e.stopPropagation());
    customInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = customInput.value.trim();
        if (val) {
          hiddenInput.value = val;
          addToGenreHistory(val);
          updateSelectedGenreDisplay();
          renderGenreHistory();
        }
        customInput.value = '';
        menu.style.display = 'none';
      }
    });
  }
}

