// Baby Feeding Tracker Application - Spanish Version with IndexedDB
class FeedingTracker {
    constructor() {
        this.feedings = [];
        this.diapers = [];
        this.measurements = [];
        this.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        this.nextFeedingTimer = null;
        this.nextFeedingCountdownInterval = null;
        this.currentFeedingType = 'bottle'; // 'bottle' or 'breast'
        this.darkMode = false;
        this.defaultInterval = 3.5; // Default hours between feedings
        this.dailyMilkTarget = 0;
        this.birthDate = null;
        this.notificationsEnabled = false;
        this.notificationCheckInterval = null;
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
        this.setDefaultWeightTime();
        await this.renderFeedingList();
        await this.renderDiaperList();
        await this.renderMeasurementList();
        await this.updateDiaperTodaySummary();
        this.updateAgeDisplay();
        this.requestNotificationPermission();
        this.checkNextFeeding();
        this.updateDailyProgressDisplay();
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

        // Weight form submission
        document.getElementById('weight-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addMeasurement();
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

        // Notifications toggle
        document.getElementById('notifications-toggle').addEventListener('change', async (e) => {
            this.notificationsEnabled = e.target.checked;
            if (this.notificationsEnabled) {
                this.requestNotificationPermission();
                this.startNotificationScheduler();
            } else {
                this.stopNotificationScheduler();
            }
            await this.saveToStorage();
        });

        // Daily milk target change
        document.getElementById('daily-milk-target').addEventListener('change', async (e) => {
            this.dailyMilkTarget = parseInt(e.target.value) || 0;
            await this.saveToStorage();
            await this.updateStats('today'); // Refresh stats to show target
            this.updateDailyProgressDisplay();
        });

        // Birth date change
        document.getElementById('birth-date').addEventListener('change', async (e) => {
            this.birthDate = e.target.value;
            await this.saveToStorage();
            this.updateAgeDisplay();
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
                        this.measurements = [];
                        if (!this.useIndexedDB) {
                            this.saveToLocalStorage();
                        }
                        await this.renderFeedingList();
                        await this.renderDiaperList();
                        await this.renderMeasurementList();
                        await this.updateDiaperTodaySummary();
                        await this.updateStats('today');
                        await this.updateGraphs('today');
                        this.updateAgeDisplay();
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

    setDefaultWeightTime() {
        const now = new Date();
        const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16);
        const weightInput = document.getElementById('weight-time');
        if (weightInput) weightInput.value = localDateTime;
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
            this.updateDailyProgressDisplay();
            
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
                this.updateDailyProgressDisplay();
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

    // Measurement Management
    async addMeasurement() {
        const timeInput = document.getElementById('weight-time').value;
        const weight = parseFloat(document.getElementById('weight-value').value);
        const height = parseFloat(document.getElementById('height-value').value);

        if ((!weight || weight <= 0) && (!height || height <= 0)) {
            alert('Por favor ingresa un peso o altura válidos');
            return;
        }

        const measurement = {
            time: new Date(timeInput).toISOString(),
            weight: weight || null,
            height: height || null,
            timezone: this.timezone
        };

        try {
            if (this.useIndexedDB) {
                const id = await db.addMeasurement(measurement);
                this.measurements.unshift({
                    id,
                    timestamp: measurement.time,
                    ...measurement
                });
            } else {
                // LocalStorage fallback (simplified)
                const localMeasurement = {
                    id: Date.now(),
                    timestamp: measurement.time,
                    ...measurement
                };
                this.measurements.unshift(localMeasurement);
                this.saveToLocalStorage();
            }

            await this.renderMeasurementList();
            this.updateAgeDisplay(); // Update percentile
            this.setDefaultWeightTime();
            document.getElementById('weight-value').value = '';
            document.getElementById('height-value').value = '';
            
            // Send notification if enabled
            let msg = 'Medidas registradas: ';
            if (weight) msg += `${weight}kg `;
            if (height) msg += `${height}cm`;
            this.sendNotification('Crecimiento registrado', msg);

        } catch (error) {
            console.error('Failed to add measurement:', error);
            alert('Error al guardar las medidas.');
        }
    }

    async deleteMeasurement(id) {
        if (confirm('¿Estás seguro de que quieres eliminar este registro?')) {
            try {
                if (this.useIndexedDB) {
                    await db.deleteMeasurement(id);
                }
                this.measurements = this.measurements.filter(m => m.id !== id);
                if (!this.useIndexedDB) {
                    this.saveToLocalStorage();
                }
                await this.renderMeasurementList();
                this.updateAgeDisplay();
            } catch (error) {
                console.error('Failed to delete measurement:', error);
                alert('Error al eliminar el registro.');
            }
        }
    }

    renderMeasurementList() {
        const container = document.getElementById('measurement-list');
        if (!container) return;
        
        if (this.measurements.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>No hay registros de crecimiento aún.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.measurements.map(m => {
            let details = [];
            if (m.weight) details.push(`${m.weight} kg`);
            if (m.height) details.push(`${m.height} cm`);

            return `
                <div class="feeding-item">
                    <div class="feeding-info">
                        <div class="feeding-time">⚖️ ${this.formatDateTime(m.timestamp)}</div>
                        <div class="feeding-amount">${details.join(' • ')}</div>
                    </div>
                    <div class="feeding-actions">
                        <button class="btn btn-danger" onclick="tracker.deleteMeasurement(${m.id})">Eliminar</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateAgeDisplay() {
        if (!this.birthDate) {
            document.getElementById('age-days').textContent = '-';
            document.getElementById('age-weeks').textContent = '-';
            document.getElementById('age-months').textContent = '-';
            document.getElementById('percentile-display').textContent = 'Configura fecha de nacimiento';
            return;
        }

        const birth = new Date(this.birthDate);
        const now = new Date();
        const diffTime = Math.abs(now - birth);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        const diffWeeks = (diffDays / 7).toFixed(1);
        const diffMonths = (diffDays / 30.44).toFixed(1);

        document.getElementById('age-days').textContent = diffDays;
        document.getElementById('age-weeks').textContent = diffWeeks;
        document.getElementById('age-months').textContent = diffMonths;

        // Calculate percentile if we have a recent weight
        if (this.measurements.length > 0) {
            const lastWeight = this.measurements[0].weight;
            const percentile = this.calculatePercentile(diffDays, lastWeight);
            document.getElementById('percentile-display').textContent = percentile;
        } else {
            document.getElementById('percentile-display').textContent = 'Registra un peso';
        }
    }

    calculatePercentile(ageDays, weightKg) {
        // Simplified WHO standards approximation for boys (0-12 months)
        // This is a rough estimation, not medical grade
        // 50th percentile weight approx = 3.3 + (age_months * 0.7)
        const ageMonths = ageDays / 30.44;
        const p50 = 3.3 + (ageMonths * 0.75);
        const sd = 0.12 * p50; // Standard deviation approx

        const zScore = (weightKg - p50) / sd;
        
        let percentile;
        if (zScore < -2) percentile = '< 3%';
        else if (zScore < -1) percentile = '15%';
        else if (zScore < 0) percentile = '30-50%';
        else if (zScore < 1) percentile = '50-70%';
        else if (zScore < 2) percentile = '85%';
        else percentile = '> 97%';

        return `${percentile} (aprox)`;
    }

    // Notifications
    requestNotificationPermission() {
        if ('Notification' in window) {
            Notification.requestPermission().then(permission => {
                if (permission !== 'granted') {
                    this.notificationsEnabled = false;
                    document.getElementById('notifications-toggle').checked = false;
                    alert('Se necesitan permisos para enviar notificaciones.');
                }
            });
        } else {
            alert('Tu navegador no soporta notificaciones.');
            this.notificationsEnabled = false;
            document.getElementById('notifications-toggle').checked = false;
        }
    }

    startNotificationScheduler() {
        if (this.notificationCheckInterval) clearInterval(this.notificationCheckInterval);
        
        // Check every minute
        this.notificationCheckInterval = setInterval(() => this.checkNextFeedingNotification(), 60000);
        this.checkNextFeedingNotification(); // Check immediately
    }

    stopNotificationScheduler() {
        if (this.notificationCheckInterval) {
            clearInterval(this.notificationCheckInterval);
            this.notificationCheckInterval = null;
        }
    }

    checkNextFeedingNotification() {
        if (!this.notificationsEnabled || this.feedings.length === 0) return;

        const lastFeeding = this.feedings[0];
        const lastTime = new Date(lastFeeding.timestamp).getTime();
        const nextTime = lastTime + (this.defaultInterval * 60 * 60 * 1000);
        const now = Date.now();
        
        // Notify if we are within 5 minutes of the next feeding time, or if it passed less than 30 mins ago
        // and we haven't notified recently (in the last hour)
        const timeDiff = nextTime - now;
        const minutesDiff = timeDiff / (1000 * 60);

        // If it's time (between -30 mins and +5 mins)
        if (minutesDiff <= 5 && minutesDiff >= -30) {
            // Check if we already notified for this cycle
            const lastNotif = parseInt(localStorage.getItem('lastNotificationTime') || '0');
            
            // If we haven't notified in the last hour
            if (now - lastNotif > 60 * 60 * 1000) {
                this.sendNotification('Hora de comer', 'Es hora de la próxima toma del bebé');
                localStorage.setItem('lastNotificationTime', now.toString());
            }
        }
    }

    sendNotification(title, body) {
        if ('Notification' in window && Notification.permission === 'granted') {
            try {
                new Notification(title, {
                    body: body,
                    icon: 'favicon.ico', // Assuming there is one, or fallback
                    requireInteraction: true
                });
            } catch (e) {
                console.error('Error sending notification:', e);
            }
        }
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

    updateDailyProgressDisplay() {
        const container = document.getElementById('daily-progress-info');
        if (!container) return;

        if (this.dailyMilkTarget <= 0) {
            container.style.display = 'none';
            return;
        }

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        const todayFeedings = this.feedings.filter(f => {
            return new Date(f.timestamp) >= startOfToday && f.type === 'bottle';
        });

        const totalAmount = todayFeedings.reduce((sum, f) => sum + (f.amount || 0), 0);
        const remaining = Math.max(0, this.dailyMilkTarget - totalAmount);
        const percent = Math.min(100, Math.round((totalAmount / this.dailyMilkTarget) * 100));

        container.style.display = 'block';
        container.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                <span><strong>Progreso Diario:</strong> ${totalAmount} / ${this.dailyMilkTarget} ml</span>
                <span>${percent}%</span>
            </div>
            <div class="progress-bar-container" style="height: 8px; margin: 0;">
                <div class="progress-bar" style="width: ${percent}%"></div>
            </div>
            <div style="font-size: 0.85rem; margin-top: 5px; text-align: right;">
                ${remaining > 0 ? `Faltan <strong>${remaining} ml</strong>` : '¡Meta alcanzada! 🎉'}
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

    formatRelativeLabel(date) {
        const now = new Date();
        const diffMs = date - now;
        const diffMins = Math.round(diffMs / 60000);
        
        if (Math.abs(diffMins) < 60) {
            return diffMins > 0 ? `en ${diffMins} min` : `hace ${Math.abs(diffMins)} min`;
        }
        
        const diffHours = Math.round(diffMins / 60);
        return diffHours > 0 ? `en ${diffHours} h` : `hace ${Math.abs(diffHours)} h`;
    }

    getNextFeedingDate(feeding) {
        if (!feeding) return null;
        const date = new Date(feeding.timestamp);
        // Use feeding specific interval or default
        const interval = feeding.nextFeedingInterval || this.defaultInterval;
        return new Date(date.getTime() + interval * 60 * 60 * 1000);
    }

    checkNextFeeding() {
        if (this.nextFeedingTimer) clearTimeout(this.nextFeedingTimer);
        if (this.nextFeedingCountdownInterval) clearInterval(this.nextFeedingCountdownInterval);

        if (this.feedings.length === 0) {
            this.updateNextFeedingDisplay(null);
            return;
        }

        const lastFeeding = this.feedings[0];
        const nextFeeding = this.getNextFeedingDate(lastFeeding);
        const now = new Date();

        this.updateNextFeedingDisplay(nextFeeding);

        if (nextFeeding > now) {
            const timeUntil = nextFeeding - now;
            this.nextFeedingTimer = setTimeout(() => {
                this.triggerFeedingAlert();
            }, timeUntil);
        }
    }

    updateNextFeedingDisplay(nextDate) {
        const container = document.getElementById('next-feeding-info');
        
        if (!nextDate) {
            container.innerHTML = '<p>No hay tomas programadas</p>';
            container.className = 'alert-info';
            return;
        }

        const updateCountdown = () => {
            const now = new Date();
            const diff = nextDate - now;
            
            if (diff <= 0) {
                container.innerHTML = `
                    <p><strong>¡Es hora de comer!</strong></p>
                    <p>Programado para: ${this.formatDateTime(nextDate.toISOString())}</p>
                `;
                container.className = 'alert-danger';
                if (this.nextFeedingCountdownInterval) clearInterval(this.nextFeedingCountdownInterval);
                return;
            }

            const hours = Math.floor(diff / 3600000);
            const minutes = Math.floor((diff % 3600000) / 60000);
            const seconds = Math.floor((diff % 60000) / 1000);

            container.innerHTML = `
                <p>Próxima toma: <strong>${this.formatDateTime(nextDate.toISOString())}</strong></p>
                <div class="countdown">
                    Faltan: ${hours}h ${minutes}m ${seconds}s
                </div>
            `;
            
            if (diff < 1800000) { // Less than 30 mins
                container.className = 'alert-warning';
            } else {
                container.className = 'alert-success';
            }
        };

        updateCountdown();
        this.nextFeedingCountdownInterval = setInterval(updateCountdown, 1000);
    }

    triggerFeedingAlert() {
        // Audio alert
        this.playAlert();
        this.sendNotification('Hora de comer', 'Es hora de la próxima toma del bebé');

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
    async updateStats(period) {
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

                if (this.dailyMilkTarget > 0 && period === 'today') {
                    const remaining = Math.max(0, this.dailyMilkTarget - totalAmount);
                    const percent = Math.min(100, Math.round((totalAmount / this.dailyMilkTarget) * 100));
                    statsHTML += `
                        <div class="stat-card full-width">
                            <div class="stat-label">Meta Diaria (${this.dailyMilkTarget} ml)</div>
                            <div class="progress-bar-container">
                                <div class="progress-bar" style="width: ${percent}%"></div>
                            </div>
                            <div class="stat-subtext">Faltan ${remaining} ml (${percent}%)</div>
                        </div>
                    `;
                }
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
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        return this.diapers.filter(d => {
            const diaperDate = new Date(d.timestamp);
            if (period === 'today') {
                return diaperDate >= startOfToday;
            } else if (period === 'week') {
                return diaperDate >= startOfWeek;
            } else if (period === 'month') {
                return diaperDate >= startOfMonth;
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
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        return this.feedings.filter(f => {
            const feedingDate = new Date(f.timestamp);
            if (period === 'today') {
                return feedingDate >= startOfToday;
            } else if (period === 'week') {
                return feedingDate >= startOfWeek;
            } else if (period === 'month') {
                return feedingDate >= startOfMonth;
            }
            return true;
        });
    }

    // Graphs
    async updateGraphs(period) {
        const filteredFeedings = this.filterByPeriod(period);
        const filteredDiapers = this.filterDiapersByPeriod(period);
        
        this.renderTimesChart(filteredFeedings, filteredDiapers);
        this.renderAmountsChart(filteredFeedings);
        this.renderGrowthCharts();
    }

    renderGrowthCharts() {
        const weightCanvas = document.getElementById('weight-chart');
        const heightCanvas = document.getElementById('height-chart');
        
        if (!weightCanvas || !heightCanvas) return;

        const sortedMeasurements = [...this.measurements].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        // Weight Chart
        const weightData = sortedMeasurements.filter(m => m.weight).map(m => ({
            value: m.weight,
            label: this.formatDateShort(m.timestamp)
        }));
        this.renderLineChart(weightCanvas, weightData, 'Peso (kg)', '#4a90e2');

        // Height Chart
        const heightData = sortedMeasurements.filter(m => m.height).map(m => ({
            value: m.height,
            label: this.formatDateShort(m.timestamp)
        }));
        this.renderLineChart(heightCanvas, heightData, 'Altura (cm)', '#50c878');
    }

    formatDateShort(isoString) {
        const date = new Date(isoString);
        return new Intl.DateTimeFormat('es-ES', {
            month: 'short',
            day: 'numeric'
        }).format(date);
    }

    renderLineChart(canvas, data, label, color) {
        const ctx = canvas.getContext('2d');
        canvas.width = canvas.parentElement.offsetWidth;
        canvas.height = 300;

        if (data.length === 0) {
            this.drawEmptyChart(ctx, canvas, 'Sin datos registrados');
            return;
        }

        const padding = 40;
        const chartWidth = canvas.width - 2 * padding;
        const chartHeight = canvas.height - 2 * padding;

        // Find min and max for scaling
        const values = data.map(d => d.value);
        const minVal = Math.min(...values) * 0.9;
        const maxVal = Math.max(...values) * 1.1;
        const range = maxVal - minVal;

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

        // Draw line
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        
        data.forEach((point, index) => {
            const x = padding + (index / (data.length - 1 || 1)) * chartWidth;
            const y = canvas.height - padding - ((point.value - minVal) / range) * chartHeight;
            
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Draw points and labels
        data.forEach((point, index) => {
            const x = padding + (index / (data.length - 1 || 1)) * chartWidth;
            const y = canvas.height - padding - ((point.value - minVal) / range) * chartHeight;

            // Point
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();

            // Value
            ctx.fillStyle = this.darkMode ? '#ffffff' : '#2c3e50';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(point.value, x, y - 10);

            // X Label (skip some if too many)
            if (data.length <= 10 || index % Math.ceil(data.length / 10) === 0) {
                ctx.fillStyle = this.darkMode ? '#b0b0b0' : '#7f8c8d';
                ctx.fillText(point.label, x, canvas.height - padding + 20);
            }
        });
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
        const weightCanvas = document.getElementById('weight-chart');
        const heightCanvas = document.getElementById('height-chart');
        
        [timesCanvas, amountsCanvas, weightCanvas, heightCanvas].forEach(canvas => {
            if (canvas) {
                const ctx = canvas.getContext('2d');
                this.drawEmptyChart(ctx, canvas, 'No hay datos para este período');
            }
        });
    }

    drawEmptyChart(ctx, canvas, message) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = this.darkMode ? '#b0b0b0' : '#7f8c8d';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(message, canvas.width / 2, canvas.height / 2);
    }

    exportCSV() {
        const feedingsCSV = this.feedings.map(f => {
            const type = f.type === 'bottle' ? 'Biberón' : 'Pecho';
            const amount = f.type === 'bottle' ? f.amount : '';
            const duration = f.type === 'breast' ? f.duration : '';
            return `ALIMENTACION,${f.timestamp},${type},${amount},${duration},,${f.timezone}`;
        }).join('\n');

        const diapersCSV = this.diapers.map(d => {
            const pee = d.hasPee ? 'Sí' : 'No';
            const poop = d.hasPoop ? 'Sí' : 'No';
            const notes = d.notes ? `"${d.notes.replace(/"/g, '""')}"` : '';
            return `PANAL,${d.timestamp},${pee},${poop},${d.level},${notes},${d.timezone}`;
        }).join('\n');

        const measurementsCSV = this.measurements.map(m => {
            const weight = m.weight || '';
            const height = m.height || '';
            return `CRECIMIENTO,${m.timestamp},${weight},${height},,,${m.timezone}`;
        }).join('\n');

        const csvContent = "data:text/csv;charset=utf-8," + 
            "TIPO,FECHA,DETALLE1,DETALLE2,DETALLE3,NOTAS,ZONA_HORARIA\n" + 
            feedingsCSV + "\n" + diapersCSV + "\n" + measurementsCSV;

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "registro_bebe.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    importCSV(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const content = e.target.result;
                const lines = content.split('\n');
                const importedFeedings = [];
                const importedDiapers = [];
                const importedMeasurements = [];
                let currentType = null;

                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;

                    const values = line.split(',');
                    
                    if (line.includes('ALIMENTACION') || currentType === 'feeding') {
                        currentType = 'feeding';
                        const feeding = {
                            time: values[1],
                            timestamp: values[1],
                            type: values[2] === 'Biberón' ? 'bottle' : 'breast',
                            amount: values[3] ? parseInt(values[3]) : null,
                            duration: values[4] ? parseInt(values[4]) : null,
                            timezone: values[6] || values[5] || this.timezone
                        };
                        
                        importedFeedings.push(feeding);
                    } else if (line.includes('PANAL') || currentType === 'diaper') {
                        currentType = 'diaper';
                        const diaper = {
                            time: values[1],
                            timestamp: values[1],
                            hasPee: values[2] === 'Sí' || values[2] === 'Yes',
                            hasPoop: values[3] === 'Sí' || values[3] === 'Yes',
                            level: parseInt(values[4]) || 2,
                            notes: values[5] ? values[5].replace(/^"|"$/g, '').replace(/""/g, '"') : '',
                            timezone: values[6] || this.timezone
                        };
                        
                        importedDiapers.push(diaper);
                    } else if (line.includes('CRECIMIENTO') || currentType === 'measurement') {
                        currentType = 'measurement';
                        const measurement = {
                            time: values[1],
                            timestamp: values[1],
                            weight: values[2] ? parseFloat(values[2]) : null,
                            height: values[3] ? parseFloat(values[3]) : null,
                            timezone: values[6] || values[5] || this.timezone
                        };
                        importedMeasurements.push(measurement);
                    }
                }

                const totalImported = importedFeedings.length + importedDiapers.length + importedMeasurements.length;
                if (totalImported === 0) {
                    alert('No se encontraron datos válidos en el archivo');
                    return;
                }

                if (confirm(`¿Importar ${importedFeedings.length} alimentaciones, ${importedDiapers.length} pañales y ${importedMeasurements.length} mediciones? Esto se agregará a los datos existentes.`)) {
                    
                    if (this.useIndexedDB) {
                        // Save to IndexedDB
                        for (const f of importedFeedings) await db.addFeeding(f);
                        for (const d of importedDiapers) await db.addDiaper(d);
                        for (const m of importedMeasurements) await db.addMeasurement(m);
                        
                        // Reload data
                        await this.loadData();
                    } else {
                        // Save to LocalStorage
                        // Assign IDs for local storage
                        importedFeedings.forEach((f, idx) => f.id = Date.now() + idx);
                        importedDiapers.forEach((d, idx) => d.id = Date.now() + idx + 10000);
                        importedMeasurements.forEach((m, idx) => m.id = Date.now() + idx + 20000);

                        this.feedings = [...importedFeedings, ...this.feedings];
                        this.feedings.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                        
                        this.diapers = [...importedDiapers, ...this.diapers];
                        this.diapers.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

                        this.measurements = [...importedMeasurements, ...this.measurements];
                        this.measurements.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                        
                        this.saveToLocalStorage();
                    }

                    this.renderFeedingList();
                    this.renderDiaperList();
                    this.renderMeasurementList();
                    this.updateDiaperTodaySummary();
                    this.updateStats('today');
                    this.updateGraphs('today');
                    alert('¡Importación exitosa!');
                }
            } catch (error) {
                console.error(error);
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
            await db.setMetadata('dailyMilkTarget', this.dailyMilkTarget);
            await db.setMetadata('birthDate', this.birthDate);
            await db.setMetadata('notificationsEnabled', this.notificationsEnabled);
        } else {
            // Fallback to localStorage
            this.saveToLocalStorage();
        }
    }

    saveToLocalStorage() {
        localStorage.setItem('feedings', JSON.stringify(this.feedings));
        localStorage.setItem('diapers', JSON.stringify(this.diapers));
        localStorage.setItem('measurements', JSON.stringify(this.measurements));
        localStorage.setItem('timezone', this.timezone);
        localStorage.setItem('darkMode', JSON.stringify(this.darkMode));
        localStorage.setItem('defaultInterval', this.defaultInterval.toString());
        localStorage.setItem('dailyMilkTarget', this.dailyMilkTarget.toString());
        if (this.birthDate) localStorage.setItem('birthDate', this.birthDate);
        localStorage.setItem('notificationsEnabled', JSON.stringify(this.notificationsEnabled));
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

            // Load measurements
            const measurementsData = await db.getMeasurements();
            this.measurements = measurementsData.map(m => ({
                id: m.id,
                timestamp: m.time,
                weight: m.weight,
                height: m.height,
                timezone: m.timezone
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

            const dailyMilkTarget = await db.getMetadata('dailyMilkTarget');
            if (dailyMilkTarget) {
                this.dailyMilkTarget = dailyMilkTarget;
                const targetInput = document.getElementById('daily-milk-target');
                if (targetInput) targetInput.value = this.dailyMilkTarget;
            }

            const birthDate = await db.getMetadata('birthDate');
            if (birthDate) {
                this.birthDate = birthDate;
                const birthInput = document.getElementById('birth-date');
                if (birthInput) birthInput.value = this.birthDate;
            }

            const notificationsEnabled = await db.getMetadata('notificationsEnabled');
            if (notificationsEnabled !== null) {
                this.notificationsEnabled = notificationsEnabled;
                const notifToggle = document.getElementById('notifications-toggle');
                if (notifToggle) notifToggle.checked = this.notificationsEnabled;
                if (this.notificationsEnabled) this.startNotificationScheduler();
            }

            console.log(`📊 Loaded ${this.feedings.length} feedings, ${this.diapers.length} diapers, and ${this.measurements.length} measurements`);
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

        const measurementsData = localStorage.getItem('measurements');
        if (measurementsData) {
            this.measurements = JSON.parse(measurementsData);
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

        const dailyMilkTargetData = localStorage.getItem('dailyMilkTarget');
        if (dailyMilkTargetData) {
            this.dailyMilkTarget = parseInt(dailyMilkTargetData);
            const targetInput = document.getElementById('daily-milk-target');
            if (targetInput) targetInput.value = this.dailyMilkTarget;
        }

        const birthDateData = localStorage.getItem('birthDate');
        if (birthDateData) {
            this.birthDate = birthDateData;
            const birthInput = document.getElementById('birth-date');
            if (birthInput) birthInput.value = this.birthDate;
        }

        const notificationsEnabled = localStorage.getItem('notificationsEnabled');
        if (notificationsEnabled) {
            this.notificationsEnabled = JSON.parse(notificationsEnabled);
            const notifToggle = document.getElementById('notifications-toggle');
            if (notifToggle) notifToggle.checked = this.notificationsEnabled;
            if (this.notificationsEnabled) this.startNotificationScheduler();
        }
    }
}

// Initialize the app
let tracker;
document.addEventListener('DOMContentLoaded', async () => {
    tracker = new FeedingTracker();
    await tracker.init();
});
