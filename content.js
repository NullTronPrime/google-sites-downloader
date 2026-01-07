(() => {
  if (window.__gs_collector_running) return;
  window.__gs_collector_running = true;

  const VISITED_KEY = "__gs_pages_visited";

  /* ---------- Hashing ---------- */

  async function sha256(buffer) {
    const hash = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /* ---------- Image Capture ---------- */

  async function captureImage(url) {
    try {
      const res = await fetch(url, { mode: "cors", credentials: "omit" });
      const blob = await res.blob();
      const buffer = await blob.arrayBuffer();
      const hash = await sha256(buffer);
      
      // Send to background to cache in offscreen document
      chrome.runtime.sendMessage({
        type: 'CACHE_IMAGE',
        data: {
          url,
          hash,
          blob,
          ext: blob.type.split("/")[1] || "jpg"
        }
      });
    } catch (err) {
      // silently ignore failed fetches
    }
  }

  /* ---------- Observe Resource Loads ---------- */

  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      if (entry.name.includes("lh3.googleusercontent.com/sitesv")) {
        captureImage(entry.name.split("=")[0] + "=s0");
      }
    }
  }).observe({ entryTypes: ["resource"] });

  /* ---------- Force Lazy Loading ---------- */

  function scrollPage() {
    let y = 0;
    const step = 900;

    const i = setInterval(() => {
      y += step;
      window.scrollTo(0, y);
      if (y >= document.body.scrollHeight) {
        clearInterval(i);
      }
    }, 700);
  }

  scrollPage();

  /* ---------- Crawl Internal Pages ---------- */

  function getVisited() {
    try {
      return JSON.parse(sessionStorage.getItem(VISITED_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function setVisited(arr) {
    sessionStorage.setItem(VISITED_KEY, JSON.stringify(arr));
  }

  function collectInternalLinks() {
    const origin = location.origin;
    return Array.from(document.querySelectorAll("a"))
      .map(a => a.href)
      .filter(h =>
        h &&
        h.startsWith(origin) &&
        !h.includes("#") &&
        !h.includes("?")
      );
  }

  async function crawlPages() {
    const visited = new Set(getVisited());
    const links = collectInternalLinks();

    for (const link of links) {
      if (visited.has(link)) continue;

      visited.add(link);
      setVisited([...visited]);

      history.pushState(null, "", link);
      await new Promise(r => setTimeout(r, 2200));
      scrollPage();
      await new Promise(r => setTimeout(r, 1800));
    }
  }

  crawlPages();
})();