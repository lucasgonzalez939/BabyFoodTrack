/**
 * IndexedDB Wrapper for Baby Food Track
 * Manages feedings and diaper changes with efficient querying
 */

const DB_NAME = 'BabyFoodTrackDB';
const DB_VERSION = 4;

/**
 * Generate a unique record ID based on timestamp + random suffix.
 * Avoids collisions across devices sharing the same profile.
 * Range: safe for BIGINT in Postgres (max ~9e15).
 */
function generateRecordId() {
    return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

function normalizeRecordTime(record) {
    if (!record) record = {};
    let raw = record.time || record.timestamp || record.created_at || record.date;
    let d = raw ? new Date(raw) : new Date();
    if (isNaN(d.getTime())) {
        d = new Date();
    }
    const timeIso = d.toISOString();
    const timestampMs = d.getTime();
    const dateStr = timeIso.split('T')[0];
    const yearMonthStr = dateStr.substring(0, 7);

    return {
        timeIso,
        timestampMs,
        dateStr,
        yearMonthStr
    };
}

// Object store names
const STORES = {
    FEEDINGS: 'feedings',
    DIAPERS: 'diapers',
    MEASUREMENTS: 'measurements',
    MEDICINES: 'medicines',
    TEMPERATURES: 'temperatures',
    APPOINTMENTS: 'appointments',
    JOURNAL: 'journal',
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
                const oldVersion = event.oldVersion;
                const tx = event.target.transaction;
                console.log(`Upgrading database schema from v${oldVersion} to v${DB_VERSION}...`);

                // --- V1/V2/V3: Create stores (original schema) ---
                if (oldVersion < 3) {
                    // Create Feedings object store
                    if (!db.objectStoreNames.contains(STORES.FEEDINGS)) {
                        const feedingStore = db.createObjectStore(STORES.FEEDINGS, {
                            keyPath: 'id',
                            autoIncrement: true
                        });
                        feedingStore.createIndex('timestamp', 'timestamp', { unique: false });
                        feedingStore.createIndex('type', 'type', { unique: false });
                        feedingStore.createIndex('date', 'date', { unique: false });
                        feedingStore.createIndex('yearMonth', 'yearMonth', { unique: false });
                        console.log('Feedings store created');
                    }

                    // Create Diapers object store
                    if (!db.objectStoreNames.contains(STORES.DIAPERS)) {
                        const diaperStore = db.createObjectStore(STORES.DIAPERS, {
                            keyPath: 'id',
                            autoIncrement: true
                        });
                        diaperStore.createIndex('timestamp', 'timestamp', { unique: false });
                        diaperStore.createIndex('date', 'date', { unique: false });
                        diaperStore.createIndex('yearMonth', 'yearMonth', { unique: false });
                        diaperStore.createIndex('hasPee', 'hasPee', { unique: false });
                        diaperStore.createIndex('hasPoop', 'hasPoop', { unique: false });
                        console.log('Diapers store created');
                    }

                    // Create Measurements object store
                    if (!db.objectStoreNames.contains(STORES.MEASUREMENTS)) {
                        const measurementStore = db.createObjectStore(STORES.MEASUREMENTS, {
                            keyPath: 'id',
                            autoIncrement: true
                        });
                        measurementStore.createIndex('timestamp', 'timestamp', { unique: false });
                        measurementStore.createIndex('date', 'date', { unique: false });
                        console.log('Measurements store created');
                    }

                    // Create Medicines object store
                    if (!db.objectStoreNames.contains(STORES.MEDICINES)) {
                        const medicineStore = db.createObjectStore(STORES.MEDICINES, {
                            keyPath: 'id',
                            autoIncrement: true
                        });
                        medicineStore.createIndex('timestamp', 'timestamp', { unique: false });
                        medicineStore.createIndex('date', 'date', { unique: false });
                        medicineStore.createIndex('name', 'name', { unique: false });
                        medicineStore.createIndex('active', 'active', { unique: false });
                        console.log('Medicines store created');
                    }

                    // Create Temperatures object store
                    if (!db.objectStoreNames.contains(STORES.TEMPERATURES)) {
                        const temperatureStore = db.createObjectStore(STORES.TEMPERATURES, {
                            keyPath: 'id',
                            autoIncrement: true
                        });
                        temperatureStore.createIndex('timestamp', 'timestamp', { unique: false });
                        temperatureStore.createIndex('date', 'date', { unique: false });
                        console.log('Temperatures store created');
                    }

                    // Create Appointments object store
                    if (!db.objectStoreNames.contains(STORES.APPOINTMENTS)) {
                        const appointmentStore = db.createObjectStore(STORES.APPOINTMENTS, {
                            keyPath: 'id',
                            autoIncrement: true
                        });
                        appointmentStore.createIndex('timestamp', 'timestamp', { unique: false });
                        appointmentStore.createIndex('date', 'date', { unique: false });
                        appointmentStore.createIndex('type', 'type', { unique: false });
                        console.log('Appointments store created');
                    }

                    // Create Journal object store
                    if (!db.objectStoreNames.contains(STORES.JOURNAL)) {
                        const journalStore = db.createObjectStore(STORES.JOURNAL, {
                            keyPath: 'id',
                            autoIncrement: true
                        });
                        journalStore.createIndex('timestamp', 'timestamp', { unique: false });
                        journalStore.createIndex('date', 'date', { unique: false });
                        journalStore.createIndex('category', 'category', { unique: false });
                        console.log('Journal store created');
                    }

                    // Create Metadata object store
                    if (!db.objectStoreNames.contains(STORES.METADATA)) {
                        db.createObjectStore(STORES.METADATA, { keyPath: 'key' });
                        console.log('Metadata store created');
                    }
                }

                // --- V4: Migrate from autoIncrement to explicit timestamp-based IDs ---
                // We cannot delete+recreate stores inside onupgradeneeded without losing
                // data atomicity. Instead, we re-key records in-place: read each record,
                // assign a new timestamp-based ID if the current one is a low sequential
                // number (< 1_000_000, indicating autoIncrement origin), delete old, insert new.
                //
                // SAFETY: We write a full JSON snapshot to localStorage BEFORE touching
                // any data. If the browser crashes mid-upgrade the user can restore via
                // Settings → Restaurar respaldo local.
                if (oldVersion >= 1 && oldVersion < 4) {
                    const storesToMigrate = [
                        STORES.FEEDINGS, STORES.DIAPERS, STORES.MEASUREMENTS,
                        STORES.MEDICINES, STORES.TEMPERATURES, STORES.APPOINTMENTS,
                        STORES.JOURNAL
                    ];

                    // ---- Pre-upgrade snapshot (synchronous reads inside the upgrade tx) ----
                    const preSnapshot = {
                        version: oldVersion,
                        timestamp: new Date().toISOString(),
                        feedings: [], diapers: [], measurements: [],
                        medicines: [], temperatures: [], appointments: [], journal: []
                    };
                    const storeKeyMap = {
                        [STORES.FEEDINGS]: 'feedings', [STORES.DIAPERS]: 'diapers',
                        [STORES.MEASUREMENTS]: 'measurements', [STORES.MEDICINES]: 'medicines',
                        [STORES.TEMPERATURES]: 'temperatures', [STORES.APPOINTMENTS]: 'appointments',
                        [STORES.JOURNAL]: 'journal'
                    };

                    let snapshotPending = storesToMigrate.length;
                    storesToMigrate.forEach(storeName => {
                        if (!db.objectStoreNames.contains(storeName)) { snapshotPending--; return; }
                        const snapshotStore = tx.objectStore(storeName);
                        const snapReq = snapshotStore.getAll();
                        snapReq.onsuccess = () => {
                            preSnapshot[storeKeyMap[storeName]] = snapReq.result || [];
                            snapshotPending--;
                            if (snapshotPending === 0) {
                                try {
                                    localStorage.setItem('bft_pre_v4_snapshot', JSON.stringify(preSnapshot));
                                    console.log('📸 Pre-V4 snapshot saved to localStorage');
                                } catch (e) {
                                    console.warn('Could not save pre-V4 snapshot (localStorage quota?):', e);
                                }
                            }
                        };
                    });
                    // ---- End snapshot ----

                    storesToMigrate.forEach(storeName => {
                        if (!db.objectStoreNames.contains(storeName)) return;
                        const store = tx.objectStore(storeName);
                        const getAllReq = store.getAll();

                        getAllReq.onsuccess = () => {
                            const records = getAllReq.result;
                            let migratedCount = 0;

                            records.forEach((record, idx) => {
                                // Only re-key low sequential IDs (autoIncrement origin)
                                if (typeof record.id === 'number' && record.id < 1_000_000) {
                                    const oldId = record.id;
                                    // Use timestamp from record + index offset to ensure uniqueness
                                    const baseTime = record.timestamp || record.createdAt || Date.now();
                                    record.id = baseTime * 1000 + idx;
                                    store.delete(oldId);
                                    store.put(record);
                                    migratedCount++;
                                }
                            });

                            if (migratedCount > 0) {
                                console.log(`Migrated ${migratedCount} IDs in ${storeName}`);
                            }
                        };
                    });

                    console.log('V4 ID migration scheduled');
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

    async bulkPutRecords(storeName, recordsArray) {
        await this.ensureInit();
        if (!recordsArray || !Array.isArray(recordsArray) || recordsArray.length === 0) return;

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);

            for (const record of recordsArray) {
                if (!record) continue;
                const { timeIso, timestampMs, dateStr, yearMonthStr } = normalizeRecordTime(record);

                const itemData = {
                    id: record.id || generateRecordId(),
                    ...record,
                    time: record.time || timeIso,
                    timestamp: timestampMs,
                    date: dateStr,
                    yearMonth: yearMonthStr,
                    createdAt: record.createdAt || Date.now()
                };
                itemData.id = itemData.id || generateRecordId();
                store.put(itemData);
            }

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    // ============= FEEDING OPERATIONS =============

    /**
     * Add a new feeding record
     * @param {Object} feeding - Feeding data
     * @returns {Promise<number>} - The ID of the added record
     */
    async addFeeding(feeding) {
        await this.ensureInit();

        const { timeIso, timestampMs, dateStr, yearMonthStr } = normalizeRecordTime(feeding);

        const feedingData = {
            id: feeding.id || generateRecordId(),
            ...feeding,
            time: feeding.time || timeIso,
            timestamp: timestampMs,
            date: dateStr,
            yearMonth: yearMonthStr,
            createdAt: Date.now()
        };
        feedingData.id = feedingData.id || generateRecordId();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.FEEDINGS], 'readwrite');
            const store = transaction.objectStore(STORES.FEEDINGS);
            const request = store.put(feedingData);

            request.onsuccess = () => resolve(feedingData.id);
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

        const { timeIso, timestampMs, dateStr, yearMonthStr } = normalizeRecordTime(diaper);

        const diaperData = {
            id: diaper.id || generateRecordId(),
            ...diaper,
            time: diaper.time || timeIso,
            timestamp: timestampMs,
            date: dateStr,
            yearMonth: yearMonthStr,
            createdAt: Date.now()
        };
        diaperData.id = diaperData.id || generateRecordId();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.DIAPERS], 'readwrite');
            const store = transaction.objectStore(STORES.DIAPERS);
            const request = store.put(diaperData);

            request.onsuccess = () => resolve(diaperData.id);
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

    // ============= MEASUREMENT OPERATIONS =============

    /**
     * Add a new measurement record
     * @param {Object} measurement - Measurement data
     * @returns {Promise<number>} - The ID of the added record
     */
    async addMeasurement(measurement) {
        await this.ensureInit();

        const { timeIso, timestampMs, dateStr } = normalizeRecordTime(measurement);

        const measurementData = {
            id: measurement.id || generateRecordId(),
            ...measurement,
            time: measurement.time || timeIso,
            timestamp: timestampMs,
            date: dateStr,
            createdAt: Date.now()
        };
        measurementData.id = measurementData.id || generateRecordId();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.MEASUREMENTS], 'readwrite');
            const store = transaction.objectStore(STORES.MEASUREMENTS);
            const request = store.put(measurementData);

            request.onsuccess = () => resolve(measurementData.id);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get all measurements
     * @returns {Promise<Array>}
     */
    async getMeasurements() {
        await this.ensureInit();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.MEASUREMENTS], 'readonly');
            const store = transaction.objectStore(STORES.MEASUREMENTS);
            const request = store.getAll();

            request.onsuccess = () => {
                const results = request.result;
                // Sort by timestamp descending
                results.sort((a, b) => b.timestamp - a.timestamp);
                resolve(results);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async updateMeasurement(id, updates) {
        await this.ensureInit();
        return new Promise(async (resolve, reject) => {
            const transaction = this.db.transaction([STORES.MEASUREMENTS], 'readwrite');
            const store = transaction.objectStore(STORES.MEASUREMENTS);
            const getRequest = store.get(id);

            getRequest.onsuccess = () => {
                const item = getRequest.result;
                if (!item) {
                    reject(new Error(`Measurement with id ${id} not found`));
                    return;
                }
                const { timeIso, timestampMs, dateStr } = normalizeRecordTime({ ...item, ...updates });
                const updated = { ...item, ...updates, time: updates.time || item.time || timeIso, timestamp: timestampMs, date: dateStr };
                const putRequest = store.put(updated);
                putRequest.onsuccess = () => resolve();
                putRequest.onerror = () => reject(putRequest.error);
            };
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    /**
     * Delete a measurement record
     * @param {number} id
     * @returns {Promise<void>}
     */
    async deleteMeasurement(id) {
        await this.ensureInit();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.MEASUREMENTS], 'readwrite');
            const store = transaction.objectStore(STORES.MEASUREMENTS);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Delete all measurements
     * @returns {Promise<void>}
     */
    async clearMeasurements() {
        await this.ensureInit();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.MEASUREMENTS], 'readwrite');
            const store = transaction.objectStore(STORES.MEASUREMENTS);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // ============= MEDICINE OPERATIONS =============

    async addMedicine(medicine) {
        await this.ensureInit();
        const { timeIso, timestampMs, dateStr } = normalizeRecordTime(medicine);
        const medicineData = { id: medicine.id || generateRecordId(), ...medicine, time: medicine.time || timeIso, timestamp: timestampMs, date: dateStr, createdAt: Date.now() };
        medicineData.id = medicineData.id || generateRecordId();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.MEDICINES], 'readwrite');
            const store = transaction.objectStore(STORES.MEDICINES);
            const request = store.put(medicineData);
            request.onsuccess = () => resolve(medicineData.id);
            request.onerror = () => reject(request.error);
        });
    }

    async getMedicines() {
        await this.ensureInit();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.MEDICINES], 'readonly');
            const store = transaction.objectStore(STORES.MEDICINES);
            const request = store.getAll();
            request.onsuccess = () => {
                const results = request.result;
                results.sort((a, b) => b.timestamp - a.timestamp);
                resolve(results);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async updateMedicine(id, updates) {
        await this.ensureInit();
        return new Promise(async (resolve, reject) => {
            const transaction = this.db.transaction([STORES.MEDICINES], 'readwrite');
            const store = transaction.objectStore(STORES.MEDICINES);
            const getRequest = store.get(id);
            
            getRequest.onsuccess = () => {
                const medicine = getRequest.result;
                if (!medicine) {
                    reject(new Error(`Medicine with id ${id} not found`));
                    return;
                }
                const { timeIso, timestampMs, dateStr } = normalizeRecordTime({ ...medicine, ...updates });
                const updated = { ...medicine, ...updates, time: updates.time || medicine.time || timeIso, timestamp: timestampMs, date: dateStr };
                const putRequest = store.put(updated);
                putRequest.onsuccess = () => resolve();
                putRequest.onerror = () => reject(putRequest.error);
            };
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    async deleteMedicine(id) {
        await this.ensureInit();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.MEDICINES], 'readwrite');
            const store = transaction.objectStore(STORES.MEDICINES);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async clearMedicines() {
        await this.ensureInit();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.MEDICINES], 'readwrite');
            const store = transaction.objectStore(STORES.MEDICINES);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // ============= TEMPERATURE OPERATIONS =============

    async addTemperature(temperature) {
        await this.ensureInit();
        const { timeIso, timestampMs, dateStr } = normalizeRecordTime(temperature);
        const tempData = { id: temperature.id || generateRecordId(), ...temperature, time: temperature.time || timeIso, timestamp: timestampMs, date: dateStr, createdAt: Date.now() };
        tempData.id = tempData.id || generateRecordId();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.TEMPERATURES], 'readwrite');
            const store = transaction.objectStore(STORES.TEMPERATURES);
            const request = store.put(tempData);
            request.onsuccess = () => resolve(tempData.id);
            request.onerror = () => reject(request.error);
        });
    }

    async getTemperatures() {
        await this.ensureInit();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.TEMPERATURES], 'readonly');
            const store = transaction.objectStore(STORES.TEMPERATURES);
            const request = store.getAll();
            request.onsuccess = () => {
                const results = request.result;
                results.sort((a, b) => b.timestamp - a.timestamp);
                resolve(results);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async deleteTemperature(id) {
        await this.ensureInit();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.TEMPERATURES], 'readwrite');
            const store = transaction.objectStore(STORES.TEMPERATURES);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async clearTemperatures() {
        await this.ensureInit();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.TEMPERATURES], 'readwrite');
            const store = transaction.objectStore(STORES.TEMPERATURES);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // ============= APPOINTMENT OPERATIONS =============

    async addAppointment(appointment) {
        await this.ensureInit();
        const { timeIso, timestampMs, dateStr } = normalizeRecordTime(appointment);
        const apptData = { id: appointment.id || generateRecordId(), ...appointment, time: appointment.time || timeIso, timestamp: timestampMs, date: dateStr, createdAt: Date.now() };
        apptData.id = apptData.id || generateRecordId();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.APPOINTMENTS], 'readwrite');
            const store = transaction.objectStore(STORES.APPOINTMENTS);
            const request = store.put(apptData);
            request.onsuccess = () => resolve(apptData.id);
            request.onerror = () => reject(request.error);
        });
    }

    async getAppointments() {
        await this.ensureInit();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.APPOINTMENTS], 'readonly');
            const store = transaction.objectStore(STORES.APPOINTMENTS);
            const request = store.getAll();
            request.onsuccess = () => {
                const results = request.result;
                results.sort((a, b) => a.timestamp - b.timestamp); // Future first
                resolve(results);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async deleteAppointment(id) {
        await this.ensureInit();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.APPOINTMENTS], 'readwrite');
            const store = transaction.objectStore(STORES.APPOINTMENTS);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async clearAppointments() {
        await this.ensureInit();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.APPOINTMENTS], 'readwrite');
            const store = transaction.objectStore(STORES.APPOINTMENTS);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // ============= JOURNAL OPERATIONS =============

    async addJournalEntry(entry) {
        await this.ensureInit();
        const { timeIso, timestampMs, dateStr } = normalizeRecordTime(entry);
        const entryData = { id: entry.id || generateRecordId(), ...entry, time: entry.time || timeIso, timestamp: timestampMs, date: dateStr, createdAt: Date.now() };
        entryData.id = entryData.id || generateRecordId();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.JOURNAL], 'readwrite');
            const store = transaction.objectStore(STORES.JOURNAL);
            const request = store.put(entryData);
            request.onsuccess = () => resolve(entryData.id);
            request.onerror = () => reject(request.error);
        });
    }

    async getJournalEntries() {
        await this.ensureInit();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.JOURNAL], 'readonly');
            const store = transaction.objectStore(STORES.JOURNAL);
            const request = store.getAll();
            request.onsuccess = () => {
                const results = request.result;
                results.sort((a, b) => b.timestamp - a.timestamp);
                resolve(results);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async deleteJournalEntry(id) {
        await this.ensureInit();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.JOURNAL], 'readwrite');
            const store = transaction.objectStore(STORES.JOURNAL);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async clearJournalEntries() {
        await this.ensureInit();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.JOURNAL], 'readwrite');
            const store = transaction.objectStore(STORES.JOURNAL);
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
            this.clearDiapers(),
            this.clearMeasurements(),
            this.clearMedicines(),
            this.clearTemperatures(),
            this.clearAppointments(),
            this.clearJournalEntries()
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

    // ============= GENERIC RECORD OPERATIONS (for sync) =============

    /**
     * Upsert a record into any store (used by realtime sync).
     * If a record with the same id exists, it is replaced.
     * @param {string} storeName - One of STORES values
     * @param {Object} record - Record data (must include id)
     * @returns {Promise<void>}
     */
    async upsertRecord(storeName, record) {
        await this.ensureInit();
        if (!record || !record.id) throw new Error('Record must have an id');

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(record);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get a single record by id from any store.
     * @param {string} storeName
     * @param {number} id
     * @returns {Promise<Object|undefined>}
     */
    async getRecordById(storeName, id) {
        await this.ensureInit();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Delete a record by id from any store.
     * @param {string} storeName
     * @param {number} id
     * @returns {Promise<void>}
     */
    async deleteRecordById(storeName, id) {
        await this.ensureInit();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // ============= SNAPSHOT & ROLLBACK (safe migrations) =============

    /**
     * Export a full in-memory snapshot of all stores.
     * Stored in localStorage under 'bft_idb_snapshot' so it survives a
     * page reload and can be used to roll back a failed migration.
     * @returns {Promise<Object>} snapshot object
     */
    async snapshotAllData() {
        await this.ensureInit();

        const snapshot = {
            version: DB_VERSION,
            timestamp: new Date().toISOString(),
            feedings: await this.getFeedings(),
            diapers: await this.getDiapers(),
            measurements: await this.getMeasurements(),
            medicines: await this.getMedicines(),
            temperatures: await this.getTemperatures(),
            appointments: await this.getAppointments(),
            journal: await this.getJournalEntries()
        };

        try {
            localStorage.setItem('bft_idb_snapshot', JSON.stringify(snapshot));
            console.log(`📸 IDB snapshot saved: ${new Date(snapshot.timestamp).toLocaleString()} (${Object.values(snapshot).filter(Array.isArray).reduce((s, a) => s + a.length, 0)} records)`);
        } catch (e) {
            // localStorage quota — snapshot is still returned in-memory
            console.warn('Could not persist snapshot to localStorage (quota?). In-memory only.', e);
        }

        return snapshot;
    }

    /**
     * Restore IndexedDB from a previously saved snapshot.
     * Clears all stores and rewrites from the snapshot object.
     * @param {Object} [snapshot] - If omitted, reads from localStorage.
     * @returns {Promise<{restored: number}>}
     */
    async restoreSnapshot(snapshot) {
        await this.ensureInit();

        if (!snapshot) {
            const raw = localStorage.getItem('bft_idb_snapshot');
            if (!raw) throw new Error('No snapshot found in localStorage');
            snapshot = JSON.parse(raw);
        }

        // Wipe existing data
        await this.clearAllData();

        let restored = 0;
        const add = async (items, addFn) => {
            for (const item of (items || [])) {
                try { await addFn(item); restored++; } catch (e) {
                    console.warn('restoreSnapshot: skipped record', item, e);
                }
            }
        };

        await add(snapshot.feedings,     (r) => this.addFeeding(r));
        await add(snapshot.diapers,      (r) => this.addDiaper(r));
        await add(snapshot.measurements, (r) => this.addMeasurement(r));
        await add(snapshot.medicines,    (r) => this.addMedicine(r));
        await add(snapshot.temperatures, (r) => this.addTemperature(r));
        await add(snapshot.appointments, (r) => this.addAppointment(r));
        await add(snapshot.journal,      (r) => this.addJournalEntry(r));

        console.log(`✅ IDB restored from snapshot (${restored} records, taken ${snapshot.timestamp})`);
        return { restored, timestamp: snapshot.timestamp };
    }

    /**
     * Check whether a saved snapshot exists in localStorage.
     * @returns {{ exists: boolean, timestamp: string|null, recordCount: number }}
     */
    getSnapshotInfo() {
        const raw = localStorage.getItem('bft_idb_snapshot');
        if (!raw) return { exists: false, timestamp: null, recordCount: 0 };
        try {
            const s = JSON.parse(raw);
            const count = ['feedings','diapers','measurements','medicines','temperatures','appointments','journal']
                .reduce((acc, k) => acc + (Array.isArray(s[k]) ? s[k].length : 0), 0);
            return { exists: true, timestamp: s.timestamp, recordCount: count };
        } catch {
            return { exists: false, timestamp: null, recordCount: 0 };
        }
    }

    /** Remove the persisted snapshot once it is no longer needed. */
    clearSnapshot() {
        localStorage.removeItem('bft_idb_snapshot');
        console.log('🗑️ IDB snapshot cleared');
    }
}

// Create singleton instance
const db = new BabyFoodDB();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { db, BabyFoodDB, STORES, generateRecordId };
}
