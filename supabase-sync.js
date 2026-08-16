// supabase-sync.js

// ====== MODULE STATE ======
let _supabase = null;
let _supabaseClientProfile = null;
const VALID_RECORD_TYPES = new Set(['feeding', 'diaper', 'measurement', 'medicine', 'temperature', 'appointment', 'journal']);

// ====== 1. Config & Client Init ======
function getSupabaseConfig() {
    const lsUrl = localStorage.getItem('bft_supabase_url');
    const lsKey = localStorage.getItem('bft_supabase_key');
    if (lsUrl && lsKey) {
        return { url: lsUrl, anonKey: lsKey };
    }
    if (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url && window.SUPABASE_CONFIG.anonKey) {
        return window.SUPABASE_CONFIG;
    }
    return null;
}

function initSupabaseClient(profileId = null) {
    const targetProfile = isValidUUID(profileId) ? profileId : null;
    const config = getSupabaseConfig();
    if (!config) return null;
    if (typeof window.supabase === 'undefined') {
        console.error('Supabase library not loaded');
        return null;
    }

    if (_supabase && _supabaseClientProfile === targetProfile) {
        return _supabase;
    }

    const options = targetProfile
        ? { global: { headers: { 'x-profile-id': targetProfile } } }
        : undefined;

    _supabase = options
        ? window.supabase.createClient(config.url, config.anonKey, options)
        : window.supabase.createClient(config.url, config.anonKey);
    _supabaseClientProfile = targetProfile;
    return _supabase;
}

function isSupabaseConfigured() {
    return getSupabaseConfig() !== null;
}

function saveSupabaseConfig(url, key) {
    if (!url || !key) return false;
    localStorage.setItem('bft_supabase_url', url);
    localStorage.setItem('bft_supabase_key', key);
    return true;
}

function clearSupabaseConfig() {
    localStorage.removeItem('bft_supabase_url');
    localStorage.removeItem('bft_supabase_key');
    _supabase = null;
    _supabaseClientProfile = null;
}

// ====== 2. UUID Validation ======
function isValidUUID(str) {
    if (!str || typeof str !== 'string') return false;
    const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return regex.test(str);
}

function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// ====== 3. Profile & Baby Management ======
function getProfileId() {
    const urlParams = new URLSearchParams(window.location.search);
    const paramId = urlParams.get('profile');
    if (isValidUUID(paramId)) {
        return paramId;
    }
    const lsId = localStorage.getItem('bft_profile_id');
    if (isValidUUID(lsId)) {
        return lsId;
    }
    return null;
}

function setProfileId(id) {
    if (!isValidUUID(id)) return;
    const previous = localStorage.getItem('bft_profile_id');
    if (previous && previous !== id) {
        localStorage.removeItem('bft_baby_id');
    }
    localStorage.setItem('bft_profile_id', id);
    const url = new URL(window.location);
    url.searchParams.set('profile', id);
    window.history.replaceState({}, '', url);
}

async function createProfile() {
    const newProfileId = generateUUID();
    const client = initSupabaseClient(newProfileId);
    if (!client) throw new Error('Supabase not configured');
    
    // Create profile
    const { data: profile, error: profileErr } = await client
        .from('bft_profiles')
        .insert([{ id: newProfileId }])
        .select()
        .single();
        
    if (profileErr) throw profileErr;
    
    // Create default baby
    const scopedClient = initSupabaseClient(profile.id);
    const { data: baby, error: babyErr } = await scopedClient
        .from('bft_babies')
        .insert([{ profile_id: profile.id, name: 'Bebé' }])
        .select()
        .single();
        
    if (babyErr) throw babyErr;
    
    return { profileId: profile.id, babyId: baby.id };
}

async function ensureProfile() {
    let profileId = getProfileId();
    let babyId = getDefaultBabyId();
    const baseClient = initSupabaseClient();
    if (!baseClient) {
        return { profileId: null, babyId: null };
    }
    
    if (profileId) {
        const client = initSupabaseClient(profileId);
        // Verify profile exists
        const { data, error } = await client
            .from('bft_profiles')
            .select('id')
            .eq('id', profileId)
            .maybeSingle();
            
        if (error || !data) {
            // Invalid profile id, clear it
            profileId = null;
            localStorage.removeItem('bft_profile_id');
            localStorage.removeItem('bft_baby_id');
            babyId = null;
        } else {
            // Validate cached baby belongs to current profile.
            let babyMatchesProfile = false;
            if (isValidUUID(babyId)) {
                const { data: babyData, error: babyErr } = await client
                    .from('bft_babies')
                    .select('id')
                    .eq('profile_id', profileId)
                    .eq('id', babyId)
                    .maybeSingle();
                babyMatchesProfile = !babyErr && !!babyData;
            }

            if (!babyMatchesProfile) {
                // Find or create a baby for this profile.
                const { data: babies, error: babiesErr } = await client
                    .from('bft_babies')
                    .select('id')
                    .eq('profile_id', profileId)
                    .limit(1);
                if (babiesErr) throw babiesErr;

                if (babies && babies.length > 0) {
                    babyId = babies[0].id;
                    localStorage.setItem('bft_baby_id', babyId);
                } else {
                    const { data: createdBaby, error: createBabyErr } = await client
                        .from('bft_babies')
                        .insert([{ profile_id: profileId, name: 'Bebé' }])
                        .select('id')
                        .single();
                    if (createBabyErr) throw createBabyErr;
                    babyId = createdBaby.id;
                    localStorage.setItem('bft_baby_id', babyId);
                }
            }
        }
    }
    
    if (!profileId) {
        const ids = await createProfile();
        profileId = ids.profileId;
        babyId = ids.babyId;
        setProfileId(profileId);
        localStorage.setItem('bft_baby_id', babyId);
    }
    
    return { profileId, babyId };
}

function getDefaultBabyId() {
    return localStorage.getItem('bft_baby_id') || null;
}

// ====== 4. Input Sanitization ======
function sanitizeText(str, maxLen = 200) {
    if (str === null || str === undefined) return '';
    const s = String(str);
    // Strip control chars (\x00-\x1F, \x7F) and trim
    const sanitized = s.replace(/[\x00-\x1F\x7F]/g, '').trim();
    return sanitized.slice(0, maxLen);
}

function sanitizeNumber(val, fallback = 0, min = 0, max = 9999999) {
    const num = parseFloat(val);
    if (!isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function isValidRecordType(type) {
    return VALID_RECORD_TYPES.has(type);
}

function sanitizeRecord(record, profileId, babyId, recordType) {
    if (!isValidRecordType(recordType)) {
        throw new Error(`Invalid record type: ${recordType}`);
    }
    
    // Extract ID (must be a number)
    const id = parseInt(record.id, 10);
    if (isNaN(id)) throw new Error('Record must have a valid numeric id');
    
    // Extract time
    const recordTime = record.time || record.timestamp || new Date().toISOString();
    
    // Build JSONB payload (everything except id)
    const data = { ...record };
    delete data.id;
    // We can also remove time since we store it in record_time, but we'll leave it in JSON for now
    
    // Sanitize string values inside data
    for (const key in data) {
        if (typeof data[key] === 'string') {
            data[key] = sanitizeText(data[key], 1000); // 1000 max len for general JSON payload strings
        }
    }
    
    return {
        id: id,
        profile_id: profileId,
        baby_id: babyId,
        record_type: recordType,
        data: data,
        record_time: recordTime,
        updated_at: new Date().toISOString()
    };
}

function mapDbToLocal(row) {
    if (!row || !row.data) return null;
    const local = { ...row.data, id: row.id, time: row.record_time };
    
    // Re-sanitize text fields from DB as defense
    for (const key in local) {
        if (typeof local[key] === 'string' && key !== 'time') {
            local[key] = sanitizeText(local[key], 1000);
        } else if (typeof local[key] === 'number') {
            // basic check
            if (!isFinite(local[key])) local[key] = 0;
        }
    }
    return local;
}

// ====== 5. Push (local -> remote) ======
async function pushRecords(profileId, rows) {
    if (!isValidUUID(profileId)) throw new Error('Invalid profile ID');
    if (!rows || rows.length === 0) return;
    
    const client = initSupabaseClient(profileId);
    if (!client) return;

    // Deduplicate by type+id (last wins)
    const rowMap = new Map();
    for (const row of rows) {
        row.profile_id = profileId; // Force profile ID
        const dedupeKey = `${row.record_type}:${row.id}`;
        rowMap.set(dedupeKey, row);
    }
    const deduplicatedRows = Array.from(rowMap.values());

    const { error } = await client
        .from('bft_records')
        .upsert(deduplicatedRows, { onConflict: 'profile_id,record_type,id' });

    if (error) throw error;
}

async function deleteRecord(profileId, recordType, recordId) {
    if (!isValidUUID(profileId)) throw new Error('Invalid profile ID');
    if (!isValidRecordType(recordType)) throw new Error('Invalid record type');
    const client = initSupabaseClient(profileId);
    if (!client) return;
    
    const { error } = await client
        .from('bft_records')
        .delete()
        .eq('profile_id', profileId)
        .eq('record_type', recordType)
        .eq('id', recordId);
        
    if (error) throw error;
}

async function deleteAllRecords(profileId) {
    if (!isValidUUID(profileId)) throw new Error('Invalid profile ID');
    const client = initSupabaseClient(profileId);
    if (!client) return;
    
    const { error } = await client
        .from('bft_records')
        .delete()
        .eq('profile_id', profileId);
        
    if (error) throw error;
}

// ====== 6. Pull (remote -> local) ======
async function pullData(profileId) {
    if (!isValidUUID(profileId)) throw new Error('Invalid profile ID');
    const client = initSupabaseClient(profileId);
    if (!client) return null;
    
    const result = {
        feedings: [],
        diapers: [],
        measurements: [],
        medicines: [],
        temperatures: [],
        appointments: [],
        journal: [],
        totalCount: 0
    };
    
    const { data, error } = await client
        .from('bft_records')
        .select('*')
        .eq('profile_id', profileId)
        .order('record_time', { ascending: false });
        
    if (error) throw error;
    if (!data) return result;
    
    for (const row of data) {
        const local = mapDbToLocal(row);
        if (!local) continue;
        
        let type = row.record_type;
        // fallback mapping for arrays
        if (type === 'feeding') result.feedings.push(local);
        else if (type === 'diaper') result.diapers.push(local);
        else if (type === 'measurement') result.measurements.push(local);
        else if (type === 'medicine') result.medicines.push(local);
        else if (type === 'temperature') result.temperatures.push(local);
        else if (type === 'appointment') result.appointments.push(local);
        else if (type === 'journal') result.journal.push(local);
        
        result.totalCount++;
    }
    
    return result;
}

async function pullSettings(profileId, babyId) {
    if (!isValidUUID(profileId) || !isValidUUID(babyId)) throw new Error('Invalid IDs');
    const client = initSupabaseClient(profileId);
    if (!client) return null;
    
    const { data, error } = await client
        .from('bft_settings')
        .select('data')
        .eq('profile_id', profileId)
        .eq('baby_id', babyId)
        .single();
        
    if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
    }
    return data ? data.data : null;
}

// ====== 7. Settings Sync ======
async function pushSettings(profileId, babyId, settingsObj) {
    if (!isValidUUID(profileId) || !isValidUUID(babyId)) throw new Error('Invalid IDs');
    const client = initSupabaseClient(profileId);
    if (!client) return;
    
    const { error } = await client
        .from('bft_settings')
        .upsert({
            profile_id: profileId,
            baby_id: babyId,
            data: settingsObj,
            updated_at: new Date().toISOString()
        }, { onConflict: 'profile_id,baby_id' });
        
    if (error) throw error;
}

// ====== 8. Realtime Subscription ======
function subscribeToProfile(profileId, onRecordChange, onSettingsChange) {
    if (!isValidUUID(profileId)) return null;
    const client = initSupabaseClient(profileId);
    if (!client) return null;
    
    const channel = client.channel(`profile-${profileId}`);
    
    if (onRecordChange) {
        channel.on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'bft_records',
            filter: `profile_id=eq.${profileId}`
        }, (payload) => {
            onRecordChange(payload);
        });
    }
    
    if (onSettingsChange) {
        channel.on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'bft_settings',
            filter: `profile_id=eq.${profileId}`
        }, (payload) => {
            onSettingsChange(payload);
        });
    }
    
    channel.subscribe();
    return channel;
}

function unsubscribeChannel(channel) {
    if (channel && typeof channel.unsubscribe === 'function') {
        channel.unsubscribe();
    }
}

// ====== 9. Legacy Migration ======
async function migrateFromLegacySnapshot(profileId, babyId) {
    if (!isValidUUID(profileId) || !isValidUUID(babyId)) return { migrated: false };
    const client = initSupabaseClient(profileId);
    if (!client) return { migrated: false };
    
    try {
        // Try reading old table
        const { data, error } = await client
            .from('bft_latest_state')
            .select('payload')
            .eq('profile_id', profileId)
            .single();
            
        if (error || !data || !data.payload) {
            return { migrated: false }; // No legacy data or table doesn't exist
        }
        
        const state = data.payload;
        const rowsToPush = [];
        let count = 0;
        
        const mapType = (arr, type) => {
            if (Array.isArray(arr)) {
                for (const item of arr) {
                    try {
                        rowsToPush.push(sanitizeRecord(item, profileId, babyId, type));
                        count++;
                    } catch (e) {
                        console.warn('Failed to sanitize legacy record:', e);
                    }
                }
            }
        };
        
        mapType(state.feedings, 'feeding');
        mapType(state.diapers, 'diaper');
        mapType(state.measurements, 'measurement');
        mapType(state.medicines, 'medicine');
        mapType(state.temperatures, 'temperature');
        mapType(state.appointments, 'appointment');
        mapType(state.journalEntries, 'journal'); // map to 'journal'
        
        // Push all records
        if (rowsToPush.length > 0) {
            // Batch push in chunks to avoid large payload issues
            const chunkSize = 100;
            for (let i = 0; i < rowsToPush.length; i += chunkSize) {
                const chunk = rowsToPush.slice(i, i + chunkSize);
                await pushRecords(profileId, chunk);
            }
        }
        
        // Extract and push settings
        const settings = {
            timezone: state.timezone,
            darkMode: state.darkMode,
            defaultInterval: state.defaultInterval,
            dailyMilkTarget: state.dailyMilkTarget,
            birthDate: state.birthDate,
            notificationsEnabled: state.notificationsEnabled
        };
        
        await pushSettings(profileId, babyId, settings);
        
        return { migrated: true, count };
    } catch (e) {
        console.error('Migration failed:', e);
        return { migrated: false, error: e.message };
    }
}

// ====== 10. Bulk Operations ======
async function pushAllData(profileId, babyId, allData) {
    if (!isValidUUID(profileId) || !isValidUUID(babyId)) throw new Error('Invalid IDs');
    if (!allData) return;
    
    const rows = [];
    
    const addType = (arr, type) => {
        if (Array.isArray(arr)) {
            for (const item of arr) {
                try {
                    rows.push(sanitizeRecord(item, profileId, babyId, type));
                } catch (e) {
                    console.warn(`Skipping invalid ${type} record:`, e);
                }
            }
        }
    };
    
    addType(allData.feedings, 'feeding');
    addType(allData.diapers, 'diaper');
    addType(allData.measurements, 'measurement');
    addType(allData.medicines, 'medicine');
    addType(allData.temperatures, 'temperature');
    addType(allData.appointments, 'appointment');
    addType(allData.journal, 'journal');
    
    // Batch upsert in chunks
    const chunkSize = 100;
    for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        await pushRecords(profileId, chunk);
    }
}

async function deleteAllData(profileId) {
    if (!isValidUUID(profileId)) throw new Error('Invalid profile ID');
    const client = initSupabaseClient(profileId);
    if (!client) return;
    
    // Delete records
    const { error: recordsErr } = await client
        .from('bft_records')
        .delete()
        .eq('profile_id', profileId);
        
    if (recordsErr) throw recordsErr;
    
    // Delete settings
    const { error: settingsErr } = await client
        .from('bft_settings')
        .delete()
        .eq('profile_id', profileId);
        
    if (settingsErr) throw settingsErr;
}

// ====== EXPORT ======
window.BftSync = {
    getSupabaseConfig,
    initSupabaseClient,
    isSupabaseConfigured,
    saveSupabaseConfig,
    clearSupabaseConfig,
    
    isValidUUID,
    
    getProfileId,
    setProfileId,
    createProfile,
    ensureProfile,
    getDefaultBabyId,
    
    sanitizeText,
    sanitizeNumber,
    isValidRecordType,
    sanitizeRecord,
    mapDbToLocal,
    
    pushRecords,
    deleteRecord,
    deleteAllRecords,
    
    pullData,
    pullSettings,
    
    pushSettings,
    
    subscribeToProfile,
    unsubscribeChannel,
    
    migrateFromLegacySnapshot,
    
    pushAllData,
    deleteAllData
};
