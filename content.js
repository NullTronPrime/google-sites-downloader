(() => {
  if (window.__gs_collector_running) return;
  window.__gs_collector_running = true;

  const VISITED_KEY = "__gs_pages_visited";
  let extensionInvalidated = false;

  /* ---------- Hashing ---------- */

  async function sha256(buffer) {
    const hash = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /* ---------- Check if extension is still valid ---------- */
  
  function isExtensionValid() {
    if (extensionInvalidated) return false;
    try {
      // This will throw if extension context is invalidated
      chrome.runtime.getURL('');
      return true;
    } catch {
      extensionInvalidated = true;
      console.warn('Extension context invalidated - please reload the page');
      return false;
    }
  }

  /* ---------- Image Capture ---------- */

  async function captureImage(url, imgElement = null) {
    if (!isExtensionValid()) return;
    
    try {
      const res = await fetch(url, { mode: "cors", credentials: "omit" });
      if (!res.ok) return;
      
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
        imageId: url.match(/\/([^\/=]+)(?:=|$)/)?.[1] || hash.substring(0, 16)
      };
      
      // Check again before sending
      if (!isExtensionValid()) return;
      
      chrome.runtime.sendMessage({
        type: 'CACHE_IMAGE',
        data: {
          hash,
          arrayBuffer,
          mimeType: blob.type,
          ext: blob.type.split("/")[1] || "jpg",
          metadata
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          if (!chrome.runtime.lastError.message.includes('context invalidated')) {
            console.warn('Failed to cache:', chrome.runtime.lastError.message);
          }
          extensionInvalidated = true;
        } else {
          console.log('✓ Cached:', metadata.imageId);
        }
      });
      
    } catch (err) {
      if (!err.message.includes('context invalidated')) {
        console.warn('✗ Failed:', url.substring(0, 50), err.message);
      }
    }
  }

  /* ---------- Observe Resource Loads ---------- */

  const capturedUrls = new Set();

  new PerformanceObserver(list => {
    if (!isExtensionValid()) return;
    
    for (const entry of list.getEntries()) {
      if (entry.name.includes("googleusercontent.com") && 
          (entry.name.includes("lh3") || entry.name.includes("sitesv"))) {
        const fullUrl = entry.name.split("=")[0] + "=s0";
        if (!capturedUrls.has(fullUrl)) {
          capturedUrls.add(fullUrl);
          captureImage(fullUrl);
        }
      }
    }
  }).observe({ entryTypes: ["resource"] });

  /* ---------- Capture IMG elements directly ---------- */

  function captureExistingImages() {
    if (!isExtensionValid()) return;
    
    const images = document.querySelectorAll('img[src*="googleusercontent.com"]');
    images.forEach(img => {
      if (img.src && img.src.includes("googleusercontent.com")) {
        const fullUrl = img.src.split("=")[0] + "=s0";
        if (!capturedUrls.has(fullUrl)) {
          capturedUrls.add(fullUrl);
          captureImage(fullUrl, img);
        }
      }
    });
  }

  // Initial capture
  setTimeout(captureExistingImages, 1000);

  // Observe DOM changes
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

    const interval = setInterval(() => {
      if (!isExtensionValid()) {
        clearInterval(interval);
        return;
      }
      
      y += step;
      window.scrollTo(0, y);
      if (y >= document.body.scrollHeight) {
        clearInterval(interval);
        setTimeout(captureExistingImages, 1500);
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
    if (!isExtensionValid()) return;
    
    const visited = new Set(getVisited());
    const links = collectInternalLinks();

    for (const link of links) {
      if (!isExtensionValid()) break;
      if (visited.has(link)) continue;

      visited.add(link);
      setVisited([...visited]);

      history.pushState(null, "", link);
      await new Promise(r => setTimeout(r, 2500));
      scrollPage();
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  crawlPages();
  
  console.log('Google Sites Image Collector active');
})();