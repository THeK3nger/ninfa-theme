// Resolve a did:plc to its PDS service endpoint.
async function resolvePdsEndpoint(did) {
  const response = await fetch(`https://plc.directory/${encodeURIComponent(did)}`);
  if (!response.ok) throw new Error(`Failed to resolve DID: ${response.status}`);
  const doc = await response.json();
  const service = (doc.service || []).find((s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer");
  if (!service) throw new Error("No PDS endpoint found in DID document");
  return service.serviceEndpoint;
}

// Fetch every record in the com.puzzmo.streak collection for the given DID, following cursors.
async function fetchPuzzmoStreaks(did) {
  const pds = await resolvePdsEndpoint(did);
  const records = [];
  let cursor;

  do {
    let url = `${pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}&collection=com.puzzmo.streak&limit=100`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch records: ${response.status}`);
    const data = await response.json();
    records.push(...(data.records || []));
    cursor = data.cursor;
  } while (cursor);

  return records.map((r) => r.value);
}

const PUZZMO_ICONS = {
  memoku: "🧠",
  "weather-memoku": "🌦️",
  typeshift: "⌨️",
  spelltower: "🗼",
  ribbit: "🐸",
  "really-bad-chess": "♟️",
  "pile-up-poker": "🃏",
  "pile-up-poker-pro": "🃏",
  "hue-complete-me": "🎨",
  "headline-shuffle": "📰",
  flipart: "🖼️",
  "cube-clear": "🧊",
  crossword: "🔤",
  "mini-crossword": "🔤",
  "big-crossword": "🔤",
  circuits: "🔌",
  bongo: "🥁",
};

function iconFor(slug) {
  return PUZZMO_ICONS[slug] || "🧩";
}

// Deterministic, playful hue from the game slug so each tile gets its own color.
function hueFor(slug) {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) % 360;
  }
  return hash;
}

// Puzzmo only bumps `current` when you play; if the last play isn't today or
// yesterday, the streak has lapsed and `current` is really just a stale max,
// not an active streak.
function isStreakActive(lastUpdated) {
  const last = new Date(lastUpdated);
  const now = new Date();
  const lastUTCDate = Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate());
  const nowUTCDate = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysSince = Math.round((nowUTCDate - lastUTCDate) / 86400000);
  return daysSince <= 1;
}

function renderPuzzmoStats(streaks, container) {
  if (streaks.length === 0) {
    container.innerHTML = "<p>No Puzzmo stats found.</p>";
    return;
  }

  const withStatus = streaks.map((s) => {
    const active = isStreakActive(s.lastUpdated);
    return { ...s, active, effectiveCurrent: active ? s.current : 0 };
  });

  const sorted = [...withStatus].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    if (b.effectiveCurrent !== a.effectiveCurrent) return b.effectiveCurrent - a.effectiveCurrent;
    return b.max - a.max;
  });

  const topStreak = sorted[0].active ? sorted[0].effectiveCurrent : 0;

  const cards = sorted
    .map((s) => {
      const hue = hueFor(s.gameSlug);
      const onFire = s.active && s.effectiveCurrent === topStreak && s.effectiveCurrent > 1;
      const streakLine = s.active
        ? `<div class="puzzmo-card-streak">🔥 ${s.effectiveCurrent}</div>`
        : `<div class="puzzmo-card-streak puzzmo-card-streak-broken">💤 ${s.effectiveCurrent}</div>`;
      return `
        <div class="puzzmo-card${onFire ? " puzzmo-card-hot" : ""}${s.active ? "" : " puzzmo-card-inactive"}" style="--tile-hue: ${hue}">
          ${onFire ? '<span class="puzzmo-card-badge">🔥 on a roll!</span>' : ""}
          <span class="puzzmo-card-icon">${iconFor(s.gameSlug)}</span>
          <div class="puzzmo-card-name">${s.gameDisplayName}</div>
          ${streakLine}
          <div class="puzzmo-card-meta">🏆 best ${s.max} &middot; 🎲 ${s.total} played</div>
        </div>`;
    })
    .join("");

  container.innerHTML = `<div class="puzzmo-stats-grid">${cards}</div>`;
}

function loadPuzzmoStats(did, containerId) {
  document.addEventListener("DOMContentLoaded", async function () {
    const container = document.getElementById(containerId);
    container.innerHTML = '<p class="puzzmo-loading">🧩 Shuffling puzzle stats…</p>';

    try {
      const streaks = await fetchPuzzmoStreaks(did);
      renderPuzzmoStats(streaks, container);
    } catch (error) {
      console.error("Error fetching Puzzmo stats:", error);
      container.innerHTML = "<p>Error loading Puzzmo stats.</p>";
    }
  });
}
