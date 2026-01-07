async function dbOperation(operation, data = null) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'DB_OPERATION', operation, data },
      response => resolve(response || { success: false })
    );
  });
}

async function updateCount() {
  const result = await dbOperation('count');
  const count = result.success ? result.count : 0;
  document.getElementById("count").textContent = `Images cached: ${count}`;
}

function base64ToBlob(base64, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

document.getElementById("download").addEventListener("click", async () => {
  const status = document.getElementById("status");
  status.textContent = "Preparing download...";
  
  const result = await dbOperation('getAll');
  
  if (!result.success || !result.images || result.images.length === 0) {
    status.textContent = "No images found. Visit a Google Site first.";
    return;
  }
  
  let i = 1;
  for (const { base64, mimeType, ext, metadata } of result.images) {
    // Convert base64 back to blob
    const blob = base64ToBlob(base64, mimeType);
    const url = URL.createObjectURL(blob);
    
    // Use page title and image ID for better filename
    const pageSlug = metadata?.pageTitle 
      ? metadata.pageTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 30)
      : 'google-site';
    const imageId = metadata?.imageId?.substring(0, 8) || String(i).padStart(3, "0");
    
    await chrome.downloads.download({
      url,
      filename: `${pageSlug}-${imageId}.${ext}`,
      saveAs: false
    });
    
    // Clean up blob URL after download starts
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    i++;
  }
  
  status.textContent = `Started downloading ${result.images.length} images!`;
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