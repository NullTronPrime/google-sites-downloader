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
    
    // Wait for it to initialize
    await new Promise(resolve => setTimeout(resolve, 200));
  } catch (err) {
    if (err.message.includes('Only a single offscreen')) {
      offscreenCreated = true;
    } else {
      console.error('Error creating offscreen document:', err);
    }
  }
}

// Initialize offscreen document on startup
createOffscreen();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Messages FROM content script - forward to offscreen
  if (sender.tab && (msg.type === 'CACHE_IMAGE' || msg.type === 'DB_OPERATION')) {
    handleContentMessage(msg, sendResponse);
    return true; // Keep channel open
  }
  
  // Messages FROM offscreen - forward to popup
  if (!sender.tab && (msg.type === 'CACHE_IMAGE' || msg.type === 'DB_OPERATION')) {
    // This is a response from offscreen, ignore (already handled)
    return false;
  }
  
  return false;
});

async function handleContentMessage(msg, sendResponse) {
  try {
    await createOffscreen();
    
    // Forward to offscreen and wait for response
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Offscreen error:', chrome.runtime.lastError.message);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse(response || { success: false });
      }
    });
  } catch (err) {
    console.error('Handler error:', err);
    sendResponse({ success: false, error: err.message });
  }
}