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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'CACHE_IMAGE') {
    cacheImage(msg.data).then((result) => {
      sendResponse(result || { success: true });
    }).catch(err => {
      console.error('Cache error:', err);
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
  return false;
});

async function cacheImage({ hash, base64, mimeType, ext, metadata }) {
  const db = await openDB();
  const tx = db.transaction(STORE, "readwrite");
  
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(STORE).put({ 
      hash,
      base64,  // Store base64 string
      mimeType,
      ext,
      metadata
    });
    
    req.onsuccess = () => {
      console.log('✓ Stored:', hash.substring(0, 8), 'base64 length:', base64.length);
      resolve({ success: true });
    };
    req.onerror = () => {
      console.error('✗ Store failed:', req.error);
      reject(req.error);
    };
  });
}

console.log('Offscreen document loaded');