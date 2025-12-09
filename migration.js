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
        return (feedings && feedings !== '[]') || (diapers && diapers !== '[]');
    }

    /**
     * Create a backup of localStorage data
     */
    createBackup() {
        const backup = {
            timestamp: new Date().toISOString(),
            feedings: localStorage.getItem('feedings'),
            diapers: localStorage.getItem('diapers'),
            timezone: localStorage.getItem('timezone'),
            darkMode: localStorage.getItem('darkMode'),
            defaultInterval: localStorage.getItem('defaultInterval'),
            nextFeedingTime: localStorage.getItem('nextFeedingTime')
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
        if (backup.timezone) localStorage.setItem('timezone', backup.timezone);
        if (backup.darkMode) localStorage.setItem('darkMode', backup.darkMode);
        if (backup.defaultInterval) localStorage.setItem('defaultInterval', backup.defaultInterval);
        if (backup.nextFeedingTime) localStorage.setItem('nextFeedingTime', backup.nextFeedingTime);
        
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
            const timezone = localStorage.getItem('timezone');
            const darkMode = localStorage.getItem('darkMode');
            const defaultInterval = localStorage.getItem('defaultInterval');
            const nextFeedingTime = localStorage.getItem('nextFeedingTime');

            if (timezone) await this.db.setMetadata('timezone', timezone);
            if (darkMode) await this.db.setMetadata('darkMode', JSON.parse(darkMode));
            if (defaultInterval) await this.db.setMetadata('defaultInterval', parseFloat(defaultInterval));
            if (nextFeedingTime) await this.db.setMetadata('nextFeedingTime', nextFeedingTime);

            // Mark as migrated
            localStorage.setItem(this.migrationKey, 'true');

            // Clear old data (keep backup for safety)
            // We'll clear the main keys but keep the backup
            localStorage.removeItem('feedings');
            localStorage.removeItem('diapers');

            console.log('✅ Migration completed successfully!');
            console.log(`   Feedings: ${results.feedings}, Diapers: ${results.diapers}`);
            
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
