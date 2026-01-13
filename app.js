// Baby Feeding Tracker Application - Spanish Version with IndexedDB
class FeedingTracker {
    constructor() {
        this.feedings = [];
        this.diapers = [];
        this.measurements = [];
        this.medicines = [];
        this.temperatures = [];
        this.appointments = [];
        this.journalEntries = [];
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
        this.setDefaultMedicineTime();
        this.setDefaultTemperatureTime();
        this.setDefaultAppointmentTime();
        this.setDefaultJournalTime();
        await this.renderFeedingList();
        await this.renderDiaperList();
        await this.renderMeasurementList();
        await this.renderMedicineList();
        await this.renderTemperatureList();
        await this.renderAppointmentList();
        await this.renderJournalList();
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
        document.getElementById('feeding-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.addFeeding();
        });

        // Weight form submission
        document.getElementById('weight-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addMeasurement();
        });

        // Medicine modal controls
        document.getElementById('add-medicine-btn').addEventListener('click', () => {
            this.openMedicineModal();
        });

        document.getElementById('close-medicine-modal').addEventListener('click', () => {
            this.closeMedicineModal();
        });

        document.getElementById('cancel-medicine-modal').addEventListener('click', () => {
            this.closeMedicineModal();
        });

        // Close modal when clicking outside
        document.getElementById('medicine-modal').addEventListener('click', (e) => {
            if (e.target.id === 'medicine-modal') {
                this.closeMedicineModal();
            }
        });

        // Medicine name selector
        document.getElementById('medicine-name-select').addEventListener('change', (e) => {
            const customInput = document.getElementById('medicine-name-custom');
            if (e.target.value === 'custom') {
                customInput.style.display = 'block';
                customInput.required = true;
            } else {
                customInput.style.display = 'none';
                customInput.required = false;
            }
        });

        // Medicine type selector
        document.getElementById('medicine-type-select').addEventListener('change', (e) => {
            const customInput = document.getElementById('medicine-interval');
            if (e.target.value === 'custom') {
                customInput.style.display = 'block';
                customInput.required = true;
            } else {
                customInput.style.display = 'none';
                customInput.required = false;
            }
        });

        // Medicine form submission
        document.getElementById('medicine-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.addMedicine();
        });

        // Feeding modal controls
        document.getElementById('add-feeding-btn').addEventListener('click', () => {
            this.openFeedingModal();
        });
        document.getElementById('close-feeding-modal').addEventListener('click', () => {
            this.closeFeedingModal();
        });
        document.getElementById('cancel-feeding-modal').addEventListener('click', () => {
            this.closeFeedingModal();
        });
        document.getElementById('feeding-modal').addEventListener('click', (e) => {
            if (e.target.id === 'feeding-modal') this.closeFeedingModal();
        });

        // Diaper modal controls
        document.getElementById('add-diaper-btn').addEventListener('click', () => {
            this.openDiaperModal();
        });
        document.getElementById('close-diaper-modal').addEventListener('click', () => {
            this.closeDiaperModal();
        });
        document.getElementById('cancel-diaper-modal').addEventListener('click', () => {
            this.closeDiaperModal();
        });
        document.getElementById('diaper-modal').addEventListener('click', (e) => {
            if (e.target.id === 'diaper-modal') this.closeDiaperModal();
        });

        // Measurement modal controls
        document.getElementById('add-measurement-btn').addEventListener('click', () => {
            this.openMeasurementModal();
        });
        document.getElementById('close-measurement-modal').addEventListener('click', () => {
            this.closeMeasurementModal();
        });
        document.getElementById('cancel-measurement-modal').addEventListener('click', () => {
            this.closeMeasurementModal();
        });
        document.getElementById('measurement-modal').addEventListener('click', (e) => {
            if (e.target.id === 'measurement-modal') this.closeMeasurementModal();
        });

        // Temperature modal controls
        document.getElementById('add-temperature-btn').addEventListener('click', () => {
            this.openTemperatureModal();
        });
        document.getElementById('close-temperature-modal').addEventListener('click', () => {
            this.closeTemperatureModal();
        });
        document.getElementById('cancel-temperature-modal').addEventListener('click', () => {
            this.closeTemperatureModal();
        });
        document.getElementById('temperature-modal').addEventListener('click', (e) => {
            if (e.target.id === 'temperature-modal') this.closeTemperatureModal();
        });

        // Appointment modal controls
        document.getElementById('add-appointment-btn').addEventListener('click', () => {
            this.openAppointmentModal();
        });
        document.getElementById('close-appointment-modal').addEventListener('click', () => {
            this.closeAppointmentModal();
        });
        document.getElementById('cancel-appointment-modal').addEventListener('click', () => {
            this.closeAppointmentModal();
        });
        document.getElementById('appointment-modal').addEventListener('click', (e) => {
            if (e.target.id === 'appointment-modal') this.closeAppointmentModal();
        });

        // Journal modal controls
        document.getElementById('add-journal-btn').addEventListener('click', () => {
            this.openJournalModal();
        });
        document.getElementById('close-journal-modal').addEventListener('click', () => {
            this.closeJournalModal();
        });
        document.getElementById('cancel-journal-modal').addEventListener('click', () => {
            this.closeJournalModal();
        });
        document.getElementById('journal-modal').addEventListener('click', (e) => {
            if (e.target.id === 'journal-modal') this.closeJournalModal();
        });

        // Collapsible sections
        document.querySelectorAll('.collapsible-header').forEach(header => {
            header.addEventListener('click', () => {
                const targetId = header.dataset.target;
                const content = document.getElementById(targetId);
                if (content) {
                    header.classList.toggle('collapsed');
                    content.classList.toggle('collapsed');
                }
            });
        });

        // Temperature form submission
        document.getElementById('temperature-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.addTemperature();
        });

        // Appointment form submission
        document.getElementById('appointment-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.addAppointment();
        });

        // Journal form submission
        document.getElementById('journal-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.addJournalEntry();
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

        // Analytics time range selector
        document.querySelectorAll('.time-range-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.time-range-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
            });
        });

        // Analytics variable checkboxes
        document.querySelectorAll('.analytics-var').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const medicineFilterGroup = document.getElementById('medicine-filter-group');
                const medicinesCheckbox = document.querySelector('.analytics-var[data-var="medicines"]');
                if (medicinesCheckbox && medicinesCheckbox.checked) {
                    medicineFilterGroup.style.display = 'block';
                    this.populateMedicineFilter();
                } else {
                    medicineFilterGroup.style.display = 'none';
                }
            });
        });

        // Generate analytics button
        document.getElementById('generate-analytics').addEventListener('click', () => {
            this.generateAnalytics();
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
                        this.medicines = [];
                        this.temperatures = [];
                        this.appointments = [];
                        this.journalEntries = [];
                        if (!this.useIndexedDB) {
                            this.saveToLocalStorage();
                        }
                        await this.renderFeedingList();
                        await this.renderDiaperList();
                        await this.renderMeasurementList();
                        await this.renderMedicineList();
                        await this.renderTemperatureList();
                        await this.renderAppointmentList();
                        await this.renderJournalList();
                        await this.updateDiaperTodaySummary();
                        await this.updateStats('today');
                        await this.updateGraphs('today');
                        this.renderTemperatureChart();
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

    setDefaultMedicineTime() {
        const now = new Date();
        const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16);
        const medicineInput = document.getElementById('medicine-time');
        if (medicineInput) medicineInput.value = localDateTime;
    }

    setDefaultTemperatureTime() {
        const now = new Date();
        const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16);
        const tempInput = document.getElementById('temperature-time');
        if (tempInput) tempInput.value = localDateTime;
    }

    setDefaultAppointmentTime() {
        const now = new Date();
        const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16);
        const apptInput = document.getElementById('appointment-time');
        if (apptInput) apptInput.value = localDateTime;
    }

    setDefaultJournalTime() {
        const now = new Date();
        const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16);
        const journalInput = document.getElementById('journal-time');
        if (journalInput) journalInput.value = localDateTime;
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
            this.closeFeedingModal();
            this.setDefaultDateTime();
            
            // Clear inputs
            document.getElementById('milk-amount').value = '';
            document.getElementById('feeding-duration').value = '';
            document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('selected'));
            document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('selected'));
            
            this.checkNextFeeding();
            
            // Update stats in background - don't await to avoid blocking
            this.updateStats('today').catch(err => console.warn('Stats update failed:', err));
            this.updateGraphs('today').catch(err => console.warn('Graphs update failed:', err));
            this.updateDailyProgressDisplay();
            
            // Switch to active filter if in stats tab
            const activeTab = document.querySelector('.tab-button.active')?.dataset?.tab;
            if (activeTab === 'statistics') {
                const activePeriod = document.querySelector('.filter-btn.active')?.dataset?.period;
                if (activePeriod) {
                    this.updateStats(activePeriod).catch(err => console.warn('Stats update failed:', err));
                    this.updateGraphs(activePeriod).catch(err => console.warn('Graphs update failed:', err));
                }
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
                this.updateStats('today').catch(err => console.warn('Stats update failed:', err));
                this.updateGraphs('today').catch(err => console.warn('Graphs update failed:', err));
                this.checkNextFeeding();
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
            this.closeDiaperModal();
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
            this.closeMeasurementModal();
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

    // ============= MEDICINE OPERATIONS =============

    openMedicineModal() {
        const modal = document.getElementById('medicine-modal');
        modal.classList.add('active');
        this.setDefaultMedicineTime();
    }

    closeMedicineModal() {
        const modal = document.getElementById('medicine-modal');
        modal.classList.remove('active');
        
        // Reset form
        document.getElementById('medicine-name-select').value = '';
        document.getElementById('medicine-name-custom').value = '';
        document.getElementById('medicine-name-custom').style.display = 'none';
        document.getElementById('medicine-dose').value = '';
        document.getElementById('medicine-type-select').value = '';
        document.getElementById('medicine-interval').value = '';
        document.getElementById('medicine-interval').style.display = 'none';
        document.getElementById('medicine-notes').value = '';
    }

    // Feeding modal
    openFeedingModal() {
        const modal = document.getElementById('feeding-modal');
        modal.classList.add('active');
        this.setDefaultDateTime();
    }

    closeFeedingModal() {
        const modal = document.getElementById('feeding-modal');
        modal.classList.remove('active');
    }

    // Diaper modal
    openDiaperModal() {
        const modal = document.getElementById('diaper-modal');
        modal.classList.add('active');
        this.setDefaultDiaperTime();
    }

    closeDiaperModal() {
        const modal = document.getElementById('diaper-modal');
        modal.classList.remove('active');
    }

    // Measurement modal
    openMeasurementModal() {
        const modal = document.getElementById('measurement-modal');
        modal.classList.add('active');
        this.setDefaultWeightTime();
    }

    closeMeasurementModal() {
        const modal = document.getElementById('measurement-modal');
        modal.classList.remove('active');
        document.getElementById('weight-value').value = '';
        document.getElementById('height-value').value = '';
    }

    // Temperature modal
    openTemperatureModal() {
        const modal = document.getElementById('temperature-modal');
        modal.classList.add('active');
        this.setDefaultTemperatureTime();
    }

    closeTemperatureModal() {
        const modal = document.getElementById('temperature-modal');
        modal.classList.remove('active');
        document.getElementById('temperature-value').value = '';
        document.getElementById('temperature-notes').value = '';
    }

    // Appointment modal
    openAppointmentModal() {
        const modal = document.getElementById('appointment-modal');
        modal.classList.add('active');
        this.setDefaultAppointmentTime();
    }

    closeAppointmentModal() {
        const modal = document.getElementById('appointment-modal');
        modal.classList.remove('active');
        document.getElementById('appointment-title').value = '';
        document.getElementById('appointment-location').value = '';
        document.getElementById('appointment-notes').value = '';
    }

    // Journal modal
    openJournalModal() {
        const modal = document.getElementById('journal-modal');
        modal.classList.add('active');
        this.setDefaultJournalTime();
    }

    closeJournalModal() {
        const modal = document.getElementById('journal-modal');
        modal.classList.remove('active');
        document.getElementById('journal-title').value = '';
        document.getElementById('journal-description').value = '';
        document.getElementById('journal-tags').value = '';
    }

    async addMedicine() {
        const nameSelect = document.getElementById('medicine-name-select').value;
        const nameCustom = document.getElementById('medicine-name-custom').value.trim();
        
        // Determine the medicine name
        let name = '';
        if (nameSelect === 'custom') {
            name = nameCustom;
        } else if (nameSelect && nameSelect !== '') {
            name = nameSelect;
        }
        
        const dose = document.getElementById('medicine-dose').value.trim();
        const timeInput = document.getElementById('medicine-time').value;
        
        const typeSelect = document.getElementById('medicine-type-select').value;
        const intervalCustom = parseFloat(document.getElementById('medicine-interval').value) || 0;
        const interval = typeSelect === 'custom' ? intervalCustom : parseFloat(typeSelect) || 0;
        
        const notes = document.getElementById('medicine-notes').value.trim();

        if (!name || !dose || !timeInput) {
            alert('Por favor completa todos los campos obligatorios');
            return;
        }

        const medicine = {
            time: new Date(timeInput).toISOString(),
            name,
            dose,
            interval,
            notes,
            active: true, // All new medicines are active (both occasional and recurring)
            nextDose: interval > 0 ? new Date(new Date(timeInput).getTime() + interval * 60 * 60 * 1000).toISOString() : null,
            timezone: this.timezone
        };

        console.log('Adding medicine:', medicine);

        try {
            if (this.useIndexedDB) {
                const id = await db.addMedicine(medicine);
                this.medicines.unshift({ id, timestamp: medicine.time, ...medicine });
                console.log('Medicine added to IndexedDB with ID:', id);
            } else {
                const localMedicine = { id: Date.now(), timestamp: medicine.time, ...medicine };
                this.medicines.unshift(localMedicine);
                this.saveToLocalStorage();
                console.log('Medicine added to localStorage:', localMedicine);
            }

            console.log('Total medicines:', this.medicines.length);
            await this.renderMedicineList();
            this.closeMedicineModal();
            
            this.sendNotification('Medicamento registrado', `${name} - ${dose}`);
        } catch (error) {
            console.error('Failed to add medicine:', error);
            alert('Error al guardar el medicamento.');
        }
    }

    async deleteMedicine(id) {
        if (confirm('¿Estás seguro de que quieres eliminar este medicamento?')) {
            try {
                if (this.useIndexedDB) await db.deleteMedicine(id);
                this.medicines = this.medicines.filter(m => m.id !== id);
                if (!this.useIndexedDB) this.saveToLocalStorage();
                await this.renderMedicineList();
            } catch (error) {
                console.error('Failed to delete medicine:', error);
                alert('Error al eliminar el medicamento.');
            }
        }
    }

    async markMedicineTaken(id) {
        try {
            const medicine = this.medicines.find(m => m.id === id);
            if (!medicine) return;

            // Create a history entry for this dose
            const historyEntry = {
                time: new Date().toISOString(),
                name: medicine.name,
                dose: medicine.dose,
                interval: 0, // History entries don't have intervals
                notes: medicine.notes ? `Dosis de tratamiento: ${medicine.notes}` : 'Dosis registrada',
                active: false,
                nextDose: null,
                timezone: this.timezone
            };

            // Update the existing medicine's next dose if it has an interval
            if (medicine.interval > 0) {
                const nextDose = new Date(Date.now() + medicine.interval * 60 * 60 * 1000).toISOString();
                if (this.useIndexedDB) {
                    await db.updateMedicine(id, { nextDose });
                }
                medicine.nextDose = nextDose;
            }

            // Add history entry
            if (this.useIndexedDB) {
                const newId = await db.addMedicine(historyEntry);
                this.medicines.unshift({ id: newId, timestamp: historyEntry.time, ...historyEntry });
            } else {
                const localMedicine = { id: Date.now() + 1, timestamp: historyEntry.time, ...historyEntry };
                this.medicines.unshift(localMedicine);
                this.saveToLocalStorage();
            }

            if (!this.useIndexedDB) this.saveToLocalStorage();
            
            await this.renderMedicineList();
            this.sendNotification('Dosis registrada', `${medicine.name} - ${medicine.dose}`);
        } catch (error) {
            console.error('Failed to mark medicine taken:', error);
            alert('Error al registrar la dosis.');
        }
    }

    async stopMedicine(id) {
        if (confirm('¿Detener este tratamiento?')) {
            try {
                if (this.useIndexedDB) {
                    await db.updateMedicine(id, { active: false, nextDose: null });
                }
                const medicine = this.medicines.find(m => m.id === id);
                if (medicine) {
                    medicine.active = false;
                    medicine.nextDose = null;
                }
                if (!this.useIndexedDB) this.saveToLocalStorage();
                await this.renderMedicineList();
            } catch (error) {
                console.error('Failed to stop medicine:', error);
                alert('Error al detener el medicamento.');
            }
        }
    }

    renderMedicineList() {
        console.log('renderMedicineList() called');
        const activeContainer = document.getElementById('available-medicines-list');
        const historyContainer = document.getElementById('medicine-history-list');
        console.log('Containers found:', !!activeContainer, !!historyContainer);
        if (!activeContainer || !historyContainer) {
            console.error('Medicine containers not found!');
            return;
        }

        console.log('Rendering medicine list. Total medicines:', this.medicines.length);

        // Available medicines: recurring (with next dose) + occasional (interval=0 and active)
        const availableMedicines = this.medicines.filter(m => {
            if (m.interval === 0 && m.active) return true; // Occasional medicine
            return m.active && m.nextDose; // Recurring medicine with schedule
        });
        
        console.log('Available medicines:', availableMedicines.length);
        
        // History: inactive or medicines without nextDose
        const historyMedicines = this.medicines.filter(m => {
            if (m.interval === 0 && m.active) return false; // Exclude occasional medicines
            return !m.active || !m.nextDose;
        });

        console.log('History medicines:', historyMedicines.length);

        if (availableMedicines.length === 0) {
            activeContainer.innerHTML = '<div class="empty-state"><p>No hay medicamentos disponibles</p></div>';
        } else {
            activeContainer.innerHTML = availableMedicines.map(m => {
                const isRecurring = m.interval > 0;
                const nextDoseDate = m.nextDose ? new Date(m.nextDose) : null;
                const now = new Date();
                const isDue = nextDoseDate && nextDoseDate <= now;
                
                return `
                    <div class="feeding-item ${isDue ? 'medicine-due' : ''}">
                        <div class="feeding-info">
                            <div class="feeding-time">💊 <strong>${m.name}</strong> - ${m.dose}</div>
                            <div class="feeding-amount">
                                ${isRecurring ? `${isDue ? '⚠️ ' : ''}Próxima dosis: ${this.formatDateTime(m.nextDose)} (cada ${m.interval}h)` : 'Disponible cuando sea necesario'}
                            </div>
                            ${m.notes ? `<div class="diaper-notes">${m.notes}</div>` : ''}
                        </div>
                        <div class="feeding-actions">
                            <button class="btn btn-primary" onclick="tracker.markMedicineTaken(${m.id})">Tomar</button>
                            ${isRecurring 
                                ? `<button class="btn btn-secondary" onclick="tracker.stopMedicine(${m.id})">Detener</button>`
                                : `<button class="btn btn-danger" onclick="tracker.deleteMedicine(${m.id})">Eliminar</button>`
                            }
                        </div>
                    </div>
                `;
            }).join('');
        }

        if (historyMedicines.length === 0) {
            historyContainer.innerHTML = '<div class="empty-state"><p>No hay registros</p></div>';
        } else {
            historyContainer.innerHTML = historyMedicines.map(m => `
                <div class="feeding-item">
                    <div class="feeding-info">
                        <div class="feeding-time">💊 ${this.formatDateTime(m.timestamp)}</div>
                        <div class="feeding-amount"><strong>${m.name}</strong> - ${m.dose}</div>
                        ${m.notes ? `<div class="diaper-notes">${m.notes}</div>` : ''}
                    </div>
                    <div class="feeding-actions">
                        <button class="btn btn-danger" onclick="tracker.deleteMedicine(${m.id})">Eliminar</button>
                    </div>
                </div>
            `).join('');
        }
    }

    // ============= TEMPERATURE OPERATIONS =============

    async addTemperature() {
        const value = parseFloat(document.getElementById('temperature-value').value);
        const timeInput = document.getElementById('temperature-time').value;
        const notes = document.getElementById('temperature-notes').value.trim();

        if (!value || !timeInput) {
            alert('Por favor completa todos los campos obligatorios');
            return;
        }

        const temperature = {
            time: new Date(timeInput).toISOString(),
            value,
            notes,
            timezone: this.timezone
        };

        try {
            if (this.useIndexedDB) {
                const id = await db.addTemperature(temperature);
                this.temperatures.unshift({ id, timestamp: temperature.time, ...temperature });
            } else {
                const localTemp = { id: Date.now(), timestamp: temperature.time, ...temperature };
                this.temperatures.unshift(localTemp);
                this.saveToLocalStorage();
            }

            await this.renderTemperatureList();
            this.renderTemperatureChart();
            this.closeTemperatureModal();
            this.setDefaultTemperatureTime();
            document.getElementById('temperature-value').value = '';
            document.getElementById('temperature-notes').value = '';
            
            const alert_msg = value >= 38 ? ' ⚠️ Fiebre detectada' : '';
            this.sendNotification('Temperatura registrada', `${value}°C${alert_msg}`);
        } catch (error) {
            console.error('Failed to add temperature:', error);
            alert('Error al guardar la temperatura.');
        }
    }

    async deleteTemperature(id) {
        if (confirm('¿Estás seguro de que quieres eliminar este registro?')) {
            try {
                if (this.useIndexedDB) await db.deleteTemperature(id);
                this.temperatures = this.temperatures.filter(t => t.id !== id);
                if (!this.useIndexedDB) this.saveToLocalStorage();
                await this.renderTemperatureList();
                this.renderTemperatureChart();
            } catch (error) {
                console.error('Failed to delete temperature:', error);
                alert('Error al eliminar la temperatura.');
            }
        }
    }

    renderTemperatureList() {
        const container = document.getElementById('temperature-list');
        if (!container) return;

        if (this.temperatures.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No hay registros de temperatura</p></div>';
            return;
        }

        container.innerHTML = this.temperatures.map(t => {
            const isFever = t.value >= 38;
            return `
                <div class="feeding-item ${isFever ? 'temperature-fever' : ''}">
                    <div class="feeding-info">
                        <div class="feeding-time">🌡️ ${this.formatDateTime(t.timestamp)}</div>
                        <div class="feeding-amount">
                            <strong>${t.value}°C</strong>
                            ${isFever ? ' ⚠️ Fiebre' : t.value >= 37.5 ? ' ⚡ Elevada' : ' ✓ Normal'}
                        </div>
                        ${t.notes ? `<div class="diaper-notes">${t.notes}</div>` : ''}
                    </div>
                    <div class="feeding-actions">
                        <button class="btn btn-danger" onclick="tracker.deleteTemperature(${t.id})">Eliminar</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderTemperatureChart() {
        const canvas = document.getElementById('temperature-chart');
        if (!canvas) return;

        const sortedTemps = [...this.temperatures].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const data = sortedTemps.map(t => ({
            value: t.value,
            label: this.formatDateShort(t.timestamp)
        }));

        this.renderLineChart(canvas, data, 'Temperatura (°C)', '#e74c3c');
    }

    // ============= APPOINTMENT OPERATIONS =============

    async addAppointment() {
        const type = document.getElementById('appointment-type').value;
        const title = document.getElementById('appointment-title').value.trim();
        const timeInput = document.getElementById('appointment-time').value;
        const location = document.getElementById('appointment-location').value.trim();
        const notes = document.getElementById('appointment-notes').value.trim();

        if (!type || !title || !timeInput) {
            alert('Por favor completa todos los campos obligatorios');
            return;
        }

        const appointment = {
            time: new Date(timeInput).toISOString(),
            type,
            title,
            location,
            notes,
            completed: false,
            timezone: this.timezone
        };

        try {
            if (this.useIndexedDB) {
                const id = await db.addAppointment(appointment);
                this.appointments.push({ id, timestamp: appointment.time, ...appointment });
            } else {
                const localAppt = { id: Date.now(), timestamp: appointment.time, ...appointment };
                this.appointments.push(localAppt);
                this.saveToLocalStorage();
            }

            await this.renderAppointmentList();
            this.closeAppointmentModal();
            this.setDefaultAppointmentTime();
            document.getElementById('appointment-title').value = '';
            document.getElementById('appointment-location').value = '';
            document.getElementById('appointment-notes').value = '';
            
            this.sendNotification('Cita agregada', `${title} - ${this.formatDateTime(appointment.time)}`);
        } catch (error) {
            console.error('Failed to add appointment:', error);
            alert('Error al guardar la cita.');
        }
    }

    async deleteAppointment(id) {
        if (confirm('¿Estás seguro de que quieres eliminar esta cita?')) {
            try {
                if (this.useIndexedDB) await db.deleteAppointment(id);
                this.appointments = this.appointments.filter(a => a.id !== id);
                if (!this.useIndexedDB) this.saveToLocalStorage();
                await this.renderAppointmentList();
            } catch (error) {
                console.error('Failed to delete appointment:', error);
                alert('Error al eliminar la cita.');
            }
        }
    }

    renderAppointmentList() {
        const upcomingContainer = document.getElementById('upcoming-appointments-list');
        const pastContainer = document.getElementById('past-appointments-list');
        if (!upcomingContainer || !pastContainer) return;

        const now = new Date();
        const upcoming = this.appointments.filter(a => new Date(a.timestamp) >= now).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const past = this.appointments.filter(a => new Date(a.timestamp) < now).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        const typeIcons = {
            doctor: '👨‍⚕️',
            vaccine: '💉',
            study: '🔬',
            specialist: '🩺',
            other: '📋'
        };

        if (upcoming.length === 0) {
            upcomingContainer.innerHTML = '<div class="empty-state"><p>No hay citas programadas</p></div>';
        } else {
            upcomingContainer.innerHTML = upcoming.map(a => `
                <div class="feeding-item appointment-upcoming">
                    <div class="feeding-info">
                        <div class="feeding-time">${typeIcons[a.type]} ${this.formatDateTime(a.timestamp)}</div>
                        <div class="feeding-amount"><strong>${a.title}</strong></div>
                        ${a.location ? `<div class="diaper-notes">📍 ${a.location}</div>` : ''}
                        ${a.notes ? `<div class="diaper-notes">${a.notes}</div>` : ''}
                    </div>
                    <div class="feeding-actions">
                        <button class="btn btn-danger" onclick="tracker.deleteAppointment(${a.id})">Eliminar</button>
                    </div>
                </div>
            `).join('');
        }

        if (past.length === 0) {
            pastContainer.innerHTML = '<div class="empty-state"><p>No hay citas pasadas</p></div>';
        } else {
            pastContainer.innerHTML = past.map(a => `
                <div class="feeding-item">
                    <div class="feeding-info">
                        <div class="feeding-time">${typeIcons[a.type]} ${this.formatDateTime(a.timestamp)}</div>
                        <div class="feeding-amount"><strong>${a.title}</strong></div>
                        ${a.location ? `<div class="diaper-notes">📍 ${a.location}</div>` : ''}
                        ${a.notes ? `<div class="diaper-notes">${a.notes}</div>` : ''}
                    </div>
                    <div class="feeding-actions">
                        <button class="btn btn-danger" onclick="tracker.deleteAppointment(${a.id})">Eliminar</button>
                    </div>
                </div>
            `).join('');
        }
    }

    // ============= JOURNAL OPERATIONS =============

    async addJournalEntry() {
        const category = document.getElementById('journal-category').value;
        const title = document.getElementById('journal-title').value.trim();
        const timeInput = document.getElementById('journal-time').value;
        const description = document.getElementById('journal-description').value.trim();
        const tags = document.getElementById('journal-tags').value.trim();

        if (!category || !title || !timeInput || !description) {
            alert('Por favor completa todos los campos obligatorios');
            return;
        }

        const entry = {
            time: new Date(timeInput).toISOString(),
            category,
            title,
            description,
            tags: tags.split(',').map(t => t.trim()).filter(t => t),
            timezone: this.timezone
        };

        try {
            if (this.useIndexedDB) {
                const id = await db.addJournalEntry(entry);
                this.journalEntries.unshift({ id, timestamp: entry.time, ...entry });
            } else {
                const localEntry = { id: Date.now(), timestamp: entry.time, ...entry };
                this.journalEntries.unshift(localEntry);
                this.saveToLocalStorage();
            }

            await this.renderJournalList();
            this.closeJournalModal();
            this.setDefaultJournalTime();
            document.getElementById('journal-title').value = '';
            document.getElementById('journal-description').value = '';
            document.getElementById('journal-tags').value = '';
            
            this.sendNotification('Evento registrado', title);
        } catch (error) {
            console.error('Failed to add journal entry:', error);
            alert('Error al guardar el evento.');
        }
    }

    async deleteJournalEntry(id) {
        if (confirm('¿Estás seguro de que quieres eliminar este evento?')) {
            try {
                if (this.useIndexedDB) await db.deleteJournalEntry(id);
                this.journalEntries = this.journalEntries.filter(e => e.id !== id);
                if (!this.useIndexedDB) this.saveToLocalStorage();
                await this.renderJournalList();
            } catch (error) {
                console.error('Failed to delete journal entry:', error);
                alert('Error al eliminar el evento.');
            }
        }
    }

    renderJournalList() {
        const container = document.getElementById('journal-list');
        if (!container) return;

        if (this.journalEntries.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No hay eventos registrados</p></div>';
            return;
        }

        const categoryIcons = {
            health: '🏥',
            behavior: '😊',
            milestone: '⭐',
            concern: '⚠️',
            emergency: '🚨',
            other: '📝'
        };

        container.innerHTML = this.journalEntries.map(e => `
            <div class="journal-entry ${e.category === 'emergency' ? 'journal-emergency' : ''}">
                <div class="feeding-info">
                    <div class="feeding-time">${categoryIcons[e.category]} ${this.formatDateTime(e.timestamp)}</div>
                    <div class="feeding-amount"><strong>${e.title}</strong></div>
                    <div class="journal-description">${e.description}</div>
                    ${e.tags && e.tags.length > 0 ? `
                        <div class="journal-tags">
                            ${e.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                        </div>
                    ` : ''}
                </div>
                <div class="feeding-actions">
                    <button class="btn btn-danger" onclick="tracker.deleteJournalEntry(${e.id})">Eliminar</button>
                </div>
            </div>
        `).join('');
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
        this.renderTemperatureChart();
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
        localStorage.setItem('medicines', JSON.stringify(this.medicines));
        localStorage.setItem('temperatures', JSON.stringify(this.temperatures));
        localStorage.setItem('appointments', JSON.stringify(this.appointments));
        localStorage.setItem('journalEntries', JSON.stringify(this.journalEntries));
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

            // Load medicines
            const medicinesData = await db.getMedicines();
            this.medicines = medicinesData.map(m => ({
                id: m.id,
                timestamp: m.time,
                name: m.name,
                dose: m.dose,
                interval: m.interval,
                notes: m.notes,
                active: m.active,
                nextDose: m.nextDose,
                timezone: m.timezone
            }));

            // Load temperatures
            const temperaturesData = await db.getTemperatures();
            this.temperatures = temperaturesData.map(t => ({
                id: t.id,
                timestamp: t.time,
                value: t.value,
                notes: t.notes,
                timezone: t.timezone
            }));

            // Load appointments
            const appointmentsData = await db.getAppointments();
            this.appointments = appointmentsData.map(a => ({
                id: a.id,
                timestamp: a.time,
                type: a.type,
                title: a.title,
                location: a.location,
                notes: a.notes,
                completed: a.completed,
                timezone: a.timezone
            }));

            // Load journal entries
            const journalData = await db.getJournalEntries();
            this.journalEntries = journalData.map(j => ({
                id: j.id,
                timestamp: j.time,
                category: j.category,
                title: j.title,
                description: j.description,
                tags: j.tags,
                timezone: j.timezone
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

            console.log(`📊 Loaded ${this.feedings.length} feedings, ${this.diapers.length} diapers, ${this.measurements.length} measurements, ${this.medicines.length} medicines, ${this.temperatures.length} temperatures, ${this.appointments.length} appointments, and ${this.journalEntries.length} journal entries`);
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

        const medicinesData = localStorage.getItem('medicines');
        if (medicinesData) {
            this.medicines = JSON.parse(medicinesData);
        }

        const temperaturesData = localStorage.getItem('temperatures');
        if (temperaturesData) {
            this.temperatures = JSON.parse(temperaturesData);
        }

        const appointmentsData = localStorage.getItem('appointments');
        if (appointmentsData) {
            this.appointments = JSON.parse(appointmentsData);
        }

        const journalData = localStorage.getItem('journalEntries');
        if (journalData) {
            this.journalEntries = JSON.parse(journalData);
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

    // ============= ANALYTICS FUNCTIONS =============

    populateMedicineFilter() {
        const select = document.getElementById('medicine-filter');
        if (!select) return;

        // Get unique medicine names
        const uniqueMedicines = [...new Set(this.medicines.map(m => m.name))];
        
        select.innerHTML = '<option value="">Todos los medicamentos</option>';
        uniqueMedicines.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            select.appendChild(option);
        });
    }

    generateAnalytics() {
        // Get selected time range
        const activeRangeBtn = document.querySelector('.time-range-btn.active');
        const daysRange = parseInt(activeRangeBtn.dataset.range);
        
        // Get selected variables
        const selectedVars = Array.from(document.querySelectorAll('.analytics-var:checked'))
            .map(cb => cb.dataset.var);
        
        if (selectedVars.length === 0) {
            alert('Por favor selecciona al menos una variable para analizar');
            return;
        }

        // Get medicine filter if applicable
        const medicineFilter = document.getElementById('medicine-filter').value;

        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysRange);

        // Collect data for each variable
        const analyticsData = {};
        
        if (selectedVars.includes('feedings')) {
            analyticsData.feedings = this.getAnalyticsData('feedings', startDate, endDate);
        }
        if (selectedVars.includes('diapers')) {
            analyticsData.diapers = this.getAnalyticsData('diapers', startDate, endDate);
        }
        if (selectedVars.includes('weight')) {
            analyticsData.weight = this.getAnalyticsData('weight', startDate, endDate);
        }
        if (selectedVars.includes('height')) {
            analyticsData.height = this.getAnalyticsData('height', startDate, endDate);
        }
        if (selectedVars.includes('temperature')) {
            analyticsData.temperature = this.getAnalyticsData('temperature', startDate, endDate);
        }
        if (selectedVars.includes('medicines')) {
            analyticsData.medicines = this.getAnalyticsData('medicines', startDate, endDate, medicineFilter);
        }

        // Generate summary cards
        this.renderAnalyticsSummary(analyticsData, daysRange);

        // Generate comparison chart
        this.renderAnalyticsChart(analyticsData, daysRange);

        // Generate insights
        this.generateInsights(analyticsData, daysRange);

        // Show results
        document.getElementById('analytics-results').style.display = 'block';
        
        // Scroll to results
        document.getElementById('analytics-results').scrollIntoView({ behavior: 'smooth' });
    }

    getAnalyticsData(variable, startDate, endDate, filter = null) {
        let data = [];
        
        switch(variable) {
            case 'feedings':
                data = this.feedings.filter(f => {
                    const date = new Date(f.timestamp);
                    return date >= startDate && date <= endDate;
                });
                return {
                    count: data.length,
                    avgPerDay: (data.length / this.getDaysDiff(startDate, endDate)).toFixed(1),
                    totalAmount: data.filter(f => f.amount).reduce((sum, f) => sum + f.amount, 0),
                    avgAmount: data.filter(f => f.amount).length > 0 
                        ? (data.filter(f => f.amount).reduce((sum, f) => sum + f.amount, 0) / data.filter(f => f.amount).length).toFixed(1)
                        : 0,
                    byDay: this.groupByDay(data, startDate, endDate)
                };
                
            case 'diapers':
                data = this.diapers.filter(d => {
                    const date = new Date(d.timestamp);
                    return date >= startDate && date <= endDate;
                });
                return {
                    count: data.length,
                    avgPerDay: (data.length / this.getDaysDiff(startDate, endDate)).toFixed(1),
                    peeCount: data.filter(d => d.hasPee).length,
                    poopCount: data.filter(d => d.hasPoop).length,
                    byDay: this.groupByDay(data, startDate, endDate)
                };
                
            case 'weight':
                data = this.measurements.filter(m => {
                    const date = new Date(m.timestamp);
                    return m.weight && date >= startDate && date <= endDate;
                }).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                
                return {
                    count: data.length,
                    latest: data.length > 0 ? data[data.length - 1].weight : null,
                    earliest: data.length > 0 ? data[0].weight : null,
                    change: data.length > 1 ? (data[data.length - 1].weight - data[0].weight).toFixed(2) : 0,
                    data: data.map(m => ({ date: new Date(m.timestamp), value: m.weight }))
                };
                
            case 'height':
                data = this.measurements.filter(m => {
                    const date = new Date(m.timestamp);
                    return m.height && date >= startDate && date <= endDate;
                }).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                
                return {
                    count: data.length,
                    latest: data.length > 0 ? data[data.length - 1].height : null,
                    earliest: data.length > 0 ? data[0].height : null,
                    change: data.length > 1 ? (data[data.length - 1].height - data[0].height).toFixed(2) : 0,
                    data: data.map(m => ({ date: new Date(m.timestamp), value: m.height }))
                };
                
            case 'temperature':
                data = this.temperatures.filter(t => {
                    const date = new Date(t.timestamp);
                    return date >= startDate && date <= endDate;
                }).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                
                const temps = data.map(t => t.value);
                return {
                    count: data.length,
                    avg: temps.length > 0 ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1) : 0,
                    max: temps.length > 0 ? Math.max(...temps).toFixed(1) : 0,
                    min: temps.length > 0 ? Math.min(...temps).toFixed(1) : 0,
                    feverCount: data.filter(t => t.value >= 38).length,
                    data: data.map(t => ({ date: new Date(t.timestamp), value: t.value }))
                };
                
            case 'medicines':
                data = this.medicines.filter(m => {
                    const date = new Date(m.timestamp);
                    const matchesDate = date >= startDate && date <= endDate;
                    const matchesFilter = !filter || m.name === filter;
                    return matchesDate && matchesFilter;
                });
                
                return {
                    count: data.length,
                    avgPerDay: (data.length / this.getDaysDiff(startDate, endDate)).toFixed(1),
                    uniqueMeds: [...new Set(data.map(m => m.name))].length,
                    byName: this.groupMedicinesByName(data),
                    byDay: this.groupByDay(data, startDate, endDate)
                };
                
            default:
                return {};
        }
    }

    getDaysDiff(startDate, endDate) {
        const diffTime = Math.abs(endDate - startDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays || 1;
    }

    groupByDay(data, startDate, endDate) {
        const days = this.getDaysDiff(startDate, endDate);
        const result = {};
        
        for (let i = 0; i < days; i++) {
            const day = new Date(startDate);
            day.setDate(day.getDate() + i);
            const dayKey = day.toISOString().split('T')[0];
            result[dayKey] = 0;
        }
        
        data.forEach(item => {
            const dayKey = new Date(item.timestamp).toISOString().split('T')[0];
            if (result.hasOwnProperty(dayKey)) {
                result[dayKey]++;
            }
        });
        
        return result;
    }

    groupMedicinesByName(data) {
        const result = {};
        data.forEach(m => {
            if (!result[m.name]) {
                result[m.name] = 0;
            }
            result[m.name]++;
        });
        return result;
    }

    renderAnalyticsSummary(analyticsData, daysRange) {
        const container = document.getElementById('analytics-summary-cards');
        if (!container) return;

        let html = '';

        if (analyticsData.feedings) {
            const d = analyticsData.feedings;
            html += `
                <div class="stat-card">
                    <div class="stat-label">Alimentaciones</div>
                    <div class="stat-value">${d.count}</div>
                    <div class="stat-subtext">${d.avgPerDay} por día</div>
                    ${d.totalAmount > 0 ? `<div class="stat-subtext">${d.totalAmount}ml total</div>` : ''}
                </div>
            `;
        }

        if (analyticsData.diapers) {
            const d = analyticsData.diapers;
            html += `
                <div class="stat-card">
                    <div class="stat-label">Pañales</div>
                    <div class="stat-value">${d.count}</div>
                    <div class="stat-subtext">${d.avgPerDay} por día</div>
                    <div class="stat-subtext">💧 ${d.peeCount} | 💩 ${d.poopCount}</div>
                </div>
            `;
        }

        if (analyticsData.weight) {
            const d = analyticsData.weight;
            html += `
                <div class="stat-card">
                    <div class="stat-label">Peso</div>
                    <div class="stat-value">${d.latest || '--'}kg</div>
                    <div class="stat-subtext">${d.change > 0 ? '+' : ''}${d.change}kg en ${daysRange} días</div>
                </div>
            `;
        }

        if (analyticsData.height) {
            const d = analyticsData.height;
            html += `
                <div class="stat-card">
                    <div class="stat-label">Altura</div>
                    <div class="stat-value">${d.latest || '--'}cm</div>
                    <div class="stat-subtext">${d.change > 0 ? '+' : ''}${d.change}cm en ${daysRange} días</div>
                </div>
            `;
        }

        if (analyticsData.temperature) {
            const d = analyticsData.temperature;
            html += `
                <div class="stat-card">
                    <div class="stat-label">Temperatura</div>
                    <div class="stat-value">${d.avg}°C</div>
                    <div class="stat-subtext">Min: ${d.min}°C | Max: ${d.max}°C</div>
                    ${d.feverCount > 0 ? `<div class="stat-subtext">⚠️ ${d.feverCount} episodios de fiebre</div>` : ''}
                </div>
            `;
        }

        if (analyticsData.medicines) {
            const d = analyticsData.medicines;
            html += `
                <div class="stat-card">
                    <div class="stat-label">Medicamentos</div>
                    <div class="stat-value">${d.count}</div>
                    <div class="stat-subtext">${d.avgPerDay} dosis por día</div>
                    <div class="stat-subtext">${d.uniqueMeds} medicamento(s) diferentes</div>
                </div>
            `;
        }

        container.innerHTML = html;
    }

    renderAnalyticsChart(analyticsData, daysRange) {
        const canvas = document.getElementById('analytics-chart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        canvas.width = canvas.parentElement.offsetWidth;
        canvas.height = 400;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const padding = 50;
        const chartWidth = canvas.width - 2 * padding;
        const chartHeight = canvas.height - 2 * padding;

        // Prepare data series
        const series = [];
        const colors = {
            feedings: '#4a90e2',
            diapers: '#50c878',
            weight: '#9b59b6',
            height: '#e67e22',
            temperature: '#e74c3c',
            medicines: '#f39c12'
        };

        // Draw axes
        ctx.strokeStyle = this.darkMode ? '#b0b0b0' : '#2c3e50';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, canvas.height - padding);
        ctx.lineTo(canvas.width - padding, canvas.height - padding);
        ctx.stroke();

        // Determine which variables to plot
        let hasCountData = false;
        let hasValueData = false;
        
        // Check what type of data we have
        if (analyticsData.feedings?.byDay || analyticsData.diapers?.byDay || analyticsData.medicines?.byDay) {
            hasCountData = true;
        }
        if (analyticsData.weight?.data || analyticsData.height?.data || analyticsData.temperature?.data) {
            hasValueData = true;
        }

        // If we have both count and value data, we need dual axis
        if (hasCountData && hasValueData) {
            // Draw on left axis (counts)
            this.drawAnalyticsCountSeries(ctx, analyticsData, padding, chartWidth, chartHeight, colors, canvas);
            // Draw on right axis (values)
            this.drawAnalyticsValueSeries(ctx, analyticsData, padding, chartWidth, chartHeight, colors, canvas);
        } else if (hasCountData) {
            this.drawAnalyticsCountSeries(ctx, analyticsData, padding, chartWidth, chartHeight, colors, canvas);
        } else if (hasValueData) {
            this.drawAnalyticsValueSeries(ctx, analyticsData, padding, chartWidth, chartHeight, colors, canvas);
        } else {
            ctx.fillStyle = this.darkMode ? '#b0b0b0' : '#7f8c8d';
            ctx.font = '16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No hay suficientes datos para el período seleccionado', canvas.width / 2, canvas.height / 2);
        }

        // Draw legend
        this.drawAnalyticsLegend(ctx, analyticsData, colors, canvas);
    }

    drawAnalyticsCountSeries(ctx, analyticsData, padding, chartWidth, chartHeight, colors, canvas) {
        // Collect all count-based data (feedings, diapers, medicines by day)
        const allDates = new Set();
        const seriesData = {};

        if (analyticsData.feedings?.byDay) {
            Object.keys(analyticsData.feedings.byDay).forEach(date => allDates.add(date));
            seriesData.feedings = analyticsData.feedings.byDay;
        }
        if (analyticsData.diapers?.byDay) {
            Object.keys(analyticsData.diapers.byDay).forEach(date => allDates.add(date));
            seriesData.diapers = analyticsData.diapers.byDay;
        }
        if (analyticsData.medicines?.byDay) {
            Object.keys(analyticsData.medicines.byDay).forEach(date => allDates.add(date));
            seriesData.medicines = analyticsData.medicines.byDay;
        }

        const sortedDates = Array.from(allDates).sort();
        if (sortedDates.length === 0) return;

        // Find max value for scaling
        let maxCount = 0;
        Object.values(seriesData).forEach(data => {
            const max = Math.max(...Object.values(data));
            if (max > maxCount) maxCount = max;
        });

        if (maxCount === 0) maxCount = 1;

        // Draw each series
        Object.keys(seriesData).forEach(key => {
            const data = seriesData[key];
            ctx.strokeStyle = colors[key];
            ctx.lineWidth = 3;
            ctx.beginPath();

            let started = false;
            sortedDates.forEach((date, index) => {
                const value = data[date] || 0;
                const x = padding + (index / (sortedDates.length - 1 || 1)) * chartWidth;
                const y = canvas.height - padding - (value / maxCount) * chartHeight;

                if (!started) {
                    ctx.moveTo(x, y);
                    started = true;
                } else {
                    ctx.lineTo(x, y);
                }

                // Draw point
                ctx.fillStyle = colors[key];
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fill();
            });

            ctx.stroke();
        });

        // Draw date labels
        ctx.fillStyle = this.darkMode ? '#b0b0b0' : '#7f8c8d';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        const labelStep = Math.ceil(sortedDates.length / 10);
        sortedDates.forEach((date, index) => {
            if (index % labelStep === 0) {
                const x = padding + (index / (sortedDates.length - 1 || 1)) * chartWidth;
                const shortDate = new Date(date).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
                ctx.fillText(shortDate, x, canvas.height - padding + 20);
            }
        });
    }

    drawAnalyticsValueSeries(ctx, analyticsData, padding, chartWidth, chartHeight, colors, canvas) {
        // Collect all value-based data (weight, height, temperature)
        const seriesData = {};
        let allDates = [];

        if (analyticsData.weight?.data && analyticsData.weight.data.length > 0) {
            seriesData.weight = analyticsData.weight.data;
            allDates = allDates.concat(analyticsData.weight.data.map(d => d.date));
        }
        if (analyticsData.height?.data && analyticsData.height.data.length > 0) {
            seriesData.height = analyticsData.height.data;
            allDates = allDates.concat(analyticsData.height.data.map(d => d.date));
        }
        if (analyticsData.temperature?.data && analyticsData.temperature.data.length > 0) {
            seriesData.temperature = analyticsData.temperature.data;
            allDates = allDates.concat(analyticsData.temperature.data.map(d => d.date));
        }

        if (allDates.length === 0) return;

        // Sort all dates
        allDates.sort((a, b) => a - b);
        const minDate = allDates[0].getTime();
        const maxDate = allDates[allDates.length - 1].getTime();
        const dateRange = maxDate - minDate || 1;

        // Find min and max values for each series (normalize separately)
        Object.keys(seriesData).forEach(key => {
            const values = seriesData[key].map(d => d.value);
            const minVal = Math.min(...values);
            const maxVal = Math.max(...values);
            const range = maxVal - minVal || 1;

            ctx.strokeStyle = colors[key];
            ctx.lineWidth = 3;
            ctx.beginPath();

            seriesData[key].forEach((point, index) => {
                const x = padding + ((point.date.getTime() - minDate) / dateRange) * chartWidth;
                const normalizedValue = (point.value - minVal) / range;
                const y = canvas.height - padding - normalizedValue * chartHeight;

                if (index === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }

                // Draw point
                ctx.fillStyle = colors[key];
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fill();

                // Draw value label
                ctx.fillStyle = this.darkMode ? '#ffffff' : '#2c3e50';
                ctx.font = '10px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(point.value, x, y - 10);
            });

            ctx.stroke();
        });
    }

    drawAnalyticsLegend(ctx, analyticsData, colors, canvas) {
        const legendItems = [];
        const labels = {
            feedings: 'Alimentaciones',
            diapers: 'Pañales',
            weight: 'Peso (kg)',
            height: 'Altura (cm)',
            temperature: 'Temperatura (°C)',
            medicines: 'Medicamentos'
        };

        Object.keys(analyticsData).forEach(key => {
            if (analyticsData[key]) {
                legendItems.push({ key, label: labels[key], color: colors[key] });
            }
        });

        const legendX = canvas.width - 200;
        const legendY = 20;
        const lineHeight = 20;

        ctx.font = '12px sans-serif';
        ctx.textAlign = 'left';

        legendItems.forEach((item, index) => {
            const y = legendY + index * lineHeight;
            
            // Draw color box
            ctx.fillStyle = item.color;
            ctx.fillRect(legendX, y, 15, 15);
            
            // Draw label
            ctx.fillStyle = this.darkMode ? '#ffffff' : '#2c3e50';
            ctx.fillText(item.label, legendX + 20, y + 12);
        });
    }

    generateInsights(analyticsData, daysRange) {
        const container = document.getElementById('analytics-insights');
        if (!container) return;

        const insights = [];

        // Feeding insights
        if (analyticsData.feedings) {
            const d = analyticsData.feedings;
            if (parseFloat(d.avgPerDay) < 6) {
                insights.push({
                    type: 'warning',
                    text: `Promedio de alimentaciones bajo: ${d.avgPerDay} por día. Se recomiendan al menos 6-8 tomas diarias para recién nacidos.`
                });
            } else if (parseFloat(d.avgPerDay) >= 8) {
                insights.push({
                    type: 'positive',
                    text: `Excelente frecuencia de alimentación: ${d.avgPerDay} tomas por día.`
                });
            }
        }

        // Weight insights
        if (analyticsData.weight) {
            const d = analyticsData.weight;
            if (d.change > 0) {
                insights.push({
                    type: 'positive',
                    text: `Ganancia de peso saludable: +${d.change}kg en ${daysRange} días (${(d.change / daysRange * 7).toFixed(1)}kg/semana).`
                });
            } else if (d.change < 0) {
                insights.push({
                    type: 'negative',
                    text: `Pérdida de peso detectada: ${d.change}kg en ${daysRange} días. Consulta con tu pediatra.`
                });
            }
        }

        // Temperature insights
        if (analyticsData.temperature) {
            const d = analyticsData.temperature;
            if (d.feverCount > 0) {
                insights.push({
                    type: 'warning',
                    text: `Se registraron ${d.feverCount} episodios de fiebre (≥38°C) en ${daysRange} días. Temperatura máxima: ${d.max}°C.`
                });
            }
            if (parseFloat(d.avg) <= 37.5) {
                insights.push({
                    type: 'positive',
                    text: `Temperatura promedio normal: ${d.avg}°C.`
                });
            }
        }

        // Diaper insights
        if (analyticsData.diapers) {
            const d = analyticsData.diapers;
            if (parseFloat(d.avgPerDay) < 6) {
                insights.push({
                    type: 'warning',
                    text: `Cambios de pañal por debajo del promedio: ${d.avgPerDay} por día. Se esperan 6-8 cambios diarios.`
                });
            }
        }

        // Medicine insights
        if (analyticsData.medicines) {
            const d = analyticsData.medicines;
            if (d.count > 0) {
                const topMedicine = Object.entries(d.byName).sort((a, b) => b[1] - a[1])[0];
                insights.push({
                    type: 'info',
                    text: `Medicamento más frecuente: ${topMedicine[0]} (${topMedicine[1]} dosis en ${daysRange} días).`
                });
            }
        }

        // Correlation insights
        if (analyticsData.temperature && analyticsData.medicines) {
            if (analyticsData.temperature.feverCount > 0 && analyticsData.medicines.count > 0) {
                insights.push({
                    type: 'info',
                    text: `Correlación detectada: ${analyticsData.medicines.count} dosis de medicamento durante período con ${analyticsData.temperature.feverCount} episodios de fiebre.`
                });
            }
        }

        if (insights.length === 0) {
            insights.push({
                type: 'info',
                text: 'No se detectaron patrones significativos en el período seleccionado. Continúa registrando datos para obtener más información.'
            });
        }

        container.innerHTML = insights.map(insight => `
            <div class="insight-item insight-${insight.type}">
                <strong>${insight.type === 'positive' ? '✅' : insight.type === 'warning' ? '⚠️' : insight.type === 'negative' ? '❌' : 'ℹ️'} Observación:</strong>
                ${insight.text}
            </div>
        `).join('');
    }
}

// Initialize the app
let tracker;
window.tracker = null; // Make tracker globally accessible for onclick handlers
document.addEventListener('DOMContentLoaded', async () => {
    tracker = new FeedingTracker();
    window.tracker = tracker; // Assign to window object
    await tracker.init();
});

