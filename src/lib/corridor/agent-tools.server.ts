/* Corridor's tools.
 *
 * The difference between a chatbot and an analyst is what it can reach. These
 * are the things Corridor can do to its own assembled data before it says
 * anything: look up a tariff line, price a duty, compare origins, check a
 * preference programme, read the USGS commodity record, and trace a shipping
 * lane through its chokepoints. Every one of them returns structured values
 * with a named provenance, so the answer above can cite them. */

import {
  setCorridorDataBase,
  loadTariffs,
  searchHts,
  TARIFFS,
  htsByCode,
  computeDuty,
  compareOrigins,
  countryName,
  COUNTRY_PROGRAMS,
  COUNTRY_PROGRAMS_ASOF,
  TRADE_ACTIONS,
  tradeActionsFor,
  PROGRAM_LABELS,
  mcsContextFor,
  blankLane,
  routeFor,
  laneStops,
  routeSummary,
  laneExposure,
  PORTS,
  DESTINATIONS,
  GEO,
  loadGeo,
  chokepointById,
  loadGisRegister,
  gisCaveat,
  ROUTE_TABLE,
  CAPE_ROUTE,
  REGIONS,
  CP,
} from "./domain";

export type ToolResult = {
  ok: boolean;
  provenance?: string;
  [key: string]: unknown;
};

let dataBaseSet = false;

/** Datasets are static files served by this app; the agent runs on the server,
 *  so it needs an absolute origin to reach them. */
export function useDataOrigin(origin: string) {
  if (dataBaseSet) return;
  setCorridorDataBase(origin);
  dataBaseSet = true;
}

const HTS_SOURCE = "USITC Harmonized Tariff Schedule (2026 revision), bundled by Corridor";
const PROGRAM_SOURCE = `Corridor preference-programme register, as of ${COUNTRY_PROGRAMS_ASOF}`;
const MCS_SOURCE = "USGS Mineral Commodity Summaries 2026, bundled by Corridor";
const LANE_SOURCE = "Corridor port, route and chokepoint register";
const CHOKEPOINT_SOURCE = "IMF PortWatch chokepoint register, bundled by Corridor";
const GIS_SOURCE =
  "USGS Compilation of Geospatial Data (GIS) for the Mineral Industries and " +
  "Related Infrastructure of Africa, FGDC metadata bundled by Corridor";

export const CORRIDOR_TOOLS = [
  {
    name: "find_tariff_lines",
    description:
      "Search the US Harmonized Tariff Schedule for the lines matching a product description or a partial HTS code. Use this FIRST whenever a question involves a physical good, before quoting any duty rate. Returns candidate HTS codes with their descriptions and general rates.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Product description or partial HTS code, e.g. 'cotton knit t-shirts' or '6109'",
        },
        limit: { type: "number", description: "How many candidate lines to return (default 12)" },
      },
      required: ["query"],
    },
  },
  {
    name: "price_duty",
    description:
      "Price the landed duty on a shipment for one HTS line and one origin country, including the applicable preference programme, Section 301/232 actions, MPF and HMF. Use this instead of estimating a duty yourself.",
    input_schema: {
      type: "object",
      properties: {
        hts: { type: "string", description: "The 8 or 10 digit HTS code" },
        origin: { type: "string", description: "ISO 2-letter origin country code, e.g. VN, KE, CN" },
        value_usd: { type: "number", description: "Customs value of the shipment in US dollars" },
        quantity: { type: "number", description: "Quantity in the line's own unit, when the rate is specific" },
        mode: { type: "string", description: "ocean or air; affects HMF. Default ocean." },
        claim_preferences: {
          type: "boolean",
          description: "Whether to claim eligible preference programmes. Set false to price the no-claim case.",
        },
      },
      required: ["hts", "origin", "value_usd"],
    },
  },
  {
    name: "compare_origins",
    description:
      "Price the same HTS line from several origin countries at once and rank them by landed duty. This is the tool for 'where should we source instead' and for any origin-switching scenario.",
    input_schema: {
      type: "object",
      properties: {
        hts: { type: "string" },
        origins: {
          type: "array",
          items: { type: "string" },
          description: "ISO 2-letter country codes to compare",
        },
        value_usd: { type: "number" },
        quantity: { type: "number" },
      },
      required: ["hts", "origins", "value_usd"],
    },
  },
  {
    name: "check_country_programmes",
    description:
      "Look up which US trade preference programmes and trade actions a country is currently subject to or eligible for (AGOA, GSP, FTAs, Section 301, Section 232). Use this for eligibility and exposure questions.",
    input_schema: {
      type: "object",
      properties: {
        country: { type: "string", description: "ISO 2-letter country code" },
        hts: { type: "string", description: "Optional HTS code, to narrow trade actions to that line" },
      },
      required: ["country"],
    },
  },
  {
    name: "lookup_commodity",
    description:
      "Query the USGS Mineral Commodity Summaries for production, reserves, import reliance and price series by commodity and country. Use this for critical minerals, mining and resource-corridor questions.",
    input_schema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The commodity question in plain language; commodities and countries are matched from it.",
        },
      },
      required: ["question"],
    },
  },
  {
    name: "trace_lane",
    description:
      "Trace the shipping lane from an origin country to a US or European destination: the ports, the routing, the chokepoints it passes, and the exposure that routing creates. Use this for corridor, route and chokepoint risk questions.",
    input_schema: {
      type: "object",
      properties: {
        origin: { type: "string", description: "ISO 2-letter origin country code" },
        destination: {
          type: "string",
          description: "Destination code: USEC, USWC, USGC or EU. Default USEC.",
        },
        product: { type: "string", description: "Optional product name for the lane label" },
        via_cape: {
          type: "boolean",
          description: "Route around the Cape of Good Hope instead of Suez, for a Red Sea diversion scenario.",
        },
      },
      required: ["origin"],
    },
  },
  {
    name: "chokepoint_profile",
    description:
      "Profile one maritime chokepoint: the traffic that moves through it by vessel type, the industries it carries, and which origin regions and destinations route through it. Use this for 'what happens if X closes', for exposure questions about a named strait or canal, and whenever a lane trace returns a chokepoint you need to say more about. The bundled figures are annual traffic composition, not live status; search for current disruption separately.",
    input_schema: {
      type: "object",
      properties: {
        chokepoint: {
          type: "string",
          description:
            "Chokepoint name or partial name, e.g. 'Suez', 'Bab el-Mandeb', 'Strait of Hormuz'. Omit to list every chokepoint Corridor holds.",
        },
      },
      required: [],
    },
  },
  {
    name: "infrastructure_coverage",
    description:
      "Report what the USGS Africa minerals and infrastructure geodatabase covers: which layers exist (mineral facilities, deposits, exploration sites, ports, rail, road, pipelines, LNG terminals, power stations and transmission) and what fields they carry. Use this to answer what infrastructure data exists for an African country or commodity, and to point a user at the source. Corridor holds the metadata for this geodatabase, not the geodata, so this tool can describe coverage and cite the DOI but returns no coordinates, counts or capacities.",
    input_schema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description:
            "Optional filter, e.g. 'rail', 'ports', 'power', 'copper'. Omit to return the full layer register.",
        },
      },
      required: [],
    },
  },
];


const STOP = new Set([
  "the","a","an","of","for","and","or","with","without","from","to","in","on",
  "other","others","not","elsewhere","specified","included","goods","products",
  "made","type","types","kind","kinds","item","items","us","usa",
]);

/* The original search matched the whole phrase as a substring, which is right
   for a person typing into a box and useless for an analyst asking for
   "cotton knit t-shirts". This scores a line by how much of the question it
   actually covers, so a natural-language product description lands. */
function searchHtsSmart(query: string, limit: number) {
  const rows = (TARIFFS as any).rows as any[] | null;
  if (!rows) return [];

  const digits = query.replace(/\D/g, "");
  if (digits.length >= 4) {
    const exact = rows.filter((r) => r.h.startsWith(digits)).slice(0, limit);
    if (exact.length) return exact;
  }

  const direct = searchHts(query, limit);
  if (direct.length) return direct;

  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !STOP.has(w));
  if (!tokens.length) return [];

  const scored: { row: any; score: number }[] = [];
  for (const row of rows) {
    const description = String(row.d ?? "").toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (description.includes(token)) score += 2;
      else if (token.length > 4 && description.includes(token.slice(0, -1))) score += 1;
    }
    if (score >= 2) scored.push({ row, score: score - description.length / 4000 });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.row);
}

async function ensureTariffs() {
  await loadTariffs();
}

/* The browser workspace calls loadGeo() on boot. The agent runs on the server,
   where nothing had ever called it, so chokepointById() read an unpopulated map
   and every lane trace came back with its chokepoints silently dropped. */
async function ensureGeo() {
  await loadGeo();
}

/* Everything a server-side caller needs in memory before it asks the domain
   layer anything. The watch runner needs both: tariffs to price a lane's
   exposure, and the chokepoint register so a lane can name what it passes
   through. */
export async function ensureCorridorData() {
  await Promise.all([ensureTariffs(), ensureGeo()]);
}

function normalizeName(value: string) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    /* Generic geography words only. "Cape", "Good" and "Hope" are the name of
       the Cape of Good Hope, not noise, and stripping them left it unfindable. */
    .replace(/\b(the|strait|straits|canal|of|passage)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* Which lanes depend on a chokepoint. The route table says, for each origin
   region and destination, the chokepoints in transit order; inverting it turns
   "Suez is closed" into the list of corridors that closure actually reaches. */
function lanesThrough(chokepointId: string) {
  const out: { region: string; destination: string; basis: string; origins: string[] }[] = [];
  for (const [region, byDestination] of Object.entries(ROUTE_TABLE as any)) {
    for (const [destination, ids] of Object.entries(byDestination as any)) {
      if ((ids as string[]).includes(chokepointId)) {
        out.push({
          region,
          destination,
          basis: "standard routing",
          origins: (REGIONS as any)[region] ?? [],
        });
      }
    }
  }
  for (const [region, ids] of Object.entries(CAPE_ROUTE as any)) {
    if ((ids as string[]).includes(chokepointId)) {
      out.push({
        region,
        destination: "any Suez routing, diverted",
        basis: "Cape of Good Hope diversion",
        origins: (REGIONS as any)[region] ?? [],
      });
    }
  }
  return out;
}

export async function runCorridorTool(name: string, raw: Record<string, any>): Promise<ToolResult> {
  const input = raw as any;
  try {
    switch (name) {
      case "find_tariff_lines": {
        await ensureTariffs();
        const rows = searchHtsSmart(String(input.query ?? ""), Number(input.limit) || 12);
        return {
          ok: true,
          provenance: HTS_SOURCE,
          matches: rows.map((r: any) => ({
            hts: r.h,
            description: r.d,
            general_rate: r.m ?? null,
            special_rate: r.s ?? null,
            unit: r.u ?? null,
          })),
          note: rows.length ? undefined : "No tariff line matched that description.",
        };
      }

      case "price_duty": {
        await ensureTariffs();
        const line = htsByCode(String(input.hts));
        if (!line) return { ok: false, error: `No HTS line ${input.hts} in the 2026 schedule.` };
        const value = Number(input.value_usd);
        const result: any = computeDuty({
          line,
          originCode: String(input.origin).toUpperCase(),
          value,
          quantity: Number(input.quantity) || 0,
          mode: String(input.mode ?? "ocean"),
          claimPreferences: input.claim_preferences !== false,
        });

        /* A preference that is available but conditional comes back as an
           opportunity rather than an applied rate, because qualifying is a
           rules-of-origin determination a tariff line cannot make. Price that
           case here anyway, so the answer can carry both numbers and the
           saving without the model doing the arithmetic itself. */
        const opportunity = result?.resolved?.opportunity ?? null;
        let ifQualified = null;
        if (opportunity && !result.notComputable) {
          const rate = Number(opportunity.potentialRate) || 0;
          const duty = Math.round(value * rate);
          ifQualified = {
            programme: opportunity.label ?? opportunity.program,
            rate,
            rate_text: rate === 0 ? "Free" : `${(rate * 100).toFixed(2).replace(/\.?0+$/, "")}%`,
            duty,
            saving_vs_priced: Math.max(0, (result.duty ?? 0) - duty),
            requirement: opportunity.requirement,
            note:
              "Conditional. This is the duty if the goods qualify; the priced figure above is the duty if they do not. State both.",
          };
        }

        return {
          ok: true,
          provenance: `${HTS_SOURCE}; ${PROGRAM_SOURCE}`,
          ...result,
          if_qualified: ifQualified,
          hts: line.h,
          description: line.d,
          origin: countryName(String(input.origin).toUpperCase()),
        };
      }

      case "compare_origins": {
        await ensureTariffs();
        const line = htsByCode(String(input.hts));
        if (!line) return { ok: false, error: `No HTS line ${input.hts} in the 2026 schedule.` };
        const origins = (input.origins ?? []).map((c: string) => String(c).toUpperCase());
        const rows = compareOrigins({
          line,
          origins,
          value: Number(input.value_usd),
          quantity: Number(input.quantity) || 0,
          mode: "ocean",
          claimPreferences: true,
        });
        return {
          ok: true,
          provenance: `${HTS_SOURCE}; ${PROGRAM_SOURCE}`,
          hts: line.h,
          description: line.d,
          ranked: rows,
        };
      }

      case "check_country_programmes": {
        const code = String(input.country).toUpperCase();
        const programmes = (COUNTRY_PROGRAMS as any)[code] ?? null;
        const actions = input.hts
          ? tradeActionsFor(code, String(input.hts))
          : TRADE_ACTIONS.filter((a: any) => !a.countries || a.countries.includes(code));
        return {
          ok: true,
          provenance: PROGRAM_SOURCE,
          country: countryName(code),
          country_code: code,
          programmes: programmes
            ? Object.entries(programmes).map(([key, value]) => ({
                programme: (PROGRAM_LABELS as any)[key] ?? key,
                code: key,
                status: value,
              }))
            : [],
          trade_actions: actions,
          as_of: COUNTRY_PROGRAMS_ASOF,
        };
      }

      case "lookup_commodity": {
        const ctx = await mcsContextFor(String(input.question ?? ""));
        if (!ctx) return { ok: true, provenance: MCS_SOURCE, rows: [], note: "No bundled commodity record matched." };
        return { ok: true, provenance: MCS_SOURCE, ...ctx };
      }

      case "trace_lane": {
        await ensureGeo();
        const origin = String(input.origin).toUpperCase();
        const destination = String(input.destination ?? "USEC").toUpperCase();
        if (!DESTINATIONS.some((d: any) => d.id === destination)) {
          return {
            ok: false,
            error: `Corridor has no standard routing to ${destination}. It routes to ${DESTINATIONS.map((d: any) => `${d.id} (${d.label})`).join(", ")}.`,
          };
        }
        const lane = blankLane({
          origin,
          product: String(input.product ?? "shipment"),
          destination,
        });
        lane.route = routeFor(origin, destination, { viaCape: input.via_cape === true });

        /* Resolved records, not bare ids. The model cannot cite "chokepoint4". */
        const chokepoints = (lane.route?.chokepoints ?? [])
          .map((id: string) => {
            const c = chokepointById(id);
            return c
              ? {
                  id,
                  name: c.name,
                  lat: c.lat,
                  lon: c.lon,
                  vessels_per_year: c.vessels ?? null,
                  industries: c.industries ?? [],
                }
              : { id, name: null, note: "Not in the bundled chokepoint register." };
          });

        return {
          ok: true,
          provenance: `${LANE_SOURCE}; ${CHOKEPOINT_SOURCE}`,
          origin: countryName(origin),
          destination,
          destination_port: (PORTS as any)[destination] ?? null,
          routing_basis:
            lane.route?.basis === "cape"
              ? "Cape of Good Hope diversion, in place of the standard Suez routing"
              : lane.route?.basis === "unknown"
                ? "No standard routing on file for this origin"
                : "Standard routing",
          summary: routeSummary(lane),
          stops: laneStops(lane),
          chokepoints,
          exposure: laneExposure(lane),
          known_destinations: DESTINATIONS,
          origin_port: (PORTS as any)[origin] ?? null,
        };
      }

      case "chokepoint_profile": {
        await ensureGeo();
        const all: any[] = ((GEO as any).chokepoints?.chokepoints ?? []);
        const register = (GEO as any).chokepoints ?? {};
        const query = String(input.chokepoint ?? "").trim();

        /* A register that failed to load is a different thing from a world
           with no chokepoints in it, and the model must not read one as the
           other. */
        if (!all.length) {
          return {
            ok: false,
            error: "The chokepoint register did not load, so no chokepoint can be profiled.",
          };
        }

        if (!query) {
          return {
            ok: true,
            provenance: CHOKEPOINT_SOURCE,
            source_url: register.sourceUrl ?? null,
            note: register.note ?? null,
            chokepoints: all.map((c) => ({ id: c.id, name: c.name, vessels_per_year: c.vessels })),
          };
        }

        const needle = normalizeName(query);
        const match =
          all.find((c) => c.id === query) ??
          all.find((c) => normalizeName(c.name) === needle) ??
          all.find((c) => needle && normalizeName(c.name).includes(needle)) ??
          all.find((c) => needle && needle.includes(normalizeName(c.name)));

        if (!match) {
          return {
            ok: false,
            error: `No chokepoint matching "${query}".`,
            known: all.map((c) => c.name),
          };
        }

        const lanes = lanesThrough(match.id);
        return {
          ok: true,
          provenance: CHOKEPOINT_SOURCE,
          source_url: register.sourceUrl ?? null,
          status_note:
            register.note ??
            "Traffic composition only. Current transit status must be established by search.",
          chokepoint: {
            id: match.id,
            name: match.name,
            lat: match.lat,
            lon: match.lon,
            vessels_per_year: match.vessels ?? null,
            container: match.container ?? null,
            tanker: match.tanker ?? null,
            dry_bulk: match.dryBulk ?? null,
            industries: match.industries ?? [],
          },
          lanes_through: lanes,
          diversion_available:
            match.id === CP.suez || match.id === CP.babElMandeb
              ? "Lanes that transit Suez divert round the Cape of Good Hope when the Red Sea closes. Re-run trace_lane with via_cape set to get the diverted routing."
              : null,
        };
      }

      case "infrastructure_coverage": {
        const register: any = await loadGisRegister();
        if (!register) {
          return { ok: false, error: "The geodatabase register is not available." };
        }
        const topic = String(input.topic ?? "").trim().toLowerCase();
        const layers: any[] = register.layers ?? [];
        const selected = topic
          ? layers.filter(
              (l) =>
                String(l.name ?? "").toLowerCase().includes(topic) ||
                String(l.description ?? "").toLowerCase().includes(topic),
            )
          : layers;

        return {
          ok: true,
          provenance: GIS_SOURCE,
          dataset: {
            title: register.dataset?.title ?? null,
            publisher: register.dataset?.publisher ?? null,
            doi: register.dataset?.doi ?? null,
            published: register.dataset?.pubdate ?? null,
          },
          coverage: "Africa",
          layer_count: layers.length,
          matched: selected.length,
          layers: selected.map((l) => ({ name: l.name, description: l.description })),
          constraint:
            gisCaveat() ??
            "Metadata only. State which layers exist and what they carry, and cite the DOI. Never quote a coordinate, facility count or capacity from this register.",
          note: register.note ?? null,
        };
      }

      default:
        return { ok: false, error: `Unknown tool ${name}` };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
