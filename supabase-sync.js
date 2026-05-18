class BabyFoodSupabaseSync {
  constructor(config = {}) {
    this.config = config;
    this.client = null;
    this.autoSyncInterval = null;
    this.lastSyncAt = null;
  }

  isConfigured() {
    return Boolean(
      this.config &&
      this.config.enabled &&
      this.config.url &&
      this.config.anonKey
    );
  }

  getProfileId() {
    if (this.config.profileId && this.config.profileId.trim()) {
      return this.config.profileId.trim();
    }

    const saved = localStorage.getItem('supabase_profile_id');
    if (saved) return saved;

    const generated = (window.crypto && window.crypto.randomUUID)
      ? window.crypto.randomUUID()
      : `profile-${Date.now()}`;

    localStorage.setItem('supabase_profile_id', generated);
    return generated;
  }

  async initialize() {
    if (!this.isConfigured()) {
      return { ok: false, reason: 'not_configured' };
    }

    if (!window.supabase || !window.supabase.createClient) {
      return { ok: false, reason: 'client_missing' };
    }

    this.client = window.supabase.createClient(this.config.url, this.config.anonKey);
    return { ok: true, profileId: this.getProfileId() };
  }

  buildSnapshot(tracker) {
    return {
      generatedAt: new Date().toISOString(),
      timezone: tracker.timezone,
      darkMode: tracker.darkMode,
      defaultInterval: tracker.defaultInterval,
      dailyMilkTarget: tracker.dailyMilkTarget,
      birthDate: tracker.birthDate,
      notificationsEnabled: tracker.notificationsEnabled,
      feedings: tracker.feedings,
      diapers: tracker.diapers,
      measurements: tracker.measurements,
      medicines: tracker.medicines,
      temperatures: tracker.temperatures,
      appointments: tracker.appointments,
      journalEntries: tracker.journalEntries
    };
  }

  saveLocalEmergencyBackup(snapshot, reason = 'sync') {
    const backup = {
      reason,
      createdAt: new Date().toISOString(),
      snapshot
    };
    localStorage.setItem('bft_emergency_backup', JSON.stringify(backup));
  }

  async backupSnapshot(tracker, reason = 'manual') {
    if (!this.client) {
      return { ok: false, reason: 'not_initialized' };
    }

    const profileId = this.getProfileId();
    const snapshot = this.buildSnapshot(tracker);
    this.saveLocalEmergencyBackup(snapshot, reason);

    const { error } = await this.client.from('bft_backups').insert({
      profile_id: profileId,
      reason,
      payload: snapshot
    });

    if (error) {
      return { ok: false, reason: 'backup_failed', error };
    }

    return { ok: true };
  }

  async syncCurrentState(tracker, reason = 'manual') {
    if (!this.client) {
      return { ok: false, reason: 'not_initialized' };
    }

    const profileId = this.getProfileId();
    const snapshot = this.buildSnapshot(tracker);

    const { error } = await this.client.from('bft_latest_state').upsert({
      profile_id: profileId,
      payload: snapshot,
      updated_at: new Date().toISOString(),
      last_reason: reason
    }, { onConflict: 'profile_id' });

    if (error) {
      return { ok: false, reason: 'sync_failed', error };
    }

    this.lastSyncAt = new Date().toISOString();
    return { ok: true, lastSyncAt: this.lastSyncAt };
  }

  async backupAndSync(tracker, reason = 'manual') {
    const backupResult = await this.backupSnapshot(tracker, reason);
    if (!backupResult.ok) return backupResult;
    return this.syncCurrentState(tracker, reason);
  }

  startAutoSync(tracker, minutes = 5) {
    if (this.autoSyncInterval) clearInterval(this.autoSyncInterval);

    this.autoSyncInterval = setInterval(async () => {
      if (!navigator.onLine || !this.client) return;
      await this.backupAndSync(tracker, 'auto_interval');
    }, minutes * 60 * 1000);

    window.addEventListener('online', async () => {
      if (this.client) {
        await this.backupAndSync(tracker, 'online_reconnect');
      }
    });
  }
}

window.BabyFoodSupabaseSync = BabyFoodSupabaseSync;
