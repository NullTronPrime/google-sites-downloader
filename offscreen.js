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
  
  if (msg.type === 'DB_OPERATION') {
    handleDBOperation(msg.operation, msg.data)
      .then(sendResponse)
      .catch(err => {
        console.error('DB operation error:', err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }
  
  return false;
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
      console.log('✓ Stored:', hash.substring(0, 8), arrayBuffer.byteLength, 'bytes');
      resolve({ success: true });
    };
    req.onerror = () => {
      console.error('✗ Store failed:', req.error);
      reject(req.error);
    };
  });
}

async function handleDBOperation(operation, data) {
  const db = await openDB();
  
  if (operation === 'count') {
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).count();
      req.onsuccess = () => {
        console.log('Count:', req.result);
        resolve({ success: true, count: req.result });
      };
      req.onerror = () => resolve({ success: false, count: 0 });
    });
  }
  
  if (operation === 'getAll') {
    return new Promise(async (resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      
      req.onsuccess = async () => {
        console.log('Retrieved from DB:', req.result.length, 'images');
        
        try {
          const images = [];
          
          // Convert each image to base64
          for (const img of req.result) {
            if (!img.arrayBuffer || img.arrayBuffer.byteLength === 0) {
              console.error('Empty arrayBuffer for:', img.hash.substring(0, 8));
              continue;
            }
            
            try {
              const base64 = await arrayBufferToBase64(img.arrayBuffer);
              if (!base64 || base64.length === 0) {
                console.error('Failed to convert to base64:', img.hash.substring(0, 8));
                continue;
              }
              
              console.log('✓ Converted:', img.hash.substring(0, 8), 
                         'arrayBuffer:', img.arrayBuffer.byteLength, 
                         'base64:', base64.length);
              
              images.push({
                hash: img.hash,
                base64,
                mimeType: img.mimeType,
                ext: img.ext,
                metadata: img.metadata || {}
              });
            } catch (convErr) {
              console.error('Conversion failed for', img.hash.substring(0, 8), convErr);
            }
          }
          
          resolve({ success: true, images });
        } catch (err) {
          console.error('Conversion error:', err);
          resolve({ success: false, images: [], error: err.message });
        }
      };
      
      req.onerror = () => {
        console.error('DB getAll error:', req.error);
        resolve({ success: false, images: [] });
      };
    });
  }
  
  if (operation === 'clear') {
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      const req = tx.objectStore(STORE).clear();
      req.onsuccess = () => {
        console.log('Cache cleared');
        resolve({ success: true });
      };
      req.onerror = () => resolve({ success: false });
    });
  }
  
  return { success: false, error: 'Unknown operation' };
}

// Use FileReader for reliable base64 conversion
async function arrayBufferToBase64(arrayBuffer) {
  return new Promise((resolve, reject) => {
    try {
      const blob = new Blob([arrayBuffer]);
      const reader = new FileReader();
      
      reader.onloadend = () => {
        if (reader.result && reader.result.includes(',')) {
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        } else {
          console.error('Invalid FileReader result');
          resolve('');
        }
      };
      
      reader.onerror = () => {
        console.error('FileReader error:', reader.error);
        resolve('');
      };
      
      reader.readAsDataURL(blob);
    } catch (err) {
      console.error('Base64 conversion error:', err);
      resolve('');
    }
  });
}

console.log('Offscreen document loaded');