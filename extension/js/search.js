// =======================================================
// SEARCH.JS – Integrated with dashboard.html
// Auto-refresh SCIDs when node is connected
// =======================================================

(function () {
  const page = document.getElementById("page-search");
  if (!page) return;

  // -------------------- Elements --------------------
  const searchBox = document.getElementById("searchBox");
  const statusEl = document.getElementById("search-status");
  const resultsEl = document.getElementById("results");
  const minRatingEl = document.getElementById("minRating");
  const minRatingVal = document.getElementById("minRatingVal");
  const sortModeEl = document.getElementById("sortMode");
  const scidInput = document.getElementById("scid");
  const loadBtn = document.getElementById("load");

  if (!searchBox || !resultsEl) return;

  // -------------------- Config --------------------
  const apiBase = "http://127.0.0.1:8099/api";
  let allResults = [];
  let fuse = null;
  let minRating = 0;
  let refreshInterval = 5000; // auto-refresh every 5s

  // -------------------- SCID Fetchers --------------------
  async function fetchSCIDData(scid) {
    try {
      const resp = await fetch(`${apiBase}/scvarsbyheight?scid=${scid}`);
      if (!resp.ok) return null;
      const data = await resp.json();
      if (!data.variables) return null;

      let dURL = scid, nameHdr = scid, descrHdr = "", iconURL = "", createdHeight = Infinity;
      const ratings = [];

      data.variables.forEach(v => {
        const key = v.Key, val = v.Value;
        if (key === "dURL" && val) dURL = val;
        else if (key === "nameHdr" && val) nameHdr = val;
        else if (key === "descrHdr" && val) descrHdr = val;
        else if (key === "iconURLHdr" && val) iconURL = val;
        else if (typeof key === "string" && key.startsWith("dero1")) {
          const [rating, height] = String(val).split("_");
          const h = Number(height);
          ratings.push({ rating: Number(rating), height: h });
          if (h < createdHeight) createdHeight = h;
        }
      });

      const likes = ratings.filter(r => r.rating >= 50).length;
      const dislikes = ratings.filter(r => r.rating < 50).length;
      const average = ratings.length
        ? Math.round(ratings.reduce((a, r) => a + r.rating, 0) / ratings.length)
        : 0;

      return {
        scid, dURL, nameHdr, descrHdr, iconURL,
        likes, dislikes, average,
        createdHeight: createdHeight === Infinity ? 0 : createdHeight
      };
    } catch (err) {
      console.error("SCID fetch error", err);
      return null;
    }
  }

  async function fetchAllSCIDs() {
    const resp = await fetch(`${apiBase}/indexedscs`);
    if (!resp.ok) throw new Error("Indexed SCID fetch failed");
    const data = await resp.json();
    return Object.keys(data.indexedscs || {});
  }

  // -------------------- Load SCIDs --------------------
  async function loadSearchSCIDs() {
    try {
      statusEl.textContent = "⏳ Fetching indexed SCIDs...";
      allResults = [];

      const scids = await fetchAllSCIDs();
      let index = 0;
      const concurrency = 5;

      async function worker() {
        while (index < scids.length) {
          const scid = scids[index++];
          const res = await fetchSCIDData(scid);
          if (res) allResults.push(res);
          statusEl.textContent = `Loaded ${allResults.length} / ${scids.length} SCIDs...`;
        }
      }

      await Promise.all(Array(concurrency).fill().map(worker));

      fuse = new Fuse(allResults, { keys: ["scid","dURL","nameHdr","descrHdr"], threshold: 0.25, ignoreLocation: true });
      statusEl.textContent = `✅ Loaded ${allResults.length} SCIDs`;
      renderResults(allResults);

    } catch (err) {
      console.error("Error loading SCIDs:", err);
      statusEl.textContent = "❌ Failed loading SCIDs – is Gnomon indexer running?";
    }
  }

  window.loadSearchSCIDs = loadSearchSCIDs;

  // -------------------- Render & Filter --------------------
  function sortResults(list, mode) {
    const arr = [...list];
    switch(mode) {
      case "name_asc": return arr.sort((a,b)=>a.nameHdr.localeCompare(b.nameHdr, undefined, {sensitivity:"base"}));
      case "name_desc": return arr.sort((a,b)=>b.nameHdr.localeCompare(a.nameHdr, undefined, {sensitivity:"base"}));
      case "newest": return arr.sort((a,b)=>b.createdHeight-a.createdHeight);
      case "oldest": return arr.sort((a,b)=>a.createdHeight-b.createdHeight);
      default: return arr;
    }
  }

  function renderResults(results) {
    resultsEl.textContent = "";
    const mode = sortModeEl?.value || "name_asc";
    results = sortResults(results, mode);

    const filtered = results.filter(r => r.average >= minRating);
    if (!filtered.length) {
      resultsEl.appendChild(createNoResults("No results found"));
      return;
    }

    filtered.forEach(r => {
      const div = document.createElement("div");
      div.className = "result";

      const iconSlot = document.createElement("div");
      iconSlot.className = "icon-slot";
      if (r.iconURL) {
        const img = document.createElement("img");
        img.className = "icon";
        img.src = r.iconURL;
        iconSlot.appendChild(img);
      }

      const content = document.createElement("div");
      content.className = "content";

      const urlEl = document.createElement("div"); urlEl.className="url"; urlEl.textContent=r.dURL;
      const nameEl = document.createElement("div"); nameEl.className="nameHdr"; nameEl.textContent=r.nameHdr;
      nameEl.onclick = () => handleSCIDClick(r.scid);
      const scidEl = document.createElement("div"); scidEl.className="scid"; scidEl.textContent=r.scid;
      scidEl.onclick = () => handleSCIDClick(r.scid);
      const descrEl = document.createElement("div"); descrEl.className="descr"; descrEl.textContent=r.descrHdr;
      const ratingEl = document.createElement("div"); ratingEl.className="rating"; ratingEl.textContent=`👍 ${r.likes} 👎 ${r.dislikes} ⭐ ${r.average}`;

      content.append(urlEl, nameEl, scidEl, descrEl, ratingEl);
      div.append(iconSlot, content);
      resultsEl.appendChild(div);
    });
  }

  function handleSCIDClick(scid) {
    if (scidInput) { scidInput.value = scid; scidInput.dispatchEvent(new Event("input")); }
    if (window.selectSCID) window.selectSCID(scid);
  }

  function filterResults(query) {
    if (!query.trim()) { renderResults(allResults); return; }
    if (!fuse) return;
    const matches = fuse.search(query).map(r=>r.item);
    renderResults(matches);
  }

  searchBox.addEventListener("input", e => filterResults(e.target.value));
  minRatingEl?.addEventListener("input", e => { minRating=Number(e.target.value); minRatingVal.textContent=minRating; renderResults(allResults); });
  sortModeEl?.addEventListener("change", () => renderResults(allResults));

  // -------------------- Auto-refresh when node is connected --------------------
  // Listen for nodeConnected
  document.addEventListener("nodeConnected", async (e) => {
      const node = e.detail.node;
      if (!node) return;

      searchBox.disabled = true;
      await loadSearchSCIDs();
      searchBox.disabled = false;
    });

  // -------------------- Bootstrap --------------------
  (async () => {
    searchBox.disabled = true;
    await loadSearchSCIDs(); // initial load
    searchBox.disabled = false;
    watchNodeAndRefresh();
  })();

})();
