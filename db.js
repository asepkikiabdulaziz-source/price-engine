// Database Logic using Dexie.js
import Dexie from 'https://cdn.jsdelivr.net/npm/dexie@3.2.4/dist/dexie.mjs';

// Initialize Dexie database
const db = new Dexie('PriceEngineDB');

// Define database schema
db.version(1).stores({
    prices: '++id, name, price, category, createdAt, updatedAt',
    syncQueue: '++id, action, data, timestamp'
});

// Initialize database
export async function initDB() {
    try {
        await db.open();
        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Database initialization error:', error);
        throw error;
    }
}

// Price operations
export async function addPrice(priceData) {
    try {
        const data = {
            ...priceData,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        const id = await db.prices.add(data);
        return id;
    } catch (error) {
        console.error('Error adding price:', error);
        throw error;
    }
}

export async function getAllPrices() {
    try {
        const prices = await db.prices.toArray();
        return prices;
    } catch (error) {
        console.error('Error getting prices:', error);
        throw error;
    }
}

export async function getPriceById(id) {
    try {
        const price = await db.prices.get(id);
        return price;
    } catch (error) {
        console.error('Error getting price:', error);
        throw error;
    }
}

export async function updatePrice(id, priceData) {
    try {
        const data = {
            ...priceData,
            updatedAt: new Date()
        };
        await db.prices.update(id, data);
        return id;
    } catch (error) {
        console.error('Error updating price:', error);
        throw error;
    }
}

export async function deletePrice(id) {
    try {
        await db.prices.delete(id);
        return id;
    } catch (error) {
        console.error('Error deleting price:', error);
        throw error;
    }
}

// Sync queue operations (for offline sync)
export async function addToSyncQueue(action, data) {
    try {
        await db.syncQueue.add({
            action,
            data,
            timestamp: new Date()
        });
    } catch (error) {
        console.error('Error adding to sync queue:', error);
        throw error;
    }
}

export async function getSyncQueue() {
    try {
        const queue = await db.syncQueue.toArray();
        return queue;
    } catch (error) {
        console.error('Error getting sync queue:', error);
        throw error;
    }
}

export async function clearSyncQueueItem(id) {
    try {
        await db.syncQueue.delete(id);
    } catch (error) {
        console.error('Error clearing sync queue item:', error);
        throw error;
    }
}

// Export db instance for advanced operations
export { db };

