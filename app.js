// Baby Feeding Tracker Application - Spanish Version with IndexedDB
class FeedingTracker {
    constructor() {
        this.feedings = [];
        this.diapers = [];
        this.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        this.nextFeedingTimer = null;
        this.nextFeedingCountdownInterval = null;
        this.currentFeedingType = 'bottle'; // 'bottle' or 'breast'
        this.darkMode = false;
        this.defaultInterval = 3.5; // Default hours between feedings
        this.currentDiaperLevel = 2; // Default level: medium
        this.useIndexedDB = false; // Will be set after migration check
        this.storageType = 'initializing';
    }

    async init() {
        try {
            // Try to initialize IndexedDB and run migration
            await db.init();
            const migrationResult = await migration.migrate();
            
            this.useIndexedDB = true;
            this.storageType = 'indexeddb';
            console.log('✅ Using IndexedDB storage');
            
            if (migrationResult.status === 'success') {
                console.log(`📦 Migrated ${migrationResult.feedings} feedings and ${migrationResult.diapers} diapers`);
            }
            
            await this.loadFromStorage();
        } catch (error) {
            // Fallback to localStorage if IndexedDB fails
            console.warn('⚠️ IndexedDB not available, falling back to localStorage:', error);
            this.useIndexedDB = false;
            this.storageType = 'localstorage';
            this.loadFromLocalStorage();
        }

        this.setupEventListeners();
        this.populateTimezones();
        this.setDefaultDateTime();
        this.setDefaultDiaperTime();
        await this.renderFeedingList();
        await this.renderDiaperList();
        await this.updateDiaperTodaySummary();
        this.requestNotificationPermission();
        this.checkNextFeeding();
        await this.updateStats('today');
        await this.updateGraphs('today');
        this.applyDarkMode();
        this.updateStorageStatus();
    }

    // Setup Event Listeners
    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Feeding type selector
        document.querySelectorAll('.type-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentFeedingType = btn.dataset.type;
                this.toggleFeedingInputs();
            });
        });

        // Quick amount buttons
        document.querySelectorAll('.amount-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                document.getElementById('milk-amount').value = btn.dataset.amount;
            });
        });

        // Quick duration buttons
        document.querySelectorAll('.duration-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                document.getElementById('feeding-duration').value = btn.dataset.duration;
            });
        });

        // Manual input clears selection
        document.getElementById('milk-amount').addEventListener('input', () => {
            document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('selected'));
        });

        document.getElementById('feeding-duration').addEventListener('input', () => {
            document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('selected'));
        });

        // Diaper level selector
        document.querySelectorAll('.level-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                document.querySelectorAll('.level-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentDiaperLevel = parseInt(btn.dataset.level);
            });
        });

        // Diaper form submission
        document.getElementById('diaper-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addDiaper();
        });

        // Form submission
        document.getElementById('feeding-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addFeeding();
        });

        // Timezone change
        document.getElementById('timezone').addEventListener('change', async (e) => {
            this.timezone = e.target.value;
            await this.saveToStorage();
        });

        // Export/Import
        document.getElementById('export-csv').addEventListener('click', () => this.exportCSV());
        document.getElementById('import-csv').addEventListener('change', (e) => this.importCSV(e));

        // Statistics filters (also updates graphs now)
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                const period = e.target.dataset.period;
                await this.updateStats(period);
                await this.updateGraphs(period);
            });
        });

        // Dark mode toggle
        document.getElementById('dark-mode-toggle').addEventListener('change', async (e) => {
            this.darkMode = e.target.checked;
            this.applyDarkMode();
            await this.saveToStorage();
        });

        // Default interval change
        document.getElementById('next-feeding-interval').addEventListener('change', async (e) => {
            this.defaultInterval = parseFloat(e.target.value);
            await this.saveToStorage();
        });

        // Clear all data
        document.getElementById('clear-all-data').addEventListener('click', async () => {
            if (confirm('¿Estás seguro de que quieres eliminar TODOS los registros? Esta acción no se puede deshacer.')) {
                if (confirm('Última confirmación: ¿Realmente quieres borrar todos los datos?')) {
                    try {
                        if (this.useIndexedDB) {
                            await db.clearAllData();
                        }
                        this.feedings = [];
                        this.diapers = [];
                        if (!this.useIndexedDB) {
                            this.saveToLocalStorage();
                        }
                        await this.renderFeedingList();
                        await this.renderDiaperList();
                        await this.updateDiaperTodaySummary();
                        await this.updateStats('today');
                        await this.updateGraphs('today');
                        alert('Todos los datos han sido eliminados.');
                        this.clearNextFeedingSchedule();
                    } catch (error) {
                        console.error('Failed to clear data:', error);
                        alert('Error al eliminar los datos.');
                    }
                }
            }
        });
    }

    // Toggle between bottle and breast feeding inputs
    toggleFeedingInputs() {
        const amountGroup = document.getElementById('amount-group');
        const durationGroup = document.getElementById('duration-group');

        if (this.currentFeedingType === 'bottle') {
            amountGroup.classList.remove('hidden');
            durationGroup.classList.add('hidden');
            document.getElementById('feeding-duration').value = '';
        } else {
            amountGroup.classList.add('hidden');
            durationGroup.classList.remove('hidden');
            document.getElementById('milk-amount').value = '';
        }
    }

    // Storage Status
    updateStorageStatus() {
        const statusContainer = document.getElementById('storage-status');
        if (!statusContainer) return;

        const indicator = statusContainer.querySelector('.status-indicator');
        if (!indicator) return;

        // Remove existing classes
        indicator.classList.remove('indexeddb', 'localstorage', 'error');

        if (this.storageType === 'indexeddb') {
            indicator.classList.add('indexeddb');
            indicator.innerHTML = `
                <span class="status-icon">✅</span>
                <span class="status-text">IndexedDB (Sin límites)</span>
            `;
        } else if (this.storageType === 'localstorage') {
            indicator.classList.add('localstorage');
            indicator.innerHTML = `
                <span class="status-icon">⚠️</span>
                <span class="status-text">localStorage (Modo de compatibilidad)</span>
            `;
        } else {
            indicator.classList.add('error');
            indicator.innerHTML = `
                <span class="status-icon">❌</span>
                <span class="status-text">Error de almacenamiento</span>
            `;
        }
    }

    // Dark Mode
    applyDarkMode() {
        if (this.darkMode) {
            document.body.classList.add('dark-mode');
            document.getElementById('dark-mode-toggle').checked = true;
        } else {
            document.body.classList.remove('dark-mode');
            document.getElementById('dark-mode-toggle').checked = false;
        }
    }

    // Tab Management
    async switchTab(tabName) {
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.querySelectorAll('.tab-button').forEach(button => {
            button.classList.remove('active');
        });
        
        document.getElementById(tabName).classList.add('active');
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        if (tabName === 'statistics') {
            const activePeriod = document.querySelector('.filter-btn.active').dataset.period;
            await this.updateStats(activePeriod);
            await this.updateGraphs(activePeriod);
        }
    }

    // Timezone Management
    populateTimezones() {
        const select = document.getElementById('timezone');
        const timezones = Intl.supportedValuesOf('timeZone');
        
        timezones.forEach(tz => {
            const option = document.createElement('option');
            option.value = tz;
            option.textContent = tz;
            if (tz === this.timezone) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    }

    setDefaultDateTime() {
        const now = new Date();
        const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16);
        document.getElementById('feeding-time').value = localDateTime;
    }

    setDefaultDiaperTime() {
        const now = new Date();
        const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16);
        document.getElementById('diaper-time').value = localDateTime;
    }

    // Feeding Management
    async addFeeding() {
        const timeInput = document.getElementById('feeding-time').value;
        const interval = this.defaultInterval; // Use default interval from settings

        const feeding = {
            time: new Date(timeInput).toISOString(),
            type: this.currentFeedingType,
            nextFeedingInterval: interval,
            timezone: this.timezone
        };

        if (this.currentFeedingType === 'bottle') {
            const amount = parseInt(document.getElementById('milk-amount').value);
            if (!amount || amount <= 0) {
                alert('Por favor ingresa una cantidad válida');
                return;
            }
            feeding.amount = amount;
        } else {
            const duration = parseInt(document.getElementById('feeding-duration').value);
            if (!duration || duration <= 0) {
                alert('Por favor ingresa una duración válida');
                return;
            }
            feeding.duration = duration;
        }

        try {
            if (this.useIndexedDB) {
                // Save to IndexedDB
                const id = await db.addFeeding(feeding);
                // Add to local array with proper format
                this.feedings.unshift({
                    id,
                    timestamp: feeding.time,
                    ...feeding
                });
            } else {
                // Fallback to localStorage
                const localFeeding = {
                    id: Date.now(),
                    timestamp: feeding.time,
                    ...feeding
                };
                this.feedings.unshift(localFeeding);
                this.saveToLocalStorage();
            }

            await this.renderFeedingList();
            this.setDefaultDateTime();
            
            // Clear inputs
            document.getElementById('milk-amount').value = '';
            document.getElementById('feeding-duration').value = '';
            document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('selected'));
            document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('selected'));
            
            this.scheduleNextFeeding(interval, new Date(timeInput));
            await this.updateStats('today');
            await this.updateGraphs('today');
            
            // Switch to active filter if in stats tab
            const activeTab = document.querySelector('.tab-button.active').dataset.tab;
            if (activeTab === 'statistics') {
                const activePeriod = document.querySelector('.filter-btn.active').dataset.period;
                await this.updateStats(activePeriod);
                await this.updateGraphs(activePeriod);
            }
        } catch (error) {
            console.error('Failed to add feeding:', error);
            alert('Error al guardar la alimentación. Por favor intenta de nuevo.');
        }
    }

    async deleteFeeding(id) {
        if (confirm('¿Estás seguro de que quieres eliminar este registro?')) {
            try {
                if (this.useIndexedDB) {
                    await db.deleteFeeding(id);
                }
                this.feedings = this.feedings.filter(f => f.id !== id);
                if (!this.useIndexedDB) {
                    this.saveToLocalStorage();
                }
                await this.renderFeedingList();
                await this.updateStats('today');
                await this.updateGraphs('today');
                this.recalculateNextFeedingFromHistory();
            } catch (error) {
                console.error('Failed to delete feeding:', error);
                alert('Error al eliminar la alimentación.');
            }
        }
    }

    renderFeedingList() {
        const container = document.getElementById('feeding-list');
        
        if (this.feedings.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>No hay registros aún. ¡Agrega tu primera toma arriba!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.feedings.map(feeding => {
            const details = feeding.type === 'bottle' 
                ? `${feeding.amount} ml` 
                : `${feeding.duration} min (pecho)`;
            const icon = feeding.type === 'bottle' ? '🍼' : '🤱';
            const nextFeedingDate = this.getNextFeedingDate(feeding);
            const nextFeedingLabel = nextFeedingDate
                ? this.formatDateTime(nextFeedingDate.toISOString())
                : 'Sin intervalo';
            const relativeLabel = nextFeedingDate
                ? this.formatRelativeLabel(nextFeedingDate)
                : '';
            
            return `
                <div class="feeding-item">
                    <div class="feeding-info">
                        <div class="feeding-time">${icon} ${this.formatDateTime(feeding.timestamp)}</div>
                        <div class="feeding-amount">${details}</div>
                        <div class="feeding-next">
                            Próxima aprox: <strong>${nextFeedingLabel}</strong>
                            ${relativeLabel ? `<span class="feeding-next-relative">(${relativeLabel})</span>` : ''}
                        </div>
                    </div>
                    <div class="feeding-actions">
                        <button class="btn btn-danger" onclick="tracker.deleteFeeding(${feeding.id})">Eliminar</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Diaper Management
    async addDiaper() {
        const timeInput = document.getElementById('diaper-time').value;
        const hasPee = document.getElementById('has-pee').checked;
        const hasPoop = document.getElementById('has-poop').checked;
        const notes = document.getElementById('diaper-notes').value.trim();

        if (!hasPee && !hasPoop) {
            alert('Por favor selecciona al menos pipí o popó');
            return;
        }

        const diaper = {
            time: new Date(timeInput).toISOString(),
            hasPee: hasPee,
            hasPoop: hasPoop,
            level: this.currentDiaperLevel,
            notes: notes,
            timezone: this.timezone
        };

        try {
            if (this.useIndexedDB) {
                const id = await db.addDiaper(diaper);
                this.diapers.unshift({
                    id,
                    timestamp: diaper.time,
                    ...diaper
                });
            } else {
                const localDiaper = {
                    id: Date.now(),
                    timestamp: diaper.time,
                    ...diaper
                };
                this.diapers.unshift(localDiaper);
                this.saveToLocalStorage();
            }

            await this.renderDiaperList();
            await this.updateDiaperTodaySummary();
            this.setDefaultDiaperTime();
            document.getElementById('diaper-notes').value = '';
            
            // Update stats and graphs
            await this.updateStats('today');
            await this.updateGraphs('today');
            
            const activeTab = document.querySelector('.tab-button.active').dataset.tab;
            if (activeTab === 'statistics') {
                const activePeriod = document.querySelector('.filter-btn.active').dataset.period;
                await this.updateStats(activePeriod);
                await this.updateGraphs(activePeriod);
            }
        } catch (error) {
            console.error('Failed to add diaper:', error);
            alert('Error al guardar el cambio de pañal.');
        }
    }

    async deleteDiaper(id) {
        if (confirm('¿Estás seguro de que quieres eliminar este registro de pañal?')) {
            try {
                if (this.useIndexedDB) {
                    await db.deleteDiaper(id);
                }
                this.diapers = this.diapers.filter(d => d.id !== id);
                if (!this.useIndexedDB) {
                    this.saveToLocalStorage();
                }
                await this.renderDiaperList();
                await this.updateDiaperTodaySummary();
                await this.updateStats('today');
                await this.updateGraphs('today');
            } catch (error) {
                console.error('Failed to delete diaper:', error);
                alert('Error al eliminar el cambio de pañal.');
            }
        }
    }

    renderDiaperList() {
        const container = document.getElementById('diaper-list');
        
        if (this.diapers.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>No hay registros de pañales aún. ¡Agrega el primer cambio arriba!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.diapers.map(diaper => {
            const types = [];
            if (diaper.hasPee) types.push('💧 Pipí');
            if (diaper.hasPoop) types.push('💩 Popó');
            
            const levelText = diaper.level === 1 ? 'Bajo' : diaper.level === 2 ? 'Medio' : 'Alto';
            
            return `
                <div class="diaper-item">
                    <div class="diaper-info">
                        <div class="diaper-time">${this.formatDateTime(diaper.timestamp)}</div>
                        <div class="diaper-details">${types.join(' + ')} • Nivel: ${levelText}</div>
                        ${diaper.notes ? `<div class="diaper-notes">${diaper.notes}</div>` : ''}
                    </div>
                    <div class="diaper-actions">
                        <button class="btn btn-danger" onclick="tracker.deleteDiaper(${diaper.id})">Eliminar</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateDiaperTodaySummary() {
        const container = document.getElementById('diaper-today-summary');
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        const todayDiapers = this.diapers.filter(d => {
            return new Date(d.timestamp) >= startOfToday;
        });

        const totalChanges = todayDiapers.length;
        const peeCount = todayDiapers.filter(d => d.hasPee).length;
        const poopCount = todayDiapers.filter(d => d.hasPoop).length;
        
        let lastChange = 'N/A';
        if (todayDiapers.length > 0) {
            const lastDiaper = todayDiapers[0];
            const timeSince = Math.floor((now - new Date(lastDiaper.timestamp)) / 60000);
            lastChange = timeSince < 60 ? `${timeSince} min` : `${Math.floor(timeSince / 60)}h ${timeSince % 60}m`;
        }

        container.innerHTML = `
            <div class="quick-stat-item">
                <div class="quick-stat-label">Total</div>
                <div class="quick-stat-value">${totalChanges}</div>
            </div>
            <div class="quick-stat-item">
                <div class="quick-stat-label">💧 Pipí</div>
                <div class="quick-stat-value">${peeCount}</div>
            </div>
            <div class="quick-stat-item">
                <div class="quick-stat-label">💩 Popó</div>
                <div class="quick-stat-value">${poopCount}</div>
            </div>
            <div class="quick-stat-item">
                <div class="quick-stat-label">Último cambio</div>
                <div class="quick-stat-value" style="font-size: 1.2rem;">${lastChange}</div>
            </div>
        `;
    }

    formatDateTime(isoString) {
        const date = new Date(isoString);
        return new Intl.DateTimeFormat('es-ES', {
            timeZone: this.timezone,
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    }

    // Notification System
    requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    getNextFeedingDate(feeding) {
        if (!feeding || !feeding.timestamp) return null;
        const base = new Date(feeding.timestamp);
        const hours = parseFloat(feeding.nextFeedingInterval ?? this.defaultInterval);
        if (!Number.isFinite(hours) || hours <= 0) return null;
        return new Date(base.getTime() + hours * 60 * 60 * 1000);
    }

    formatCountdown(ms) {
        const totalSeconds = Math.max(0, Math.floor(ms / 1000));
        const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
        const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
        const seconds = String(totalSeconds % 60).padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }

    formatRelativeLabel(targetDate) {
        if (!targetDate) return '';
        const target = targetDate instanceof Date ? targetDate : new Date(targetDate);
        if (Number.isNaN(target.getTime())) return '';
        const diffMs = target - new Date();
        const duration = this.formatDuration(Math.abs(diffMs));
        if (Math.abs(diffMs) < 60000) {
            return diffMs >= 0 ? 'menos de 1 min' : 'hace menos de 1 min';
        }
        return diffMs >= 0 ? `en ${duration}` : `hace ${duration}`;
    }

    clearCountdownInterval() {
        if (this.nextFeedingCountdownInterval) {
            clearInterval(this.nextFeedingCountdownInterval);
            this.nextFeedingCountdownInterval = null;
        }
    }

    clearNextFeedingSchedule() {
        if (this.nextFeedingTimer) {
            clearTimeout(this.nextFeedingTimer);
            this.nextFeedingTimer = null;
        }
        this.clearCountdownInterval();
        localStorage.removeItem('nextFeedingTime');
        this.updateNextFeedingDisplay(null);
    }

    recalculateNextFeedingFromHistory() {
        if (this.feedings.length === 0) {
            this.clearNextFeedingSchedule();
            return;
        }
        const latestFeeding = this.feedings[0];
        const interval = latestFeeding.nextFeedingInterval || this.defaultInterval;
        this.scheduleNextFeeding(interval, new Date(latestFeeding.timestamp));
    }

    scheduleNextFeeding(intervalHours, baseTime = new Date()) {
        if (!Number.isFinite(intervalHours) || intervalHours <= 0) {
            this.clearNextFeedingSchedule();
            return;
        }
        if (this.nextFeedingTimer) {
            clearTimeout(this.nextFeedingTimer);
        }

        let baseDate = baseTime instanceof Date ? baseTime : new Date(baseTime);
        if (Number.isNaN(baseDate.getTime())) {
            baseDate = new Date();
        }
        const nextFeedingTime = new Date(baseDate.getTime() + intervalHours * 60 * 60 * 1000);
        
        this.updateNextFeedingDisplay(nextFeedingTime);

        const timeUntilFeeding = nextFeedingTime.getTime() - Date.now();

        if (timeUntilFeeding > 0) {
            this.nextFeedingTimer = setTimeout(() => {
                this.notifyFeeding();
            }, timeUntilFeeding);
            localStorage.setItem('nextFeedingTime', nextFeedingTime.toISOString());
        } else {
            localStorage.removeItem('nextFeedingTime');
        }
    }

    checkNextFeeding() {
        if (this.nextFeedingTimer) {
            clearTimeout(this.nextFeedingTimer);
            this.nextFeedingTimer = null;
        }
        const nextFeedingTimeStr = localStorage.getItem('nextFeedingTime');
        if (nextFeedingTimeStr) {
            const nextFeedingTime = new Date(nextFeedingTimeStr);
            const now = new Date();
            
            if (nextFeedingTime > now) {
                this.updateNextFeedingDisplay(nextFeedingTime);
                const timeUntilFeeding = nextFeedingTime - now;
                
                this.nextFeedingTimer = setTimeout(() => {
                    this.notifyFeeding();
                }, timeUntilFeeding);
                return;
            }
            localStorage.removeItem('nextFeedingTime');
            this.updateNextFeedingDisplay(now);
            return;
        }
        
        if (this.feedings.length > 0) {
            this.recalculateNextFeedingFromHistory();
        } else {
            this.updateNextFeedingDisplay(null);
        }
    }

    updateNextFeedingDisplay(nextFeedingTime) {
        const infoDiv = document.getElementById('next-feeding-info');
        if (!infoDiv) return;

        this.clearCountdownInterval();
        
        if (!nextFeedingTime) {
            infoDiv.innerHTML = '<p>No hay tomas programadas</p>';
            infoDiv.className = 'alert-info';
            return;
        }

        const target = nextFeedingTime instanceof Date ? nextFeedingTime : new Date(nextFeedingTime);
        
        const updateContent = () => {
            const now = new Date();
            const diffMs = target - now;
            const diffMins = Math.round(diffMs / 60000);

            if (diffMs <= 0) {
                infoDiv.className = 'alert-info alert-warning';
                infoDiv.innerHTML = `
                    <p><strong>¡Es hora de la siguiente toma!</strong></p>
                    <div class="countdown-timer overdue">00:00:00</div>
                `;
                return false;
            }

            if (diffMins <= 30) {
                infoDiv.className = 'alert-info alert-warning';
            } else {
                infoDiv.className = 'alert-info';
            }

            infoDiv.innerHTML = `
                <p><strong>Próxima toma:</strong> ${this.formatDateTime(target.toISOString())}</p>
                <div class="countdown-timer">${this.formatCountdown(diffMs)}</div>
                <p class="countdown-subtext">Faltan ${this.formatDuration(diffMs)}</p>
            `;
            return true;
        };

        if (updateContent()) {
            this.nextFeedingCountdownInterval = setInterval(() => {
                if (!updateContent()) {
                    this.clearCountdownInterval();
                }
            }, 1000);
        }
    }

    formatDuration(ms) {
        if (!Number.isFinite(ms)) {
            return '0m';
        }
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    }

    notifyFeeding() {
        // Browser notification
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Recordatorio de Alimentación', {
                body: '¡Es hora de alimentar al bebé!',
                icon: '🍼',
                tag: 'feeding-reminder',
                requireInteraction: true
            });
        }

        // Audio alert
        this.playAlert();

        // Update display
        localStorage.removeItem('nextFeedingTime');
        this.updateNextFeedingDisplay(new Date());
    }

    playAlert() {
        // Create a simple beep using Web Audio API
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = 800;
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    }

    // Statistics
    updateStats(period) {
        const filteredFeedings = this.filterByPeriod(period);
        const filteredDiapers = this.filterDiapersByPeriod(period);
        const statsContainer = document.getElementById('stats-display');

        let statsHTML = '';

        // Feeding stats
        if (filteredFeedings.length === 0) {
            statsHTML += '<div class="stat-card"><div class="stat-label">Sin datos de alimentación</div></div>';
        } else {
            const totalFeedings = filteredFeedings.length;
            const bottleFeedings = filteredFeedings.filter(f => f.type === 'bottle');
            const breastFeedings = filteredFeedings.filter(f => f.type === 'breast');
            
            const totalAmount = bottleFeedings.reduce((sum, f) => sum + (f.amount || 0), 0);
            const avgAmount = bottleFeedings.length > 0 ? Math.round(totalAmount / bottleFeedings.length) : 0;
            
            const totalDuration = breastFeedings.reduce((sum, f) => sum + (f.duration || 0), 0);
            const avgDuration = breastFeedings.length > 0 ? Math.round(totalDuration / breastFeedings.length) : 0;
            
            const avgInterval = this.calculateAverageInterval(filteredFeedings);

            statsHTML += `
                <div class="stat-card">
                    <div class="stat-label">Total de Tomas</div>
                    <div class="stat-value">${totalFeedings}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Biberón</div>
                    <div class="stat-value">${bottleFeedings.length}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Pecho</div>
                    <div class="stat-value">${breastFeedings.length}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Intervalo Promedio</div>
                    <div class="stat-value">${avgInterval}</div>
                </div>
            `;

            if (bottleFeedings.length > 0) {
                const amounts = bottleFeedings.map(f => f.amount);
                statsHTML += `
                    <div class="stat-card">
                        <div class="stat-label">Total Biberón</div>
                        <div class="stat-value">${totalAmount} ml</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Promedio Biberón</div>
                        <div class="stat-value">${avgAmount} ml</div>
                    </div>
                `;
            }

            if (breastFeedings.length > 0) {
                statsHTML += `
                    <div class="stat-card">
                        <div class="stat-label">Total Pecho</div>
                        <div class="stat-value">${totalDuration} min</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Promedio Pecho</div>
                        <div class="stat-value">${avgDuration} min</div>
                    </div>
                `;
            }
        }

        // Diaper stats
        if (filteredDiapers.length === 0) {
            statsHTML += '<div class="stat-card"><div class="stat-label">Sin datos de pañales</div></div>';
        } else {
            const totalDiapers = filteredDiapers.length;
            const peeCount = filteredDiapers.filter(d => d.hasPee).length;
            const poopCount = filteredDiapers.filter(d => d.hasPoop).length;
            const bothCount = filteredDiapers.filter(d => d.hasPee && d.hasPoop).length;
            
            const avgDiaperInterval = this.calculateAverageDiaperInterval(filteredDiapers);

            statsHTML += `
                <div class="stat-card">
                    <div class="stat-label">Total Pañales</div>
                    <div class="stat-value">${totalDiapers}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">💧 Pipí</div>
                    <div class="stat-value">${peeCount}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">💩 Popó</div>
                    <div class="stat-value">${poopCount}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Mixtos</div>
                    <div class="stat-value">${bothCount}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Intervalo Promedio</div>
                    <div class="stat-value">${avgDiaperInterval}</div>
                </div>
            `;
        }

        statsContainer.innerHTML = statsHTML;
    }

    calculateAverageDiaperInterval(diapers) {
        if (diapers.length < 2) return 'N/A';
        
        let totalInterval = 0;
        for (let i = 0; i < diapers.length - 1; i++) {
            const current = new Date(diapers[i].timestamp);
            const next = new Date(diapers[i + 1].timestamp);
            totalInterval += Math.abs(current - next);
        }
        
        const avgMs = totalInterval / (diapers.length - 1);
        const avgHours = avgMs / 3600000;
        return `${avgHours.toFixed(1)}h`;
    }

    filterDiapersByPeriod(period) {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        return this.diapers.filter(d => {
            const diaperDate = new Date(d.timestamp);
            if (period === 'today') {
                return diaperDate >= startOfToday;
            } else if (period === 'week') {
                return diaperDate >= startOfWeek;
            }
            return true;
        });
    }

    calculateAverageInterval(feedings) {
        if (feedings.length < 2) return 'N/A';
        
        let totalInterval = 0;
        for (let i = 0; i < feedings.length - 1; i++) {
            const current = new Date(feedings[i].timestamp);
            const next = new Date(feedings[i + 1].timestamp);
            totalInterval += Math.abs(current - next);
        }
        
        const avgMs = totalInterval / (feedings.length - 1);
        const avgHours = avgMs / 3600000;
        return `${avgHours.toFixed(1)}h`;
    }

    filterByPeriod(period) {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        return this.feedings.filter(f => {
            const feedingDate = new Date(f.timestamp);
            if (period === 'today') {
                return feedingDate >= startOfToday;
            } else if (period === 'week') {
                return feedingDate >= startOfWeek;
            }
            return true;
        });
    }

    // Graphs
    updateGraphs(period) {
        const filteredFeedings = this.filterByPeriod(period);
        const filteredDiapers = this.filterDiapersByPeriod(period);
        
        this.renderTimesChart(filteredFeedings, filteredDiapers);
        this.renderAmountsChart(filteredFeedings);
        this.renderDiaperChart(filteredDiapers);
    }

    renderTimesChart(feedings, diapers) {
        const canvas = document.getElementById('times-chart');
        const ctx = canvas.getContext('2d');
        
        // Set canvas size
        canvas.width = canvas.parentElement.offsetWidth;
        canvas.height = 300;

        if (feedings.length === 0 && diapers.length === 0) {
            this.drawEmptyChart(ctx, canvas, 'No hay datos para este período');
            return;
        }

        const allEvents = [
            ...feedings.map(f => ({ time: new Date(f.timestamp), type: 'feeding' })),
            ...diapers.map(d => ({ time: new Date(d.timestamp), type: 'diaper' }))
        ].sort((a, b) => a.time - b.time);

        const labels = allEvents.map(e => {
            return new Intl.DateTimeFormat('es-ES', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }).format(e.time);
        });

        const hours = allEvents.map(e => e.time.getHours() + e.time.getMinutes() / 60);
        const colors = allEvents.map(e => e.type === 'feeding' ? '#4a90e2' : '#50c878');

        this.drawColoredBarChart(ctx, canvas, labels, hours, 'Hora del día', 24, colors);
    }

    renderAmountsChart(feedings) {
        const canvas = document.getElementById('amounts-chart');
        const ctx = canvas.getContext('2d');
        
        // Set canvas size
        canvas.width = canvas.parentElement.offsetWidth;
        canvas.height = 300;

        const sortedFeedings = [...feedings].reverse(); // Chronological order
        const labels = sortedFeedings.map(f => {
            const date = new Date(f.timestamp);
            return new Intl.DateTimeFormat('es-ES', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }).format(date);
        });

        const amounts = sortedFeedings.map(f => {
            if (f.type === 'bottle') {
                return f.amount || 0;
            } else {
                return f.duration || 0;
            }
        });
        
        const maxAmount = Math.max(...amounts) * 1.2;
        const yLabel = feedings.some(f => f.type === 'breast') 
            ? 'Cantidad (ml) / Duración (min)' 
            : 'Cantidad (ml)';

        this.drawBarChart(ctx, canvas, labels, amounts, yLabel, maxAmount);
    }

    renderDiaperChart(diapers) {
        const canvas = document.getElementById('amounts-chart');
        if (!diapers || diapers.length === 0) return;
        
        // This chart will show diaper changes overlaid or we keep it for feedings only
        // For now, keeping it as feeding amounts chart
    }

    drawColoredBarChart(ctx, canvas, labels, data, yLabel, maxValue, colors) {
        const padding = 40;
        const chartWidth = canvas.width - 2 * padding;
        const chartHeight = canvas.height - 2 * padding;
        const barWidth = chartWidth / data.length;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw axes
        ctx.strokeStyle = this.darkMode ? '#b0b0b0' : '#2c3e50';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, canvas.height - padding);
        ctx.lineTo(canvas.width - padding, canvas.height - padding);
        ctx.stroke();

        // Draw bars
        data.forEach((value, index) => {
            const barHeight = (value / maxValue) * chartHeight;
            const x = padding + index * barWidth;
            const y = canvas.height - padding - barHeight;

            ctx.fillStyle = colors[index];
            ctx.fillRect(x + 5, y, barWidth - 10, barHeight);

            // Draw value on top
            ctx.fillStyle = this.darkMode ? '#ffffff' : '#2c3e50';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(Math.round(value), x + barWidth / 2, y - 5);
        });

        // Draw labels (show every other label if too many)
        ctx.fillStyle = this.darkMode ? '#b0b0b0' : '#7f8c8d';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        const labelStep = data.length > 10 ? 2 : 1;
        labels.forEach((label, index) => {
            if (index % labelStep === 0) {
                const x = padding + index * barWidth + barWidth / 2;
                ctx.save();
                ctx.translate(x, canvas.height - padding + 15);
                ctx.rotate(-Math.PI / 4);
                ctx.fillText(label.length > 15 ? label.substring(0, 15) + '...' : label, 0, 0);
                ctx.restore();
            }
        });
    }

    drawBarChart(ctx, canvas, labels, data, yLabel, maxValue) {
        const padding = 40;
        const chartWidth = canvas.width - 2 * padding;
        const chartHeight = canvas.height - 2 * padding;
        const barWidth = chartWidth / data.length;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw axes
        ctx.strokeStyle = '#2c3e50';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, canvas.height - padding);
        ctx.lineTo(canvas.width - padding, canvas.height - padding);
        ctx.stroke();

        // Draw bars
        data.forEach((value, index) => {
            const barHeight = (value / maxValue) * chartHeight;
            const x = padding + index * barWidth;
            const y = canvas.height - padding - barHeight;

            ctx.fillStyle = '#4a90e2';
            ctx.fillRect(x + 5, y, barWidth - 10, barHeight);

            // Draw value on top
            ctx.fillStyle = '#2c3e50';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(Math.round(value), x + barWidth / 2, y - 5);
        });

        // Draw labels (show every other label if too many)
        ctx.fillStyle = '#7f8c8d';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        const labelStep = data.length > 10 ? 2 : 1;
        labels.forEach((label, index) => {
            if (index % labelStep === 0) {
                const x = padding + index * barWidth + barWidth / 2;
                ctx.save();
                ctx.translate(x, canvas.height - padding + 15);
                ctx.rotate(-Math.PI / 4);
                ctx.fillText(label.length > 15 ? label.substring(0, 15) + '...' : label, 0, 0);
                ctx.restore();
            }
        });
    }

    clearGraphs() {
        const timesCanvas = document.getElementById('times-chart');
        const amountsCanvas = document.getElementById('amounts-chart');
        
        [timesCanvas, amountsCanvas].forEach(canvas => {
            const ctx = canvas.getContext('2d');
            this.drawEmptyChart(ctx, canvas, 'No hay datos para este período');
        });
    }

    drawEmptyChart(ctx, canvas, message) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = this.darkMode ? '#b0b0b0' : '#7f8c8d';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(message, canvas.width / 2, canvas.height / 2);
    }

    // CSV Export/Import
    exportCSV() {
        if (this.feedings.length === 0 && this.diapers.length === 0) {
            alert('No hay datos para exportar');
            return;
        }

        let csv = '';

        // Export feedings
        if (this.feedings.length > 0) {
            const feedingHeaders = ['Tipo', 'Timestamp', 'Tipo Alimentación', 'Cantidad (ml)', 'Duración (min)', 'Próximo Intervalo (horas)', 'Zona Horaria'];
            const feedingRows = this.feedings.map(f => [
                'ALIMENTACION',
                f.timestamp,
                f.type === 'bottle' ? 'Biberón' : 'Pecho',
                f.amount || '',
                f.duration || '',
                f.nextFeedingInterval,
                f.timezone
            ]);

            csv += feedingHeaders.join(',') + '\n';
            csv += feedingRows.map(row => row.join(',')).join('\n');
        }

        // Export diapers
        if (this.diapers.length > 0) {
            if (csv) csv += '\n\n';
            
            const diaperHeaders = ['Tipo', 'Timestamp', 'Pipí', 'Popó', 'Nivel', 'Notas', 'Zona Horaria'];
            const diaperRows = this.diapers.map(d => [
                'PANAL',
                d.timestamp,
                d.hasPee ? 'Sí' : 'No',
                d.hasPoop ? 'Sí' : 'No',
                d.level,
                d.notes ? `"${d.notes.replace(/"/g, '""')}"` : '',
                d.timezone
            ]);

            csv += diaperHeaders.join(',') + '\n';
            csv += diaperRows.map(row => row.join(',')).join('\n');
        }

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bebe-tracking-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    }

    importCSV(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const csv = e.target.result;
                const lines = csv.split('\n');
                
                let importedFeedings = [];
                let importedDiapers = [];
                let currentType = null;
                
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;
                    
                    const values = line.split(',');
                    
                    // Check if this is a header or type line
                    if (values[0] === 'Tipo' || values[0] === 'ALIMENTACION' || values[0] === 'PANAL') {
                        continue;
                    }
                    
                    // Determine type from first column
                    if (line.includes('ALIMENTACION') || (currentType === 'feeding' && !line.includes('PANAL'))) {
                        currentType = 'feeding';
                        const feeding = {
                            id: Date.now() + i,
                            timestamp: values[1],
                            type: values[2] === 'Pecho' || values[2] === 'breast' ? 'breast' : 'bottle',
                            nextFeedingInterval: parseFloat(values[5]),
                            timezone: values[6] || this.timezone
                        };
                        
                        if (values[3]) feeding.amount = parseInt(values[3]);
                        if (values[4]) feeding.duration = parseInt(values[4]);
                        
                        importedFeedings.push(feeding);
                    } else if (line.includes('PANAL') || currentType === 'diaper') {
                        currentType = 'diaper';
                        const diaper = {
                            id: Date.now() + i + 10000,
                            timestamp: values[1],
                            hasPee: values[2] === 'Sí' || values[2] === 'Yes',
                            hasPoop: values[3] === 'Sí' || values[3] === 'Yes',
                            level: parseInt(values[4]) || 2,
                            notes: values[5] ? values[5].replace(/^"|"$/g, '').replace(/""/g, '"') : '',
                            timezone: values[6] || this.timezone
                        };
                        
                        importedDiapers.push(diaper);
                    }
                }

                const totalImported = importedFeedings.length + importedDiapers.length;
                if (totalImported === 0) {
                    alert('No se encontraron datos válidos en el archivo');
                    return;
                }

                if (confirm(`¿Importar ${importedFeedings.length} alimentaciones y ${importedDiapers.length} pañales? Esto se agregará a los datos existentes.`)) {
                    this.feedings = [...importedFeedings, ...this.feedings];
                    this.feedings.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                    
                    this.diapers = [...importedDiapers, ...this.diapers];
                    this.diapers.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                    
                    this.saveToLocalStorage();
                    this.renderFeedingList();
                    this.renderDiaperList();
                    this.updateDiaperTodaySummary();
                    this.updateStats('today');
                    this.updateGraphs('today');
                    alert('¡Importación exitosa!');
                }
            } catch (error) {
                alert('Error al importar CSV: ' + error.message);
            }
        };
        reader.readAsText(file);
        
        // Reset file input
        event.target.value = '';
    }

    // Storage Management (supports both IndexedDB and localStorage)
    async saveToStorage() {
        if (this.useIndexedDB) {
            // IndexedDB saves happen immediately on add/delete, so we just save settings
            await db.setMetadata('timezone', this.timezone);
            await db.setMetadata('darkMode', this.darkMode);
            await db.setMetadata('defaultInterval', this.defaultInterval);
        } else {
            // Fallback to localStorage
            this.saveToLocalStorage();
        }
    }

    saveToLocalStorage() {
        localStorage.setItem('feedings', JSON.stringify(this.feedings));
        localStorage.setItem('diapers', JSON.stringify(this.diapers));
        localStorage.setItem('timezone', this.timezone);
        localStorage.setItem('darkMode', JSON.stringify(this.darkMode));
        localStorage.setItem('defaultInterval', this.defaultInterval.toString());
    }

    // Load from IndexedDB
    async loadFromStorage() {
        try {
            // Load feedings
            const feedingsData = await db.getFeedings();
            this.feedings = feedingsData.map(f => ({
                id: f.id,
                timestamp: f.time, // Convert back to old format
                type: f.type,
                amount: f.amount,
                duration: f.duration,
                nextFeedingInterval: f.nextFeedingInterval,
                timezone: f.timezone
            }));

            // Load diapers
            const diapersData = await db.getDiapers();
            this.diapers = diapersData.map(d => ({
                id: d.id,
                timestamp: d.time, // Convert back to old format
                hasPee: d.hasPee,
                hasPoop: d.hasPoop,
                level: d.level,
                notes: d.notes,
                timezone: d.timezone
            }));

            // Load settings from metadata
            const timezone = await db.getMetadata('timezone');
            if (timezone) this.timezone = timezone;

            const darkMode = await db.getMetadata('darkMode');
            if (darkMode !== null) this.darkMode = darkMode;

            const defaultInterval = await db.getMetadata('defaultInterval');
            if (defaultInterval) {
                this.defaultInterval = defaultInterval;
                const intervalInput = document.getElementById('next-feeding-interval');
                if (intervalInput) intervalInput.value = this.defaultInterval;
            }

            console.log(`📊 Loaded ${this.feedings.length} feedings and ${this.diapers.length} diapers from IndexedDB`);
        } catch (error) {
            console.error('Failed to load from IndexedDB:', error);
            throw error;
        }
    }

    loadFromLocalStorage() {
        const feedingsData = localStorage.getItem('feedings');
        if (feedingsData) {
            this.feedings = JSON.parse(feedingsData);
        }

        const diapersData = localStorage.getItem('diapers');
        if (diapersData) {
            this.diapers = JSON.parse(diapersData);
        }

        const timezoneData = localStorage.getItem('timezone');
        if (timezoneData) {
            this.timezone = timezoneData;
        }

        const darkModeData = localStorage.getItem('darkMode');
        if (darkModeData) {
            this.darkMode = JSON.parse(darkModeData);
        }

        const defaultIntervalData = localStorage.getItem('defaultInterval');
        if (defaultIntervalData) {
            this.defaultInterval = parseFloat(defaultIntervalData);
            const intervalInput = document.getElementById('next-feeding-interval');
            if (intervalInput) intervalInput.value = this.defaultInterval;
        }
    }
}

// Initialize the app
let tracker;
document.addEventListener('DOMContentLoaded', async () => {
    tracker = new FeedingTracker();
    await tracker.init();
});
