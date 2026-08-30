/* The project store, backed by the database.
 *
 * The application reads and writes the store synchronously in dozens of
 * places, so this keeps an in-memory copy that is hydrated once at boot and
 * written back to the database on a short debounce. Row-level security scopes
 * every row to the current session, so an anonymous trial and a signed-in
 * account behave identically. */

import { supabase } from "@/integrations/supabase/client";

type Project = Record<string, any> & { id: string; name?: string };
type Store = { activeId: string | null; projects: Record<string, Project> };

const LEGACY_KEY = "corridor.projects";
const ACTIVE_KEY = "corridor.active_project";

/* The database id for each in-memory project id, so a save updates the row it
   came from rather than inserting a duplicate. */
const rowIds = new Map<string, string>();
let memory: Store | null = null;
let pending = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let deleted = new Set<string>();

function readLegacyLocalStore(): Store | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.projects && Object.keys(parsed.projects).length) return parsed;
  } catch {
    /* a corrupt legacy store is not worth failing the boot over */
  }
  return null;
}

/** Loads every project for the current session, importing anything left in
 *  this browser from the pre-database version exactly once. */
export async function hydrateCloudStore(userId: string): Promise<Store> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, data")
    .order("created_at", { ascending: true });

  if (error) throw error;

  const store: Store = { activeId: null, projects: {} };
  for (const row of data ?? []) {
    const project = (row.data ?? {}) as Project;
    if (!project.id) project.id = row.id;
    project.name = row.name ?? project.name;
    rowIds.set(project.id, row.id);
    store.projects[project.id] = project;
  }

  /* One-time import of work made before the database existed. */
  const legacy = readLegacyLocalStore();
  if (legacy && !Object.keys(store.projects).length) {
    for (const project of Object.values(legacy.projects)) {
      store.projects[project.id] = project;
      pending.add(project.id);
    }
    store.activeId = legacy.activeId ?? null;
    localStorage.removeItem(LEGACY_KEY);
  }

  const remembered = typeof localStorage !== "undefined" ? localStorage.getItem(ACTIVE_KEY) : null;
  if (remembered && store.projects[remembered]) store.activeId = remembered;
  if (!store.activeId || !store.projects[store.activeId]) {
    store.activeId = Object.keys(store.projects)[0] ?? null;
  }

  memory = store;
  currentUserId = userId;
  if (pending.size) scheduleFlush();
  return store;
}

let currentUserId: string | null = null;

function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    void flushCloudStore();
  }, 600);
}

/** Pushes every project changed since the last flush to the database. */
export async function flushCloudStore() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!memory || !currentUserId) return;

  const toRemove = Array.from(deleted);
  deleted = new Set();
  for (const localId of toRemove) {
    const rowId = rowIds.get(localId);
    if (!rowId) continue;
    rowIds.delete(localId);
    await supabase.from("projects").delete().eq("id", rowId);
  }

  const ids = Array.from(pending);
  pending = new Set();
  for (const localId of ids) {
    const project = memory.projects[localId];
    if (!project) continue;
    const rowId = rowIds.get(localId);
    if (rowId) {
      const { error } = await supabase
        .from("projects")
        .update({ name: project.name ?? "New project", data: project })
        .eq("id", rowId);
      if (error) console.error("Corridor: could not save project", error);
    } else {
      const { data, error } = await supabase
        .from("projects")
        .insert({ user_id: currentUserId, name: project.name ?? "New project", data: project })
        .select("id")
        .single();
      if (error) console.error("Corridor: could not save project", error);
      else if (data) rowIds.set(localId, data.id);
    }
  }
}

export const cloudStore = {
  read(): Store | null {
    return memory;
  },
  write(store: Store) {
    const previous = memory;
    memory = store;
    if (previous) {
      for (const id of Object.keys(previous.projects)) {
        if (!store.projects[id]) deleted.add(id);
      }
    }
    for (const id of Object.keys(store.projects)) pending.add(id);
    if (typeof localStorage !== "undefined" && store.activeId) {
      localStorage.setItem(ACTIVE_KEY, store.activeId);
    }
    scheduleFlush();
    return true;
  },
};
