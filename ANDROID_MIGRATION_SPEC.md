# BabyFoodTrack -> Android Migration Specification (Source-Independent)

## 1. Purpose
This document is the single source of truth for migrating the BabyFoodTrack web app into a native Android app. The implementation agent must rely only on this document and must not require access to the original web source.

Primary goals:
- Preserve feature behavior parity with the current web app.
- Guarantee import/export file compatibility with the web app (CSV and JSON).
- Integrate Supabase backend in a way that can complement local storage (offline-first) and also support cloud-backed continuity.

## 2. Product Scope and Feature Inventory
The app tracks baby care data across 6 domains:

1. Feedings
- Types: bottle, breast, complementary.
- Bottle: amount (ml).
- Breast: duration (minutes).
- Complementary: food, grams, reaction, allergens[], notes.
- Per-record next feeding interval (hours) with app-level default interval fallback.

2. Diapers
- hasPee (boolean), hasPoop (boolean), level (1-3), notes.

3. Growth
- Measurements with weight (kg), height (cm), timestamp.

4. Health: Medicines
- Name, dose, interval hours, notes, active flag, nextDose timestamp.
- Supports occasional medicine (interval 0) and recurring medicine.
- Supports "mark as taken" behavior that creates a history dose entry.

5. Health: Temperatures
- Value in Celsius, timestamp, notes.
- Fever thresholds used by analytics and UI:
  - feverC = 37.5
  - highFeverC = 38.5

6. Health: Appointments and Journal
- Appointments: type, title, location, notes, completed.
- Journal: category, title, description, tags[].

Additional behavior:
- Analytics dashboard (aggregations, trends, alerts).
- Next feeding countdown and reminder logic.
- Settings: timezone, dark mode, daily milk target, birth date, notifications, default feeding interval, complementary catalog.
- Data clear-all action.

## 3. Canonical Data Model (Required)
All timestamps are ISO-8601 UTC strings (example: 2026-08-08T12:34:56.000Z).

### 3.1 Feeding
Required fields for persistence and JSON compatibility:
- id: local numeric or string id (platform-specific).
- timestamp: ISO UTC string.
- type: one of bottle|breast|complementary.
- nextFeedingInterval: number (hours), fallback to defaultInterval when missing.
- timezone: IANA timezone string (example: America/Argentina/Buenos_Aires).

Conditional fields:
- bottle: amount (int > 0).
- breast: duration (int > 0).
- complementary:
  - food (string)
  - grams (int > 0)
  - reaction (normal|mild|moderate|severe)
  - allergens (string[])
  - notes (string)

### 3.2 Diaper
- id
- timestamp
- hasPee (boolean)
- hasPoop (boolean)
- level (int, default 2)
- notes (string, default empty)
- timezone

### 3.3 Measurement
- id
- timestamp
- weight (number|null)
- height (number|null)
- timezone

### 3.4 Medicine
- id
- timestamp
- name (string)
- dose (string)
- interval (number, hours)
- notes (string)
- active (boolean)
- nextDose (ISO UTC string|null)
- timezone

Rules:
- New medicine entries are active=true.
- interval > 0 => nextDose = timestamp + interval hours.
- interval == 0 => nextDose = null.

### 3.5 Temperature
- id
- timestamp
- value (number Celsius)
- notes (string)
- timezone

### 3.6 Appointment
- id
- timestamp
- type (doctor|vaccine|study|specialist|other)
- title (string)
- location (string)
- notes (string)
- completed (boolean)
- timezone

### 3.7 Journal Entry
- id
- timestamp
- category (health|behavior|milestone|concern|emergency|other)
- title (string)
- description (string)
- tags (string[])
- timezone

### 3.8 Settings / Metadata
Persist as local metadata and include in JSON export/snapshot:
- timezone (string)
- darkMode (boolean)
- defaultInterval (number, default 3.5)
- dailyMilkTarget (int, default 0)
- birthDate (YYYY-MM-DD or null)
- notificationsEnabled (boolean)
- complementaryCatalog (string[])

## 4. Import/Export Compatibility Contracts (Critical)
The Android app MUST produce and consume files matching the current web formats.

## 4.1 JSON Export Format (Full Backup)
Top-level JSON object must include:
- exportedAt
- timezone
- darkMode
- defaultInterval
- dailyMilkTarget
- birthDate
- notificationsEnabled
- complementaryCatalog
- feedings[]
- diapers[]
- measurements[]
- medicines[]
- temperatures[]
- appointments[]
- journalEntries[]

Notes:
- Export full arrays as-is using canonical field names above.
- Keep unknown extra fields when importing to avoid destructive loss.

### 4.1.1 JSON Import Behavior
- Merge into existing data (do not hard replace by default).
- For each record type, append imported records.
- Keep existing records.
- Keep sort behavior:
  - feedings, diapers, measurements, medicines, temperatures, journal: newest first.
  - appointments: ascending by timestamp when stored/listed for schedule behavior.
- complementaryCatalog: merge with existing list, normalize spaces, case-sensitive storage, unique values.
- If JSON has settings fields, apply them (timezone, darkMode, defaultInterval, dailyMilkTarget, birthDate, notificationsEnabled).

Important compatibility caveat from existing behavior:
- Re-importing the same JSON can create duplicates. Maintain this behavior unless explicit dedup is enabled behind a user option.

## 4.2 CSV Export Format (Legacy Interchange)
CSV header must be exactly:
TIPO,FECHA,DETALLE1,DETALLE2,DETALLE3,NOTAS,ZONA_HORARIA

Quoted CSV cells:
- Always quote values.
- Escape quotes by doubling them.
- Arrays must join with |.

Record rows:
1. Feeding
- Prefix: ALIMENTACION
- DETALLE1:
  - Biberón for bottle
  - Pecho for breast
  - Complementaria for complementary
- DETALLE2:
  - bottle amount
- DETALLE3:
  - breast duration
- NOTAS:
  - for complementary: compact details string:
    Alimento:<food>;Gramos:<grams>;Reaccion:<label>;Alergenos:<a|b|c>
  - label mapping for reaction:
    - normal -> Sin reaccion
    - mild -> Leve
    - moderate -> Moderada
    - severe -> Severa
- ZONA_HORARIA: timezone

2. Diaper
- Prefix: PANAL
- DETALLE1: Sí/No for hasPee
- DETALLE2: Sí/No for hasPoop
- DETALLE3: level
- NOTAS: notes
- ZONA_HORARIA: timezone

3. Growth
- Prefix: CRECIMIENTO
- DETALLE1: weight
- DETALLE2: height
- DETALLE3: empty
- NOTAS: empty
- ZONA_HORARIA: timezone

4. Medicine
- Prefix: SALUD_MEDICAMENTO
- DETALLE1: name
- DETALLE2: dose
- DETALLE3: interval
- NOTAS: notes
- ZONA_HORARIA: timezone

5. Temperature
- Prefix: SALUD_TEMPERATURA
- DETALLE1: value
- DETALLE2: empty
- DETALLE3: empty
- NOTAS: notes
- ZONA_HORARIA: timezone

6. Appointment
- Prefix: SALUD_CITA
- DETALLE1: "<type> | <title> | <location>"
- DETALLE2: Completada or Pendiente
- DETALLE3: empty
- NOTAS: notes
- ZONA_HORARIA: timezone

7. Journal
- Prefix: SALUD_DIARIO
- DETALLE1: "<category> | <title>"
- DETALLE2: tags joined by |
- DETALLE3: empty
- NOTAS: description
- ZONA_HORARIA: timezone

### 4.2.1 CSV Import Behavior
- Parse quoted CSV robustly (commas inside quotes allowed).
- Ignore empty lines.
- Merge imported data into existing data.
- Field mappings:

ALIMENTACION:
- Biberón => type bottle
- Pecho => type breast
- Complementaria => type complementary
- Parse amount/duration numeric.
- Parse complementary NOTAS details by splitting ; then key:value.
- Reaction label reverse map:
  - Sin reaccion -> normal
  - Leve -> mild
  - Moderada -> moderate
  - Severa -> severe
- Allergens from Alergenos split by |.

PANAL:
- Accept Sí or Yes as true values for pee/poop.

SALUD_MEDICAMENTO:
- interval parsed as number (default 0).
- active = interval > 0.
- nextDose = timestamp + interval hours if interval > 0 else null.

SALUD_TEMPERATURA:
- Import only if value is valid numeric.

SALUD_CITA:
- Split DETALLE1 by | into type/title/location.
- completed = true if DETALLE2 contains "completada" (case-insensitive).

SALUD_DIARIO:
- Split DETALLE1 by | into category/title.
- tags from DETALLE2 by |.

Compatibility note:
- Existing web CSV import does not preserve all advanced medicine metadata (for example exact nextDose). Recompute nextDose from timestamp + interval.
- Existing web CSV export/import path does not preserve complementary feeding notes as an independent field. Preserve parity with this behavior unless a versioned CSV format is introduced.

## 5. Local Storage Strategy on Android (Required)
Use offline-first local database as primary source of truth.

Recommended stack:
- Kotlin + Room + Coroutines + Flow.
- One table per domain entity + settings table.
- Keep timezone and metadata in settings table.

Repository pattern:
- UI writes to local DB first.
- Sync worker mirrors local snapshot/state to Supabase.
- All screens read from local DB only.

## 6. Supabase Integration Requirements
Current web backend behavior is snapshot-based, not normalized row sync.
Android MUST support this mode for compatibility.

### 6.1 Required Supabase Tables
Table A: bft_backups
- id bigint identity primary key
- profile_id text not null
- reason text not null default 'manual'
- payload jsonb not null
- created_at timestamptz not null default now()

Index:
- (profile_id, created_at desc)

Table B: bft_latest_state
- profile_id text primary key
- payload jsonb not null
- last_reason text not null default 'manual'
- updated_at timestamptz not null default now()

### 6.2 Required Snapshot Payload
Snapshot object must include:
- generatedAt
- timezone
- darkMode
- defaultInterval
- dailyMilkTarget
- birthDate
- notificationsEnabled
- feedings
- diapers
- measurements
- medicines
- temperatures
- appointments
- journalEntries

Optional compatibility extension:
- complementaryCatalog may be added to improve fidelity (recommended), but preserve backward compatibility with web clients that may not include it.

### 6.3 Profile ID Contract
- If user/account model is not implemented, use generated profile_id persisted locally.
- Stable profile_id is mandatory for latest-state upsert semantics.

### 6.4 Sync Operations
Implement these operations:
1. Connect/init:
- Initialize Supabase client from app config.
- Validate URL and key.

2. Backup snapshot:
- Insert into bft_backups with reason and payload.

3. Sync latest state:
- Upsert into bft_latest_state on conflict profile_id.

4. Backup+sync combined:
- Run backup then latest-state sync.

5. Auto-sync:
- Periodic every 5 minutes when online.
- Trigger sync on network reconnect.

6. Emergency local backup:
- Before cloud write, store last snapshot locally as failsafe.

### 6.5 Replace/Complement Local Storage
To satisfy replace/complement requirement:
- Complement mode (default): local DB is primary, Supabase is backup + continuity.
- Replace-like recovery mode: allow restoring local DB from bft_latest_state payload for same profile_id.

Minimum required additional Android feature:
- "Restore from Cloud" button:
  - Fetch bft_latest_state by profile_id.
  - Show preview counts per entity.
  - Let user choose merge or replace-local.
  - On replace-local, clear local tables then import snapshot.

## 7. Behavioral Parity Rules
1. Date handling
- Input datetime is local user time; persist as UTC ISO string.
- Format for display using selected timezone setting.

2. Sorting
- Feedings, diapers, measurements, medicines, temperatures, journal: descending time.
- Appointments: maintain schedule-friendly ordering.

3. Reminders
- Next feeding based on latest feeding timestamp + interval (record-specific interval or defaultInterval).
- Notification window parity:
  - Trigger reminder when next feeding is within +5 min or up to 30 min overdue.
  - Avoid repeated alerts with a cooldown (~1 hour) for the same cycle.

4. Medicine workflow
- Marking medicine as taken:
  - For recurring medicine, advance nextDose by interval from now.
  - Add separate history entry with interval 0, active false, nextDose null.

5. Fever logic
- fever when temp >= 37.5.
- high fever when temp >= 38.5.

6. Clear all data
- Optionally run cloud backup before clear.
- Clear all local entity tables.
- Sync cleared state to Supabase latest state.

## 8. Suggested Android Architecture
Tech baseline:
- Kotlin, Jetpack Compose, Room, WorkManager, Retrofit/ktor or supabase-kt, kotlinx.serialization.

Modules:
1. data-local
- Room entities/DAO/database.

2. data-cloud
- Supabase gateway for backup/sync/restore.

3. domain
- Use cases: add records, import/export, backup/sync, reminders.

4. feature-ui
- Tabs/screens matching web domains.

5. sync
- WorkManager periodic + one-time sync workers.

6. notifications
- Reminder scheduler + notification channel management.

## 9. Step-by-Step Implementation Plan (for agent)
1. Create Android project scaffold
- Min SDK 26+ recommended.
- Add Room, WorkManager, serialization, Supabase client dependencies.

2. Implement local schema
- Create Room entities for all 7 data domains + settings.
- Store timestamps as ISO strings or epoch millis; convert consistently.

3. Build repositories/use-cases
- CRUD + list sorting per parity rules.
- Metadata update/save behavior.

4. Build import/export engine
- JSON full backup exporter/importer exactly as specified.
- CSV writer and parser exactly as specified.
- Add unit tests using golden files from expected format.

5. Build Supabase sync layer
- Implement config, profile_id persistence, backup insert, latest upsert.
- Implement restore from latest state.

6. Implement periodic and reconnect sync
- WorkManager periodic 15 min minimum at OS level; if 5-minute parity is mandatory, run opportunistic foreground/app-active sync every 5 minutes and worker fallback in background.

7. Implement notification/reminder parity
- Feeding reminder logic and cooldown behavior.

8. Build UI screens
- Tracker, Diapers, Growth, Health, Statistics, Settings.
- Ensure all fields needed by data contracts are editable and visible.

9. Add migration and recovery actions
- Import JSON/CSV.
- Export JSON/CSV.
- Backup now, Sync now, Restore from cloud.
- Clear all with confirmation.

10. Validation and release hardening
- Run compatibility test suite and parity checklist.

## 10. Compatibility Test Matrix (Must Pass)
1. JSON round trip
- Export on Android -> import on web succeeds with all record counts preserved.
- Export on web -> import on Android succeeds with all record counts preserved.

2. CSV round trip
- Export on Android -> import on web succeeds with field parity.
- Export on web -> import on Android succeeds.

3. Complementary feeding details
- Reaction and allergens survive JSON round trip.
- CSV preserves reaction label mapping and allergen list separator.

4. Medicine semantics
- interval and recomputed nextDose correct after CSV import.
- recurring and occasional medicine behavior correct.

5. Supabase snapshot parity
- Android payload contains required snapshot keys.
- latest state upsert and backups insert works for same profile_id.

6. Offline-first behavior
- App fully usable without network.
- Pending sync runs when online.

## 11. Risks and Mitigations
1. Duplicate imports from merge strategy
- Keep parity default (merge).
- Add optional dedup tool by hash(timestamp + core fields).

2. Timezone drift
- Persist UTC timestamps only; format with selected timezone.
- Avoid storing locale-formatted dates in DB.

3. Background sync limits on Android
- WorkManager periodic minimum constraints.
- Use foreground/app-open sync for tighter intervals.

4. Anonymous Supabase access security
- Current schema allows anon write.
- For production, move to authenticated users and strict RLS by user id.

## 12. Supabase SQL (Reference)
Use this baseline schema (equivalent to current web backend contract):

```sql
create table if not exists public.bft_backups (
  id bigint generated always as identity primary key,
  profile_id text not null,
  reason text not null default 'manual',
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_bft_backups_profile_created
  on public.bft_backups(profile_id, created_at desc);

create table if not exists public.bft_latest_state (
  profile_id text primary key,
  payload jsonb not null,
  last_reason text not null default 'manual',
  updated_at timestamptz not null default now()
);
```

RLS guidance:
- For quick parity testing, anon policies can allow insert/upsert.
- For production, enforce auth and per-user policies.

## 13. Non-Negotiable Acceptance Criteria
Migration is complete only when all are true:
1. Android exports are importable by current web app (CSV + JSON).
2. Android can import current web exports (CSV + JSON).
3. Supabase backup and latest-state sync work with the existing table contract.
4. Local offline operation remains fully functional.
5. Cloud restore into local DB is implemented (merge and replace-local).
6. Core domain behavior (feedings, diapers, growth, medicines, temperature, appointments, journal, reminders) matches this spec.

---
If any ambiguity appears during implementation, prioritize compatibility with the contracts in Sections 3, 4, and 6 over UI differences.
