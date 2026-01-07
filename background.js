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
    await new Promise(resolve => setTimeout(resolve, 100));
  } catch (err) {
    if (err.message.includes('Only a single offscreen')) {
      offscreenCreated = true;
    }
  }
}

createOffscreen();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'CACHE_IMAGE' && sender.tab) {
    createOffscreen().then(() => {
      chrome.runtime.sendMessage(msg, (response) => {
        sendResponse(response || { success: true });
      });
    });
    return true;
  }
  return false;
});