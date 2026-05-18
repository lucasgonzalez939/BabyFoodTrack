/**
 * Simple Migration Utility
 * Migrates data from localStorage to IndexedDB on first load
 */

class StorageMigration {
    constructor(database) {
        this.db = database;
        this.migrationKey = 'migrated_to_indexeddb_v1';
        this.backupKey = 'localStorage_backup';
    }

    /**
     * Check if migration has already been completed
     */
    hasMigrated() {
        return localStorage.getItem(this.migrationKey) === 'true';
    }

    /**
     * Check if localStorage has data to migrate
     */
    hasLocalStorageData() {
        const feedings = localStorage.getItem('feedings');
        const diapers = localStorage.getItem('diapers');
        const measurements = localStorage.getItem('measurements');
        const medicines = localStorage.getItem('medicines');
        const temperatures = localStorage.getItem('temperatures');
        const appointments = localStorage.getItem('appointments');
        const journalEntries = localStorage.getItem('journalEntries');

        return (
            (feedings && feedings !== '[]') ||
            (diapers && diapers !== '[]') ||
            (measurements && measurements !== '[]') ||
            (medicines && medicines !== '[]') ||
            (temperatures && temperatures !== '[]') ||
            (appointments && appointments !== '[]') ||
            (journalEntries && journalEntries !== '[]')
        );
    }

    /**
     * Create a backup of localStorage data
     */
    createBackup() {
        const backup = {
            timestamp: new Date().toISOString(),
            feedings: localStorage.getItem('feedings'),
            diapers: localStorage.getItem('diapers'),
            measurements: localStorage.getItem('measurements'),
            medicines: localStorage.getItem('medicines'),
            temperatures: localStorage.getItem('temperatures'),
            appointments: localStorage.getItem('appointments'),
            journalEntries: localStorage.getItem('journalEntries'),
            timezone: localStorage.getItem('timezone'),
            darkMode: localStorage.getItem('darkMode'),
            defaultInterval: localStorage.getItem('defaultInterval'),
            nextFeedingTime: localStorage.getItem('nextFeedingTime'),
            dailyMilkTarget: localStorage.getItem('dailyMilkTarget'),
            birthDate: localStorage.getItem('birthDate'),
            notificationsEnabled: localStorage.getItem('notificationsEnabled')
        };
        
        localStorage.setItem(this.backupKey, JSON.stringify(backup));
        console.log('✅ Backup created:', new Date(backup.timestamp).toLocaleString());
        return backup;
    }

    /**
     * Restore from backup (rollback mechanism)
     */
    async restoreFromBackup() {
        const backupStr = localStorage.getItem(this.backupKey);
        if (!backupStr) {
            throw new Error('No backup found');
        }

        const backup = JSON.parse(backupStr);
        
        // Restore to localStorage
        if (backup.feedings) localStorage.setItem('feedings', backup.feedings);
        if (backup.diapers) localStorage.setItem('diapers', backup.diapers);
        if (backup.measurements) localStorage.setItem('measurements', backup.measurements);
        if (backup.medicines) localStorage.setItem('medicines', backup.medicines);
        if (backup.temperatures) localStorage.setItem('temperatures', backup.temperatures);
        if (backup.appointments) localStorage.setItem('appointments', backup.appointments);
        if (backup.journalEntries) localStorage.setItem('journalEntries', backup.journalEntries);
        if (backup.timezone) localStorage.setItem('timezone', backup.timezone);
        if (backup.darkMode) localStorage.setItem('darkMode', backup.darkMode);
        if (backup.defaultInterval) localStorage.setItem('defaultInterval', backup.defaultInterval);
        if (backup.nextFeedingTime) localStorage.setItem('nextFeedingTime', backup.nextFeedingTime);
        if (backup.dailyMilkTarget) localStorage.setItem('dailyMilkTarget', backup.dailyMilkTarget);
        if (backup.birthDate) localStorage.setItem('birthDate', backup.birthDate);
        if (backup.notificationsEnabled) localStorage.setItem('notificationsEnabled', backup.notificationsEnabled);
        
        // Clear migration flag
        localStorage.removeItem(this.migrationKey);
        
        console.log('✅ Restored from backup:', new Date(backup.timestamp).toLocaleString());
    }

    /**
     * Transform old localStorage feeding format to IndexedDB format
     */
    transformFeeding(oldFeeding) {
        return {
            time: oldFeeding.timestamp, // IndexedDB expects 'time' field
            type: oldFeeding.type,
            amount: oldFeeding.amount,
            duration: oldFeeding.duration,
            nextFeedingInterval: oldFeeding.nextFeedingInterval || 3.5,
            timezone: oldFeeding.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
        };
    }

    /**
     * Transform old localStorage diaper format to IndexedDB format
     */
    transformDiaper(oldDiaper) {
        return {
            time: oldDiaper.timestamp, // IndexedDB expects 'time' field
            hasPee: oldDiaper.hasPee,
            hasPoop: oldDiaper.hasPoop,
            level: oldDiaper.level,
            notes: oldDiaper.notes || '',
            timezone: oldDiaper.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
        };
    }

    transformMeasurement(oldMeasurement) {
        return {
            time: oldMeasurement.timestamp,
            weight: oldMeasurement.weight || null,
            height: oldMeasurement.height || null,
            timezone: oldMeasurement.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
        };
    }

    transformMedicine(oldMedicine) {
        return {
            time: oldMedicine.timestamp,
            name: oldMedicine.name,
            dose: oldMedicine.dose,
            interval: oldMedicine.interval || 0,
            notes: oldMedicine.notes || '',
            active: oldMedicine.active !== false,
            nextDose: oldMedicine.nextDose || null,
            timezone: oldMedicine.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
        };
    }

    transformTemperature(oldTemperature) {
        return {
            time: oldTemperature.timestamp,
            value: oldTemperature.value,
            notes: oldTemperature.notes || '',
            timezone: oldTemperature.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
        };
    }

    transformAppointment(oldAppointment) {
        return {
            time: oldAppointment.timestamp,
            type: oldAppointment.type || 'other',
            title: oldAppointment.title || 'Cita',
            location: oldAppointment.location || '',
            notes: oldAppointment.notes || '',
            completed: Boolean(oldAppointment.completed),
            timezone: oldAppointment.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
        };
    }

    transformJournalEntry(oldEntry) {
        return {
            time: oldEntry.timestamp,
            category: oldEntry.category || 'other',
            title: oldEntry.title || 'Evento',
            description: oldEntry.description || '',
            tags: Array.isArray(oldEntry.tags) ? oldEntry.tags : [],
            timezone: oldEntry.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
        };
    }

    /**
     * Perform the migration from localStorage to IndexedDB
     */
    async migrate() {
        console.log('🔄 Starting migration from localStorage to IndexedDB...');

        // Check if already migrated
        if (this.hasMigrated()) {
            console.log('✅ Already migrated, skipping...');
            return { status: 'already_migrated', feedings: 0, diapers: 0 };
        }

        // Check if there's data to migrate
        if (!this.hasLocalStorageData()) {
            console.log('ℹ️ No localStorage data found, marking as migrated');
            localStorage.setItem(this.migrationKey, 'true');
            return { status: 'no_data', feedings: 0, diapers: 0 };
        }

        // Create backup before migration
        this.createBackup();

        const results = {
            status: 'success',
            feedings: 0,
            diapers: 0,
            measurements: 0,
            medicines: 0,
            temperatures: 0,
            appointments: 0,
            journalEntries: 0,
            errors: []
        };

        try {
            // Initialize database
            await this.db.init();

            // Migrate feedings
            const feedingsStr = localStorage.getItem('feedings');
            if (feedingsStr && feedingsStr !== '[]') {
                try {
                    const feedings = JSON.parse(feedingsStr);
                    console.log(`📦 Migrating ${feedings.length} feeding records...`);
                    
                    for (const oldFeeding of feedings) {
                        try {
                            const newFeeding = this.transformFeeding(oldFeeding);
                            await this.db.addFeeding(newFeeding);
                            results.feedings++;
                        } catch (error) {
                            console.error('Failed to migrate feeding:', oldFeeding, error);
                            results.errors.push({ type: 'feeding', data: oldFeeding, error: error.message });
                        }
                    }
                    console.log(`✅ Migrated ${results.feedings} feedings`);
                } catch (error) {
                    console.error('Failed to parse feedings:', error);
                    results.errors.push({ type: 'parse_feedings', error: error.message });
                }
            }

            // Migrate diapers
            const diapersStr = localStorage.getItem('diapers');
            if (diapersStr && diapersStr !== '[]') {
                try {
                    const diapers = JSON.parse(diapersStr);
                    console.log(`📦 Migrating ${diapers.length} diaper records...`);
                    
                    for (const oldDiaper of diapers) {
                        try {
                            const newDiaper = this.transformDiaper(oldDiaper);
                            await this.db.addDiaper(newDiaper);
                            results.diapers++;
                        } catch (error) {
                            console.error('Failed to migrate diaper:', oldDiaper, error);
                            results.errors.push({ type: 'diaper', data: oldDiaper, error: error.message });
                        }
                    }
                    console.log(`✅ Migrated ${results.diapers} diapers`);
                } catch (error) {
                    console.error('Failed to parse diapers:', error);
                    results.errors.push({ type: 'parse_diapers', error: error.message });
                }
            }

            // Migrate settings to IndexedDB metadata
            const measurementsStr = localStorage.getItem('measurements');
            if (measurementsStr && measurementsStr !== '[]') {
                try {
                    const measurements = JSON.parse(measurementsStr);
                    for (const oldMeasurement of measurements) {
                        try {
                            const newMeasurement = this.transformMeasurement(oldMeasurement);
                            await this.db.addMeasurement(newMeasurement);
                            results.measurements++;
                        } catch (error) {
                            results.errors.push({ type: 'measurement', data: oldMeasurement, error: error.message });
                        }
                    }
                } catch (error) {
                    results.errors.push({ type: 'parse_measurements', error: error.message });
                }
            }

            const medicinesStr = localStorage.getItem('medicines');
            if (medicinesStr && medicinesStr !== '[]') {
                try {
                    const medicines = JSON.parse(medicinesStr);
                    for (const oldMedicine of medicines) {
                        try {
                            const newMedicine = this.transformMedicine(oldMedicine);
                            await this.db.addMedicine(newMedicine);
                            results.medicines++;
                        } catch (error) {
                            results.errors.push({ type: 'medicine', data: oldMedicine, error: error.message });
                        }
                    }
                } catch (error) {
                    results.errors.push({ type: 'parse_medicines', error: error.message });
                }
            }

            const temperaturesStr = localStorage.getItem('temperatures');
            if (temperaturesStr && temperaturesStr !== '[]') {
                try {
                    const temperatures = JSON.parse(temperaturesStr);
                    for (const oldTemperature of temperatures) {
                        try {
                            const newTemperature = this.transformTemperature(oldTemperature);
                            await this.db.addTemperature(newTemperature);
                            results.temperatures++;
                        } catch (error) {
                            results.errors.push({ type: 'temperature', data: oldTemperature, error: error.message });
                        }
                    }
                } catch (error) {
                    results.errors.push({ type: 'parse_temperatures', error: error.message });
                }
            }

            const appointmentsStr = localStorage.getItem('appointments');
            if (appointmentsStr && appointmentsStr !== '[]') {
                try {
                    const appointments = JSON.parse(appointmentsStr);
                    for (const oldAppointment of appointments) {
                        try {
                            const newAppointment = this.transformAppointment(oldAppointment);
                            await this.db.addAppointment(newAppointment);
                            results.appointments++;
                        } catch (error) {
                            results.errors.push({ type: 'appointment', data: oldAppointment, error: error.message });
                        }
                    }
                } catch (error) {
                    results.errors.push({ type: 'parse_appointments', error: error.message });
                }
            }

            const journalStr = localStorage.getItem('journalEntries');
            if (journalStr && journalStr !== '[]') {
                try {
                    const journalEntries = JSON.parse(journalStr);
                    for (const oldEntry of journalEntries) {
                        try {
                            const newEntry = this.transformJournalEntry(oldEntry);
                            await this.db.addJournalEntry(newEntry);
                            results.journalEntries++;
                        } catch (error) {
                            results.errors.push({ type: 'journal', data: oldEntry, error: error.message });
                        }
                    }
                } catch (error) {
                    results.errors.push({ type: 'parse_journal', error: error.message });
                }
            }

            const timezone = localStorage.getItem('timezone');
            const darkMode = localStorage.getItem('darkMode');
            const defaultInterval = localStorage.getItem('defaultInterval');
            const nextFeedingTime = localStorage.getItem('nextFeedingTime');
            const dailyMilkTarget = localStorage.getItem('dailyMilkTarget');
            const birthDate = localStorage.getItem('birthDate');
            const notificationsEnabled = localStorage.getItem('notificationsEnabled');

            if (timezone) await this.db.setMetadata('timezone', timezone);
            if (darkMode) await this.db.setMetadata('darkMode', JSON.parse(darkMode));
            if (defaultInterval) await this.db.setMetadata('defaultInterval', parseFloat(defaultInterval));
            if (nextFeedingTime) await this.db.setMetadata('nextFeedingTime', nextFeedingTime);
            if (dailyMilkTarget) await this.db.setMetadata('dailyMilkTarget', parseInt(dailyMilkTarget, 10));
            if (birthDate) await this.db.setMetadata('birthDate', birthDate);
            if (notificationsEnabled) await this.db.setMetadata('notificationsEnabled', JSON.parse(notificationsEnabled));

            // Mark as migrated
            localStorage.setItem(this.migrationKey, 'true');

            // Clear old data (keep backup for safety)
            // We'll clear the main keys but keep the backup
            localStorage.removeItem('feedings');
            localStorage.removeItem('diapers');
            localStorage.removeItem('measurements');
            localStorage.removeItem('medicines');
            localStorage.removeItem('temperatures');
            localStorage.removeItem('appointments');
            localStorage.removeItem('journalEntries');

            console.log('✅ Migration completed successfully!');
            console.log(`   Feedings: ${results.feedings}, Diapers: ${results.diapers}, Measurements: ${results.measurements}, Medicines: ${results.medicines}, Temperatures: ${results.temperatures}, Appointments: ${results.appointments}, Journal: ${results.journalEntries}`);
            
            if (results.errors.length > 0) {
                console.warn(`⚠️ Migration completed with ${results.errors.length} errors:`, results.errors);
            }

            return results;

        } catch (error) {
            console.error('❌ Migration failed:', error);
            results.status = 'failed';
            results.errors.push({ type: 'migration', error: error.message });
            
            // Don't mark as migrated if it failed
            return results;
        }
    }

    /**
     * Clear the backup after successful migration (optional, call manually)
     */
    clearBackup() {
        localStorage.removeItem(this.backupKey);
        console.log('🗑️ Backup cleared');
    }

    /**
     * Get migration status info
     */
    getStatus() {
        return {
            migrated: this.hasMigrated(),
            hasBackup: localStorage.getItem(this.backupKey) !== null,
            hasLocalStorageData: this.hasLocalStorageData(),
            backupDate: (() => {
                const backupStr = localStorage.getItem(this.backupKey);
                if (backupStr) {
                    try {
                        const backup = JSON.parse(backupStr);
                        return backup.timestamp;
                    } catch (e) {
                        return null;
                    }
                }
                return null;
            })()
        };
    }
}

// Create singleton instance
const migration = new StorageMigration(db);

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { migration, StorageMigration };
}
