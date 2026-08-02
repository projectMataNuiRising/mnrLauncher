:root {
  --bg: #1a1b1e;
  --panel: #232428;
  --panel-alt: #2a2b30;
  --text: #e7e8ea;
  --muted: #8b8d93;
  --border: #35363b;
  --accent: #5b9bd5;
  --accent-soft: #22344a;
  --green: #4caf7d;
  --green-soft: #1d2f26;
  --yellow: #d0a545;
  --yellow-soft: #332c1a;
  --red: #d0666a;
  --red-soft: #331f20;
  --radius: 6px;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  background: var(--bg);
  color: var(--text);
  height: 100vh;
  overflow: hidden;
}

.hidden { display: none !important; }

.icon {
  width: 16px;
  height: 16px;
  display: inline-block;
  vertical-align: -3px;
  flex-shrink: 0;
}

.icon svg { width: 100%; height: 100%; }

/* ---------------- Top bar ---------------- */

.topbar {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.home-button {
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 6px;
  border-radius: var(--radius);
}

.home-button .icon { width: 18px; height: 18px; }

.home-button:hover {
  background: var(--panel-alt);
  color: var(--text);
}

.app-name {
  font-weight: 600;
  font-size: 15px;
  color: var(--text);
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: var(--radius);
  font-weight: 500;
  font-size: 13px;
  border: 1px solid var(--border);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.status-unknown { background: var(--panel-alt); color: var(--muted); border-color: var(--border); }
.status-unknown .status-dot { background: var(--muted); }

.status-ok { background: var(--green-soft); color: var(--green); border-color: var(--green); }
.status-ok .status-dot { background: var(--green); }

.status-busy { background: var(--yellow-soft); color: var(--yellow); border-color: var(--yellow); }
.status-busy .status-dot { background: var(--yellow); }

.status-bad { background: var(--red-soft); color: var(--red); border-color: var(--red); }
.status-bad .status-dot { background: var(--red); }

.icon-button {
  border: 1px solid var(--border);
  background: var(--panel-alt);
  color: var(--text);
  font-weight: 500;
  padding: 7px 14px;
  border-radius: var(--radius);
  cursor: pointer;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon-button:hover { background: var(--border); }
.icon-button:disabled { opacity: 0.5; cursor: default; }

/* ---------------- Screens ---------------- */

.screen {
  height: calc(100vh - 56px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

/* Boot screen */

.boot-box {
  width: 460px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 28px;
}

.boot-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 16px;
  text-align: center;
  color: var(--text);
}

.boot-lines {
  font-family: "Consolas", "Menlo", monospace;
  font-size: 13px;
  line-height: 1.9;
  min-height: 140px;
}

.boot-line-ok { color: var(--green); }
.boot-line-fail { color: var(--red); }
.boot-line-info { color: var(--muted); }

/* Error screen */

.error-box {
  width: 520px;
  background: var(--red-soft);
  border: 1px solid var(--red);
  border-radius: var(--radius);
  padding: 28px;
  text-align: center;
}

.error-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--red);
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.error-title .icon { width: 20px; height: 20px; }

.error-box a { color: var(--accent); }

/* User picker */

.user-box {
  width: 420px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 24px;
}

.user-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 12px;
}

.user-search-row {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0 10px;
  margin-bottom: 12px;
  background: var(--bg);
}

.user-search-row .icon { color: var(--muted); }

.user-search {
  flex: 1;
  padding: 10px 0;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 14px;
  outline: none;
}

.user-list {
  max-height: 320px;
  overflow-y: auto;
}

.user-item {
  padding: 10px 12px;
  border-radius: var(--radius);
  cursor: pointer;
  font-size: 14px;
  color: var(--text);
}

.user-item:hover { background: var(--panel-alt); }

/* Home screen */

#home-screen { display: flex; flex-direction: column; align-items: stretch; }

.tile-section { margin-bottom: 28px; }

.tile-section-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 10px;
}

.tile-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.tile {
  width: 190px;
  height: 150px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  transition: border-color 0.08s ease, background 0.08s ease;
  color: var(--text);
}

.tile:hover { border-color: var(--accent); background: var(--panel-alt); }

.tile-icon {
  width: 34px;
  height: 34px;
  color: var(--accent);
}

.tile-label { font-size: 14px; font-weight: 500; text-align: center; padding: 0 8px; }

.tile-disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.tile-disabled:hover { border-color: var(--border); background: var(--panel); }

.tile-badge {
  font-size: 11px;
  color: var(--muted);
}

/* Placeholder screen */

.placeholder-box {
  width: 100%;
  max-width: 600px;
  text-align: center;
}

.back-button {
  border: 1px solid var(--border);
  background: var(--panel-alt);
  color: var(--text);
  font-weight: 500;
  padding: 7px 14px;
  border-radius: var(--radius);
  cursor: pointer;
  margin-bottom: 20px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.back-button:hover { background: var(--border); }

.placeholder-text {
  font-size: 15px;
  color: var(--muted);
}

/* ---------------- Stop Motion Upload tool ---------------- */

.smanim-screen {
  align-items: stretch;
  justify-content: stretch;
  padding: 0;
}

.smanim-layout {
  display: flex;
  width: 100%;
  height: 100%;
}

.smanim-left {
  width: 280px;
  flex-shrink: 0;
  background: var(--panel);
  border-right: 1px solid var(--border);
  padding: 18px;
  overflow-y: auto;
}

.smanim-right {
  flex-grow: 1;
  padding: 18px;
  overflow-y: auto;
  background: var(--bg);
}

.field-group {
  margin-bottom: 14px;
}

.field-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
}

.field-select {
  width: 100%;
  padding: 8px 10px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  font-size: 13px;
  background: var(--bg);
  color: var(--text);
}

.field-select:disabled {
  background: var(--panel);
  color: var(--muted);
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--muted);
  margin: 16px 0;
  cursor: pointer;
}

.next-note {
  font-size: 12px;
  color: var(--muted);
  margin-top: 12px;
  line-height: 1.5;
}

/* Folder tree view */

.tree-root {
  font-size: 13px;
}

.tree-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 4px;
  border-radius: var(--radius);
  cursor: pointer;
  white-space: nowrap;
  color: var(--text);
}

.tree-row:hover {
  background: var(--panel-alt);
}

.tree-toggle {
  width: 14px;
  display: inline-block;
  color: var(--muted);
  font-size: 10px;
}

.tree-icon {
  width: 16px;
  height: 16px;
  display: inline-block;
  color: var(--muted);
}

.tree-name.tree-greyed {
  color: var(--muted);
  font-style: italic;
}

.tree-name.tree-missing {
  color: var(--muted);
  font-style: italic;
}

.tree-children {
  margin-left: 18px;
  border-left: 1px dashed var(--border);
  padding-left: 6px;
}

/* ---------------- Export / Work toggle sections ---------------- */

.section-toggle-group {
  border-top: 1px solid var(--border);
  padding-top: 14px;
  margin-top: 14px;
}

.section-toggle-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  margin-bottom: 10px;
}

.section-toggle-content.hidden { display: none; }

.field-group.small { flex: 1; }

.layer-row {
  display: flex;
  gap: 10px;
}

.layer-stack-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.small-button {
  border: 1px solid var(--border);
  background: var(--panel-alt);
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
  padding: 5px 10px;
  border-radius: var(--radius);
  cursor: pointer;
}

.small-button:hover { background: var(--border); }

.layer-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 6px;
}

.layer-box {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel-alt);
  padding: 10px;
}

.layer-box-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.layer-box-header .field-select { flex: 1; }

.icon-only-button {
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--muted);
  width: 26px;
  height: 26px;
  border-radius: var(--radius);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  flex-shrink: 0;
}

.icon-only-button:hover { color: var(--red); border-color: var(--red); }

.layer-box-body .field-group { margin-bottom: 10px; }
.layer-box-body .field-group:last-of-type { margin-bottom: 0; }

/* ---------------- Per-layer upload sections ---------------- */

.upload-section {
  border-top: 1px solid var(--border);
  margin-top: 10px;
  padding-top: 10px;
}

.upload-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.upload-section-body {
  margin-top: 8px;
}

.upload-section-body.hidden { display: none; }

.browse-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}

.file-list-empty {
  font-size: 12px;
  color: var(--muted);
  font-style: italic;
  margin-bottom: 8px;
}

.file-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  font-size: 12px;
  color: var(--green);
  font-style: italic;
  background: var(--green-soft);
  border-radius: var(--radius);
  padding: 4px 8px;
}

.file-item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-item-remove {
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 13px;
  flex-shrink: 0;
}

.file-item-remove:hover { color: var(--red); }

.handle-row {
  display: flex;
  gap: 10px;
  margin-bottom: 8px;
}

.handle-row .field-group { flex: 1; margin-bottom: 0; }

.frame-check {
  font-size: 12px;
  padding: 6px 8px;
  border-radius: var(--radius);
  margin-bottom: 8px;
}

.frame-check.ok { color: var(--green); background: var(--green-soft); }
.frame-check.warn { color: var(--yellow); background: var(--yellow-soft); }

.override-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--yellow);
  margin-bottom: 8px;
  cursor: pointer;
}

.upload-button {
  width: 100%;
  border: 1px solid var(--border);
  background: var(--panel-alt);
  color: var(--muted);
  font-weight: 600;
  font-size: 14px;
  padding: 10px;
  border-radius: var(--radius);
  cursor: not-allowed;
  margin-top: 16px;
}

.upload-button.ready {
  background: var(--green-soft);
  border-color: var(--green);
  color: var(--green);
  cursor: pointer;
}

.upload-button.ready:hover { background: var(--green); color: var(--panel); }

.upload-status {
  margin-top: 10px;
  font-family: "Consolas", "Menlo", monospace;
  font-size: 12px;
  line-height: 1.7;
}

.upload-status .boot-line-ok { color: var(--green); }
.upload-status .boot-line-fail { color: var(--red); }
