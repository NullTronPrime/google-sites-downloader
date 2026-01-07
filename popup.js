async function dbOperation(operation, data = null) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'DB_OPERATION', operation, data },
      response => {
        if (chrome.runtime.lastError) {
          console.error('DB operation error:', chrome.runtime.lastError);
        }
        resolve(response || { success: false });
      }
    );
  });
}

async function updateCount() {
  const result = await dbOperation('count');
  const count = result.success ? result.count : 0;
  document.getElementById("count").textContent = `Images cached: ${count}`;
}

function base64ToBlob(base64, mimeType) {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType });
    console.log('Created blob:', blob.size, 'bytes, type:', mimeType);
    return blob;
  } catch (err) {
    console.error('Failed to create blob:', err);
    return null;
  }
}

document.getElementById("download").addEventListener("click", async () => {
  const status = document.getElementById("status");
  status.textContent = "Preparing download...";
  
  const result = await dbOperation('getAll');
  console.log('getAll result:', result);
  
  if (!result.success || !result.images || result.images.length === 0) {
    status.textContent = "No images found. Visit a Google Site first.";
    return;
  }
  
  let i = 1;
  let successCount = 0;
  
  for (const { base64, mimeType, ext, metadata } of result.images) {
    console.log('Processing image', i, '- base64 length:', base64?.length, 'mime:', mimeType);
    
    if (!base64 || base64.length === 0) {
      console.error('Empty base64 for image', i);
      i++;
      continue;
    }
    
    const blob = base64ToBlob(base64, mimeType);
    if (!blob || blob.size === 0) {
      console.error('Failed to create blob or blob is 0 bytes for image', i);
      i++;
      continue;
    }
    
    const url = URL.createObjectURL(blob);
    
    const pageSlug = metadata?.pageTitle 
      ? metadata.pageTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 30)
      : 'google-site';
    const imageId = metadata?.imageId?.substring(0, 8) || String(i).padStart(3, "0");
    
    try {
      await chrome.downloads.download({
        url,
        filename: `${pageSlug}-${imageId}.${ext}`,
        saveAs: false
      });
      console.log('Downloaded:', `${pageSlug}-${imageId}.${ext}`);
      successCount++;
    } catch (err) {
      console.error('Download failed:', err);
    }
    
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    i++;
  }
  
  status.textContent = `Downloaded ${successCount}/${result.images.length} images!`;
  setTimeout(() => status.textContent = "", 3000);
});

document.getElementById("clear").addEventListener("click", async () => {
  const status = document.getElementById("status");
  const result = await dbOperation('clear');
  
  if (result.success) {
    status.textContent = "Cache cleared!";
    updateCount();
  } else {
    status.textContent = "Failed to clear cache.";
  }
  
  setTimeout(() => status.textContent = "", 3000);
});

updateCount();