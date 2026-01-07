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
  } catch (err) {
    if (!err.message.includes('Only a single offscreen')) {
      console.error('Error creating offscreen document:', err);
    }
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'CACHE_IMAGE') {
    createOffscreen().then(() => {
      chrome.runtime.sendMessage(msg);
    });
  } else if (msg.type === 'DB_OPERATION') {
    createOffscreen().then(() => {
      chrome.runtime.sendMessage(msg, response => {
        sendResponse(response);
      });
    });
    return true; // Keep channel open for async response
  }
});
