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

  async function captureImage(url, imgElement = null) {
    try {
      const res = await fetch(url, { mode: "cors", credentials: "omit" });
      const blob = await res.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const hash = await sha256(arrayBuffer);
      
      // Extract metadata
      const metadata = {
        originalUrl: url,
        pageUrl: window.location.href,
        pageTitle: document.title,
        timestamp: new Date().toISOString(),
        altText: imgElement?.alt || '',
        title: imgElement?.title || '',
        // Extract the unique image ID from URL
        imageId: url.match(/\/([^\/=]+)(?:=|$)/)?.[1] || hash.substring(0, 16)
      };
      
      // Send arrayBuffer instead of blob (can be cloned in messages)
      chrome.runtime.sendMessage({
        type: 'CACHE_IMAGE',
        data: {
          url,
          hash,
          arrayBuffer,
          mimeType: blob.type,
          ext: blob.type.split("/")[1] || "jpg",
          metadata
        }
      });
      
      console.log('Cached image:', metadata.imageId, 'from:', metadata.pageTitle);
    } catch (err) {
      console.warn('Failed to cache image:', url, err);
    }
  }

  /* ---------- Observe Resource Loads ---------- */

  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      if (entry.name.includes("lh3.googleusercontent.com")) {
        // Get full resolution by removing size parameter
        const fullUrl = entry.name.split("=")[0] + "=s0";
        captureImage(fullUrl);
      }
    }
  }).observe({ entryTypes: ["resource"] });

  /* ---------- Also capture IMG elements directly ---------- */

  function captureExistingImages() {
    const images = document.querySelectorAll('img[src*="googleusercontent.com"]');
    images.forEach(img => {
      if (img.src && img.src.includes("googleusercontent.com")) {
        const fullUrl = img.src.split("=")[0] + "=s0";
        captureImage(fullUrl, img);
      }
    });
  }

  // Capture images immediately
  setTimeout(captureExistingImages, 1000);

  // Observe DOM changes for lazy-loaded images
  const observer = new MutationObserver(() => {
    captureExistingImages();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  /* ---------- Force Lazy Loading ---------- */

  function scrollPage() {
    let y = 0;
    const step = 900;

    const i = setInterval(() => {
      y += step;
      window.scrollTo(0, y);
      if (y >= document.body.scrollHeight) {
        clearInterval(i);
        // Capture any remaining images after scroll completes
        setTimeout(captureExistingImages, 1000);
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
