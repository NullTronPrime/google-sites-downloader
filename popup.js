const DB_NAME = "gs-image-cache";
const STORE = "images";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "hash" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function updateCount() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).count();
    req.onsuccess = () => {
      document.getElementById("count").textContent = `Images cached: ${req.result}`;
    };
  } catch (err) {
    document.getElementById("count").textContent = "Images cached: 0";
  }
}

async function getAllImages() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function base64ToBlob(base64, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

function sanitize(str) {
  if (!str) return '';
  return str
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .substring(0, 50);
}

function buildFilename(metadata, ext, index) {
  const parts = [];
  
  // Add descriptive text (alt, caption, section)
  const description = metadata.altText || metadata.figcaption || metadata.parentSection || '';
  if (description) {
    parts.push(sanitize(description));
  }
  
  // Add image ID
  if (metadata.imageId) {
    parts.push(metadata.imageId.substring(0, 12));
  } else {
    parts.push(`img-${index}`);
  }
  
  // Add image type if known
  if (metadata.imageType && metadata.imageType !== 'unknown') {
    parts.push(metadata.imageType);
  }
  
  const filename = parts.join('_') || `image-${index}`;
  return `${filename}.${ext}`;
}

document.getElementById("download").addEventListener("click", async () => {
  const status = document.getElementById("status");
  const progress = document.getElementById("progress");
  
  try {
    status.textContent = "Loading images...";
    const allImages = await getAllImages();
    
    if (!allImages || allImages.length === 0) {
      status.textContent = "No images found.";
      return;
    }
    
    // Deduplicate by hash (keep only first occurrence)
    const seenHashes = new Set();
    const images = allImages.filter(img => {
      if (seenHashes.has(img.hash)) {
        console.log('Skipping duplicate:', img.hash.substring(0, 8));
        return false;
      }
      seenHashes.add(img.hash);
      return true;
    });
    
    status.textContent = `Deduped to ${images.length} unique images...`;
    await new Promise(r => setTimeout(r, 500));
    
    status.textContent = `Creating ZIP...`;
    const zip = new JSZip();
    
    // Group by site → page
    const hierarchy = {};
    images.forEach(img => {
      const siteName = sanitize(img.metadata?.siteName || 'unknown-site');
      const pagePath = sanitize(img.metadata?.pagePath || 'home');
      
      if (!hierarchy[siteName]) hierarchy[siteName] = {};
      if (!hierarchy[siteName][pagePath]) hierarchy[siteName][pagePath] = [];
      
      hierarchy[siteName][pagePath].push(img);
    });
    
    // Build ZIP structure: site/page/image-with-metadata.ext
    let added = 0;
    let index = 1;
    
    for (const [siteName, pages] of Object.entries(hierarchy)) {
      const siteFolder = zip.folder(siteName);
      
      for (const [pagePath, pageImages] of Object.entries(pages)) {
        const pageFolder = siteFolder.folder(pagePath);
        
        for (const img of pageImages) {
          if (!img.base64 || img.base64.length === 0) {
            console.error('Empty base64 for:', img.hash.substring(0, 8));
            continue;
          }
          
          const blob = base64ToBlob(img.base64, img.mimeType);
          if (blob.size === 0) {
            console.error('Blob is 0 bytes for:', img.hash.substring(0, 8));
            continue;
          }
          
          const filename = buildFilename(img.metadata, img.ext, index);
          pageFolder.file(filename, blob);
          
          added++;
          index++;
          progress.textContent = `Added ${added}/${images.length}...`;
        }
      }
    }
    
    if (added === 0) {
      status.textContent = "No valid images";
      progress.textContent = "";
      return;
    }
    
    const siteCount = Object.keys(hierarchy).length;
    const pageCount = Object.values(hierarchy).reduce((sum, pages) => sum + Object.keys(pages).length, 0);
    
    status.textContent = `Generating ZIP (${siteCount} sites, ${pageCount} pages)...`;
    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    }, (meta) => {
      progress.textContent = `Compressing: ${Math.round(meta.percent)}%`;
    });
    
    const url = URL.createObjectURL(zipBlob);
    const date = new Date().toISOString().split('T')[0];
    
    chrome.downloads.download({
      url,
      filename: `google-sites-${date}.zip`,
      saveAs: false
    }, () => {
      if (chrome.runtime.lastError) {
        status.textContent = "Download failed";
      } else {
        status.textContent = `✓ ${added} images (${siteCount} sites, ${pageCount} pages)`;
      }
      progress.textContent = "";
      setTimeout(() => {
        URL.revokeObjectURL(url);
        status.textContent = "";
      }, 5000);
    });
    
  } catch (err) {
    console.error(err);
    status.textContent = "Error: " + err.message;
    progress.textContent = "";
  }
});

document.getElementById("clear").addEventListener("click", async () => {
  const status = document.getElementById("status");
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => {
      status.textContent = "Cache cleared!";
      updateCount();
      setTimeout(() => status.textContent = "", 3000);
    };
  } catch (err) {
    status.textContent = "Error clearing cache";
  }
});

updateCount();