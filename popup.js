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
  if (!str) return 'unnamed';
  return str.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase().substring(0, 50);
}

document.getElementById("download").addEventListener("click", async () => {
  const status = document.getElementById("status");
  const progress = document.getElementById("progress");
  
  try {
    status.textContent = "Loading images...";
    const images = await getAllImages();
    
    if (!images || images.length === 0) {
      status.textContent = "No images found.";
      return;
    }
    
    status.textContent = `Creating ZIP...`;
    const zip = new JSZip();
    
    // Group by page
    const byPage = {};
    images.forEach(img => {
      const folder = sanitize(img.metadata?.pageTitle || 'uncategorized');
      if (!byPage[folder]) byPage[folder] = [];
      byPage[folder].push(img);
    });
    
    // Add to ZIP
    let added = 0;
    for (const [folderName, folderImages] of Object.entries(byPage)) {
      const folder = zip.folder(folderName);
      for (const img of folderImages) {
        if (!img.base64) continue;
        const blob = base64ToBlob(img.base64, img.mimeType);
        const imageId = img.metadata?.imageId?.substring(0, 8) || img.hash.substring(0, 8);
        const filename = `${imageId}.${img.ext}`;
        folder.file(filename, blob);
        added++;
        progress.textContent = `Added ${added}/${images.length}...`;
      }
    }
    
    if (added === 0) {
      status.textContent = "No valid images";
      progress.textContent = "";
      return;
    }
    
    status.textContent = "Generating ZIP...";
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
        status.textContent = `✓ Downloaded ${added} images!`;
      }
      progress.textContent = "";
      setTimeout(() => {
        URL.revokeObjectURL(url);
        status.textContent = "";
      }, 3000);
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