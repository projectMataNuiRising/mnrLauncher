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
let debugPollInterval = null;
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
const uploadStatus = document.getElementById("upload-status");

// EDIT THIS LIST to add or remove the standard layer name choices
// shown in each layer box's dropdown.
const LAYER_NAME_OPTIONS = [
  "antroz", "chirox", "mutran", "vamprah", "badGuy", "goodGuy", "gavla",
  "kaiora", "kirop", "photok", "pirit", "radiak", "solek", "tanma",
  "vican", "ignika", "gali", "kopaka", "lewa", "onua", "pohatu", "tahu",
];
const CUSTOM_OPTION_VALUE = "__custom__";

let layerIdCounter = 0;
const layers = []; // {id, name, number, variant, version}

const ONBOARDING_URL = "https://docs.projectmatanuirising.com/onboarding/3-pcloud-drive-app";

let allUsers = [];
let currentUser = null;
let showAllTasksChecked = false;

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

async function refreshTree() {
  treeRoot.innerHTML = "";
  const autoPath = currentAutoPath();
  await buildLevel(treeRoot, [], autoPath);
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
// where the smAnim-only task filter applies.
async function buildLevel(container, pathParts, autoPath) {
  const applyTaskFilter = autoPath.length === 5 && pathParts.length === 5;

  const result = await window.pywebview.api.list_dir_entries(pathParts, false);
  if (!result.ok) {
    const msg = document.createElement("div");
    msg.className = "tree-name tree-missing";
    msg.textContent = pathParts.length === 0 ? "(could not read 01-projects)" : "(does not exist yet)";
    container.appendChild(msg);
    return;
  }

  let items = result.items;
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

  for (const item of items) {
    const nextParts = pathParts.concat(item.name);
    const depth = pathParts.length;
    const { row, toggle, label } = makeRow(item.name, item.is_dir, depth);
    if (item._greyed) label.classList.add("tree-greyed");
    container.appendChild(row);

    let childrenContainer = null;
    let expanded = false;

    async function doExpand() {
      if (!childrenContainer) {
        childrenContainer = document.createElement("div");
        childrenContainer.className = "tree-children";
        container.appendChild(childrenContainer);
      }
      expanded = !expanded;
      toggle.textContent = expanded ? "▼" : "▶";
      childrenContainer.style.display = expanded ? "block" : "none";
      if (expanded && childrenContainer.childElementCount === 0) {
        await buildLevel(childrenContainer, nextParts, autoPath);
      }
    }

    row.addEventListener("click", () => {
      if (item.is_dir) doExpand();
    });
    row.addEventListener("dblclick", async () => {
      const res = await window.pywebview.api.open_path(nextParts);
      if (!res.ok) console.error("open_path failed", res.detail);
    });

    const shouldAutoExpand =
      (item.is_dir && pathParts.length < autoPath.length && item.name === autoPath[pathParts.length]) ||
      (applyTaskFilter && item.name === "smAnim");

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
    const wasScrolledToBottom = debugLogEl.scrollHeight - debugLogEl.scrollTop <= debugLogEl.clientHeight + 20;
    debugLogEl.textContent = result.lines.join("\n");
    if (wasScrolledToBottom) debugLogEl.scrollTop = debugLogEl.scrollHeight;
  } catch (e) {
    debugLogEl.textContent = "Could not reach the debug log: " + e;
  }
}

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

addLayerButton.addEventListener("click", () => {
  const id = "layer-" + (++layerIdCounter);
  layers.push({
    id, name: "", number: "01", variant: "main", version: "",
    mp4: { enabled: true, path: null },
    raw: { enabled: true, paths: [], handleFront: 0, handleBack: 0, expectedFrames: null, override: false },
    jpeg: { enabled: true, paths: [], handleFront: 0, handleBack: 0, expectedFrames: null, override: false },
    productionData: { enabled: false, paths: [] },
  });
  renderLayerStack();
});

function removeLayer(id) {
  const idx = layers.findIndex(l => l.id === id);
  if (idx !== -1) layers.splice(idx, 1);
  renderLayerStack();
}

function fillLayerNameSelect(select, currentValue) {
  select.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a character...";
  select.appendChild(placeholder);

  LAYER_NAME_OPTIONS.forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });

  if (currentValue && !LAYER_NAME_OPTIONS.includes(currentValue)) {
    const customOpt = document.createElement("option");
    customOpt.value = currentValue;
    customOpt.textContent = currentValue + " (custom)";
    select.appendChild(customOpt);
  }

  const addCustomOpt = document.createElement("option");
  addCustomOpt.value = CUSTOM_OPTION_VALUE;
  addCustomOpt.textContent = "+ Add custom name";
  select.appendChild(addCustomOpt);

  select.value = currentValue || "";
}

// Looks at what already exists in export/publish/media for this exact
// layer name + number + variant, and suggests the next free version
// number instead of blindly defaulting to v001 every time.
async function refreshLayerVersionOptions(layer, versionSelect) {
  const shotPath = currentAutoPath(); // [project, "03-shot", episode, sequence, shot]
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

function renderLayerStack() {
  layerStackEl.innerHTML = "";

  layers.forEach(layer => {
    const box = document.createElement("div");
    box.className = "layer-box";

    // ---- header: character name + remove button ----
    const header = document.createElement("div");
    header.className = "layer-box-header";

    const nameSelect = document.createElement("select");
    nameSelect.className = "field-select";
    fillLayerNameSelect(nameSelect, layer.name);
    header.appendChild(nameSelect);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "icon-only-button";
    removeBtn.textContent = "\u00d7";
    removeBtn.title = "Remove layer";
    removeBtn.addEventListener("click", () => removeLayer(layer.id));
    header.appendChild(removeBtn);

    box.appendChild(header);

    // ---- body: number, variant, version ----
    const body = document.createElement("div");
    body.className = "layer-box-body";

    const row = document.createElement("div");
    row.className = "layer-row";

    const numberGroup = document.createElement("div");
    numberGroup.className = "field-group small";
    const numberLabel = document.createElement("label");
    numberLabel.className = "field-label";
    numberLabel.textContent = "Number";
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
    variantLabel.textContent = "Variant";
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

    const note = document.createElement("div");
    note.className = "next-note";
    note.textContent = 'Keep number 01 and variant "main" for most cases.';
    body.appendChild(note);

    box.appendChild(body);

    // ---- upload sections: mp4, raw sequence, jpeg sequence, productionData ----
    body.appendChild(buildSingleFileSection(layer, "mp4", "MP4 / MOV Preview"));
    body.appendChild(buildSequenceSection(layer, "raw", "Raw Image Sequence"));
    body.appendChild(buildSequenceSection(layer, "jpeg", "JPEG Image Sequence"));
    body.appendChild(buildMultiFileSection(layer, "productionData", "Production Data (optional)"));

    layerStackEl.appendChild(box);

    // ---- wire up interactions ----
    numberInput.addEventListener("change", () => {
      const padded = numberInput.value.replace(/\D/g, "").padStart(2, "0").slice(-2) || "01";
      layer.number = padded;
      numberInput.value = padded;
      refreshLayerVersionOptions(layer, versionSelect);
    });

    variantInput.addEventListener("change", () => {
      layer.variant = variantInput.value.trim() || "main";
      variantInput.value = layer.variant;
      refreshLayerVersionOptions(layer, versionSelect);
    });

    nameSelect.addEventListener("change", async () => {
      if (nameSelect.value === CUSTOM_OPTION_VALUE) {
        const customName = prompt("Custom layer name:");
        if (!customName) {
          nameSelect.value = layer.name || "";
          return;
        }
        layer.name = customName.trim();
        fillLayerNameSelect(nameSelect, layer.name);
      } else {
        layer.name = nameSelect.value;
      }
      numberInput.disabled = !layer.name;
      variantInput.disabled = !layer.name;
      versionSelect.disabled = !layer.name;
      if (layer.name) await refreshLayerVersionOptions(layer, versionSelect);
      refreshUploadButtonState();
    });

    if (layer.name) {
      refreshLayerVersionOptions(layer, versionSelect);
    }
  });

  refreshUploadButtonState();
}

// ---------------------------------------------------------------
// Per-layer upload section builders. All three share the same basic
// shape (checkbox to enable, a Browse button, a list of chosen files
// shown in pastel green italic like a preview of what will upload),
// raw/jpeg add handle inputs and frame-count validation on top.
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

function buildSingleFileSection(layer, key, title) {
  const state = layer[key];
  const { wrap, sectionBody } = buildSectionShell(title, state.enabled, checked => {
    state.enabled = checked;
  });

  const browseRow = document.createElement("div");
  browseRow.className = "browse-row";
  const browseBtn = document.createElement("button");
  browseBtn.type = "button";
  browseBtn.className = "small-button";
  browseBtn.textContent = "Browse...";
  browseRow.appendChild(browseBtn);
  sectionBody.appendChild(browseRow);

  const listEl = document.createElement("div");
  listEl.className = "file-list";
  sectionBody.appendChild(listEl);

  function refresh() {
    renderFileList(listEl, state.path ? [state.path] : [], () => {
      state.path = null;
      refresh();
      refreshUploadButtonState();
    }, i => `${layer.name || "layer"}${layer.number}-${layer.variant}_${layer.version}${state.path ? state.path.match(/\.[^.]+$/)?.[0] || "" : ""}`);
  }

  browseBtn.addEventListener("click", async () => {
    const result = await window.pywebview.api.browse_files(false);
    if (result.ok && result.paths.length) {
      state.path = result.paths[0];
      refresh();
      refreshUploadButtonState();
    }
  });

  refresh();
  return wrap;
}

function buildMultiFileSection(layer, key, title) {
  const state = layer[key];
  const { wrap, sectionBody } = buildSectionShell(title, state.enabled, checked => {
    state.enabled = checked;
  });

  const browseRow = document.createElement("div");
  browseRow.className = "browse-row";
  const browseBtn = document.createElement("button");
  browseBtn.type = "button";
  browseBtn.className = "small-button";
  browseBtn.textContent = "Browse...";
  browseRow.appendChild(browseBtn);
  sectionBody.appendChild(browseRow);

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

  browseBtn.addEventListener("click", async () => {
    const result = await window.pywebview.api.browse_files(true);
    if (result.ok && result.paths.length) {
      state.paths = state.paths.concat(result.paths);
      refresh();
      refreshUploadButtonState();
    }
  });

  refresh();
  return wrap;
}

function buildSequenceSection(layer, key, title) {
  const state = layer[key];
  const { wrap, sectionBody } = buildSectionShell(title, state.enabled, checked => {
    state.enabled = checked;
  });

  const handleRow = document.createElement("div");
  handleRow.className = "handle-row";

  const frontGroup = document.createElement("div");
  frontGroup.className = "field-group";
  const frontLabel = document.createElement("label");
  frontLabel.className = "field-label";
  frontLabel.textContent = "Handle (front/back)";
  const handleInputsRow = document.createElement("div");
  handleInputsRow.className = "layer-row";
  const frontInput = document.createElement("input");
  frontInput.type = "text";
  frontInput.className = "field-select";
  frontInput.value = state.handleFront;
  frontInput.placeholder = "front";
  const backInput = document.createElement("input");
  backInput.type = "text";
  backInput.className = "field-select";
  backInput.value = state.handleBack;
  backInput.placeholder = "back";
  handleInputsRow.appendChild(frontInput);
  handleInputsRow.appendChild(backInput);
  frontGroup.appendChild(frontLabel);
  frontGroup.appendChild(handleInputsRow);
  handleRow.appendChild(frontGroup);
  sectionBody.appendChild(handleRow);

  const expectedGroup = document.createElement("div");
  expectedGroup.className = "field-group";
  const expectedLabel = document.createElement("label");
  expectedLabel.className = "field-label";
  expectedLabel.textContent = "Expected frames (from Kitsu, first number)";
  const expectedInput = document.createElement("input");
  expectedInput.type = "text";
  expectedInput.className = "field-select";
  expectedInput.value = state.expectedFrames || "";
  expectedInput.placeholder = "e.g. 45";
  expectedGroup.appendChild(expectedLabel);
  expectedGroup.appendChild(expectedInput);
  sectionBody.appendChild(expectedGroup);

  const browseRow = document.createElement("div");
  browseRow.className = "browse-row";
  const browseBtn = document.createElement("button");
  browseBtn.type = "button";
  browseBtn.className = "small-button";
  browseBtn.textContent = "Browse frames...";
  browseRow.appendChild(browseBtn);
  sectionBody.appendChild(browseRow);

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

  function updateFrameCheck() {
    const expected = parseInt(expectedInput.value, 10);
    const front = parseInt(frontInput.value, 10) || 0;
    const back = parseInt(backInput.value, 10) || 0;
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
      const start = 1001 - (parseInt(frontInput.value, 10) || 0);
      return `...${key}.${String(start + i).padStart(4, "0")}`;
    });
    updateFrameCheck();
    refreshUploadButtonState();
  }

  frontInput.addEventListener("change", () => {
    state.handleFront = parseInt(frontInput.value, 10) || 0;
    refresh();
  });
  backInput.addEventListener("change", () => {
    state.handleBack = parseInt(backInput.value, 10) || 0;
    refresh();
  });
  expectedInput.addEventListener("change", () => {
    state.expectedFrames = parseInt(expectedInput.value, 10) || null;
    updateFrameCheck();
  });
  overrideBox.addEventListener("change", () => {
    state.override = overrideBox.checked;
    refreshUploadButtonState();
  });

  browseBtn.addEventListener("click", async () => {
    const result = await window.pywebview.api.browse_files(true);
    if (result.ok && result.paths.length) {
      state.paths = state.paths.concat(result.paths);
      refresh();
    }
  });

  refresh();
  return wrap;
}

// ---------------------------------------------------------------
// Upload button: enabled once at least one layer is named and every
// enabled sequence section either matches its expected frame count
// or has been explicitly overridden.
// ---------------------------------------------------------------

function refreshUploadButtonState() {
  const shotChosen = currentAutoPath().length === 5;
  const namedLayers = layers.filter(l => l.name);

  let blocked = false;
  namedLayers.forEach(layer => {
    ["raw", "jpeg"].forEach(key => {
      const section = layer[key];
      if (!section.enabled || section.paths.length === 0) return;
      const expected = section.expectedFrames;
      if (!expected) return;
      const totalExpected = expected + section.handleFront + section.handleBack;
      if (section.paths.length !== totalExpected && !section.override) blocked = true;
    });
  });

  const ready = shotChosen && namedLayers.length > 0 && !blocked;
  uploadButton.disabled = !ready;
  uploadButton.classList.toggle("ready", ready);
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

  for (const layer of layers.filter(l => l.name)) {
    const baseName = buildBaseName(layer);
    addUploadLine(`Uploading ${baseName}...`, "info");

    const result = await window.pywebview.api.upload_layer_publish({
      shot_parts: shotParts,
      base_name: baseName,
      mp4: { enabled: layer.mp4.enabled, path: layer.mp4.path },
      raw: { enabled: layer.raw.enabled, paths: layer.raw.paths, handle_front: layer.raw.handleFront },
      jpeg: { enabled: layer.jpeg.enabled, paths: layer.jpeg.paths, handle_front: layer.jpeg.handleFront },
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
