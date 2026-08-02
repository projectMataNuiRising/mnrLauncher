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
const versionBadge = document.getElementById("version-badge");

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
  onboardingLink.href = ONBOARDING_URL;

  window.pywebview.api.get_app_info().then(info => {
    versionBadge.textContent = `v${info.shell_version}`;
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
  tile.addEventListener("click", () => {
    if (tile.classList.contains("tile-disabled")) return;
    const tool = tile.dataset.tool;
    if (tool === "smanim") {
      showScreen("smanim");
      initSmanimScreen();
    } else if (tool === "external" && tile.dataset.url) {
      window.pywebview.api.open_url(tile.dataset.url);
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
  } else if (debugPollInterval) {
    clearInterval(debugPollInterval);
    debugPollInterval = null;
  }
});

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
    mp4: { enabled: true, path: null },
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

  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("drag-over");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("drag-over");
    const files = Array.from(e.dataTransfer.files || []);
    const paths = files.map(f => f.pywebviewFullPath).filter(Boolean);
    if (paths.length) {
      onFiles(paths);
    } else if (files.length) {
      sub.textContent = "Drag and drop isn't available in this build yet, click here to browse instead.";
    }
  });

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

  for (const layer of layers.filter(l => l.name && l.number && l.variant && l.version)) {
    const baseName = buildBaseName(layer);
    addUploadLine(`Uploading ${baseName}...`, "info");

    const result = await window.pywebview.api.upload_layer_publish({
      shot_parts: shotParts,
      base_name: baseName,
      mp4: { enabled: layer.mp4.enabled, path: layer.mp4.path },
      raw: { enabled: layer.raw.enabled, paths: layer.raw.paths, handle_front: sharedFrameSettings.handleFront },
      jpeg: { enabled: layer.jpeg.enabled, paths: layer.jpeg.paths, handle_front: sharedFrameSettings.handleFront },
      production_data: { enabled: layer.productionData.enabled, paths: layer.productionData.paths },
    });

    if (!result.ok) {
      addUploadLine(`[FAIL] ${baseName}: ${result.detail}`, "fail");
      continue;
    }
    Object.entries(result.results).forEach(([section, sectionResult]) => {
      if (sectionResult.ok) {
        addUploadLine(`[OK] ${section}: ${sectionResult.detail}`, "ok");
      } else {
        addUploadLine(`[FAIL] ${section}: ${sectionResult.detail}`, "fail");
      }
    });
  }

  refreshUploadButtonState();
});

function addUploadLine(text, kind) {
  const line = document.createElement("div");
  line.textContent = text;
  line.className = kind === "ok" ? "boot-line-ok" : kind === "fail" ? "boot-line-fail" : "boot-line-info";
  uploadStatus.appendChild(line);
}
