const DB_NAME = "gs-image-cache";
const STORE = "images";

// Open IndexedDB directly in the popup
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
    console.error('Count error:', err);
    document.getElementById("count").textContent = "Images cached: 0";
  }
}

async function getAllImages() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    
    req.onsuccess = () => {
      console.log('Loaded from IndexedDB:', req.result.length, 'images');
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
}

function sanitizeFilename(str) {
  if (!str) return 'unnamed';
  return str
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .substring(0, 50);
}

document.getElementById("download").addEventListener("click", async () => {
  const status = document.getElementById("status");
  const progress = document.getElementById("progress");
  
  try {
    status.textContent = "Loading images...";
    const images = await getAllImages();
    
    if (!images || images.length === 0) {
      status.textContent = "No images found. Visit a Google Site first.";
      return;
    }
    
    status.textContent = `Creating ZIP with ${images.length} images...`;
    console.log('Creating ZIP with', images.length, 'images');
    
    const zip = new JSZip();
    
    // Group images by page
    const byPage = {};
    images.forEach(img => {
      const pageTitle = img.metadata?.pageTitle || 'uncategorized';
      const folder = sanitizeFilename(pageTitle);
      if (!byPage[folder]) byPage[folder] = [];
      byPage[folder].push(img);
    });
    
    // Add images to ZIP organized by folders
    let processed = 0;
    for (const [folderName, folderImages] of Object.entries(byPage)) {
      const folder = zip.folder(folderName);
      
      for (const img of folderImages) {
        if (!img.arrayBuffer || img.arrayBuffer.byteLength === 0) {
          console.error('Empty arrayBuffer for:', img.hash.substring(0, 8));
          continue;
        }
        
        // Create blob from arrayBuffer
        const blob = new Blob([img.arrayBuffer], { type: img.mimeType });
        
        // Generate filename
        const imageId = img.metadata?.imageId?.substring(0, 8) || img.hash.substring(0, 8);
        const altText = img.metadata?.altText || img.metadata?.figcaption || '';
        const desc = altText ? sanitizeFilename(altText).substring(0, 30) : '';
        const filename = desc ? `${desc}_${imageId}.${img.ext}` : `${imageId}.${img.ext}`;
        
        folder.file(filename, blob);
        processed++;
        progress.textContent = `Added ${processed}/${images.length} images...`;
        console.log('Added to ZIP:', filename, blob.size, 'bytes');
      }
    }
    
    if (processed === 0) {
      status.textContent = "No valid images to download";
      progress.textContent = "";
      return;
    }
    
    status.textContent = "Generating ZIP file...";
    progress.textContent = "This may take a moment...";
    
    // Generate ZIP file
    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    }, (metadata) => {
      progress.textContent = `Compressing: ${Math.round(metadata.percent)}%`;
    });
    
    console.log('ZIP created:', zipBlob.size, 'bytes');
    
    // Download the ZIP
    const url = URL.createObjectURL(zipBlob);
    const timestamp = new Date().toISOString().split('T')[0];
    
    chrome.downloads.download({
      url,
      filename: `google-sites-images-${timestamp}.zip`,
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error('Download error:', chrome.runtime.lastError);
        status.textContent = "Download failed";
      } else {
        status.textContent = `✓ Downloaded ${processed} images!`;
        console.log('Download started:', downloadId);
      }
      progress.textContent = "";
      setTimeout(() => {
        URL.revokeObjectURL(url);
        status.textContent = "";
      }, 3000);
    });
    
  } catch (err) {
    console.error('Download error:', err);
    status.textContent = "Error: " + err.message;
    progress.textContent = "";
  }
});

document.getElementById("clear").addEventListener("click", async () => {
  const status = document.getElementById("status");
  
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).clear();
    
    req.onsuccess = () => {
      status.textContent = "Cache cleared!";
      updateCount();
      setTimeout(() => status.textContent = "", 3000);
    };
    
    req.onerror = () => {
      status.textContent = "Failed to clear cache";
      setTimeout(() => status.textContent = "", 3000);
    };
  } catch (err) {
    console.error('Clear error:', err);
    status.textContent = "Error clearing cache";
  }
});

updateCount();