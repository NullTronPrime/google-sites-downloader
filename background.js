let offscreenCreated = false;

async function createOffscreen() {
  if (offscreenCreated) return;
  
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['LOCAL_STORAGE'],
      justification: 'Access IndexedDB for image caching'
    });
    offscreenCreated = true;
    console.log('Offscreen document created');
    
    // Wait a bit for it to initialize
    await new Promise(resolve => setTimeout(resolve, 100));
  } catch (err) {
    if (err.message.includes('Only a single offscreen')) {
      offscreenCreated = true;
      console.log('Offscreen document already exists');
    } else {
      console.error('Error creating offscreen document:', err);
    }
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'CACHE_IMAGE') {
    createOffscreen().then(() => {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Failed to cache:', chrome.runtime.lastError.message);
        }
      });
    });
    return false;
  } 
  
  if (msg.type === 'DB_OPERATION') {
    createOffscreen().then(() => {
      chrome.runtime.sendMessage(msg, response => {
        if (chrome.runtime.lastError) {
          console.error('DB operation failed:', chrome.runtime.lastError.message);
          sendResponse({ success: false });
        } else {
          sendResponse(response);
        }
      });
    });
    return true; // Keep channel open for async response
  }
  
  return false;
});