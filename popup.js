const DB_NAME = "gs-image-cache";
const STORE = "images";

function openDB() {
  return new Promise(resolve => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onsuccess = () => resolve(req.result);
  });
}

async function updateCount() {
  const db = await openDB();
  const tx = db.transaction(STORE, "readonly");
  const store = tx.objectStore(STORE);
  const req = store.count();

  req.onsuccess = () => {
    document.getElementById("count").textContent =
      `Images cached: ${req.result}`;
  };
}

document.getElementById("download").addEventListener("click", async () => {
  const db = await openDB();
  const tx = db.transaction(STORE, "readonly");
  const store = tx.objectStore(STORE);

  let i = 1;
  store.openCursor().onsuccess = e => {
    const cursor = e.target.result;
    if (!cursor) return;

    const { blob, ext } = cursor.value;
    const url = URL.createObjectURL(blob);

    chrome.downloads.download({
      url,
      filename: `google-site-image-${String(i++).padStart(3, "0")}.${ext}`,
      saveAs: false
    });

    cursor.continue();
  };
});

updateCount();
