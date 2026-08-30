/* Corridor workspace markup, ported from the original index.html. */
export const CORRIDOR_MARKUP = `<div class="app">

<!-- SETTINGS PANEL -->
<div class="api-key-bar" id="apiKeyBar" hidden>
  <div class="api-key-inner settings-inner">
    <div class="settings-field">
      <label for="apiKeyInput">Anthropic API key</label>
      <input type="password" class="api-key-input" id="apiKeyInput" placeholder="sk-ant-..." autocomplete="off">
    </div>
    <button class="api-key-save" id="apiKeySave">Save</button>
  </div>
</div>

<!-- NAV -->
<nav class="nav">
  <div class="container nav-inner">
    <button class="nav-brand" id="navBrand" aria-label="Corridor home">
      <svg viewBox="0 0 359.33 351.39" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-miterlimit="10"><path stroke-width="0.75" d="M357.83,175.39c0,89.93-69.46,163.99-158.72,173.46-6.38.69-12.87,1.04-19.44,1.04C81.27,349.89,1.5,271.76,1.5,175.39,1.5,84.07,73.13,9.12,164.37,1.54c5.04-.43,10.15-.65,15.29-.65,98.39,0,178.17,78.13,178.17,174.5Z"/><path stroke-width="3" d="M199.11,348.85c-6.38.69-12.87,1.04-19.44,1.04-72.21,0-134.38-42.07-162.37-102.56-.23-.51-.47-1.03-.7-1.55C6.88,224.25,1.5,200.44,1.5,175.39,1.5,84.07,73.13,9.12,164.37,1.54c9.12-.76,19.75,10.35,23.46,17.52,5.18,9.99,3.93,23.01-2.13,32.36-7.74,11.94-18.87,12.74-31.03,16.72-11.57,3.78-22.93,8.02-33.93,13.26-21.57,10.29-41.87,24.11-57.2,42.61-9.96,12-17.55,25.84-22.17,40.74-4.62,14.94-6.26,30.72-5.16,46.32.13,1.79.29,3.59.48,5.38,1.1,10.34,3.12,19.88,5.94,28.68.07.22.13.44.22.65,31.34,96.58,156.26,103.07,156.26,103.07Z"/><path stroke-width="3" d="M160.22,2.54c6.38-.69,12.87-1.04,19.44-1.04,72.21,0,134.38,42.07,162.37,102.56.23.51.47,1.03.7,1.55,9.71,21.53,15.09,45.34,15.09,70.39,0,91.33-71.63,166.27-162.87,173.85-9.12.76-19.75-10.35-23.46-17.52-5.18-9.99-3.93-23.01,2.13-32.36,7.74-11.94,18.87-12.74,31.03-16.72,11.57-3.78,22.93-8.02,33.93-13.26,21.57-10.29,41.87-24.11,57.2-42.61,9.96-12,17.55-25.84,22.17-40.74,4.62-14.94,6.26-30.72,5.16-46.32-.13-1.79-.29-3.59-.48-5.38-1.1-10.34-3.12-19.88-5.94-28.68-.07-.22-.13-.44-.22-.65C285.14,9.04,160.22,2.54,160.22,2.54Z"/></g><g fill="currentColor"><path d="M185.71,51.42c-7.74,11.94-18.87,12.74-31.03,16.72-11.57,3.78-22.93,8.02-33.93,13.26-21.57,10.29-41.87,24.11-57.2,42.61-9.96,12-17.55,25.84-22.17,40.74-4.62,14.94-6.26,30.72-5.16,46.32.13,1.79.29,3.59.48,5.38,1.1,10.34,3.12,19.88,5.94,28.68.07.22.13.44.22.65h-26.26C6.88,224.25,1.5,200.44,1.5,175.39,1.5,84.07,73.13,9.12,164.37,1.54c9.12-.76,19.75,10.35,23.46,17.52,5.18,9.99,3.93,23.01-2.13,32.36Z"/><path d="M173.62,299.97c7.74-11.94,18.87-12.74,31.03-16.72,11.57-3.78,22.93-8.02,33.93-13.26,21.57-10.29,41.87-24.11,57.2-42.61,9.96-12,17.55-25.84,22.17-40.74,4.62-14.94,6.26-30.72,5.16-46.32-.13-1.79-.29-3.59-.48-5.38-1.1-10.34-3.12-19.88-5.94-28.68-.07-.22-.13-.44-.22-.65h26.26c9.71,21.53,15.09,45.34,15.09,70.39,0,91.33-71.63,166.27-162.87,173.85-9.12.76-19.75-10.35-23.46-17.52-5.18-9.99-3.93-23.01,2.13-32.36Z"/></g></svg>
      <span>Corridor</span>
    </button>
    <button class="sidebar-toggle" id="sidebarToggle" aria-label="Show projects">
      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <path d="M3 5h14M3 10h14M3 15h14" stroke-linecap="round"/>
      </svg>
      <span id="sidebarToggleLabel">General</span>
    </button>
    <div class="nav-links">
      <button class="nav-link" id="navHome">Home</button>
      <button class="nav-link" id="navProject">Project</button>
      <button class="nav-link" id="navSettings">Settings</button>
      <a class="nav-link" href="/intel" data-corridor-link="/intel">Ask Corridor</a>
      <a class="nav-link" href="/auth" data-corridor-link="/auth">Account</a>
    </div>
  </div>
</nav>

<div class="shell">

<!-- SIDEBAR -->
<aside class="sidebar" id="sidebar">
  <div class="sidebar-section">
    <div class="sidebar-label">Projects</div>
    <div class="project-list" id="projectList"></div>
    <div class="project-new-row">
      <input type="text" class="project-new-input" id="projectNewInput" placeholder="New project name">
      <button class="project-new-btn" id="projectNewBtn">+ New</button>
    </div>
  </div>

  <div class="sidebar-section sidebar-context">
    <div class="sidebar-label">This project</div>
    <input type="text" class="project-name-input" id="projectNameInput" placeholder="Project name">
    <div class="sidebar-actions">
      <button class="api-key-save" id="projectRenameBtn">Rename</button>
      <button class="project-delete-btn" id="projectDeleteBtn">Delete</button>
    </div>
  </div>

  <div class="sidebar-foot">
    <button class="sidebar-foot-link" id="sidebarSettings">Settings</button>
  </div>
</aside>
<div class="sidebar-overlay" id="sidebarOverlay"></div>

<main class="hero shell-main">

  <!-- ============================== HOME VIEW ============================== -->
  <section class="home-view" id="homeView">

    <!-- HERO -->
    <div class="home-hero">
      <canvas class="globe-canvas globe-home" id="globeCanvas" width="720" height="720"></canvas>

      <div class="hero-coord">
        <div>N 38.9&deg; // W 77.0&deg;</div>
        <div>FLOW &Delta;-01</div>
        <div>&sigma; 0.94</div>
      </div>
      <div class="hero-coord-right">
        <div>USITC &middot; USTR &middot; WITS</div>
        <div>PUBLIC DATA ONLY</div>
      </div>

      <div class="home-hero-content">
        <div class="hero-tagline">Tariff intelligence, delivered</div>
        <h1 class="home-title">Know what tariffs cost you. <em>And where to source instead.</em></h1>
        <p class="home-sub">Most sourcing teams cannot answer a simple question: what are we paying in duty, and could we pay less? Finding out means a customs broker or a week of spreadsheet work, and by then the rates have moved again.<br><br>Send us your sourcing book. We code every line to the US tariff schedule, price the duty, find the origins that cost less, and keep watching what threatens it. You get the analysis and the workbook behind it.</p>
        <div class="home-actions">
          <a class="btn-primary" id="requestBtn" href="/request" data-corridor-link="/request">
            Request an analysis
            <span class="btn-arrow">&rarr;</span>
          </a>
          <button class="btn-ghost" id="startProjectBtn">Open the workspace</button>
          <a class="btn-ghost" href="/intel" data-corridor-link="/intel">Ask Corridor</a>
        </div>
      </div>
    </div>

    <!-- HOW IT WORKS -->
    <div class="home-how">
      <div class="container">
        <div class="section-head">
          <div class="section-eyebrow">How it works</div>
          <h2 class="section-title">You send a spreadsheet. We do the rest.</h2>
          <p class="usecases-sub">No software to buy, no implementation, no one on your side learning a new tool.</p>
        </div>
        <div class="how-grid">
          <div class="how-step">
            <div class="how-num">01</div>
            <div class="how-title">Send the book you already keep</div>
            <div class="how-copy">A spreadsheet with a product description and a country of origin on each row. Whatever format it is in. We work out the columns.</div>
            <div class="how-when">Day one</div>
          </div>
          <div class="how-step">
            <div class="how-num">02</div>
            <div class="how-title">We code and price every line</div>
            <div class="how-copy">Each product gets an HTS code with the reasoning behind it, then the duty is computed from the tariff schedule itself. Our analysts check the ones that matter.</div>
            <div class="how-when">Two days</div>
          </div>
          <div class="how-step">
            <div class="how-num">03</div>
            <div class="how-title">You get the answer and the working</div>
            <div class="how-copy">What you pay, where you could pay less, what each move depends on, and what would change the bill. Plus the workbook, so your team can check every number.</div>
            <div class="how-when">Within the week</div>
          </div>
          <div class="how-step">
            <div class="how-num">04</div>
            <div class="how-title">We keep watching</div>
            <div class="how-copy">Preference programmes lapse and trade actions widen. We track the ones your book depends on and tell you when the bill moves, with the new number.</div>
            <div class="how-when">Ongoing</div>
          </div>
        </div>
      </div>
    </div>

    <!-- WHAT YOU LEAVE WITH -->
    <div class="home-output">
      <div class="container">
        <div class="section-head">
          <div class="section-eyebrow">What you get</div>
          <h2 class="section-title">Four answers and the working behind them.</h2>
        </div>
        <div class="output-grid">
          <div class="output-card">
            <div class="output-num">01</div>
            <div class="output-title">Every line coded</div>
            <div class="output-copy">An HTS code for each product, with the reasoning and the lines we ruled out. Wrong codes cost money going in and going out, so you can see how each one was reached.</div>
          </div>
          <div class="output-card">
            <div class="output-num">02</div>
            <div class="output-title">What you are paying</div>
            <div class="output-copy">Duty across the whole book, split by origin, supplier and programme. Including how much of it rests on a preference that could be withdrawn.</div>
          </div>
          <div class="output-card">
            <div class="output-num">03</div>
            <div class="output-title">Where to buy instead</div>
            <div class="output-copy">The same product priced from other origins, ranked by the duty it would save. Each option carries the rules of origin you would have to meet to claim it.</div>
          </div>
          <div class="output-card">
            <div class="output-num">04</div>
            <div class="output-title">What would change it</div>
            <div class="output-copy">AGOA lapsing, Section 301 widening, a tariff rise. Each one priced across your book, so the exposure is a number rather than a worry.</div>
          </div>
        </div>
      </div>
    </div>

    <!-- USE CASES -->
    <div class="home-usecases">
      <div class="container">
        <div class="section-head">
          <div class="section-eyebrow">Built for</div>
          <h2 class="section-title">Who we work with.</h2>
          <p class="usecases-sub">Tariffs move by proclamation, often with weeks of notice. These are the people who find out late.</p>
        </div>
        <div class="usecases-grid">
          <div class="usecase-card">
            <div class="usecase-tag">Sourcing</div>
            <div class="usecase-desc">You own the cost line and duty keeps moving it. You need to know where else the product could come from.</div>
          </div>
          <div class="usecase-card">
            <div class="usecase-tag">Supply chain</div>
            <div class="usecase-desc">A preference programme lapses and you have days to work out which SKUs break and what it costs.</div>
          </div>
          <div class="usecase-card">
            <div class="usecase-tag">Finance</div>
            <div class="usecase-desc">The CFO wants tariff exposure by Friday and the answer currently lives in four spreadsheets.</div>
          </div>
          <div class="usecase-card">
            <div class="usecase-tag">Trade compliance</div>
            <div class="usecase-desc">Codes drift as products change. A wrong one costs money going in and going out.</div>
          </div>
          <div class="usecase-card">
            <div class="usecase-tag">Private equity</div>
            <div class="usecase-desc">Duty sits in a target's cost base and nobody has priced what happens if it changes.</div>
          </div>
        </div>
      </div>
    </div>

    <!-- COVERAGE -->
    <div class="home-corridors">
      <div class="container">
        <div class="section-head">
          <div class="section-eyebrow">Coverage</div>
          <h2 class="section-title">Every origin. The whole US tariff schedule.</h2>
          <p class="usecases-sub">We hold the full schedule and query it directly, so a duty figure is computed rather than looked up or estimated. Buy from anywhere and we can price it.</p>
        </div>
        <div class="coverage-grid">
          <div class="coverage-stat">
            <div class="coverage-value">12,929</div>
            <div class="coverage-label">HTS lines</div>
          </div>
          <div class="coverage-stat">
            <div class="coverage-value">105</div>
            <div class="coverage-label">Origin countries</div>
          </div>
          <div class="coverage-stat">
            <div class="coverage-value">20</div>
            <div class="coverage-label">Programmes and agreements</div>
          </div>
          <div class="coverage-stat">
            <div class="coverage-value">Exact</div>
            <div class="coverage-label">No estimates, no lookups</div>
          </div>
        </div>
      </div>
    </div>

    <!-- METHOD PRINCIPLES -->
    <div class="home-method">
      <div class="container">
        <div class="method-grid">
          <div class="method-item">
            <div class="method-num">01</div>
            <div class="method-title">Every number carries its source</div>
            <div class="method-copy">A citation names the dataset, the specific table or series, the as-of date, and a link to the source. Every figure is one click from the record.</div>
          </div>
          <div class="method-item">
            <div class="method-num">02</div>
            <div class="method-title">Government first</div>
            <div class="method-copy">Primary US government and multilateral data before commentary. Tier badges tell you whether an answer stands on USITC and USTR or on reporting.</div>
          </div>
          <div class="method-item">
            <div class="method-num">03</div>
            <div class="method-title">Honest states</div>
            <div class="method-copy">Reported, Derived and Projected labels stay on every value. When public data will not support an answer, Corridor says so and names what is missing.</div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ============================== PROJECT ============================== -->
  <section class="project-view" id="projectView">
    <div class="container project-container">

      <header class="project-head">
        <div class="project-title-row">
          <h1 class="project-title" id="projectTitle">General</h1>
          <div class="project-band" id="projectBand"></div>
        </div>
        <div class="project-meta" id="projectMeta"></div>
      </header>

      <!-- MAP -->
      <section class="map-panel" id="mapPanel"></section>

      <!-- WHAT MOVED -->
      <section class="feed-panel" id="feedPanel"></section>

      <!-- THE WATCHLIST -->
      <section class="lanes-panel" id="lanesPanel"></section>

      <!-- ONE LANE, OPENED -->
      <section class="lane-detail" id="laneDetail" hidden></section>

      <!-- Everything below appears once a sheet is loaded. Before that there
           is one thing to do, and a menu is not a product. -->
      <div class="project-secondary" id="projectSecondary">
        <div class="secondary-head">
          <div class="secondary-label">Go further</div>
          <div class="secondary-note">Ask a question against this book, or run a written assessment.</div>
        </div>
      <!-- DECISION READOUT -->
      <section class="decision-readout" id="decisionReadout">
        <div class="decision-head">
          <div class="decision-label">Decision</div>
          <button class="decision-refresh" id="decisionRefresh" type="button">Write the conditions</button>
        </div>
        <div class="decision-band" id="decisionBand">Not yet assessed</div>
        <div class="decision-basis" id="decisionBasis"></div>
        <div class="decision-rationale" id="decisionRationale"></div>
        <ul class="decision-conditions" id="decisionConditions"></ul>
      </section>

      <!-- THE BOX -->
      <form class="askbox" id="askForm" autocomplete="off">
        <div class="askbox-files" id="askBoxFiles"></div>
        <textarea class="askbox-input" id="askInput" rows="3"
          placeholder="What are you deciding?" aria-label="Ask about this project"></textarea>
        <div class="askbox-foot">
          <input type="file" id="fileInput" multiple accept=".txt,.csv,.json,.md,.xlsx,.xls,.pdf,.pptx" hidden>
          <button class="askbox-attach" id="attachBtn" type="button" title="Attach documents">
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <path d="M13 7l-5.5 5.5a2.1 2.1 0 003 3L16 10a4 4 0 00-5.7-5.6L4.8 9.9" stroke-linecap="round"/>
            </svg>
            <span id="attachCount"></span>
          </button>
          <div class="askbox-foot-right">
            <select class="askbox-depth" id="verbositySelect" aria-label="Answer depth">
              <option value="concise">Brief</option>
              <option value="standard" selected>Standard</option>
              <option value="deep">Deep</option>
            </select>
            <button class="askbox-send" id="askSubmit" type="submit" title="Run">
              <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <path d="M4 10h11M10.5 5.5L15 10l-4.5 4.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      </form>
      <div class="askbox-hint" id="askBoxHint"></div>

      <!-- RUN ROW -->
      <div class="run-row">
        <span class="run-row-label">Run</span>
        <div class="run-row-items" id="runRow"></div>
      </div>

      <!-- RESULTS -->
      <div class="results" id="resultsList"></div>

      <!-- DOWNLOAD -->
      <div class="project-foot" id="projectFoot">
        <button class="btn-primary" id="downloadPdfBtn">Download report</button>
        <button class="btn-ghost" id="downloadXlsBtn">Workbook</button>
      </div>
      </div>

      <!-- SETUP -->
      <details class="project-setup" id="projectSetup">
        <summary>Project setup</summary>
        <div class="setup-body">
          <div class="setup-grid">
            <div class="settings-field">
              <label for="projectRoleInput">Your role</label>
              <textarea class="settings-textarea" id="projectRoleInput" rows="2" placeholder="e.g. Sourcing director at a mid-market apparel brand"></textarea>
            </div>
            <div class="settings-field">
              <label for="projectGoalInput">The decision</label>
              <textarea class="settings-textarea" id="projectGoalInput" rows="2" placeholder="e.g. Whether to move t-shirt sourcing from Vietnam to Kenya"></textarea>
            </div>
            <div class="settings-field">
              <label for="projectIndustryInput">Industry</label>
              <input type="text" class="settings-input" id="projectIndustryInput" placeholder="e.g. Apparel manufacturing">
            </div>
            <div class="settings-field">
              <label for="projectGeographyInput">Markets</label>
              <input type="text" class="settings-input" id="projectGeographyInput" placeholder="e.g. Vietnam, China, Mexico">
            </div>
          </div>
          <button class="api-key-save" id="projectContextSave">Save</button>

          <div class="setup-section">
            <div class="setup-label">Documents <span class="setup-count" id="docAllowance"></span></div>
            <input type="file" id="projectFileInput" multiple accept=".txt,.csv,.json,.md,.xlsx,.xls,.pdf,.pptx" hidden>
            <div class="file-upload-list" id="projectDocsList"></div>
          </div>

          <div class="setup-section">
            <div class="setup-label">What Corridor has established <span class="setup-count" id="memoryCount"></span></div>
            <div class="memory-list" id="memoryList"></div>
            <details class="memory-superseded" id="memorySuperseded" style="display:none">
              <summary><span id="memorySupersededCount">0</span> superseded</summary>
              <div class="memory-list" id="memorySupersededList"></div>
            </details>
          </div>
        </div>
      </details>

      <!-- The report document. Hidden on screen, printed on demand. -->
      <div class="report-doc" id="reportDoc"></div>
    </div>

    <!-- ============ MOVABLE DETAIL BLOCKS ============
         One of each exists. Expanding a result moves the right one into that
         card, so every renderer keeps writing to the ids it already knows and
         nothing had to be rebuilt per card. -->

    <div class="detail-block" id="answerDetail" hidden>
      <div class="answer-status" id="answerStatus">
        <div class="status-title"><span class="status-dot"></span> Working</div>
        <div class="status-steps" id="statusSteps">
          <div class="status-step" data-step="0"><span class="check"></span>Searching primary government sources</div>
          <div class="status-step" data-step="1"><span class="check"></span>Reading the latest figures</div>
          <div class="status-step" data-step="2"><span class="check"></span>Checking preference programmes and rules of origin</div>
          <div class="status-step" data-step="3"><span class="check"></span>Assembling the sourced answer</div>
        </div>
      </div>

      <article class="answer-brief" id="answerBrief">
        <div class="answer-question" style="display:none">
          Question <span class="answer-corridor-tag" id="answerCorridorTag"></span>
        </div>
        <div class="answer-question-text" id="answerQuestionText" style="display:none"></div>

        <h2 class="answer-headline" id="answerHeadline"></h2>
        <aside class="answer-rail" id="keyNumbers" style="display:none"></aside>
        <div class="answer-body" id="answerBody"></div>

        <section class="answer-section mechanism" id="mechanism" style="display:none">
          <div class="section-label">Mechanism</div>
          <div class="mechanism-text" id="mechanismText"></div>
        </section>

        <section class="answer-section drivers" id="drivers" style="display:none">
          <div class="section-label">What is moving it</div>
          <div class="drivers-list" id="driversList"></div>
        </section>

        <section class="answer-section answer-table" id="answerTable" style="display:none">
          <div class="section-label">The data</div>
          <div id="answerTableContent"></div>
        </section>

        <section class="answer-section risks" id="risks" style="display:none">
          <div class="section-label">What would change this</div>
          <div class="risks-list" id="risksList"></div>
        </section>

        <section class="answer-section answer-levers" id="levers" style="display:none">
          <div class="section-label">Levers</div>
          <div id="leversContent"></div>
        </section>

        <section class="answer-section answer-scenarios" id="scenarios" style="display:none">
          <div class="section-label">Scenarios</div>
          <div id="scenariosContent"></div>
        </section>

        <div class="breakeven-callout" id="breakeven" style="display:none">
          <div class="breakeven-label">Decision threshold</div>
          <div class="breakeven-text" id="breakevenText"></div>
        </div>

        <details class="expander answer-analysis" id="answerAnalysis" style="display:none">
          <summary>Analysis</summary>
          <div class="expander-content" id="analysisContent"></div>
        </details>

        <div class="answer-readout" id="answerReadout" style="display:none">
          <div class="readout-label">Readout</div>
          <div class="readout-text" id="readoutText"></div>
        </div>

        <details class="expander" id="answerExpander" style="display:none">
          <summary>How this was worked out</summary>
          <div class="expander-content" id="expanderContent"></div>
        </details>

        <div class="confidence-note" id="confidenceNote" style="display:none">
          <div class="note-label">Confidence note</div>
          <div id="confidenceText"></div>
        </div>

        <div class="cannot-answer" id="cannotAnswer" style="display:none">
          <div class="ca-label">Cannot answer</div>
          <div id="cannotAnswerText"></div>
        </div>

        <div class="sidebar-chart" id="answerChart" style="display:none"></div>

        <div class="sources-panel" id="sourcesPanel">
          <div class="sources-title">Sources</div>
          <div id="sourcesList"></div>
        </div>

        <div class="provenance-strip" id="provenanceStrip" style="display:none"></div>
        <div class="memory-strip" id="memoryStrip" style="display:none"></div>

        <div class="followups" id="followUps" style="display:none">
          <div class="followups-header">
            <div class="followups-title">Go deeper</div>
            <div class="followups-legend">
              <span class="legend-dot fidelity-high"></span>High fidelity
              <span class="legend-dot fidelity-med"></span>Medium
              <span class="legend-dot fidelity-low"></span>Data gap
            </div>
          </div>
          <div class="followups-list" id="followUpsList"></div>
        </div>
      </article>
    </div>

    <div class="detail-block" id="tradeDetail" hidden>
      <div class="trade-scope" id="tradeScope"></div>

      <div class="trade-inputs">
        <div class="trade-field">
          <label for="tradeSearch">Product or HTS code</label>
          <input type="text" class="trade-input" id="tradeSearch" placeholder="t-shirts, or 6109" autocomplete="off">
          <div class="trade-results" id="tradeResults"></div>
          <div class="trade-selected" id="tradeSelected" style="display:none"></div>
        </div>

        <div class="trade-field-row">
          <div class="trade-field">
            <label for="tradeValue">Shipment value (USD)</label>
            <input type="number" class="trade-input" id="tradeValue" value="250000" min="0" step="1000">
          </div>
          <div class="trade-field">
            <label for="tradeMode">Mode</label>
            <select class="trade-input" id="tradeMode"></select>
          </div>
          <div class="trade-field" id="tradeQuantityRow" style="display:none">
            <label for="tradeQuantity">Quantity <span id="tradeQuantityUnit"></span></label>
            <input type="number" class="trade-input" id="tradeQuantity" min="0" step="1" placeholder="required">
          </div>
        </div>

        <div class="trade-field">
          <label>Origins</label>
          <div class="trade-origins" id="tradeOrigins"></div>
          <input type="text" class="trade-input trade-origin-add" id="tradeOriginAdd" placeholder="Add an origin" autocomplete="off">
          <div class="trade-results" id="tradeOriginResults"></div>
        </div>

        <label class="trade-toggle">
          <input type="checkbox" id="tradeClaimPrefs" checked>
          <span>Claim preferential rates where the origin qualifies</span>
        </label>
        <div class="trade-toggle-note" id="tradeClaimNote"></div>
      </div>

      <div class="trade-output" id="tradeOutput">
        <div class="trade-empty" id="tradeEmpty">Pick a product to model the lane.</div>

        <div class="trade-result" id="tradeResult" style="display:none">
          <div class="trade-headline">
            <div class="trade-headline-metric">
              <div class="trade-metric-label">Best landed cost</div>
              <div class="trade-metric-value" id="tradeBestValue">&mdash;</div>
              <div class="trade-metric-note" id="tradeBestNote"></div>
            </div>
            <div class="trade-headline-metric">
              <div class="trade-metric-label">Spread across origins</div>
              <div class="trade-metric-value" id="tradeSpreadValue">&mdash;</div>
              <div class="trade-metric-note" id="tradeSpreadNote"></div>
            </div>
          </div>

          <div class="trade-table-wrap"><table class="trade-table" id="tradeTable"></table></div>
          <div class="trade-stack" id="tradeStack"></div>
          <div class="trade-flags" id="tradeFlags"></div>

          <div class="trade-sliders">
            <div class="trade-slider-head">Sensitivity</div>
            <div class="trade-slider">
              <label for="sliderVolume">Volume <span id="sliderVolumeVal">100%</span></label>
              <input type="range" id="sliderVolume" min="25" max="400" value="100" step="5">
            </div>
            <div class="trade-slider">
              <label for="sliderShock">Tariff shock <span id="sliderShockVal">+0pp</span></label>
              <input type="range" id="sliderShock" min="0" max="50" value="0" step="1">
            </div>
            <div class="trade-slider">
              <label for="sliderFx">FX move <span id="sliderFxVal">0%</span></label>
              <input type="range" id="sliderFx" min="-40" max="40" value="0" step="1">
            </div>
            <button class="trade-reset" id="tradeSlidersReset" type="button">Reset</button>
          </div>

          <div class="trade-actions">
            <button class="trade-interpret-btn" id="tradeInterpretBtn" type="button">What does this mean?</button>
          </div>

          <div class="trade-interpretation" id="tradeInterpretation" style="display:none">
            <div class="trade-interpretation-label">So what</div>
            <div class="trade-interpretation-body" id="tradeInterpretationBody"></div>
            <div class="trade-interpretation-sources" id="tradeInterpretationSources"></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</main>

</div><!-- /.shell -->


<!-- TABLE OVERLAY -->
<div class="table-overlay" id="tableOverlay">
  <div class="table-overlay-panel">
    <div class="table-overlay-header">
      <div class="table-overlay-title" id="tableOverlayTitle">Table</div>
      <button class="table-overlay-close" id="tableOverlayClose" title="Close">&times;</button>
    </div>
    <div class="table-overlay-body" id="tableOverlayBody"></div>
  </div>
</div>

<footer class="footer">
  <div class="container footer-inner">
    <div class="footer-note">Phase 1 &middot; Public data only &middot; Live answers &middot; Sources shown on every figure</div>
    <div class="footer-note" id="footerCoord">CORRIDOR &middot; PROTOTYPE</div>
  </div>
</footer>

</div>`;
