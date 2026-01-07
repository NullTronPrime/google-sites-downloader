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

document.getElementById("download").addEventListener("click", async () => {
  const status = document.getElementById("status");
  status.textContent = "Preparing download...";
  
  const result = await dbOperation('getAll');
  
  if (!result.success || !result.images || result.images.length === 0) {
    status.textContent = "No images found. Visit a Google Site first.";
    return;
  }
  
  let i = 1;
  for (const { blob, ext } of result.images) {
    const url = URL.createObjectURL(blob);
    
    await chrome.downloads.download({
      url,
      filename: `google-site-image-${String(i++).padStart(3, "0")}.${ext}`,
      saveAs: false
    });
    
    // Clean up blob URL after download starts
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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