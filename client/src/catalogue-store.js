// Asynchronous storage keeps the large catalogue off the synchronous render path.
function openStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('kids-cinema-library', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('catalogues');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Catalogue storage is busy'));
  });
}

export async function readCatalogue(key) {
  let db;
  try {
    db = await openStore();
    return await new Promise(resolve => {
      const request = db.transaction('catalogues').objectStore('catalogues').get(key);
      request.onsuccess = () => resolve(request.result?.payload?.videos ? request.result : null);
      request.onerror = () => resolve(null);
    });
  } catch { return null; } finally { db?.close(); }
}

export async function saveCatalogue(key, snapshot) {
  let db;
  try {
    db = await openStore();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('catalogues', 'readwrite');
      transaction.objectStore('catalogues').put(snapshot, key);
      transaction.oncomplete = resolve;
      transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
  } catch { /* Browsing still works when device storage is unavailable. */ }
  finally { db?.close(); }
}
