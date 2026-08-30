// @ts-nocheck
/* Corridor application logic, ported from the original static app.js.
   Three things changed and nothing else:
     - the Anthropic call goes to our own /api/anthropic route, so no API key
       ever reaches the browser;
     - the project store is backed by the database instead of localStorage;
     - the "Request an analysis" link opens the in-app form.
   Everything else is the original behaviour. */
import {
  DATASETS, DEFAULT_CORRIDOR_ID, searchDomains, SPI_CODES, COUNTRY_PROGRAMS_ASOF,
  COUNTRY_PROGRAMS, TRADE_ACTIONS, ENTRY_FEES, TRANSPORT_MODES, countryName,
  tradeActionsFor, ASSESSMENT_BANDS, ASSESSMENT_MODULES, assessmentModuleById,
  DECISION_BANDS, computeDecisionBand, MCS, loadMcsIndex, loadMcs, matchCommodities,
  matchCountries, queryMcs, mcsContextFor, mcsPromptBlock, TARIFFS, loadTariffIndex,
  loadTariffs, tariffsReady, htsByCode, searchHts, PROGRAM_LABELS, programCondition,
  resolveRate, formatPercent, parseRateText, computeDuty, compareOrigins, money,
  tariffPromptBlock, GEO, loadGeo, chokepointById, MAP_VIEW, project, lanePath,
  renderMap, PORTS, DESTINATIONS, portFor, REGIONS, regionOf, ROUTE_TABLE, routeFor,
  laneStops, routeSummary, blankLane, laneExposure, WATCH_STALE_DAYS, deriveWatchItems,
  refreshWatchItems, lastCheck, isStale, watchCheckPrompt, parseWatchCheck, recordCheck,
  buildFeed, assessmentModuleName, assessmentProjectBlock, assessmentQuestion,
  assessmentSystemAddendum, decisionPrompt, parseAssessmentScore, parseDecisionSections,
  buildAssessmentRecord, assessmentStaleness, projectAssessmentRecords,
  projectDecisionBand, decisionBasis
} from "./domain";
import { cloudStore, corridorHeaders } from "./cloud-store";

export function bootCorridor({ navigate }: { navigate: (to: string) => void }) {
  const corridorNavigate = navigate;
  /* ==========================================================================
     CORRIDOR — Phase 1 web application
     Live answers via Anthropic Messages API + web search.
     ========================================================================== */

  const CONFIG = {
    model: "claude-sonnet-4-5-20250929",
    apiUrl: "/api/anthropic",
    storageKey: "corridor.api_key",
    contextKey: "corridor.user_context",   // legacy, migrated into projects
    verbosityKey: "corridor.verbosity",
    projectsKey: "corridor.projects"
  };

  /* Corridor is priced per project, and what a project buys is an allowance of
     documents to work against. The number lives on the project rather than in a
     constant so a plan change is a data change. */
  const DEFAULT_DOCUMENT_ALLOWANCE = 25;

  function documentAllowance(project) {
    return (project && project.plan && project.plan.documentAllowance) || DEFAULT_DOCUMENT_ALLOWANCE;
  }

  /* --------------------------------------------------------------------------
     Element refs
     -------------------------------------------------------------------------- */
  const $ = (id) => document.getElementById(id);
  const els = {
    apiKeyBar: $("apiKeyBar"),
    apiKeyInput: $("apiKeyInput"),
    apiKeySave: $("apiKeySave"),
    verbositySelect: $("verbositySelect"),
    sidebar: $("sidebar"),
    sidebarOverlay: $("sidebarOverlay"),
    sidebarToggle: $("sidebarToggle"),
    sidebarToggleLabel: $("sidebarToggleLabel"),
    sidebarSettings: $("sidebarSettings"),
    projectView: $("projectView"),
    projectTitle: $("projectTitle"),
    projectBand: $("projectBand"),
    projectFoot: $("projectFoot"),
    runRow: $("runRow"),
    mapPanel: $("mapPanel"),
    feedPanel: $("feedPanel"),
    lanesPanel: $("lanesPanel"),
    laneDetail: $("laneDetail"),
    projectSecondary: $("projectSecondary"),
    resultsList: $("resultsList"),
    answerDetail: $("answerDetail"),
    tradeDetail: $("tradeDetail"),
    askBoxFiles: $("askBoxFiles"),
    askBoxHint: $("askBoxHint"),
    attachBtn: $("attachBtn"),
    attachCount: $("attachCount"),
    projectSetup: $("projectSetup"),
    projectRenameBtn: $("projectRenameBtn"),
    downloadPdfBtn: $("downloadPdfBtn"),
    downloadXlsBtn: $("downloadXlsBtn"),
    projectMeta: $("projectMeta"),

    /* Assessments and the decision readout */
    decisionReadout: $("decisionReadout"),
    decisionBand: $("decisionBand"),
    decisionBasis: $("decisionBasis"),
    decisionRationale: $("decisionRationale"),
    decisionConditions: $("decisionConditions"),
    decisionRefresh: $("decisionRefresh"),
    docAllowance: $("docAllowance"),
    projectIndustryInput: $("projectIndustryInput"),
    projectGeographyInput: $("projectGeographyInput"),

    /* Trade model */
    tradeScope: $("tradeScope"),
    tradeSearch: $("tradeSearch"),
    tradeResults: $("tradeResults"),
    tradeSelected: $("tradeSelected"),
    tradeValue: $("tradeValue"),
    tradeQuantity: $("tradeQuantity"),
    tradeQuantityRow: $("tradeQuantityRow"),
    tradeQuantityUnit: $("tradeQuantityUnit"),
    tradeMode: $("tradeMode"),
    tradeOrigins: $("tradeOrigins"),
    tradeOriginAdd: $("tradeOriginAdd"),
    tradeOriginResults: $("tradeOriginResults"),
    tradeClaimPrefs: $("tradeClaimPrefs"),
    tradeClaimNote: $("tradeClaimNote"),
    tradeEmpty: $("tradeEmpty"),
    tradeResult: $("tradeResult"),
    tradeBestValue: $("tradeBestValue"),
    tradeBestNote: $("tradeBestNote"),
    tradeSpreadValue: $("tradeSpreadValue"),
    tradeSpreadNote: $("tradeSpreadNote"),
    tradeTable: $("tradeTable"),
    tradeStack: $("tradeStack"),
    tradeFlags: $("tradeFlags"),
    sliderVolume: $("sliderVolume"),
    sliderShock: $("sliderShock"),
    sliderFx: $("sliderFx"),
    sliderVolumeVal: $("sliderVolumeVal"),
    sliderShockVal: $("sliderShockVal"),
    sliderFxVal: $("sliderFxVal"),
    tradeSlidersReset: $("tradeSlidersReset"),
    tradeInterpretBtn: $("tradeInterpretBtn"),
    tradeInterpretation: $("tradeInterpretation"),
    tradeInterpretationBody: $("tradeInterpretationBody"),
    tradeInterpretationSources: $("tradeInterpretationSources"),

    /* Report */
    reportDoc: $("reportDoc"),
    memoryList: $("memoryList"),
    memoryCount: $("memoryCount"),
    memorySuperseded: $("memorySuperseded"),
    memorySupersededList: $("memorySupersededList"),
    memorySupersededCount: $("memorySupersededCount"),
    memoryStrip: $("memoryStrip"),
    answerCorridorTag: $("answerCorridorTag"),
    projectList: $("projectList"),
    projectNewInput: $("projectNewInput"),
    projectNewBtn: $("projectNewBtn"),
    projectNameInput: $("projectNameInput"),
    projectRoleInput: $("projectRoleInput"),
    projectGoalInput: $("projectGoalInput"),
    projectDocsList: $("projectDocsList"),
    projectContextSave: $("projectContextSave"),
    projectDeleteBtn: $("projectDeleteBtn"),
    navSettings: $("navSettings"),
    navProject: $("navProject"),
    navHome: $("navHome"),
    navBrand: $("navBrand"),
    homeView: $("homeView"),
    enterUSA: $("enterUSA"),
    startProjectBtn: $("startProjectBtn"),
    askForm: $("askForm"),
    askInput: $("askInput"),
    askSubmit: $("askSubmit"),
    answerStatus: $("answerStatus"),
    statusSteps: $("statusSteps"),
    answerBrief: $("answerBrief"),
    answerQuestionText: $("answerQuestionText"),
    answerHeadline: $("answerHeadline"),
    answerBody: $("answerBody"),
    answerReadout: $("answerReadout"),
    readoutText: $("readoutText"),
    answerExpander: $("answerExpander"),
    expanderContent: $("expanderContent"),
    confidenceNote: $("confidenceNote"),
    confidenceText: $("confidenceText"),
    cannotAnswer: $("cannotAnswer"),
    cannotAnswerText: $("cannotAnswerText"),
    sourcesPanel: $("sourcesPanel"),
    sourcesList: $("sourcesList"),
    followUps: $("followUps"),
    followUpsList: $("followUpsList"),
    globeCanvas: $("globeCanvas"),
    keyNumbers: $("keyNumbers"),
    mechanism: $("mechanism"),
    mechanismText: $("mechanismText"),
    drivers: $("drivers"),
    driversList: $("driversList"),
    answerTable: $("answerTable"),
    answerTableContent: $("answerTableContent"),
    risks: $("risks"),
    risksList: $("risksList"),
    answerChart: $("answerChart"),
    provenanceStrip: $("provenanceStrip"),
    askLabel: document.querySelector(".ask-label"),
    levers: $("levers"),
    leversContent: $("leversContent"),
    scenarios: $("scenarios"),
    scenariosContent: $("scenariosContent"),
    breakeven: $("breakeven"),
    breakevenText: $("breakevenText"),
    answerAnalysis: $("answerAnalysis"),
    analysisContent: $("analysisContent"),
    fileInput: $("fileInput"),
    projectFileInput: $("projectFileInput"),
    readoutLabel: document.querySelector(".readout-label"),
    tableOverlay: $("tableOverlay"),
    tableOverlayTitle: $("tableOverlayTitle"),
    tableOverlayClose: $("tableOverlayClose"),
    tableOverlayBody: $("tableOverlayBody")
  };

  /* Conversation state — keeps the API context so follow-ups build on prior turns. */
  let conversation = { messages: [] };

  /* What the last answer was built from. The exporters and the provenance strip
     read these, so a spreadsheet can never claim a source the answer did not use. */
  let lastMcsContext = null;
  let lastSections = {};
  let lastQuestion = "";
  function resetThread() {
    conversation = { messages: [] };
    updateThreadCrumb();
  }
  function updateThreadCrumb() {
    const n = Math.max(0, Math.floor(conversation.messages.length / 2));
    if (els.threadCrumbCount) els.threadCrumbCount.textContent = n;
    if (els.threadCrumb) els.threadCrumb.style.display = n > 1 ? "flex" : "none";
  }

  /* --------------------------------------------------------------------------
     Views — home, and the project.

     The corridor used to be a place you navigated into. It is now the body of
     data a project draws on, and the work happens at the project level. That
     leaves two views, with the project as a tabbed surface you stay inside to
     ask a question.
     -------------------------------------------------------------------------- */
  const VIEWS = ["homeView", "projectView"];

  function showView(name) {
    for (const v of VIEWS) {
      if (els[v]) els[v].classList.toggle("active", v === name);
    }
  }

  function showHome() {
    document.querySelector(".shell")?.classList.add("shell-bare");
    showView("homeView");
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }

  /* One surface. There is nowhere else to be inside a project, so anything that
     wants the user's attention scrolls rather than navigates. */
  function showProject() {
    document.querySelector(".shell")?.classList.remove("shell-bare");
    if (!els.projectView) return showHome();
    showView("projectView");
    renderProject();
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }

  /* Kept as the name a dozen call sites use to mean "put the question box in
     front of the user". */
  function enterCorridor() {
    showProject();
    setTimeout(() => els.askInput && els.askInput.focus(), 120);
  }

  /* --------------------------------------------------------------------------
     API key handling
     -------------------------------------------------------------------------- */
  function getApiKey() {
    return "server";
  }

  function setApiKey() {}

  function ensureApiKey() {
    return true;
  }

  /* --------------------------------------------------------------------------
     Projects — each owns its own role/goal context, its own attached
     documents, and its own search history, the way Claude Projects works.
     One entity's context should never bleed into another's.
     -------------------------------------------------------------------------- */
  function newProjectId() {
    return "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function blankProject(name) {
    return {
      id: newProjectId(),
      name: name || "New project",
      createdAt: Date.now(),
      role: "",
      goal: "",
      industry: "",
      geography: "",
      corridors: [DEFAULT_CORRIDOR_ID],
      primaryCorridor: DEFAULT_CORRIDOR_ID,
      documents: [],
      memories: [],
      history: [],
      summary: null,
      suggestedQuestions: null,
      answerCount: 0,
      assessments: {},
      decision: null,
      tradeModel: null,
      lanes: [],
      lastVisit: null,
      plan: { tier: "project", documentAllowance: DEFAULT_DOCUMENT_ALLOWANCE }
    };
  }

  /* Fills in fields added after a project was first created, so a store
     written by an earlier version keeps working without losing anything. */
  function normalizeProject(project) {
    if (!Array.isArray(project.corridors) || !project.corridors.length) {
      project.corridors = [DEFAULT_CORRIDOR_ID];
    }
    if (!project.primaryCorridor || !project.corridors.includes(project.primaryCorridor)) {
      project.primaryCorridor = project.corridors[0];
    }
    if (!Array.isArray(project.memories)) project.memories = [];
    if (!Array.isArray(project.documents)) project.documents = [];
    if (!Array.isArray(project.history)) project.history = [];
    for (const item of project.history) {
      if (!item.corridorId) item.corridorId = DEFAULT_CORRIDOR_ID;
    }
    if (!project.summary) project.summary = null;
    if (!project.suggestedQuestions) project.suggestedQuestions = null;
    if (typeof project.answerCount !== "number") project.answerCount = 0;

    /* Added with the project-level rework. Guarded the same way as everything
       above, so a store written before this release keeps working and simply
       gains the new fields empty. */
    if (typeof project.industry !== "string") project.industry = "";
    if (typeof project.geography !== "string") project.geography = "";
    if (!project.decision) project.decision = null;
    if (!Array.isArray(project.lanes)) project.lanes = [];
    if (typeof project.lastVisit !== "number") project.lastVisit = null;
    /* The sourcing book is gone. Anything stored under it is left alone rather
       than migrated, since a lane is not a book of SKUs. */
    if (!project.plan || typeof project.plan !== "object") {
      project.plan = { tier: "project", documentAllowance: DEFAULT_DOCUMENT_ALLOWANCE };
    }
    if (typeof project.plan.documentAllowance !== "number") {
      project.plan.documentAllowance = DEFAULT_DOCUMENT_ALLOWANCE;
    }

    /* One list of results replaces the assessments map, the trade model and the
       history array. Those three were the same idea stored three ways, which is
       why the app showed "things you have done" in three places that never
       agreed. Fold them in once and leave the old keys behind. */
    if (!Array.isArray(project.results)) {
      project.results = [];

      for (const m of ASSESSMENT_MODULES) {
        const a = (project.assessments || {})[m.id];
        if (!a) continue;
        project.results.push({
          id: newProjectId(),
          kind: "assessment",
          moduleId: m.id,
          title: a.moduleName || m.name,
          summary: a.verdict || "",
          band: a.band || null,
          justification: a.justification || "",
          raw: a.raw || "",
          sections: a.sections || {},
          answerCountAt: a.answerCountAt || 0,
          docCountAt: a.docCountAt || 0,
          corridorId: a.corridorId || project.primaryCorridor,
          createdAt: a.runAt || Date.now()
        });
      }

      if (project.tradeModel) {
        project.results.push(tradeResultFrom(project.tradeModel, project.primaryCorridor));
      }

      /* History only ever held a question and a headline, so these come back
         trimmed. Reopening one used to re-run the API call; now it shows what
         is known and offers to run it again. */
      for (const h of (project.history || [])) {
        project.results.push({
          id: h.id || newProjectId(),
          kind: "answer",
          title: h.question || "",
          summary: h.headline || "",
          raw: "",
          sections: {},
          trimmed: true,
          corridorId: h.corridorId || project.primaryCorridor,
          createdAt: h.timestamp || Date.now()
        });
      }

      project.results.sort((a, b) => b.createdAt - a.createdAt);
    }

    return project;
  }

  /* --------------------------------------------------------------------------
     Results — everything a project has produced, in one ordered list.

     An answer, an assessment and a duty model are the same kind of thing: a
     piece of work with a title, a one-line summary, and enough stored detail to
     render again without calling the API. Keeping them in one list is what lets
     the project be a single surface.
     -------------------------------------------------------------------------- */

  /* Full text is the expensive part of a result. Assessments and the duty model
     always keep theirs because the report is built from them; free-form answers
     keep theirs for the most recent few and then fall back to title and summary. */
  const RESULT_RAW_KEEP = 10;
  const RESULT_MAX = 60;

  function getResults(project) {
    return (project || getActiveProject()).results || [];
  }

  function latestAssessment(project, moduleId) {
    return getResults(project).find(r => r.kind === "assessment" && r.moduleId === moduleId) || null;
  }

  function latestTradeResult(project) {
    return getResults(project).find(r => r.kind === "trade") || null;
  }

  function resultById(id) {
    return getResults().find(r => r.id === id) || null;
  }

  /* Takes the corridor rather than reading it, because this runs inside
     normalizeProject and getActiveProject would recurse straight back into it. */
  function tradeResultFrom(model, corridorId) {
    const best = model.results[0];
    const worst = model.results[model.results.length - 1];
    const spread = worst.landed - best.landed;
    return {
      id: newProjectId(),
      kind: "trade",
      title: `Duty model · HTS ${formatHts(model.hts)}`,
      summary: spread > 0
        ? `${best.originName} best at ${money(best.landed)}, ${money(spread)} spread across ${model.results.length} origins`
        : `Every origin lands at ${money(best.landed)}`,
      model,
      corridorId: corridorId || DEFAULT_CORRIDOR_ID,
      createdAt: model.savedAt || Date.now()
    };
  }

  /* Newest first. A re-run of the same assessment or duty model supersedes the
     previous one rather than stacking a near-identical card next to it. */
  function addResult(result) {
    updateActiveProject(p => {
      p.results = p.results || [];
      if (result.kind === "assessment") {
        p.results = p.results.filter(r => !(r.kind === "assessment" && r.moduleId === result.moduleId));
      }
      if (result.kind === "trade") {
        p.results = p.results.filter(r => r.kind !== "trade");
      }
      p.results.unshift(result);
      trimResults(p);
    });
    return result;
  }

  function trimResults(project) {
    const keep = new Set();
    for (const r of project.results) {
      if (r.kind !== "answer") keep.add(r.id);
    }
    let answers = 0;
    for (const r of project.results) {
      if (keep.has(r.id)) continue;
      if (++answers <= RESULT_RAW_KEEP) continue;
      if (r.raw) { r.raw = ""; r.sections = {}; r.trimmed = true; }
    }
    if (project.results.length > RESULT_MAX) project.results.length = RESULT_MAX;
  }

  function deleteResult(id) {
    updateActiveProject(p => {
      p.results = (p.results || []).filter(r => r.id !== id);
    });
  }

  /* Runs once: folds the old global context and history into a "General"
     project so nobody loses what they already set up. */
  function migrateToProjects() {
    const legacyContext = (() => {
      try { return JSON.parse(localStorage.getItem(CONFIG.contextKey) || "null"); }
      catch { return null; }
    })();
    const legacyHistory = (() => {
      try { return JSON.parse(localStorage.getItem("corridor.search_history") || "null"); }
      catch { return null; }
    })();

    const project = blankProject("General");
    if (legacyContext) {
      project.role = legacyContext.role || "";
      project.goal = legacyContext.goal || "";
    }
    if (Array.isArray(legacyHistory)) project.history = legacyHistory;

    const store = { activeId: project.id, projects: { [project.id]: project } };
    cloudStore.write(store);
    return store;
  }

  function loadProjectStore() {
    let store = cloudStore.read();

    if (!store || !store.projects || !Object.keys(store.projects).length) {
      store = migrateToProjects();
    }
    if (!store.activeId || !store.projects[store.activeId]) {
      store.activeId = Object.keys(store.projects)[0];
    }
    for (const id of Object.keys(store.projects)) normalizeProject(store.projects[id]);
    return store;
  }

  /* Every write goes through here. A quota error is reported plainly, naming
     the active project, rather than silently dropping the save. */
  function saveProjectStore(store) {
    try {
      cloudStore.write(store);
      return true;
    } catch (err) {
      const name = (store.projects[store.activeId] || {}).name || "this project";
      alert(`Could not save — the browser's storage is full. Remove a document from "${name}" (Documents in the project panel) and try again.`);
      return false;
    }
  }

  function getActiveProject() {
    const store = loadProjectStore();
    return store.projects[store.activeId];
  }

  /* Mutates the active project via `fn(project)` and persists the result. */
  function updateActiveProject(fn) {
    const store = loadProjectStore();
    const project = store.projects[store.activeId];
    fn(project);
    return saveProjectStore(store);
  }

  function listProjects() {
    const store = loadProjectStore();
    return Object.values(store.projects).sort((a, b) => a.createdAt - b.createdAt);
  }

  /* Called after every project mutation so the whole UI reflects whichever
     project is active — nothing lags behind and shows another project's
     context or documents. */
  function refreshForActiveProject() {
    resetThread();
    currentCorridorId = null;   // fall back to the new project's primary
    renderAskHint();
    renderUploadedFiles();
    if (typeof renderSidebar === "function") renderSidebar();
    if (typeof renderProject === "function") renderProject();
    renderAskHint();
  }

  function switchProject(id) {
    const store = loadProjectStore();
    if (!store.projects[id]) return;
    store.activeId = id;
    saveProjectStore(store);
    refreshForActiveProject();
  }

  function createProject(name) {
    const store = loadProjectStore();
    const current = store.projects[store.activeId];
    /* A new project starts empty. Carrying the last project's role and decision
       forward was useful when a project was a research thread. Now it just puts
       "consumer beverages exporter" at the top of an apparel book. */
    const project = blankProject(name);
    store.projects[project.id] = project;
    store.activeId = project.id;
    saveProjectStore(store);
    refreshForActiveProject();
    return project;
  }

  function renameProject(id, name) {
    const store = loadProjectStore();
    if (!store.projects[id]) return;
    store.projects[id].name = (name || "").trim() || store.projects[id].name;
    saveProjectStore(store);
    renderProjectHead();
    if (typeof renderSidebar === "function") renderSidebar();
  }

  /* Deleting the last project recreates "General" rather than leaving the
     app with nothing to be active in. */
  function deleteProject(id) {
    const store = loadProjectStore();
    if (!store.projects[id]) return;
    delete store.projects[id];
    if (!Object.keys(store.projects).length) {
      const fresh = blankProject("General");
      store.projects[fresh.id] = fresh;
    }
    if (store.activeId === id) {
      store.activeId = Object.keys(store.projects)[0];
    }
    saveProjectStore(store);
    refreshForActiveProject();
  }

  /* --------------------------------------------------------------------------
     User context — who is asking, and what they are trying to do. Scoped to
     the active project. Read by buildSystemPrompt() to tailor every answer,
     and by getExampleQuestions() to swap the example prompts on the ask form.
     -------------------------------------------------------------------------- */
  function getUserContext() {
    const project = getActiveProject();
    return { role: project.role || "", goal: project.goal || "" };
  }

  function setUserContext(role, goal) {
    updateActiveProject(project => {
      project.role = (role || "").trim();
      project.goal = (goal || "").trim();
    });
  }

  /* --------------------------------------------------------------------------
     Project memory — durable facts each answer establishes, accumulated so a
     later thread starts from what earlier ones worked out instead of
     re-deriving the same figures. Superseded memories are kept, not deleted:
     the trail of what replaced what is the point.
     -------------------------------------------------------------------------- */
  const MEMORY_KINDS = ["fact", "constraint", "figure", "preference"];
  const MEMORY_PROMPT_MAX = 25;
  const MEMORY_PROMPT_CHARS = 2000;

  function getMemories() {
    return getActiveProject().memories || [];
  }

  function activeMemories() {
    return getMemories().filter(m => m.status !== "superseded");
  }

  /* Lowercased significant tokens, used to spot a restatement of something
     already remembered. */
  function memoryTokens(text) {
    return new Set(
      (text || "")
        .toLowerCase()
        .replace(/[^a-z0-9%.\s-]/g, " ")
        .split(/\s+/)
        .filter(w => w.length > 2)
    );
  }

  function memorySimilarity(a, b) {
    const ta = memoryTokens(a);
    const tb = memoryTokens(b);
    if (!ta.size || !tb.size) return 0;
    let shared = 0;
    for (const t of ta) if (tb.has(t)) shared++;
    return shared / Math.min(ta.size, tb.size);
  }

  const MEMORY_DUPLICATE_THRESHOLD = 0.8;
  const MEMORY_SUPERSEDE_THRESHOLD = 0.45;

  /* Parse the [[MEMORY]] block:
     <kind> | <fact> | supersedes: <existing text> | none  */
  function parseMemorySection(text) {
    if (!text) return [];
    const out = [];
    for (const raw of text.split(/\n/)) {
      const line = raw.trim().replace(/^[-*]\s*/, "");
      if (!line || line.toLowerCase() === "none") continue;
      if (!line.includes("|")) continue;

      const parts = line.split("|").map(p => p.trim());
      const kindMatch = (parts[0] || "").toLowerCase().match(/fact|constraint|figure|preference/);
      const factText = (parts[1] || "").trim();
      if (!factText) continue;

      let supersedes = (parts.slice(2).join(" ") || "").replace(/^supersedes\s*:?\s*/i, "").trim();
      if (!supersedes || supersedes.toLowerCase() === "none") supersedes = "";

      out.push({
        kind: kindMatch ? kindMatch[0] : "fact",
        text: factText,
        supersedes
      });
    }
    return out;
  }

  /* Fold newly extracted memories into the project. Returns the ones actually
     added, so the thread can report what it learned. */
  function mergeMemories(extracted, sourceLabel) {
    if (!extracted || !extracted.length) return [];
    const added = [];

    updateActiveProject(project => {
      const memories = project.memories || (project.memories = []);
      const documents = project.documents || [];

      for (const item of extracted) {
        const live = memories.filter(m => m.status !== "superseded");

        // Already known? Refresh recency rather than storing it twice.
        const duplicate = live.find(m => memorySimilarity(m.text, item.text) >= MEMORY_DUPLICATE_THRESHOLD);
        if (duplicate) {
          duplicate.createdAt = Date.now();
          continue;
        }

        const memory = {
          id: newProjectId(),
          text: item.text,
          kind: MEMORY_KINDS.includes(item.kind) ? item.kind : "fact",
          source: { type: "thread", label: sourceLabel || "this thread" },
          createdAt: Date.now(),
          pinned: false,
          status: "active",
          supersededBy: null,
          supersedes: null,
          conflict: null
        };

        /* The model named something it replaces. Match it against what is
           actually stored rather than trusting the text verbatim. */
        if (item.supersedes) {
          let target = live.find(m => memorySimilarity(m.text, item.supersedes) >= MEMORY_SUPERSEDE_THRESHOLD);
          if (target) {
            target.status = "superseded";
            target.supersededBy = memory.id;
            memory.supersedes = target.text;

            /* Replacing something the user's own document asserted is worth
               surfacing, not quietly overwriting. */
            if (target.source && target.source.type === "document") {
              memory.conflict = { with: target.source.label, note: target.text };
            }
          }
        }

        /* Even without an explicit supersedes, a figure that contradicts one
           drawn from an uploaded document should be flagged. */
        if (!memory.conflict && documents.length) {
          const docMemory = live.find(m =>
            m.source && m.source.type === "document" &&
            memorySimilarity(m.text, item.text) >= MEMORY_SUPERSEDE_THRESHOLD &&
            memorySimilarity(m.text, item.text) < MEMORY_DUPLICATE_THRESHOLD
          );
          if (docMemory) {
            memory.conflict = { with: docMemory.source.label, note: docMemory.text };
          }
        }

        memories.push(memory);
        added.push(memory);
      }
    });

    return added;
  }

  function setMemoryPinned(id, pinned) {
    updateActiveProject(project => {
      const memory = (project.memories || []).find(m => m.id === id);
      if (memory) memory.pinned = !!pinned;
    });
  }

  function deleteMemory(id) {
    updateActiveProject(project => {
      project.memories = (project.memories || []).filter(m => m.id !== id);
    });
  }

  function updateMemoryText(id, text) {
    const clean = (text || "").trim();
    if (!clean) return;
    updateActiveProject(project => {
      const memory = (project.memories || []).find(m => m.id === id);
      if (memory) memory.text = clean;
    });
  }

  /* Pinned first, then most recent, to a cap — so the prompt cannot grow
     without bound as a project accumulates months of work. */
  function memoriesForPrompt() {
    const live = activeMemories().slice().sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.createdAt - a.createdAt;
    });

    const out = [];
    let chars = 0;
    for (const m of live) {
      if (out.length >= MEMORY_PROMPT_MAX) break;
      if (chars + m.text.length > MEMORY_PROMPT_CHARS && !m.pinned) break;
      out.push(m);
      chars += m.text.length;
    }
    return out;
  }

  function promptProjectMemory() {
    const memories = memoriesForPrompt();
    if (!memories.length) return "";
    const lines = memories.map(m => `- [${m.kind}] ${m.text}`);
    return `
  What Corridor already knows about this project, accumulated across earlier threads:
  ${lines.join("\n")}
  Treat these as established context. Do not re-derive them, and do not spend the answer
  re-citing them unless the user questions one. If new evidence contradicts one, say so
  plainly rather than quietly switching to the new figure.
  `;
  }

  function promptProjectSummary() {
    const project = getActiveProject();
    if (!project.summary?.text) return "";
    return `
  The current standing of this project:
  ${project.summary.text}
  Write the next answer building on this standing, not repeating it.
  `;
  }

  function getVerbosity() {
    const v = localStorage.getItem(CONFIG.verbosityKey);
    return v === "concise" || v === "deep" ? v : "standard";
  }

  function setVerbosity(v) {
    if (v === "concise" || v === "deep") localStorage.setItem(CONFIG.verbosityKey, v);
    else localStorage.removeItem(CONFIG.verbosityKey);
  }

  function promptVerbosity() {
    const level = getVerbosity();
    if (level === "concise") {
      return "\nThe user has set answer length to CONCISE, tighter than the standard format above. Keep KEY_NUMBERS to 2 lines, BODY to 2-3 bullets, MECHANISM to two sentences, DRIVERS to 1-2 items, RISKS to 1-2 items, and FOLLOW_UPS to 3 questions. Cut anything not load-bearing. Do not pad to compensate for the shorter length.\n";
    }
    if (level === "deep") {
      return "\nThe user has set answer length to DEEP. Push KEY_NUMBERS to 5, BODY to 5-7 bullets covering second-order effects, MECHANISM to one or two full paragraphs, DRIVERS to 4 items, RISKS to 4 items, and FOLLOW_UPS to 5-6 questions. Go further into causal chains, counterparties and historical comparison than the standard format above, while keeping every added sentence load-bearing.\n";
    }
    return "";
  }


  /* --------------------------------------------------------------------------
     Sidebar — the persistent frame. Project list, and the active project's
     name, role and goal. Everything routes through the project store
     functions above, so nothing here touches localStorage directly.
     -------------------------------------------------------------------------- */
  function renderSidebar() {
    if (!els.projectList) return;
    const store = loadProjectStore();
    const projects = listProjects();

    els.projectList.innerHTML = projects.map(p => `
      <button class="project-list-item ${p.id === store.activeId ? "active" : ""}" data-id="${p.id}">
        <span class="project-list-name">${escapeHtml(p.name)}</span>
      </button>
    `).join("");

    const active = store.projects[store.activeId];
    if (els.projectNameInput) els.projectNameInput.value = active.name;
    if (els.projectRoleInput) els.projectRoleInput.value = active.role || "";
    if (els.projectGoalInput) els.projectGoalInput.value = active.goal || "";
    if (els.projectIndustryInput) els.projectIndustryInput.value = active.industry || "";
    if (els.projectGeographyInput) els.projectGeographyInput.value = active.geography || "";
    if (els.sidebarToggleLabel) els.sidebarToggleLabel.textContent = active.name;
    if (els.projectDeleteBtn) {
      els.projectDeleteBtn.disabled = projects.length <= 1;
    }
  }

  /* Below 960px the sidebar overlays instead of holding a column. */
  function openSidebar() {
    if (!els.sidebar) return;
    els.sidebar.classList.add("open");
    if (els.sidebarOverlay) els.sidebarOverlay.classList.add("visible");
  }

  function closeSidebar() {
    if (!els.sidebar) return;
    els.sidebar.classList.remove("open");
    if (els.sidebarOverlay) els.sidebarOverlay.classList.remove("visible");
  }

  els.sidebarToggle && els.sidebarToggle.addEventListener("click", () => {
    if (els.sidebar.classList.contains("open")) closeSidebar();
    else openSidebar();
  });
  els.sidebarOverlay && els.sidebarOverlay.addEventListener("click", closeSidebar);
  els.sidebarSettings && els.sidebarSettings.addEventListener("click", () => {
    closeSidebar();
    els.apiKeyBar.classList.add("visible");
    if (els.verbositySelect) els.verbositySelect.value = getVerbosity();
    els.apiKeyInput.focus();
  });

  if (els.projectList) {
    els.projectList.addEventListener("click", (e) => {
      const btn = e.target.closest(".project-list-item");
      if (!btn) return;
      switchProject(btn.dataset.id);
      closeSidebar();
      showProject();
    });
  }

  if (els.projectNewBtn) {
    els.projectNewBtn.addEventListener("click", () => {
      const name = (els.projectNewInput.value || "").trim();
      if (!name) { els.projectNewInput.focus(); return; }
      createProject(name);
      els.projectNewInput.value = "";
      closeSidebar();
      showProject();
    });
  }

  if (els.projectNewInput) {
    els.projectNewInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); els.projectNewBtn.click(); }
    });
  }

  /* Setup saves the framing every assessment is written against. */
  if (els.projectContextSave) {
    els.projectContextSave.addEventListener("click", () => {
      setUserContext(els.projectRoleInput.value, els.projectGoalInput.value);
      updateActiveProject(p => {
        p.industry = (els.projectIndustryInput?.value || "").trim();
        p.geography = (els.projectGeographyInput?.value || "").trim();
      });
      els.projectContextSave.textContent = "Saved";
      setTimeout(() => { els.projectContextSave.textContent = "Save"; }, 1400);
      renderAskHint();
      renderProject();
    });
  }

  /* The name lives in the sidebar next to the project list, where you pick
     between them. */
  if (els.projectRenameBtn) {
    els.projectRenameBtn.addEventListener("click", () => {
      const store = loadProjectStore();
      renameProject(store.activeId, els.projectNameInput.value);
      renderSidebar();
      renderProjectHead();
    });
  }

  if (els.projectDeleteBtn) {
    els.projectDeleteBtn.addEventListener("click", () => {
      const store = loadProjectStore();
      const active = store.projects[store.activeId];
      if (!confirm(`Delete "${active.name}"? Its results, documents and memory are removed. This cannot be undone.`)) return;
      deleteProject(store.activeId);
      showProject();
    });
  }

  if (els.projectDocsList) {
    els.projectDocsList.addEventListener("click", (e) => {
      const btn = e.target.closest(".file-chip-remove");
      if (btn) {
        removeUploadedFile(btn.dataset.id);
        renderProject();
      }
    });
  }

  /* --------------------------------------------------------------------------
     The Brief tab. Corridors, documents, memory and threads all live here, so
     the sidebar can stay lean.
     -------------------------------------------------------------------------- */
  const MEMORY_KIND_LABEL = {
    fact: "fact", constraint: "constraint", figure: "figure", preference: "preference"
  };

  function memoryRowHtml(m, superseded) {
    const pinIcon = m.pinned
      ? `<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="10" height="10"/></svg>`
      : `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="3.5" y="3.5" width="9" height="9"/></svg>`;

    return `
      <div class="memory-row ${m.pinned ? "pinned" : ""} ${superseded ? "is-superseded" : ""}" data-id="${m.id}">
        <div class="memory-row-main">
          <div class="memory-text" data-id="${m.id}">${escapeHtml(m.text)}</div>
          <div class="memory-meta">
            <span class="memory-kind">${escapeHtml(MEMORY_KIND_LABEL[m.kind] || m.kind)}</span>
            <span class="memory-source">from ${escapeHtml((m.source && m.source.label) || "an earlier answer")}</span>
          </div>
          ${m.supersedes ? `<div class="memory-supersedes">&#8627; supersedes &ldquo;${escapeHtml(m.supersedes)}&rdquo;</div>` : ""}
          ${m.conflict ? `<div class="memory-conflict">&#9888; conflicts with ${escapeHtml(m.conflict.with)}, which has &ldquo;${escapeHtml(m.conflict.note)}&rdquo;</div>` : ""}
        </div>
        ${superseded ? "" : `
        <div class="memory-actions">
          <button class="memory-pin" data-pin="${m.id}" title="${m.pinned ? "Unpin" : "Pin so it always reaches the model"}">${pinIcon}</button>
          <button class="memory-delete" data-del="${m.id}" title="Delete">&times;</button>
        </div>`}
      </div>`;
  }


  /* The whole surface. Cheap enough to redraw wholesale, which keeps it honest:
     there is one path to what is on screen rather than a dozen partial updates
     that can disagree. */
  function renderProject() {
    if (!els.projectView) return;
    const lanes = getLanes();

    renderProjectHead();
    renderMapPanel();
    renderFeed();
    renderLanes();

    /* Asking a question and running an assessment only make sense once there is
       something to ask about. */
    if (els.projectSecondary) els.projectSecondary.style.display = lanes.length ? "" : "none";
    if (lanes.length) {
      renderDecisionReadout();
      renderRunRow();
      renderResults();
    }
    renderSetup();
  }

  function renderProjectHead() {
    const project = getActiveProject();
    if (els.projectTitle) els.projectTitle.textContent = project.name;

    const band = projectDecisionBand(project);
    if (els.projectBand) {
      const spec = band ? DECISION_BANDS[band] : null;
      els.projectBand.textContent = spec ? spec.label : "";
      els.projectBand.className = "project-band " + (spec ? "tone-" + spec.tone : "tone-none");
    }

    /* The meta line describes the watchlist, because that is what the project
       is. Counting assessments nobody has run tells you nothing. */
    if (els.projectMeta) {
      const lanes = getLanes();
      if (!lanes.length) {
        els.projectMeta.textContent = "Nothing on the watchlist yet";
      } else {
        const items = lanes.reduce((n, l) => n + (l.watch || []).length, 0);
        const stale = lanes.reduce((n, l) => n + (l.watch || []).filter(w => isStale(w)).length, 0);
        const bits = [`${lanes.length} lane${lanes.length === 1 ? "" : "s"}`,
                      `${items} watch item${items === 1 ? "" : "s"}`];
        if (stale) bits.push(`${stale} due a check`);
        els.projectMeta.textContent = bits.join(" \u00b7 ");
      }
    }

    /* Nothing to download until there is something in the project. */
    if (els.projectFoot) {
      els.projectFoot.style.display = getResults(project).length ? "" : "none";
    }
  }

  /* --------------------------------------------------------------------------
     The run row. Assessments and the duty model are the same kind of thing here:
     named work you can start with one click.
     -------------------------------------------------------------------------- */
  function renderRunRow() {
    if (!els.runRow) return;
    const project = getActiveProject();

    const items = ASSESSMENT_MODULES.map(m => {
      const done = latestAssessment(project, m.id);
      const stale = done ? assessmentStaleness(done, project) : null;
      return {
        id: m.id, kind: "assessment",
        name: assessmentModuleName(m, project),
        state: assessmentRunning.has(m.id) ? "running" : done ? (stale ? "stale" : "done") : "",
        band: done ? done.band : null
      };
    });

    const trade = latestTradeResult(project);
    items.push({
      id: "duty", kind: "tool", name: "Duty model",
      state: trade ? "done" : "", band: null
    });

    els.runRow.innerHTML = items.map(i => `
      <button class="run-chip ${i.state}" data-run="${i.id}" ${i.state === "running" ? "disabled" : ""}>
        ${i.band ? `<span class="run-dot ${assessmentBandClass(i.band)}"></span>` : ""}
        <span>${escapeHtml(i.name)}</span>
        ${i.state === "running" ? `<span class="run-chip-state">running</span>` : ""}
        ${i.state === "stale" ? `<span class="run-chip-state">stale</span>` : ""}
      </button>`).join("");
  }

  /* --------------------------------------------------------------------------
     The results stack. Every answer, assessment and duty model lands here.
     -------------------------------------------------------------------------- */
  let expandedResultId = null;

  function resultMetaLine(r) {
    const bits = [];
    if (r.kind === "assessment" && r.band) {
      bits.push((ASSESSMENT_BANDS[r.band] || {}).label || r.band);
    }
    bits.push(formatTimestamp(r.createdAt));
    if (r.trimmed) bits.push("summary only");
    return bits.join(" \u00b7 ");
  }

  function renderResults() {
    if (!els.resultsList) return;
    const project = getActiveProject();
    const results = getResults(project);

    if (!results.length) {
      els.resultsList.innerHTML = `
        <div class="results-empty">
          <p>Nothing yet. Describe the decision above, or run an assessment.</p>
          <p class="results-empty-sub">Everything this project produces collects here and becomes the report.</p>
        </div>`;
      return;
    }

    els.resultsList.innerHTML = results.map(r => {
      const open = r.id === expandedResultId;
      return `
        <article class="result ${open ? "open" : ""} kind-${r.kind}" data-result="${r.id}">
          <button class="result-head" data-toggle="${r.id}">
            <span class="result-caret">${open ? "&#9662;" : "&#9656;"}</span>
            <span class="result-main">
              <span class="result-title">${escapeHtml(r.title || "Untitled")}</span>
              ${r.summary ? `<span class="result-summary">${escapeHtml(r.summary)}</span>` : ""}
            </span>
            <span class="result-meta">
              ${r.kind === "assessment" && r.band
                ? `<span class="assessment-band ${assessmentBandClass(r.band)}">${escapeHtml((ASSESSMENT_BANDS[r.band] || {}).label || r.band)}</span>`
                : ""}
              <span class="result-stamp">${escapeHtml(formatTimestamp(r.createdAt))}</span>
            </span>
          </button>
          <div class="result-body" id="body-${r.id}"></div>
        </article>`;
    }).join("");

    if (expandedResultId) mountResultBody(expandedResultId);
  }

  /* Expanding a result moves the one live detail block into its card. That is
     what lets a card hold a full streamed answer or the interactive duty model
     without either being rebuilt per card. */
  function mountResultBody(id) {
    const r = resultById(id);
    const host = document.getElementById("body-" + id);
    if (!r || !host) return;

    if (r.kind === "trade") {
      host.appendChild(els.tradeDetail);
      els.tradeDetail.hidden = false;
      loadTradeIntoPanel(r);
      return;
    }

    host.appendChild(els.answerDetail);
    els.answerDetail.hidden = false;

    if (r.trimmed || !r.raw) {
      host.insertAdjacentHTML("beforeend", `
        <div class="result-trimmed">
          The full text of this one was dropped to save space. Ask it again to rebuild it.
          <button class="result-rerun" data-rerun="${r.id}">Run again</button>
        </div>`);
      els.answerDetail.hidden = true;
      return;
    }

    /* Rendering from stored text, so no API call and no cost. */
    els.answerStatus.classList.add("done");
    els.answerBrief.classList.add("visible");
    lastSections = r.sections || {};
    lastQuestion = r.title;
    progressiveRender(r.raw);
    renderSources((r.sections || {}).SOURCES || "");
    renderProvenanceStrip();
  }

  function toggleResult(id) {
    /* Park the movable blocks back on the section before the DOM they sit in
       is replaced, otherwise re-rendering the list would destroy them. */
    parkDetailBlocks();
    expandedResultId = (expandedResultId === id) ? null : id;
    renderResults();
  }

  function parkDetailBlocks() {
    if (els.answerDetail && els.answerDetail.parentElement !== els.projectView) {
      els.answerDetail.hidden = true;
      els.projectView.appendChild(els.answerDetail);
    }
    if (els.tradeDetail && els.tradeDetail.parentElement !== els.projectView) {
      els.tradeDetail.hidden = true;
      els.projectView.appendChild(els.tradeDetail);
    }
  }

  /* --------------------------------------------------------------------------
     Setup. Everything the user set once and does not want in the way.
     -------------------------------------------------------------------------- */
  function renderSetup() {
    const project = getActiveProject();
    const live = activeMemories();
    const superseded = getMemories().filter(m => m.status === "superseded");
    const docs = project.documents || [];

    if (els.projectRoleInput) els.projectRoleInput.value = project.role || "";
    if (els.projectGoalInput) els.projectGoalInput.value = project.goal || "";
    if (els.projectIndustryInput) els.projectIndustryInput.value = project.industry || "";
    if (els.projectGeographyInput) els.projectGeographyInput.value = project.geography || "";

    /* Documents and memory came from the research product. They still work, but
       an empty "nothing yet" panel on every project is noise, so each section
       only appears once it holds something. */
    const docSection = els.projectDocsList ? els.projectDocsList.closest(".setup-section") : null;
    if (docSection) docSection.style.display = docs.length ? "" : "none";
    if (els.docAllowance) {
      const allowance = documentAllowance(project);
      els.docAllowance.textContent = `${docs.length} of ${allowance}`;
      els.docAllowance.classList.toggle("at-limit", docs.length >= allowance);
    }
    renderUploadedFiles();

    const memSection = els.memoryList ? els.memoryList.closest(".setup-section") : null;
    if (memSection) memSection.style.display = live.length || superseded.length ? "" : "none";

    if (els.memoryCount) els.memoryCount.textContent = live.length ? `(${live.length})` : "";
    if (els.memoryList) {
      els.memoryList.innerHTML = live.length
        ? live.slice().sort((a, b) => (a.pinned === b.pinned ? b.createdAt - a.createdAt : (a.pinned ? -1 : 1)))
            .map(m => memoryRowHtml(m, false)).join("")
        : `<div class="memory-empty">Nothing established yet.</div>`;
    }
    if (els.memorySuperseded) {
      els.memorySuperseded.style.display = superseded.length ? "block" : "none";
      if (els.memorySupersededCount) els.memorySupersededCount.textContent = superseded.length;
      if (els.memorySupersededList) {
        els.memorySupersededList.innerHTML = superseded
          .slice().sort((a, b) => b.createdAt - a.createdAt)
          .map(m => memoryRowHtml(m, true)).join("");
      }
    }
  }

  /* The box's placeholder does the work the example-question list used to do,
     without being a list of buttons competing with the input. */
  function renderAskHint() {
    if (!els.askBoxHint) return;
    const project = getActiveProject();
    const examples = getExampleQuestions().slice(0, 2);
    els.askBoxHint.innerHTML = examples.length
      ? `Try: ` + examples.map(q => `<button class="ask-hint" data-q="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join("")
      : "";
  }


  els.memoryList && els.memoryList.addEventListener("click", (e) => {
    const pin = e.target.closest("[data-pin]");
    if (pin) {
      const id = pin.dataset.pin;
      const memory = getMemories().find(m => m.id === id);
      setMemoryPinned(id, !(memory && memory.pinned));
      renderProject();
      return;
    }
    const del = e.target.closest("[data-del]");
    if (del) {
      deleteMemory(del.dataset.del);
      renderProject();
    }
  });

  /* Click a memory's text to correct it in place. */
  els.memoryList && els.memoryList.addEventListener("dblclick", (e) => {
    const textEl = e.target.closest(".memory-text");
    if (!textEl) return;
    const current = textEl.textContent;
    const next = prompt("Edit this memory:", current);
    if (next !== null && next.trim() && next.trim() !== current) {
      updateMemoryText(textEl.dataset.id, next);
      renderProject();
    }
  });

  /* The strip under an answer reporting what it added to project memory. */
  function renderMemoryStrip(added) {
    if (!els.memoryStrip) return;
    if (!added || !added.length) {
      els.memoryStrip.style.display = "none";
      els.memoryStrip.innerHTML = "";
      return;
    }
    const project = getActiveProject();
    els.memoryStrip.innerHTML = `
      <div class="memory-strip-head">
        ${added.length} ${added.length === 1 ? "memory" : "memories"} added to ${escapeHtml(project.name)}
      </div>
      <ul class="memory-strip-list">
        ${added.map(m => `<li><span class="memory-kind">${escapeHtml(m.kind)}</span>${escapeHtml(m.text)}</li>`).join("")}
      </ul>`;
    els.memoryStrip.style.display = "block";
  }

  /* --------------------------------------------------------------------------
     There are no modes. A question either wants levers, scenarios and a
     breakeven or it does not, and the model is better placed to judge that than
     the user is before they have typed anything. The simulation sections are
     still defined in the prompt and still render; they just arrive when the
     question warrants them.
     -------------------------------------------------------------------------- */
  let lastMode = "ask";

  /* The corridor this thread runs against. Defaults to the active project's
     primary and can be switched per thread from the ask form. */
  let currentCorridorId = null;
  let lastCorridorId = null;

  function getCorridorId() {
    const project = getActiveProject();
    if (currentCorridorId && (project.corridors || []).includes(currentCorridorId)) {
      return currentCorridorId;
    }
    return project.primaryCorridor || DEFAULT_CORRIDOR_ID;
  }

  function setCorridorId(id) {
    currentCorridorId = id;
  }

  /* Every turn carries this. When the user has described a decision rather than
     asked a question, these sections are what make the answer useful, and the
     model can tell which it is looking at far better than a mode tab set before
     anything was typed. */
  function promptSimulationMode() {
    return `
  DECISIONS
  If the user has described a decision they are weighing rather than asked a
  question of fact, answer it as a decision. Be decisive. Add the three sections
  below, keep the prose sections short, and let the levers and scenarios carry
  the weight. If the turn is a plain question of fact, omit all three and answer
  normally. Do not add them out of habit.

  When you are answering a decision, these section rules apply:

  [[HEADLINE]] — The verdict in one sentence. State the directional call.

  [[KEY_NUMBERS]] — Only 2-3 figures, each one decision-critical. Drop anything the reader does not need to make or understand the call.

  [[BODY]] — Max 2-3 bullets. The core claim and its strongest piece of evidence. No exhaustive listing. Each bullet must directly support or qualify the recommendation.

  [[MECHANISM]] — One short paragraph, max 3 sentences. The causal chain that produces the verdict. Name the specific instrument or market structure doing the work.

  [[DRIVERS]] — Max 2 items. The forces most likely to move the decision in the near term.

  [[TABLE]] — Omit entirely. Data belongs in [[LEVERS]] or [[SCENARIOS]].

  [[RISKS]] — Max 2 items. What would flip the recommendation.

  [[LEVERS]]
  A tab-separated table, header row first: Lever | Current state | Flip point. 2-4 rows. Each row names one variable the decision genuinely hangs on (a policy renewal, a tariff rate, a currency move, a competitor action) and the specific point at which it would flip the recommendation.

  [[SCENARIOS]]
  A tab-separated table, header row first: Scenario | Trigger or assumption | Likelihood | Outcome for the decision | What to do. 2-4 rows covering the realistic branches (e.g. the policy extends, it lapses, it partially extends). Likelihood is qualitative (Likely, Possible, Unlikely) unless a cited source gives a number. Every row must be something the user could actually act on.

  [[BREAKEVEN]]
  One or two sentences naming the exact threshold, in a number, rate or date, at which the decision flips from one direction to the other. This is the single most decisive line in the brief. If no clean numeric threshold exists, state the closest qualitative trigger point instead of leaving this vague.

  [[READOUT]] — The recommendation, not a summary. State a direction plainly: Proceed, Hold, or Hedge. Name the specific trigger that would make the user revisit this call. Do not write "it depends" without also saying depends on what, exactly, and what to watch for.

  [[HOW]] — Omit unless a figure is Derived or Projected.

  [[CONFIDENCE]] — One line if evidence is thin.

  [[CANNOT_ANSWER]] — One line if a data gap blocks the call.

  [[SOURCES]] — Numbered, tier-prefixed, as usual.

  [[FOLLOW_UPS]] — Max 3 questions, each actionable.

  Every figure and probability in these sections still needs a citation marker and a label, exactly as in the rest of the brief.

  If the user has uploaded project documents, use them to inform the LEVERS, SCENARIOS, and BREAKEVEN sections — these should reflect the user's actual situation, not a generic case.
  `;
  }

  /* Uploaded documents belong to the project, not one mode — this applies
     whether the current turn is Ask or Simulate. */
  function promptUploadedDocuments() {
    const documents = getProjectDocuments();
    if (!documents.length) return "";
    return `
  This project has documents attached, appearing in a <user_uploaded_context> block at the start of the first user turn, each tagged with a name and type attribute. Treat these as the user's own data:
  - Cite figures from uploaded documents by document name (e.g. "per Q3-financials.xlsx") rather than by source tier.
  - If a figure from an uploaded document conflicts with a public source, note both and flag the discrepancy.
  - Do not invent or infer figures from the documents. If a document does not contain a relevant figure, say so.
  `;
  }

  /* --------------------------------------------------------------------------
     File upload — Simulate mode only. Extracts text from user-supplied
     documents and injects it as context before the simulation runs.
     -------------------------------------------------------------------------- */
  // Configure pdf.js worker if available
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  const MAX_FILE_TEXT_BYTES = 200 * 1024; // 200 KB extracted text limit per file

  /* Documents live on the active project, not a page-session variable — that
     is what stops a memo attached in one project or thread from silently
     riding along into another. */
  function getProjectDocuments() {
    return getActiveProject().documents || [];
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function getFileExtension(name) {
    return (name.split(".").pop() || "").toLowerCase();
  }

  async function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Failed to read file: " + file.name));
      reader.readAsArrayBuffer(file);
    });
  }

  async function parseTextFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Failed to read file: " + file.name));
      reader.readAsText(file);
    });
  }

  async function parseXlsx(arrayBuffer) {
    if (!window.XLSX) return "[Excel file — parser not available]";
    const wb = XLSX.read(arrayBuffer, { type: "array" });
    const sheets = [];
    for (const name of wb.SheetNames) {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
      if (csv.trim()) sheets.push(`--- Sheet: ${name} ---\n${csv}`);
    }
    return sheets.join("\n\n") || "[Excel file — no data found]";
  }

  async function parsePdf(arrayBuffer) {
    if (!window.pdfjsLib) return "[PDF file — parser not available]";
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map(item => item.str).join(" ");
      if (text.trim()) pages.push(`--- Page ${i} ---\n${text}`);
    }
    return pages.join("\n\n") || "[PDF file — no text found]";
  }

  async function parsePptx(arrayBuffer) {
    if (!window.JSZip) return "[PowerPoint file — parser not available]";
    const zip = await JSZip.loadAsync(arrayBuffer);
    const slides = [];
    const slideFiles = Object.keys(zip.files)
      .filter(name => name.match(/^ppt\/slides\/slide\d+\.xml$/))
      .sort();
    for (const fileName of slideFiles) {
      const xml = await zip.file(fileName).async("text");
      // Strip XML tags, decode entities, collapse whitespace
      const text = xml
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
      if (text) slides.push(text);
    }
    return slides.length
      ? slides.map((s, i) => `--- Slide ${i + 1} ---\n${s}`).join("\n\n")
      : "[PowerPoint file — no text found]";
  }

  async function parseFile(file) {
    const ext = getFileExtension(file.name);
    const textExts = ["txt", "csv", "json", "md"];

    if (textExts.includes(ext)) {
      return await parseTextFile(file);
    }

    const buffer = await readFileAsArrayBuffer(file);

    if (ext === "xlsx" || ext === "xls") {
      return await parseXlsx(buffer);
    }
    if (ext === "pdf") {
      return await parsePdf(buffer);
    }
    if (ext === "pptx") {
      return await parsePptx(buffer);
    }

    // Unknown extension — try as text
    return await parseTextFile(file);
  }

  function renderUploadedFiles() {
    const documents = getProjectDocuments();
    const chipsHtml = documents.map(f => `
      <div class="file-chip">
        <span class="file-chip-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
        <span class="file-chip-size">${formatFileSize(f.size)}</span>
        <button class="file-chip-remove" data-id="${f.id}" title="Remove">&times;</button>
      </div>
    `).join("");
    /* Attached documents show in the box, so what a question will be answered
       against is visible while you type it. */
    if (els.askBoxFiles) els.askBoxFiles.innerHTML = chipsHtml;
    if (els.attachCount) els.attachCount.textContent = documents.length || "";
    if (els.projectDocsList) {
      els.projectDocsList.innerHTML = documents.length ? chipsHtml
        : `<div class="memory-empty">No documents attached to this project yet.</div>`;
    }
  }

  els.askBoxFiles && els.askBoxFiles.addEventListener("click", (e) => {
    const btn = e.target.closest(".file-chip-remove");
    if (btn) { removeUploadedFile(btn.dataset.id); renderProject(); }
  });

  function removeUploadedFile(id) {
    updateActiveProject(project => {
      project.documents = (project.documents || []).filter(d => d.id !== id);
    });
    renderUploadedFiles();
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList);
    if (!files.length) return;

    const allowance = documentAllowance(getActiveProject());
    const remaining = allowance - getProjectDocuments().length;
    if (remaining <= 0) {
      alert(`This project's document allowance is ${allowance}. Remove a document to add another.`);
      return;
    }

    const toProcess = files.slice(0, remaining);
    const parsed = [];
    for (const file of toProcess) {
      try {
        const text = await parseFile(file);
        const truncated = text.length > MAX_FILE_TEXT_BYTES
          ? text.slice(0, MAX_FILE_TEXT_BYTES) + "\n[...truncated at 200KB]"
          : text;
        parsed.push({
          id: newProjectId(),
          name: file.name,
          size: file.size,
          text: truncated,
          type: getFileExtension(file.name),
          addedAt: Date.now()
        });
      } catch (err) {
        console.warn("Failed to parse file:", file.name, err);
        alert(`Could not parse ${file.name}: ${err.message}`);
      }
    }

    if (parsed.length) {
      updateActiveProject(project => {
        project.documents = (project.documents || []).concat(parsed);
      });
    }
    renderUploadedFiles();
  }

  if (els.fileInput) {
    els.fileInput.addEventListener("change", () => {
      handleFiles(els.fileInput.files).then(() => renderProject());
      els.fileInput.value = "";
    });
  }

  /* Same pipeline from the setup panel. handleFiles() and getProjectDocuments()
     are project-scoped rather than tied to one input element. */
  if (els.projectFileInput) {
    els.projectFileInput.addEventListener("change", () => {
      handleFiles(els.projectFileInput.files).then(() => renderProject());
      els.projectFileInput.value = "";
    });
  }

  els.verbositySelect && els.verbositySelect.addEventListener("change", () => {
    setVerbosity(els.verbositySelect.value);
  });

  els.apiKeySave.addEventListener("click", () => {
    const val = els.apiKeyInput.value.trim();
    if (val) {
      setApiKey(val);
      els.apiKeyInput.value = "";
    }
    if (els.verbositySelect) setVerbosity(els.verbositySelect.value);
    els.apiKeyBar.classList.remove("visible");
  });

  els.apiKeyInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") els.apiKeySave.click();
  });

  els.navSettings.addEventListener("click", () => {
    els.apiKeyBar.classList.toggle("visible");
    if (els.apiKeyBar.classList.contains("visible")) {
      if (els.verbositySelect) els.verbositySelect.value = getVerbosity();
      els.apiKeyInput.focus();
    }
  });

  els.navHome && els.navHome.addEventListener("click", showHome);
  els.navProject && els.navProject.addEventListener("click", () => showProject());
  els.navBrand && els.navBrand.addEventListener("click", () => showProject());

  /* The workspace is where the analysis is actually done. The home page sells
     the service; this is the door for whoever delivers it. */
  els.startProjectBtn && els.startProjectBtn.addEventListener("click", () => showProject());



  /* --------------------------------------------------------------------------
     Provenance documentation, generated from the dataset registry so what a
     report claims about its sources cannot drift from what the app reads.
     -------------------------------------------------------------------------- */
  const CHANGELOG = [
    {
      date: "2026-08-27",
      title: "Simulate mode for decision analysis",
      notes: [
        "Added Simulate mode alongside Ask: toggle between explanatory questions and contingent business decisions.",
        "Simulate mode adds Levers, Scenarios and Breakeven sections, and repurposes Readout as a directional recommendation.",
        "Mode-specific example questions, Excel export sheets for Levers and Scenarios, and a decision threshold in the Answer sheet."
      ]
    },
    {
      date: "2026-08-27",
      title: "News sources, verbosity control, wider registry, tidier method table",
      notes: [
        "Added answer length to Settings: Concise, Standard or Deep, adjusting how many key numbers, body bullets, drivers, risks and follow-ups an answer carries.",
        "Registered five news outlets as Tier 4 sources (Reuters, Bloomberg, Financial Times, Semafor Africa, The Africa Report) and instructed Corridor to reach for them before academic or think-tank analysis on anything recent.",
        "Academic and think-tank sources (CBO, Peterson Institute, CGD, Brookings, CSIS, Chatham House, ODI) are now Tier 3, used sparingly and only when government data or news reporting cannot answer the question.",
        "Added CBP, BEA, GAO and the World Bank Logistics Performance Index to the registry, bringing it to 32 datasets.",
        "The dataset register on this page now uses fixed column widths instead of a giant scroll — coverage and caveat text wraps in place."
      ]
    },
    {
      date: "2026-08-27",
      title: "User context, more data sources, PDF export removed",
      notes: [
        "Settings now takes a role and a goal, and tailors the headline, key numbers, drivers, risks, readout and follow-ups to that person's perspective.",
        "The example questions on the ask form change with the stated role, offering infrastructure, CPG, policy or banking directions instead of one fixed set.",
        "Added USDA FAS, USDA ERS, EIA, Treasury OFAC, Ex-Im Bank, DFC, AfDB and UNCTAD to the source registry, bringing it to 23 datasets.",
        "Removed PDF export. It did not render well; Excel export remains the supported way to take an answer out of Corridor.",
        "The home page now names the roles Corridor tailors for: infrastructure and M&A, supply chain and CPG, trade policy and research, banking and investment."
      ]
    },
    {
      date: "2026-08-27",
      title: "Bundled USGS minerals data, layered answers, spreadsheet export",
      notes: [
        "USGS Mineral Commodity Summaries 2026 now ships with Corridor and is queried locally. Questions touching a covered commodity get the authoritative rows without depending on what a web search surfaces.",
        "Registered the USGS Africa minerals and infrastructure geodatabase as reference coverage. Corridor states what its 24 layers hold and never quotes a figure from them.",
        "Answers gained key numbers, mechanism, drivers, a data table and risks.",
        "Added Excel export.",
        "This methodology page now renders from the dataset registry."
      ]
    },
    {
      date: "2026-08-20",
      title: "Depth threading",
      notes: [
        "Follow-up questions ranked by fidelity, with conversation state so a thread builds on prior turns."
      ]
    }
  ];

  function datasetRegisterRows() {
    const order = { bundled: 0, reference: 1, "live-search": 2 };
    const sorted = DATASETS.slice().sort((a, b) =>
      (order[a.kind] - order[b.kind]) || (a.tier - b.tier) || a.title.localeCompare(b.title)
    );

    return sorted.map(d => {
      const coverage = [];
      if (d.coverage) {
        if (d.coverage.rows) coverage.push(`${d.coverage.rows.toLocaleString()} rows`);
        if (d.coverage.commodities) coverage.push(`${d.coverage.commodities} commodities`);
        if (d.coverage.countries) coverage.push(`${d.coverage.countries} countries`);
        if (d.coverage.layers) coverage.push(`${d.coverage.layers} layers`);
      }
      if (d.temporal) coverage.push(`${d.temporal.start}–${d.temporal.end}`);

      const link = d.doi || d.url;

      return `<tr>
        <td scope="row">
          <span class="method-ds-title">${escapeHtml(d.title)}</span>
          <span class="method-ds-pub">${escapeHtml(d.publisher)}</span>
        </td>
        <td class="num"><span class="source-tier tier-${d.tier}">T${d.tier}</span></td>
        <td><span class="method-kind kind-${d.kind}">${escapeHtml(d.kind)}</span></td>
        <td>${escapeHtml(coverage.join(" · ") || "—")}</td>
        <td>${escapeHtml(d.cadence || "—")}</td>
        <td class="method-caveat">${escapeHtml(d.caveats || "—")}</td>
        <td>${link ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener">Source &#8599;</a>` : "—"}</td>
        <td class="method-mono">${escapeHtml(d.ingested || "—")}</td>
      </tr>`;
    }).join("");
  }

  /* The dataset register, rescued from the old Method page. It is worth more as
     an appendix to a report someone actually takes to a committee than as a
     standalone page nobody visited. */

  /* --------------------------------------------------------------------------
     System prompt — the discipline lives here
     -------------------------------------------------------------------------- */
  /* The source hierarchy is generated from the registry in datasets.js so the
     prompt, the Method page and the exports can never describe different data. */
  function promptSourceHierarchy() {
    const lines = [];

    const bundled = datasetsByKind("bundled");
    if (bundled.length) {
      lines.push("Bundled datasets. Corridor ships these and queries them locally. When rows from one appear in the user turn inside a <bundled_data> block, those rows are authoritative: quote them directly, do NOT web search to confirm them, and cite them at the tier shown.");
      for (const d of bundled) {
        lines.push(`- [T${d.tier}] ${d.publisher} — ${d.title}. ${d.summary}`);
        if (d.caveats) lines.push(`  Caveats: ${d.caveats}`);
      }
      lines.push("");
    }

    const reference = datasetsByKind("reference");
    if (reference.length) {
      lines.push("Reference datasets. Corridor holds the metadata for these, not the data itself. You may state that the dataset exists, name the layers or fields it carries, and point to its DOI. You must NEVER quote a coordinate, facility count, capacity or any other figure from them, and never imply you queried them.");
      for (const d of reference) {
        lines.push(`- [T${d.tier}] ${d.publisher} — ${d.title}${d.doi ? ` (${d.doi})` : ""}. ${d.summary}`);
        if (d.coverage && d.coverage.layers) lines.push(`  ${d.coverage.layers} geospatial layers, coverage ${d.temporal.start} to ${d.temporal.end}.`);
      }
      lines.push("");
    }

    lines.push("Live sources, reached by web search. Prefer them in strict tier order, falling to a lower tier only when the tier above cannot answer:");
    lines.push("");

    for (const tier of [1, 2]) {
      const inTier = datasetsByKind("live-search").filter(d => d.tier === tier);
      if (!inTier.length) continue;
      lines.push(`Tier ${tier}, ${TIER_NAMES[tier].toLowerCase()}:`);
      for (const d of inTier) {
        lines.push(`- ${d.title} (${d.publisher})${d.cadence ? `. ${d.cadence}` : ""}`);
        if (d.caveats) lines.push(`  Caveats: ${d.caveats}`);
      }
      lines.push("");
    }

    const news = datasetsByKind("live-search").filter(d => d.tier === 4);
    if (news.length) {
      lines.push("Tier 4, news and wire reporting. When Tiers 1 and 2 are silent on something recent, reach for this before Tier 3 academic or think-tank analysis: a wire story about a tariff action this week beats a working paper about tariffs in general.");
      for (const d of news) {
        lines.push(`- ${d.title} (${d.publisher})${d.cadence ? `. ${d.cadence}` : ""}`);
      }
      lines.push("");
    }

    lines.push("Tier 3, academic and think-tank analysis. Use this sparingly, only when the question needs structural policy analysis that Tiers 1, 2 and 4 genuinely do not supply, e.g. a multi-year assessment of a trade program's effect. Do not reach for a working paper when a government dataset or a wire story already answers the question:");
    lines.push("- CBO, Peterson Institute, CGD, Brookings, CSIS, Chatham House, ODI");

    return lines.join("\n");
  }

  function promptUserContext() {
    const ctx = getUserContext();
    if (!ctx.role && !ctx.goal) return "";
    const lines = ["The person asking is:"];
    if (ctx.role) lines.push(ctx.role);
    if (ctx.goal) lines.push(`They are currently working on: ${ctx.goal}`);
    lines.push("");
    lines.push("Tailor every answer to this person's perspective:");
    lines.push("- Frame the headline around what matters to their role, not a generic summary.");
    lines.push("- In KEY_NUMBERS, lead with the figures that move their specific decision.");
    lines.push("- In MECHANISM, emphasise the causal links they can act on from their position.");
    lines.push("- In DRIVERS, weight forces by how much they affect this person's work.");
    lines.push("- In RISKS, prioritise the risks this person's role can monitor or hedge.");
    lines.push("- In READOUT, speak directly to their decision, naming the action space their role controls.");
    lines.push("- In FOLLOW_UPS, propose the deeper questions someone in their position would actually ask next.");

    /* Ground answers in the project's stated goal and uploaded documents */
    const project = getActiveProject();
    if (ctx.goal) {
      lines.push(`- Reference the project goal directly: "${ctx.goal}". Do not answer in the abstract.`);
    }
    const docs = project.documents || [];
    if (docs.length) {
      lines.push(`- The user has uploaded ${docs.length} document(s) to this project: ${docs.map(d => d.name).join(", ")}. Reference them where relevant.`);
    }

    lines.push("");
    lines.push("Do not water down the data or omit standard sections. The tailoring is in emphasis and framing, not in what you include.");
    return lines.join("\n") + "\n";
  }

  function buildSystemPrompt() {
    const today = new Date().toISOString().slice(0, 10);
    const domains = searchDomains([1, 2]).join(", ");

    /* No corridor scoping. The bundled tariff schedule is US-import-side for
       every origin, so narrowing the model to one trade lane only ever made
       answers worse for a sourcing book that spans a dozen countries. */
    return `You are Corridor, an AI analyst covering US import trade: duty and tariff exposure, preference programmes, rules of origin, sourcing economics and the policy that moves them. Any origin country. Today is ${today}.

  You answer questions from two kinds of evidence: datasets Corridor ships and queries locally, and public sources you reach live with the web_search tool. You return a layered, sourced brief. Every figure carries a citation. You never invent a source or a number. If the evidence does not reach, you say so plainly.

  ${promptUserContext()}
  ${promptProjectMemory()}
  ${promptProjectSummary()}
  ${promptUploadedDocuments()}
  ${promptSourceHierarchy()}

  Do not cite blogs, opinion pieces, corporate press releases dressed as analysis, or aggregator sites (Wikipedia, Trading Economics, generic trade portals). If your web search returns those, keep searching for a primary source.

  Source tier classification. Get this right every time. Misclassifying a source undermines the entire answer:
  - Tier 1 is ONLY for data published by government agencies, statistical offices, central banks, customs authorities, or regulatory bodies. Examples: USTR, USITC, CBP, Census Bureau, World Bank WITS, UN Comtrade, USGS. A government agency's official website is Tier 1. A journalist writing ABOUT government data on a news site is NOT Tier 1.
  - Tier 2 is for multilateral institutions and intergovernmental organisations that publish statistics: WTO, IMF, UN agencies, African Development Bank, World Trade Organization.
  - Tier 3 is for analysis and commentary: think tanks (Brookings, CSIS, Chatham House, Peterson Institute), academic working papers, research institutes, policy briefs.
  - Tier 4 is for journalism and wire reporting: Reuters, Bloomberg, Financial Times, AP, Nikkei, Business Daily, The East African, Politico. A news article reporting on a tariff change is Tier 4 even if the underlying data is government-sourced. The journalist is the source, not the government.
  - If you cite a news article, assign it Tier 4. If you cite a government dataset directly, assign it Tier 1. If you are unsure, assign the higher number (lower tier).
  - In [[SOURCES]], write the tier prefix exactly: [T1], [T2], [T3], or [T4]. Never write [T1] for a news outlet.

  Keep academic papers and think-tank studies to a minimum. Government data, multilateral statistics and current news reporting should carry almost every answer. Reach for a scholarly or think-tank source only when the question genuinely needs structural analysis those cannot provide, and even then use one, not several.

  Use the web_search tool at least once for any question about current tariffs, trade values, AGOA status, or policy, unless a <bundled_data> block already answers it in full. Search for current figures dated close to today. Prefer government domains explicitly: ${domains}.

  Density is the point, not length. Every sentence must be load-bearing: a number, a mechanism, a named force, or a threshold — never a restatement of the headline or a transition sentence that adds nothing. A short answer that gives the reader the number, why it is true, what is moving it and what would change it beats a long one that pads to get there.
  ${promptVerbosity()}
  Return your response in this exact delimited format. Do not include any preamble before [[HEADLINE]] or any commentary after [[FOLLOW_UPS]].

  [[HEADLINE]]
  One or two plain-language sentences stating the finding.

  [[KEY_NUMBERS]]
  Three figures a reader should carry away, one per line, in this exact pipe-delimited format:
  <label> | <value with unit> | reported|derived|projected | as of YYYY-MM | {{s:N}}
  Values must be the most decision-relevant figures in the answer, not a restatement of the headline. Every line needs a source marker.

  [[BODY]]
  - Each bullet is a specific claim or figure. Attach citation markers as {{s:N}} where N is the source number. Attach one label as {{label:reported}}, {{label:derived}}, or {{label:projected}}. If a figure is more than 6 months old, add {{fresh:as of YYYY-MM}}.
  - This section carries the argument, not a data dump. 3 to 5 bullets is typical — stop once the argument is made.

  [[MECHANISM]]
  One short paragraph explaining why the finding is true: the causal, legal or policy chain that produces the number. Name the specific instrument, rule, route or market structure doing the work. Cite where the mechanism itself is documented.

  [[DRIVERS]]
  Two or three forces currently moving the number, one per line, in this exact format:
  <direction: UP|DOWN|MIXED> | <short driver name> | <one sentence on the effect and its size where known> {{s:N}}

  [[TABLE]]
  Optional but strongly preferred whenever the answer involves more than two comparable figures. A tab-separated block with a header row, up to 12 rows and 6 columns. First line is the header. Every numeric column states its unit in the header. This table is exported to Excel, so it must stand on its own without the surrounding prose.

  [[RISKS]]
  Two or three bullets naming what would change this answer: a pending decision, a data revision, a disputed figure, or a structural break. Each bullet says what to watch and why it matters.

  ${promptSimulationMode()}
  [[READOUT]]
  One short paragraph telling the reader what the finding means for a decision.

  [[HOW]]
  Optional. Show any calculation step by step. Include only if a figure is Derived or Projected. Omit the section entirely otherwise.

  [[CONFIDENCE]]
  none
  Or write "low: <one sentence naming what data is thin or stale>" when sources are weak.

  [[CANNOT_ANSWER]]
  none
  Or write "<one sentence naming what public data would be needed>" when public sources cannot support the question.

  [[CHART]]
  Optional. Include only when a chart adds clarity. Provide a small JSON block on one line matching one of:
  {"type":"bars","title":"...","unit":"...","data":[{"label":"...","value":123},...]}
  {"type":"line","title":"...","unit":"...","data":[{"label":"2022","value":8.1},...]}
  Rules: maximum 8 data points (bars or line points). Short labels (2-4 words max). Values must come from a cited source. Omit the section if no chart is warranted.

  [[SOURCES]]
  1. [T1] <Source name> — <table or series> — <as-of date> — <url>
  2. [T1] <Source name> — <table or series> — <as-of date> — <url>
  3. [T2] <Source name> — <table or series> — <as-of date> — <url>
  The tier prefix ([T1], [T2], [T3], [T4]) is required. List Tier 1 sources first, then Tier 2, then Tier 3, then Tier 4. The tier reflects who PUBLISHED the data, not what the data is about. A Reuters story about USITC data is [T4] Reuters, not [T1] USITC. If you accessed the data through a government website directly, it is [T1]. If you accessed it through a news article, it is [T4]. When in doubt, use the higher number. If a body claim relies on a Tier 3 or Tier 4 citation alone, add a {{fresh:...}} or {{label:reported}} caveat that names the tier ("per Reuters reporting").

  [[PROJECT_SUMMARY]]
  Two or three sentences describing where this project now stands, rewritten from scratch each time to absorb what this answer added. State the decision or question in play, the figures it turns on, and what is currently unresolved. Write it for someone returning to the project in a month. No preamble, no bullet list.

  [[FOLLOW_UPS]]
  Propose 3 to 4 follow-up questions the user could ask next to go deeper. Rank them by how useful and how well-sourced they would be. Each on its own line, in this exact format:
  {fidelity:HIGH|MED|LOW} {kind:BREAKDOWN|TREND|COMPARISON|SCENARIO|POLICY|COUNTERPARTY} <question>
  - fidelity HIGH means primary government or multilateral data covers it well, so an answer would rest mostly on Tier 1 or Tier 2.
  - fidelity MED means Tier 1 or 2 partially covers it, some Tier 3 analysis would be needed.
  - fidelity LOW means the honest answer would need Tier 3 or 4 sources, or would hit a data gap.
  - kind names the type of deeper question. BREAKDOWN goes granular on a number in the answer. TREND asks about direction over time. COMPARISON puts one country or product beside another. SCENARIO is a what-if with stated assumptions. POLICY asks how a rule or bill would move the numbers. COUNTERPARTY moves to a specific exporter, sector, or trading partner.
  - Order the list HIGH fidelity first, then MED, then LOW. Do not include LOW-fidelity ones unless a genuinely useful direction sits behind a data gap that the user should know exists.
  - Each question is a single sentence, plain, specific, and answerable in this corridor. No preamble.

  [[MEMORY]]
  Zero to four durable facts this answer established, one per line, in this exact pipe-delimited format:
  <fact|constraint|figure|preference> | <the fact in one sentence, self-contained> | supersedes: <exact text of a memory listed above that this replaces, or none>
  - Only record what stays true beyond this thread: the user's own figures, constraints and decisions, and stable external facts that carry a date.
  - Never record transient reasoning, a restatement of the headline, or anything already in the memory list you were given.
  - Each fact must stand alone months later, so name the subject rather than saying "it" or "the rate".
  - Write "none" on its own line if this answer established nothing durable.

  Rules that are absolute:
  - Never invent a source or a number.
  - Every number in the body has a {{s:N}} marker and a label.
  - Each citation marker references exactly one source: {{s:N}}. Never bundle multiple sources in one marker like {{s:5,10}}. If a claim draws on two sources, write two separate markers: {{s:5}} {{s:10}}.
  - Reported means the figure came from a cited source. Derived means Corridor computed it from cited sources and the calculation is in [[HOW]]. Projected means a scenario built on stated assumptions, also shown in [[HOW]].
  - If sources disagree, present both.
  - Scenarios always carry {{label:projected}} and state assumptions.
  - Rows inside a <bundled_data> block are already verified. Cite them at their stated tier with the row's own year and unit. Do not soften them with hedges and do not search to double-check them.
  - For reference datasets you have metadata for but not data, you may say what the dataset covers and point to its DOI. Saying "the USGS Africa geodatabase maps mineral exporting ports and rail, though Corridor does not query the geodata directly" is correct and useful. Inventing a port count from it is a serious error.

  Follow-up handling. If this is not the first turn, the user is asking a deeper question about the prior answer. Preserve source numbering where possible so the reader can carry citations across turns, and re-cite fully rather than say "see above". Refer back to specific figures from the prior answer only when the user's question genuinely narrows on them. Every follow-up answer keeps the full format, including a fresh [[FOLLOW_UPS]] section that proposes the next deeper questions.

  Writing style, follow exactly:
  - No em dashes. Use full stops or commas or the word "and".
  - Do not use: unlock, elevate, empower, seamless, leverage, supercharge, revolutionary, cutting-edge, game-changing, transform, robust, holistic, harness, tailored, bespoke, curated, powerful, "in today's world", "the future of", "at the heart of", "we believe", "whether you're".
  - Plain, declarative, active voice. Concrete nouns and numbers over adjectives. No exclamation marks, no emoji.
  - Vary sentence length. Write as a professional Economist blog would.`;
  }

  /* --------------------------------------------------------------------------
     Status stepper — cycles messages while the request runs
     -------------------------------------------------------------------------- */
  let statusTimer = null;

  function startStatus() {
    const steps = els.statusSteps.querySelectorAll(".status-step");
    steps.forEach(s => s.classList.remove("active", "done-step"));
    let idx = 0;
    const advance = () => {
      steps.forEach((s, i) => {
        if (i < idx) { s.classList.add("done-step"); s.classList.remove("active"); s.querySelector(".check").textContent = "✓"; }
        else if (i === idx) { s.classList.add("active"); s.classList.remove("done-step"); s.querySelector(".check").textContent = "○"; }
        else { s.classList.remove("active", "done-step"); s.querySelector(".check").textContent = ""; }
      });
      idx = Math.min(idx + 1, steps.length - 1);
    };
    advance();
    statusTimer = setInterval(advance, 2200);
  }

  function completeStatus() {
    if (statusTimer) { clearInterval(statusTimer); statusTimer = null; }
    const steps = els.statusSteps.querySelectorAll(".status-step");
    steps.forEach(s => { s.classList.add("done-step"); s.classList.remove("active"); s.querySelector(".check").textContent = "✓"; });
    setTimeout(() => els.answerStatus.classList.add("done"), 300);
  }

  function markStep(name) {
    const steps = els.statusSteps.querySelectorAll(".status-step");
    const idx = { "searching": 0, "reading": 1, "checking": 2, "assembling": 3 }[name];
    if (idx === undefined) return;
    steps.forEach((s, i) => {
      if (i < idx) { s.classList.add("done-step"); s.classList.remove("active"); s.querySelector(".check").textContent = "✓"; }
      else if (i === idx) { s.classList.add("active"); s.classList.remove("done-step"); s.querySelector(".check").textContent = "○"; }
    });
  }

  /* --------------------------------------------------------------------------
     Parser — splits streaming text into named sections
     -------------------------------------------------------------------------- */
  /* Every section the response contract defines. The parser below does not read
     this list, since it takes whatever [[SECTION]] markers it finds, but keeping
     the roster in one place is what stops the prompt and the renderers drifting
     apart as sections get added. */
  const SECTION_ORDER = [
    /* every answer */
    "HEADLINE", "KEY_NUMBERS", "BODY", "MECHANISM", "DRIVERS", "TABLE", "RISKS",
    "READOUT", "HOW", "CONFIDENCE", "CANNOT_ANSWER", "CHART", "SOURCES",
    "PROJECT_SUMMARY", "FOLLOW_UPS", "MEMORY",
    /* simulate mode */
    "LEVERS", "SCENARIOS", "BREAKEVEN",
    /* assessments */
    "VERDICT", "SCORE"
  ];
  const SECTION_RE = /\[\[([A-Z_]+)\]\]/g;

  function parseSections(text) {
    const out = {};
    const positions = [];
    let m;
    SECTION_RE.lastIndex = 0;
    while ((m = SECTION_RE.exec(text)) !== null) {
      positions.push({ name: m[1], start: m.index + m[0].length, headerStart: m.index });
    }
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      const end = i + 1 < positions.length ? positions[i + 1].headerStart : text.length;
      out[p.name] = text.slice(p.start, end).trim();
    }
    return out;
  }

  /* --------------------------------------------------------------------------
     Render — turns section text into DOM with citations and labels
     -------------------------------------------------------------------------- */
  function renderInline(text) {
    if (!text) return "";
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    let out = esc(text);
    /* Handle multi-citations like {{s:5,10}} or {{s:5, 10, 15}} */
    out = out.replace(/\{\{s:([\d,\s]+)\}\}/g, (_, nums) => {
      return nums.split(/,\s*/).filter(Boolean).map(n => {
        const num = n.trim();
        return `<a class="source-marker" href="#source-${num}" data-src="${num}">${num}</a>`;
      }).join(", ");
    });
    out = out.replace(/\{\{label:(reported|derived|projected)\}\}/gi, (_, kind) => {
      const k = kind.toLowerCase();
      const cap = k.charAt(0).toUpperCase() + k.slice(1);
      return `<span class="data-label ${k}">${cap}</span>`;
    });
    out = out.replace(/\{\{fresh:([^}]+)\}\}/g, (_, d) => `<span class="data-freshness">&middot; ${esc(d)}</span>`);
    return out;
  }

  function renderBody(bodyText) {
    if (!bodyText) return "";
    const lines = bodyText.split(/\n/).map(l => l.trim()).filter(Boolean);
    const bullets = [];
    let paras = [];
    let currentBullet = null;
    for (const line of lines) {
      if (line.startsWith("- ") || line.startsWith("* ")) {
        if (currentBullet !== null) bullets.push(currentBullet);
        currentBullet = line.slice(2).trim();
      } else if (currentBullet !== null) {
        currentBullet += " " + line;
      } else {
        paras.push(line);
      }
    }
    if (currentBullet !== null) bullets.push(currentBullet);

    let html = "";
    if (paras.length) {
      html += paras.map(p => `<p>${renderInline(p)}</p>`).join("");
    }
    if (bullets.length) {
      html += `<ul>${bullets.map(b => `<li>${renderInline(b)}</li>`).join("")}</ul>`;
    }
    return html;
  }

  /* KEY_NUMBERS: "<label> | <value> | reported | as of YYYY-MM | {{s:N}}"
     Rendered as the sticky left rail. Lines that do not parse are skipped
     rather than shown malformed. */
  function renderKeyNumbers(text) {
    if (!text) return "";
    const items = [];

    for (const raw of text.split(/\n/)) {
      const line = raw.trim().replace(/^[-*]\s*/, "");
      if (!line || !line.includes("|")) continue;

      const parts = line.split("|").map(p => p.trim());
      if (parts.length < 2) continue;

      const [label, value] = parts;
      if (!label || !value) continue;

      const kind = (parts[2] || "").toLowerCase().match(/reported|derived|projected/);
      const asOf = (parts[3] || "").replace(/^as of\s*/i, "").trim();
      const marker = (parts.slice(4).join(" ") || parts[3] || "").match(/\{\{s:\d+(?:\s*,\s*\d+)*\}\}/);

      items.push(`
        <div class="keynum">
          <div class="keynum-label">${escapeHtml(label)}</div>
          <div class="keynum-value">${renderInline(value)}</div>
          <div class="keynum-meta">
            ${kind ? `<span class="data-label label-${kind[0]}">${kind[0]}</span>` : ""}
            ${asOf ? `<span class="keynum-asof">${escapeHtml(asOf)}</span>` : ""}
            ${marker ? renderInline(marker[0]) : ""}
          </div>
        </div>`);
    }

    if (!items.length) return "";
    return `<div class="keynums-title">Key numbers</div>${items.join("")}`;
  }

  /* DRIVERS: "<UP|DOWN|MIXED> | <name> | <effect> {{s:N}}" */
  const DRIVER_GLYPH = { UP: "&uarr;", DOWN: "&darr;", MIXED: "&harr;" };

  function renderDrivers(text) {
    if (!text) return "";
    const rows = [];

    for (const raw of text.split(/\n/)) {
      const line = raw.trim().replace(/^[-*]\s*/, "");
      if (!line || !line.includes("|")) continue;

      const parts = line.split("|").map(p => p.trim());
      if (parts.length < 2) continue;

      const dir = (parts[0].toUpperCase().match(/UP|DOWN|MIXED/) || ["MIXED"])[0];
      const name = parts[1];
      const effect = parts.slice(2).join(" ").trim();

      rows.push(`
        <div class="driver driver-${dir.toLowerCase()}">
          <div class="driver-dir" aria-label="${dir}">${DRIVER_GLYPH[dir]}</div>
          <div class="driver-body">
            <div class="driver-name">${escapeHtml(name)}</div>
            ${effect ? `<div class="driver-effect">${renderInline(effect)}</div>` : ""}
          </div>
        </div>`);
    }

    return rows.length ? rows.join("") : "";
  }

  /* TABLE: tab-separated, first line is the header. Falls back to splitting on
     runs of 2+ spaces when the model emits aligned columns instead of tabs. */
  function parseTable(text) {
    if (!text) return null;

    const lines = text.split(/\n/)
      .map(l => l.trim())
      .filter(l => l && !/^[-|+\s]+$/.test(l));
    if (lines.length < 2) return null;

    const split = (line) => {
      if (line.includes("\t")) return line.split("\t").map(c => c.trim());
      if (line.includes("|")) {
        return line.replace(/^\||\|$/g, "").split("|").map(c => c.trim());
      }
      return line.split(/\s{2,}/).map(c => c.trim());
    };

    const header = split(lines[0]);
    if (header.length < 2) return null;

    const rows = lines.slice(1)
      .map(split)
      .filter(r => r.length > 1)
      .map(r => {
        const padded = r.slice(0, header.length);
        while (padded.length < header.length) padded.push("");
        return padded;
      });

    return rows.length ? { header, rows } : null;
  }

  function tableHtml(table) {
    const head = table.header.map(h => `<th>${escapeHtml(h)}</th>`).join("");
    const body = table.rows.map(r =>
      `<tr>${r.map((c, i) => {
        const numeric = /^[<>~]?\s*[\d,.\s]+%?$/.test(c) && /\d/.test(c);
        return `<td class="${numeric ? "num" : ""}"${i === 0 ? ' scope="row"' : ""}>${renderInline(c)}</td>`;
      }).join("")}</tr>`
    ).join("");
    return `<table class="data-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }

  /* A table wide enough to need horizontal scroll gets a scroll container
     (with CSS scroll-shadow cues and a sticky header) plus an Expand button
     that opens the same table full-width in an overlay — small print in a
     780px column is otherwise unreadable. */
  function renderTable(text, title) {
    const table = parseTable(text);
    if (!table) return "";
    const html = tableHtml(table);
    const safeTitle = escapeHtml(title || "Table");

    return `
      <div class="data-table-wrap" data-table-title="${safeTitle}">
        <button class="table-expand-btn" type="button" title="Expand table">&#10530; Expand</button>
        <div class="data-table-scroll">${html}</div>
      </div>`;
  }

  /* SCENARIOS renders as cards, not a table — five columns of prose does not
     fit a ~780px centre column no matter how the table is styled. Columns
     are matched by header name so a slightly different header row still
     renders correctly. */
  function renderScenarioCards(text) {
    const table = parseTable(text);
    if (!table) return "";

    const colIndex = (name, fallback) => {
      const i = table.header.findIndex(h => h.toLowerCase().includes(name));
      return i !== -1 ? i : fallback;
    };
    const iScenario = colIndex("scenario", 0);
    const iTrigger = colIndex("trigger", 1);
    const iLikelihood = colIndex("likelihood", 2);
    const iOutcome = colIndex("outcome", 3);
    const iAction = (() => {
      const i = colIndex("what to do", -1);
      return i !== -1 ? i : colIndex("action", 4);
    })();

    const cards = table.rows.map(r => {
      const name = r[iScenario] || "";
      const trigger = r[iTrigger] || "";
      const likelihood = (r[iLikelihood] || "").trim();
      const likelihoodMatch = likelihood.toLowerCase().match(/likely|possible|unlikely/);
      const outcome = r[iOutcome] || "";
      const action = r[iAction] || "";

      const row = (label, value, extraClass) => value
        ? `<div class="scenario-row${extraClass ? " " + extraClass : ""}"><span class="scenario-row-label">${label}</span><span>${renderInline(value)}</span></div>`
        : "";

      return `
        <div class="scenario-card">
          <div class="scenario-card-head">
            <div class="scenario-card-name">${renderInline(name)}</div>
            ${likelihood ? `<span class="scenario-likelihood${likelihoodMatch ? " " + likelihoodMatch[0] : ""}">${escapeHtml(likelihood)}</span>` : ""}
          </div>
          ${row("Trigger", trigger)}
          ${row("Outcome", outcome)}
          ${row("What to do", action, "scenario-action")}
        </div>`;
    }).join("");

    return `<div class="scenario-cards">${cards}</div>`;
  }

  /* --------------------------------------------------------------------------
     Table overlay — a wide table in a ~780px column is unreadable no matter
     how it is styled, so Expand opens the same markup full-width instead.
     -------------------------------------------------------------------------- */
  function openTableOverlay(html, title) {
    if (!els.tableOverlay) return;
    if (els.tableOverlayTitle) els.tableOverlayTitle.textContent = title || "Table";
    if (els.tableOverlayBody) els.tableOverlayBody.innerHTML = html;
    els.tableOverlay.classList.add("visible");
    document.body.classList.add("no-scroll");
  }

  function closeTableOverlay() {
    if (!els.tableOverlay) return;
    els.tableOverlay.classList.remove("visible");
    document.body.classList.remove("no-scroll");
    if (els.tableOverlayBody) els.tableOverlayBody.innerHTML = "";
  }

  document.addEventListener("click", (e) => {
    const expandBtn = e.target.closest(".table-expand-btn");
    if (!expandBtn) return;
    const wrap = expandBtn.closest(".data-table-wrap");
    if (!wrap) return;
    const table = wrap.querySelector(".data-table");
    if (table) openTableOverlay(table.outerHTML, wrap.dataset.tableTitle);
  });

  els.tableOverlayClose && els.tableOverlayClose.addEventListener("click", closeTableOverlay);
  els.tableOverlay && els.tableOverlay.addEventListener("click", (e) => {
    if (e.target === els.tableOverlay) closeTableOverlay();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && els.tableOverlay && els.tableOverlay.classList.contains("visible")) {
      closeTableOverlay();
    }
  });

  function renderSources(sourcesText) {
    if (!sourcesText) return "";
    const lines = sourcesText.split(/\n/).map(l => l.trim()).filter(Boolean);
    return lines.map(line => {
      const numMatch = line.match(/^(\d+)[\.\)]\s*(.*)$/);
      if (!numMatch) return "";
      const n = numMatch[1];
      let rest = numMatch[2];
      let tier = "";
      const tierMatch = rest.match(/^\[T([1-4])\]\s*/);
      if (tierMatch) {
        tier = tierMatch[1];
        rest = rest.slice(tierMatch[0].length);
      }
      const parts = rest.split(/\s+—\s+|\s+-\s+|\s+\|\s+/);
      const name = parts[0] || "";
      const series = parts[1] || "";
      const asOf = parts[2] || "";
      let url = parts[3] || "";
      const urlMatch = rest.match(/https?:\/\/\S+/);
      if (urlMatch) url = urlMatch[0].replace(/[.,;]$/, "");
      const tierLabels = { "1": "Government / Primary", "2": "Multilateral", "3": "Analysis", "4": "Reporting" };
      const tierBadge = tier ? `<span class="source-tier tier-${tier}" title="${escapeHtml(tierLabels[tier] || "")}">T${tier} · ${escapeHtml(tierLabels[tier] || "")}</span>` : "";
      const meta = [series, asOf].filter(Boolean).map(s => `<span>${escapeHtml(s)}</span>`).join("");
      const link = url ? `<a class="source-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">View source &#8599;</a>` : "";
      return `<div class="source-item" id="source-${n}"><div class="source-num">${n}</div><div class="source-detail"><div class="source-name">${escapeHtml(name)} ${tierBadge}</div><div class="source-meta">${meta}${link}</div></div></div>`;
    }).join("");
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* Parse a follow-ups block. Each line:
     {fidelity:HIGH} {kind:BREAKDOWN} <question>
     Returns [{fidelity, kind, question}, ...]
  */
  function parseFollowUps(text) {
    if (!text) return [];
    const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
    const items = [];
    for (const line of lines) {
      const m = line.match(/^\{fidelity:(HIGH|MED|LOW)\}\s*\{kind:([A-Z_]+)\}\s*(.+?)\s*$/i);
      if (m) {
        items.push({
          fidelity: m[1].toUpperCase(),
          kind: m[2].toUpperCase(),
          question: m[3].replace(/^["'\-\s]+|["']+$/g, "")
        });
      }
    }
    return items;
  }

  function renderFollowUps(items) {
    if (!items.length) return "";
    const rank = { HIGH: 0, MED: 1, LOW: 2 };
    const rankOf = f => (f in rank ? rank[f] : 3);
    items.sort((a, b) => rankOf(a.fidelity) - rankOf(b.fidelity));
    const kindLabels = {
      BREAKDOWN: "Break down",
      TREND: "Trend",
      COMPARISON: "Compare",
      SCENARIO: "Scenario",
      POLICY: "Policy",
      COUNTERPARTY: "Counterparty"
    };
    const rows = items.map((it, i) => {
      const kindLabel = kindLabels[it.kind] || it.kind;
      return `<button class="followup-item fidelity-${it.fidelity.toLowerCase()}" data-q="${escapeHtml(it.question)}">
        <div class="followup-meta">
          <span class="followup-kind">${escapeHtml(kindLabel)}</span>
          <span class="followup-fidelity">${it.fidelity}</span>
        </div>
        <div class="followup-question">${escapeHtml(it.question)}</div>
        <div class="followup-arrow">&rarr;</div>
      </button>`;
    }).join("");
    return rows;
  }

  /* --------------------------------------------------------------------------
     Chart — SVG bars/line with hover tooltips, expand, download
     -------------------------------------------------------------------------- */
  function renderChart(chartSpec) {
    try {
      const jsonMatch = chartSpec.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return "";
      const spec = JSON.parse(jsonMatch[0]);
      if (!spec.data || !spec.data.length) return "";
      const w = 400, h = 240, padL = 52, padR = 16, padT = 20, padB = 40;
      const innerW = w - padL - padR, innerH = h - padT - padB;
      const values = spec.data.map(d => d.value);
      const max = Math.max(...values);
      const min = Math.min(0, ...values);
      const yScale = v => padT + innerH - ((v - min) / (max - min || 1)) * innerH;
      const unit = spec.unit || "";

      function fmtVal(v) {
        if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1) + "B";
        if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + "M";
        if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + "k";
        return String(Math.round(v * 100) / 100);
      }

      let content = "";
      if (spec.type === "bars") {
        const bw = innerW / spec.data.length * 0.65;
        const gap = innerW / spec.data.length * 0.35;
        content = spec.data.map((d, i) => {
          const x = padL + i * (bw + gap) + gap / 2;
          const y = yScale(d.value);
          const bh = padT + innerH - y;
          const valText = fmtVal(d.value) + (unit ? " " + unit : "");
          return `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="var(--color-ink)" class="chart-bar" data-val="${escapeHtml(valText)}" data-label="${escapeHtml(d.label)}">
                    <title>${escapeHtml(d.label)}: ${escapeHtml(valText)}</title>
                  </rect>
                  <text x="${x + bw/2}" y="${h - 10}" text-anchor="middle" font-family="JetBrains Mono" font-size="10" fill="var(--color-fog)" class="chart-xlabel">${escapeHtml(d.label)}</text>
                  <text x="${x + bw/2}" y="${y - 5}" text-anchor="middle" font-family="JetBrains Mono" font-size="10" fill="var(--color-ink)" class="chart-val">${fmtVal(d.value)}</text>`;
        }).join("");
      } else {
        const step = innerW / (spec.data.length - 1 || 1);
        const pts = spec.data.map((d, i) => `${padL + i * step},${yScale(d.value)}`).join(" ");
        content = `<polyline points="${pts}" fill="none" stroke="var(--color-ink)" stroke-width="1.5"/>`;
        content += spec.data.map((d, i) => {
          const x = padL + i * step, y = yScale(d.value);
          const valText = fmtVal(d.value) + (unit ? " " + unit : "");
          return `<circle cx="${x}" cy="${y}" r="3.5" fill="var(--color-ink)" class="chart-dot" data-val="${escapeHtml(valText)}" data-label="${escapeHtml(d.label)}">
                    <title>${escapeHtml(d.label)}: ${escapeHtml(valText)}</title>
                  </circle>
                  <text x="${x}" y="${h - 10}" text-anchor="middle" font-family="JetBrains Mono" font-size="10" fill="var(--color-fog)" class="chart-xlabel">${escapeHtml(d.label)}</text>
                  <text x="${x}" y="${y - 8}" text-anchor="middle" font-family="JetBrains Mono" font-size="10" fill="var(--color-ink)" class="chart-val">${fmtVal(d.value)}</text>`;
        }).join("");
      }
      const axisTop = yScale(max), axisBot = yScale(min);
      const yTicks = `
        <text x="${padL - 8}" y="${axisTop + 3}" text-anchor="end" font-family="JetBrains Mono" font-size="10" fill="var(--color-fog)">${fmtVal(max)}</text>
        <text x="${padL - 8}" y="${axisBot + 3}" text-anchor="end" font-family="JetBrains Mono" font-size="10" fill="var(--color-fog)">${fmtVal(min)}</text>
        <line x1="${padL}" y1="${padT + innerH}" x2="${w - padR}" y2="${padT + innerH}" stroke="var(--color-ink)" stroke-width="1"/>
      `;
      const svgContent = `${yTicks}${content}`;
      const specJson = escapeHtml(JSON.stringify(spec));
      return `<div class="chart-card" role="figure" aria-label="${escapeHtml(spec.title || "Chart")}">
                <div class="chart-card-header">
                  <div class="chart-card-label">${escapeHtml(spec.title || "Chart")}${unit ? " \u00b7 " + escapeHtml(unit) : ""}</div>
                  <div class="chart-card-actions">
                    <button class="chart-expand-btn" data-chart-spec='${specJson}' title="Expand chart">Expand</button>
                    <button class="chart-download-btn" data-chart-spec='${specJson}' title="Download SVG">Download</button>
                  </div>
                </div>
                <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" class="chart-svg">${svgContent}</svg>
              </div>`;
    } catch (e) {
      return "";
    }
  }

  function formatNum(n) {
    if (Math.abs(n) >= 1000) return (n/1000).toFixed(1) + "k";
    return String(Math.round(n * 100) / 100);
  }

  /* Expand chart into the overlay modal */
  function expandChart(spec) {
    const overlay = els.tableOverlay;
    if (!overlay) return;
    const title = els.tableOverlayTitle;
    const body = els.tableOverlayBody;
    if (title) title.textContent = spec.title || "Chart";

    const w = 700, h = 420, padL = 64, padR = 24, padT = 32, padB = 56;
    const innerW = w - padL - padR, innerH = h - padT - padB;
    const values = spec.data.map(d => d.value);
    const max = Math.max(...values);
    const min = Math.min(0, ...values);
    const yScale = v => padT + innerH - ((v - min) / (max - min || 1)) * innerH;
    const unit = spec.unit || "";

    function fmtVal(v) {
      if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1) + "B";
      if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + "M";
      if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + "k";
      return String(Math.round(v * 100) / 100);
    }

    let content = "";
    if (spec.type === "bars") {
      const bw = innerW / spec.data.length * 0.6;
      const gap = innerW / spec.data.length * 0.4;
      content = spec.data.map((d, i) => {
        const x = padL + i * (bw + gap) + gap / 2;
        const y = yScale(d.value);
        const bh = padT + innerH - y;
        const valText = fmtVal(d.value) + (unit ? " " + unit : "");
        return `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="var(--color-ink)" class="chart-bar" opacity="0.85">
                  <animate attributeName="opacity" from="0" to="0.85" dur="0.3s" fill="freeze"/>
                  <title>${escapeHtml(d.label)}: ${escapeHtml(valText)}</title>
                </rect>
                <text x="${x + bw/2}" y="${h - 14}" text-anchor="middle" font-family="JetBrains Mono" font-size="11" fill="var(--color-fog)">${escapeHtml(d.label)}</text>
                <text x="${x + bw/2}" y="${y - 6}" text-anchor="middle" font-family="JetBrains Mono" font-size="11" fill="var(--color-ink)" font-weight="500">${fmtVal(d.value)}</text>`;
      }).join("");
    } else {
      const step = innerW / (spec.data.length - 1 || 1);
      const pts = spec.data.map((d, i) => `${padL + i * step},${yScale(d.value)}`).join(" ");
      content = `<polyline points="${pts}" fill="none" stroke="var(--color-ink)" stroke-width="2"/>`;
      content += spec.data.map((d, i) => {
        const x = padL + i * step, y = yScale(d.value);
        const valText = fmtVal(d.value) + (unit ? " " + unit : "");
        return `<circle cx="${x}" cy="${y}" r="4" fill="var(--color-ink)">
                  <title>${escapeHtml(d.label)}: ${escapeHtml(valText)}</title>
                </circle>
                <text x="${x}" y="${h - 14}" text-anchor="middle" font-family="JetBrains Mono" font-size="11" fill="var(--color-fog)">${escapeHtml(d.label)}</text>
                <text x="${x}" y="${y - 10}" text-anchor="middle" font-family="JetBrains Mono" font-size="11" fill="var(--color-ink)" font-weight="500">${fmtVal(d.value)}</text>`;
      }).join("");
    }
    const axisTop = yScale(max), axisBot = yScale(min);
    const yTicks = `
      <text x="${padL - 10}" y="${axisTop + 4}" text-anchor="end" font-family="JetBrains Mono" font-size="11" fill="var(--color-fog)">${fmtVal(max)}</text>
      <text x="${padL - 10}" y="${axisBot + 4}" text-anchor="end" font-family="JetBrains Mono" font-size="11" fill="var(--color-fog)">${fmtVal(min)}</text>
      <line x1="${padL}" y1="${padT + innerH}" x2="${w - padR}" y2="${padT + innerH}" stroke="var(--color-ink)" stroke-width="1"/>
    `;
    const svgStr = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;">${yTicks}${content}</svg>`;
    body.innerHTML = `<div style="padding:var(--space-lg);">${svgStr}</div>`;
    overlay.classList.add("visible");
  }

  /* Download chart as SVG file */
  function downloadChart(spec) {
    const w = 700, h = 420, padL = 64, padR = 24, padT = 32, padB = 56;
    const innerW = w - padL - padR, innerH = h - padT - padB;
    const values = spec.data.map(d => d.value);
    const max = Math.max(...values);
    const min = Math.min(0, ...values);
    const yScale = v => padT + innerH - ((v - min) / (max - min || 1)) * innerH;
    const unit = spec.unit || "";

    function fmtVal(v) {
      if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1) + "B";
      if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + "M";
      if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + "k";
      return String(Math.round(v * 100) / 100);
    }

    let content = "";
    if (spec.type === "bars") {
      const bw = innerW / spec.data.length * 0.6;
      const gap = innerW / spec.data.length * 0.4;
      content = spec.data.map((d, i) => {
        const x = padL + i * (bw + gap) + gap / 2;
        const y = yScale(d.value);
        const bh = padT + innerH - y;
        return `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="#141312"/>
                <text x="${x + bw/2}" y="${h - 14}" text-anchor="middle" font-family="monospace" font-size="11" fill="#666">${d.label}</text>
                <text x="${x + bw/2}" y="${y - 6}" text-anchor="middle" font-family="monospace" font-size="11" fill="#141312">${fmtVal(d.value)}</text>`;
      }).join("");
    } else {
      const step = innerW / (spec.data.length - 1 || 1);
      const pts = spec.data.map((d, i) => `${padL + i * step},${yScale(d.value)}`).join(" ");
      content = `<polyline points="${pts}" fill="none" stroke="#141312" stroke-width="2"/>`;
      content += spec.data.map((d, i) => {
        const x = padL + i * step, y = yScale(d.value);
        return `<circle cx="${x}" cy="${y}" r="4" fill="#141312"/>
                <text x="${x}" y="${h - 14}" text-anchor="middle" font-family="monospace" font-size="11" fill="#666">${d.label}</text>
                <text x="${x}" y="${y - 10}" text-anchor="middle" font-family="monospace" font-size="11" fill="#141312">${fmtVal(d.value)}</text>`;
      }).join("");
    }
    const axisTop = yScale(max), axisBot = yScale(min);
    const yTicks = `
      <text x="${padL - 10}" y="${axisTop + 4}" text-anchor="end" font-family="monospace" font-size="11" fill="#666">${fmtVal(max)}</text>
      <text x="${padL - 10}" y="${axisBot + 4}" text-anchor="end" font-family="monospace" font-size="11" fill="#666">${fmtVal(min)}</text>
      <line x1="${padL}" y1="${padT + innerH}" x2="${w - padR}" y2="${padT + innerH}" stroke="#141312" stroke-width="1"/>
    `;
    const svgStr = `<?xml version="1.0" encoding="UTF-8"?>
  <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    <style>text { font-family: monospace; }</style>
    <rect width="${w}" height="${h}" fill="#f5f3ee"/>
    ${yTicks}
    ${content}
    <text x="${padL}" y="16" font-family="monospace" font-size="12" fill="#141312">${spec.title || "Chart"}${unit ? " \u00b7 " + unit : ""}</text>
  </svg>`;
    const blob = new Blob([svgStr], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (spec.title || "chart").replace(/[^a-z0-9]/gi, "_").toLowerCase() + ".svg";
    a.click();
    URL.revokeObjectURL(url);
  }

  /* Delegated chart action handlers */
  document.addEventListener("click", (e) => {
    const expandBtn = e.target.closest(".chart-expand-btn");
    if (expandBtn) {
      try {
        const spec = JSON.parse(expandBtn.dataset.chartSpec);
        expandChart(spec);
      } catch (_) {}
      return;
    }
    const dlBtn = e.target.closest(".chart-download-btn");
    if (dlBtn) {
      try {
        const spec = JSON.parse(dlBtn.dataset.chartSpec);
        downloadChart(spec);
      } catch (_) {}
      return;
    }
  });

  /* --------------------------------------------------------------------------
     Progressive render — called as text streams
     -------------------------------------------------------------------------- */
  function progressiveRender(text) {
    const s = parseSections(text);

    if (s.HEADLINE !== undefined) {
      els.answerHeadline.innerHTML = renderInline(s.HEADLINE);
      markStep("reading");
    }
    if (s.KEY_NUMBERS !== undefined) {
      const html = renderKeyNumbers(s.KEY_NUMBERS);
      if (html && els.keyNumbers) {
        els.keyNumbers.innerHTML = html;
        els.keyNumbers.style.display = "block";
      }
    }

    /* In Simulate mode, the prose sections (BODY, MECHANISM, DRIVERS, RISKS)
       are collapsed into a single "Analysis" details block below the decision
       tree. In Ask mode, they render inline as usual. */
    if (lastMode === "simulate") {
      const parts = [];
      if (s.BODY !== undefined) {
        parts.push(renderBody(s.BODY));
        markStep("checking");
      }
      if (s.MECHANISM !== undefined && s.MECHANISM) {
        parts.push(`<div class="analysis-block"><div class="section-label">Mechanism</div>${renderBody(s.MECHANISM)}</div>`);
      }
      if (s.DRIVERS !== undefined) {
        const html = renderDrivers(s.DRIVERS);
        if (html) parts.push(`<div class="analysis-block"><div class="section-label">What is moving it</div>${html}</div>`);
      }
      if (s.RISKS !== undefined && s.RISKS) {
        const html = renderBody(s.RISKS);
        if (html) parts.push(`<div class="analysis-block"><div class="section-label">What would change this</div>${html}</div>`);
      }
      if (parts.length && els.answerAnalysis && els.analysisContent) {
        els.analysisContent.innerHTML = parts.join("");
        els.answerAnalysis.style.display = "block";
      }
      if (s.TABLE !== undefined && els.answerTable) {
        const html = renderTable(s.TABLE, "The data");
        if (html) {
          els.answerTableContent.innerHTML = html;
          els.answerTable.style.display = "block";
        }
      }
    } else {
      if (s.BODY !== undefined) {
        els.answerBody.innerHTML = renderBody(s.BODY);
        markStep("checking");
      }
      if (s.MECHANISM !== undefined && s.MECHANISM && els.mechanism) {
        els.mechanismText.innerHTML = renderBody(s.MECHANISM);
        els.mechanism.style.display = "block";
      }
      if (s.DRIVERS !== undefined && els.drivers) {
        const html = renderDrivers(s.DRIVERS);
        if (html) {
          els.driversList.innerHTML = html;
          els.drivers.style.display = "block";
        }
      }
      if (s.TABLE !== undefined && els.answerTable) {
        const html = renderTable(s.TABLE, "The data");
        if (html) {
          els.answerTableContent.innerHTML = html;
          els.answerTable.style.display = "block";
        }
      }
      if (s.RISKS !== undefined && s.RISKS && els.risks) {
        const html = renderBody(s.RISKS);
        if (html) {
          els.risksList.innerHTML = html;
          els.risks.style.display = "block";
        }
      }
    }
    if (s.LEVERS !== undefined && s.LEVERS && els.levers) {
      const html = renderTable(s.LEVERS, "Levers");
      if (html) {
        els.leversContent.innerHTML = html;
        els.levers.style.display = "block";
      }
    }
    if (s.SCENARIOS !== undefined && s.SCENARIOS && els.scenarios) {
      const html = renderScenarioCards(s.SCENARIOS);
      if (html) {
        els.scenariosContent.innerHTML = html;
        els.scenarios.style.display = "block";
      }
    }
    if (s.BREAKEVEN !== undefined && s.BREAKEVEN && els.breakeven) {
      els.breakevenText.innerHTML = renderInline(s.BREAKEVEN);
      els.breakeven.style.display = "block";
    }
    if (s.READOUT !== undefined && s.READOUT) {
      els.readoutText.innerHTML = renderInline(s.READOUT);
      if (els.readoutLabel) {
        els.readoutLabel.textContent = lastMode === "simulate" ? "Recommendation" : "Readout";
      }
      els.answerReadout.style.display = "block";
    }
    if (s.HOW !== undefined && s.HOW && s.HOW.toLowerCase() !== "none") {
      els.expanderContent.innerHTML = renderInline(s.HOW).replace(/\n/g, "<br>");
      els.answerExpander.style.display = "block";
    }
    if (s.CONFIDENCE !== undefined) {
      const c = s.CONFIDENCE.trim();
      if (c && c.toLowerCase() !== "none") {
        const text = c.replace(/^low\s*:\s*/i, "");
        els.confidenceText.textContent = "Confidence is limited here. " + text;
        els.confidenceNote.style.display = "block";
      }
    }
    if (s.CANNOT_ANSWER !== undefined) {
      const c = s.CANNOT_ANSWER.trim();
      if (c && c.toLowerCase() !== "none") {
        els.cannotAnswerText.textContent = "Public data does not cover this yet. " + c;
        els.cannotAnswer.style.display = "block";
      }
    }
    if (s.CHART !== undefined && s.CHART && s.CHART.toLowerCase() !== "none") {
      const chartHtml = renderChart(s.CHART);
      if (chartHtml && els.answerChart) {
        els.answerChart.innerHTML = chartHtml;
        els.answerChart.style.display = "block";
      }
      markStep("assembling");
    }
    if (s.SOURCES !== undefined) {
      els.sourcesList.innerHTML = renderSources(s.SOURCES);
      markStep("assembling");
    }
    if (s.FOLLOW_UPS !== undefined) {
      const items = parseFollowUps(s.FOLLOW_UPS);
      if (items.length && els.followUps) {
        els.followUpsList.innerHTML = renderFollowUps(items);
        els.followUps.style.display = "block";
      }
    }
  }

  /* --------------------------------------------------------------------------
     Anthropic API call with SSE streaming
     -------------------------------------------------------------------------- */
  async function askAnthropic(question, onDelta, onWebSearch) {

    /* Query the bundled USGS data before calling out. When the question touches
       a commodity we ship, the model gets the authoritative rows in hand and
       does not have to hope a search surfaces them. */
    let mcsCtx = null;
    try {
      mcsCtx = await mcsContextFor(question);
    } catch (err) {
      console.warn("MCS lookup failed, continuing with web search only:", err);
    }
    lastMcsContext = mcsCtx;

    let userContent = question;

    // Project documents are context for the whole thread, not one mode or one
    // turn — inject them once, on the first turn only. Every later turn in
    // this thread already carries them via conversation.messages, so
    // re-sending them here would just repeat the same text on every request.
    const documents = getProjectDocuments();
    if (conversation.messages.length === 0 && documents.length) {
      const fileBlock = documents.map(f =>
        `<uploaded_document name="${escapeHtml(f.name)}" type="${escapeHtml(f.type)}">\n${f.text}\n</uploaded_document>`
      ).join("\n\n");
      userContent = `<user_uploaded_context>\n${fileBlock}\n</user_uploaded_context>\n\n${userContent}`;
    }

    // Append bundled data context
    if (mcsCtx) userContent += "\n" + mcsPromptBlock(mcsCtx);

    // Push the new user turn onto the running conversation
    conversation.messages.push({ role: "user", content: userContent });
    const body = {
      model: CONFIG.model,
      max_tokens: 8192,
      system: buildSystemPrompt(),
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: 5 }
      ],
      messages: conversation.messages.slice(),
      stream: true
    };

    const resp = await fetch(CONFIG.apiUrl, {
      method: "POST",
      headers: corridorHeaders(),
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const errText = await resp.text();
      let msg = errText;
      try { msg = JSON.parse(errText).error?.message || errText; } catch(e){}
      throw new Error(msg);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop();
      for (const part of parts) {
        const lines = part.split("\n");
        let eventName = "";
        let dataStr = "";
        for (const line of lines) {
          if (line.startsWith("event:")) eventName = line.slice(6).trim();
          if (line.startsWith("data:")) dataStr += line.slice(5).trim();
        }
        if (!dataStr) continue;
        try {
          const evt = JSON.parse(dataStr);
          if (evt.type === "content_block_start" && evt.content_block?.type === "server_tool_use" && evt.content_block?.name === "web_search") {
            onWebSearch && onWebSearch();
          }
          if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
            fullText += evt.delta.text;
            onDelta && onDelta(fullText);
          }
        } catch (e) { /* ignore parse errors on partial */ }
      }
    }
    // Persist assistant reply into the thread so the next turn is a follow-up
    if (fullText) {
      conversation.messages.push({ role: "assistant", content: fullText });
      updateThreadCrumb();
    }
    return fullText;
  }

  /* --------------------------------------------------------------------------
     Ask flow
     -------------------------------------------------------------------------- */
  function resetAnswer() {
    els.answerBrief.classList.remove("visible");
    els.answerHeadline.innerHTML = "";
    els.answerBody.innerHTML = "";
    els.readoutText.innerHTML = "";
    els.answerReadout.style.display = "none";
    els.expanderContent.innerHTML = "";
    els.answerExpander.style.display = "none";
    els.confidenceText.textContent = "";
    els.confidenceNote.style.display = "none";
    els.cannotAnswerText.textContent = "";
    els.cannotAnswer.style.display = "none";
    els.sourcesList.innerHTML = "";
    els.answerStatus.classList.remove("done");
    if (els.followUps) els.followUps.style.display = "none";
    if (els.followUpsList) els.followUpsList.innerHTML = "";

    /* Layered sections. Each host hides until the next answer fills it; the
       content node is the one that gets cleared, or the host itself when it
       has no inner slot. */
    const optional = [
      ["keyNumbers", "keyNumbers"],
      ["mechanism", "mechanismText"],
      ["drivers", "driversList"],
      ["answerTable", "answerTableContent"],
      ["risks", "risksList"],
      ["answerChart", "answerChart"],
      ["provenanceStrip", "provenanceStrip"],
      ["memoryStrip", "memoryStrip"],
      ["levers", "leversContent"],
      ["scenarios", "scenariosContent"],
      ["breakeven", "breakevenText"],
      ["answerAnalysis", "analysisContent"]
    ];
    for (const [host, content] of optional) {
      if (els[host]) els[host].style.display = "none";
      if (els[content]) els[content].innerHTML = "";
    }

    const errs = document.querySelectorAll(".error-msg");
    errs.forEach(e => e.remove());
  }

  /* A question becomes a result before the first token arrives. The card goes to
     the top of the stack, expands, and the answer streams into it, so there is
     one place work appears whether it came from the box or the run row. */
  async function askQuestion(question) {
    if (!question || !question.trim()) return;
    if (!ensureApiKey()) {
      els.apiKeyBar.classList.add("visible");
      return;
    }

    showProject();

    const pending = {
      id: newProjectId(),
      kind: "answer",
      title: question,
      summary: "",
      raw: "",
      sections: {},
      corridorId: getCorridorId(),
      createdAt: Date.now()
    };
    addResult(pending);

    parkDetailBlocks();
    expandedResultId = pending.id;
    renderProject();

    const host = document.getElementById("body-" + pending.id);
    if (host) {
      host.appendChild(els.answerDetail);
      els.answerDetail.hidden = false;
    }
    resetAnswer();
    els.answerBrief.classList.add("visible");
    startStatus();

    els.askSubmit.disabled = true;
    els.askInput.disabled = true;
    els.askInput.value = "";
    lastCorridorId = getCorridorId();

    try {
      const fullText = await askAnthropic(
        question,
        (text) => progressiveRender(text),
        () => markStep("searching")
      );
      completeStatus();

      const sections = parseSections(fullText || "");
      lastSections = sections;
      lastQuestion = question;
      renderProvenanceStrip();

      /* The answer is kept in full, so reopening this card later renders from
         storage instead of asking again. */
      updateActiveProject(p => {
        const r = (p.results || []).find(x => x.id === pending.id);
        if (r) {
          r.raw = fullText || "";
          r.sections = sections;
          r.summary = (sections.HEADLINE || "").trim();
        }
        trimResults(p);
      });

      const extracted = parseMemorySection(sections.MEMORY);
      renderMemoryStrip(mergeMemories(extracted, question));

      if (sections.PROJECT_SUMMARY && sections.PROJECT_SUMMARY.trim()) {
        updateActiveProject(p => {
          p.summary = {
            text: sections.PROJECT_SUMMARY.trim(),
            updatedAt: Date.now(),
            answerCount: (p.answerCount || 0) + 1
          };
          p.answerCount = (p.answerCount || 0) + 1;
        });
      }

      if (sections.FOLLOW_UPS && sections.FOLLOW_UPS.trim()) {
        const questions = parseFollowUps(sections.FOLLOW_UPS)
          .map(f => f.question).filter(Boolean);
        if (questions.length) {
          updateActiveProject(p => {
            p.suggestedQuestions = {
              ask: questions, followups: questions,
              source: "followups", updatedAt: Date.now()
            };
          });
        }
      }

      renderProjectHead();
      renderRunRow();
      renderAskHint();
      updateResultHead(pending.id);

    } catch (err) {
      completeStatus();
      const errDiv = document.createElement("div");
      errDiv.className = "error-msg";
      errDiv.innerHTML = `<strong>Could not build an answer.</strong><br>${escapeHtml(err.message || String(err))}<br><br>Check your API key in Settings.`;
      els.answerBrief.insertBefore(errDiv, els.answerBrief.firstChild);
      deleteResult(pending.id);
    } finally {
      els.askSubmit.disabled = false;
      els.askInput.disabled = false;
    }
  }

  /* Refresh one card's header in place, so a finished answer picks up its
     headline without tearing down the detail block streaming inside it. */
  function updateResultHead(id) {
    const r = resultById(id);
    const card = document.querySelector(`[data-result="${id}"] .result-summary`);
    if (!r) return;
    if (card) { card.textContent = r.summary || ""; return; }
    const main = document.querySelector(`[data-result="${id}"] .result-main`);
    if (main && r.summary) {
      main.insertAdjacentHTML("beforeend", `<span class="result-summary">${escapeHtml(r.summary)}</span>`);
    }
  }

  /* --------------------------------------------------------------------------
     Event wiring
     -------------------------------------------------------------------------- */
  els.askForm.addEventListener("submit", (e) => {
    e.preventDefault();
    askQuestion(els.askInput.value.trim());
  });

  // Enter submits, Shift+Enter inserts newline in textarea
  els.askInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      els.askForm.requestSubmit();
    }
  });

  /* --------------------------------------------------------------------------
     Dynamic example questions — swapped to match the user's stated role, so
     the ask form itself suggests the questions someone in their position
     would actually ask.
     -------------------------------------------------------------------------- */
  const DEFAULT_EXAMPLE_QUESTIONS = [
    "What tariffs apply to South African vehicle exports to the US today?",
    "How exposed are Kenyan apparel exporters if AGOA lapses in December?",
    "What did US imports from Nigeria look like over the last three years?",
    "What bottlenecks between Angola and the US are caused by tariffs right now?"
  ];

  const DEFAULT_SIMULATION_QUESTIONS = [
    "We're deciding whether to expand apparel sourcing from Kenya — it depends on whether AGOA is renewed before it lapses in December",
    "Honda is holding off on an eighth North American assembly plant unless USMCA is extended — what are the scenarios?",
    "Should we shift cobalt sourcing from DRC to Indonesia given the new export regulations?",
    "We're weighing a distribution hub in Nigeria — what tariff and FX conditions would make that viable?"
  ];

  const EXAMPLE_ARCHETYPES = [
    {
      keywords: ["infrastructure", "m&a", "m & a", "acquisition", "acquire", "private equity", "pe fund", "mining", "mine", "processing plant", "asset"],
      questions: [
        "What is the production cost curve for cobalt in Congo vs Indonesia?",
        "Which African countries have the largest undeveloped copper deposits?",
        "What infrastructure bottlenecks affect mineral exports from Zambia?",
        "How does DRC's mining code affect foreign ownership of processing facilities?"
      ],
      simulationQuestions: [
        "Should we acquire the copper processing plant in Zambia — it hinges on whether the government revises the mining code before year-end",
        "We're deciding whether to fund a new cobalt refinery in DRC — what levers determine if it breaks even?",
        "Is now the right time to bid on the rail concession in Angola, or should we wait for the tariff review?",
        "Should we proceed with the lithium extraction partnership in Zimbabwe given the pending indigenization rules?"
      ]
    },
    {
      keywords: ["cpg", "consumer goods", "supply chain", "fmcg", "sourcing", "retailer", "packaged"],
      questions: [
        "What tariff rates apply to packaged food imports from Kenya under AGOA?",
        "Which East African countries have the lowest tariff exposure for consumer goods?",
        "How has AGOA eligibility changed for Ethiopia and what products are affected?",
        "What are the shipping route options and costs from Lagos to US East Coast?"
      ],
      simulationQuestions: [
        "We're deciding whether to expand apparel sourcing from Kenya — it depends on whether AGOA is renewed before it lapses in December",
        "Should we shift our packaging supply chain from China to Morocco — what tariff and logistics conditions need to hold?",
        "We're weighing a new distribution hub in Lagos — what FX and port conditions would make that work?",
        "Should we launch a private-label food line sourced from Ghana — what are the scenarios if AGOA eligibility changes?"
      ]
    },
    {
      keywords: ["policy", "researcher", "think tank", "government", "congress", "regulator", "policymaker"],
      questions: [
        "How has US-Africa bilateral trade volume changed over the past decade?",
        "Which African countries face Section 301 or 232 tariff exposure?",
        "What is the current status of AfCFTA implementation by member state?",
        "How do US tariff preferences for Africa compare to EU and China's?"
      ],
      simulationQuestions: [
        "Should Congress extend AGOA or pursue bilateral deals — what are the trade volume implications of each path?",
        "We're deciding whether to recommend a tariff waiver for Kenyan textiles — what scenarios and thresholds matter?",
        "Should the administration invoke Section 232 on South African steel — what are the domestic and diplomatic outcomes?",
        "We're weighing whether to fund an AfCFTA compliance program — what are the scenarios if implementation stalls?"
      ]
    },
    {
      keywords: ["bank", "banking", "finance", "investment", "investor", "lender", "trade finance", "fdi"],
      questions: [
        "What is the trade finance gap for sub-Saharan Africa?",
        "Which African countries have the highest FDI inflows from the US?",
        "What currency and transfer risks affect US-Africa trade settlements?",
        "How do OFAC sanctions affect banking relationships with African counterparties?"
      ],
      simulationQuestions: [
        "Should we open a trade finance desk in Nairobi — what are the conditions under which it turns profitable?",
        "We're deciding whether to underwrite the DRC mining deal — what levers and thresholds determine if it closes?",
        "Should we extend a facility to the Nigerian importer — what FX and sanctions conditions need to hold?",
        "We're weighing entry into the Ethiopian bond market — what scenarios and break-even points should we watch?"
      ]
    },
    {
      keywords: ["insurer", "reinsurer", "underwriting", "political risk", "trade credit", "catastrophe", "premium", "claims"],
      questions: [
        "What is the political risk insurance premium for sub-Saharan Africa?",
        "Which of our origins carry the most duty exposure if preferences lapse?",
        "Which African countries have the highest catastrophe reinsurance costs?",
        "What OFAC restrictions affect political risk underwriting?"
      ],
      simulationQuestions: [
        "Should we expand political risk coverage into East Africa — what loss scenarios and premium thresholds matter?",
        "We're deciding whether to underwrite the trade credit facility — what are the claim probability scenarios?",
        "Should we increase catastrophe reinsurance in West Africa — what are the return-period thresholds?",
        "We're weighing entry into the Nigerian trade credit market — what loss ratios make it viable?"
      ]
    }
  ];

  function getExampleQuestions() {
    const project = getActiveProject();

    /* Priority 1: Generated suggestions from the "Suggest questions" button */
    if (project.suggestedQuestions) {
      const pool = project.suggestedQuestions.ask;
      if (pool && pool.length) return pool.slice(0, 4);
    }

    /* Priority 2: Follow-ups stored from the last answer */
    const followups = project.suggestedQuestions?.followups || [];
    if (followups.length) return followups.slice(0, 4);

    /* Priority 3: Seeded from role, goal, or document names */
    const seeded = seedQuestionsFromProject(project);
    if (seeded.length) return seeded;

    /* Priority 4: Archetype defaults */
    const ctx = getUserContext();
    const text = `${ctx.role} ${ctx.goal}`.toLowerCase();
    /* One of each: a question of fact and a decision, so the box shows both
       kinds of thing it will take. */
    for (const archetype of EXAMPLE_ARCHETYPES) {
      if (archetype.keywords.some(k => text.includes(k))) {
        return [(archetype.questions || [])[0], (archetype.simulationQuestions || [])[0]].filter(Boolean);
      }
    }
    return [DEFAULT_EXAMPLE_QUESTIONS[0], DEFAULT_SIMULATION_QUESTIONS[0]].filter(Boolean);
  }

  /* Hints come from the watchlist, which is data we control, rather than from
     the user's goal text. Splicing an arbitrary sentence fragment into a
     template produced things like "what exposure affects evaluating procurement
     policies in africa": broken grammar and a lost proper noun. */
  function seedQuestionsFromProject(project) {
    const lanes = getLanes(project);
    if (!lanes.length) return [];
    const questions = [];

    const withProgram = lanes.find(l => {
      const e = laneExposure(l);
      return e.duty && e.duty.claimed && e.duty.claimed.program;
    });
    if (withProgram) {
      const e = laneExposure(withProgram);
      questions.push(`What happens to the ${withProgram.label} lane if ${e.duty.claimed.label} lapses?`);
    }

    const withCp = lanes.find(l => (l.route?.chokepoints || []).length);
    if (withCp) {
      const cp = chokepointById(withCp.route.chokepoints[0]);
      if (cp) questions.push(`How exposed is the ${withCp.label} lane to a disruption at the ${cp.name}?`);
    }

    const withAction = lanes.find(l => laneExposure(l).actions.length);
    if (withAction && questions.length < 2) {
      questions.push(`What is the current scope of the trade actions affecting the ${withAction.label} lane?`);
    }

    return questions.slice(0, 2);
  }


  function formatTimestamp(ts) {
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return Math.floor(diff / 60000) + "m ago";
    if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago";
    if (diff < 604800000) return Math.floor(diff / 86400000) + "d ago";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }


  /* --------------------------------------------------------------------------
     Provenance strip — which datasets actually stood behind this answer.
     -------------------------------------------------------------------------- */
  function answerProvenance() {
    const used = [];

    if (lastMcsContext) {
      const d = datasetById("usgs-mcs-2026");
      if (d) used.push({
        dataset: d,
        detail: `${lastMcsContext.rowCount} rows matched on ${lastMcsContext.commodities.join(", ")}`
      });
    }

    /* Live sources are credited from the citations the answer actually carried,
       matched back to the registry by domain. */
    const sourceText = lastSections.SOURCES || "";
    for (const d of datasetsByKind("live-search")) {
      if (!d.domains) continue;
      if (d.domains.some(domain => sourceText.includes(domain))) {
        used.push({ dataset: d, detail: "cited in this answer" });
      }
    }

    return used;
  }

  function renderProvenanceStrip() {
    if (!els.provenanceStrip) return;
    const used = answerProvenance();
    if (!used.length) return;

    const chips = used.map(({ dataset, detail }) => `
      <div class="prov-chip prov-${dataset.kind}">
        <span class="prov-tier">T${dataset.tier}</span>
        <span class="prov-name">${escapeHtml(dataset.title)}</span>
        <span class="prov-detail">${escapeHtml(detail)}</span>
      </div>`).join("");

    els.provenanceStrip.innerHTML =
      `<div class="prov-label">Data behind this answer</div>
       <div class="prov-chips">${chips}</div>`;
    els.provenanceStrip.style.display = "block";
  }

  /* --------------------------------------------------------------------------
     Excel export — a real .xlsx workbook, one sheet per layer of the answer,
     so the figures land in a spreadsheet already carrying their provenance.
     -------------------------------------------------------------------------- */
  function exportFileName(ext) {
    const base = (lastQuestion || "corridor-report")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
    return `${base || "corridor-report"}.${ext}`;
  }

  /* Strip the inline markup so a cell holds a value, not "12.4{{s:2}}". */
  function cellText(text) {
    return (text || "")
      .replace(/\{\{s:([^}]+)\}\}/g, (_, n) => `[${n}]`)
      .replace(/\{\{label:([^}]+)\}\}/g, (_, l) => ` (${l})`)
      .replace(/\{\{fresh:([^}]+)\}\}/g, (_, f) => ` ${f}`)
      .replace(/\s+/g, " ")
      .trim();
  }

  function sheetFromLines(text, header) {
    const rows = [header];
    for (const raw of (text || "").split(/\n/)) {
      const line = raw.trim().replace(/^[-*]\s*/, "");
      if (line) rows.push([cellText(line)]);
    }
    return rows.length > 1 ? rows : null;
  }

  function exportExcel() {
    if (!(window.XLSX && window.XLSX.utils)) {
      alert("The spreadsheet library did not load, so Excel export is unavailable right now.");
      return;
    }

    const s = lastSections;
    if (!s || !s.HEADLINE) {
      alert("Ask a question first — there is no answer to export yet.");
      return;
    }

    const XLSX = window.XLSX;
    const wb = XLSX.utils.book_new();

    const addSheet = (name, rows, widths) => {
      if (!rows || rows.length < 2) return;
      const ws = XLSX.utils.aoa_to_sheet(rows);
      if (widths) ws["!cols"] = widths.map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    };

    /* 1. Answer ------------------------------------------------------------- */
    const answer = [["Field", "Content"]];
    answer.push(["Question", lastQuestion]);
    answer.push(["Headline", cellText(s.HEADLINE)]);
    answer.push(["Generated", new Date().toISOString().slice(0, 16).replace("T", " ")]);
    answer.push([]);

    const prose = [
      ["Body", s.BODY],
      ["Mechanism", s.MECHANISM],
      ["Risks", s.RISKS],
      ["Readout", s.READOUT],
      ["Decision threshold", s.BREAKEVEN],
      ["How it was worked out", s.HOW]
    ];
    for (const [label, text] of prose) {
      if (!text || text.trim().toLowerCase() === "none") continue;
      answer.push([label, ""]);
      for (const raw of text.split(/\n/)) {
        const line = raw.trim().replace(/^[-*]\s*/, "");
        if (line) answer.push(["", cellText(line)]);
      }
      answer.push([]);
    }

    const confidence = (s.CONFIDENCE || "").trim();
    if (confidence && confidence.toLowerCase() !== "none") {
      answer.push(["Confidence", cellText(confidence)]);
    }
    const cannot = (s.CANNOT_ANSWER || "").trim();
    if (cannot && cannot.toLowerCase() !== "none") {
      answer.push(["Cannot answer", cellText(cannot)]);
    }
    addSheet("Answer", answer, [24, 110]);

    /* 2. Key numbers -------------------------------------------------------- */
    const keyRows = [["Label", "Value", "Basis", "As of", "Source"]];
    for (const raw of (s.KEY_NUMBERS || "").split(/\n/)) {
      const line = raw.trim().replace(/^[-*]\s*/, "");
      if (!line || !line.includes("|")) continue;
      const parts = line.split("|").map(p => p.trim());
      const marker = line.match(/\{\{s:([^}]+)\}\}/);
      keyRows.push([
        cellText(parts[0] || ""),
        cellText(parts[1] || ""),
        (parts[2] || "").replace(/\{\{.*?\}\}/g, "").trim(),
        (parts[3] || "").replace(/^as of\s*/i, "").replace(/\{\{.*?\}\}/g, "").trim(),
        marker ? marker[1] : ""
      ]);
    }
    addSheet("Key numbers", keyRows, [38, 22, 12, 12, 10]);

    /* 3. Drivers ------------------------------------------------------------ */
    const driverRows = [["Direction", "Driver", "Effect"]];
    for (const raw of (s.DRIVERS || "").split(/\n/)) {
      const line = raw.trim().replace(/^[-*]\s*/, "");
      if (!line || !line.includes("|")) continue;
      const parts = line.split("|").map(p => p.trim());
      driverRows.push([
        (parts[0].toUpperCase().match(/UP|DOWN|MIXED/) || ["MIXED"])[0],
        cellText(parts[1] || ""),
        cellText(parts.slice(2).join(" "))
      ]);
    }
    addSheet("Drivers", driverRows, [11, 30, 90]);

    /* 4. Data — the [[TABLE]] block as a real grid --------------------------- */
    const table = parseTable(s.TABLE);
    if (table) {
      const rows = [table.header.map(cellText)];
      for (const r of table.rows) {
        rows.push(r.map(c => {
          const clean = cellText(c);
          // Write numbers as numbers so Excel can chart and total them.
          const numeric = clean.replace(/,/g, "");
          return /^-?\d+(\.\d+)?$/.test(numeric) ? Number(numeric) : clean;
        }));
      }
      addSheet("Data", rows, table.header.map(() => 18));
    }

    /* 4b. Levers — simulate mode only ----------------------------------------- */
    const leversTable = parseTable(s.LEVERS);
    if (leversTable) {
      const rows = [leversTable.header.map(cellText)];
      for (const r of leversTable.rows) rows.push(r.map(cellText));
      addSheet("Levers", rows, leversTable.header.map(() => 22));
    }

    /* 4c. Scenarios — simulate mode only --------------------------------------- */
    const scenariosTable = parseTable(s.SCENARIOS);
    if (scenariosTable) {
      const rows = [scenariosTable.header.map(cellText)];
      for (const r of scenariosTable.rows) rows.push(r.map(cellText));
      addSheet("Scenarios", rows, scenariosTable.header.map(() => 24));
    }

    /* 5. Sources ------------------------------------------------------------ */
    const sourceRows = [["#", "Tier", "Tier name", "Source", "Series or table", "As of", "URL"]];
    for (const raw of (s.SOURCES || "").split(/\n/)) {
      const line = raw.trim();
      const numMatch = line.match(/^(\d+)[.)]\s*(.*)$/);
      if (!numMatch) continue;
      let rest = numMatch[2];
      let tier = "";
      const tierMatch = rest.match(/^\[T([1-4])\]\s*/);
      if (tierMatch) { tier = tierMatch[1]; rest = rest.slice(tierMatch[0].length); }
      const urlMatch = rest.match(/https?:\/\/\S+/);
      const url = urlMatch ? urlMatch[0].replace(/[.,;]$/, "") : "";
      const withoutUrl = url ? rest.replace(url, "").trim() : rest;
      const parts = withoutUrl.split(/\s+—\s+|\s+-\s+|\s+\|\s+/).map(p => p.trim()).filter(Boolean);
      sourceRows.push([
        numMatch[1],
        tier ? `T${tier}` : "",
        tier ? (TIER_NAMES[Number(tier)] || "") : "",
        parts[0] || "",
        parts[1] || "",
        parts[2] || "",
        url
      ]);
    }
    addSheet("Sources", sourceRows, [5, 6, 20, 40, 34, 12, 60]);

    /* 6. Provenance — the datasets that actually stood behind the answer ----- */
    const provRows = [["Dataset", "Publisher", "Tier", "Kind", "What that licenses", "Coverage", "Caveats", "Link"]];
    for (const { dataset, detail } of answerProvenance()) {
      provRows.push([
        dataset.title,
        dataset.publisher,
        `T${dataset.tier}`,
        dataset.kind,
        KIND_RULES[dataset.kind] || "",
        detail,
        dataset.caveats || "",
        dataset.doi || dataset.url || ""
      ]);
    }
    addSheet("Provenance", provRows, [40, 30, 6, 12, 60, 34, 60, 46]);

    /* 7. Thread — only when the conversation actually went deeper ------------ */
    const turns = conversation.messages.filter(m => m.role === "user");
    if (turns.length > 1) {
      const threadRows = [["Turn", "Role", "Content"]];
      let turn = 0;
      for (const m of conversation.messages) {
        if (m.role === "user") turn++;
        const content = typeof m.content === "string"
          ? m.content
          : (m.content || []).map(c => c.text || "").join(" ");
        // Drop the injected data block — it is on the Data/Provenance sheets.
        const visible = content.split("<bundled_data")[0].trim();
        threadRows.push([turn, m.role, cellText(visible).slice(0, 4000)]);
      }
      addSheet("Thread", threadRows, [6, 10, 120]);
    }

    XLSX.writeFile(wb, exportFileName("xlsx"));
  }

  document.addEventListener("click", (e) => {
    // Source markers
    const marker = e.target.closest(".source-marker");
    if (marker) {
      e.preventDefault();
      const n = marker.dataset.src;
      const target = document.getElementById("source-" + n);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.style.background = "var(--color-bone-deep)";
        setTimeout(() => target.style.background = "", 1200);
      }
      return;
    }
    // Follow-up chips: continue the thread with a deeper question
    const followUp = e.target.closest(".followup-item");
    if (followUp) {
      const q = followUp.dataset.q;
      if (q) askQuestion(q);
      return;
    }
  });


  /* --------------------------------------------------------------------------
     Atomic particle globe
     Sphere of Fibonacci-distributed nodes, plus 3 tilted orbital rings, plus
     great-circle chords between clusters that pulse like trade flows.
     -------------------------------------------------------------------------- */
  (function drawGlobe() {
    const canvas = els.globeCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const size = 600;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + "px";
    canvas.style.height = size + "px";
    ctx.scale(dpr, dpr);
    const cx = size / 2, cy = size / 2, R = 210;

    // Sphere of nodes
    const N = 520;
    const nodes = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const theta = i * Math.PI * (3 - Math.sqrt(5));
      nodes.push({ x: Math.cos(theta) * r, y, z: Math.sin(theta) * r });
    }

    // "City" anchor nodes — a handful that emit connection chords like a trade map
    const anchors = [];
    const anchorIdx = [40, 88, 132, 190, 245, 300, 360, 415, 470, 505];
    anchorIdx.forEach(i => anchors.push({ ...nodes[i], phase: Math.random() * Math.PI * 2 }));

    // Great-circle chords between anchor pairs
    const chords = [];
    for (let i = 0; i < anchors.length; i++) {
      for (let j = i + 1; j < anchors.length; j++) {
        // Sample a subset of pairs for visual density
        if ((i + j) % 3 !== 0) continue;
        chords.push({ a: i, b: j, offset: Math.random() * 1000 });
      }
    }

    // Orbital rings — tilted circles that sit outside the sphere
    const rings = [
      { rx: R * 1.22, ry: R * 0.32, tilt: -0.35, dir: 1 },
      { rx: R * 1.10, ry: R * 0.55, tilt: 0.62, dir: -1 },
      { rx: R * 1.32, ry: R * 0.24, tilt: 1.05, dir: 1 }
    ];

    let angle = 0;
    let t = 0;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function rotY(p, cos, sin) {
      return { x: p.x * cos - p.z * sin, y: p.y, z: p.x * sin + p.z * cos };
    }

    // Sample a great-circle arc between two unit vectors
    function slerp(a, b, u) {
      const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
      const omega = Math.acos(dot);
      if (omega < 0.0001) return a;
      const so = Math.sin(omega);
      const wa = Math.sin((1 - u) * omega) / so;
      const wb = Math.sin(u * omega) / so;
      return { x: a.x * wa + b.x * wb, y: a.y * wa + b.y * wb, z: a.z * wa + b.z * wb };
    }

    function frame() {
      ctx.clearRect(0, 0, size, size);
      if (!prefersReduced) { angle += 0.0022; t += 1; }
      const cos = Math.cos(angle), sin = Math.sin(angle);

      // 1) Circumference hairline
      ctx.strokeStyle = "rgba(20,19,18,0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();

      // 2) Orbital rings — draw the back half first, then the front half over nodes
      function drawRing(ring, phase /* 'back'|'front' */) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ring.tilt);
        ctx.strokeStyle = phase === "back" ? "rgba(20,19,18,0.10)" : "rgba(20,19,18,0.35)";
        ctx.lineWidth = phase === "back" ? 0.6 : 1;
        ctx.beginPath();
        const steps = 120;
        let started = false;
        for (let i = 0; i <= steps; i++) {
          const th = (i / steps) * Math.PI * 2;
          // decide back/front by z component of the ring point in world space (rotated by y-rotation angle after tilt)
          const px = Math.cos(th) * ring.rx;
          const py = Math.sin(th) * ring.ry;
          // undo tilt to get world y, use ring's tilt sin to synthesize a fake z
          const zFake = Math.sin(th) * ring.ry * 0.55; // approximate depth
          const isFront = zFake >= 0;
          if ((phase === "front" && isFront) || (phase === "back" && !isFront)) {
            if (!started) { ctx.moveTo(px, py); started = true; }
            else ctx.lineTo(px, py);
          } else {
            started = false;
            ctx.moveTo(px, py);
          }
        }
        ctx.stroke();

        // Traveling dot on the ring
        const travel = (t * 0.006 * ring.dir) % (Math.PI * 2);
        const tpx = Math.cos(travel) * ring.rx;
        const tpy = Math.sin(travel) * ring.ry;
        const zFake = Math.sin(travel) * ring.ry * 0.55;
        if ((phase === "front" && zFake >= 0) || (phase === "back" && zFake < 0)) {
          ctx.fillStyle = phase === "front" ? "#c8521c" : "rgba(200,82,28,0.35)";
          ctx.beginPath();
          ctx.arc(tpx, tpy, phase === "front" ? 3 : 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      rings.forEach(r => drawRing(r, "back"));

      // 3) Chords behind the sphere first
      const rotated = nodes.map(p => rotY(p, cos, sin));
      const rotAnchors = anchors.map(a => rotY(a, cos, sin));

      function drawChords(pass /* 'back'|'front' */) {
        for (const c of chords) {
          const A = rotAnchors[c.a];
          const B = rotAnchors[c.b];
          const midZ = (A.z + B.z) / 2;
          if (pass === "back" && midZ >= 0) continue;
          if (pass === "front" && midZ < 0) continue;
          const seg = 30;
          ctx.strokeStyle = pass === "front" ? "rgba(20,19,18,0.5)" : "rgba(20,19,18,0.12)";
          ctx.lineWidth = pass === "front" ? 0.9 : 0.5;
          ctx.beginPath();
          for (let i = 0; i <= seg; i++) {
            const u = i / seg;
            const p = slerp(A, B, u);
            const px = cx + p.x * R;
            const py = cy + p.y * R;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.stroke();

          // Pulse traveler along the chord
          const u = ((t * 0.4 + c.offset) % 200) / 200;
          const p = slerp(A, B, u);
          if ((pass === "front" && p.z >= 0) || (pass === "back" && p.z < 0)) {
            const px = cx + p.x * R;
            const py = cy + p.y * R;
            ctx.fillStyle = pass === "front" ? "#c8521c" : "rgba(200,82,28,0.4)";
            ctx.beginPath();
            ctx.arc(px, py, pass === "front" ? 2.2 : 1.6, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      drawChords("back");

      // 4) Back half of nodes (subtle)
      ctx.fillStyle = "#141312";
      for (const p of rotated) {
        if (p.z >= 0) continue;
        const px = cx + p.x * R;
        const py = cy + p.y * R;
        ctx.globalAlpha = 0.08 + (p.z + 1) * 0.12;
        ctx.beginPath();
        ctx.arc(px, py, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }

      // 5) Front half of nodes (stronger)
      for (const p of rotated) {
        if (p.z < 0) continue;
        const px = cx + p.x * R;
        const py = cy + p.y * R;
        const s = 0.35 + p.z * 0.65;
        ctx.globalAlpha = 0.25 + p.z * 0.65;
        ctx.beginPath();
        ctx.arc(px, py, 1.1 + s * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // 6) Anchor nodes on top (front-only) — slightly larger, ember tint
      for (const a of rotAnchors) {
        if (a.z < 0) continue;
        const px = cx + a.x * R;
        const py = cy + a.y * R;
        ctx.fillStyle = "#141312";
        ctx.beginPath();
        ctx.arc(px, py, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(200,82,28,0.9)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(px, py, 5 + Math.sin((t + a.phase * 60) * 0.05) * 1.5, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 7) Front chords over sphere
      drawChords("front");

      // 8) Front rings on top
      rings.forEach(r => drawRing(r, "front"));

      // 9) Cross-hair ticks at cardinal points (design system motif)
      ctx.strokeStyle = "rgba(20,19,18,0.55)";
      ctx.lineWidth = 1;
      [[0, -R - 14], [0, R + 14], [-R - 14, 0], [R + 14, 0]].forEach(([x, y]) => {
        ctx.beginPath();
        ctx.moveTo(cx + x - 5, cy + y);
        ctx.lineTo(cx + x + 5, cy + y);
        ctx.moveTo(cx + x, cy + y - 5);
        ctx.lineTo(cx + x, cy + y + 5);
        ctx.stroke();
      });

      if (!prefersReduced) requestAnimationFrame(frame);
    }
    frame();
  })();

  /* ==========================================================================
     ASSESSMENTS — the five modules that turn a project into a decision
     ========================================================================== */

  /* A one-shot call that leaves `conversation` alone. Assessments and the
     decision readout are their own artefacts, and folding them into the running
     thread would make every later follow-up carry five assessments of history. */
  async function callAnthropicOnce({ system, content, maxTokens = 8192, useSearch = true, onDelta }) {
    const body = {
      model: CONFIG.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content }],
      stream: true
    };
    if (useSearch) {
      body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }];
    }

    const resp = await fetch(CONFIG.apiUrl, {
      method: "POST",
      headers: corridorHeaders(),
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const errText = await resp.text();
      let msg = errText;
      try { msg = JSON.parse(errText).error?.message || errText; } catch (e) {}
      throw new Error(msg);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop();
      for (const part of parts) {
        let dataStr = "";
        for (const line of part.split("\n")) {
          if (line.startsWith("data:")) dataStr += line.slice(5).trim();
        }
        if (!dataStr) continue;
        try {
          const evt = JSON.parse(dataStr);
          if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
            fullText += evt.delta.text;
            onDelta && onDelta(fullText);
          }
        } catch (e) { /* partial frame */ }
      }
    }
    return fullText;
  }

  /* Documents are context for every assessment, the same way they are for a
     thread. A market assessment that has not read the teaser is not worth
     running. */
  function assessmentUserContent(module, project) {
    const tradeBlock = (latestTradeResult(project) || {}).model ? tariffPromptBlock((latestTradeResult(project) || {}).model) : "";
    let content = assessmentQuestion(module, project, tradeBlock);

    const docs = project.documents || [];
    if (docs.length) {
      const fileBlock = docs.map(f =>
        `<uploaded_document name="${escapeHtml(f.name)}" type="${escapeHtml(f.type)}">\n${f.text}\n</uploaded_document>`
      ).join("\n\n");
      content = `<user_uploaded_context>\n${fileBlock}\n</user_uploaded_context>\n\n${content}`;
    }
    return content;
  }

  const assessmentRunning = new Set();

  async function runAssessment(moduleId) {
    const module = assessmentModuleById(moduleId);
    if (!module || assessmentRunning.has(moduleId)) return;
    if (!ensureApiKey()) return;

    assessmentRunning.add(moduleId);
    renderRunRow();

    try {
      const project = getActiveProject();
      const raw = await callAnthropicOnce({
        system: buildSystemPrompt() + assessmentSystemAddendum(module, project),
        content: assessmentUserContent(module, project),
        onDelta: (text) => renderAssessmentProgress(moduleId, text)
      });

      const sections = parseSections(raw);
      const record = buildAssessmentRecord(module, getActiveProject(), raw, sections);

      addResult(record);

      /* The band is computed, so it refreshes the moment a module lands. */
      updateActiveProject(p => {
        const bands = ASSESSMENT_MODULES.map(m => (latestAssessment(p, m.id) || {}).band || null);
        p.decision = Object.assign({}, p.decision, {
          band: computeDecisionBand(bands),
          updatedAt: Date.now()
        });
      });

      /* Open what just finished, since that is what the user is waiting for. */
      parkDetailBlocks();
      expandedResultId = record.id;

      /* Assessments establish durable facts the same way answers do. */
      const extracted = parseMemorySection(sections.MEMORY || "");
      if (extracted.length) mergeMemories(extracted, record.title);

    } catch (err) {
      console.warn("Assessment failed:", moduleId, err);
      alert(`Could not run the ${module.name.toLowerCase()}: ${err.message}`);
    } finally {
      assessmentRunning.delete(moduleId);
      renderProject();
    }
  }

  /* While a module streams, show the headline as it forms in the run chip, so
     there is something to read rather than a spinner. */
  function renderAssessmentProgress(moduleId, text) {
    const chip = document.querySelector(`[data-run="${moduleId}"] .run-chip-state`);
    if (!chip) return;
    const sections = parseSections(text);
    const line = (sections.HEADLINE || sections.BODY || "").trim().split("\n")[0] || "";
    chip.textContent = line ? line.slice(0, 48) : "running";
  }

  function assessmentBandClass(band) {
    return band ? `band-${band}` : "band-none";
  }

  /* --------------------------------------------------------------------------
     Surface wiring. Both lists are re-rendered constantly, so every handler is
     delegated from a container that survives.
     -------------------------------------------------------------------------- */
  els.runRow && els.runRow.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-run]");
    if (!btn) return;
    const id = btn.dataset.run;
    if (id === "duty") return openDutyModel();
    runAssessment(id);
  });

  els.resultsList && els.resultsList.addEventListener("click", (e) => {
    const rerun = e.target.closest("[data-rerun]");
    if (rerun) {
      const r = resultById(rerun.dataset.rerun);
      if (r) askQuestion(r.title);
      return;
    }
    const head = e.target.closest("[data-toggle]");
    if (head) toggleResult(head.dataset.toggle);
  });

  els.askBoxHint && els.askBoxHint.addEventListener("click", (e) => {
    const btn = e.target.closest(".ask-hint");
    if (!btn) return;
    els.askInput.value = btn.dataset.q;
    els.askInput.focus();
  });

  els.attachBtn && els.attachBtn.addEventListener("click", () => els.fileInput.click());

  /* The duty model is a result like anything else. Running it opens the existing
     one rather than stacking a second, since there is only ever one live panel. */
  async function openDutyModel() {
    const existing = latestTradeResult(getActiveProject());
    if (existing) {
      parkDetailBlocks();
      expandedResultId = existing.id;
      renderResults();
      document.querySelector(`[data-result="${existing.id}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const placeholder = {
      id: newProjectId(),
      kind: "trade",
      title: "Duty model",
      summary: "Pick a product to model the lane",
      model: null,
      corridorId: getCorridorId(),
      createdAt: Date.now()
    };
    addResult(placeholder);
    parkDetailBlocks();
    expandedResultId = placeholder.id;
    renderProject();
    document.querySelector(`[data-result="${placeholder.id}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* Restore a saved duty model into the live panel. */
  async function loadTradeIntoPanel(result) {
    await initTradePanel();
    const model = result.model;
    if (!model) return;
    trade.origins = model.origins || trade.origins;
    trade.value = model.value || trade.value;
    trade.quantity = model.quantity || 0;
    trade.mode = model.mode || trade.mode;
    trade.claimPreferences = model.claimPreferences !== false;
    if (els.tradeValue) els.tradeValue.value = trade.value;
    if (els.tradeMode) els.tradeMode.value = trade.mode;
    if (els.tradeClaimPrefs) els.tradeClaimPrefs.checked = trade.claimPreferences;
    renderTradeOrigins();
    const line = htsByCode(model.hts);
    if (line) selectHtsLine(line, { silent: true });
    recomputeTrade();
  }

  /* Every recompute writes back to the open result, so the duty model is saved
     by using it rather than by remembering to press a button. */
  function persistTradeResult() {
    const model = currentTradeModel();
    if (!model || !expandedResultId) return;
    const fresh = tradeResultFrom(model, getCorridorId());
    updateActiveProject(p => {
      const r = (p.results || []).find(x => x.id === expandedResultId);
      if (!r || r.kind !== "trade") return;
      r.model = model;
      r.title = fresh.title;
      r.summary = fresh.summary;
    });
    updateResultHead(expandedResultId);
    const t = document.querySelector(`[data-result="${expandedResultId}"] .result-title`);
    if (t) t.textContent = fresh.title;
    renderProjectHead();
  }

  /* --------------------------------------------------------------------------
     The decision readout
     -------------------------------------------------------------------------- */

  function renderDecisionReadout() {
    if (!els.decisionBand) return;
    const project = getActiveProject();
    const band = projectDecisionBand(project);
    const decision = project.decision || {};

    /* Nothing to read out until an assessment has run, and an empty panel
       saying "not yet assessed" is worse than no panel. */
    if (els.decisionReadout) {
      els.decisionReadout.style.display = band ? "" : "none";
    }
    if (!band) return;

    const spec = band ? DECISION_BANDS[band] : null;
    els.decisionBand.textContent = spec ? spec.label : "Not yet assessed";
    els.decisionBand.className = "decision-band " + (spec ? "tone-" + spec.tone : "tone-none");

    if (els.decisionBasis) {
      els.decisionBasis.textContent = band
        ? decisionBasis(project)
        : "Run an assessment to establish where this project stands.";
    }

    if (els.decisionRationale) {
      els.decisionRationale.textContent = decision.rationale || "";
      els.decisionRationale.style.display = decision.rationale ? "" : "none";
    }

    if (els.decisionConditions) {
      const conditions = decision.conditions || [];
      els.decisionConditions.innerHTML = conditions.map(c => `<li>${escapeHtml(c)}</li>`).join("");
      els.decisionConditions.style.display = conditions.length ? "" : "none";
    }

    if (els.decisionRefresh) {
      const anyRun = ASSESSMENT_MODULES.some(m => latestAssessment(project, m.id));
      els.decisionRefresh.style.display = anyRun ? "" : "none";
      els.decisionRefresh.textContent = decision.rationale ? "Rewrite the conditions" : "Write the conditions";
    }
  }

  /* The band is already computed, so this call only names the conditions. It
     receives the verdict lines rather than the assessments themselves, which
     keeps it cheap and stops it becoming a sixth assessment. */
  async function writeDecisionConditions() {
    if (!ensureApiKey()) return;
    const project = getActiveProject();
    const band = projectDecisionBand(project);
    if (!band) return;

    const records = projectAssessmentRecords(project).filter(Boolean);
    if (!records.length) return;

    const btn = els.decisionRefresh;
    if (btn) { btn.disabled = true; btn.textContent = "Writing…"; }

    try {
      const raw = await callAnthropicOnce({
        system:
          "You write the decision readout that sits on top of a set of completed " +
          "assessments. Be specific and plain. No preamble, no marketing language, " +
          "no em dashes. Output only the two sections requested.",
        content: decisionPrompt(project, records, DECISION_BANDS[band].label),
        maxTokens: 1024,
        useSearch: false
      });

      const parsed = parseDecisionSections(raw);
      updateActiveProject(p => {
        p.decision = {
          band,
          rationale: parsed.rationale,
          conditions: parsed.conditions,
          updatedAt: Date.now()
        };
      });
    } catch (err) {
      console.warn("Decision readout failed:", err);
      alert("Could not write the decision readout: " + err.message);
    } finally {
      if (btn) btn.disabled = false;
      renderDecisionReadout();
    }
  }

  els.decisionRefresh && els.decisionRefresh.addEventListener("click", writeDecisionConditions);

  /* ==========================================================================
     TRADE MODEL. Deterministic first, narrative second.

     Every number on this panel is computed locally in tariffs.js, and the
     sliders recompute with no network call. The model is invited in at the end
     to say what the numbers mean, and it receives the finished arithmetic.
     ========================================================================== */

  const trade = {
    line: null,
    origins: ["KE", "VN", "CN"],
    value: 250000,
    quantity: 0,
    mode: "ocean",
    claimPreferences: true,
    results: [],
    sliders: { volume: 100, shock: 0, fx: 0 }
  };

  let tradeInitialised = false;

  async function initTradePanel() {
    if (!els.tradeSearch) return;

    if (!tradeInitialised) {
      tradeInitialised = true;

      if (els.tradeMode) {
        els.tradeMode.innerHTML = TRANSPORT_MODES
          .map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join("");
        els.tradeMode.value = trade.mode;
      }

      renderTradeOrigins();
    }

    const index = await loadTariffIndex();
    if (els.tradeScope && index) {
      els.tradeScope.innerHTML = `
        <div class="trade-scope-line">${escapeHtml(index.source)} &middot; ${index.rows.toLocaleString()} lines</div>
        <div class="trade-scope-note">Statutory rates only. Section 301, 232 and IEEPA duties are not included.</div>`;
    }

    await loadTariffs();
  }

  /* ---------------------------------------------------------------- search -- */

  function renderHtsResults(container, rows, attr) {
    if (!container) return;
    if (!rows.length) { container.innerHTML = ""; container.classList.remove("open"); return; }
    container.innerHTML = rows.map(r => `
      <button class="trade-result-row" ${attr}="${r.h}">
        <span class="trade-result-code">${escapeHtml(formatHts(r.h))}</span>
        <span class="trade-result-desc">${escapeHtml(r.d)}</span>
        <span class="trade-result-rate">${escapeHtml(r.m || "—")}</span>
      </button>`).join("");
    container.classList.add("open");
  }

  function formatHts(code) {
    const c = String(code);
    return `${c.slice(0, 4)}.${c.slice(4, 6)}.${c.slice(6, 8)}`;
  }

  let tradeSearchTimer = null;
  els.tradeSearch && els.tradeSearch.addEventListener("input", () => {
    clearTimeout(tradeSearchTimer);
    tradeSearchTimer = setTimeout(() => {
      const rows = searchHts(els.tradeSearch.value, 12);
      renderHtsResults(els.tradeResults, rows, "data-hts");
    }, 120);
  });

  els.tradeResults && els.tradeResults.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-hts]");
    if (!btn) return;
    const line = htsByCode(btn.dataset.hts);
    if (line) selectHtsLine(line);
  });

  function selectHtsLine(line, { silent = false } = {}) {
    trade.line = line;
    if (els.tradeResults) { els.tradeResults.innerHTML = ""; els.tradeResults.classList.remove("open"); }
    if (els.tradeSearch && !silent) els.tradeSearch.value = "";

    if (els.tradeSelected) {
      els.tradeSelected.style.display = "";
      els.tradeSelected.innerHTML = `
        <div class="trade-selected-code">${escapeHtml(formatHts(line.h))}</div>
        <div class="trade-selected-desc">${escapeHtml(line.d)}</div>
        <div class="trade-selected-rate">MFN ${escapeHtml(line.m || "—")}${line.cmp ? " · compound rate" : line.s ? " · specific rate" : ""}</div>`;
    }

    /* A specific or compound duty is charged per unit, so a total needs a
       quantity. Ask for one instead of quietly pricing the ad valorem leg
       alone. */
    const needsQty = !!line.s;
    if (els.tradeQuantityRow) els.tradeQuantityRow.style.display = needsQty ? "" : "none";
    if (els.tradeQuantityUnit) els.tradeQuantityUnit.textContent = needsQty && line.u ? `(${line.u})` : "";

    if (!silent) recomputeTrade();
  }

  /* --------------------------------------------------------------- origins -- */

  function renderTradeOrigins() {
    if (!els.tradeOrigins) return;
    els.tradeOrigins.innerHTML = trade.origins.map(code => {
      const c = COUNTRY_PROGRAMS[code] || { name: code, programs: [] };
      const progs = (c.programs || []).map(p => PROGRAM_LABELS[p] || p).join(", ");
      return `<span class="origin-chip">
        <span class="origin-chip-name">${escapeHtml(c.name)}</span>
        ${progs ? `<span class="origin-chip-prog">${escapeHtml(progs)}</span>` : ""}
        <button class="origin-chip-remove" data-remove-origin="${code}" title="Remove">&times;</button>
      </span>`;
    }).join("");
  }

  els.tradeOrigins && els.tradeOrigins.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove-origin]");
    if (!btn) return;
    trade.origins = trade.origins.filter(c => c !== btn.dataset.removeOrigin);
    renderTradeOrigins();
    recomputeTrade();
  });

  els.tradeOriginAdd && els.tradeOriginAdd.addEventListener("input", () => {
    const q = els.tradeOriginAdd.value.trim().toLowerCase();
    if (!els.tradeOriginResults) return;
    if (q.length < 2) { els.tradeOriginResults.innerHTML = ""; els.tradeOriginResults.classList.remove("open"); return; }

    const hits = Object.entries(COUNTRY_PROGRAMS)
      .filter(([code, c]) => !trade.origins.includes(code) && c.name.toLowerCase().includes(q))
      .slice(0, 8);

    els.tradeOriginResults.innerHTML = hits.map(([code, c]) => {
      const progs = (c.programs || []).map(p => PROGRAM_LABELS[p] || p).join(", ");
      return `<button class="trade-result-row" data-origin="${code}">
        <span class="trade-result-code">${escapeHtml(code)}</span>
        <span class="trade-result-desc">${escapeHtml(c.name)}</span>
        <span class="trade-result-rate">${escapeHtml(progs || (c.col2 ? "Column 2" : "no preference"))}</span>
      </button>`;
    }).join("");
    els.tradeOriginResults.classList.toggle("open", hits.length > 0);
  });

  els.tradeOriginResults && els.tradeOriginResults.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-origin]");
    if (!btn) return;
    if (!trade.origins.includes(btn.dataset.origin)) trade.origins.push(btn.dataset.origin);
    els.tradeOriginAdd.value = "";
    els.tradeOriginResults.innerHTML = "";
    els.tradeOriginResults.classList.remove("open");
    renderTradeOrigins();
    recomputeTrade();
  });

  /* ------------------------------------------------------------- recompute -- */

  els.tradeValue && els.tradeValue.addEventListener("input", () => {
    trade.value = Number(els.tradeValue.value) || 0;
    recomputeTrade();
  });
  els.tradeQuantity && els.tradeQuantity.addEventListener("input", () => {
    trade.quantity = Number(els.tradeQuantity.value) || 0;
    recomputeTrade();
  });
  els.tradeMode && els.tradeMode.addEventListener("change", () => {
    trade.mode = els.tradeMode.value;
    recomputeTrade();
  });
  els.tradeClaimPrefs && els.tradeClaimPrefs.addEventListener("change", () => {
    trade.claimPreferences = els.tradeClaimPrefs.checked;
    recomputeTrade();
  });

  for (const [el, key, fmt] of [
    [els.sliderVolume, "volume", v => `${v}%`],
    [els.sliderShock, "shock", v => `+${v}pp`],
    [els.sliderFx, "fx", v => `${v > 0 ? "+" : ""}${v}%`]
  ]) {
    el && el.addEventListener("input", () => {
      trade.sliders[key] = Number(el.value);
      const label = els[`slider${key[0].toUpperCase()}${key.slice(1)}Val`];
      if (label) label.textContent = fmt(trade.sliders[key]);
      recomputeTrade();
    });
  }

  els.tradeSlidersReset && els.tradeSlidersReset.addEventListener("click", () => {
    trade.sliders = { volume: 100, shock: 0, fx: 0 };
    if (els.sliderVolume) els.sliderVolume.value = 100;
    if (els.sliderShock) els.sliderShock.value = 0;
    if (els.sliderFx) els.sliderFx.value = 0;
    if (els.sliderVolumeVal) els.sliderVolumeVal.textContent = "100%";
    if (els.sliderShockVal) els.sliderShockVal.textContent = "+0pp";
    if (els.sliderFxVal) els.sliderFxVal.textContent = "0%";
    recomputeTrade();
  });

  /* The sliders move the inputs and the model recomputes from them. A tariff
     shock changes the rate, so it has to run through the same arithmetic to
     land on the right line items and re-rank the origins. */
  function recomputeTrade() {
    if (!trade.line || !tariffsReady()) return;

    const { volume, shock, fx } = trade.sliders;
    const effectiveValue = trade.value * (volume / 100) * (1 + fx / 100);
    const effectiveQty = trade.quantity * (volume / 100);

    let results = compareOrigins({
      line: trade.line,
      origins: trade.origins,
      value: effectiveValue,
      quantity: effectiveQty,
      mode: trade.mode,
      claimPreferences: trade.claimPreferences
    });

    /* A shock is an across-the-board addition to the duty rate. Applied here so
       it lands on the same line items and re-ranks the origins honestly. */
    if (shock > 0) {
      results = results.map(r => {
        const extra = Math.round(effectiveValue * (shock / 100));
        const duty = r.duty + extra;
        return Object.assign({}, r, {
          duty,
          shockDuty: extra,
          landed: r.landed + extra,
          effectiveRate: effectiveValue > 0 ? duty / effectiveValue : 0
        });
      });
      results.sort((a, b) => a.landed - b.landed);
      const best = results[0];
      for (const r of results) { r.delta = r.landed - best.landed; r.isBest = r === best; }
    }

    trade.results = results;
    renderTradeResult(effectiveValue, effectiveQty);
    persistTradeResult();
  }

  function renderTradeResult(effectiveValue, effectiveQty) {
    if (!els.tradeResult) return;
    const results = trade.results;

    if (els.tradeEmpty) els.tradeEmpty.style.display = results.length ? "none" : "";
    els.tradeResult.style.display = results.length ? "" : "none";
    if (!results.length) return;

    const best = results[0];
    const worst = results[results.length - 1];
    const spread = worst.landed - best.landed;

    const needsQty = trade.line.s && !effectiveQty;

    if (els.tradeBestValue) els.tradeBestValue.textContent = money(best.landed);
    if (els.tradeBestNote) {
      els.tradeBestNote.textContent = needsQty
        ? "Ad valorem leg only. Enter a quantity."
        : `${best.originName} · ${best.resolved.rateText}`;
    }
    if (els.tradeSpreadValue) els.tradeSpreadValue.textContent = spread > 0 ? money(spread) : "—";
    if (els.tradeSpreadNote) {
      els.tradeSpreadNote.textContent = spread > 0
        ? `${best.originName} against ${worst.originName}`
        : "Every origin lands at the same cost";
    }

    /* The table */
    if (els.tradeTable) {
      els.tradeTable.innerHTML = `
        <thead><tr>
          <th>Origin</th><th>Basis</th><th class="num">Rate</th>
          <th class="num">Duty</th><th class="num">Fees</th>
          <th class="num">Landed</th><th class="num">vs best</th>
        </tr></thead>
        <tbody>${results.map(r => `
          <tr class="${r.isBest ? "is-best" : ""}" data-stack="${r.origin}">
            <td>
              <span class="trade-origin-name">${escapeHtml(r.originName)}</span>
              ${r.resolved.opportunity ? `<span class="trade-flag-dot" title="Preference available but not applied">&#9679;</span>` : ""}
              ${r.actions.length ? `<span class="trade-flag-dot warn" title="Unmodelled trade action">&#9679;</span>` : ""}
            </td>
            <td class="trade-basis">${escapeHtml(r.resolved.label)}</td>
            <td class="num">${escapeHtml(r.resolved.rateText)}</td>
            <td class="num">${money(r.duty)}</td>
            <td class="num">${r.mpfExempt ? money(r.hmf) + " *" : money(r.hmf + r.mpf)}</td>
            <td class="num strong">${money(r.landed)}</td>
            <td class="num">${r.isBest ? "—" : "+" + money(r.delta)}</td>
          </tr>`).join("")}
        </tbody>`;
    }

    /* The decomposed stack for the best origin, which is the one worth breaking
       out. */
    if (els.tradeStack) {
      const r = best;
      const rows = [
        ["Customs value", money(r.value)],
        [`Duty · ${r.resolved.label} ${r.resolved.rateText}`, money(r.adValoremDuty)]
      ];
      if (r.specificDuty) rows.push([`Specific duty · ${trade.line.m}`, money(r.specificDuty)]);
      if (r.shockDuty) rows.push([`Tariff shock · +${trade.sliders.shock}pp`, money(r.shockDuty)]);
      if (r.hmf) rows.push(["Harbor Maintenance Fee", money(r.hmf)]);
      rows.push([
        r.mpfExempt ? "Merchandise Processing Fee · waived" : "Merchandise Processing Fee",
        r.mpfExempt ? "—" : money(r.mpf)
      ]);

      els.tradeStack.innerHTML = `
        <div class="trade-stack-head">Cost stack · ${escapeHtml(r.originName)}</div>
        ${rows.map(([k, v]) => `
          <div class="trade-stack-row"><span>${escapeHtml(k)}</span><span class="num">${v}</span></div>`).join("")}
        <div class="trade-stack-row total"><span>Landed cost</span><span class="num">${money(r.landed)}</span></div>
        ${r.mpfExempt ? `<div class="trade-stack-note">* MPF is waived on goods qualifying under ${escapeHtml(r.resolved.label)}.</div>` : ""}`;
    }

    /* Flags: conditions, opportunities, and the layer we do not model. */
    if (els.tradeFlags) {
      const flags = [];
      if (needsQty) {
        flags.push(["warn", `This line carries a ${trade.line.cmp ? "compound" : "specific"} duty of ${trade.line.m}. The figures above cover the ad valorem leg only. Enter a quantity in ${trade.line.u || "units"} for a complete total.`]);
      }
      for (const r of results) {
        if (r.resolved.condition) {
          flags.push(["cond", `${r.originName}: rate claimed under ${r.resolved.condition.label}. ${r.resolved.condition.requirement}`]);
        }
        if (r.resolved.opportunity) {
          flags.push(["opp", `${r.originName}: ${r.resolved.opportunity.label} is available and is not applied above. ${r.resolved.opportunity.requirement}`]);
        }
        for (const a of r.actions) {
          flags.push(["warn", `${r.originName}: ${a.name} may apply and is not included. ${a.summary} Verified as of ${a.asOf}.`]);
        }
      }
      els.tradeFlags.innerHTML = flags.map(([kind, text]) =>
        `<div class="trade-flag ${kind}">${escapeHtml(text)}</div>`).join("");
    }

    if (els.tradeClaimNote) {
      els.tradeClaimNote.textContent = trade.claimPreferences
        ? "Rates shown are what the lane could achieve if the origin qualifies. Conditions are listed below the table."
        : "Every origin is priced at its MFN rate, as an entry that claims nothing would pay.";
    }
  }

  /* What gets persisted and what gets handed to the model. */
  function currentTradeModel() {
    if (!trade.line || !trade.results.length) return null;
    return {
      hts: trade.line.h,
      description: trade.line.d,
      value: trade.value,
      quantity: trade.quantity,
      specificUnit: trade.line.u || "",
      mode: trade.mode,
      origins: trade.origins.slice(),
      claimPreferences: trade.claimPreferences,
      sliders: Object.assign({}, trade.sliders),
      results: trade.results,
      savedAt: Date.now()
    };
  }

  /* The narrative layer. It receives the finished arithmetic and is told not to
     recompute it. The numbers are already right, so all that is left is what
     they mean. */
  els.tradeInterpretBtn && els.tradeInterpretBtn.addEventListener("click", async () => {
    const model = currentTradeModel();
    if (!model) return;
    if (!ensureApiKey()) return;

    const btn = els.tradeInterpretBtn;
    btn.disabled = true;
    btn.textContent = "Reading the numbers…";
    els.tradeInterpretation.style.display = "";
    els.tradeInterpretationBody.textContent = "";

    const project = getActiveProject();
    try {
      const raw = await callAnthropicOnce({
        system: buildSystemPrompt() + `
  TRADE MODEL INTERPRETATION
  You are given a duty model Corridor already computed. Write no more than two
  short paragraphs saying what it means for the decision in play. Lead with the
  number that decides it. Name the single biggest risk to the saving holding.
  If a preference is conditional or a trade action is unmodelled, say so plainly
  and search to establish the current position, citing what you find.

  Output ONLY these sections:
  [[BODY]]
  The interpretation.
  [[SOURCES]]
  Any source you actually used, in the standard numbered format. Omit the
  section entirely if you did not search.`,
        content: assessmentProjectBlock(project) + "\n" + tariffPromptBlock(model),
        maxTokens: 2048
      });

      const sections = parseSections(raw);
      els.tradeInterpretationBody.innerHTML = renderBody(sections.BODY || raw);
      if (sections.SOURCES) {
        const saved = els.sourcesList.innerHTML;
        renderSources(sections.SOURCES);
        els.tradeInterpretationSources.innerHTML = els.sourcesList.innerHTML;
        els.sourcesList.innerHTML = saved;
      } else {
        els.tradeInterpretationSources.innerHTML = "";
      }
    } catch (err) {
      els.tradeInterpretationBody.textContent = "Could not interpret the model: " + err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = "What does this mean?";
    }
  });


  /* ==========================================================================
     REPORT. Everything the project established, in one document.

     Rendered in Corridor's own type and colour, and printed through the browser
     so there is no PDF dependency to keep alive. The limitations section earns
     its place: a report that stays quiet about what it could not establish is
     not decision-grade.
     ========================================================================== */

  function reportSectionHtml(record) {
    if (!record) return "";
    const s = record.sections || {};
    const bandLabel = record.band ? (ASSESSMENT_BANDS[record.band] || {}).label : null;

    const blocks = [];
    if (s.BODY) blocks.push(`<div class="report-prose">${renderBody(s.BODY)}</div>`);
    if (s.MECHANISM) blocks.push(`<div class="report-sub">Mechanism</div><div class="report-prose">${renderBody(s.MECHANISM)}</div>`);
    if (s.TABLE) {
      const table = parseTable(s.TABLE);
      if (table) blocks.push(`<div class="report-table">${tableHtml(table)}</div>`);
    }
    if (s.RISKS) blocks.push(`<div class="report-sub">What would change this</div><div class="report-prose">${renderBody(s.RISKS)}</div>`);
    if (s.READOUT) blocks.push(`<div class="report-readout">${renderBody(s.READOUT)}</div>`);
    if (s.CANNOT_ANSWER) blocks.push(`<div class="report-gap"><strong>Could not establish:</strong> ${escapeHtml(s.CANNOT_ANSWER.trim())}</div>`);

    return `
      <section class="report-section">
        <div class="report-section-head">
          <h2 class="report-h2">${escapeHtml(record.title)}</h2>
          ${bandLabel ? `<span class="assessment-band ${assessmentBandClass(record.band)}">${escapeHtml(bandLabel)}</span>` : ""}
        </div>
        ${record.summary ? `<div class="report-verdict">${escapeHtml(record.summary)}</div>` : ""}
        ${blocks.join("")}
      </section>`;
  }

  /* Sources are deduplicated across every module, so a report carries a single
     numbered register instead of five overlapping ones. */
  function reportSources(project) {
    const seen = new Map();
    const push = (text) => {
      for (const line of (text || "").split("\n")) {
        const t = line.trim();
        if (!t) continue;
        const clean = t.replace(/^\d+[\.\)]\s*/, "");
        const key = clean.toLowerCase().slice(0, 90);
        if (!seen.has(key)) seen.set(key, clean);
      }
    };
    for (const m of ASSESSMENT_MODULES) {
      const r = latestAssessment(project, m.id);
      if (r) push((r.sections || {}).SOURCES);
    }
    return Array.from(seen.values());
  }

  function reportTradeHtml(project) {
    const model = (latestTradeResult(project) || {}).model;
    if (!model) return "";
    const best = model.results[0];
    const worst = model.results[model.results.length - 1];

    return `
      <section class="report-section">
        <h2 class="report-h2">Trade model</h2>
        <div class="report-verdict">
          ${escapeHtml(best.originName)} lands at ${money(best.landed)} against
          ${escapeHtml(worst.originName)} at ${money(worst.landed)} on
          ${money(model.value)} of goods, a spread of ${money(worst.landed - best.landed)}.
        </div>
        <div class="report-meta-line">
          HTS ${escapeHtml(formatHts(model.hts))} &middot; ${escapeHtml(model.description)}<br>
          ${escapeHtml(model.mode)} &middot;
          ${model.claimPreferences ? "preferential rates claimed where the origin qualifies" : "no preference claimed"}
        </div>
        <div class="report-table">
          <table>
            <thead><tr><th>Origin</th><th>Basis</th><th class="num">Rate</th><th class="num">Duty</th><th class="num">Landed</th><th class="num">vs best</th></tr></thead>
            <tbody>${model.results.map(r => `
              <tr><td>${escapeHtml(r.originName)}</td><td>${escapeHtml(r.resolved.label)}</td>
              <td class="num">${escapeHtml(r.resolved.rateText)}</td><td class="num">${money(r.duty)}</td>
              <td class="num">${money(r.landed)}</td><td class="num">${r.isBest ? "—" : "+" + money(r.delta)}</td></tr>`).join("")}
            </tbody>
          </table>
        </div>
      </section>`;
  }

  /* What the analysis could not settle, assembled from the modules' own
     admissions and the structural limits of the tariff data. */
  function reportLimitations(project) {
    const items = [];

    for (const m of ASSESSMENT_MODULES) {
      const r = latestAssessment(project, m.id);
      if (!r) { items.push(`${assessmentModuleName(m, project)} was not run.`); continue; }
      if (r.band === "insufficient-data") {
        items.push(`${r.title}: public data could not settle this. ${(r.sections.CANNOT_ANSWER || "").trim()}`);
      }
    }

    if ((latestTradeResult(project) || {}).model) {
      items.push(
        "Duty figures are statutory rates from the USITC tariff database. Section 301, " +
        "Section 232 and IEEPA actions live in HTS chapter 99, change by proclamation, " +
        "and are not included in the landed costs shown."
      );
      const conds = new Set();
      for (const r of (latestTradeResult(project) || {}).model.results) {
        if (r.resolved.condition) conds.add(`${r.originName}: ${r.resolved.condition.requirement}`);
        if (r.resolved.opportunity) conds.add(`${r.originName}: ${r.resolved.opportunity.requirement}`);
      }
      for (const c of conds) items.push(c);
      items.push(
        `Preference eligibility by country is dated ${COUNTRY_PROGRAMS_ASOF} and is set ` +
        "annually by presidential proclamation. Verify current standing with USTR before relying on it."
      );
    }

    return items;
  }

  function renderReport() {
    if (!els.reportDoc) return;
    const project = getActiveProject();
    const band = projectDecisionBand(project);
    const decision = project.decision || {};
    const records = projectAssessmentRecords(project).filter(Boolean);
    const sources = reportSources(project);
    const limits = reportLimitations(project);

    const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

    els.reportDoc.innerHTML = `
      <article class="report">
        <header class="report-cover">
          <div class="report-eyebrow">Corridor &middot; US import trade</div>
          <h1 class="report-title">${escapeHtml(project.name)}</h1>
          ${project.goal ? `<p class="report-goal">${escapeHtml(project.goal)}</p>` : ""}
          <div class="report-cover-meta">
            ${project.role ? `<div><span>Prepared for</span>${escapeHtml(project.role)}</div>` : ""}
            ${project.industry ? `<div><span>Industry</span>${escapeHtml(project.industry)}</div>` : ""}
            ${project.geography ? `<div><span>Markets</span>${escapeHtml(project.geography)}</div>` : ""}
            <div><span>Date</span>${escapeHtml(date)}</div>
          </div>
        </header>

        <section class="report-decision tone-${band ? DECISION_BANDS[band].tone : "none"}">
          <div class="report-decision-label">Decision</div>
          <div class="report-decision-band">${band ? escapeHtml(DECISION_BANDS[band].label) : "Not yet assessed"}</div>
          ${band ? `<div class="report-decision-basis">${escapeHtml(decisionBasis(project))}</div>` : ""}
          ${decision.rationale ? `<p class="report-decision-rationale">${escapeHtml(decision.rationale)}</p>` : ""}
          ${(decision.conditions || []).length ? `
            <div class="report-sub">Conditions</div>
            <ul class="report-conditions">${decision.conditions.map(c => `<li>${escapeHtml(c)}</li>`).join("")}</ul>` : ""}
        </section>

        ${records.length
          ? records.map(reportSectionHtml).join("")
          : `<section class="report-section"><p class="report-prose">No assessments have been run yet. Run them from the Brief tab and this report fills in.</p></section>`}

        ${reportTradeHtml(project)}

        ${sources.length ? `
        <section class="report-section">
          <h2 class="report-h2">Sources</h2>
          <ol class="report-sources">${sources.map(s => `<li>${escapeHtml(s)}</li>`).join("")}</ol>
        </section>` : ""}

        ${limits.length ? `
        <section class="report-section report-limits">
          <h2 class="report-h2">Limitations</h2>
          <ul class="report-conditions">${limits.map(l => `<li>${escapeHtml(l)}</li>`).join("")}</ul>
        </section>` : ""}

        <section class="report-section report-appendix">
          <h2 class="report-h2">Appendix — dataset register</h2>
          <p class="report-prose">Every dataset Corridor is licensed to read, what each one permits it to claim, and when it was registered.</p>
          <div class="report-table">
            <table>
              <thead><tr><th>Dataset</th><th>Tier</th><th>Kind</th><th>Coverage</th><th>Cadence</th><th>Caveats</th><th>Link</th><th>Registered</th></tr></thead>
              <tbody>${datasetRegisterRows()}</tbody>
            </table>
          </div>
        </section>

        <footer class="report-foot">
          Generated by Corridor on ${escapeHtml(date)}. Every figure carries its source.
          Figures labelled derived or projected are not reported values.
        </footer>
      </article>`;
  }

  els.downloadPdfBtn && els.downloadPdfBtn.addEventListener("click", () => {
    renderReport();
    setTimeout(() => window.print(), 60);
  });

  /* --------------------------------------------------------------------------
     The project workbook. Every assessment, the decision and the trade model as
     real rows instead of a transcript. The per-answer export on the Ask tab is
     unchanged; this is the project-level artefact.
     -------------------------------------------------------------------------- */
  function exportProjectWorkbook() {
    if (!(window.XLSX && window.XLSX.utils)) {
      alert("The spreadsheet library did not load, so the workbook is unavailable right now.");
      return;
    }
    const project = getActiveProject();
    const records = projectAssessmentRecords(project).filter(Boolean);
    if (!records.length && !(latestTradeResult(project) || {}).model) {
      alert("Run an assessment or save a trade model first. There is nothing to export yet.");
      return;
    }

    const XLSX = window.XLSX;
    const wb = XLSX.utils.book_new();
    const addSheet = (name, rows, widths) => {
      if (!rows || rows.length < 2) return;
      const ws = XLSX.utils.aoa_to_sheet(rows);
      if (widths) ws["!cols"] = widths.map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    };

    /* 1. Decision ----------------------------------------------------------- */
    const band = projectDecisionBand(project);
    const decision = project.decision || {};
    const dec = [["Field", "Content"]];
    dec.push(["Project", project.name]);
    if (project.role) dec.push(["Prepared for", project.role]);
    if (project.goal) dec.push(["Decision in play", project.goal]);
    if (project.industry) dec.push(["Industry", project.industry]);
    if (project.geography) dec.push(["Markets", project.geography]);
    dec.push(["Generated", new Date().toISOString().slice(0, 16).replace("T", " ")]);
    dec.push([]);
    dec.push(["Decision", band ? DECISION_BANDS[band].label : "Not yet assessed"]);
    if (band) dec.push(["Basis", decisionBasis(project)]);
    if (decision.rationale) dec.push(["Rationale", cellText(decision.rationale)]);
    for (const c of (decision.conditions || [])) dec.push(["Condition", cellText(c)]);
    addSheet("Decision", dec, [22, 110]);

    /* 2. Verdicts, one row per module -------------------------------------- */
    const verdicts = [["Assessment", "Band", "Verdict", "Justification", "Run at", "Stale"]];
    for (const m of ASSESSMENT_MODULES) {
      const r = latestAssessment(project, m.id);
      verdicts.push(r
        ? [r.title, (ASSESSMENT_BANDS[r.band] || {}).label || r.band || "",
           cellText(r.summary), cellText(r.justification),
           new Date(r.createdAt).toISOString().slice(0, 16).replace("T", " "),
           assessmentStaleness(r, project) || ""]
        : [assessmentModuleName(m, project), "Not run", "", "", "", ""]);
    }
    addSheet("Verdicts", verdicts, [26, 18, 70, 50, 18, 28]);

    /* 3. One sheet per assessment ------------------------------------------ */
    for (const r of records) {
      const s = r.sections || {};
      const rows = [["Section", "Content"]];
      rows.push(["Verdict", cellText(r.summary)]);
      for (const [label, key] of [
        ["Headline", "HEADLINE"], ["Body", "BODY"], ["Mechanism", "MECHANISM"],
        ["Risks", "RISKS"], ["Readout", "READOUT"], ["Confidence", "CONFIDENCE"],
        ["Cannot answer", "CANNOT_ANSWER"]
      ]) {
        if (s[key]) rows.push([label, cellText(s[key])]);
      }
      // A module's own table lands under its prose as a real grid.
      const table = s.TABLE ? parseTable(s.TABLE) : null;
      if (table) {
        rows.push([]);
        rows.push(table.header.map(cellText));
        for (const line of table.rows) rows.push(line.map(cellText));
      }
      addSheet(r.title, rows, [18, 110]);
    }

    /* 4. Trade model -------------------------------------------------------- */
    const model = (latestTradeResult(project) || {}).model;
    if (model) {
      const inputs = [["Field", "Value"]];
      inputs.push(["HTS", formatHts(model.hts)]);
      inputs.push(["Description", model.description]);
      inputs.push(["Shipment value (USD)", model.value]);
      if (model.quantity) inputs.push([`Quantity (${model.specificUnit || "units"})`, model.quantity]);
      inputs.push(["Mode", model.mode]);
      inputs.push(["Preferences claimed", model.claimPreferences ? "yes" : "no"]);
      inputs.push(["Saved", new Date(model.savedAt).toISOString().slice(0, 16).replace("T", " ")]);
      inputs.push([]);
      inputs.push(["Scope", "Statutory HTS rates only. Section 301, 232 and IEEPA duties are not included."]);
      addSheet("Trade inputs", inputs, [26, 80]);

      const cmp = [["Origin", "Basis", "Rate", "Duty (USD)", "HMF (USD)", "MPF (USD)", "Landed (USD)", "Delta vs best", "Flags"]];
      for (const r of model.results) {
        const flags = [];
        if (r.resolved.condition) flags.push("conditional: " + r.resolved.condition.label);
        if (r.resolved.opportunity) flags.push("available, not applied: " + r.resolved.opportunity.label);
        for (const a of r.actions) flags.push("unmodelled: " + a.name);
        cmp.push([
          r.originName, r.resolved.label, r.resolved.rateText,
          r.duty, r.hmf, r.mpfExempt ? "exempt" : r.mpf, r.landed,
          r.isBest ? 0 : r.delta, flags.join("; ")
        ]);
      }
      addSheet("Trade comparison", cmp, [18, 26, 12, 14, 12, 12, 14, 14, 60]);
    }

    /* 5. Sources and provenance -------------------------------------------- */
    const sources = reportSources(project);
    if (sources.length) {
      addSheet("Sources", [["Source"], ...sources.map(s => [cellText(s)])], [130]);
    }

    const limits = reportLimitations(project);
    if (limits.length) {
      addSheet("Limitations", [["Limitation"], ...limits.map(l => [cellText(l)])], [130]);
    }

    const prov = [["Dataset", "Publisher", "Tier", "Kind", "Cadence", "Link", "Registered"]];
    for (const d of DATASETS) {
      prov.push([d.title, d.publisher, "T" + d.tier, d.kind, d.cadence || "", d.doi || d.url || "", d.ingested || ""]);
    }
    addSheet("Dataset register", prov, [46, 40, 8, 14, 28, 50, 14]);

    /* 6. Memory ------------------------------------------------------------- */
    const mem = [["Fact", "Kind", "Source", "Status"]];
    for (const m of getMemories()) {
      mem.push([cellText(m.text), m.kind, (m.source && m.source.label) || "", m.status || "active"]);
    }
    addSheet("Project memory", mem, [90, 14, 30, 12]);

    const safe = (project.name || "corridor").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase();
    XLSX.writeFile(wb, `corridor-${safe || "project"}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  els.downloadXlsBtn && els.downloadXlsBtn.addEventListener("click", exportProjectWorkbook);


  /* ==========================================================================
     LANES, THE MAP AND THE FEED
     ========================================================================== */

  let selectedLaneId = null;
  let geoLoadStarted = false;

  function getLanes(project) {
    return (project || getActiveProject()).lanes || [];
  }

  function laneById(id) {
    return getLanes().find(l => l.id === id) || null;
  }

  function updateLane(id, fn) {
    updateActiveProject(p => {
      const l = (p.lanes || []).find(x => x.id === id);
      if (l) fn(l);
    });
  }

  /* ----- the map ----- */

  function renderMapPanel() {
    if (!els.mapPanel) return;

    /* Nothing else loads the geography, and a map that says "drawing" forever
       is the same bug the tariff schedule had. Start it here, redraw when it
       lands. */
    if (!GEO.world && !GEO.failed && !geoLoadStarted) {
      geoLoadStarted = true;
      loadGeo().then(() => renderProject());
    }

    const lanes = getLanes();
    if (!lanes.length) {
      els.mapPanel.innerHTML = `
        <div class="map-empty">
          <h2 class="map-empty-title">What are you watching?</h2>
          <p class="map-empty-copy">Add a lane and Corridor draws its route, works out
          what its duty rests on, and watches the things that could change it.</p>
          ${laneFormHtml()}
        </div>`;
      return;
    }

    els.mapPanel.innerHTML = `<div class="map-wrap" id="mapWrap"></div>`;
    renderMap(document.getElementById("mapWrap"), { lanes, selectedId: selectedLaneId });
  }

  function laneFormHtml() {
    const origins = Object.entries(COUNTRY_PROGRAMS)
      .filter(([code]) => portFor(code))
      .sort((a, b) => a[1].name.localeCompare(b[1].name));
    return `
      <form class="lane-form" id="laneForm">
        <div class="lane-form-row">
          <label class="lane-field">
            <span>Origin</span>
            <select id="laneOrigin">
              ${origins.map(([code, c]) => `<option value="${code}">${escapeHtml(c.name)}</option>`).join("")}
            </select>
          </label>
          <label class="lane-field">
            <span>Product</span>
            <input type="text" id="laneProduct" placeholder="apparel, knit" autocomplete="off">
          </label>
          <label class="lane-field">
            <span>Into</span>
            <select id="laneDestination">
              ${DESTINATIONS.map(d => `<option value="${d.id}">${escapeHtml(d.label)}</option>`).join("")}
            </select>
          </label>
          <button class="btn-primary" type="submit">Watch this lane</button>
        </div>
      </form>`;
  }

  /* ----- what moved ----- */

  function renderFeed() {
    if (!els.feedPanel) return;
    const project = getActiveProject();
    const lanes = getLanes(project);
    if (!lanes.length) { els.feedPanel.innerHTML = ""; return; }

    const feed = buildFeed(lanes, project.lastVisit);
    const stale = lanes.reduce((n, l) => n + (l.watch || []).filter(w => isStale(w)).length, 0);

    if (!feed.moved.length && !feed.unchanged) {
      els.feedPanel.innerHTML = `
        <div class="feed-none">
          <span>Nothing has been checked yet.</span>
          <button class="btn-primary" id="checkAllBtn">Check the watchlist (${lanes.reduce((n,l)=>n+(l.watch||[]).length,0)})</button>
        </div>`;
      return;
    }

    const since = project.lastVisit
      ? `since you were last here, ${formatTimestamp(project.lastVisit)}`
      : "on the most recent check";

    els.feedPanel.innerHTML = `
      <div class="feed-head">
        <div class="feed-title">What moved <span class="feed-since">${escapeHtml(since)}</span></div>
        <button class="feed-check" id="checkAllBtn">${stale ? `Re-check ${stale} due` : "Re-check all"}</button>
      </div>
      ${feed.moved.length ? `
        <div class="feed-list">
          ${feed.moved.map(m => `
            <div class="feed-item s-${m.status}">
              <div class="feed-mark">${m.status === "escalated" ? "&uarr;" : m.status === "eased" ? "&darr;" : "+"}</div>
              <div class="feed-body">
                <div class="feed-subject">
                  ${escapeHtml(m.subject)}
                  <span class="feed-lane" data-open-lane="${m.laneId}">${escapeHtml(m.laneLabel)}</span>
                </div>
                ${m.was ? `<div class="feed-was"><span>Was</span> ${escapeHtml(m.was)}</div>` : ""}
                <div class="feed-now"><span>Now</span> ${escapeHtml(m.now)}</div>
                ${m.source ? `<a class="feed-source" href="${escapeHtml(m.source)}" target="_blank" rel="noopener">Source &#8599;</a>` : ""}
              </div>
            </div>`).join("")}
        </div>` : `<div class="feed-quiet">Nothing moved.</div>`}
      ${feed.unchanged ? `<div class="feed-unchanged">${feed.unchanged} item${feed.unchanged === 1 ? "" : "s"} unchanged</div>` : ""}`;
  }

  /* ----- the watchlist ----- */

  function renderLanes() {
    if (!els.lanesPanel) return;
    const lanes = getLanes();
    if (!lanes.length) { els.lanesPanel.innerHTML = ""; return; }

    els.lanesPanel.innerHTML = `
      <div class="lanes-head">
        <div class="lanes-title">Watching</div>
        <button class="lanes-add" id="lanesAddBtn">Add a lane</button>
      </div>
      <div class="lanes-form-slot" id="lanesFormSlot"></div>
      <div class="lanes-list">
        ${lanes.map(l => {
          const e = laneExposure(l);
          const flags = (l.watch || []).map(w => lastCheck(w)).filter(Boolean);
          const worst = flags.find(f => f.status === "escalated") || flags.find(f => f.status === "new");
          return `
          <div class="lane-row ${l.id === selectedLaneId ? "selected" : ""}" data-lane-row="${l.id}">
            <div class="lane-row-main">
              <div class="lane-row-title">
                ${escapeHtml(l.label)}
                ${l.product ? `<span class="lane-product">${escapeHtml(l.product)}</span>` : ""}
              </div>
              <div class="lane-row-route">${escapeHtml(routeSummary(l))}</div>
            </div>
            <div class="lane-row-facts">
              ${e.duty ? `<span class="lane-rate">${escapeHtml(e.duty.claimed.rateText)}</span>
                          <span class="lane-basis">${escapeHtml(e.duty.claimed.label)}</span>`
                       : `<span class="lane-basis muted">no HTS line set</span>`}
            </div>
            <div class="lane-row-state">
              ${worst ? `<span class="lane-flag s-${worst.status}">${escapeHtml(worst.status)}</span>`
                      : `<span class="lane-flag quiet">${(l.watch || []).length} watched</span>`}
            </div>
          </div>`;
        }).join("")}
      </div>`;
  }

  /* ----- one lane, opened ----- */

  function openLane(id) {
    selectedLaneId = id;
    const lane = laneById(id);
    if (!lane || !els.laneDetail) return;
    const e = laneExposure(lane);

    els.laneDetail.hidden = false;
    els.laneDetail.innerHTML = `
      <div class="ld-head">
        <div>
          <h2 class="ld-title">${escapeHtml(lane.label)}</h2>
          <div class="ld-route">${escapeHtml(routeSummary(lane))}</div>
        </div>
        <div class="ld-actions">
          <button class="ld-btn" id="ldCheck">Check now</button>
          <button class="ld-btn" id="ldCape">${lane.route.basis === "cape" ? "Route via Suez" : "Route via the Cape"}</button>
          <button class="ld-btn danger" id="ldRemove">Remove</button>
        </div>
      </div>

      <div class="ld-grid">
        <div class="ld-card">
          <div class="ld-label">Duty</div>
          ${e.duty ? `
            <div class="ld-value">${escapeHtml(e.duty.claimed.rateText)}</div>
            <div class="ld-note">${escapeHtml(e.duty.claimed.label)}</div>
            ${e.duty.claimed.condition ? `<div class="ld-cond"><strong>Only if.</strong> ${escapeHtml(e.duty.claimed.condition.requirement)}</div>` : ""}
            ${e.duty.claimed.opportunity ? `<div class="ld-cond"><strong>${escapeHtml(e.duty.claimed.opportunity.label)}.</strong> ${escapeHtml(e.duty.claimed.opportunity.requirement)}</div>` : ""}
            ${e.duty.notComputable ? `<div class="ld-cond">${escapeHtml(e.duty.notComputableWhy)}</div>` : ""}
          ` : `
            <div class="ld-value muted">Not set</div>
            <div class="ld-note">Set an HTS line and the duty becomes exact.</div>
            <div class="ld-hts">
              <input type="text" id="ldHtsSearch" placeholder="search the tariff schedule" autocomplete="off">
              <div class="trade-results" id="ldHtsResults"></div>
            </div>`}
        </div>

        <div class="ld-card">
          <div class="ld-label">Programmes ${escapeHtml(e.originName)} holds</div>
          ${e.programs.length
            ? `<div class="ld-chips">${e.programs.map(p => `<span class="ld-chip">${escapeHtml(p.label)}</span>`).join("")}</div>`
            : `<div class="ld-note">None. Everything from here pays the MFN rate.</div>`}
          ${e.actions.length ? `
            <div class="ld-label mt">Not modelled</div>
            ${e.actions.map(a => `<div class="ld-warn">${escapeHtml(a.name)}. ${escapeHtml(a.summary)}</div>`).join("")}` : ""}
        </div>

        <div class="ld-card">
          <div class="ld-label">Chokepoints on the route</div>
          ${e.chokepoints.length
            ? e.chokepoints.map(c => `
                <div class="ld-cp">
                  <span class="ld-cp-name">${escapeHtml(c.name)}</span>
                  <span class="ld-cp-traffic">${(c.vessels || 0).toLocaleString()} vessels a year</span>
                </div>`).join("")
            : `<div class="ld-note">None. This route crosses open ocean.</div>`}
          <div class="ld-basis">Route from the standard-routing table${lane.route.basis === "cape" ? ", via the Cape" : ""}. Editable, and not a vessel-level routing.</div>
        </div>
      </div>

      <div class="ld-watch">
        <div class="ld-label">Watching ${(lane.watch || []).length}</div>
        ${(lane.watch || []).map(w => {
          const last = lastCheck(w);
          const prev = w.history.length > 1 ? w.history[w.history.length - 2] : null;
          return `
          <div class="ld-item ${last ? "s-" + last.status : "s-none"}">
            <div class="ld-item-head">
              <span class="ld-item-subject">${escapeHtml(w.subject)}</span>
              ${last ? `<span class="ld-item-status">${escapeHtml(last.status)}</span>` : `<span class="ld-item-status quiet">not checked</span>`}
            </div>
            <div class="ld-item-why">${escapeHtml(w.why)}</div>
            ${last ? `<div class="ld-item-state">${escapeHtml(last.state)}</div>` : ""}
            ${last && last.change && last.change.toLowerCase() !== "first check"
              ? `<div class="ld-item-change"><strong>Changed.</strong> ${escapeHtml(last.change)}</div>` : ""}
            ${prev ? `<details class="ld-item-prev"><summary>Was, ${escapeHtml(formatTimestamp(prev.checkedAt))}</summary><div>${escapeHtml(prev.state)}</div></details>` : ""}
            ${last && last.source ? `<a class="ld-item-source" href="${escapeHtml(last.source)}" target="_blank" rel="noopener">Source &#8599;</a>` : ""}
          </div>`;
        }).join("")}
      </div>`;

    renderMapPanel();
    els.laneDetail.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function closeLane() {
    selectedLaneId = null;
    if (els.laneDetail) { els.laneDetail.hidden = true; els.laneDetail.innerHTML = ""; }
    renderMapPanel();
    renderLanes();
  }

  /* ----- checking ----- */

  async function checkWatchItems(items, onProgress) {
    if (!ensureApiKey()) return;
    let done = 0;
    for (const { laneId, itemId } of items) {
      const lane = laneById(laneId);
      const item = lane && (lane.watch || []).find(w => w.id === itemId);
      if (!item) continue;
      onProgress && onProgress(++done, items.length, item.subject);
      try {
        const raw = await callAnthropicOnce({
          system: "You check the current status of one trade policy instrument or shipping route. Search before answering. Be precise about dates. Answer only in the format asked for.",
          content: watchCheckPrompt(item),
          maxTokens: 700
        });
        const result = parseWatchCheck(raw);
        updateLane(laneId, l => {
          const w = (l.watch || []).find(x => x.id === itemId);
          if (w) recordCheck(w, result);
        });
      } catch (err) {
        console.warn("Watch check failed:", item.subject, err);
      }
    }
  }

  async function checkAll({ onlyStale = false } = {}) {
    const lanes = getLanes();
    const targets = [];
    for (const l of lanes) {
      for (const w of (l.watch || [])) {
        if (onlyStale && !isStale(w)) continue;
        targets.push({ laneId: l.id, itemId: w.id });
      }
    }
    if (!targets.length) return;

    const btn = document.getElementById("checkAllBtn") || document.getElementById("ldCheck");
    const label = btn ? btn.textContent : "";
    if (btn) btn.disabled = true;

    await checkWatchItems(targets, (done, total, subject) => {
      if (btn) btn.textContent = `Checking ${done} of ${total}: ${subject}`.slice(0, 52);
    });

    if (btn) { btn.disabled = false; btn.textContent = label; }
    renderProject();
    if (selectedLaneId) openLane(selectedLaneId);
  }

  /* ----- wiring ----- */

  function addLane({ origin, product, destination }) {
    const lane = blankLane({ origin, product, destination });
    lane.watch = deriveWatchItems(lane);
    updateActiveProject(p => {
      p.lanes = p.lanes || [];
      p.lanes.push(lane);
    });
    renderProject();
    openLane(lane.id);
  }

  document.addEventListener("submit", (e) => {
    const form = e.target.closest("#laneForm");
    if (!form) return;
    e.preventDefault();
    addLane({
      origin: document.getElementById("laneOrigin").value,
      product: document.getElementById("laneProduct").value,
      destination: document.getElementById("laneDestination").value
    });
  });

  document.addEventListener("click", (e) => {
    const t = (sel) => e.target.closest(sel);

    if (t("#checkAllBtn")) return checkAll({ onlyStale: false });
    if (t("#ldCheck")) return checkAll({ onlyStale: false });
    if (t("#ldRemove")) {
      const id = selectedLaneId;
      if (!id || !confirm("Stop watching this lane?")) return;
      updateActiveProject(p => { p.lanes = (p.lanes || []).filter(l => l.id !== id); });
      closeLane();
      return renderProject();
    }
    if (t("#ldCape")) {
      const lane = laneById(selectedLaneId);
      if (!lane) return;
      const viaCape = lane.route.basis !== "cape";
      updateLane(lane.id, l => {
        l.route = routeFor(l.origin, l.destination, { viaCape });
        l.watch = refreshWatchItems(l);
      });
      return openLane(lane.id);
    }
    if (t("#lanesAddBtn")) {
      const slot = document.getElementById("lanesFormSlot");
      if (slot) slot.innerHTML = slot.innerHTML ? "" : laneFormHtml();
      return;
    }

    const row = t("[data-lane-row]");
    if (row) return openLane(row.dataset.laneRow);

    const feedLane = t("[data-open-lane]");
    if (feedLane) return openLane(feedLane.dataset.openLane);

    const mapLane = t("[data-lane]");
    if (mapLane && mapLane.closest(".map-svg")) return openLane(mapLane.dataset.lane);
  });

  /* Setting an HTS line on a lane turns its duty from a guess into a lookup. */
  let ldSearchTimer = null;
  document.addEventListener("input", (e) => {
    if (e.target.id !== "ldHtsSearch") return;
    clearTimeout(ldSearchTimer);
    ldSearchTimer = setTimeout(() => {
      const box = document.getElementById("ldHtsResults");
      if (!box) return;
      const rows = searchHts(e.target.value, 8);
      box.innerHTML = rows.map(r => `
        <button class="trade-result-row" data-set-hts="${r.h}">
          <span class="trade-result-code">${escapeHtml(formatHts(r.h))}</span>
          <span class="trade-result-desc">${escapeHtml(r.d)}</span>
          <span class="trade-result-rate">${escapeHtml(r.m || "\u2014")}</span>
        </button>`).join("");
      box.classList.toggle("open", rows.length > 0);
    }, 120);
  });

  document.addEventListener("click", (e) => {
    const nav = e.target.closest("[data-corridor-link]");
    if (nav) {
      e.preventDefault();
      corridorNavigate(nav.getAttribute("data-corridor-link"));
      return;
    }
    const btn = e.target.closest("[data-set-hts]");
    if (!btn || !selectedLaneId) return;
    updateLane(selectedLaneId, l => {
      l.hts = btn.dataset.setHts;
      l.watch = refreshWatchItems(l);
    });
    renderProject();
    openLane(selectedLaneId);
  });

  /* --------------------------------------------------------------------------
     Boot. Everything above is declarations and listeners. This is the only place
     that renders, and it runs last because the first render reaches into the
     book and trade code declared further down.
     -------------------------------------------------------------------------- */
  renderSidebar();
  renderProject();

  /* The feed compares against the previous visit, so the stamp is written only
     after the first render has used it. */
  setTimeout(() => updateActiveProject(p => { p.lastVisit = Date.now(); }), 0);
  renderAskHint();
  renderUploadedFiles();

  /* Land somewhere. Without this nothing has the active class and the main
     column is blank, which is what a plain reload used to do. */
  showHome();



}
