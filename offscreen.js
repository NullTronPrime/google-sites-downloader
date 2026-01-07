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
    cacheImage(msg.data);
  } else if (msg.type === 'DB_OPERATION') {
    handleDBOperation(msg.operation, msg.data).then(sendResponse);
    return true; // Keep channel open
  }
});

async function cacheImage({ url, hash, arrayBuffer, mimeType, ext, metadata }) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, "readwrite");
    // Store as arrayBuffer to preserve binary data
    await tx.objectStore(STORE).put({ 
      hash, 
      arrayBuffer, 
      mimeType,
      ext,
      metadata
    });
  } catch (err) {
    console.error('Cache error:', err);
  }
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
          // Convert arrayBuffers back to base64 for message passing
          const images = req.result.map(img => ({
            hash: img.hash,
            base64: arrayBufferToBase64(img.arrayBuffer),
            mimeType: img.mimeType,
            ext: img.ext,
            metadata: img.metadata || {}
          }));
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

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
