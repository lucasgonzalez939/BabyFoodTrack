/**
 * IndexedDB Wrapper for Baby Food Track
 * Manages feedings and diaper changes with efficient querying
 */

const DB_NAME = 'BabyFoodTrackDB';
const DB_VERSION = 1;

// Object store names
const STORES = {
    FEEDINGS: 'feedings',
    DIAPERS: 'diapers',
    METADATA: 'metadata'
};

class BabyFoodDB {
    constructor() {
        this.db = null;
        this.isReady = false;
    }

    /**
     * Initialize the database connection
     * @returns {Promise<IDBDatabase>}
     */
    async init() {
        if (this.db) {
            return this.db;
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('Database failed to open:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                this.isReady = true;
                console.log('Database opened successfully');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                console.log('Upgrading database schema...');

                // Create Feedings object store
                if (!db.objectStoreNames.contains(STORES.FEEDINGS)) {
                    const feedingStore = db.createObjectStore(STORES.FEEDINGS, {
                        keyPath: 'id',
                        autoIncrement: true
                    });

                    // Indexes for efficient querying
                    feedingStore.createIndex('timestamp', 'timestamp', { unique: false });
                    feedingStore.createIndex('type', 'type', { unique: false });
                    feedingStore.createIndex('date', 'date', { unique: false }); // YYYY-MM-DD for day queries
                    feedingStore.createIndex('yearMonth', 'yearMonth', { unique: false }); // YYYY-MM for month queries
                    
                    console.log('Feedings store created');
                }

                // Create Diapers object store
                if (!db.objectStoreNames.contains(STORES.DIAPERS)) {
                    const diaperStore = db.createObjectStore(STORES.DIAPERS, {
                        keyPath: 'id',
                        autoIncrement: true
                    });

                    // Indexes for efficient querying
                    diaperStore.createIndex('timestamp', 'timestamp', { unique: false });
                    diaperStore.createIndex('date', 'date', { unique: false });
                    diaperStore.createIndex('yearMonth', 'yearMonth', { unique: false });
                    diaperStore.createIndex('hasPee', 'hasPee', { unique: false });
                    diaperStore.createIndex('hasPoop', 'hasPoop', { unique: false });
                    
                    console.log('Diapers store created');
                }

                // Create Metadata object store (for app settings, migration status, etc.)
                if (!db.objectStoreNames.contains(STORES.METADATA)) {
                    const metadataStore = db.createObjectStore(STORES.METADATA, {
                        keyPath: 'key'
                    });
                    
                    console.log('Metadata store created');
                }
            };
        });
    }

    /**
     * Ensure database is initialized before operations
     */
    async ensureInit() {
        if (!this.isReady) {
            await this.init();
        }
    }

    // ============= FEEDING OPERATIONS =============

    /**
     * Add a new feeding record
     * @param {Object} feeding - Feeding data
     * @returns {Promise<number>} - The ID of the added record
     */
    async addFeeding(feeding) {
        await this.ensureInit();

        // Add computed fields for indexing
        const timestamp = new Date(feeding.time).getTime();
        const date = new Date(feeding.time).toISOString().split('T')[0];
        const yearMonth = date.substring(0, 7);

        const feedingData = {
            ...feeding,
            timestamp,
            date,
            yearMonth,
            createdAt: Date.now()
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.FEEDINGS], 'readwrite');
            const store = transaction.objectStore(STORES.FEEDINGS);
            const request = store.add(feedingData);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get all feedings
     * @param {Object} options - Query options
     * @returns {Promise<Array>}
     */
    async getFeedings(options = {}) {
        await this.ensureInit();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.FEEDINGS], 'readonly');
            const store = transaction.objectStore(STORES.FEEDINGS);
            
            let request;

            // Query by date range if specified
            if (options.startDate && options.endDate) {
                const index = store.index('timestamp');
                const range = IDBKeyRange.bound(
                    new Date(options.startDate).getTime(),
                    new Date(options.endDate).getTime()
                );
                request = index.getAll(range);
            } else if (options.date) {
                // Query by specific date
                const index = store.index('date');
                request = index.getAll(options.date);
            } else if (options.yearMonth) {
                // Query by year-month
                const index = store.index('yearMonth');
                request = index.getAll(options.yearMonth);
            } else {
                // Get all
                request = store.getAll();
            }

            request.onsuccess = () => {
                let results = request.result;

                // Filter by type if specified
                if (options.type) {
                    results = results.filter(f => f.type === options.type);
                }

                // Sort by timestamp (newest first by default)
                results.sort((a, b) => {
                    return options.ascending ? a.timestamp - b.timestamp : b.timestamp - a.timestamp;
                });

                // Limit results if specified
                if (options.limit) {
                    results = results.slice(0, options.limit);
                }

                resolve(results);
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get a single feeding by ID
     * @param {number} id
     * @returns {Promise<Object>}
     */
    async getFeeding(id) {
        await this.ensureInit();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.FEEDINGS], 'readonly');
            const store = transaction.objectStore(STORES.FEEDINGS);
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Update a feeding record
     * @param {number} id
     * @param {Object} updates
     * @returns {Promise<void>}
     */
    async updateFeeding(id, updates) {
        await this.ensureInit();

        const feeding = await this.getFeeding(id);
        if (!feeding) {
            throw new Error(`Feeding with id ${id} not found`);
        }

        // Recalculate indexed fields if time changed
        if (updates.time) {
            updates.timestamp = new Date(updates.time).getTime();
            updates.date = new Date(updates.time).toISOString().split('T')[0];
            updates.yearMonth = updates.date.substring(0, 7);
        }

        const updatedFeeding = { ...feeding, ...updates };

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.FEEDINGS], 'readwrite');
            const store = transaction.objectStore(STORES.FEEDINGS);
            const request = store.put(updatedFeeding);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Delete a feeding record
     * @param {number} id
     * @returns {Promise<void>}
     */
    async deleteFeeding(id) {
        await this.ensureInit();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.FEEDINGS], 'readwrite');
            const store = transaction.objectStore(STORES.FEEDINGS);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Delete all feedings
     * @returns {Promise<void>}
     */
    async clearFeedings() {
        await this.ensureInit();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.FEEDINGS], 'readwrite');
            const store = transaction.objectStore(STORES.FEEDINGS);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // ============= DIAPER OPERATIONS =============

    /**
     * Add a new diaper change record
     * @param {Object} diaper - Diaper data
     * @returns {Promise<number>} - The ID of the added record
     */
    async addDiaper(diaper) {
        await this.ensureInit();

        // Add computed fields for indexing
        const timestamp = new Date(diaper.time).getTime();
        const date = new Date(diaper.time).toISOString().split('T')[0];
        const yearMonth = date.substring(0, 7);

        const diaperData = {
            ...diaper,
            timestamp,
            date,
            yearMonth,
            createdAt: Date.now()
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.DIAPERS], 'readwrite');
            const store = transaction.objectStore(STORES.DIAPERS);
            const request = store.add(diaperData);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get all diapers
     * @param {Object} options - Query options
     * @returns {Promise<Array>}
     */
    async getDiapers(options = {}) {
        await this.ensureInit();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.DIAPERS], 'readonly');
            const store = transaction.objectStore(STORES.DIAPERS);
            
            let request;

            // Query by date range if specified
            if (options.startDate && options.endDate) {
                const index = store.index('timestamp');
                const range = IDBKeyRange.bound(
                    new Date(options.startDate).getTime(),
                    new Date(options.endDate).getTime()
                );
                request = index.getAll(range);
            } else if (options.date) {
                // Query by specific date
                const index = store.index('date');
                request = index.getAll(options.date);
            } else if (options.yearMonth) {
                // Query by year-month
                const index = store.index('yearMonth');
                request = index.getAll(options.yearMonth);
            } else {
                // Get all
                request = store.getAll();
            }

            request.onsuccess = () => {
                let results = request.result;

                // Filter by type if specified
                if (options.hasPee !== undefined) {
                    results = results.filter(d => d.hasPee === options.hasPee);
                }
                if (options.hasPoop !== undefined) {
                    results = results.filter(d => d.hasPoop === options.hasPoop);
                }

                // Sort by timestamp (newest first by default)
                results.sort((a, b) => {
                    return options.ascending ? a.timestamp - b.timestamp : b.timestamp - a.timestamp;
                });

                // Limit results if specified
                if (options.limit) {
                    results = results.slice(0, options.limit);
                }

                resolve(results);
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Delete a diaper record
     * @param {number} id
     * @returns {Promise<void>}
     */
    async deleteDiaper(id) {
        await this.ensureInit();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.DIAPERS], 'readwrite');
            const store = transaction.objectStore(STORES.DIAPERS);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Delete all diapers
     * @returns {Promise<void>}
     */
    async clearDiapers() {
        await this.ensureInit();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.DIAPERS], 'readwrite');
            const store = transaction.objectStore(STORES.DIAPERS);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // ============= METADATA OPERATIONS =============

    /**
     * Set a metadata value
     * @param {string} key
     * @param {any} value
     * @returns {Promise<void>}
     */
    async setMetadata(key, value) {
        await this.ensureInit();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.METADATA], 'readwrite');
            const store = transaction.objectStore(STORES.METADATA);
            const request = store.put({ key, value, updatedAt: Date.now() });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get a metadata value
     * @param {string} key
     * @returns {Promise<any>}
     */
    async getMetadata(key) {
        await this.ensureInit();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.METADATA], 'readonly');
            const store = transaction.objectStore(STORES.METADATA);
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result ? request.result.value : null);
            request.onerror = () => reject(request.error);
        });
    }

    // ============= UTILITY OPERATIONS =============

    /**
     * Clear all data from the database
     * @returns {Promise<void>}
     */
    async clearAllData() {
        await this.ensureInit();

        await Promise.all([
            this.clearFeedings(),
            this.clearDiapers()
        ]);
    }

    /**
     * Close the database connection
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
            this.isReady = false;
        }
    }
}

// Create singleton instance
const db = new BabyFoodDB();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { db, BabyFoodDB, STORES };
}
