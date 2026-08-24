// MNR Launcher front end logic.
// All real filesystem/process work happens in Python (main.py) and is
// called here through window.pywebview.api, a browser cannot touch local
// paths at all, so nothing filesystem-related happens in this file.

const screens = {
  boot: document.getElementById("boot-screen"),
  error: document.getElementById("error-screen"),
  user: document.getElementById("user-screen"),
  home: document.getElementById("home-screen"),
  placeholder: document.getElementById("placeholder-screen"),
  smanim: document.getElementById("smanim-screen"),
  archive: document.getElementById("archive-screen"),
  ffmpeg: document.getElementById("ffmpeg-screen"),
};

const topbar = document.getElementById("topbar");
const homeButton = document.getElementById("home-button");
const bootLines = document.getElementById("boot-lines");
const statusPill = document.getElementById("pcloud-status");
const userButton = document.getElementById("user-button");
const userLabel = document.getElementById("user-label");
const userSearch = document.getElementById("user-search");
const userList = document.getElementById("user-list");
const placeholderText = document.getElementById("placeholder-text");
const placeholderBack = document.getElementById("placeholder-back");
const onboardingLink = document.getElementById("onboarding-link");
const shellUpdateGate = document.getElementById("shell-update-gate");
const shellUpdateSub = document.getElementById("shell-update-sub");
const shellUpdateButton = document.getElementById("shell-update-button");
const shellUpdateStatus = document.getElementById("shell-update-status");

function showShellUpdateGate(info) {
  if (info && info.version) {
    shellUpdateSub.textContent = `Version ${info.version} is ready. Update now to continue.`;
  }
  shellUpdateGate.classList.remove("hidden");
}

shellUpdateButton.addEventListener("click", async () => {
  shellUpdateButton.disabled = true;
  shellUpdateButton.textContent = "Downloading...";
  shellUpdateStatus.textContent = "This may take a moment depending on your connection.";

  const result = await window.pywebview.api.apply_shell_update();
  if (!result.ok) {
    shellUpdateButton.disabled = false;
    shellUpdateButton.textContent = "Update Now";
    shellUpdateStatus.textContent = `${result.detail}. Try again.`;
  }
  // On success the window closes itself shortly, nothing else to do here.
});
const versionBadge = document.getElementById("version-badge");
const toastEl = document.getElementById("toast");
const blenderTile = document.getElementById("blender-tile");
const blenderTileBadge = document.getElementById("blender-tile-badge");
const blenderNotice = document.getElementById("blender-notice");
const blenderNoticeClose = document.getElementById("blender-notice-close");
let toastTimeout = null;
let blenderPollInterval = null;

function showBlenderNotice() {
  blenderNotice.classList.remove("hidden");
  clearInterval(blenderPollInterval);
  blenderPollInterval = setInterval(async () => {
    try {
      const result = await window.pywebview.api.is_blender_running();
      if (result.ok && result.running) {
        hideBlenderNotice();
      }
    } catch (e) {
      // Keep waiting quietly, do not spam errors while polling.
    }
  }, 4000);
}

function hideBlenderNotice() {
  blenderNotice.classList.add("hidden");
  clearInterval(blenderPollInterval);
  blenderPollInterval = null;
}

blenderNoticeClose.addEventListener("click", hideBlenderNotice);

function showToast(text, duration) {
  toastEl.textContent = text;
  toastEl.classList.remove("hidden");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toastEl.classList.add("hidden"), duration || 3000);
}

async function refreshBlenderTile() {
  try {
    const info = await window.pywebview.api.get_blender_info();
    if (!info.supported) {
      blenderTile.classList.add("hidden");
    } else if (info.ok) {
      blenderTile.classList.remove("hidden", "tile-disabled");
      blenderTileBadge.textContent = `v${info.version}`;
    } else {
      blenderTile.classList.remove("hidden");
      blenderTileBadge.textContent = "Not found";
      blenderTile.classList.add("tile-disabled");
    }
  } catch (e) {
    blenderTile.classList.remove("hidden");
    blenderTileBadge.textContent = "Not found";
    blenderTile.classList.add("tile-disabled");
  }
}

const rawtherapeeTile = document.getElementById("rawtherapee-tile");
const rawtherapeeTileBadge = document.getElementById("rawtherapee-tile-badge");
const rawtherapeeNotice = document.getElementById("rawtherapee-notice");
const rawtherapeeNoticeClose = document.getElementById("rawtherapee-notice-close");
let rawtherapeePollInterval = null;

function showRawtherapeeNotice() {
  rawtherapeeNotice.classList.remove("hidden");
  clearInterval(rawtherapeePollInterval);
  rawtherapeePollInterval = setInterval(async () => {
    try {
      const result = await window.pywebview.api.is_rawtherapee_running();
      if (result.ok && result.running) {
        hideRawtherapeeNotice();
      }
    } catch (e) {
      // Keep waiting quietly, do not spam errors while polling.
    }
  }, 4000);
}

function hideRawtherapeeNotice() {
  rawtherapeeNotice.classList.add("hidden");
  clearInterval(rawtherapeePollInterval);
  rawtherapeePollInterval = null;
}

rawtherapeeNoticeClose.addEventListener("click", hideRawtherapeeNotice);

async function refreshRawtherapeeTile() {
  try {
    const info = await window.pywebview.api.get_rawtherapee_info();
    if (!info.supported) {
      rawtherapeeTile.classList.add("hidden");
    } else if (info.ok) {
      rawtherapeeTile.classList.remove("hidden", "tile-disabled");
      rawtherapeeTileBadge.textContent = `v${info.version}`;
    } else {
      rawtherapeeTile.classList.remove("hidden");
      rawtherapeeTileBadge.textContent = "Not found";
      rawtherapeeTile.classList.add("tile-disabled");
    }
  } catch (e) {
    rawtherapeeTile.classList.remove("hidden");
    rawtherapeeTileBadge.textContent = "Not found";
    rawtherapeeTile.classList.add("tile-disabled");
  }
}

const ddProject = document.getElementById("dd-project");
const ddEpisode = document.getElementById("dd-episode");
const ddSequence = document.getElementById("dd-sequence");
const ddShot = document.getElementById("dd-shot");
const showAllTasksBox = document.getElementById("show-all-tasks");
const smanimNote = document.getElementById("smanim-note");
const smanimBack = document.getElementById("smanim-back");
const treeRoot = document.getElementById("tree-root");
const refreshButton = document.getElementById("refresh-button");
const debugToggle = document.getElementById("debug-toggle");
const debugPanel = document.getElementById("debug-panel");
const debugLogEl = document.getElementById("debug-log");
const debugCopyButton = document.getElementById("debug-copy-button");
let debugPollInterval = null;
let lastDebugLogText = "";
const exportEnabled = document.getElementById("export-enabled");
const exportContent = document.getElementById("export-content");
const exportType = document.getElementById("export-type");
const exportPublishContent = document.getElementById("export-publish-content");
const exportPreviewContent = document.getElementById("export-preview-content");
const exportTempContent = document.getElementById("export-temp-content");
const workEnabled = document.getElementById("work-enabled");
const workContent = document.getElementById("work-content");
const addLayerButton = document.getElementById("add-layer-button");
const layerStackEl = document.getElementById("layer-stack");
const uploadButton = document.getElementById("upload-button");
const uploadHint = document.getElementById("upload-hint");
const uploadStatus = document.getElementById("upload-status");
const sharedHandleFront = document.getElementById("shared-handle-front");
const sharedHandleBack = document.getElementById("shared-handle-back");
const sharedExpectedFrames = document.getElementById("shared-expected-frames");
const smanimLeft = document.getElementById("smanim-left");
const smanimDivider = document.getElementById("smanim-divider");
const smanimRight = document.getElementById("smanim-right");

// EDIT THIS LIST to add or remove the standard layer name choices
// shown in each layer box's dropdown.
const LAYER_NAME_OPTIONS = [
  "antroz", "chirox", "mutran", "vamprah", "badGuy", "goodGuy", "gavla",
  "kaiora", "kirop", "photok", "pirit", "radiak", "solek", "tanma",
  "vican", "ignika", "gali", "kopaka", "lewa", "onua", "pohatu", "tahu",
];

let layerIdCounter = 0;
const layers = []; // {id, name, number, variant, version, collapsed, mp4, raw, jpeg, productionData}

const ONBOARDING_URL = "https://docs.projectmatanuirising.com/onboarding/3-pcloud-drive-app";

let allUsers = [];
let currentUser = null;
let showAllTasksChecked = false;

// Global error capture: if something breaks in the frontend, report it
// into the same debug log as the backend instead of failing silently
// with nothing visible anywhere.
function reportFrontendError(msg) {
  console.error(msg);
  if (window.pywebview && window.pywebview.api && window.pywebview.api.log_frontend_error) {
    window.pywebview.api.log_frontend_error(String(msg)).catch(() => {});
  }
}
window.addEventListener("error", event => {
  reportFrontendError(`${event.message} (${event.filename}:${event.lineno})`);
});
window.addEventListener("unhandledrejection", event => {
  reportFrontendError(`Unhandled promise rejection: ${event.reason}`);
});

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.add("hidden"));
  screens[name].classList.remove("hidden");
}

function addBootLine(text, kind) {
  const line = document.createElement("div");
  line.textContent = text;
  if (kind === "ok") line.className = "boot-line-ok";
  else if (kind === "fail") line.className = "boot-line-fail";
  else line.className = "boot-line-info";
  bootLines.appendChild(line);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function setStatusPill(state, text) {
  statusPill.className = "status-pill status-" + state;
  statusPill.querySelector(".status-text").textContent = text;
}

async function pollTransferActivity() {
  try {
    const result = await window.pywebview.api.check_transfer_activity(1.0);
    if (result.state === "busy") {
      setStatusPill("busy", "Transfers in progress, do not disconnect pCloud");
    } else if (result.state === "idle") {
      setStatusPill("ok", "pCloud - Everything is Up To Date");
    } else {
      setStatusPill("ok", "pCloud connected");
    }
  } catch (e) {
    // Do not break the UI if the heuristic fails, just leave the last state.
    console.error("transfer activity check failed", e);
  }
}

async function runBoot() {
  const pendingUpdate = await window.pywebview.api.get_pending_shell_update();
  if (pendingUpdate.available) {
    showShellUpdateGate(pendingUpdate.info);
    return; // nothing else runs until this is resolved
  }

  onboardingLink.href = ONBOARDING_URL;

  window.pywebview.api.get_app_info().then(info => {
    const exeLabel = info.dev_exe ? "Dev Build" : "Main Build";
    const appLabel = info.dev_app_code ? "dev" : "main";
    versionBadge.textContent = `${exeLabel} v${info.shell_version} \u00b7 app: ${appLabel}`;
  });

  addBootLine("Checking pCloud Drive...", "info");
  await wait(250);

  const drive = await window.pywebview.api.check_drive();

  if (!drive.ok) {
    addBootLine("[FAIL] pCloud Drive: " + drive.detail, "fail");
    await wait(400);
    showScreen("error");
    return;
  }
  addBootLine("[OK] pCloud Drive: " + drive.root, "ok");
  await wait(200);

  addBootLine("Loading user list...", "info");
  const usersResult = await window.pywebview.api.list_users();
  if (usersResult.ok) {
    addBootLine(`[OK] Users found: ${usersResult.users.length}`, "ok");
    allUsers = usersResult.users;
  } else {
    addBootLine("[FAIL] Could not read 00-temp: " + usersResult.detail, "fail");
    allUsers = [];
  }
  await wait(200);

  addBootLine("Loading tools...", "info");
  await wait(250);
  addBootLine("[OK] MNR Launcher ready", "ok");
  await wait(350);

  topbar.classList.remove("hidden");
  setStatusPill("ok", "pCloud - Everything is Up To Date");
  pollTransferActivity();
  setInterval(pollTransferActivity, 20000);
  refreshBlenderTile();
  refreshRawtherapeeTile();
  refreshFfmpegTile();
  refreshSoftwareSection();
  refreshJobs();

  const savedUser = await window.pywebview.api.get_saved_user();
  if (savedUser && allUsers.includes(savedUser)) {
    selectUser(savedUser, /* skipSave */ true);
    showScreen("home");
  } else {
    renderUserList(allUsers);
    showScreen("user");
  }
}

function renderUserList(names) {
  userList.innerHTML = "";
  names.forEach(name => {
    const item = document.createElement("div");
    item.className = "user-item";
    item.textContent = name;
    item.addEventListener("click", () => {
      selectUser(name);
      showScreen("home");
    });
    userList.appendChild(item);
  });
}

async function selectUser(name, skipSave) {
  currentUser = name;
  userLabel.textContent = name;
  if (!skipSave) {
    await window.pywebview.api.set_current_user(name);
  }
}

userSearch.addEventListener("input", () => {
  const q = userSearch.value.trim().toLowerCase();
  const filtered = allUsers.filter(n => n.toLowerCase().includes(q));
  renderUserList(filtered);
});

userButton.addEventListener("click", () => {
  renderUserList(allUsers);
  userSearch.value = "";
  showScreen("user");
});

homeButton.addEventListener("click", () => {
  showScreen("home");
});

document.querySelectorAll(".tile").forEach(tile => {
  tile.addEventListener("click", async () => {
    if (tile.classList.contains("tile-disabled")) return;
    const tool = tile.dataset.tool;
    if (tool === "smanim") {
      showScreen("smanim");
      initSmanimScreen();
    } else if (tool === "external" && tile.dataset.url) {
      window.pywebview.api.open_url(tile.dataset.url);
    } else if (tool === "blender") {
      showBlenderNotice();
      const result = await window.pywebview.api.launch_blender();
      if (!result.ok) {
        hideBlenderNotice();
        showToast(`Could not launch Blender: ${result.detail}`, 5000);
      }
    } else if (tool === "rawtherapee") {
      showRawtherapeeNotice();
      const result = await window.pywebview.api.launch_rawtherapee();
      if (!result.ok) {
        hideRawtherapeeNotice();
        showToast(`Could not launch RawTherapee: ${result.detail}`, 5000);
      }
    } else if (tool === "archive") {
      showScreen("archive");
      initArchiveScreen();
    } else if (tool === "ffmpeg") {
      showScreen("ffmpeg");
      initFfmpegScreen();
    }
  });
});

placeholderBack.addEventListener("click", () => {
  showScreen("home");
});

// ---------------------------------------------------------------
// Stop Motion Upload tool, Stage 2a: dropdown cascade + folder tree.
// Project/Episode/Sequence/Shot are all position-based, not name-based:
// each dropdown just lists whatever sits one level under the previous
// pick, which is what lets DEV/TESTS/T01 work the same way as
// 102/SQ04/SH08 without any special-casing.
// ---------------------------------------------------------------

function fillSelect(select, items, placeholder) {
  select.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = placeholder;
  select.appendChild(opt0);
  items.forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
}

async function initSmanimScreen() {
  ddProject.disabled = false;
  ddEpisode.disabled = true;
  ddSequence.disabled = true;
  ddShot.disabled = true;
  fillSelect(ddEpisode, [], "Pick a project first");
  fillSelect(ddSequence, [], "Pick an episode first");
  fillSelect(ddShot, [], "Pick a sequence first");
  showAllTasksBox.checked = false;
  showAllTasksChecked = false;
  smanimNote.textContent = "Pick Project, Episode, Sequence, and Shot to continue.";

  exportEnabled.checked = true;
  exportContent.classList.remove("hidden");
  exportType.value = "publish";
  exportPublishContent.classList.remove("hidden");
  exportPreviewContent.classList.add("hidden");
  exportTempContent.classList.add("hidden");
  workEnabled.checked = false;
  workContent.classList.add("hidden");
  layers.length = 0;
  renderLayerStack();
  uploadStatus.innerHTML = "";
  sharedFrameSettings.handleFront = 0;
  sharedFrameSettings.handleBack = 0;
  sharedFrameSettings.expectedFrames = null;
  sharedHandleFront.value = "0";
  sharedHandleBack.value = "0";
  sharedExpectedFrames.value = "";

  const result = await window.pywebview.api.list_projects();
  if (result.ok) {
    fillSelect(ddProject, result.items, "Select a project...");
  } else {
    fillSelect(ddProject, [], "No projects found");
  }
  await refreshTree();
}

ddProject.addEventListener("change", async () => {
  const project = ddProject.value;
  fillSelect(ddSequence, [], "Pick an episode first");
  fillSelect(ddShot, [], "Pick a sequence first");
  ddSequence.disabled = true;
  ddShot.disabled = true;

  if (!project) {
    ddEpisode.disabled = true;
    fillSelect(ddEpisode, [], "Pick a project first");
    await refreshTree();
    return;
  }

  const result = await window.pywebview.api.list_episodes(project);
  if (result.ok) {
    fillSelect(ddEpisode, result.items, "Select an episode...");
    ddEpisode.disabled = false;
  } else {
    fillSelect(ddEpisode, [], "No episodes found");
    ddEpisode.disabled = true;
  }
  await refreshTree();
});

ddEpisode.addEventListener("change", async () => {
  const project = ddProject.value;
  const episode = ddEpisode.value;
  fillSelect(ddShot, [], "Pick a sequence first");
  ddShot.disabled = true;

  if (!episode) {
    ddSequence.disabled = true;
    fillSelect(ddSequence, [], "Pick an episode first");
    await refreshTree();
    return;
  }

  const result = await window.pywebview.api.list_children([project, "03-shot", episode]);
  if (result.ok) {
    fillSelect(ddSequence, result.items, "Select a sequence...");
    ddSequence.disabled = false;
  } else {
    fillSelect(ddSequence, [], "No sequences found");
    ddSequence.disabled = true;
  }
  await refreshTree();
});

ddSequence.addEventListener("change", async () => {
  const project = ddProject.value;
  const episode = ddEpisode.value;
  const sequence = ddSequence.value;

  if (!sequence) {
    ddShot.disabled = true;
    fillSelect(ddShot, [], "Pick a sequence first");
    await refreshTree();
    return;
  }

  const result = await window.pywebview.api.list_children([project, "03-shot", episode, sequence]);
  if (result.ok) {
    fillSelect(ddShot, result.items, "Select a shot...");
    ddShot.disabled = false;
  } else {
    fillSelect(ddShot, [], "No shots found");
    ddShot.disabled = true;
  }
  await refreshTree();
});

ddShot.addEventListener("change", async () => {
  smanimNote.textContent = ddShot.value
    ? "Showing the smAnim folder for this shot below."
    : "Pick Project, Episode, Sequence, and Shot to continue.";
  await refreshTree();
  refreshUploadButtonState();
});

showAllTasksBox.addEventListener("change", async () => {
  showAllTasksChecked = showAllTasksBox.checked;
  await refreshTree();
});

smanimBack.addEventListener("click", () => {
  showScreen("home");
});

function currentAutoPath() {
  const project = ddProject.value;
  const episode = ddEpisode.value;
  const sequence = ddSequence.value;
  const shot = ddShot.value;
  const parts = [];
  if (project) parts.push(project);
  if (project && episode) { parts.push("03-shot"); parts.push(episode); }
  if (project && episode && sequence) parts.push(sequence);
  if (project && episode && sequence && shot) parts.push(shot);
  return parts;
}

let treeRefreshGeneration = 0;

async function refreshTree() {
  const myGeneration = ++treeRefreshGeneration;
  treeRoot.innerHTML = "";
  const autoPath = currentAutoPath();
  const pendingMap = computePendingMap();
  await buildLevel(treeRoot, [], autoPath, pendingMap, myGeneration);
  smanimPathBar.setDisplay(autoPath);
}

// Figures out exactly where every currently-selected (but not yet
// uploaded) file will land, keyed by the joined folder path, so the
// tree can show them in place, italic green, before Upload is clicked.
function computePendingMap() {
  const map = {};
  const shotPath = currentAutoPath();
  if (shotPath.length !== 5) return map;

  const mediaPath = shotPath.concat(["smAnim", "export", "publish", "media"]);
  const mediaKey = mediaPath.join("/");

  function addPending(key, name, isDir) {
    if (!map[key]) map[key] = [];
    if (!map[key].some(e => e.name === name)) map[key].push({ name, isDir });
  }

  layers.filter(l => l.name).forEach(layer => {
    const baseName = buildBaseName(layer);

    if (layer.mp4.enabled && layer.mp4.path) {
      const ext = layer.mp4.path.match(/\.[^.]+$/)?.[0] || ".mp4";
      addPending(mediaKey, `${baseName}${ext}`, false);
    } else if (layer.mp4.enabled && layer.mp4.makeFromFrames) {
      // No file is being uploaded for this one, but a preview will be
      // rendered into the same spot, so show it as pending too.
      addPending(mediaKey, `${baseName}.mp4`, false);
    }

    ["raw", "jpeg"].forEach(key => {
      const section = layer[key];
      if (section.enabled && section.paths.length > 0) {
        const ext = getExtension(section.paths[0]) || key;
        addPending(mediaKey, baseName, true);
        const baseFolderKey = mediaPath.concat([baseName]).join("/");
        addPending(baseFolderKey, ext, true);
        const extFolderKey = mediaPath.concat([baseName, ext]).join("/");
        const start = 1001 - sharedFrameSettings.handleFront;
        section.paths.forEach((p, i) => {
          const frameExt = p.match(/\.[^.]+$/)?.[0] || "";
          addPending(extFolderKey, `${baseName}.${String(start + i).padStart(4, "0")}${frameExt}`, false);
        });
      }
    });

    if (layer.productionData.enabled && layer.productionData.paths.length > 0) {
      const prodFolderName = `${baseName}-productionData`;
      addPending(mediaKey, prodFolderName, true);
      const prodKey = mediaPath.concat([prodFolderName]).join("/");
      layer.productionData.paths.forEach(p => {
        addPending(prodKey, p.split(/[\\/]/).pop(), false);
      });
    }
  });

  return map;
}

function pathHasPendingDescendant(pathKey, pendingMap) {
  return Object.keys(pendingMap).some(k => k === pathKey || k.startsWith(pathKey + "/"));
}

const TREE_FOLDER_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6z"/></svg>';
const TREE_FILE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h9l5 5v15H6V2z"/><path d="M14 2v6h6"/></svg>';

function makeRow(name, isDir, depth) {
  const row = document.createElement("div");
  row.className = "tree-row";
  row.style.marginLeft = (depth * 2) + "px";

  const toggle = document.createElement("span");
  toggle.className = "tree-toggle";
  toggle.textContent = isDir ? "▶" : "";
  row.appendChild(toggle);

  const icon = document.createElement("span");
  icon.className = "tree-icon";
  icon.innerHTML = isDir ? TREE_FOLDER_SVG : TREE_FILE_SVG;
  row.appendChild(icon);

  const label = document.createElement("span");
  label.className = "tree-name";
  label.textContent = name;
  row.appendChild(label);

  return { row, toggle, label };
}

// pathParts: segments under 01-projects for the folder we are listing.
// autoPath: the full project/episode/sequence/shot path from the
// dropdowns (once all 4 are picked, this is exactly 5 segments long,
// counting the literal "03-shot" folder). When pathParts reaches that
// same length, we are listing the shot folder's own children, which is
// where the smAnim-only task filter applies. pendingMap holds files
// that are selected but not yet uploaded, so they still show up (in
// italic green) even though they don't exist on disk yet.
async function buildLevel(container, pathParts, autoPath, pendingMap, generation) {
  const applyTaskFilter = autoPath.length === 5 && pathParts.length === 5;
  const pathKey = pathParts.join("/");
  const pendingHere = pendingMap[pathKey] || [];

  const result = await window.pywebview.api.list_dir_entries(pathParts, false);
  if (generation !== treeRefreshGeneration) return; // a newer refresh already started, abandon this one

  let items;
  if (result.ok) {
    items = result.items;
  } else if (pendingHere.length > 0) {
    items = []; // folder doesn't exist yet, but pending content will create it
  } else {
    const msg = document.createElement("div");
    msg.className = "tree-name tree-missing";
    msg.textContent = pathParts.length === 0 ? "(could not read 01-projects)" : "(does not exist yet)";
    container.appendChild(msg);
    return;
  }

  if (applyTaskFilter) {
    const smanimItems = items.filter(i => i.name === "smAnim");
    const otherItems = items
      .filter(i => i.name !== "smAnim")
      .map(i => Object.assign({}, i, { _greyed: true }));
    items = showAllTasksChecked ? smanimItems.concat(otherItems) : smanimItems;

    if (smanimItems.length === 0) {
      const msg = document.createElement("div");
      msg.className = "tree-name tree-missing";
      msg.textContent = "smAnim folder does not exist here yet";
      container.appendChild(msg);
    }
  }

  const existingNames = new Set(items.map(i => i.name));
  pendingHere.forEach(p => {
    if (!existingNames.has(p.name)) {
      items.push({ name: p.name, is_dir: p.isDir, _pending: true });
    }
  });

  for (const item of items) {
    const nextParts = pathParts.concat(item.name);
    const nextKey = nextParts.join("/");
    const depth = pathParts.length;
    const { row, toggle, label } = makeRow(item.name, item.is_dir, depth);
    if (item._greyed) label.classList.add("tree-greyed");
    if (item._pending) label.classList.add("tree-pending");
    container.appendChild(row);

    let childrenContainer = null;
    let expanded = false;

    async function doExpand() {
      if (!childrenContainer) {
        childrenContainer = document.createElement("div");
        childrenContainer.className = "tree-children";
        row.insertAdjacentElement("afterend", childrenContainer);
      }
      expanded = !expanded;
      toggle.textContent = expanded ? "▼" : "▶";
      childrenContainer.style.display = expanded ? "block" : "none";
      if (expanded && childrenContainer.childElementCount === 0) {
        await buildLevel(childrenContainer, nextParts, autoPath, pendingMap, generation);
      }
    }

    if (item.is_dir) {
      row.addEventListener("click", () => doExpand());
    }
    if (!item._pending) {
      row.addEventListener("dblclick", async () => {
        const res = await window.pywebview.api.open_path(nextParts);
        if (!res.ok) console.error("open_path failed", res.detail);
      });
    }

    const shouldAutoExpand =
      (item.is_dir && pathParts.length < autoPath.length && item.name === autoPath[pathParts.length]) ||
      (applyTaskFilter && item.name === "smAnim") ||
      (item.is_dir && pathHasPendingDescendant(nextKey, pendingMap));

    if (shouldAutoExpand) {
      await doExpand();
    }
  }
}

window.addEventListener("pywebviewready", runBoot);

refreshButton.addEventListener("click", async () => {
  refreshButton.disabled = true;
  // request_refresh closes this window; the installed shell notices
  // and re-downloads the latest code from GitHub before reopening.
  await window.pywebview.api.request_refresh();
});

async function refreshDebugLog() {
  try {
    const result = await window.pywebview.api.get_debug_log();
    const newText = result.lines.join("\n");
    if (newText === lastDebugLogText) return; // nothing changed, leave the DOM (and any selection) alone
    lastDebugLogText = newText;
    const wasScrolledToBottom = debugLogEl.scrollHeight - debugLogEl.scrollTop <= debugLogEl.clientHeight + 20;
    debugLogEl.textContent = newText;
    if (wasScrolledToBottom) debugLogEl.scrollTop = debugLogEl.scrollHeight;
  } catch (e) {
    debugLogEl.textContent = "Could not reach the debug log: " + e;
  }
}

debugCopyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(lastDebugLogText);
    debugCopyButton.textContent = "Copied!";
  } catch (e) {
    debugCopyButton.textContent = "Copy failed";
  }
  setTimeout(() => { debugCopyButton.textContent = "Copy"; }, 1500);
});

debugToggle.addEventListener("change", () => {
  debugPanel.classList.toggle("hidden", !debugToggle.checked);
  if (debugToggle.checked) {
    refreshDebugLog();
    debugPollInterval = setInterval(refreshDebugLog, 1500);
    refreshDevToggles();
  } else if (debugPollInterval) {
    clearInterval(debugPollInterval);
    debugPollInterval = null;
  }
  // The demo tiles only exist while Debug is open, so re-render the
  // Connect Software section either way.
  refreshSoftwareSection();
});

// ---------------------------------------------------------------
// Development environment toggles: two independent tracks, one for
// the compiled shell's self-updater, one for the app code fetched on
// every launch/refresh. Both default off, and flipping either one
// relaunches the app on that track immediately.
// ---------------------------------------------------------------

const devExeToggle = document.getElementById("dev-exe-toggle");
const devAppToggle = document.getElementById("dev-app-toggle");

async function refreshDevToggles() {
  try {
    const settings = await window.pywebview.api.get_dev_settings();
    devExeToggle.checked = settings.dev_exe;
    devAppToggle.checked = settings.dev_app_code;
  } catch (e) {
    // Leave whatever was last shown, not worth erroring over.
  }
}

async function applyDevSettings() {
  await window.pywebview.api.set_dev_settings(devAppToggle.checked, devExeToggle.checked);
}

devExeToggle.addEventListener("change", applyDevSettings);
devAppToggle.addEventListener("change", applyDevSettings);

// ---------------------------------------------------------------
// Export / Work toggle sections
// ---------------------------------------------------------------

exportEnabled.addEventListener("change", () => {
  exportContent.classList.toggle("hidden", !exportEnabled.checked);
});

workEnabled.addEventListener("change", () => {
  workContent.classList.toggle("hidden", !workEnabled.checked);
});

exportType.addEventListener("change", () => {
  exportPublishContent.classList.toggle("hidden", exportType.value !== "publish");
  exportPreviewContent.classList.toggle("hidden", exportType.value !== "preview");
  exportTempContent.classList.toggle("hidden", exportType.value !== "temp");
});

// ---------------------------------------------------------------
// Layer stack: add/remove layers, each with a character name,
// 2-digit number, variant, and an auto-suggested version.
// ---------------------------------------------------------------

// ---------------------------------------------------------------
// Resizable divider between the left panel and the folder tree.
// ---------------------------------------------------------------

(function setupSmanimDivider() {
  let dragging = false;

  smanimDivider.addEventListener("mousedown", () => {
    dragging = true;
    smanimDivider.classList.add("dragging");
    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const layoutRect = smanimLeft.parentElement.getBoundingClientRect();
    let leftPercent = ((e.clientX - layoutRect.left) / layoutRect.width) * 100;
    leftPercent = Math.max(25, Math.min(80, leftPercent));
    smanimLeft.style.flex = `0 0 ${leftPercent}%`;
    smanimRight.style.flex = `1 1 ${100 - leftPercent}%`;
  });

  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    smanimDivider.classList.remove("dragging");
    document.body.style.userSelect = "";
  });
})();

// ---------------------------------------------------------------
// Shared frame settings: every layer in this shot uses the same
// handle and expected frame count, so these live once, above the
// layer stack, instead of being repeated per layer.
// ---------------------------------------------------------------

const sharedFrameSettings = { handleFront: 0, handleBack: 0, expectedFrames: null };

sharedHandleFront.addEventListener("change", () => {
  sharedFrameSettings.handleFront = parseInt(sharedHandleFront.value, 10) || 0;
  renderLayerStack();
});
sharedHandleBack.addEventListener("change", () => {
  sharedFrameSettings.handleBack = parseInt(sharedHandleBack.value, 10) || 0;
  renderLayerStack();
});
sharedExpectedFrames.addEventListener("change", () => {
  sharedFrameSettings.expectedFrames = parseInt(sharedExpectedFrames.value, 10) || null;
  renderLayerStack();
});

// ---------------------------------------------------------------
// Layer stack: add/remove layers, each with a character name,
// layer number, variant, and an auto-suggested version.
// ---------------------------------------------------------------

addLayerButton.addEventListener("click", () => {
  const id = "layer-" + (++layerIdCounter);
  layers.push({
    id, name: "", number: "01", variant: "main", version: "", collapsed: false,
    mp4: {
      enabled: true,
      path: null,
      makeFromFrames: false,
      framerate: 12,
      scale: 50,
      bitrate: 8000,
    },
    raw: { enabled: true, paths: [], override: false, typeOverride: false },
    jpeg: { enabled: true, paths: [], override: false, typeOverride: false },
    productionData: { enabled: false, paths: [] },
  });
  renderLayerStack();
});

function removeLayer(id) {
  const idx = layers.findIndex(l => l.id === id);
  if (idx !== -1) layers.splice(idx, 1);
  renderLayerStack();
}

// ---------------------------------------------------------------
// Custom character-name dropdown. A native <select> can't keep an
// option pinned in view while the rest of the list scrolls, so this
// is a small hand-built combobox instead: the character list scrolls,
// "+ Add custom name" stays fixed at the bottom, always visible,
// like a frozen row that never scrolls away.
// ---------------------------------------------------------------

let openComboBox = null;

document.addEventListener("click", (e) => {
  if (openComboBox && !openComboBox.contains(e.target)) {
    closeAllComboBoxes();
  }
});

function closeAllComboBoxes() {
  document.querySelectorAll(".combo-box-popup").forEach(p => p.classList.add("hidden"));
  openComboBox = null;
}

function buildLayerNameCombo(layer, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "combo-box";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "field-select combo-box-trigger";
  trigger.textContent = layer.name || "Select a character...";

  const popup = document.createElement("div");
  popup.className = "combo-box-popup hidden";

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.className = "combo-box-search";
  searchInput.placeholder = "Type to find...";

  const optionsWrap = document.createElement("div");
  optionsWrap.className = "combo-box-options";

  function renderOptions() {
    optionsWrap.innerHTML = "";
    const query = searchInput.value.trim().toLowerCase();
    const allNames = (layer.name && !LAYER_NAME_OPTIONS.includes(layer.name))
      ? [layer.name].concat(LAYER_NAME_OPTIONS)
      : LAYER_NAME_OPTIONS;
    const filtered = query ? allNames.filter(n => n.toLowerCase().includes(query)) : allNames;

    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "combo-box-empty";
      empty.textContent = "No matches.";
      optionsWrap.appendChild(empty);
    }

    filtered.forEach(name => {
      const opt = document.createElement("div");
      opt.className = "combo-box-option";
      opt.textContent = name;
      opt.addEventListener("click", () => {
        popup.classList.add("hidden");
        openComboBox = null;
        onChange(name);
      });
      optionsWrap.appendChild(opt);
    });
  }

  searchInput.addEventListener("input", renderOptions);
  searchInput.addEventListener("click", (e) => e.stopPropagation());

  const pinned = document.createElement("div");
  pinned.className = "combo-box-pinned";
  pinned.textContent = "+ Add custom name";
  pinned.addEventListener("click", () => {
    popup.classList.add("hidden");
    openComboBox = null;
    const customName = prompt("Custom layer name:");
    if (!customName) return;
    onChange(customName.trim());
  });

  popup.appendChild(searchInput);
  popup.appendChild(optionsWrap);
  popup.appendChild(pinned);

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = !popup.classList.contains("hidden");
    closeAllComboBoxes();
    if (!isOpen) {
      searchInput.value = "";
      renderOptions();
      popup.classList.remove("hidden");
      openComboBox = wrap;
      searchInput.focus();
    }
  });

  wrap.appendChild(trigger);
  wrap.appendChild(popup);
  return wrap;
}

// Looks at what already exists in export/publish/media for this exact
// layer name + number + variant, and suggests the next free version
// number instead of blindly defaulting to v001 every time.
async function refreshLayerVersionOptions(layer, versionSelect) {
  const shotPath = currentAutoPath();
  if (shotPath.length !== 5 || !layer.name) return;

  const mediaPath = shotPath.concat(["smAnim", "export", "publish", "media"]);
  const result = await window.pywebview.api.list_dir_entries(mediaPath, false);

  const existingVersions = [];
  if (result.ok) {
    const pattern = new RegExp(`${layer.name}${layer.number}-${layer.variant}_v(\\d{3})`);
    result.items.forEach(item => {
      const match = item.name.match(pattern);
      if (match) existingVersions.push(parseInt(match[1], 10));
    });
  }

  const nextVersion = existingVersions.length ? Math.max(...existingVersions) + 1 : 1;
  const suggested = "v" + String(nextVersion).padStart(3, "0");

  versionSelect.innerHTML = "";
  const opt = document.createElement("option");
  opt.value = suggested;
  opt.textContent = existingVersions.length ? `${suggested} (next available)` : `${suggested} (default)`;
  versionSelect.appendChild(opt);
  versionSelect.value = suggested;
  layer.version = suggested;
}

// refreshLayerVersionOptions is async (it checks pCloud for existing
// versions), so anything built using layer.version before it resolves
// (like the mp4/frame rename previews) briefly shows a blank version.
// This wrapper re-renders the whole layer stack once the version is
// actually known, so previews catch up instead of staying stale. It
// only re-renders if the version actually changed, so this settles
// after one extra pass instead of looping.
async function updateLayerVersion(layer, versionSelect) {
  const before = layer.version;
  await refreshLayerVersionOptions(layer, versionSelect);
  if (layer.version !== before) {
    renderLayerStack();
  }
}

function renderLayerStack() {
  layerStackEl.innerHTML = "";

  layers.forEach(layer => {
    const box = document.createElement("div");
    box.className = "layer-box";

    // ---- header: character name + collapse + remove ----
    const header = document.createElement("div");
    header.className = "layer-box-header";

    const combo = buildLayerNameCombo(layer, (name) => {
      layer.name = name;
      renderLayerStack();
    });
    header.appendChild(combo);

    const collapseBtn = document.createElement("button");
    collapseBtn.type = "button";
    collapseBtn.className = "layer-collapse-toggle";
    collapseBtn.textContent = layer.collapsed ? "\u25b6" : "\u25bc";
    collapseBtn.title = layer.collapsed ? "Expand" : "Collapse";
    collapseBtn.addEventListener("click", () => {
      layer.collapsed = !layer.collapsed;
      renderLayerStack();
    });
    header.appendChild(collapseBtn);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "icon-only-button";
    removeBtn.textContent = "\u00d7";
    removeBtn.title = "Remove layer";
    removeBtn.addEventListener("click", () => removeLayer(layer.id));
    header.appendChild(removeBtn);

    box.appendChild(header);

    // ---- body: layer number, variant, version, upload sections ----
    const body = document.createElement("div");
    body.className = "layer-box-body" + (layer.collapsed ? " collapsed" : "");

    const row = document.createElement("div");
    row.className = "layer-row";

    const numberGroup = document.createElement("div");
    numberGroup.className = "field-group small";
    const numberLabel = document.createElement("label");
    numberLabel.className = "field-label";
    numberLabel.innerHTML = 'Layer Number <span class="info-icon" tabindex="0" data-tooltip="If more than one layer uses the same character in this shot, increase this number by one for each additional layer.">?</span>';
    const numberInput = document.createElement("input");
    numberInput.type = "text";
    numberInput.className = "field-select";
    numberInput.maxLength = 2;
    numberInput.value = layer.number;
    numberInput.disabled = !layer.name;
    numberGroup.appendChild(numberLabel);
    numberGroup.appendChild(numberInput);

    const variantGroup = document.createElement("div");
    variantGroup.className = "field-group small";
    const variantLabel = document.createElement("label");
    variantLabel.className = "field-label";
    variantLabel.innerHTML = 'Variant <span class="info-icon" tabindex="0" data-tooltip="The variant of this specific clip or take, not of the character. Keep it as main unless you are told otherwise.">?</span>';
    const variantInput = document.createElement("input");
    variantInput.type = "text";
    variantInput.className = "field-select";
    variantInput.value = layer.variant;
    variantInput.disabled = !layer.name;
    variantGroup.appendChild(variantLabel);
    variantGroup.appendChild(variantInput);

    row.appendChild(numberGroup);
    row.appendChild(variantGroup);
    body.appendChild(row);

    const versionGroup = document.createElement("div");
    versionGroup.className = "field-group";
    const versionLabel = document.createElement("label");
    versionLabel.className = "field-label";
    versionLabel.textContent = "Version";
    const versionSelect = document.createElement("select");
    versionSelect.className = "field-select";
    versionSelect.disabled = !layer.name;
    versionSelect.addEventListener("change", () => {
      layer.version = versionSelect.value;
    });
    versionGroup.appendChild(versionLabel);
    versionGroup.appendChild(versionSelect);
    body.appendChild(versionGroup);

    box.appendChild(body);

    // ---- upload sections: mp4, raw sequence, jpeg sequence, productionData ----
    body.appendChild(buildSingleFileSection(layer, "mp4", "MP4 / MOV Preview"));
    body.appendChild(buildSequenceSection(layer, "raw", "Raw Image Sequence", "raw"));
    body.appendChild(buildSequenceSection(layer, "jpeg", "JPEG Image Sequence", "jpeg"));
    body.appendChild(buildMultiFileSection(layer, "productionData", "Production Data (optional)"));

    layerStackEl.appendChild(box);

    numberInput.addEventListener("change", () => {
      const padded = numberInput.value.replace(/\D/g, "").padStart(2, "0").slice(-2) || "01";
      layer.number = padded;
      numberInput.value = padded;
      updateLayerVersion(layer, versionSelect);
    });

    variantInput.addEventListener("change", () => {
      layer.variant = variantInput.value.trim() || "main";
      variantInput.value = layer.variant;
      updateLayerVersion(layer, versionSelect);
    });

    if (layer.name) {
      updateLayerVersion(layer, versionSelect);
    }
  });

  refreshUploadButtonState();
}

// ---------------------------------------------------------------
// Per-layer upload section builders. Each gets a large drop-zone
// style area: click it to open the native file picker (always
// reliable), or drag files onto it. Drag and drop depends on the
// WebView engine actually exposing the dropped file's real path,
// if it can't, the zone tells you to click and browse instead.
// ---------------------------------------------------------------

function buildSectionShell(title, enabled, onToggle) {
  const wrap = document.createElement("div");
  wrap.className = "upload-section";

  const header = document.createElement("label");
  header.className = "upload-section-header";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = enabled;
  const titleSpan = document.createElement("span");
  titleSpan.textContent = title;
  header.appendChild(checkbox);
  header.appendChild(titleSpan);
  wrap.appendChild(header);

  const sectionBody = document.createElement("div");
  sectionBody.className = "upload-section-body";
  sectionBody.classList.toggle("hidden", !enabled);
  wrap.appendChild(sectionBody);

  checkbox.addEventListener("change", () => {
    sectionBody.classList.toggle("hidden", !checkbox.checked);
    onToggle(checkbox.checked);
    refreshUploadButtonState();
  });

  return { wrap, sectionBody };
}

function renderFileList(container, items, onRemove, renamePreview) {
  container.innerHTML = "";
  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "file-list-empty";
    empty.textContent = "No files selected yet.";
    container.appendChild(empty);
    return;
  }
  items.forEach((path, i) => {
    const row = document.createElement("div");
    row.className = "file-item";
    const name = document.createElement("span");
    name.className = "file-item-name";
    const originalName = path.split(/[\\/]/).pop();
    name.textContent = renamePreview ? `${originalName} \u2192 ${renamePreview(i)}` : originalName;
    name.title = name.textContent;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "file-item-remove";
    removeBtn.textContent = "\u00d7";
    removeBtn.addEventListener("click", () => onRemove(i));
    row.appendChild(name);
    row.appendChild(removeBtn);
    container.appendChild(row);
  });
}

function getExtension(path) {
  const match = path.match(/\.([^.\\/]+)$/);
  return match ? match[1].toLowerCase() : "";
}

const JPEG_ALLOWED_EXTENSIONS = ["jpg", "jpeg"];
const RAW_EXCLUDED_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "bmp", "webp", "tif", "tiff"];

// Returns the subset of paths that fail the type check: "raw" must NOT
// look like a consumer image format, "jpeg" must actually BE a jpeg.
function findTypeMismatches(kind, paths) {
  if (kind === "jpeg") return paths.filter(p => !JPEG_ALLOWED_EXTENSIONS.includes(getExtension(p)));
  if (kind === "raw") return paths.filter(p => RAW_EXCLUDED_EXTENSIONS.includes(getExtension(p)));
  return [];
}

// ---------------------------------------------------------------
// Drag and drop.
//
// A browser never exposes a real disk path to JavaScript, so the drop
// itself is caught in Python (see _on_dom_drop in main.py), which is
// the only place pywebview surfaces the full path. Python then calls
// window.__mnrHandleDrop with the paths.
//
// Because that Python handler is bound to the whole document, it has
// no idea which zone was targeted. So every zone reports when the
// cursor is over it, and the most recent one wins.
// ---------------------------------------------------------------

let activeDropTarget = null;

window.__mnrHandleDrop = function (paths) {
  if (!activeDropTarget || !Array.isArray(paths) || paths.length === 0) return;
  const handler = activeDropTarget.onFiles;
  activeDropTarget.el.classList.remove("drag-over");
  activeDropTarget = null;
  if (handler) handler(paths);
};

function registerDropTarget(el, onFiles) {
  el.addEventListener("dragenter", () => {
    activeDropTarget = { el, onFiles };
    el.classList.add("drag-over");
  });
  el.addEventListener("dragover", () => {
    activeDropTarget = { el, onFiles };
    el.classList.add("drag-over");
  });
  el.addEventListener("dragleave", () => {
    el.classList.remove("drag-over");
    if (activeDropTarget && activeDropTarget.el === el) activeDropTarget = null;
  });
}

function makeDropZone(labelText, onFiles) {
  const zone = document.createElement("div");
  zone.className = "drop-zone";
  zone.tabIndex = 0;

  const title = document.createElement("div");
  title.className = "drop-zone-title";
  title.textContent = "Drag files here";
  const sub = document.createElement("div");
  sub.textContent = labelText;
  zone.appendChild(title);
  zone.appendChild(sub);

  zone.addEventListener("click", async () => {
    const result = await window.pywebview.api.browse_files(true);
    if (result.ok && result.paths.length) onFiles(result.paths);
  });

  registerDropTarget(zone, onFiles);

  return zone;
}

function buildSingleFileSection(layer, key, title) {
  const state = layer[key];
  const { wrap, sectionBody } = buildSectionShell(title, state.enabled, checked => {
    state.enabled = checked;
  });

  const zone = makeDropZone("or click to browse for one file", paths => {
    if (paths.length) {
      state.path = paths[0];
      refresh();
      refreshUploadButtonState();
    }
  });
  sectionBody.appendChild(zone);

  const listEl = document.createElement("div");
  listEl.className = "file-list";
  sectionBody.appendChild(listEl);

  // The mp4 section can build its preview out of the frames being
  // uploaded instead of taking a file, in which case the drop zone
  // is replaced by the render settings.
  if (key === "mp4") {
    sectionBody.appendChild(buildMakeFromFramesBlock(layer, state, zone, listEl));
  }

  function refresh() {
    renderFileList(listEl, state.path ? [state.path] : [], () => {
      state.path = null;
      refresh();
      refreshUploadButtonState();
    }, () => {
      const ext = state.path ? (state.path.match(/\.[^.]+$/)?.[0] || "") : "";
      return `${buildBaseName(layer)}${ext}`;
    });
  }

  refresh();
  return wrap;
}

// Settings shown when "Make Preview Video from Uploaded Frames" is on.
// The frame source is whatever raw/jpeg sequence the artist adds to
// this same layer, so there is nothing to pick here, only how to
// render it.
function buildMakeFromFramesBlock(layer, state, zone, listEl) {
  const block = document.createElement("div");

  const toggleRow = document.createElement("label");
  toggleRow.className = "checkbox-row";
  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.checked = state.makeFromFrames;
  toggleRow.appendChild(toggle);
  toggleRow.appendChild(document.createTextNode(" Make Preview Video from Uploaded Frames"));
  block.appendChild(toggleRow);

  const settings = document.createElement("div");
  settings.className = "hidden";
  block.appendChild(settings);

  // Frame rate
  const fpsGroup = document.createElement("div");
  fpsGroup.className = "field-group";
  const fpsLabel = document.createElement("label");
  fpsLabel.className = "field-label";
  fpsLabel.textContent = "Frame rate";
  const fpsSelect = document.createElement("select");
  fpsSelect.className = "field-select";
  [12, 24].forEach(v => {
    const opt = document.createElement("option");
    opt.value = String(v);
    opt.textContent = String(v);
    fpsSelect.appendChild(opt);
  });
  const fpsCustomOpt = document.createElement("option");
  fpsCustomOpt.value = "custom";
  fpsCustomOpt.textContent = "Custom...";
  fpsSelect.appendChild(fpsCustomOpt);
  fpsSelect.value = String(state.framerate);
  const fpsCustom = document.createElement("input");
  fpsCustom.type = "number";
  fpsCustom.min = "1";
  fpsCustom.className = "field-select hidden";
  fpsCustom.placeholder = "Custom fps";
  fpsGroup.appendChild(fpsLabel);
  fpsGroup.appendChild(fpsSelect);
  fpsGroup.appendChild(fpsCustom);
  settings.appendChild(fpsGroup);

  // Scale
  const scaleGroup = document.createElement("div");
  scaleGroup.className = "field-group";
  const scaleLabel = document.createElement("label");
  scaleLabel.className = "field-label";
  scaleLabel.textContent = "Scale";
  const scaleSelect = document.createElement("select");
  scaleSelect.className = "field-select";
  [100, 75, 50, 25].forEach(v => {
    const opt = document.createElement("option");
    opt.value = String(v);
    opt.textContent = `${v}%`;
    scaleSelect.appendChild(opt);
  });
  const scaleCustomOpt = document.createElement("option");
  scaleCustomOpt.value = "custom";
  scaleCustomOpt.textContent = "Custom...";
  scaleSelect.appendChild(scaleCustomOpt);
  scaleSelect.value = String(state.scale);
  const scaleCustom = document.createElement("input");
  scaleCustom.type = "number";
  scaleCustom.min = "1";
  scaleCustom.max = "100";
  scaleCustom.className = "field-select hidden";
  scaleCustom.placeholder = "Custom %";
  scaleGroup.appendChild(scaleLabel);
  scaleGroup.appendChild(scaleSelect);
  scaleGroup.appendChild(scaleCustom);
  settings.appendChild(scaleGroup);

  const sizeNote = document.createElement("div");
  sizeNote.className = "next-note";
  settings.appendChild(sizeNote);

  // Bitrate
  const brGroup = document.createElement("div");
  brGroup.className = "field-group";
  const brLabel = document.createElement("label");
  brLabel.className = "field-label";
  brLabel.textContent = "Bitrate (kbps)";
  const brInput = document.createElement("input");
  brInput.type = "number";
  brInput.min = "500";
  brInput.className = "field-select";
  brInput.value = String(state.bitrate);
  brGroup.appendChild(brLabel);
  brGroup.appendChild(brInput);
  settings.appendChild(brGroup);

  const sourceNote = document.createElement("div");
  sourceNote.className = "next-note";
  sourceNote.textContent = "Built from this layer's uploaded frames, JPEG is used when present.";
  settings.appendChild(sourceNote);

  function currentScale() {
    return scaleSelect.value === "custom"
      ? (parseFloat(scaleCustom.value) || 100)
      : parseFloat(scaleSelect.value);
  }

  async function updateSizeNote() {
    // Resolution is read off whichever frames this layer already has
    // locally. Camera raw generally cannot be read for this, so the
    // note just falls back to showing the percentage.
    const framePaths = (layer.jpeg && layer.jpeg.paths && layer.jpeg.paths.length)
      ? layer.jpeg.paths
      : ((layer.raw && layer.raw.paths) || []);

    const scale = currentScale();
    if (!framePaths.length) {
      sizeNote.textContent = `Output scale: ${scale}% (add frames below to see the final size)`;
      return;
    }
    try {
      const info = await window.pywebview.api.inspect_local_frames(framePaths);
      if (info.ok) {
        const w = Math.round(info.width * (scale / 100));
        const h = Math.round(info.height * (scale / 100));
        sizeNote.textContent = `Output size: ${w}x${h} (${scale}% of ${info.width}x${info.height})`;
      } else {
        sizeNote.textContent = `Output scale: ${scale}% (final size shown after upload)`;
      }
    } catch (e) {
      sizeNote.textContent = `Output scale: ${scale}%`;
    }
  }

  function applyMode() {
    const on = toggle.checked;
    state.makeFromFrames = on;
    // One or the other, never both, the section produces a single mp4.
    zone.classList.toggle("hidden", on);
    listEl.classList.toggle("hidden", on);
    settings.classList.toggle("hidden", !on);
    if (on) {
      state.path = null;
      updateSizeNote();
    }
    refreshUploadButtonState();
  }

  toggle.addEventListener("change", applyMode);

  fpsSelect.addEventListener("change", () => {
    fpsCustom.classList.toggle("hidden", fpsSelect.value !== "custom");
    state.framerate = fpsSelect.value === "custom"
      ? (parseFloat(fpsCustom.value) || 12)
      : parseFloat(fpsSelect.value);
  });
  fpsCustom.addEventListener("input", () => {
    state.framerate = parseFloat(fpsCustom.value) || 12;
  });

  scaleSelect.addEventListener("change", () => {
    scaleCustom.classList.toggle("hidden", scaleSelect.value !== "custom");
    state.scale = currentScale();
    updateSizeNote();
  });
  scaleCustom.addEventListener("input", () => {
    state.scale = currentScale();
    updateSizeNote();
  });

  brInput.addEventListener("input", () => {
    state.bitrate = parseInt(brInput.value, 10) || 8000;
  });

  applyMode();
  return block;
}

function buildMultiFileSection(layer, key, title) {
  const state = layer[key];
  const { wrap, sectionBody } = buildSectionShell(title, state.enabled, checked => {
    state.enabled = checked;
  });

  const zone = makeDropZone("or click to browse for files", paths => {
    state.paths = state.paths.concat(paths);
    refresh();
    refreshUploadButtonState();
  });
  sectionBody.appendChild(zone);

  const listEl = document.createElement("div");
  listEl.className = "file-list";
  sectionBody.appendChild(listEl);

  function refresh() {
    renderFileList(listEl, state.paths, i => {
      state.paths.splice(i, 1);
      refresh();
      refreshUploadButtonState();
    });
  }

  refresh();
  return wrap;
}

function buildSequenceSection(layer, key, title, kind) {
  const state = layer[key];
  const { wrap, sectionBody } = buildSectionShell(title, state.enabled, checked => {
    state.enabled = checked;
  });

  const zone = makeDropZone("or click to browse for frames", paths => {
    state.paths = state.paths.concat(paths);
    refresh();
  });
  sectionBody.appendChild(zone);

  const typeWarning = document.createElement("div");
  typeWarning.className = "type-warning hidden";
  sectionBody.appendChild(typeWarning);

  const typeOverrideRow = document.createElement("label");
  typeOverrideRow.className = "type-warning-row hidden";
  const typeOverrideBox = document.createElement("input");
  typeOverrideBox.type = "checkbox";
  typeOverrideBox.checked = state.typeOverride;
  const typeOverrideText = document.createElement("span");
  typeOverrideText.textContent = "I'm sure, upload anyway";
  typeOverrideRow.appendChild(typeOverrideBox);
  typeOverrideRow.appendChild(typeOverrideText);
  sectionBody.appendChild(typeOverrideRow);

  const frameCheck = document.createElement("div");
  frameCheck.className = "frame-check";
  sectionBody.appendChild(frameCheck);

  const overrideRow = document.createElement("label");
  overrideRow.className = "override-row hidden";
  const overrideBox = document.createElement("input");
  overrideBox.type = "checkbox";
  overrideBox.checked = state.override;
  const overrideText = document.createElement("span");
  overrideText.textContent = "\ud83d\ude1e Override and upload anyway";
  overrideRow.appendChild(overrideBox);
  overrideRow.appendChild(overrideText);
  sectionBody.appendChild(overrideRow);

  const listEl = document.createElement("div");
  listEl.className = "file-list";
  sectionBody.appendChild(listEl);

  function updateTypeCheck() {
    const mismatches = findTypeMismatches(kind, state.paths);
    if (mismatches.length === 0) {
      typeWarning.classList.add("hidden");
      typeOverrideRow.classList.add("hidden");
      state.typeOverride = false;
      return;
    }
    const expectation = kind === "jpeg" ? "a .jpg/.jpeg file" : "not a jpeg/png/etc image";
    typeWarning.textContent = `${mismatches.length} file(s) don't look right for this section, expected ${expectation}: ${mismatches.map(p => p.split(/[\\/]/).pop()).join(", ")}`;
    typeWarning.classList.remove("hidden");
    typeOverrideRow.classList.remove("hidden");
  }

  function updateFrameCheck() {
    const expected = sharedFrameSettings.expectedFrames;
    const front = sharedFrameSettings.handleFront;
    const back = sharedFrameSettings.handleBack;
    const actual = state.paths.length;

    if (!expected || actual === 0) {
      frameCheck.textContent = `${actual} frame(s) selected.`;
      frameCheck.className = "frame-check";
      overrideRow.classList.add("hidden");
      return;
    }

    const totalExpected = expected + front + back;
    if (actual === totalExpected) {
      frameCheck.textContent = `${actual} frame(s), matches expected ${totalExpected} (handle ${front}/${back}).`;
      frameCheck.className = "frame-check ok";
      overrideRow.classList.add("hidden");
      state.override = false;
      overrideBox.checked = false;
    } else {
      frameCheck.textContent = `${actual} frame(s) selected, expected ${totalExpected} (${expected} + handle ${front}/${back}). Recheck for extra reference frames.`;
      frameCheck.className = "frame-check warn";
      overrideRow.classList.remove("hidden");
    }
  }

  function refresh() {
    renderFileList(listEl, state.paths, i => {
      state.paths.splice(i, 1);
      refresh();
    }, i => {
      const start = 1001 - sharedFrameSettings.handleFront;
      const frameExt = state.paths[i] ? (state.paths[i].match(/\.[^.]+$/)?.[0] || "") : "";
      return `${buildBaseName(layer)}.${String(start + i).padStart(4, "0")}${frameExt}`;
    });
    updateTypeCheck();
    updateFrameCheck();
    refreshUploadButtonState();
  }

  typeOverrideBox.addEventListener("change", () => {
    state.typeOverride = typeOverrideBox.checked;
    refreshUploadButtonState();
  });
  overrideBox.addEventListener("change", () => {
    state.override = overrideBox.checked;
    refreshUploadButtonState();
  });

  refresh();
  return wrap;
}

// ---------------------------------------------------------------
// Upload button: enabled once at least one layer is named, every
// enabled sequence section's file types check out (or are overridden),
// and every enabled sequence section's frame count matches (or is
// overridden).
// ---------------------------------------------------------------

function refreshUploadButtonState() {
  const shotChosen = currentAutoPath().length === 5;
  const namedLayers = layers.filter(l => l.name && l.number && l.variant && l.version);

  refreshTree();

  let blocked = false;
  let blockReason = "";
  namedLayers.forEach(layer => {
    ["raw", "jpeg"].forEach(key => {
      const section = layer[key];
      if (!section.enabled || section.paths.length === 0) return;

      const mismatches = findTypeMismatches(key, section.paths);
      if (mismatches.length > 0 && !section.typeOverride) {
        blocked = true;
        blockReason = `${layer.name || "a layer"}'s ${key} section has files that don't look right, check "I'm sure" or remove them.`;
        return;
      }

      const expected = sharedFrameSettings.expectedFrames;
      if (!expected) return;
      const totalExpected = expected + sharedFrameSettings.handleFront + sharedFrameSettings.handleBack;
      if (section.paths.length !== totalExpected && !section.override) {
        blocked = true;
        blockReason = `${layer.name || "a layer"}'s ${key} frame count doesn't match, check the frame count warning or override it.`;
      }
    });
  });

  const ready = shotChosen && namedLayers.length > 0 && !blocked;
  uploadButton.disabled = !ready;
  uploadButton.classList.toggle("ready", ready);

  if (ready) {
    uploadHint.textContent = "";
  } else if (!shotChosen) {
    uploadHint.textContent = "Pick Project, Episode, Sequence, and Shot above first.";
  } else if (namedLayers.length === 0) {
    uploadHint.textContent = "Add a layer and pick a character name before uploading.";
  } else if (blocked) {
    uploadHint.textContent = blockReason;
  }
}

function buildBaseName(layer) {
  const project = ddProject.value;
  const episode = ddEpisode.value;
  const sequence = ddSequence.value;
  const shot = ddShot.value;
  return `${project}${episode}_${sequence}_${shot}_smAnim_${layer.name}${layer.number}-${layer.variant}_${layer.version}`;
}

uploadButton.addEventListener("click", async () => {
  uploadButton.disabled = true;
  uploadStatus.innerHTML = "";

  const shotParts = currentAutoPath();
  const readyLayers = layers.filter(l => l.name && l.number && l.variant && l.version);

  const payload = {
    shot_parts: shotParts,
    layers: readyLayers.map(layer => ({
      base_name: buildBaseName(layer),
      mp4: {
        enabled: layer.mp4.enabled,
        path: layer.mp4.path,
        make_from_frames: layer.mp4.makeFromFrames,
        framerate: layer.mp4.framerate,
        scale: layer.mp4.scale,
        bitrate: layer.mp4.bitrate,
      },
      raw: { enabled: layer.raw.enabled, paths: layer.raw.paths, handle_front: sharedFrameSettings.handleFront },
      jpeg: { enabled: layer.jpeg.enabled, paths: layer.jpeg.paths, handle_front: sharedFrameSettings.handleFront },
      production_data: { enabled: layer.productionData.enabled, paths: layer.productionData.paths },
    })),
  };

  const submitted = await submitJobAndShow(window.pywebview.api.submit_upload_job(payload));
  if (submitted) {
    addUploadLine("Sent to the job queue, follow it along the bottom of the window.", "ok");
    addUploadLine("You can leave this page and set up another upload now.", "info");
  }

  refreshUploadButtonState();
});

function addUploadLine(text, kind) {
  const line = document.createElement("div");
  line.textContent = text;
  line.className = kind === "ok" ? "boot-line-ok" : kind === "fail" ? "boot-line-fail" : "boot-line-info";
  uploadStatus.appendChild(line);
}

// ---------------------------------------------------------------
// Archive / Restore tool. Browse the same project tree, click
// "Archive" next to an eligible folder or "Restore" next to a .zip
// to queue it up, nothing happens until Run is pressed. Kept
// deliberately separate from the smAnim tree builder above rather
// than generalizing it, since the two need genuinely different
// behavior (no task filtering, no pending-upload previews here, but
// action buttons and live folder sizes instead), and this keeps
// either one safe to change without risking breaking the other.
// ---------------------------------------------------------------

const archiveBack = document.getElementById("archive-back");
const archiveLeft = document.getElementById("archive-left");
const archiveDivider = document.getElementById("archive-divider");
const archiveRight = document.getElementById("archive-right");
const archiveTreeRoot = document.getElementById("archive-tree-root");
const archiveOverrideToggle = document.getElementById("archive-override-toggle");
const archiveOverrideNote = document.getElementById("archive-override-note");
const archiveProjectFilterGroup = document.getElementById("archive-project-filter-group");
const archiveProjectFilter = document.getElementById("archive-project-filter");
const archiveQueueList = document.getElementById("archive-queue-list");
const restoreQueueList = document.getElementById("restore-queue-list");
const archiveDeleteSource = document.getElementById("archive-delete-source");
const archiveDeleteZip = document.getElementById("archive-delete-zip");
const archiveRunButton = document.getElementById("archive-run-button");
const archiveStatus = document.getElementById("archive-status");

let archiveQueue = []; // [{pathParts, name, fromRoot}]
let restoreQueue = [];
let archiveTreeGeneration = 0;

archiveOverrideToggle.addEventListener("change", () => {
  if (archiveOverrideToggle.checked) {
    const confirmed = confirm(
      "This lets you archive or restore ANY folder in pCloud, including pipeline tools, apps, and other critical folders, not just the usual export/publish/media folders.\n\nAre you sure?"
    );
    if (!confirmed) {
      archiveOverrideToggle.checked = false;
      return;
    }
  }
  const overrideOn = archiveOverrideToggle.checked;
  archiveOverrideNote.classList.toggle("hidden", !overrideOn);
  archiveProjectFilterGroup.classList.toggle("hidden", overrideOn);
  refreshArchiveTree();
});

archiveBack.addEventListener("click", () => {
  showScreen("home");
});

// Same resizable-divider behavior as the smAnim screen.
(function setupArchiveDivider() {
  let dragging = false;
  archiveDivider.addEventListener("mousedown", () => {
    dragging = true;
    archiveDivider.classList.add("dragging");
    document.body.style.userSelect = "none";
  });
  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const rect = archiveLeft.parentElement.getBoundingClientRect();
    let leftPercent = ((e.clientX - rect.left) / rect.width) * 100;
    leftPercent = Math.max(25, Math.min(80, leftPercent));
    archiveLeft.style.flex = `0 0 ${leftPercent}%`;
    archiveRight.style.flex = `1 1 ${100 - leftPercent}%`;
  });
  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    archiveDivider.classList.remove("dragging");
    document.body.style.userSelect = "";
  });
})();

async function initArchiveScreen() {
  archiveQueue = [];
  restoreQueue = [];
  archiveStatus.innerHTML = "";
  renderArchiveQueues();

  archiveOverrideToggle.checked = false;
  archiveOverrideNote.classList.add("hidden");
  archiveProjectFilterGroup.classList.remove("hidden");

  const result = await window.pywebview.api.list_projects();
  archiveProjectFilter.innerHTML = "";
  const allOpt = document.createElement("option");
  allOpt.value = "";
  allOpt.textContent = "All Projects";
  archiveProjectFilter.appendChild(allOpt);
  if (result.ok) {
    result.items.forEach(name => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      archiveProjectFilter.appendChild(opt);
    });
  }

  await refreshArchiveTree();
}

archiveProjectFilter.addEventListener("change", refreshArchiveTree);

async function refreshArchiveTree() {
  const myGeneration = ++archiveTreeGeneration;
  archiveTreeRoot.innerHTML = "";
  const overrideOn = archiveOverrideToggle.checked;
  const rootParts = overrideOn ? [] : (archiveProjectFilter.value ? [archiveProjectFilter.value] : []);
  await buildArchiveLevel(archiveTreeRoot, rootParts, myGeneration, overrideOn);
  archivePathBar.setDisplay(rootParts);
}

// A folder can be archived only if it sits strictly inside a
// .../export/publish/media/... folder, not the media folder itself,
// matching "these specific folders can be archived, not everything".
// Lifted entirely when the full system override is on, except for
// the top-level pipeline folders themselves (00-temp, 01-projects,
// 02-pipeline, etc), those are never archivable under any mode.
const TOP_LEVEL_NUMBERED_RE = /^\d{2}-/;

function isArchivablePath(pathParts, overrideOn) {
  if (pathParts.length === 1 && TOP_LEVEL_NUMBERED_RE.test(pathParts[0])) return false;
  if (overrideOn) return true;
  for (let i = 0; i + 2 < pathParts.length; i++) {
    if (pathParts[i] === "export" && pathParts[i + 1] === "publish" && pathParts[i + 2] === "media") {
      return pathParts.length > i + 3;
    }
  }
  return false;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex++;
  } while (value >= 1024 && unitIndex < units.length - 1);
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

// 0 items reads the same grey as the folder size text, gradually
// shifting toward red as file count climbs, capping out at 1000
// items. Uses the app's existing --muted and --red colors so it
// stays consistent with everything else, rather than pure red.
const FILE_COUNT_GREY = [0x8b, 0x8d, 0x93];
const FILE_COUNT_RED = [0xd0, 0x66, 0x6a];
const FILE_COUNT_HOT_CAP = 1000;

function fileCountColor(count) {
  const t = Math.min(count / FILE_COUNT_HOT_CAP, 1);
  const r = Math.round(FILE_COUNT_GREY[0] + (FILE_COUNT_RED[0] - FILE_COUNT_GREY[0]) * t);
  const g = Math.round(FILE_COUNT_GREY[1] + (FILE_COUNT_RED[1] - FILE_COUNT_GREY[1]) * t);
  const b = Math.round(FILE_COUNT_GREY[2] + (FILE_COUNT_RED[2] - FILE_COUNT_GREY[2]) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

async function buildArchiveLevel(container, pathParts, generation, overrideOn, autoPath = []) {
  const result = await window.pywebview.api.list_dir_entries(pathParts, false, overrideOn);
  if (generation !== archiveTreeGeneration) return;

  if (!result.ok) {
    const msg = document.createElement("div");
    msg.className = "tree-name tree-missing";
    msg.textContent = pathParts.length === 0 ? "(could not read this location)" : "(empty)";
    container.appendChild(msg);
    return;
  }

  for (const item of result.items) {
    const nextParts = pathParts.concat(item.name);
    const depth = pathParts.length;
    const { row, toggle, label } = makeRow(item.name, item.is_dir, depth);
    container.appendChild(row);

    const isZip = !item.is_dir && item.name.toLowerCase().endsWith(".zip");
    const isArchivableFolder = item.is_dir && isArchivablePath(nextParts, overrideOn);

    if (item.is_dir) {
      const sizeSpan = document.createElement("span");
      sizeSpan.className = "tree-size";
      sizeSpan.textContent = "";
      row.appendChild(sizeSpan);

      const countSpan = document.createElement("span");
      countSpan.className = "tree-size";
      countSpan.textContent = "";
      row.appendChild(countSpan);

      window.pywebview.api.get_folder_size(nextParts, overrideOn).then(sizeResult => {
        if (sizeResult.ok) {
          sizeSpan.textContent = `(${formatBytes(sizeResult.bytes)})`;
          countSpan.textContent = `${sizeResult.file_count} items`;
          countSpan.style.color = fileCountColor(sizeResult.file_count);
        }
      });
    }

    if (isArchivableFolder) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tree-action-button";
      btn.textContent = "Archive";
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        addToArchiveQueue(nextParts, item.name, overrideOn);
      });
      row.appendChild(btn);
    } else if (isZip) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tree-action-button";
      btn.textContent = "Restore";
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        addToRestoreQueue(nextParts, item.name, overrideOn);
      });
      row.appendChild(btn);
    }

    let childrenContainer = null;
    let expanded = false;

    async function doExpand() {
      if (!childrenContainer) {
        childrenContainer = document.createElement("div");
        childrenContainer.className = "tree-children";
        row.insertAdjacentElement("afterend", childrenContainer);
      }
      expanded = !expanded;
      toggle.textContent = expanded ? "\u25bc" : "\u25b6";
      childrenContainer.style.display = expanded ? "block" : "none";
      if (expanded && childrenContainer.childElementCount === 0) {
        await buildArchiveLevel(childrenContainer, nextParts, generation, overrideOn, autoPath);
      }
    }

    if (item.is_dir) {
      row.addEventListener("click", () => doExpand());
    } else {
      row.addEventListener("dblclick", async () => {
        const res = await window.pywebview.api.open_path(nextParts, overrideOn);
        if (!res.ok) console.error("open_path failed", res.detail);
      });
    }

    const shouldAutoExpand =
      item.is_dir && pathParts.length < autoPath.length && item.name === autoPath[pathParts.length];
    if (shouldAutoExpand) {
      await doExpand();
    }
  }
}

function addToArchiveQueue(pathParts, name, fromRoot) {
  if (archiveQueue.some(q => q.pathParts.join("/") === pathParts.join("/"))) return;
  archiveQueue.push({ pathParts, name, fromRoot });
  renderArchiveQueues();
}

function addToRestoreQueue(pathParts, name, fromRoot) {
  if (restoreQueue.some(q => q.pathParts.join("/") === pathParts.join("/"))) return;
  restoreQueue.push({ pathParts, name, fromRoot });
  renderArchiveQueues();
}

function renderArchiveQueues() {
  archiveQueueList.innerHTML = "";
  if (archiveQueue.length === 0) {
    const empty = document.createElement("div");
    empty.className = "file-list-empty";
    empty.textContent = "Nothing queued.";
    archiveQueueList.appendChild(empty);
  } else {
    archiveQueue.forEach((entry, i) => {
      const row = document.createElement("div");
      row.className = "file-item";
      const name = document.createElement("span");
      name.className = "file-item-name";
      const fullPath = entry.pathParts.join("/");
      name.textContent = fullPath;
      name.title = fullPath;
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "file-item-remove";
      removeBtn.textContent = "\u00d7";
      removeBtn.addEventListener("click", () => {
        archiveQueue.splice(i, 1);
        renderArchiveQueues();
      });
      row.appendChild(name);
      row.appendChild(removeBtn);
      archiveQueueList.appendChild(row);
    });
  }

  restoreQueueList.innerHTML = "";
  if (restoreQueue.length === 0) {
    const empty = document.createElement("div");
    empty.className = "file-list-empty";
    empty.textContent = "Nothing queued.";
    restoreQueueList.appendChild(empty);
  } else {
    restoreQueue.forEach((entry, i) => {
      const row = document.createElement("div");
      row.className = "file-item";
      const name = document.createElement("span");
      name.className = "file-item-name";
      const fullPath = entry.pathParts.join("/");
      name.textContent = fullPath;
      name.title = fullPath;
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "file-item-remove";
      removeBtn.textContent = "\u00d7";
      removeBtn.addEventListener("click", () => {
        restoreQueue.splice(i, 1);
        renderArchiveQueues();
      });
      row.appendChild(name);
      row.appendChild(removeBtn);
      restoreQueueList.appendChild(row);
    });
  }

  const ready = archiveQueue.length > 0 || restoreQueue.length > 0;
  archiveRunButton.disabled = !ready;
  archiveRunButton.classList.toggle("ready", ready);
}

function addArchiveStatusLine(text, kind) {
  const line = document.createElement("div");
  line.textContent = text;
  line.className = kind === "ok" ? "boot-line-ok" : kind === "fail" ? "boot-line-fail" : "boot-line-info";
  archiveStatus.appendChild(line);
}


function formatEta(seconds) {
  if (seconds == null || !isFinite(seconds)) return "";
  seconds = Math.round(seconds);
  if (seconds < 5) return "almost done";
  if (seconds < 60) return `~${seconds}s remaining`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `~${minutes}m ${secs}s remaining`;
}

// While a run is active, block leaving this screen entirely, since
// walking away mid-archive is exactly what could leave things in a
// half-finished state. Home, Refresh, and the user switcher all live
// in the persistent topbar rather than this screen, so they need
// locking too, not just the Back button here.

archiveRunButton.addEventListener("click", async () => {
  archiveRunButton.disabled = true;
  archiveStatus.innerHTML = "";

  const archiveItems = archiveQueue.map(q => ({ pathParts: q.pathParts, name: q.name, fromRoot: q.fromRoot }));
  const restoreItems = restoreQueue.map(q => ({ pathParts: q.pathParts, name: q.name, fromRoot: q.fromRoot }));

  const submitted = await submitJobAndShow(window.pywebview.api.submit_archive_job(
    archiveItems, restoreItems, archiveDeleteSource.checked, archiveDeleteZip.checked
  ));

  if (submitted) {
    addArchiveStatusLine("Sent to the job queue, follow it along the bottom of the window.", "ok");
    addArchiveStatusLine("You can leave this page now.", "info");
    archiveQueue = [];
    restoreQueue = [];
    renderArchiveQueues();
    await refreshArchiveTree();
  }

  archiveRunButton.disabled = false;
});

// ---------------------------------------------------------------
// Frames to MP4 tool. Browse to a folder containing a numbered image
// sequence, pick frame rate / scale / bitrate, and run ffmpeg on a
// background thread with live frame-based progress. Deliberately
// simple: fixed to H.264 in an MP4 container, no cropping (source
// aspect ratio is always kept), no full-system override, just enough
// options to be useful.
// ---------------------------------------------------------------

const ffmpegBack = document.getElementById("ffmpeg-back");
const ffmpegLeft = document.getElementById("ffmpeg-left");
const ffmpegDivider = document.getElementById("ffmpeg-divider");
const ffmpegRight = document.getElementById("ffmpeg-right");
const ffmpegTreeRoot = document.getElementById("ffmpeg-tree-root");
const ffmpegTile = document.getElementById("ffmpeg-tile");
const ffmpegTileBadge = document.getElementById("ffmpeg-tile-badge");
const ffmpegSelectedPath = document.getElementById("ffmpeg-selected-path");
const ffmpegDetectedInfo = document.getElementById("ffmpeg-detected-info");
const ffmpegFramerateSelect = document.getElementById("ffmpeg-framerate");
const ffmpegFramerateCustom = document.getElementById("ffmpeg-framerate-custom");
const ffmpegScaleSelect = document.getElementById("ffmpeg-scale");
const ffmpegScaleCustom = document.getElementById("ffmpeg-scale-custom");
const ffmpegScalePreview = document.getElementById("ffmpeg-scale-preview");
const ffmpegBitrateInput = document.getElementById("ffmpeg-bitrate");
const ffmpegOutputFolderInput = document.getElementById("ffmpeg-output-folder-input");
const ffmpegOutputFolderCopy = document.getElementById("ffmpeg-output-folder-copy");
const ffmpegOutputFolderError = document.getElementById("ffmpeg-output-folder-error");
const ffmpegOutputName = document.getElementById("ffmpeg-output-name");
const ffmpegConvertButton = document.getElementById("ffmpeg-convert-button");
const ffmpegProgressWrap = document.getElementById("ffmpeg-progress-wrap");
const ffmpegProgressBar = document.getElementById("ffmpeg-progress-bar");
const ffmpegProgressPercent = document.getElementById("ffmpeg-progress-percent");
const ffmpegProgressFrames = document.getElementById("ffmpeg-progress-frames");
const ffmpegStatus = document.getElementById("ffmpeg-status");

let ffmpegTreeGeneration = 0;
let ffmpegSelected = null; // {pathParts, name, width, height, frameCount}
let ffmpegOutputFolderParts = null;

ffmpegBack.addEventListener("click", () => {
  showScreen("home");
});

(function setupFfmpegDivider() {
  let dragging = false;
  ffmpegDivider.addEventListener("mousedown", () => {
    dragging = true;
    ffmpegDivider.classList.add("dragging");
    document.body.style.userSelect = "none";
  });
  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const rect = ffmpegLeft.parentElement.getBoundingClientRect();
    let leftPercent = ((e.clientX - rect.left) / rect.width) * 100;
    leftPercent = Math.max(25, Math.min(80, leftPercent));
    ffmpegLeft.style.flex = `0 0 ${leftPercent}%`;
    ffmpegRight.style.flex = `1 1 ${100 - leftPercent}%`;
  });
  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    ffmpegDivider.classList.remove("dragging");
    document.body.style.userSelect = "";
  });
})();

async function refreshFfmpegTile() {
  try {
    const info = await window.pywebview.api.get_ffmpeg_info();
    if (!info.supported) {
      ffmpegTile.classList.add("hidden");
    } else if (info.ok) {
      ffmpegTile.classList.remove("hidden", "tile-disabled");
      ffmpegTileBadge.textContent = `v${info.version}`;
    } else {
      ffmpegTile.classList.remove("hidden");
      ffmpegTileBadge.textContent = "Not found";
      ffmpegTile.classList.add("tile-disabled");
    }
  } catch (e) {
    ffmpegTile.classList.remove("hidden");
    ffmpegTileBadge.textContent = "Not found";
    ffmpegTile.classList.add("tile-disabled");
  }
}

async function initFfmpegScreen() {
  ffmpegSelected = null;
  ffmpegSelectedPath.textContent = "";
  ffmpegDetectedInfo.textContent = "";
  ffmpegScalePreview.textContent = "";
  ffmpegStatus.innerHTML = "";
  ffmpegOutputName.value = "";
  ffmpegConvertButton.disabled = true;

  const myGeneration = ++ffmpegTreeGeneration;
  ffmpegTreeRoot.innerHTML = "";
  await buildFfmpegLevel(ffmpegTreeRoot, [], myGeneration);
  ffmpegPathBar.setDisplay([]);
}

async function buildFfmpegLevel(container, pathParts, generation, autoPath = []) {
  const result = await window.pywebview.api.list_dir_entries(pathParts, false, true);
  if (generation !== ffmpegTreeGeneration) return;

  if (!result.ok) {
    const msg = document.createElement("div");
    msg.className = "tree-name tree-missing";
    msg.textContent = pathParts.length === 0 ? "(could not read the pCloud drive)" : "(empty)";
    container.appendChild(msg);
    return;
  }

  for (const item of result.items) {
    if (!item.is_dir) continue; // only folders matter for this tool
    const nextParts = pathParts.concat(item.name);
    const depth = pathParts.length;
    const { row, toggle } = makeRow(item.name, true, depth);
    container.appendChild(row);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tree-action-button";
    btn.textContent = "Use this folder";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      selectFfmpegFolder(nextParts, item.name);
    });
    row.appendChild(btn);

    let childrenContainer = null;
    let expanded = false;

    async function doExpand() {
      if (!childrenContainer) {
        childrenContainer = document.createElement("div");
        childrenContainer.className = "tree-children";
        row.insertAdjacentElement("afterend", childrenContainer);
      }
      expanded = !expanded;
      toggle.textContent = expanded ? "\u25bc" : "\u25b6";
      childrenContainer.style.display = expanded ? "block" : "none";
      if (expanded && childrenContainer.childElementCount === 0) {
        await buildFfmpegLevel(childrenContainer, nextParts, generation, autoPath);
      }
    }

    row.addEventListener("click", () => doExpand());

    const shouldAutoExpand = pathParts.length < autoPath.length && item.name === autoPath[pathParts.length];
    if (shouldAutoExpand) {
      await doExpand();
    }
  }
}

async function selectFfmpegFolder(pathParts, name) {
  ffmpegSelectedPath.textContent = `Selected: ${pathParts.join("/")}`;
  ffmpegDetectedInfo.textContent = "Reading frame sequence...";
  ffmpegConvertButton.disabled = true;
  ffmpegConvertButton.classList.remove("ready");
  ffmpegSelected = null;

  const info = await window.pywebview.api.inspect_frame_sequence(pathParts, true);
  if (!info.ok) {
    ffmpegDetectedInfo.textContent = info.detail;
    return;
  }

  ffmpegSelected = {
    pathParts,
    name,
    width: info.width,
    height: info.height,
    frameCount: info.frame_count,
  };

  let text = `${info.frame_count} frames (${info.start_frame}-${info.end_frame}), ${info.width}x${info.height}`;
  if (info.has_gaps) {
    text += " \u2014 warning: gaps detected in the frame numbers";
  }
  ffmpegDetectedInfo.textContent = text;

  // Defaults to the sequence's own name with frame numbers and
  // periods already stripped off, still fully editable.
  ffmpegOutputName.value = info.prefix;

  // Defaults to the same folder the sequence lives in, shown here so
  // it's visible the moment a folder is picked, still editable.
  ffmpegOutputFolderParts = pathParts.slice(0, -1);
  ffmpegOutputFolderPathBar.setDisplay(ffmpegOutputFolderParts);

  updateFfmpegScalePreview();
  ffmpegConvertButton.disabled = false;
  ffmpegConvertButton.classList.add("ready");
}

function getFfmpegFramerate() {
  if (ffmpegFramerateSelect.value === "custom") {
    return parseFloat(ffmpegFramerateCustom.value) || 12;
  }
  return parseFloat(ffmpegFramerateSelect.value);
}

function getFfmpegScalePercent() {
  if (ffmpegScaleSelect.value === "custom") {
    return parseFloat(ffmpegScaleCustom.value) || 100;
  }
  return parseFloat(ffmpegScaleSelect.value);
}

function updateFfmpegScalePreview() {
  if (!ffmpegSelected) {
    ffmpegScalePreview.textContent = "";
    return;
  }
  const scale = getFfmpegScalePercent();
  const outW = Math.round(ffmpegSelected.width * (scale / 100));
  const outH = Math.round(ffmpegSelected.height * (scale / 100));
  ffmpegScalePreview.textContent = `Output size: ${outW}x${outH}`;
}

ffmpegFramerateSelect.addEventListener("change", () => {
  ffmpegFramerateCustom.classList.toggle("hidden", ffmpegFramerateSelect.value !== "custom");
});

ffmpegScaleSelect.addEventListener("change", () => {
  ffmpegScaleCustom.classList.toggle("hidden", ffmpegScaleSelect.value !== "custom");
  updateFfmpegScalePreview();
});

ffmpegScaleCustom.addEventListener("input", updateFfmpegScalePreview);

function addFfmpegStatusLine(text, kind) {
  const line = document.createElement("div");
  line.textContent = text;
  line.className = kind === "ok" ? "boot-line-ok" : kind === "fail" ? "boot-line-fail" : "boot-line-info";
  ffmpegStatus.appendChild(line);
}

ffmpegConvertButton.addEventListener("click", async () => {
  if (!ffmpegSelected) return;

  ffmpegConvertButton.disabled = true;
  ffmpegStatus.innerHTML = "";
  ffmpegProgressWrap.classList.remove("hidden");
  ffmpegProgressBar.style.width = "0%";
  ffmpegProgressPercent.textContent = "0%";
  ffmpegProgressFrames.textContent = "";

  const framerate = getFfmpegFramerate();
  const scale = getFfmpegScalePercent();
  const bitrate = parseInt(ffmpegBitrateInput.value, 10) || 8000;
  const outputName = ffmpegOutputName.value.trim() || ffmpegSelected.name;
  const outputFolder = ffmpegOutputFolderParts || ffmpegSelected.pathParts.slice(0, -1);
  const openWhenDone = document.getElementById("ffmpeg-open-when-done").checked;

  const startResult = await window.pywebview.api.run_ffmpeg_convert(
    ffmpegSelected.pathParts, framerate, bitrate, scale, outputName, outputFolder, true
  );

  if (!startResult.ok) {
    ffmpegProgressWrap.classList.add("hidden");
    addFfmpegStatusLine(`Could not start: ${startResult.detail}`, "fail");
    ffmpegConvertButton.disabled = false;
    return;
  }

  const pollInterval = setInterval(async () => {
    const progress = await window.pywebview.api.get_ffmpeg_progress();
    ffmpegProgressBar.style.width = `${progress.percent}%`;
    ffmpegProgressPercent.textContent = `${progress.percent}%`;
    ffmpegProgressFrames.textContent = `frame ${progress.current_frame} / ${progress.total_frames}`;

    if (progress.done) {
      clearInterval(pollInterval);
      ffmpegProgressWrap.classList.add("hidden");
      addFfmpegStatusLine(
        progress.ok ? `[OK] Created ${progress.detail}` : `[FAIL] ${progress.detail}`,
        progress.ok ? "ok" : "fail"
      );
      ffmpegConvertButton.disabled = false;

      if (progress.ok && openWhenDone) {
        const outputParts = outputFolder.concat(progress.detail);
        await window.pywebview.api.open_path(outputParts, true);
      }
    }
  }, 500);
});

// ---------------------------------------------------------------
// Shared address bar for every folder tree browser (smAnim, Archive,
// Frames to MP4). Shows the current path as P:\..., copyable, and
// editable, typing or pasting a path and hitting Enter navigates
// there directly, as long as it stays within whatever that tool's
// current locked prefix is. Outside that, it resets back to the
// current path and shows why, rather than silently failing.
// ---------------------------------------------------------------

function createPathBar(inputEl, copyBtnEl, errorEl, config) {
  let currentParts = [];

  function setDisplay(parts) {
    currentParts = parts;
    inputEl.value = "P:\\" + parts.join("\\");
    errorEl.textContent = "";
  }

  copyBtnEl.addEventListener("click", () => {
    navigator.clipboard.writeText(inputEl.value).catch(() => {});
  });

  inputEl.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    inputEl.blur();

    const typed = inputEl.value.trim();
    const fromRoot = config.getFromRoot ? config.getFromRoot() : false;
    const result = await window.pywebview.api.resolve_path_to_parts(typed, fromRoot);

    if (!result.ok) {
      inputEl.value = "P:\\" + currentParts.join("\\");
      errorEl.textContent = result.detail;
      return;
    }

    const lockedParts = config.getLockedParts ? config.getLockedParts() : [];
    const matches = lockedParts.every(
      (p, i) => (result.parts[i] || "").toLowerCase() === p.toLowerCase()
    );
    if (!matches) {
      inputEl.value = "P:\\" + currentParts.join("\\");
      errorEl.textContent = `Locked to P:\\${lockedParts.join("\\")}, can't navigate outside it`;
      return;
    }

    errorEl.textContent = "";
    config.onNavigate(result.parts);
  });

  return { setDisplay };
}

// --- smAnim tool ---
const smanimPathInput = document.getElementById("smanim-path-input");
const smanimPathCopy = document.getElementById("smanim-path-copy");
const smanimPathError = document.getElementById("smanim-path-error");

const smanimPathBar = createPathBar(smanimPathInput, smanimPathCopy, smanimPathError, {
  getFromRoot: () => false,
  getLockedParts: () => currentAutoPath(),
  onNavigate: async (parts) => {
    const myGeneration = ++treeRefreshGeneration;
    treeRoot.innerHTML = "";
    const pendingMap = computePendingMap();
    await buildLevel(treeRoot, [], parts, pendingMap, myGeneration);
    smanimPathBar.setDisplay(parts);
  },
});

// --- Archive tool ---
const archivePathInput = document.getElementById("archive-path-input");
const archivePathCopy = document.getElementById("archive-path-copy");
const archivePathError = document.getElementById("archive-path-error");

const archivePathBar = createPathBar(archivePathInput, archivePathCopy, archivePathError, {
  getFromRoot: () => archiveOverrideToggle.checked,
  getLockedParts: () => [],
  onNavigate: async (parts) => {
    const myGeneration = ++archiveTreeGeneration;
    archiveTreeRoot.innerHTML = "";
    const overrideOn = archiveOverrideToggle.checked;
    await buildArchiveLevel(archiveTreeRoot, [], myGeneration, overrideOn, parts);
    archivePathBar.setDisplay(parts);
  },
});

// --- Frames to MP4 tool ---
const ffmpegPathInput = document.getElementById("ffmpeg-path-input");
const ffmpegPathCopy = document.getElementById("ffmpeg-path-copy");
const ffmpegPathError = document.getElementById("ffmpeg-path-error");
const ffmpegBrowseZone = document.getElementById("ffmpeg-browse-zone");

const ffmpegPathBar = createPathBar(ffmpegPathInput, ffmpegPathCopy, ffmpegPathError, {
  getFromRoot: () => true,
  getLockedParts: () => [],
  onNavigate: async (parts) => {
    const myGeneration = ++ffmpegTreeGeneration;
    ffmpegTreeRoot.innerHTML = "";
    await buildFfmpegLevel(ffmpegTreeRoot, [], myGeneration, parts);
    ffmpegPathBar.setDisplay(parts);
    const name = parts[parts.length - 1] || "selected";
    await selectFfmpegFolder(parts, name);
  },
});

const ffmpegOutputFolderPathBar = createPathBar(
  ffmpegOutputFolderInput, ffmpegOutputFolderCopy, ffmpegOutputFolderError,
  {
    getFromRoot: () => true,
    getLockedParts: () => [],
    onNavigate: (parts) => {
      ffmpegOutputFolderParts = parts;
      ffmpegOutputFolderPathBar.setDisplay(parts);
    },
  }
);

async function useFfmpegPath(absolutePath) {
  const resolved = await window.pywebview.api.resolve_path_to_parts(absolutePath, true);
  if (!resolved.ok) {
    ffmpegPathError.textContent = resolved.detail;
    return;
  }

  const myGeneration = ++ffmpegTreeGeneration;
  ffmpegTreeRoot.innerHTML = "";
  await buildFfmpegLevel(ffmpegTreeRoot, [], myGeneration, resolved.parts);
  ffmpegPathBar.setDisplay(resolved.parts);

  const name = resolved.parts[resolved.parts.length - 1] || "selected";
  await selectFfmpegFolder(resolved.parts, name);
}

ffmpegBrowseZone.addEventListener("click", async () => {
  const result = await window.pywebview.api.browse_folder();
  if (!result.ok) {
    addFfmpegStatusLine(`Could not open the folder browser: ${result.detail}`, "fail");
    return;
  }
  if (!result.path) return; // cancelled
  await useFfmpegPath(result.path);
});

// Dropping a frame file works as well as dropping the folder itself,
// resolve_path_to_parts rejects a file, so fall back to its folder.
registerDropTarget(ffmpegBrowseZone, async (paths) => {
  const dropped = paths[0];
  if (!dropped) return;
  const resolved = await window.pywebview.api.resolve_path_to_parts(dropped, true);
  if (resolved.ok) {
    await useFfmpegPath(dropped);
  } else {
    const parentFolder = dropped.replace(/[\\/][^\\/]*$/, "");
    await useFfmpegPath(parentFolder);
  }
});

// ---------------------------------------------------------------
// Connect Software.
//
// Software the artist already has installed locally, that we attach
// our own plugin to. Three states per tile:
//   not detected  -> yellow, clicking opens a manual exe picker
//   detected      -> green, clicking opens a version picker
//   connected     -> moves up into the Launch grid with a chain badge
//
// The catalog lives in Python, this side renders whatever it is told
// about, so adding another piece of software later needs no changes
// here.
// ---------------------------------------------------------------

const launchGrid = document.getElementById("launch-grid");
const connectGrid = document.getElementById("connect-grid");
const popupBackdrop = document.getElementById("popup-backdrop");
const versionMenu = document.getElementById("version-menu");
const versionMenuTitle = document.getElementById("version-menu-title");
const versionMenuItems = document.getElementById("version-menu-items");
const connectionMenu = document.getElementById("connection-menu");
const connectionMenuTitle = document.getElementById("connection-menu-title");
const connectionMenuProblem = document.getElementById("connection-menu-problem");
const connectionMenuItems = document.getElementById("connection-menu-items");

// Icons are per software id so the same artwork is used by both the
// Connect Software tile and the Launch tile it turns into.
const SOFTWARE_ICONS = {
  after_effects: "https://www.adobe.com/cc-shared/assets/img/product-icons/svg/after-effects-40.svg",
};

// Demo tiles use an inline shape rather than a remote icon, they only
// exist to preview the tile states while Debug is open.
const DEMO_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>';
const DEMO_SOFTWARE_IDS = ["demo_software", "demo_software_missing"];

const CHAIN_OK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>';
const CHAIN_BROKEN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 0 1 0 10h-2"/><path d="M8 12h3"/><path d="M13 12h3"/><path d="M3 3l18 18"/></svg>';

let softwareCatalog = {};   // software_id -> {label, detected, installs}
let softwareConnections = {}; // key -> connection record

function closeAllPopups() {
  popupBackdrop.classList.add("hidden");
  versionMenu.classList.add("hidden");
  connectionMenu.classList.add("hidden");
}

popupBackdrop.addEventListener("click", closeAllPopups);

// Anchors a popup near whatever was clicked, then nudges it back
// inside the window if it would run off the bottom or right edge.
function openPopupNear(menuEl, anchorEl) {
  popupBackdrop.classList.remove("hidden");
  menuEl.classList.remove("hidden");

  const anchor = anchorEl.getBoundingClientRect();
  const menu = menuEl.getBoundingClientRect();
  const margin = 8;

  let left = anchor.left;
  let top = anchor.bottom + 4;

  if (left + menu.width + margin > window.innerWidth) {
    left = window.innerWidth - menu.width - margin;
  }
  if (top + menu.height + margin > window.innerHeight) {
    top = anchor.top - menu.height - 4;
  }

  menuEl.style.left = `${Math.max(margin, left)}px`;
  menuEl.style.top = `${Math.max(margin, top)}px`;
}

function makeMenuItem(label, subLabel, onClick, danger) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = danger ? "popup-menu-item popup-menu-item-danger" : "popup-menu-item";
  btn.textContent = label;
  if (subLabel) {
    const sub = document.createElement("span");
    sub.className = "popup-menu-item-sub";
    sub.textContent = subLabel;
    btn.appendChild(sub);
  }
  btn.addEventListener("click", onClick);
  return btn;
}

async function refreshSoftwareSection() {
  try {
    const [scan, conns] = await Promise.all([
      window.pywebview.api.scan_installed_software(debugToggle.checked),
      window.pywebview.api.get_software_connections(),
    ]);
    softwareCatalog = scan.ok ? scan.software : {};
    softwareConnections = conns.ok ? conns.connections : {};
  } catch (e) {
    softwareCatalog = {};
    softwareConnections = {};
  }
  renderConnectTiles();
  renderConnectedTiles();
}

function renderConnectTiles() {
  connectGrid.innerHTML = "";

  Object.keys(softwareCatalog).forEach(softwareId => {
    const info = softwareCatalog[softwareId];

    // Versions already connected are dropped from the picker, they
    // live in the Launch grid now. If every detected version is
    // connected, the tile still shows so another copy can be added
    // manually.
    // Match on the executable path, not the version string. Adobe
    // updates minor versions in place (26.2 becomes 26.3 in the same
    // folder), so comparing versions would make an already-connected
    // install look like a brand new one and allow a duplicate tile
    // for the same copy of the software.
    const connectedExes = Object.values(softwareConnections)
      .filter(c => c.software_id === softwareId)
      .map(c => (c.exe_path || "").toLowerCase());
    const available = info.installs.filter(
      i => !connectedExes.includes((i.exe_path || "").toLowerCase())
    );

    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "tile tile-connect " + (info.detected ? "tile-detected" : "tile-undetected");

    const iconWrap = document.createElement("span");
    iconWrap.className = "tile-icon";
    const iconUrl = SOFTWARE_ICONS[softwareId];
    if (iconUrl) {
      const img = document.createElement("img");
      img.src = iconUrl;
      img.alt = info.label;
      iconWrap.appendChild(img);
    } else if (DEMO_SOFTWARE_IDS.includes(softwareId)) {
      iconWrap.innerHTML = DEMO_ICON_SVG;
    }
    tile.appendChild(iconWrap);

    const label = document.createElement("span");
    label.className = "tile-label";
    label.textContent = info.label;
    tile.appendChild(label);

    const badge = document.createElement("span");
    badge.className = "tile-badge " + (info.detected ? "tile-badge-detected" : "tile-badge-undetected");
    badge.textContent = info.detected ? "Connect Software" : "Not Detected";
    tile.appendChild(badge);

    tile.addEventListener("click", () => {
      if (info.detected && available.length > 0) {
        openVersionMenu(softwareId, info, available, tile);
      } else {
        // Nothing detected (or everything already connected), so go
        // straight to the manual picker rather than showing a menu
        // with a single option in it.
        pickSoftwareManually(softwareId);
      }
    });

    connectGrid.appendChild(tile);
  });
}

function openVersionMenu(softwareId, info, available, anchorEl) {
  closeAllPopups();
  versionMenuTitle.textContent = `${info.label} versions`;
  versionMenuItems.innerHTML = "";

  available.forEach(install => {
    // Show the exact build number, with the release year underneath
    // for context since that is how Adobe labels the install.
    const subLabel = install.year && install.year !== install.version
      ? `${info.label} ${install.year}`
      : install.install_dir;
    versionMenuItems.appendChild(
      makeMenuItem(install.version, subLabel, async () => {
        closeAllPopups();
        await doConnect(softwareId, install);
      })
    );
  });

  const sep = document.createElement("div");
  sep.className = "popup-menu-separator";
  versionMenuItems.appendChild(sep);

  versionMenuItems.appendChild(
    makeMenuItem("Choose manually...", "Point at the program file yourself", async () => {
      closeAllPopups();
      await pickSoftwareManually(softwareId);
    })
  );

  openPopupNear(versionMenu, anchorEl);
}

async function pickSoftwareManually(softwareId) {
  const result = await window.pywebview.api.browse_for_software_exe(softwareId);
  if (!result.ok) {
    showToast(result.detail, 5000);
    return;
  }
  if (result.cancelled) return;
  await doConnect(softwareId, result.install);
}

async function doConnect(softwareId, install) {
  const result = await window.pywebview.api.connect_software(softwareId, install);
  if (!result.ok) {
    showToast(result.detail, 5000);
    return;
  }
  await refreshSoftwareSection();
  // The plugin install can partly fail while the connection itself
  // succeeds, so say which happened rather than a blanket "Connected".
  if (result.warning) {
    showToast(`Connected, but the plugin did not install: ${result.warning}`, 7000);
  } else {
    showToast(result.detail || "Connected", 5000);
    if (result.path) console.log("Plugin installed to:", result.path);
  }
}

function renderConnectedTiles() {
  // Remove any previously rendered connected tiles, the static Launch
  // tiles are left alone.
  launchGrid.querySelectorAll(".tile-connected").forEach(el => el.remove());

  Object.keys(softwareConnections).forEach(key => {
    const record = softwareConnections[key];

    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "tile tile-connected";

    const iconWrap = document.createElement("span");
    iconWrap.className = "tile-icon";
    const iconUrl = SOFTWARE_ICONS[record.software_id];
    if (iconUrl) {
      const img = document.createElement("img");
      img.src = iconUrl;
      img.alt = record.label;
      iconWrap.appendChild(img);
    } else if (DEMO_SOFTWARE_IDS.includes(record.software_id)) {
      iconWrap.innerHTML = DEMO_ICON_SVG;
    }
    tile.appendChild(iconWrap);

    const label = document.createElement("span");
    label.className = "tile-label";
    label.textContent = record.label;
    tile.appendChild(label);

    const badge = document.createElement("span");
    badge.className = "tile-badge";
    badge.textContent = record.version;
    tile.appendChild(badge);

    const chain = document.createElement("span");
    chain.className = "tile-chain " + (record.healthy ? "tile-chain-ok" : "tile-chain-problem");
    chain.innerHTML = record.healthy ? CHAIN_OK_SVG : CHAIN_BROKEN_SVG;
    chain.title = record.healthy ? "Connection healthy" : record.problem;
    chain.addEventListener("click", (e) => {
      e.stopPropagation(); // do not also launch the software
      openConnectionMenu(key, record, chain);
    });
    tile.appendChild(chain);

    tile.addEventListener("click", async () => {
      const result = await window.pywebview.api.launch_connected_software(key);
      if (!result.ok) {
        showToast(result.detail, 5000);
        await refreshSoftwareSection(); // reflect the now-known problem
      }
    });

    launchGrid.appendChild(tile);
  });
}

function openConnectionMenu(key, record, anchorEl) {
  closeAllPopups();
  connectionMenuTitle.textContent = `${record.label} ${record.version}`;
  connectionMenuItems.innerHTML = "";

  if (record.healthy) {
    connectionMenuProblem.classList.add("hidden");
  } else {
    connectionMenuProblem.textContent = record.problem;
    connectionMenuProblem.classList.remove("hidden");
  }

  // Repair is offered first when something is actually wrong, since
  // that is what the artist opened this menu to deal with.
  if (!record.healthy) {
    connectionMenuItems.appendChild(
      makeMenuItem("Repair connection", "Look for this software again", async () => {
        closeAllPopups();
        const result = await window.pywebview.api.repair_software_connection(key);
        if (result.ok) {
          showToast(result.detail || `Repaired, now pointing at ${result.version}`, 5000);
        } else {
          showToast(result.detail, 5000);
        }
        await refreshSoftwareSection();
      })
    );
  }

  // Second install location, needed on machines where After Effects
  // does not read the per-user scripts folder.
  connectionMenuItems.appendChild(
    makeMenuItem("Install plugin to the AE folder", "Use if the panel is not showing up (needs admin)", async () => {
      closeAllPopups();
      const result = await window.pywebview.api.install_plugin_to_install_folder(key);
      showToast(result.ok ? result.detail : result.detail, result.ok ? 6000 : 9000);
      await refreshSoftwareSection();
    })
  );

  connectionMenuItems.appendChild(
    makeMenuItem("Open install folder", record.install_dir, async () => {
      closeAllPopups();
      const result = await window.pywebview.api.open_connection_folder(key);
      if (!result.ok) showToast(result.detail, 5000);
    })
  );

  connectionMenuItems.appendChild(
    makeMenuItem("Reconnect to a different version", "Pick another install", async () => {
      closeAllPopups();
      await pickSoftwareManually(record.software_id);
    })
  );

  const sep = document.createElement("div");
  sep.className = "popup-menu-separator";
  connectionMenuItems.appendChild(sep);

  connectionMenuItems.appendChild(
    makeMenuItem("Remove connection", "Removes this tile", async () => {
      closeAllPopups();
      const confirmed = confirm(
        `Remove the ${record.label} ${record.version} connection?\n\nThe tile will disappear and it will show up under Connect Software again. ${record.label} itself is not touched.`
      );
      if (!confirmed) return;
      const result = await window.pywebview.api.disconnect_software(key);
      if (!result.ok) {
        showToast(result.detail, 5000);
        return;
      }
      await refreshSoftwareSection();
      if (result.warning) {
        showToast(`Connection removed, but the plugin file could not be deleted: ${result.warning}`, 7000);
      } else {
        showToast(result.detail || "Connection removed", 3500);
      }
    }, true)
  );

  openPopupNear(connectionMenu, anchorEl);
}

// ---------------------------------------------------------------
// Job drawer.
//
// Long jobs (uploads, archiving) run on a background worker in Python,
// so the screen that started them can be left immediately. This drawer
// is the one place they are all visible from, on every screen.
//
// What the progress actually measures: files being written into the
// P: drive from this machine. It does NOT track pCloud finishing its
// own sync to the cloud, the status pill in the top bar covers that.
// ---------------------------------------------------------------

const jobDrawer = document.getElementById("job-drawer");
const jobDrawerBar = document.getElementById("job-drawer-bar");
const jobDrawerBody = document.getElementById("job-drawer-body");
const jobDrawerBarStatus = document.getElementById("job-drawer-bar-status");
const jobList = document.getElementById("job-list");
const jobClearButton = document.getElementById("job-clear-button");

let jobDrawerOpen = false;
let jobPollInterval = null;
let lastActiveJobCount = 0;

const JOB_DRAWER_HEIGHT = 260;

function setJobDrawerOpen(open) {
  if (open === jobDrawerOpen) return;
  jobDrawerOpen = open;
  jobDrawer.classList.toggle("open", open);
  jobDrawerBody.classList.toggle("hidden", !open);
  // Grow the window by the drawer's height so it adds space instead
  // of squeezing the page. Falls back to sharing the space if the
  // window is already near the bottom of the screen.
  window.pywebview.api.grow_window_for_drawer(open ? JOB_DRAWER_HEIGHT : -JOB_DRAWER_HEIGHT);
}

jobDrawerBar.addEventListener("click", () => setJobDrawerOpen(!jobDrawerOpen));

jobClearButton.addEventListener("click", async () => {
  await window.pywebview.api.clear_finished_jobs();
  await refreshJobs();
});

function formatJobEta(seconds) {
  if (seconds == null || !isFinite(seconds)) return "";
  seconds = Math.round(seconds);
  if (seconds < 5) return "almost done";
  if (seconds < 60) return `~${seconds}s left`;
  const m = Math.floor(seconds / 60);
  return `~${m}m ${seconds % 60}s left`;
}

function renderJobs(jobs) {
  jobList.innerHTML = "";

  if (jobs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "job-list-empty";
    empty.textContent = "No jobs yet. Uploads and archive runs show up here.";
    jobList.appendChild(empty);
    return;
  }

  // Newest first, an artist cares most about what they just started.
  jobs.slice().reverse().forEach(job => {
    const item = document.createElement("div");
    item.className = "job-item";

    const head = document.createElement("div");
    head.className = "job-item-head";

    const type = document.createElement("span");
    type.className = "job-item-type";
    type.textContent = job.type;
    head.appendChild(type);

    const label = document.createElement("span");
    label.className = "job-item-label";
    label.textContent = job.label;
    head.appendChild(label);

    const status = document.createElement("span");
    status.className = `job-item-status job-status-${job.status}`;
    status.textContent = job.status;
    head.appendChild(status);

    item.appendChild(head);

    const track = document.createElement("div");
    track.className = "job-item-track";
    const bar = document.createElement("div");
    bar.className = "job-item-bar";
    if (job.status === "done") bar.classList.add("job-bar-done");
    if (job.status === "failed") bar.classList.add("job-bar-failed");
    if (job.status === "cancelled") bar.classList.add("job-bar-cancelled");
    bar.style.width = `${job.status === "done" ? 100 : job.percent}%`;
    track.appendChild(bar);
    item.appendChild(track);

    const meta = document.createElement("div");
    meta.className = "job-item-meta";

    const left = document.createElement("span");
    left.textContent = job.current_item || `${job.percent}%`;
    meta.appendChild(left);

    const right = document.createElement("span");
    right.className = "job-item-meta-right";
    if (job.status === "running") {
      right.textContent = formatJobEta(job.eta_seconds);
    } else if (job.status === "done") {
      right.textContent = `finished in ${job.elapsed_seconds}s`;
    }
    meta.appendChild(right);

    if (job.status === "running" || job.status === "queued") {
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "job-item-cancel";
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", async () => {
        cancel.disabled = true;
        await window.pywebview.api.cancel_job(job.id);
        await refreshJobs();
      });
      meta.appendChild(cancel);
    }

    item.appendChild(meta);

    if (job.lines.length) {
      const lines = document.createElement("div");
      lines.className = "job-item-lines";
      job.lines.forEach(line => {
        const el = document.createElement("div");
        el.className = `job-line-${line.kind}`;
        el.textContent = line.text;
        lines.appendChild(el);
      });
      item.appendChild(lines);
    }

    jobList.appendChild(item);
  });
}

async function refreshJobs() {
  try {
    const result = await window.pywebview.api.get_jobs();
    if (!result.ok) return;

    renderJobs(result.jobs);

    const active = result.active_count;
    const running = result.jobs.find(j => j.status === "running");
    if (active > 0 && running) {
      jobDrawerBarStatus.textContent = `${running.type} ${running.percent}%` + (active > 1 ? ` (+${active - 1} queued)` : "");
    } else {
      const failed = result.jobs.filter(j => j.status === "failed").length;
      jobDrawerBarStatus.textContent = failed
        ? `${failed} failed`
        : (result.jobs.length ? "All jobs finished" : "");
    }

    // Poll faster while something is actually running, and stop
    // entirely once everything is finished.
    if (active > 0 && !jobPollInterval) {
      jobPollInterval = setInterval(refreshJobs, 700);
    } else if (active === 0 && jobPollInterval) {
      clearInterval(jobPollInterval);
      jobPollInterval = null;
    }

    lastActiveJobCount = active;
  } catch (e) {
    // Nothing useful to show if the API is not ready yet.
  }
}

// Pops the drawer open on its own the first time a job is submitted,
// so an artist sees where their work went without hunting for it.
async function submitJobAndShow(submitPromise) {
  const result = await submitPromise;
  if (!result.ok) {
    showToast(result.detail, 5000);
    return false;
  }
  setJobDrawerOpen(true);
  await refreshJobs();
  return true;
}
