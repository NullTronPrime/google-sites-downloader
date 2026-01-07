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
    cacheImage(msg.data).then(() => {
      sendResponse({ success: true });
    }).catch(err => {
      console.error('Cache error:', err);
      sendResponse({ success: false });
    });
    return true;
  } else if (msg.type === 'DB_OPERATION') {
    handleDBOperation(msg.operation, msg.data).then(sendResponse);
    return true;
  }
});

async function cacheImage({ hash, arrayBuffer, mimeType, ext, metadata }) {
  const db = await openDB();
  const tx = db.transaction(STORE, "readwrite");
  
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(STORE).put({ 
      hash, 
      arrayBuffer, 
      mimeType,
      ext,
      metadata
    });
    req.onsuccess = () => {
      console.log('Stored in DB:', hash.substring(0, 8));
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

async function handleDBOperation(operation, data) {
  try {
    const db = await openDB();
    
    if (operation === 'count') {
      return new Promise((resolve) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).count();
        req.onsuccess = () => resolve({ success: true, count: req.result });
        req.onerror = () => resolve({ success: false, count: 0 });
      });
    }
    
    if (operation === 'getAll') {
      return new Promise((resolve) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).getAll();
        req.onsuccess = () => {
          console.log('Retrieved from DB:', req.result.length, 'images');
          
          // Convert arrayBuffers back to base64 - THIS WAS THE BUG
          const images = req.result.map(img => {
            const base64 = arrayBufferToBase64(img.arrayBuffer);
            console.log('Converted image:', img.hash.substring(0, 8), 'base64 length:', base64.length);
            return {
              hash: img.hash,
              base64,
              mimeType: img.mimeType,
              ext: img.ext,
              metadata: img.metadata || {}
            };
          });
          resolve({ success: true, images });
        };
        req.onerror = () => resolve({ success: false, images: [] });
      });
    }
    
    if (operation === 'clear') {
      return new Promise((resolve) => {
        const tx = db.transaction(STORE, "readwrite");
        const req = tx.objectStore(STORE).clear();
        req.onsuccess = () => resolve({ success: true });
        req.onerror = () => resolve({ success: false });
      });
    }
  } catch (err) {
    console.error('DB operation error:', err);
    return { success: false, error: err.message };
  }
}

// FIX: Process in chunks to avoid call stack exceeded
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 32768; // 32KB chunks
  let binary = '';
  
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    // Use apply with spread to avoid call stack issues
    binary += String.fromCharCode(...chunk);
  }
  
  return btoa(binary);
}

console.log('Offscreen document loaded');