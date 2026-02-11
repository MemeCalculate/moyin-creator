// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
import { StorageAdapter } from "./types";

export class IndexedDBAdapter<T> implements StorageAdapter<T> {
  private dbName: string;
  private storeName: string;
  private version: number;

  constructor(dbName: string, storeName: string, version = 1) {
    this.dbName = dbName;
    this.storeName = storeName;
    this.version = version;
  }

  private async getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: "id" });
        }
      };
    });
  }

  async get(key: string): Promise<T | null> {
    const db = await this.getDB();
    try {
      const transaction = db.transaction([this.storeName], "readonly");
      const store = transaction.objectStore(this.storeName);

      return await new Promise((resolve, reject) => {
        const request = store.get(key);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result || null);
      });
    } finally {
      db.close();
    }
  }

  async set(key: string, value: T): Promise<void> {
    const db = await this.getDB();
    try {
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);

      return await new Promise((resolve, reject) => {
        const request = store.put({ id: key, ...value });
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } finally {
      db.close();
    }
  }

  async remove(key: string): Promise<void> {
    const db = await this.getDB();
    try {
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);

      return await new Promise((resolve, reject) => {
        const request = store.delete(key);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } finally {
      db.close();
    }
  }

  async list(): Promise<string[]> {
    const db = await this.getDB();
    try {
      const transaction = db.transaction([this.storeName], "readonly");
      const store = transaction.objectStore(this.storeName);

      return await new Promise((resolve, reject) => {
        const request = store.getAllKeys();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result as string[]);
      });
    } finally {
      db.close();
    }
  }

  async clear(): Promise<void> {
    const db = await this.getDB();
    try {
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);

      return await new Promise((resolve, reject) => {
        const request = store.clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } finally {
      db.close();
    }
  }

  static deleteDatabase(dbName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(dbName);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
      request.onblocked = () => {
        console.warn(`[IndexedDBAdapter] Delete database ${dbName} blocked. Closing connections...`);
        // The delete operation is pending until connections close.
        // We can't force close from here, but this handler indicates we are waiting.
      };
    });
  }
}
