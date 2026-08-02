<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>MNR Launcher</title>
<link rel="stylesheet" href="style.css">
</head>
<body>

  <!-- Top bar, shown once boot finishes. Home button is always here so
       there is always a way back, no matter which screen is open. -->
  <div id="topbar" class="topbar hidden">
    <div class="topbar-left">
      <button id="home-button" class="home-button" title="Home">
        <span class="icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>
        </span>
      </button>
      <span class="app-name">MNR Launcher</span>
    </div>
    <div class="topbar-center">
      <div id="pcloud-status" class="status-pill status-unknown">
        <span class="status-dot"></span>
        <span class="status-text">Checking pCloud...</span>
      </div>
    </div>
    <div class="topbar-right">
      <label class="debug-toggle">
        <input type="checkbox" id="debug-toggle">
        Debug
      </label>
      <button id="refresh-button" class="icon-button" title="Fetch the latest version from GitHub">
        <span class="icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></svg>
        </span>
      </button>
      <button id="user-button" class="icon-button">
        <span class="icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>
        </span>
        <span id="user-label">Select user</span>
      </button>
    </div>
  </div>

  <!-- Debug log panel, shows what the app (and the installed shell,
       before this window even opened) has actually been doing -->
  <div id="debug-panel" class="debug-panel hidden">
    <div class="debug-panel-header">Debug Log</div>
    <div id="debug-log" class="debug-log"></div>
  </div>

  <!-- Boot screen -->
  <div id="boot-screen" class="screen">
    <div class="boot-box">
      <div class="boot-title">MNR Launcher</div>
      <div id="boot-lines" class="boot-lines"></div>
    </div>
  </div>

  <!-- pCloud missing / error screen -->
  <div id="error-screen" class="screen hidden">
    <div class="error-box">
      <div class="error-title">
        <span class="icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6"/><path d="M15 9l-6 6"/></svg>
        </span>
        pCloud Drive not detected
      </div>
      <p>This tool needs pCloud Drive set up and running to work.</p>
      <p><a id="onboarding-link" href="#" target="_blank">Open the pCloud Drive setup guide</a></p>
      <p>If you're not sure what to do, contact the technical director.</p>
    </div>
  </div>

  <!-- User picker screen -->
  <div id="user-screen" class="screen hidden">
    <div class="user-box">
      <div class="user-title">Who are you?</div>
      <div class="user-search-row">
        <span class="icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        </span>
        <input id="user-search" class="user-search" type="text" placeholder="Search your name...">
      </div>
      <div id="user-list" class="user-list"></div>
    </div>
  </div>

  <!-- Home screen -->
  <div id="home-screen" class="screen hidden">
    <div class="tile-section">
      <div class="tile-section-label">Upload</div>
      <div class="tile-grid">
        <button class="tile" data-tool="smanim">
          <span class="tile-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/></svg>
          </span>
          <span class="tile-label">Stop Motion Upload</span>
        </button>
      </div>
    </div>
    <div class="tile-section">
      <div class="tile-section-label">Launch</div>
      <div class="tile-grid">
        <button class="tile tile-disabled" data-tool="blender">
          <span class="tile-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8l2-4h3l-2 4"/><path d="M9 8l2-4h3l-2 4"/><path d="M14 8l2-4h3l-2 4"/><rect x="3" y="8" width="18" height="12" rx="1"/></svg>
          </span>
          <span class="tile-label">Blender</span>
          <span class="tile-badge">Coming soon</span>
        </button>
      </div>
    </div>
  </div>

  <!-- Placeholder page for a tool that isn't built yet -->
  <div id="placeholder-screen" class="screen hidden">
    <div class="placeholder-box">
      <button id="placeholder-back" class="back-button">
        <span class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M11 18l-6-6 6-6"/></svg></span>
        Home
      </button>
      <div id="placeholder-text" class="placeholder-text"></div>
    </div>
  </div>

  <!-- Stop Motion Upload tool, Stage 2a: nav cascade + read-only folder explorer -->
  <div id="smanim-screen" class="screen smanim-screen hidden">
    <div class="smanim-layout">

      <div class="smanim-left">
        <button id="smanim-back" class="back-button">
          <span class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M11 18l-6-6 6-6"/></svg></span>
          Home
        </button>

        <div class="field-group">
          <label class="field-label">Project</label>
          <select id="dd-project" class="field-select"></select>
        </div>

        <div class="field-group">
          <label class="field-label">Episode</label>
          <select id="dd-episode" class="field-select" disabled></select>
        </div>

        <div class="field-group">
          <label class="field-label">Sequence</label>
          <select id="dd-sequence" class="field-select" disabled></select>
        </div>

        <div class="field-group">
          <label class="field-label">Shot</label>
          <select id="dd-shot" class="field-select" disabled></select>
        </div>

        <label class="checkbox-row">
          <input type="checkbox" id="show-all-tasks">
          Show all tasks (greyed out)
        </label>

        <div id="smanim-note" class="next-note">
          Pick Project, Episode, Sequence, and Shot to continue.
        </div>

        <div class="section-toggle-group">
          <label class="section-toggle-header">
            <input type="checkbox" id="export-enabled" checked>
            <span>Export</span>
          </label>
          <div id="export-content" class="section-toggle-content">
            <div class="field-group">
              <label class="field-label">Type</label>
              <select id="export-type" class="field-select">
                <option value="publish">publish</option>
                <option value="preview">preview</option>
                <option value="temp">temp</option>
              </select>
            </div>

            <div id="export-publish-content">
              <div class="layer-stack-header">
                <span class="field-label" style="margin:0;">Layers</span>
                <button id="add-layer-button" class="small-button" type="button">+ Add Layer</button>
              </div>
              <div id="layer-stack" class="layer-stack"></div>
            </div>

            <div id="export-preview-content" class="hidden">
              <div class="next-note">Preview upload (simplified, no strict validation) coming in the next slice.</div>
            </div>

            <div id="export-temp-content" class="hidden">
              <div class="next-note">Temp dump upload coming in the next slice.</div>
            </div>
          </div>
        </div>

        <div class="section-toggle-group">
          <label class="section-toggle-header">
            <input type="checkbox" id="work-enabled">
            <span>Work</span>
          </label>
          <div id="work-content" class="section-toggle-content hidden">
            <div class="next-note">Work folder upload coming in the next slice.</div>
          </div>
        </div>

        <button id="upload-button" class="upload-button" type="button" disabled>Upload</button>
        <div id="upload-status" class="upload-status"></div>
      </div>

      <div class="smanim-right">
        <div id="tree-root" class="tree-root"></div>
      </div>

    </div>
  </div>

  <script src="app.js"></script>
</body>
</html>
