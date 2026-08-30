// @ts-nocheck
/* Corridor domain logic — ported from the original static app.
   Concatenated in the original script order; behaviour unchanged. */

/* ==================== datasets.js ==================== */
/* ==========================================================================
   CORRIDOR — Dataset registry

   The single source of truth for provenance. Three consumers read this array,
   so what the model is told, what a report publishes, and what an export
   claims cannot drift apart.

     buildSystemPrompt()       generates the source hierarchy
     datasetRegisterRows()     renders the register in a project report
     exportProjectWorkbook()   writes the provenance sheet

   kind:
     "bundled"     Corridor ships the data and queries it locally. Figures may
                   be quoted directly, with the row's own year and unit.
     "reference"   Corridor holds the metadata only. It knows the dataset
                   exists and what fields it carries. NEVER a source of figures.
     "live-search" Reached at answer time via web search. Figures must come
                   back with a URL from the actual search result.
   ========================================================================== */

const DATASETS = [

  /* ---------------------------------------------------------------- bundled */
  {
    id: "usgs-mcs-2026",
    tier: 1,
    kind: "bundled",
    publisher: "U.S. Geological Survey, National Minerals Information Center",
    title: "Mineral Commodity Summaries 2026",
    url: "https://www.usgs.gov/centers/national-minerals-information-center/mineral-commodity-summaries",
    domains: ["usgs.gov", "sciencebase.gov"],
    doi: null,
    summary:
      "Annual statistics on production, reserves, imports, exports, consumption, " +
      "price and net import reliance for every mineral commodity the USGS tracks.",
    coverage: { rows: 8886, commodities: 127, countries: 126, africa: true },
    temporal: { start: 2021, end: 2025 },
    cadence: "Annual, published each January",
    fields: ["commodity", "country", "statistic", "detail", "unit", "year", "value", "flag"],
    localPath: "data/mcs2026.json",
    caveats:
      "Values are rounded to avoid disclosing company proprietary data. " +
      "Qualifier flags are preserved: E = estimate, > / < = bound, " +
      "W = withheld, NA = not available. Reserves are a point-in-time estimate, " +
      "not a production forecast.",
    ingested: "2026-08-27"
  },

  /* -------------------------------------------------------------- reference */
  {
    id: "usgs-africa-minerals-infrastructure-gis",
    tier: 1,
    kind: "reference",
    publisher: "U.S. Geological Survey, National Minerals Information Center",
    title:
      "Compilation of Geospatial Data (GIS) for the Mineral Industries and " +
      "Related Infrastructure of Africa",
    url: "https://www.sciencebase.gov/catalog/item/607611a9d34e018b3201cbbf",
    doi: "https://doi.org/10.5066/P97EQWXP",
    sciencebaseId: "607611a9d34e018b3201cbbf",
    summary:
      "Georeferenced mineral production and processing facilities, exploration " +
      "and development sites, undiscovered resource tracts, and the transport, " +
      "power and hydrocarbon infrastructure that serves them across Africa.",
    coverage: { layers: 24, africa: true },
    temporal: { start: 2008, end: 2019 },
    cadence: "Static release, 2021",
    localPath: "data/africa-gis-layers.json",
    caveats:
      "Corridor holds the FGDC metadata for this geodatabase, not the geodata " +
      "itself (the .gdb is a 138 MB download). Corridor may state which layers " +
      "exist and what fields they carry, and point to the DOI. It must never " +
      "quote a coordinate, facility count or capacity from it.",
    ingested: "2026-08-27"
  },

  /* ------------------------------------------------------------ live-search */
  {
    id: "usitc-hts-dataweb",
    tier: 1,
    kind: "live-search",
    publisher: "U.S. International Trade Commission",
    title: "Harmonized Tariff Schedule and DataWeb",
    url: "https://hts.usitc.gov/",
    domains: ["usitc.gov", "hts.usitc.gov", "dataweb.usitc.gov"],
    summary: "Statutory US tariff rates by HTS line, and US import/export statistics.",
    cadence: "HTS revised through the year; trade data monthly",
    caveats: "HTS revisions supersede one another — always carry the revision or as-of date."
  },
  {
    id: "ustr",
    tier: 1,
    kind: "live-search",
    publisher: "Office of the U.S. Trade Representative",
    title: "USTR — AGOA eligibility, trade actions and releases",
    url: "https://ustr.gov/",
    domains: ["ustr.gov", "agoa.info"],
    summary: "AGOA country eligibility determinations, Section 301 actions, trade agreement texts.",
    cadence: "Event-driven; AGOA eligibility reviewed annually",
    caveats: "Eligibility can be revoked or restored by proclamation mid-year."
  },
  {
    id: "federal-register",
    tier: 1,
    kind: "live-search",
    publisher: "Office of the Federal Register",
    title: "Federal Register — Section 232, Section 301, Executive Orders",
    url: "https://www.federalregister.gov/",
    domains: ["federalregister.gov"],
    summary: "The legal instrument of record for US trade measures and their effective dates.",
    cadence: "Daily",
    caveats: "The controlling text is the notice itself, not the summary or press coverage of it."
  },
  {
    id: "census-trade",
    tier: 1,
    kind: "live-search",
    publisher: "U.S. Census Bureau",
    title: "USA Trade Online / Foreign Trade statistics",
    url: "https://www.census.gov/foreign-trade/",
    domains: ["census.gov"],
    summary: "Official US merchandise trade by partner country and commodity.",
    cadence: "Monthly, roughly a five-week lag",
    caveats: "Monthly figures are revised; annual revisions land each June."
  },
  {
    id: "trade-gov-ita",
    tier: 1,
    kind: "live-search",
    publisher: "International Trade Administration, U.S. Department of Commerce",
    title: "ITA country commercial guides and trade data",
    url: "https://www.trade.gov/",
    domains: ["trade.gov"],
    summary: "Market access conditions, tariffs and business climate by country.",
    cadence: "Country guides updated annually"
  },
  {
    id: "crs",
    tier: 1,
    kind: "live-search",
    publisher: "Congressional Research Service",
    title: "CRS reports",
    url: "https://crsreports.congress.gov/",
    domains: ["crsreports.congress.gov", "congress.gov"],
    summary: "Non-partisan analysis of trade law and policy prepared for Congress.",
    cadence: "Event-driven",
    caveats: "Reports carry a date and are not retroactively corrected — check currency."
  },
  {
    id: "un-comtrade",
    tier: 2,
    kind: "live-search",
    publisher: "United Nations Statistics Division",
    title: "UN Comtrade",
    url: "https://comtrade.un.org/",
    domains: ["comtrade.un.org", "un.org"],
    summary: "Bilateral merchandise trade flows as reported by both partners.",
    cadence: "Annual and monthly, reporting lag varies by country",
    caveats: "Mirror statistics diverge — a flow reported by the importer rarely matches the exporter."
  },
  {
    id: "world-bank-wits",
    tier: 2,
    kind: "live-search",
    publisher: "World Bank",
    title: "World Integrated Trade Solution (WITS) and World Bank Open Data",
    url: "https://wits.worldbank.org/",
    domains: ["wits.worldbank.org", "worldbank.org", "data.worldbank.org"],
    summary: "Tariff and trade indicators, and country development statistics.",
    cadence: "Annual"
  },
  {
    id: "wto",
    tier: 2,
    kind: "live-search",
    publisher: "World Trade Organization",
    title: "WTO tariff database and dispute settlement",
    url: "https://www.wto.org/",
    domains: ["wto.org"],
    summary: "Bound and applied tariff rates, and the status of trade disputes.",
    cadence: "Annual tariff profiles; disputes event-driven"
  },
  {
    id: "imf-dots",
    tier: 2,
    kind: "live-search",
    publisher: "International Monetary Fund",
    title: "Direction of Trade Statistics",
    url: "https://data.imf.org/",
    domains: ["imf.org", "data.imf.org"],
    summary: "Bilateral trade balances and flows on a consistent basis across countries.",
    cadence: "Quarterly"
  },
  {
    id: "fred",
    tier: 2,
    kind: "live-search",
    publisher: "Federal Reserve Bank of St. Louis",
    title: "FRED economic data",
    url: "https://fred.stlouisfed.org/",
    domains: ["fred.stlouisfed.org", "stlouisfed.org"],
    summary: "Time series for exchange rates, commodity prices and macro indicators.",
    cadence: "Varies by series",
    caveats: "Always cite the series ID — FRED carries many near-identical series."
  },
  {
    id: "afcfta-au",
    tier: 2,
    kind: "live-search",
    publisher: "African Union / AfCFTA Secretariat",
    title: "AfCFTA official releases and protocols",
    url: "https://au-afcfta.org/",
    domains: ["au-afcfta.org", "au.int"],
    summary: "Continental free trade area protocols, ratification status, tariff schedules.",
    cadence: "Event-driven"
  },
  {
    id: "national-stats-offices",
    tier: 2,
    kind: "live-search",
    publisher: "National statistics offices",
    title: "National statistics and central bank data for the country in question",
    url: null,
    summary: "The country's own reported trade, production and reserve figures.",
    cadence: "Varies",
    caveats: "Use when the country's own reporting is the question; note where it diverges from mirror data."
  },
  {
    id: "usda-fas",
    tier: 1,
    kind: "live-search",
    publisher: "USDA Foreign Agricultural Service",
    title: "Global Agricultural Trade System (GATS)",
    url: "https://fas.usda.gov/",
    domains: ["fas.usda.gov", "apps.fas.usda.gov"],
    summary: "US agricultural export and import statistics by commodity and partner country.",
    cadence: "Monthly"
  },
  {
    id: "usda-ers",
    tier: 1,
    kind: "live-search",
    publisher: "USDA Economic Research Service",
    title: "International agricultural trade data and outlook",
    url: "https://www.ers.usda.gov/",
    domains: ["ers.usda.gov"],
    summary: "Analysis and projections on agricultural trade, food security and commodity markets.",
    cadence: "Varies, regular outlook reports"
  },
  {
    id: "eia-petroleum",
    tier: 1,
    kind: "live-search",
    publisher: "U.S. Energy Information Administration",
    title: "International energy statistics",
    url: "https://www.eia.gov/",
    domains: ["eia.gov"],
    summary: "Crude oil, gas and refined product production, trade and price data by country.",
    cadence: "Monthly and annual, varies by series"
  },
  {
    id: "treasury-ofac",
    tier: 1,
    kind: "live-search",
    publisher: "U.S. Treasury, Office of Foreign Assets Control",
    title: "Sanctions programs and the Specially Designated Nationals (SDN) list",
    url: "https://ofac.treasury.gov/",
    domains: ["ofac.treasury.gov", "treasury.gov"],
    summary: "Active sanctions programs, designated entities and individuals, and licensing guidance.",
    cadence: "Updated as designations change",
    caveats: "Designations change without notice — always check the list is current as of the answer date."
  },
  {
    id: "exim-bank",
    tier: 1,
    kind: "live-search",
    publisher: "Export-Import Bank of the United States",
    title: "Country limitation schedule and financed transactions",
    url: "https://www.exim.gov/",
    domains: ["exim.gov"],
    summary: "US export credit availability by country, and the transactions Ex-Im has financed.",
    cadence: "Country schedule updated periodically"
  },
  {
    id: "dfc",
    tier: 1,
    kind: "live-search",
    publisher: "U.S. International Development Finance Corporation",
    title: "Active projects and country exposure",
    url: "https://www.dfc.gov/",
    domains: ["dfc.gov"],
    summary: "US development finance commitments, active projects and sector exposure by country.",
    cadence: "Project list updated on an ongoing basis"
  },
  {
    id: "afdb",
    tier: 2,
    kind: "live-search",
    publisher: "African Development Bank",
    title: "African Economic Outlook and statistics",
    url: "https://www.afdb.org/",
    domains: ["afdb.org"],
    summary: "Continental and country-level economic indicators, infrastructure financing and outlook analysis.",
    cadence: "Annual outlook, ongoing project data"
  },
  {
    id: "unctad",
    tier: 2,
    kind: "live-search",
    publisher: "United Nations Conference on Trade and Development",
    title: "Trade and Development Report, FDI statistics",
    url: "https://unctad.org/",
    domains: ["unctad.org"],
    summary: "Global and regional trade trends, foreign direct investment flows, and development analysis.",
    cadence: "Annual reports, ongoing statistical database"
  },
  {
    id: "cbp",
    tier: 1,
    kind: "live-search",
    publisher: "U.S. Customs and Border Protection",
    title: "Trade enforcement actions and entry data",
    url: "https://www.cbp.gov/",
    domains: ["cbp.gov"],
    summary: "Section 301 and 232 exclusion processing, forced-labor withhold-release orders, and entry-level enforcement actions.",
    cadence: "Updated as actions are issued"
  },
  {
    id: "bea",
    tier: 1,
    kind: "live-search",
    publisher: "U.S. Bureau of Economic Analysis",
    title: "U.S. direct investment position and balance of payments",
    url: "https://www.bea.gov/",
    domains: ["bea.gov"],
    summary: "US direct investment abroad and foreign direct investment in the US, by country and industry.",
    cadence: "Quarterly and annual, varies by series"
  },
  {
    id: "gao",
    tier: 1,
    kind: "live-search",
    publisher: "U.S. Government Accountability Office",
    title: "GAO reports on trade and aid programs",
    url: "https://www.gao.gov/",
    domains: ["gao.gov"],
    summary: "Independent, nonpartisan audits of federal trade enforcement, sanctions administration and aid programs.",
    cadence: "Event-driven"
  },
  {
    id: "world-bank-lpi",
    tier: 2,
    kind: "live-search",
    publisher: "World Bank",
    title: "Logistics Performance Index",
    url: "https://lpi.worldbank.org/",
    domains: ["lpi.worldbank.org"],
    summary: "Cross-country ranking of customs, infrastructure, shipping and timeliness performance.",
    cadence: "Published roughly every 2 years",
    caveats: "A survey-based index, not a hard trade flow figure — treat it as a comparative signal."
  },

  /* --------------------------------------------------------------- news, tier 4 */
  {
    id: "reuters",
    tier: 4,
    kind: "live-search",
    publisher: "Reuters",
    title: "Reuters wire reporting",
    url: "https://www.reuters.com/world/africa/",
    domains: ["reuters.com"],
    summary: "Wire-service reporting on breaking tariff, trade and policy developments, usually first to a story.",
    cadence: "Continuous"
  },
  {
    id: "bloomberg",
    tier: 4,
    kind: "live-search",
    publisher: "Bloomberg",
    title: "Bloomberg markets and policy coverage",
    url: "https://www.bloomberg.com/africa",
    domains: ["bloomberg.com"],
    summary: "Markets, commodity price and policy reporting with fast turnaround on trade actions.",
    cadence: "Continuous"
  },
  {
    id: "financial-times",
    tier: 4,
    kind: "live-search",
    publisher: "Financial Times",
    title: "Financial Times coverage",
    url: "https://www.ft.com/africa",
    domains: ["ft.com"],
    summary: "Business and policy reporting, strong on African markets and sovereign debt.",
    cadence: "Continuous"
  },
  {
    id: "semafor-africa",
    tier: 4,
    kind: "live-search",
    publisher: "Semafor",
    title: "Semafor Africa",
    url: "https://www.semafor.com/africa",
    domains: ["semafor.com"],
    summary: "Business and policy reporting focused specifically on African markets and trade.",
    cadence: "Continuous"
  },
  {
    id: "the-africa-report",
    tier: 4,
    kind: "live-search",
    publisher: "The Africa Report",
    title: "The Africa Report",
    url: "https://www.theafricareport.com/",
    domains: ["theafricareport.com"],
    summary: "Business, finance and policy journalism covering African economies sector by sector.",
    cadence: "Continuous"
  },

  /* ---------------------------------------------------------------- bundled */
  {
    id: "usitc-tariff-2026",
    tier: 1,
    kind: "bundled",
    publisher: "U.S. International Trade Commission",
    title: "USITC Tariff Database 2026",
    url: "https://dataweb.usitc.gov/tariff/annual",
    domains: ["usitc.gov", "dataweb.usitc.gov"],
    doi: null,
    summary:
      "Every 8-digit HTS line with its column 1 general (MFN) rate, column 1 " +
      "special rates for each preference program and free trade agreement, and " +
      "column 2 rate. Corridor queries it locally to compute duty and landed " +
      "cost without a model in the loop.",
    coverage: { rows: 12929, chapters: 98, agoaLines: 5398, gspLines: 5139 },
    temporal: { start: 2026, end: 2026 },
    cadence: "Annual, published each January",
    fields: ["hts8", "description", "mfn_rate", "special_rates", "col2_rate", "programs"],
    localPath: "data/tariffs-2026.json",
    caveats:
      "STATUTORY RATES ONLY. Section 301, Section 232 and IEEPA actions live in " +
      "HTS chapter 99, move by proclamation, and are NOT in this dataset. See " +
      "TRADE_ACTIONS for the overlay Corridor maintains separately. AGOA's " +
      "apparel benefit runs through chapter 98 provisions (9819.11) whose " +
      "qualification is a rules-of-origin determination that cannot be read " +
      "off a tariff line, so Corridor reports it as conditional rather than " +
      "applying it. Preference eligibility by country changes annually by " +
      "presidential proclamation.",
    ingested: "2026-08-28"
  }
];

/* --------------------------------------------------------------------------
   Scope.

   Corridor used to be organised around trade corridors, with US-Africa the
   only live one, and that scope narrowed every prompt. The bundled USITC
   schedule is US-import-side for every origin, so the arithmetic was always
   global and only the framing was not. A sourcing book spans a dozen
   countries; there is no lane to pick.

   The constant survives because stored projects carry it as a tag.
   -------------------------------------------------------------------------- */
const DEFAULT_CORRIDOR_ID = "us-import";


/* Domains the model should prefer when searching, drawn from the registry so
   the allowlist cannot fall out of step with what is registered. Pass a list
   of tiers to restrict it, so searchDomains([1, 2]) gives government and
   multilateral domains only, leaving news domains out of that recommendation. */
function searchDomains(tiers) {
  const out = [];
  for (const d of DATASETS) {
    if (d.kind !== "live-search" || !d.domains) continue;
    if (tiers && !tiers.includes(d.tier)) continue;
    for (const domain of d.domains) if (!out.includes(domain)) out.push(domain);
  }
  return out;
}

/* ==========================================================================
   TRADE. The reference tables the duty calculator resolves against.

   The USITC file tells us which programs apply to a tariff LINE. It does not
   tell us which programs a COUNTRY holds, and it identifies programs by
   Special Program Indicator letter rather than by name. These two tables
   close that gap.
   ========================================================================== */

/* The parenthetical letters in a line's column 1 special text, as in "Free
   (AU,BH,CL,CO,IL,JO,KR,MA,OM,P,PA,PE,S,SG)", are SPI codes rather than
   country codes. D is AGOA. A is GSP. S is USMCA. Mapping them back to the
   program columns in the dataset is what makes an origin resolvable. */
const SPI_CODES = {
  "A": "gsp", "A*": "gsp", "A+": "gsp",
  "D": "agoa",
  "E": "cbi", "E*": "cbi",
  "R": "cbtpa",
  "IL": "israel_fta",
  "S": "usmca", "S+": "usmca",
  "CA": "usmca", "MX": "usmca",
  "KR": "korea",
  "JP": "japan",
  "AU": "australia",
  "BH": "bahrain",
  "CL": "chile",
  "CO": "colombia",
  "P": "dr_cafta", "P+": "dr_cafta",
  "JO": "jordan",
  "MA": "morocco",
  "OM": "oman",
  "PA": "panama",
  "PE": "peru",
  "SG": "singapore"
};

/* Which preference programs each origin holds.

   AGOA eligibility is set annually by presidential proclamation and countries
   move on and off it. Ethiopia, Mali, Burkina Faso, Guinea and Niger have all
   been removed in recent years. `asOf` dates this table; the interpretation
   layer is told to verify current standing against USTR rather than trust it
   blindly.

   `ldc` marks an AGOA lesser-developed beneficiary, which unlocks the
   third-country fabric provision for apparel and separates a Kenyan apparel
   programme from a Mauritian one. */
const COUNTRY_PROGRAMS_ASOF = "2026-08-28";

const COUNTRY_PROGRAMS = {
  /* ---- AGOA beneficiaries (sub-Saharan Africa) ---- */
  AO: { name: "Angola",        programs: ["agoa", "gsp"], ldc: true },
  BJ: { name: "Benin",         programs: ["agoa", "gsp"], ldc: true },
  BW: { name: "Botswana",      programs: ["agoa", "gsp"] },
  CV: { name: "Cabo Verde",    programs: ["agoa", "gsp"] },
  TD: { name: "Chad",          programs: ["agoa", "gsp"], ldc: true },
  KM: { name: "Comoros",       programs: ["agoa", "gsp"], ldc: true },
  CG: { name: "Congo (Rep.)",  programs: ["agoa", "gsp"], ldc: true },
  CD: { name: "Congo (DRC)",   programs: ["agoa", "gsp"], ldc: true },
  CI: { name: "Côte d'Ivoire", programs: ["agoa", "gsp"], ldc: true },
  DJ: { name: "Djibouti",      programs: ["agoa", "gsp"], ldc: true },
  SZ: { name: "Eswatini",      programs: ["agoa", "gsp"], ldc: true },
  GM: { name: "Gambia",        programs: ["agoa", "gsp"], ldc: true },
  GH: { name: "Ghana",         programs: ["agoa", "gsp"], ldc: true },
  GW: { name: "Guinea-Bissau", programs: ["agoa", "gsp"], ldc: true },
  KE: { name: "Kenya",         programs: ["agoa", "gsp"], ldc: true },
  LS: { name: "Lesotho",       programs: ["agoa", "gsp"], ldc: true },
  LR: { name: "Liberia",       programs: ["agoa", "gsp"], ldc: true },
  MG: { name: "Madagascar",    programs: ["agoa", "gsp"], ldc: true },
  MW: { name: "Malawi",        programs: ["agoa", "gsp"], ldc: true },
  MR: { name: "Mauritania",    programs: ["agoa", "gsp"], ldc: true },
  MU: { name: "Mauritius",     programs: ["agoa", "gsp"] },
  MZ: { name: "Mozambique",    programs: ["agoa", "gsp"], ldc: true },
  NA: { name: "Namibia",       programs: ["agoa", "gsp"] },
  NG: { name: "Nigeria",       programs: ["agoa", "gsp"] },
  RW: { name: "Rwanda",        programs: ["agoa", "gsp"], ldc: true },
  ST: { name: "São Tomé",      programs: ["agoa", "gsp"], ldc: true },
  SN: { name: "Senegal",       programs: ["agoa", "gsp"], ldc: true },
  SC: { name: "Seychelles",    programs: ["agoa"] },
  SL: { name: "Sierra Leone",  programs: ["agoa", "gsp"], ldc: true },
  ZA: { name: "South Africa",  programs: ["agoa"] },
  TZ: { name: "Tanzania",      programs: ["agoa", "gsp"], ldc: true },
  TG: { name: "Togo",          programs: ["agoa", "gsp"], ldc: true },
  UG: { name: "Uganda",        programs: ["agoa", "gsp"], ldc: true },
  ZM: { name: "Zambia",        programs: ["agoa", "gsp"], ldc: true },

  /* ---- African states NOT currently AGOA-eligible ---- */
  ET: { name: "Ethiopia",      programs: [], note: "Removed from AGOA in 2022." },
  ML: { name: "Mali",          programs: [], note: "Removed from AGOA." },
  BF: { name: "Burkina Faso",  programs: [], note: "Removed from AGOA." },
  GN: { name: "Guinea",        programs: [], note: "Removed from AGOA." },
  NE: { name: "Niger",         programs: [], note: "Removed from AGOA." },
  CM: { name: "Cameroon",      programs: [], note: "Removed from AGOA in 2020." },
  ZW: { name: "Zimbabwe",      programs: [], note: "Not AGOA-eligible." },
  EG: { name: "Egypt",         programs: [], note: "Not AGOA (not sub-Saharan). QIZ arrangements may apply." },
  MA: { name: "Morocco",       programs: ["morocco"] },
  TN: { name: "Tunisia",       programs: [] },

  /* ---- FTA partners ---- */
  MX: { name: "Mexico",        programs: ["usmca"] },
  CA: { name: "Canada",        programs: ["usmca"] },
  KR: { name: "South Korea",   programs: ["korea"] },
  AU: { name: "Australia",     programs: ["australia"] },
  CL: { name: "Chile",         programs: ["chile"] },
  CO: { name: "Colombia",      programs: ["colombia"] },
  PE: { name: "Peru",          programs: ["peru"] },
  PA: { name: "Panama",        programs: ["panama"] },
  SG: { name: "Singapore",     programs: ["singapore"] },
  IL: { name: "Israel",        programs: ["israel_fta"] },
  JO: { name: "Jordan",        programs: ["jordan"] },
  OM: { name: "Oman",          programs: ["oman"] },
  BH: { name: "Bahrain",       programs: ["bahrain"] },
  JP: { name: "Japan",         programs: ["japan"] },
  DO: { name: "Dominican Rep.", programs: ["dr_cafta"] },
  GT: { name: "Guatemala",     programs: ["dr_cafta"] },
  HN: { name: "Honduras",      programs: ["dr_cafta"] },
  SV: { name: "El Salvador",   programs: ["dr_cafta"] },
  NI: { name: "Nicaragua",     programs: ["dr_cafta"] },
  CR: { name: "Costa Rica",    programs: ["dr_cafta"] },

  /* ---- Asia-Pacific: no US preference programme ---- */
  CN: { name: "China",         programs: [], actions: ["section301"] },
  VN: { name: "Vietnam",       programs: [] },
  TW: { name: "Taiwan",        programs: [] },
  MY: { name: "Malaysia",      programs: [] },
  IN: { name: "India",         programs: [], note: "Removed from GSP in 2019." },
  BD: { name: "Bangladesh",    programs: [], note: "GSP suspended since 2013." },
  KH: { name: "Cambodia",      programs: [] },
  ID: { name: "Indonesia",     programs: [] },
  PK: { name: "Pakistan",      programs: [] },
  TR: { name: "Turkey",        programs: [], note: "Removed from GSP in 2019." },
  TH: { name: "Thailand",      programs: [] },
  PH: { name: "Philippines",   programs: [] },
  LK: { name: "Sri Lanka",     programs: [] },
  MM: { name: "Myanmar",       programs: [] },

  /* ---- Europe ----
     Enumerated country by country because customs origin is country-level.
     There is no US-EU free trade agreement, so every one of these is plain
     MFN, and an "EU" aggregate would have been wrong to price against. */
  DE: { name: "Germany",       programs: [] },
  IT: { name: "Italy",         programs: [] },
  FR: { name: "France",        programs: [] },
  NL: { name: "Netherlands",   programs: [] },
  IE: { name: "Ireland",       programs: [] },
  ES: { name: "Spain",         programs: [] },
  BE: { name: "Belgium",       programs: [] },
  AT: { name: "Austria",       programs: [] },
  SE: { name: "Sweden",        programs: [] },
  PL: { name: "Poland",        programs: [] },
  CZ: { name: "Czechia",       programs: [] },
  DK: { name: "Denmark",       programs: [] },
  FI: { name: "Finland",       programs: [] },
  PT: { name: "Portugal",      programs: [] },
  HU: { name: "Hungary",       programs: [] },
  RO: { name: "Romania",       programs: [] },
  SK: { name: "Slovakia",      programs: [] },
  GB: { name: "United Kingdom", programs: [] },
  CH: { name: "Switzerland",   programs: [] },
  NO: { name: "Norway",        programs: [] },

  /* ---- Americas without a US agreement ---- */
  BR: { name: "Brazil",        programs: [] },
  AR: { name: "Argentina",     programs: [] },
  EC: { name: "Ecuador",       programs: [] },

  /* ---- Column 2: no normal trade relations ---- */
  CU: { name: "Cuba",          programs: [], col2: true },
  KP: { name: "North Korea",   programs: [], col2: true },
  RU: { name: "Russia",        programs: [], col2: true },
  BY: { name: "Belarus",       programs: [], col2: true }
};

/* Trade actions the USITC annual file does not carry, because they live in
   HTS chapter 99 and change by proclamation. This overlay is deliberately
   small and deliberately dated: Corridor models the statutory layer exactly
   and names this layer as unmodelled rather than guessing at it.

   Each entry is a flag, not a rate. The calculator surfaces it as a warning
   on the affected origin and the interpretation layer is asked to verify it
   live and cite the proclamation. */
const TRADE_ACTIONS = [
  {
    id: "section301",
    name: "Section 301 — China",
    origins: ["CN"],
    summary:
      "Additional duties on most goods of Chinese origin across four tranches, " +
      "with exclusions granted and expiring on a rolling basis.",
    asOf: "2026-08-28",
    url: "https://ustr.gov/issue-areas/enforcement/section-301-investigations",
    modelled: false
  },
  {
    id: "section232-steel",
    name: "Section 232 — steel",
    chapters: ["72", "73"],
    summary: "Additional duties on steel and derivative steel articles from most origins.",
    asOf: "2026-08-28",
    url: "https://www.bis.doc.gov/index.php/232-steel",
    modelled: false
  },
  {
    id: "section232-aluminium",
    name: "Section 232 — aluminium",
    chapters: ["76"],
    summary: "Additional duties on aluminium and derivative aluminium articles from most origins.",
    asOf: "2026-08-28",
    url: "https://www.bis.doc.gov/index.php/232-aluminum",
    modelled: false
  }
];

/* US entry fees. Both are statutory ad valorem charges collected at entry,
   and both are what turn a duty rate into a landed cost.
   HMF is charged on ocean entries only, so air and land are exempt. */
const ENTRY_FEES = {
  hmf: { rate: 0.00125, modes: ["ocean"], name: "Harbor Maintenance Fee" },
  mpf: { rate: 0.003464, min: 32.71, max: 634.62, name: "Merchandise Processing Fee" }
};

const TRANSPORT_MODES = [
  { id: "ocean", name: "Ocean", hmf: true },
  { id: "air",   name: "Air",   hmf: false },
  { id: "truck", name: "Truck", hmf: false },
  { id: "rail",  name: "Rail",  hmf: false }
];

function countryName(code) {
  return (COUNTRY_PROGRAMS[code] || {}).name || code;
}

function tradeActionsFor(code, hts) {
  return TRADE_ACTIONS.filter(a => {
    if (a.origins && a.origins.includes(code)) return true;
    if (a.chapters && hts && a.chapters.includes(String(hts).slice(0, 2))) return true;
    return false;
  });
}

/* ==========================================================================
   ASSESSMENTS. The five modules a project runs to reach a decision.

   Each is an ask with a fixed prompt and a persisted result. They run through
   the same API path and the same section renderers as any other answer, so
   nothing here needs its own rendering code. What each module adds is a
   VERDICT line and a SCORE band, which is what the decision readout is
   computed from.
   ========================================================================== */

const ASSESSMENT_BANDS = {
  favorable:           { label: "Favourable",        rank: 0 },
  mixed:               { label: "Mixed",             rank: 1 },
  adverse:             { label: "Adverse",           rank: 2 },
  "insufficient-data": { label: "Insufficient data", rank: 3 }
};

const ASSESSMENT_MODULES = [
  {
    id: "market",
    name: "Market assessment",
    blurb: "Size, growth, demand drivers, competitive set and entry barriers.",
    focus:
      "Size the addressable market for this project, establish its growth rate " +
      "and direction, name the demand drivers, identify who already serves it, " +
      "and state the barriers to entry. Quantify wherever the data allows: a " +
      "market assessment without figures is not an assessment."
  },
  {
    id: "risk",
    name: "Risk assessment",
    blurb: "Political, regulatory, FX and macro, counterparty, operational.",
    focus:
      "Work through political, regulatory, currency and macroeconomic, " +
      "counterparty, and operational risk in turn. For each, state the exposure " +
      "in this project's own terms, how likely it is, and what it would cost. " +
      "Use the TABLE section for a risk register with one row per risk, columns " +
      "Risk / Exposure / Likelihood / Impact / Mitigation."
  },
  {
    id: "trade",
    name: "Trade & tariff exposure",
    blurb: "Duty exposure, preference programmes, rules of origin, trade actions.",
    focus:
      "Establish the duty and trade-policy exposure of this project. Where a " +
      "computed trade model is supplied, build on its arithmetic rather than " +
      "restating it, and explain what the numbers mean for the decision. Cover " +
      "preference programme eligibility and how durable it is, rules of origin " +
      "that gate it, and any trade action that is not modelled.",
    usesTradeModel: true
  },
  {
    id: "gtm",
    name: "Go-to-market",
    blurb: "Route to market, channel, partners, pricing posture, sequencing.",
    focus:
      "Set out how this project reaches its market: the route in, the channel " +
      "structure, the partner archetypes worth pursuing and how to qualify them, " +
      "the pricing posture the competitive set allows, and the sequence of moves " +
      "with what each one costs and unlocks."
  },
  {
    id: "industry",
    name: "Industry risk",
    blurb: "The exposures specific to this project's own industry.",
    dynamic: true,
    focus:
      "Cover the risks and requirements that are specific to this industry and " +
      "would not appear in a generic assessment: its regulators, its " +
      "certification and standards regime, its input and offtake structure, its " +
      "cycle, and the failure modes that recur in it."
  }
];

function assessmentModuleById(id) {
  return ASSESSMENT_MODULES.find(m => m.id === id) || null;
}

/* The decision band is computed from the module bands rather than written,
   so the headline cannot contradict the cards underneath it. One adverse
   module caps the project at a conditional go. Two or more modules short of
   data means there is not enough to decide on. */
const DECISION_BANDS = {
  go:                  { label: "Go",                tone: "favorable" },
  conditional:         { label: "Conditional go",    tone: "mixed" },
  "no-go":             { label: "No-go",             tone: "adverse" },
  "insufficient-data": { label: "Insufficient data", tone: "neutral" }
};

function computeDecisionBand(bands) {
  const present = bands.filter(Boolean);
  if (!present.length) return null;

  const gaps = present.filter(b => b === "insufficient-data").length;
  if (gaps >= 2) return "insufficient-data";

  const adverse = present.filter(b => b === "adverse").length;
  if (adverse >= 3) return "no-go";
  if (adverse >= 1) return "conditional";

  const mixed = present.filter(b => b === "mixed").length;
  if (mixed >= 2) return "conditional";
  if (gaps || mixed) return "conditional";

  return "go";
}

/* ==================== mcs.js ==================== */
/* ==========================================================================
   CORRIDOR — USGS Mineral Commodity Summaries 2026, queried locally

   This is what makes provenance real rather than a prompt hint. When a
   question touches a commodity we ship, the matching rows are handed to the
   model as authoritative Tier 1 data, so the figure in the answer is the
   figure in the USGS table — not whatever a search happened to surface.
   ========================================================================== */

const MCS = {
  rows: null,
  index: null,
  loading: null,
  failed: false
};

/* Load the index first — it is 27 KB against 2.4 MB for the full table, so a
   question that touches no shipped commodity never pays for the big file. */
async function loadMcsIndex() {
  if (MCS.index) return MCS.index;
  if (MCS.failed) return null;
  try {
    const resp = await fetch("/data/mcs2026-index.json");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    MCS.index = await resp.json();
    return MCS.index;
  } catch (err) {
    console.warn("MCS index unavailable:", err);
    MCS.failed = true;
    return null;
  }
}

async function loadMcs() {
  if (MCS.rows) return MCS.rows;
  if (MCS.loading) return MCS.loading;
  MCS.loading = (async () => {
    try {
      const resp = await fetch("/data/mcs2026.json");
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      MCS.rows = await resp.json();
      return MCS.rows;
    } catch (err) {
      console.warn("MCS data unavailable:", err);
      MCS.failed = true;
      return null;
    }
  })();
  return MCS.loading;
}

/* --------------------------------------------------------------------------
   Matching
   -------------------------------------------------------------------------- */

/* Words that look like commodities but would drag in noise, and words too
   short or generic to match on safely. */
const STOPWORDS = new Set([
  "the", "and", "for", "from", "with", "what", "which", "how", "why", "does",
  "did", "are", "was", "were", "has", "have", "into", "that", "this", "than",
  "much", "many", "most", "share", "trade", "us", "u.s.", "usa", "united",
  "states", "africa", "african", "import", "imports", "export", "exports",
  "tariff", "tariffs", "data", "year", "years", "value", "total"
]);

function normalize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* A commodity matches if its name (or a significant word of it) appears in the
   question. Multi-word names must match as a phrase; single words must match on
   a word boundary so "tin" does not fire on "continent". */
function matchCommodities(question, index) {
  const q = normalize(question);
  const hits = [];

  for (const name of Object.keys(index.commodities)) {
    const norm = normalize(name);
    if (!norm) continue;

    // Strip the parenthetical qualifier: "Diamond (Industrial)" -> "diamond"
    const base = norm.replace(/\s*\(.*?\)\s*/g, " ").trim();
    const candidates = new Set([norm, base]);

    let matched = false;
    for (const cand of candidates) {
      if (!cand || cand.length < 3) continue;
      if (cand.includes(" ")) {
        if (q.includes(cand)) { matched = true; break; }
      } else {
        if (STOPWORDS.has(cand)) continue;
        if (new RegExp(`\\b${cand}s?\\b`).test(q)) { matched = true; break; }
      }
    }
    if (matched) hits.push(name);
  }
  return hits;
}

function matchCountries(question, index) {
  const q = normalize(question);
  const hits = [];

  for (const name of index.countries) {
    const norm = normalize(name);
    if (!norm) continue;

    // "Congo (Kinshasa)" should match "Congo", "DRC" and "Kinshasa"
    const base = norm.replace(/\s*\(.*?\)\s*/g, " ").trim();
    const inner = (norm.match(/\((.*?)\)/) || [])[1];

    const candidates = [norm, base, inner].filter(Boolean);
    if (/congo \(kinshasa\)/.test(norm)) candidates.push("drc", "dr congo", "democratic republic of the congo");
    if (/^south africa$/.test(norm)) candidates.push("rsa");

    for (const cand of candidates) {
      if (cand.length < 3) continue;
      if (new RegExp(`\\b${cand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(q)) {
        hits.push(name);
        break;
      }
    }
  }
  return hits;
}

/* --------------------------------------------------------------------------
   Query
   -------------------------------------------------------------------------- */
function queryMcs(rows, { commodities, countries, years } = {}) {
  return rows.filter(r => {
    if (commodities && commodities.length && !commodities.includes(r.c)) return false;
    if (countries && countries.length && !countries.includes(r.n)) return false;
    if (years && years.length && !years.includes(r.y)) return false;
    return true;
  });
}

/* Newest years first, reserves and production before minor statistics, so the
   cap keeps the rows that actually answer questions. */
const STAT_PRIORITY = [
  "Production", "Reserves", "Import", "Imports", "Export", "Exports",
  "Net import reliance", "Consumption", "Shipment", "Price"
];

function rankRow(r) {
  const statRank = STAT_PRIORITY.findIndex(
    s => (r.s || "").toLowerCase() === s.toLowerCase()
  );
  return {
    stat: statRank === -1 ? STAT_PRIORITY.length : statRank,
    year: r.y || 0
  };
}

const MAX_ROWS = 60;

/* --------------------------------------------------------------------------
   The public entry point: given a question, return a compact block of rows to
   hand the model, or null when the question touches nothing we ship.
   -------------------------------------------------------------------------- */
async function mcsContextFor(question) {
  const index = await loadMcsIndex();
  if (!index) return null;

  const commodities = matchCommodities(question, index);
  if (!commodities.length) return null;

  const countries = matchCountries(question, index);

  const rows = await loadMcs();
  if (!rows) return null;

  let matched = queryMcs(rows, { commodities, countries });

  // A commodity hit with no country hit is still useful — but only for the
  // headline producers, or the table is unreadable.
  if (!countries.length) {
    matched = matched.filter(r => ["Production", "Reserves"].includes(r.s));
  }

  if (!matched.length) return null;

  matched.sort((a, b) => {
    const ra = rankRow(a);
    const rb = rankRow(b);
    if (ra.stat !== rb.stat) return ra.stat - rb.stat;
    if (rb.year !== ra.year) return rb.year - ra.year;
    return (a.n || "").localeCompare(b.n || "");
  });

  const truncated = matched.length > MAX_ROWS;
  const shown = matched.slice(0, MAX_ROWS);

  const header = ["Commodity", "Country", "Statistic", "Detail", "Year", "Value", "Unit", "Flag"];
  const lines = shown.map(r => [
    r.c,
    r.n,
    r.s,
    r.d || "",
    r.y == null ? "" : r.y,
    r.v == null ? "" : r.v,
    r.u || "",
    r.f || ""
  ].join("\t"));

  return {
    commodities,
    countries,
    rowCount: matched.length,
    shownCount: shown.length,
    truncated,
    critical: commodities.filter(c => index.commodities[c] && index.commodities[c].crit),
    table: [header.join("\t"), ...lines].join("\n")
  };
}

/* Render the context block that gets appended to the user turn. */
function mcsPromptBlock(ctx) {
  if (!ctx) return "";
  const notes = [
    `Commodities matched: ${ctx.commodities.join(", ")}`,
    ctx.countries.length ? `Countries matched: ${ctx.countries.join(", ")}` : null,
    ctx.critical.length ? `Designated 2025 critical minerals: ${ctx.critical.join(", ")}` : null,
    ctx.truncated
      ? `Showing ${ctx.shownCount} of ${ctx.rowCount} matching rows, ranked by statistic and recency.`
      : `${ctx.rowCount} matching rows.`
  ].filter(Boolean);

  return [
    "",
    "<bundled_data source=\"USGS Mineral Commodity Summaries 2026\" tier=\"1\">",
    "These rows are shipped with Corridor and read directly from the USGS",
    "Mineral Commodity Summaries 2026 dataset. They are authoritative: quote them",
    "directly, do NOT search the web to confirm them, and cite them as",
    "[T1] U.S. Geological Survey — Mineral Commodity Summaries 2026 with the",
    "row's own year. Flags: E = estimate, > or < = bound, W = withheld,",
    "NA = not available. Values are rounded by USGS to protect proprietary data.",
    "",
    notes.join("\n"),
    "",
    ctx.table,
    "</bundled_data>",
    ""
  ].join("\n");
}

/* ==================== tariffs.js ==================== */
/* ==========================================================================
   CORRIDOR — USITC tariff database, queried locally

   Nothing in this file needs a model. A duty rate is a lookup and a landed
   cost is arithmetic, so both are instant and give the same answer every time.
   The model sees the finished numbers afterwards and writes the interpretation.

   Modelled exactly: column 1 general (MFN), column 1 special for preference
   programmes and free trade agreements, column 2, ad valorem rates, specific
   rates, compound rates, HMF and MPF.

   Not modelled: Section 301, Section 232 and IEEPA actions. Those live in HTS
   chapter 99 and move by proclamation, so they are absent from the annual
   file. TRADE_ACTIONS carries what we know about them, and every figure the
   calculator shows is labelled as statutory.
   ========================================================================== */

const TARIFFS = {
  rows: null,
  index: null,
  byCode: null,
  loading: null,
  failed: false
};

/* The index is 11 KB against 4.15 MB for the table, so the app can show the
   data's vintage and scope without paying for the rows until the trade model
   is actually opened. */
async function loadTariffIndex() {
  if (TARIFFS.index) return TARIFFS.index;
  if (TARIFFS.failed) return null;
  try {
    const resp = await fetch("/data/tariffs-index.json");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    TARIFFS.index = await resp.json();
    return TARIFFS.index;
  } catch (err) {
    console.warn("Tariff index unavailable:", err);
    return null;
  }
}

async function loadTariffs() {
  if (TARIFFS.rows) return TARIFFS.rows;
  if (TARIFFS.loading) return TARIFFS.loading;
  TARIFFS.loading = (async () => {
    try {
      const index = await loadTariffIndex();
      const path = (index && index.dataPath) || "/data/tariffs-2026.json";
      const resp = await fetch(path);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      TARIFFS.rows = await resp.json();
      TARIFFS.byCode = new Map(TARIFFS.rows.map(r => [r.h, r]));

      /* A sanity check on the bundled data, which I did not have when a
         999,999% sentinel rate reached a duty bill and made it read $8.9bn.
         Tobacco at 350% is the genuine ceiling in this schedule, so anything
         far above that means the file is stale or the build is wrong. */
      const impossible = TARIFFS.rows.filter(r => (r.a || 0) > 20);
      if (impossible.length) {
        TARIFFS.stale = true;
        console.error(
          `Tariff data looks wrong: ${impossible.length} lines carry an ad valorem ` +
          `rate above 2000%. The highest real rate in the schedule is 350% on tobacco. ` +
          `This build is stale or broken; rebuild with tools/build_tariffs.py.`,
          impossible.slice(0, 3)
        );
      }
      return TARIFFS.rows;
    } catch (err) {
      console.warn("Tariff data unavailable:", err);
      TARIFFS.failed = true;
      return null;
    }
  })();
  return TARIFFS.loading;
}

function tariffsReady() {
  return !!TARIFFS.rows;
}

function htsByCode(code) {
  if (!TARIFFS.byCode) return null;
  return TARIFFS.byCode.get(String(code).replace(/\D/g, "")) || null;
}

/* --------------------------------------------------------------------------
   Search — 12,929 rows, ranked locally, no network
   -------------------------------------------------------------------------- */

/* Ranked so that typing a code finds the code and typing a word finds the
   word at the start of a term before finding it buried mid-description. */
function searchHts(query, limit = 25) {
  const rows = TARIFFS.rows;
  if (!rows) return [];

  const raw = (query || "").trim();
  if (raw.length < 2) return [];

  const digits = raw.replace(/\D/g, "");
  const q = raw.toLowerCase();
  const hits = [];

  for (const r of rows) {
    let score = -1;

    if (digits.length >= 4) {
      if (r.h === digits) score = 0;
      else if (r.h.startsWith(digits)) score = 1;
    }

    if (score === -1) {
      const d = r.d.toLowerCase();
      const at = d.indexOf(q);
      if (at === 0) score = 2;
      else if (at > 0) score = /\b/.test(d[at - 1] || "") && !/[a-z0-9]/.test(d[at - 1] || "") ? 3 : 4;
    }

    if (score >= 0) hits.push({ row: r, score });
    if (hits.length > 4000) break;
  }

  hits.sort((a, b) => (a.score - b.score) || a.row.h.localeCompare(b.row.h));
  return hits.slice(0, limit).map(h => h.row);
}

/* --------------------------------------------------------------------------
   Rate resolution — which column applies to this line from this origin
   -------------------------------------------------------------------------- */

/* Goods qualifying under these free trade agreements are exempt from the
   merchandise processing fee. Goods under preference programmes still pay it,
   so AGOA, GSP and CBI entries carry MPF. The breakdown shows the fee as its
   own line so a wrong call here is easy to spot. */
const MPF_EXEMPT_PROGRAMS = new Set([
  "usmca", "australia", "bahrain", "chile", "colombia", "israel_fta",
  "jordan", "korea", "morocco", "oman", "panama", "peru", "singapore",
  "dr_cafta"
]);

const PROGRAM_LABELS = {
  gsp: "GSP", agoa: "AGOA", cbi: "CBI/CBERA", cbtpa: "CBTPA",
  israel_fta: "US–Israel FTA", usmca: "USMCA", korea: "KORUS",
  japan: "US–Japan", australia: "US–Australia FTA", bahrain: "US–Bahrain FTA",
  chile: "US–Chile FTA", colombia: "US–Colombia TPA", dr_cafta: "DR-CAFTA",
  jordan: "US–Jordan FTA", morocco: "US–Morocco FTA", oman: "US–Oman FTA",
  panama: "US–Panama TPA", peru: "US–Peru TPA", singapore: "US–Singapore FTA"
};

const APPAREL_CHAPTERS = new Set(["61", "62"]);

/* What has to be true for a claimed rate to hold at entry. Every preference
   is an assertion the importer makes and has to document. A sourcing model
   that shows the preferential rate without its condition will overstate the
   saving. */
const PROGRAM_CONDITIONS = {
  gsp:
    "Requires GSP beneficiary status at entry, at least 35% of value added in " +
    "the beneficiary country, and direct shipment to the US.",
  agoa:
    "Requires AGOA beneficiary status at entry and at least 35% value added in " +
    "one or more AGOA countries. Eligibility is set annually by presidential " +
    "proclamation and countries have been removed at short notice.",
  cbi:
    "Requires CBERA beneficiary status and 35% value added in the beneficiary country.",
  cbtpa:
    "Requires CBTPA beneficiary status and the applicable fabric and assembly rules."
};

const FTA_CONDITION =
  "Requires the goods to originate under the agreement's rules of origin and a " +
  "valid certification of origin held by the importer. Tariff-shift and " +
  "regional-value-content tests apply by product.";

function programCondition(program) {
  return PROGRAM_CONDITIONS[program] || FTA_CONDITION;
}

/* `claimPreferences` mirrors the Import Programs field on a real duty
   calculator. Off, you get what an entry pays having claimed nothing, which is
   the conservative number and reconciles with other calculators. On, you get
   what the lane achieves if the origin qualifies, which is the number a
   sourcing decision turns on. The condition travels with the rate either way.

   Two shapes come back. `condition` is what must hold for the rate we applied.
   `opportunity` is a better rate that exists and we left unapplied. */
function resolveRate(line, originCode, { claimPreferences = true } = {}) {
  const country = COUNTRY_PROGRAMS[originCode] || { name: originCode, programs: [] };
  const chapter = line.h.slice(0, 2);
  const mfnRate = line.a || 0;

  if (country.col2) {
    return {
      basis: "col2",
      label: "Column 2 (no normal trade relations)",
      rate: parseRateText(line.c2, line),
      rateText: line.c2 || "—",
      program: null,
      mpfExempt: false,
      condition: null,
      opportunity: null,
      note: `${country.name} does not hold normal trade relations status. Column 2 rates apply.`
    };
  }

  const lineProgs = line.p || {};
  const held = country.programs || [];

  // Best programme rate among those this origin actually holds.
  let best = null;
  for (const p of held) {
    if (!(p in lineProgs)) continue;
    const rate = lineProgs[p];
    if (!best || rate < best.rate) best = { program: p, rate };
  }
  const beatsMfn = best && best.rate < mfnRate;

  // AGOA's apparel benefit is absent from the ordinary chapter 61/62 line. It
  // runs through chapter 98 (9819.11.xx), and qualifying there is a
  // rules-of-origin determination: yarn forward, or the third-country fabric
  // exception open to lesser-developed beneficiaries. A tariff line cannot
  // tell us which applies, so this comes back as an opportunity and the
  // ordinary rate stands.
  let agoaApparel = null;
  if (held.includes("agoa") && APPAREL_CHAPTERS.has(chapter) && !("agoa" in lineProgs) && mfnRate > 0) {
    agoaApparel = {
      program: "agoa",
      label: "AGOA apparel (9819.11)",
      potentialRate: 0,
      requirement: country.ldc
        ? `May enter duty-free under an AGOA apparel provision. As a lesser-developed beneficiary, ${country.name} ` +
          "can use the third-country fabric exception, so fabric origin is less restrictive. The assembly " +
          "and documentation requirements still have to be met."
        : "May enter duty-free under an AGOA apparel provision, but only on yarn-forward terms: yarn and fabric " +
          `must originate in the US or an AGOA beneficiary. ${country.name} is not a lesser-developed beneficiary, ` +
          "so the third-country fabric exception is not available.",
      savingRate: mfnRate
    };
  }

  if (claimPreferences && beatsMfn) {
    const label = PROGRAM_LABELS[best.program] || best.program;
    return {
      basis: "special",
      label,
      rate: best.rate,
      rateText: best.rate === 0 ? "Free" : formatPercent(best.rate),
      program: best.program,
      mpfExempt: MPF_EXEMPT_PROGRAMS.has(best.program),
      condition: { label, requirement: programCondition(best.program) },
      opportunity: null,
      note: best.rate === 0
        ? `Duty-free under ${label} if the goods qualify.`
        : `Reduced rate under ${label} if the goods qualify.`
    };
  }

  // Falling through to MFN, because nothing applies or nothing is being
  // claimed. If a preference was available, say what was left on the table.
  const opportunity = agoaApparel || (beatsMfn ? {
    program: best.program,
    label: PROGRAM_LABELS[best.program] || best.program,
    potentialRate: best.rate,
    requirement: programCondition(best.program),
    savingRate: mfnRate - best.rate
  } : null);

  return {
    basis: "mfn",
    label: "MFN (column 1 general)",
    rate: mfnRate,
    rateText: line.m || "—",
    program: null,
    mpfExempt: false,
    condition: null,
    opportunity,
    note: !claimPreferences && beatsMfn
      ? "No preference claimed. A preferential rate is available on this line."
      : null
  };
}

function formatPercent(rate) {
  const pct = rate * 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2).replace(/\.?0+$/, "")}%`;
}

/* Column 2 text is free-form ("13.2 cents/liter", "90%"). Pull an ad valorem
   rate out where there is one; otherwise fall back to the line's own. */
function parseRateText(text, line) {
  const m = /([\d.]+)\s*%/.exec(text || "");
  if (m) return parseFloat(m[1]) / 100;
  return line && line.a ? line.a : 0;
}

/* --------------------------------------------------------------------------
   The arithmetic
   -------------------------------------------------------------------------- */

/* Verified against Flexport's published output: HTS 6109.90.10.07 from Jordan,
   $10,000, ocean: 32%, $3,200 duty, $13 HMF, $35 MPF, $13,248 landed. Each
   line item rounds to whole dollars and the total sums the rounded items,
   which is how the figures read on an entry summary. */
function computeDuty({ line, originCode, value, quantity, mode, claimPreferences = true }) {
  const v = Number(value) || 0;

  /* 745 lines carry a rate the schedule does not express as a number: sugar on
     a sliding scale, ensembles dutied garment by garment, sets dutied at their
     highest article. USITC marks these 9999.999999. There is no honest figure
     to return, so none is returned. */
  if (line.nc) {
    return {
      hts: line.h, description: line.d,
      origin: originCode, originName: countryName(originCode),
      value: v, quantity: Number(quantity) || 0, mode,
      notComputable: true,
      notComputableWhy: line.ncWhy || "The schedule does not express this line's rate as a single number.",
      resolved: { basis: "not-computable", label: "Cannot be computed", rate: 0,
                  rateText: line.m || "see schedule", program: null,
                  mpfExempt: false, condition: null, opportunity: null, note: null },
      adValoremDuty: 0, specificDuty: 0, duty: 0, effectiveRate: 0,
      hmf: 0, mpf: 0, mpfExempt: false, landed: v,
      hasSpecific: false, specificUnit: "", needsQuantity: false, compound: false,
      actions: tradeActionsFor(originCode, line.h)
    };
  }

  const resolved = resolveRate(line, originCode, { claimPreferences });
  const qty = Number(quantity) || 0;

  const hasSpecific = !!line.s;
  const needsQuantity = hasSpecific && resolved.rate > 0 && !qty;

  // A programme rate of Free removes both legs of a compound duty.
  const dutyFree = resolved.basis === "special" && resolved.rate === 0;

  const adValoremDuty = dutyFree ? 0 : v * resolved.rate;
  const specificDuty = dutyFree || !hasSpecific ? 0 : qty * line.s;

  const mpfExempt = resolved.mpfExempt;
  const modeSpec = TRANSPORT_MODES.find(m => m.id === mode) || TRANSPORT_MODES[0];

  const hmf = modeSpec.hmf ? v * ENTRY_FEES.hmf.rate : 0;
  const mpfRaw = v * ENTRY_FEES.mpf.rate;
  const mpf = mpfExempt
    ? 0
    : Math.min(Math.max(mpfRaw, ENTRY_FEES.mpf.min), ENTRY_FEES.mpf.max);

  const r = Math.round;
  const duty = r(adValoremDuty) + r(specificDuty);
  const landed = r(v) + duty + r(hmf) + r(mpf);

  // Effective rate against value, so compound and specific lines stay
  // comparable with ad valorem ones in the origin table.
  const effectiveRate = v > 0 ? duty / v : 0;

  return {
    hts: line.h,
    description: line.d,
    origin: originCode,
    originName: countryName(originCode),
    value: v,
    quantity: qty,
    mode: modeSpec.id,
    resolved,
    hasSpecific,
    specificUnit: line.u || "",
    needsQuantity,
    compound: !!line.cmp,
    adValoremDuty: r(adValoremDuty),
    specificDuty: r(specificDuty),
    duty,
    effectiveRate,
    hmf: r(hmf),
    mpf: r(mpf),
    mpfExempt,
    landed,
    actions: tradeActionsFor(originCode, line.h)
  };
}

/* The corridor question is never "what is the duty from here" but "what is it
   from each of these, and what is the gap". Ranked cheapest first, with the
   delta measured against the best landed cost on the board. */
function compareOrigins({ line, origins, value, quantity, mode, claimPreferences = true }) {
  const results = origins.map(code =>
    computeDuty({ line, originCode: code, value, quantity, mode, claimPreferences })
  );
  results.sort((a, b) => a.landed - b.landed);
  const best = results[0];
  for (const r of results) {
    r.delta = r.landed - best.landed;
    r.isBest = r === best;
  }
  return results;
}

/* --------------------------------------------------------------------------
   Handing the result to the model
   -------------------------------------------------------------------------- */

function money(n) {
  return "$" + Math.round(n).toLocaleString("en-US");
}

/* Mirrors mcsPromptBlock: the arithmetic is authoritative and must not be
   recomputed, restated line by line, or "checked". The model's job is the
   interpretation, and the caveats are handed over with the numbers so the
   interpretation cannot quietly overclaim. */
function tariffPromptBlock(model) {
  if (!model || !model.results || !model.results.length) return "";

  const index = TARIFFS.index || {};
  const head = ["Origin", "Basis", "Rate", "Duty", "MPF", "HMF", "Landed", "Delta vs best"];
  const lines = model.results.map(r => [
    r.originName,
    r.resolved.label,
    r.resolved.rateText,
    money(r.duty),
    r.mpfExempt ? "exempt" : money(r.mpf),
    money(r.hmf),
    money(r.landed),
    r.isBest ? "best" : "+" + money(r.delta)
  ].join("\t"));

  const conditions = model.results
    .filter(r => r.resolved.condition)
    .map(r => `${r.originName}: rate claimed under ${r.resolved.condition.label}. ${r.resolved.condition.requirement}`);

  const opportunities = model.results
    .filter(r => r.resolved.opportunity)
    .map(r => `${r.originName}: ${r.resolved.opportunity.label} is available and is NOT applied above. ${r.resolved.opportunity.requirement}`);

  const actions = [];
  for (const r of model.results) {
    for (const a of r.actions || []) {
      const note = `${r.originName}: ${a.name} may apply and is NOT included in the figures above. ${a.summary}`;
      if (!actions.includes(note)) actions.push(note);
    }
  }

  const notes = [
    `HTS ${model.hts}: ${model.description}`,
    `Shipment value ${money(model.value)}, mode ${model.mode}.`,
    model.quantity ? `Quantity ${model.quantity} ${model.specificUnit || "units"}.` : null,
    model.claimPreferences
      ? "Preferential rates ARE claimed where the origin holds a qualifying programme."
      : "No preference claimed: every origin is priced at its MFN rate.",
    `Statutory rates from ${index.source || "the USITC tariff database"}, as of ${index.generated || "the bundled build"}.`
  ].filter(Boolean);

  return [
    "",
    `<computed_model source="${index.source || "USITC Tariff Database"}" tier="1">`,
    "Corridor computed the figures below locally from the bundled USITC tariff",
    "database. The arithmetic is authoritative and already correct: quote these",
    "numbers, do not recompute them, do not search to verify them, and do not",
    "reproduce the table row by row. Your job is to say what they mean for the",
    "decision in play.",
    "",
    notes.join("\n"),
    "",
    [head.join("\t"), ...lines].join("\n"),
    "",
    conditions.length
      ? "CONDITIONS ON THE RATES ABOVE. No preference is automatic. State these\n" +
        "as conditions of the saving, not footnotes:\n" + conditions.join("\n")
      : "",
    opportunities.length
      ? "PREFERENCES AVAILABLE BUT NOT APPLIED. These could change the ranking:\n" +
        opportunities.join("\n")
      : "",
    actions.length
      ? "UNMODELLED TRADE ACTIONS. Flag these explicitly and verify them with a\n" +
        "web search, citing the proclamation or USTR notice:\n" + actions.join("\n")
      : "",
    "",
    "These are STATUTORY rates only. Section 301, Section 232 and IEEPA duties",
    "live in HTS chapter 99 and are not in this dataset. Say so plainly rather",
    "than implying the landed costs above are final.",
    "</computed_model>",
    ""
  ].filter(s => s !== "").join("\n");
}

/* ==================== map.js ==================== */
/* ==========================================================================
   CORRIDOR — the map

   Inline SVG, drawn from bundled data. No tiles, no network call, no map
   library. It prints into a report as vector, and it can be styled with the
   same tokens as everything else in the app.

   Equirectangular projection. It distorts area badly at high latitudes, which
   would matter for a thematic map and does not matter here: this map shows
   where lanes run and which chokepoints they pass, and the arithmetic that
   matters lives in the tariff schedule rather than in the geometry.
   ========================================================================== */

const GEO = { world: null, chokepoints: null, loading: null, failed: false };

async function loadGeo() {
  if (GEO.world) return GEO;
  if (GEO.loading) return GEO.loading;
  GEO.loading = (async () => {
    try {
      const [world, cp] = await Promise.all([
        fetch("/data/world.json").then(r => r.json()),
        fetch("/data/chokepoints.json").then(r => r.json())
      ]);
      GEO.world = world;
      GEO.chokepoints = cp;
      GEO.byId = new Map((cp.chokepoints || []).map(c => [c.id, c]));
      return GEO;
    } catch (err) {
      console.warn("Map data unavailable:", err);
      GEO.failed = true;
      return GEO;
    }
  })();
  return GEO.loading;
}

function chokepointById(id) {
  return (GEO.byId && GEO.byId.get(id)) || null;
}

/* --------------------------------------------------------------------------
   Projection

   The world is drawn on a fixed 360 x 180 viewBox so every coordinate is
   simply longitude and latitude. Scaling is left to CSS, which keeps the
   geometry honest and the SVG resolution independent.

   Antarctica is cropped. It carries a third of the world's rings, no lane
   goes near it, and dropping it lets the rest of the map be drawn larger.
   -------------------------------------------------------------------------- */

const MAP_VIEW = { x: -180, y: -83, w: 360, h: 145 };

function project(lon, lat) {
  return [lon, -lat];
}

function ringPath(ring) {
  let d = "";
  for (let i = 0; i < ring.length; i++) {
    const [x, y] = project(ring[i][0], ring[i][1]);
    d += (i ? "L" : "M") + x.toFixed(2) + " " + y.toFixed(2);
  }
  return d + "Z";
}

/* --------------------------------------------------------------------------
   Lanes

   A lane is drawn as a chain of arcs: origin port, each chokepoint it
   transits in order, then the destination. Bending each segment rather than
   drawing straight lines is what makes a route read as a route.

   The bow is perpendicular to the segment and scaled to its length, so short
   hops stay nearly straight and an ocean crossing curves.
   -------------------------------------------------------------------------- */

/* A segment whose longitudes differ by more than 180 degrees is shorter the
   other way round, across the date line. On a flat map that has to be drawn as
   two pieces, one leaving the right edge and one entering from the left.
   Without this a Shanghai to Long Beach lane tracks backwards over Eurasia and
   the Atlantic, which is both wrong and the opposite of the real route. */
function splitAntimeridian(from, to) {
  const dlon = to.lon - from.lon;
  if (Math.abs(dlon) <= 180) return [[from, to]];

  const eastward = dlon < 0;               // leaves via +180
  const exitLon = eastward ? 180 : -180;
  const entryLon = -exitLon;

  const toExit = Math.abs(exitLon - from.lon);
  const total = toExit + Math.abs(to.lon - entryLon);
  const lat = from.lat + (to.lat - from.lat) * (toExit / total);

  return [
    [from, { lon: exitLon, lat }],
    [{ lon: entryLon, lat }, to]
  ];
}

/* The bow is perpendicular to the segment and proportional to its length, so a
   short hop stays almost straight and an ocean crossing curves. Capped, since
   an uncapped proportional bow turns a Pacific leg into a rainbow. */
const BOW = 0.10;
const BOW_MAX = 9;

function segmentPath(from, to) {
  const [x1, y1] = project(from.lon, from.lat);
  const [x2, y2] = project(to.lon, to.lat);
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 0.01) return "";

  const off = Math.min(len * BOW, BOW_MAX);
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;

  /* Bow away from the equator, so a northern lane arches north and a southern
     one arches south. Two lanes over the same water then read as parallel
     rather than crossing. */
  const sign = my <= 0 ? -1 : 1;
  const cx = mx + (dy / len) * off * sign;
  const cy = my - (dx / len) * off * sign;

  return `M${x1.toFixed(2)} ${y1.toFixed(2)}Q${cx.toFixed(2)} ${cy.toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function arcPath(from, to) {
  return splitAntimeridian(from, to)
    .map(([a, b]) => segmentPath(a, b))
    .filter(Boolean)
    .join(" ");
}

/* The full chain for one lane, as separate arcs so a leg can be styled or
   flagged on its own. */
function lanePath(lane) {
  const stops = laneStops(lane);
  const segs = [];
  for (let i = 0; i + 1 < stops.length; i++) {
    const d = arcPath(stops[i], stops[i + 1]);
    if (d) segs.push({ d, from: stops[i], to: stops[i + 1] });
  }
  return segs;
}

/* --------------------------------------------------------------------------
   Drawing
   -------------------------------------------------------------------------- */

function renderMap(host, { lanes = [], selectedId = null, showAllChokepoints = true } = {}) {
  if (!host) return;
  if (GEO.failed) {
    host.innerHTML = `<div class="map-fail">The map data did not load. Run <code>python3 tools/build_geo.py</code>.</div>`;
    return;
  }
  if (!GEO.world) {
    host.innerHTML = `<div class="map-loading">Drawing the map…</div>`;
    return;
  }

  const land = GEO.world.countries
    .map(c => c.rings.map(ringPath).join(""))
    .join("");

  /* Only the chokepoints a lane actually uses are drawn solid. The rest are
     shown faintly, so the map still reads as a map of world trade rather than
     as a diagram of four lanes. */
  const used = new Set();
  for (const l of lanes) for (const id of (l.route?.chokepoints || [])) used.add(id);

  const cps = (GEO.chokepoints.chokepoints || [])
    .filter(c => showAllChokepoints || used.has(c.id))
    .map(c => {
      const [x, y] = project(c.lon, c.lat);
      const on = used.has(c.id);
      return `<g class="cp ${on ? "on" : ""}" data-chokepoint="${c.id}">
        <circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${on ? 1.9 : 1.1}"/>
        ${on ? `<text x="${(x + 3).toFixed(2)}" y="${(y + 1).toFixed(2)}">${escapeHtml(c.name)}</text>` : ""}
      </g>`;
    }).join("");

  const laneSvg = lanes.map(l => {
    const segs = lanePath(l);
    const sel = l.id === selectedId;
    const stops = laneStops(l);
    return `<g class="lane ${sel ? "selected" : ""}" data-lane="${l.id}">
      ${segs.map(s => `<path class="lane-leg" d="${s.d}"/>`).join("")}
      ${stops.map((s, i) => {
        if (i > 0 && i < stops.length - 1) return "";   // chokepoints drawn above
        const [x, y] = project(s.lon, s.lat);
        return `<circle class="lane-node" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.6"/>
                <text class="lane-label" x="${(x + 3).toFixed(2)}" y="${(y + 1).toFixed(2)}">${escapeHtml(s.name)}</text>`;
      }).join("")}
    </g>`;
  }).join("");

  host.innerHTML = `
    <svg class="map-svg" viewBox="${MAP_VIEW.x} ${MAP_VIEW.y} ${MAP_VIEW.w} ${MAP_VIEW.h}"
         preserveAspectRatio="xMidYMid meet" role="img"
         aria-label="World map showing ${lanes.length} watched trade lane${lanes.length === 1 ? "" : "s"}">
      <g class="map-land"><path d="${land}"/></g>
      <g class="map-chokepoints">${cps}</g>
      <g class="map-lanes">${laneSvg}</g>
    </svg>
    <div class="map-key">
      <span class="map-key-item"><span class="key-cp"></span>chokepoint</span>
      <span class="map-key-item"><span class="key-port"></span>port</span>
      <span class="map-key-item"><span class="key-lane"></span>lane</span>
      <span class="map-key-src">Coastlines Natural Earth. Chokepoints IMF PortWatch.</span>
    </div>`;
}

/* ==================== lanes.js ==================== */
/* ==========================================================================
   CORRIDOR — lanes

   A lane is an origin, a product and a destination. It is the object the whole
   app hangs off, because it is the only thing that touches every layer at
   once: it has coordinates so it can be drawn, a tariff line so its duty is
   exact, a country so its preference programmes are known, and a route so its
   chokepoints are known.

   Routing here is a lookup, not a computation. Corridor cannot route a vessel
   and does not pretend to. The table below covers the corridors anyone would
   watch, each assignment is stored on the lane, and every lane says which
   basis produced its route so a guess never reads as a fact.
   ========================================================================== */

/* --------------------------------------------------------------------------
   Ports

   Hand-built rather than taken from PortWatch's 2,065, which its catalogue
   only exposes one page at a time. These are the ports that carry the lanes
   people actually watch, plus a coastal point for countries with no single
   dominant port. Coordinates are the port itself, not the country centroid,
   so an arc leaves from the water rather than from the middle of a landmass.
   -------------------------------------------------------------------------- */
const PORTS = {
  /* US destinations */
  USEC: { name: "New York",     lat: 40.67,  lon: -74.04, coast: "US East" },
  USGC: { name: "Houston",      lat: 29.73,  lon: -95.27, coast: "US Gulf" },
  USWC: { name: "Long Beach",   lat: 33.75,  lon: -118.21, coast: "US West" },

  /* East and southern Africa */
  KE: { name: "Mombasa",        lat: -4.06,  lon: 39.67 },
  TZ: { name: "Dar es Salaam",  lat: -6.82,  lon: 39.30 },
  ET: { name: "Djibouti",       lat: 11.60,  lon: 43.14 },
  MU: { name: "Port Louis",     lat: -20.16, lon: 57.50 },
  MG: { name: "Toamasina",      lat: -18.15, lon: 49.42 },
  ZA: { name: "Durban",         lat: -29.87, lon: 31.03 },
  MZ: { name: "Maputo",         lat: -25.97, lon: 32.57 },
  CD: { name: "Durban",         lat: -29.87, lon: 31.03 },   // DRC exports route overland
  ZM: { name: "Durban",         lat: -29.87, lon: 31.03 },

  /* West and north Africa */
  NG: { name: "Lagos",          lat: 6.44,   lon: 3.39 },
  GH: { name: "Tema",           lat: 5.63,   lon: 0.01 },
  CI: { name: "Abidjan",        lat: 5.28,   lon: -4.01 },
  SN: { name: "Dakar",          lat: 14.68,  lon: -17.42 },
  EG: { name: "Alexandria",     lat: 31.19,  lon: 29.87 },
  MA: { name: "Tanger Med",     lat: 35.88,  lon: -5.51 },
  TN: { name: "Radès",          lat: 36.79,  lon: 10.27 },

  /* South and Southeast Asia */
  CN: { name: "Shanghai",       lat: 31.23,  lon: 121.47 },
  VN: { name: "Ho Chi Minh",    lat: 10.76,  lon: 106.71 },
  TW: { name: "Kaohsiung",      lat: 22.61,  lon: 120.28 },
  KR: { name: "Busan",          lat: 35.10,  lon: 129.04 },
  JP: { name: "Yokohama",       lat: 35.44,  lon: 139.64 },
  TH: { name: "Laem Chabang",   lat: 13.08,  lon: 100.89 },
  MY: { name: "Port Klang",     lat: 3.00,   lon: 101.39 },
  ID: { name: "Tanjung Priok",  lat: -6.10,  lon: 106.88 },
  PH: { name: "Manila",         lat: 14.60,  lon: 120.96 },
  KH: { name: "Sihanoukville",  lat: 10.63,  lon: 103.52 },
  BD: { name: "Chattogram",     lat: 22.31,  lon: 91.80 },
  IN: { name: "Nhava Sheva",    lat: 18.95,  lon: 72.95 },
  LK: { name: "Colombo",        lat: 6.94,   lon: 79.84 },
  PK: { name: "Karachi",        lat: 24.84,  lon: 66.98 },
  MM: { name: "Yangon",         lat: 16.77,  lon: 96.17 },

  /* Europe */
  DE: { name: "Hamburg",        lat: 53.54,  lon: 9.97 },
  NL: { name: "Rotterdam",      lat: 51.95,  lon: 4.14 },
  BE: { name: "Antwerp",        lat: 51.26,  lon: 4.40 },
  IT: { name: "Genoa",          lat: 44.40,  lon: 8.92 },
  ES: { name: "Valencia",       lat: 39.44,  lon: -0.32 },
  FR: { name: "Le Havre",       lat: 49.48,  lon: 0.11 },
  GB: { name: "Felixstowe",     lat: 51.95,  lon: 1.31 },
  PT: { name: "Sines",          lat: 37.95,  lon: -8.87 },
  PL: { name: "Gdańsk",         lat: 54.40,  lon: 18.67 },
  TR: { name: "Ambarlı",        lat: 40.96,  lon: 28.69 },

  /* Americas */
  MX: { name: "Manzanillo",     lat: 19.05,  lon: -104.32 },
  BR: { name: "Santos",         lat: -23.98, lon: -46.30 },
  CL: { name: "Valparaíso",     lat: -33.03, lon: -71.63 },
  PE: { name: "Callao",         lat: -12.05, lon: -77.15 },
  CO: { name: "Cartagena",      lat: 10.40,  lon: -75.52 },
  DO: { name: "Caucedo",        lat: 18.42,  lon: -69.63 },
  GT: { name: "Puerto Quetzal", lat: 13.92,  lon: -90.79 },
  HN: { name: "Puerto Cortés",  lat: 15.83,  lon: -87.95 },
  CA: { name: "Vancouver",      lat: 49.29,  lon: -123.11 },

  /* Middle East */
  JO: { name: "Aqaba",          lat: 29.52,  lon: 35.00 },
  IL: { name: "Haifa",          lat: 32.82,  lon: 35.00 },
  OM: { name: "Salalah",        lat: 16.94,  lon: 54.01 },
  BH: { name: "Khalifa Bin Salman", lat: 26.16, lon: 50.66 },
  AE: { name: "Jebel Ali",      lat: 25.01,  lon: 55.06 }
};

const DESTINATIONS = [
  { id: "USEC", label: "US East Coast" },
  { id: "USGC", label: "US Gulf Coast" },
  { id: "USWC", label: "US West Coast" }
];

function portFor(code) {
  return PORTS[code] || null;
}

/* --------------------------------------------------------------------------
   Routes

   Which chokepoints a lane transits, by region and destination coast. Nothing
   here is computed. It is the set of standard routings a freight forwarder
   would recognise, written down so the map can draw them and so a reader can
   see the assumption and change it.
   -------------------------------------------------------------------------- */

const REGIONS = {
  eafrica:  ["KE", "TZ", "ET", "MU", "MG", "MZ"],
  safrica:  ["ZA", "CD", "ZM"],
  wafrica:  ["NG", "GH", "CI", "SN"],
  nafrica:  ["EG", "MA", "TN"],
  seasia:   ["CN", "VN", "TW", "KR", "JP", "TH", "MY", "ID", "PH", "KH", "MM"],
  sasia:    ["BD", "IN", "LK", "PK"],
  europe:   ["DE", "NL", "BE", "IT", "ES", "FR", "GB", "PT", "PL", "TR"],
  meast:    ["JO", "IL", "OM", "BH", "AE"],
  latam:    ["MX", "BR", "CL", "PE", "CO", "DO", "GT", "HN"],
  namerica: ["CA"]
};

function regionOf(code) {
  for (const [region, members] of Object.entries(REGIONS)) {
    if (members.includes(code)) return region;
  }
  return null;
}

/* region -> destination coast -> chokepoints, in transit order.
   An empty array is a legitimate answer: a Pacific crossing passes none.

   Verified against the PortWatch ids rather than guessed:
     1 Suez   2 Panama   4 Bab el-Mandeb   5 Malacca
     7 Cape of Good Hope   8 Gibraltar   11 Taiwan   12 Korea */
const CP = {
  suez: "chokepoint1", panama: "chokepoint2", babElMandeb: "chokepoint4",
  malacca: "chokepoint5", hormuz: "chokepoint6", cape: "chokepoint7",
  gibraltar: "chokepoint8", dover: "chokepoint9", taiwan: "chokepoint11",
  korea: "chokepoint12", luzon: "chokepoint14", sunda: "chokepoint19"
};

const ROUTE_TABLE = {
  /* Indian Ocean to the US Atlantic runs up the Red Sea, through Suez, then
     out past Gibraltar. To the US Pacific it crosses the Indian Ocean and the
     Pacific instead, passing Malacca. */
  eafrica:  { USEC: [CP.babElMandeb, CP.suez, CP.gibraltar],
              USGC: [CP.babElMandeb, CP.suez, CP.gibraltar],
              USWC: [CP.malacca] },
  sasia:    { USEC: [CP.babElMandeb, CP.suez, CP.gibraltar],
              USGC: [CP.babElMandeb, CP.suez, CP.gibraltar],
              USWC: [CP.malacca] },
  meast:    { USEC: [CP.suez, CP.gibraltar],
              USGC: [CP.suez, CP.gibraltar],
              USWC: [CP.hormuz, CP.malacca] },

  /* Southern Africa is already south of Suez, so an Atlantic run is direct. */
  safrica:  { USEC: [], USGC: [], USWC: [CP.malacca] },
  wafrica:  { USEC: [], USGC: [], USWC: [CP.panama] },
  nafrica:  { USEC: [CP.gibraltar], USGC: [CP.gibraltar], USWC: [CP.gibraltar, CP.panama] },

  /* East Asia to the US West is a straight Pacific crossing with no
     chokepoint at all. Eastbound to the Atlantic it takes Panama. */
  seasia:   { USEC: [CP.panama], USGC: [CP.panama], USWC: [] },

  europe:   { USEC: [], USGC: [], USWC: [CP.panama] },
  latam:    { USEC: [], USGC: [], USWC: [CP.panama] },
  namerica: { USEC: [], USGC: [], USWC: [] }
};

/* With Suez disrupted, Indian Ocean traffic to the Atlantic goes round the
   Cape instead. Kept as a named alternative so a closure can be shown on the
   map rather than described in prose. */
const CAPE_ROUTE = {
  eafrica: [CP.cape],
  sasia:   [CP.cape],
  meast:   [CP.hormuz, CP.cape]
};

function routeFor(origin, destination, { viaCape = false } = {}) {
  const region = regionOf(origin);
  if (!region) return { chokepoints: [], basis: "unknown" };
  if (viaCape && CAPE_ROUTE[region]) {
    return { chokepoints: CAPE_ROUTE[region].slice(), basis: "cape" };
  }
  const table = ROUTE_TABLE[region] || {};
  return { chokepoints: (table[destination] || []).slice(), basis: "table" };
}

/* Origin port, each chokepoint in order, destination port. This is what the
   map draws and what the lane summary reads out. */
function laneStops(lane) {
  const stops = [];
  const from = portFor(lane.origin);
  if (from) stops.push({ name: from.name, lat: from.lat, lon: from.lon, kind: "port" });
  for (const id of (lane.route?.chokepoints || [])) {
    const c = chokepointById(id);
    if (c) stops.push({ name: c.name, lat: c.lat, lon: c.lon, kind: "chokepoint", id });
  }
  const to = portFor(lane.destination);
  if (to) stops.push({ name: to.name, lat: to.lat, lon: to.lon, kind: "port" });
  return stops;
}

function routeSummary(lane) {
  return laneStops(lane).map(s => s.name).join(" · ");
}

/* --------------------------------------------------------------------------
   Building a lane
   -------------------------------------------------------------------------- */

function blankLane({ origin, product, destination = "USEC", hts = null }) {
  const country = COUNTRY_PROGRAMS[origin];
  return {
    id: newProjectId(),
    origin,
    destination,
    product: (product || "").trim(),
    hts,
    label: `${country ? country.name : origin} to ${(DESTINATIONS.find(d => d.id === destination) || {}).label || destination}`,
    route: routeFor(origin, destination),
    watch: [],
    addedAt: Date.now()
  };
}

/* --------------------------------------------------------------------------
   What Corridor knows about a lane without being told

   Duty comes from the bundled schedule when an HTS line is set. Programme
   dependency and unmodelled trade actions come from the country tables. All of
   it reuses the engines already in tariffs.js and datasets.js.
   -------------------------------------------------------------------------- */

function laneExposure(lane) {
  const country = COUNTRY_PROGRAMS[lane.origin] || { name: lane.origin, programs: [] };
  const out = {
    origin: lane.origin,
    originName: country.name,
    programs: (country.programs || []).map(p => ({ id: p, label: PROGRAM_LABELS[p] || p })),
    actions: tradeActionsFor(lane.origin, lane.hts),
    chokepoints: (lane.route?.chokepoints || []).map(chokepointById).filter(Boolean),
    duty: null
  };

  if (lane.hts && tariffsReady()) {
    const record = htsByCode(lane.hts);
    if (record) {
      /* A nominal shipment, because a lane has no value of its own. What
         matters is the rate and the basis, so the value is stated wherever
         the figure is shown. */
      const priced = computeDuty({
        line: record, originCode: lane.origin,
        value: 100000, mode: "ocean", claimPreferences: true
      });
      const unclaimed = computeDuty({
        line: record, originCode: lane.origin,
        value: 100000, mode: "ocean", claimPreferences: false
      });
      out.duty = {
        hts: lane.hts,
        description: record.d,
        claimed: priced.resolved,
        unclaimed: unclaimed.resolved,
        notComputable: !!priced.notComputable,
        notComputableWhy: priced.notComputableWhy || null,
        /* The gap between claiming and not claiming, per $100k, is the thing
           the preference is actually worth on this lane. */
        preferenceWorth: Math.max(0, unclaimed.duty - priced.duty)
      };
    }
  }
  return out;
}

/* ==================== watch.js ==================== */
/* ==========================================================================
   CORRIDOR — the watchlist

   Watch items are derived from what a lane actually depends on, never from a
   general list of trade risks. A Kenyan apparel lane watches AGOA because its
   duty rests on it. A Chinese lane watches Section 301. A lane through Suez
   watches Suez. A lane that crosses the Pacific direct watches neither.

   Each check keeps its own history, so re-checking reports what moved rather
   than replacing the picture. That is the whole point: a snapshot is available
   anywhere, a trajectory is not.
   ========================================================================== */

const WATCH_STALE_DAYS = 5;

/* --------------------------------------------------------------------------
   Deriving what to watch
   -------------------------------------------------------------------------- */

function deriveWatchItems(lane) {
  const exposure = laneExposure(lane);
  const items = [];
  const country = COUNTRY_PROGRAMS[lane.origin] || { name: lane.origin };

  /* The preference the lane's duty actually rests on. Only worth watching when
     claiming it changes the rate, which laneExposure works out. */
  const claimed = exposure.duty && exposure.duty.claimed;
  if (claimed && claimed.program) {
    items.push({
      id: `${lane.id}:prog:${claimed.program}`,
      laneId: lane.id,
      kind: "programme",
      subject: PROGRAM_LABELS[claimed.program] || claimed.program,
      why: exposure.duty.preferenceWorth
        ? `This lane's rate depends on it. Worth ${(exposure.duty.preferenceWorth / 1000).toFixed(1)}% of shipment value.`
        : "This lane claims it.",
      question: `Is ${PROGRAM_LABELS[claimed.program] || claimed.program} still in force? Is renewal or expiry expected, and has any country been added or removed recently?`,
      history: []
    });
  } else if ((country.programs || []).length) {
    /* A programme the origin holds but the lane does not currently claim. Its
       status still matters, because a change could make it claimable. */
    const p = country.programs[0];
    items.push({
      id: `${lane.id}:prog:${p}`,
      laneId: lane.id,
      kind: "programme",
      subject: PROGRAM_LABELS[p] || p,
      why: `${country.name} holds it, though this lane does not currently claim it.`,
      question: `Is ${PROGRAM_LABELS[p] || p} still in force, and is ${country.name} still eligible?`,
      history: []
    });
  }

  /* Trade actions Corridor does not model, which is exactly why they need
     watching rather than computing. */
  for (const a of exposure.actions) {
    items.push({
      id: `${lane.id}:action:${a.id}`,
      laneId: lane.id,
      kind: "action",
      subject: a.name,
      why: `Applies to ${country.name} and is not included in any duty figure Corridor shows.`,
      question: `What is the current status and scope of ${a.name}? Have rates, covered goods or exclusions changed?`,
      history: []
    });
  }

  /* Chokepoints on the route. A disruption changes transit time and cost
     without changing a single tariff line. */
  for (const c of exposure.chokepoints) {
    items.push({
      id: `${lane.id}:cp:${c.id}`,
      laneId: lane.id,
      kind: "chokepoint",
      subject: c.name,
      why: `On this lane's route. ${(c.vessels || 0).toLocaleString()} vessels a year pass through it.`,
      question: `Is transit through the ${c.name} disrupted at the moment? Are carriers rerouting, and what is the effect on transit time and rates?`,
      history: []
    });
  }

  return items;
}

/* Re-derive without losing what has already been checked. A lane whose route
   changes gains and loses watch items; the ones that survive keep their
   history. */
function refreshWatchItems(lane) {
  const fresh = deriveWatchItems(lane);
  const existing = new Map((lane.watch || []).map(w => [w.id, w]));
  return fresh.map(f => {
    const old = existing.get(f.id);
    return old ? Object.assign(f, { history: old.history, state: old.state }) : f;
  });
}

/* --------------------------------------------------------------------------
   Checking
   -------------------------------------------------------------------------- */

function lastCheck(item) {
  return item.history && item.history.length ? item.history[item.history.length - 1] : null;
}

function isStale(item, days = WATCH_STALE_DAYS) {
  const last = lastCheck(item);
  if (!last) return true;
  return Date.now() - last.checkedAt > days * 86400000;
}

function watchCheckPrompt(item) {
  const last = lastCheck(item);
  return `${item.question}

${last ? `WHEN LAST CHECKED (${new Date(last.checkedAt).toISOString().slice(0, 10)}):
${last.state}` : "This has not been checked before, so record the current position."}

Search for the current position before answering. Then answer in exactly this shape and nothing else:

status | escalated | eased | unchanged | new
state | <one or two sentences: the current position, with a date>
change | <what moved since the last check, or "first check" if there was none>
source | <the single best URL you actually used>`;
}

function parseWatchCheck(text) {
  const get = (k) => ((new RegExp(k + "\\s*\\|\\s*(.+)", "i").exec(text || "") || [])[1] || "").trim();
  const status = get("status").toLowerCase();
  return {
    status: ["escalated", "eased", "unchanged", "new"].includes(status) ? status : "unchanged",
    state: get("state"),
    change: get("change"),
    source: get("source")
  };
}

function recordCheck(item, result) {
  item.state = result.state;
  item.history = item.history || [];
  item.history.push({
    checkedAt: Date.now(),
    status: result.status,
    state: result.state,
    change: result.change,
    source: result.source
  });
  /* A year of weekly checks is plenty of trajectory to keep. */
  if (item.history.length > 52) item.history.shift();
}

/* --------------------------------------------------------------------------
   The feed

   What moved since a given moment, newest first, with the unchanged collapsed
   into a count. This is what the surface leads with.
   -------------------------------------------------------------------------- */

function buildFeed(lanes, since) {
  const moved = [];
  let unchanged = 0;
  let latest = 0;

  for (const lane of lanes) {
    for (const item of (lane.watch || [])) {
      const last = lastCheck(item);
      if (!last) continue;
      latest = Math.max(latest, last.checkedAt);

      const isNew = !since || last.checkedAt > since;
      if (!isNew) continue;

      if (last.status === "unchanged") { unchanged++; continue; }

      const prev = item.history.length > 1 ? item.history[item.history.length - 2] : null;
      moved.push({
        itemId: item.id,
        laneId: lane.id,
        laneLabel: lane.label,
        subject: item.subject,
        kind: item.kind,
        status: last.status,
        was: prev ? prev.state : null,
        now: last.state,
        change: last.change,
        source: last.source,
        checkedAt: last.checkedAt
      });
    }
  }

  const rank = { escalated: 0, new: 1, eased: 2 };
  moved.sort((a, b) => (rank[a.status] - rank[b.status]) || b.checkedAt - a.checkedAt);
  return { moved, unchanged, latest };
}

/* ==================== assessments.js ==================== */
/* ==========================================================================
   CORRIDOR — the assessment engine

   An assessment is an ask with a fixed prompt and a persisted result. It runs
   down the same API path and through the same section renderers as any other
   answer, so there is no second rendering stack to keep in step. Each module
   adds two sections to the standard contract, a VERDICT and a SCORE band, and
   the decision readout is computed from those bands.

   Everything here is a pure function. The API calls and the DOM live in
   app.js. This file holds the prompts, the parsing, and the arithmetic that
   turns five bands into one decision.
   ========================================================================== */

/* --------------------------------------------------------------------------
   Prompts
   -------------------------------------------------------------------------- */

function assessmentModuleName(module, project) {
  if (!module.dynamic) return module.name;
  const industry = (project.industry || "").trim();
  return industry ? `${industry} risk` : module.name;
}

/* The project's own framing, repeated into every module so an assessment is
   always written against the decision in play. */
function assessmentProjectBlock(project) {
  const lines = [];
  if (project.role) lines.push(`Who is asking: ${project.role}`);
  if (project.goal) lines.push(`The decision in play: ${project.goal}`);
  if (project.industry) lines.push(`Industry: ${project.industry}`);
  if (project.geography) lines.push(`Markets in scope: ${project.geography}`);

  const docs = project.documents || [];
  if (docs.length) {
    lines.push(`Documents loaded into this project: ${docs.map(d => d.name).join(", ")}`);
  }
  return lines.length ? `PROJECT\n${lines.join("\n")}` : "";
}

/* The user turn for one module. The trade module receives the computed model
   as authoritative arithmetic it should build on. */
function assessmentQuestion(module, project, tradeBlock) {
  const name = assessmentModuleName(module, project);
  const parts = [
    `Run a ${name.toLowerCase()} for this project.`,
    assessmentProjectBlock(project),
    module.focus
  ].filter(Boolean);

  if (module.dynamic && !((project.industry || "").trim())) {
    parts.push(
      "No industry has been set on this project. Infer the industry from the " +
      "decision and the documents, say which industry you inferred in the first " +
      "line of the body, and assess that."
    );
  }

  if (module.usesTradeModel && tradeBlock) parts.push(tradeBlock);

  if (module.usesTradeModel && !tradeBlock) {
    parts.push(
      "No trade model has been computed for this project yet. Assess duty and " +
      "trade-policy exposure from the corridor's data, and name the HTS codes " +
      "the user should model."
    );
  }

  return parts.join("\n\n");
}

/* Appended to the system prompt for an assessment turn. Everything else in the
   response contract still applies; these two sections are additions. */
function assessmentSystemAddendum(module, project) {
  const name = assessmentModuleName(module, project);
  return `
ASSESSMENT MODE
This turn is a ${name}. It is one of five assessments that together produce a
decision readout for this project, so it has to land a judgement. Write it to
be read next to the other four.

In addition to every section required above, you MUST end with these two:

[[VERDICT]]
One sentence. The bottom line of this assessment for the decision in play.
Give a judgement and name the thing that decides it.

[[SCORE]]
band | one clause of justification

where band is EXACTLY one of: favorable, mixed, adverse, insufficient-data.

  favorable          the evidence supports going ahead on this dimension
  mixed              real support and real problems, roughly balanced
  adverse            the evidence argues against, or the exposure is severe
  insufficient-data  public data cannot settle it

Choose insufficient-data only when the data genuinely will not support a
judgement, and use the CANNOT_ANSWER section to name exactly what is missing.
Do not use it to avoid committing to a view the evidence does support.
`;
}

/* The decision readout's prose. This call sees only the verdict lines and
   bands, never the full module text. The band is already computed, so all
   that is left is naming the conditions, and the small input keeps the call
   cheap and stops it drifting into a sixth assessment. */
function decisionPrompt(project, records, band) {
  const lines = records
    .filter(Boolean)
    .map(r => `${r.title} (${r.band}): ${r.summary}`);

  return `These are the five assessment verdicts for this project.

${assessmentProjectBlock(project)}

VERDICTS
${lines.join("\n")}

The decision band has already been computed from the bands above as: ${band}.
Do not restate it, argue with it, or recompute it.

Write the readout in this exact format and nothing else:

[[RATIONALE]]
Two or three sentences saying why the project stands where it does. Reference
the verdicts that drive it. Write it for someone who will read only this.

[[CONDITIONS]]
One condition per line, no bullets or numbering. Each line names something
specific that must be true, resolved, or verified for the decision to hold.
Name the thing that would change the answer if it broke. Two to five lines.
If the band is insufficient-data, each line names what is missing and where it
would come from instead.`;
}

/* --------------------------------------------------------------------------
   Parsing
   -------------------------------------------------------------------------- */

const ASSESSMENT_BAND_IDS = ["favorable", "mixed", "adverse", "insufficient-data"];

/* The band arrives as "band | justification". Be forgiving about how the
   model writes it, so a stray period or capital does not cost us the score. */
function parseAssessmentScore(text) {
  const raw = (text || "").trim();
  if (!raw) return { band: null, justification: "" };

  const [head, ...rest] = raw.split("|");
  const candidate = (head || "").trim().toLowerCase().replace(/[.\s]+$/, "");

  let band = ASSESSMENT_BAND_IDS.includes(candidate) ? candidate : null;
  if (!band) {
    // Sometimes it comes back as a sentence containing the word.
    band = ASSESSMENT_BAND_IDS.find(b => raw.toLowerCase().includes(b)) || null;
  }
  return { band, justification: rest.join("|").trim() };
}

function parseDecisionSections(text) {
  const out = { rationale: "", conditions: [] };
  const rationale = /\[\[RATIONALE\]\]([\s\S]*?)(?=\[\[|$)/.exec(text || "");
  const conditions = /\[\[CONDITIONS\]\]([\s\S]*?)(?=\[\[|$)/.exec(text || "");
  if (rationale) out.rationale = rationale[1].trim();
  if (conditions) {
    out.conditions = conditions[1]
      .split("\n")
      .map(l => l.replace(/^\s*[-•*\d.)\s]+/, "").trim())
      .filter(Boolean);
  }
  return out;
}

/* --------------------------------------------------------------------------
   Records and staleness
   -------------------------------------------------------------------------- */

/* An assessment is a result like any other, so this builds one directly. The
   title is the module's name and the summary is its verdict, which is what a
   collapsed card shows. */
function buildAssessmentRecord(module, project, raw, sections) {
  const score = parseAssessmentScore(sections.SCORE);
  return {
    id: newProjectId(),
    kind: "assessment",
    moduleId: module.id,
    title: assessmentModuleName(module, project),
    summary: (sections.VERDICT || "").trim(),
    raw,
    sections,
    band: score.band,
    justification: score.justification,
    createdAt: Date.now(),
    answerCountAt: project.answerCount || 0,
    docCountAt: (project.documents || []).length,
    corridorId: project.primaryCorridor
  };
}

/* An assessment goes stale when the project moves underneath it, whether
   through new documents or answers that established things it never saw.
   Better to say so than to show an old verdict as current. */
function assessmentStaleness(record, project) {
  if (!record) return null;
  const reasons = [];

  const docsNow = (project.documents || []).length;
  if (docsNow !== record.docCountAt) {
    const delta = docsNow - record.docCountAt;
    reasons.push(delta > 0
      ? `${delta} document${delta === 1 ? "" : "s"} added since`
      : `${-delta} document${delta === -1 ? "" : "s"} removed since`);
  }

  const answersSince = (project.answerCount || 0) - record.answerCountAt;
  if (answersSince >= 3) reasons.push(`${answersSince} answers since`);

  if (record.corridorId && record.corridorId !== project.primaryCorridor) {
    reasons.push("corridor changed");
  }

  return reasons.length ? reasons.join(" · ") : null;
}

/* --------------------------------------------------------------------------
   The decision
   -------------------------------------------------------------------------- */

/* The newest run of each module, in module order. Reads the project's result
   list, which is the single place work is stored. */
function projectAssessmentRecords(project) {
  return ASSESSMENT_MODULES.map(m => latestAssessment(project, m.id));
}

function projectDecisionBand(project) {
  const bands = projectAssessmentRecords(project).map(r => r && r.band);
  return computeDecisionBand(bands);
}

/* Why the band came out the way it did, in terms the reader can check
   against the cards above. The headline is computed, so it can show its
   own working. */
function decisionBasis(project) {
  const records = projectAssessmentRecords(project).filter(Boolean);
  if (!records.length) return "";

  const counts = {};
  for (const r of records) counts[r.band] = (counts[r.band] || 0) + 1;

  const order = ["favorable", "mixed", "adverse", "insufficient-data"];
  const parts = order
    .filter(b => counts[b])
    .map(b => `${counts[b]} ${(ASSESSMENT_BANDS[b] || {}).label.toLowerCase()}`);

  const total = ASSESSMENT_MODULES.length;
  return `${records.length} of ${total} assessments run. ${parts.join(", ")}.`;
}

export {
  DATASETS,
  DEFAULT_CORRIDOR_ID,
  searchDomains,
  SPI_CODES,
  COUNTRY_PROGRAMS_ASOF,
  COUNTRY_PROGRAMS,
  TRADE_ACTIONS,
  ENTRY_FEES,
  TRANSPORT_MODES,
  countryName,
  tradeActionsFor,
  ASSESSMENT_BANDS,
  ASSESSMENT_MODULES,
  assessmentModuleById,
  DECISION_BANDS,
  computeDecisionBand,
  MCS,
  loadMcsIndex,
  loadMcs,
  STOPWORDS,
  normalize,
  matchCommodities,
  matchCountries,
  queryMcs,
  STAT_PRIORITY,
  rankRow,
  MAX_ROWS,
  mcsContextFor,
  mcsPromptBlock,
  TARIFFS,
  loadTariffIndex,
  loadTariffs,
  tariffsReady,
  htsByCode,
  searchHts,
  MPF_EXEMPT_PROGRAMS,
  PROGRAM_LABELS,
  APPAREL_CHAPTERS,
  PROGRAM_CONDITIONS,
  FTA_CONDITION,
  programCondition,
  resolveRate,
  formatPercent,
  parseRateText,
  computeDuty,
  compareOrigins,
  money,
  tariffPromptBlock,
  GEO,
  loadGeo,
  chokepointById,
  MAP_VIEW,
  project,
  ringPath,
  splitAntimeridian,
  BOW,
  BOW_MAX,
  segmentPath,
  arcPath,
  lanePath,
  renderMap,
  PORTS,
  DESTINATIONS,
  portFor,
  REGIONS,
  regionOf,
  CP,
  ROUTE_TABLE,
  CAPE_ROUTE,
  routeFor,
  laneStops,
  routeSummary,
  blankLane,
  laneExposure,
  WATCH_STALE_DAYS,
  deriveWatchItems,
  refreshWatchItems,
  lastCheck,
  isStale,
  watchCheckPrompt,
  parseWatchCheck,
  recordCheck,
  buildFeed,
  assessmentModuleName,
  assessmentProjectBlock,
  assessmentQuestion,
  assessmentSystemAddendum,
  decisionPrompt,
  ASSESSMENT_BAND_IDS,
  parseAssessmentScore,
  parseDecisionSections,
  buildAssessmentRecord,
  assessmentStaleness,
  projectAssessmentRecords,
  projectDecisionBand,
  decisionBasis
};