(() => {
  if (window.__gs_collector_running) return;
  window.__gs_collector_running = true;

  const VISITED_KEY = "__gs_pages_visited";
  let extensionInvalidated = false;

  async function sha256(buffer) {
    const hash = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function isExtensionValid() {
    if (extensionInvalidated) return false;
    try {
      chrome.runtime.getURL('');
      return true;
    } catch {
      extensionInvalidated = true;
      return false;
    }
  }

  function extractMetadata(url, imgElement) {
    // Extract site name from URL
    const urlObj = new URL(window.location.href);
    const pathParts = urlObj.pathname.split('/').filter(p => p);
    const siteName = pathParts[1] || 'unknown-site'; // Usually sites.google.com/view/site-name
    const pagePath = pathParts.slice(2).join('/') || 'home';
    
    // Extract image ID and type from URL
    const imageId = url.match(/\/([A-Za-z0-9_-]{16,})(?:=|$)/)?.[1] || '';
    let imageType = 'unknown';
    if (imageId.startsWith('AF1Qip')) imageType = 'maps-review';
    else if (imageId.startsWith('AOh14G')) imageType = 'profile';
    else if (url.includes('sitesv')) imageType = 'sites';
    
    // Get image context from DOM
    let altText = '';
    let titleAttr = '';
    let ariaLabel = '';
    let figcaption = '';
    let parentSection = '';
    
    if (imgElement) {
      altText = imgElement.alt || '';
      titleAttr = imgElement.title || '';
      ariaLabel = imgElement.getAttribute('aria-label') || '';
      
      // Get caption if in figure
      const figure = imgElement.closest('figure');
      if (figure) {
        const caption = figure.querySelector('figcaption');
        if (caption) figcaption = caption.textContent.trim();
      }
      
      // Get parent section/header context
      const section = imgElement.closest('section, article, div[role="region"]');
      if (section) {
        const heading = section.querySelector('h1, h2, h3, h4, h5, h6');
        if (heading) parentSection = heading.textContent.trim();
      }
    }
    
    return {
      siteName,
      pagePath,
      pageUrl: window.location.href,
      pageTitle: document.title.substring(0, 100),
      imageId: imageId.substring(0, 16),
      imageType,
      altText: altText.substring(0, 100),
      titleAttr: titleAttr.substring(0, 100),
      ariaLabel: ariaLabel.substring(0, 100),
      figcaption: figcaption.substring(0, 100),
      parentSection: parentSection.substring(0, 100),
      timestamp: new Date().toISOString(),
      originalUrl: url
    };
  }

  async function captureImage(url, imgElement = null) {
    if (!isExtensionValid()) return;
    
    try {
      const res = await fetch(url, { mode: "cors", credentials: "omit" });
      if (!res.ok) return;
      
      const blob = await res.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const hash = await sha256(arrayBuffer);
      
      // Convert to base64
      const reader = new FileReader();
      const base64 = await new Promise((resolve) => {
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
      });
      
      const metadata = extractMetadata(url, imgElement);
      
      if (!isExtensionValid()) return;
      
      chrome.runtime.sendMessage({
        type: 'CACHE_IMAGE',
        data: {
          hash,
          base64,
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
          console.log('✓ Cached:', metadata.siteName, '/', metadata.pagePath, '/', metadata.imageId);
        }
      });
      
    } catch (err) {
      if (!err.message.includes('context invalidated')) {
        console.warn('✗ Failed:', url.substring(0, 50), err.message);
      }
    }
  }

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

  setTimeout(captureExistingImages, 1000);

  const observer = new MutationObserver(() => captureExistingImages());
  observer.observe(document.body, { childList: true, subtree: true });

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
      .filter(h => h && h.startsWith(origin) && !h.includes("#") && !h.includes("?"));
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