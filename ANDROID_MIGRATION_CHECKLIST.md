# Android Migration Execution Checklist

This checklist is for an implementation agent that does not have source-code visibility. It must implement the migration using ANDROID_MIGRATION_SPEC.md as the authority and validate each phase before proceeding.

## How to Use This Checklist
- Execute phases in order.
- Do not skip acceptance gates.
- Mark each task as Done only when the done criteria and verification steps pass.
- If a task fails, create a fix task in the same phase and re-run verification.

## Phase 0 - Preflight and Constraints

### Task 0.1 - Confirm migration scope
Done criteria:
- Team confirms parity target includes: feedings, diapers, growth, medicines, temperatures, appointments, journal, reminders, import/export, settings, Supabase backup/sync.

Verification:
- Written scope note signed by implementer.

### Task 0.2 - Confirm hard compatibility constraints
Done criteria:
- JSON import/export contract frozen to match spec.
- CSV header and record tokens frozen to match spec.
- Supabase table contract frozen to match spec.

Verification:
- Compatibility constraints checklist approved before coding.

### Task 0.3 - Create test artifact folder
Done criteria:
- Folder with golden files and test outputs exists:
  - golden/web-sample-export.json
  - golden/web-sample-export.csv
  - output/android-export.json
  - output/android-export.csv
  - reports/

Verification:
- Files are created and tracked.

Acceptance gate P0:
- No implementation starts until P0 tasks are complete.

## Phase 1 - Android Project Foundation

### Task 1.1 - Initialize Android app
Done criteria:
- Kotlin Android project created.
- Min SDK chosen and documented.
- Build variants for debug/release exist.

Verification:
- Project builds and launches on emulator/device.

### Task 1.2 - Add required libraries
Done criteria:
- Added: Room, WorkManager, Coroutines/Flow, Serialization, HTTP/Supabase client, unit test and instrumentation test libs.

Verification:
- Gradle sync passes.
- Empty sample test executes.

### Task 1.3 - Establish module/package structure
Done criteria:
- Logical separation for local data, cloud data, domain/use-cases, UI, sync, notifications.

Verification:
- Architecture readme committed.

Acceptance gate P1:
- Clean build and baseline app startup with architecture scaffold.

## Phase 2 - Local Data Layer (Offline First)

### Task 2.1 - Implement entities for all domains
Done criteria:
- Tables/entities for feedings, diapers, measurements, medicines, temperatures, appointments, journal, settings.
- Timestamp storage strategy is consistent and documented.

Verification:
- Schema inspection confirms required columns and types.

### Task 2.2 - Implement DAO operations
Done criteria:
- CRUD plus list queries with required sorting behavior.
- Batch insert support for imports.

Verification:
- DAO unit tests pass for each entity.

### Task 2.3 - Implement repository contracts
Done criteria:
- UI reads from local database only.
- Writes complete locally without network.

Verification:
- Airplane-mode test: create, edit, delete records successfully.

Acceptance gate P2:
- All core records persist and list correctly offline.

## Phase 3 - Domain Logic Parity

### Task 3.1 - Feeding rules
Done criteria:
- Type-specific validation:
  - bottle requires amount > 0
  - breast requires duration > 0
  - complementary requires food and grams > 0
- nextFeedingInterval uses record value, fallback to default interval.

Verification:
- Unit tests for validation and next-feeding calculation.

### Task 3.2 - Diaper rules
Done criteria:
- At least one of pee/poop must be true.
- Level default behavior implemented.

Verification:
- Unit tests pass.

### Task 3.3 - Medicine rules
Done criteria:
- interval semantics implemented.
- mark-as-taken creates history entry and advances recurring nextDose.

Verification:
- Unit tests pass for recurring and occasional medicine flows.

### Task 3.4 - Temperature rules
Done criteria:
- fever and high-fever thresholds implemented:
  - fever >= 37.5
  - high fever >= 38.5

Verification:
- Unit tests and UI badge checks pass.

### Task 3.5 - Appointment and journal rules
Done criteria:
- Required field validations implemented.
- Sorting behavior matches spec.

Verification:
- Unit tests pass.

Acceptance gate P3:
- Domain behavior parity validated by tests.

## Phase 4 - JSON Import/Export Compatibility

### Task 4.1 - JSON exporter
Done criteria:
- Export payload includes all required top-level keys in spec.
- Arrays are serialized with canonical field names.

Verification:
- JSON schema assertion test passes.

### Task 4.2 - JSON importer
Done criteria:
- Merge behavior implemented by default.
- Settings application behavior implemented.
- complementary catalog merge/normalize behavior implemented.

Verification:
- Import web-sample-export.json and compare counts/fields.

### Task 4.3 - JSON round-trip tests
Done criteria:
- Android export imports successfully into web app.
- Web export imports successfully into Android app.

Verification:
- reports/json-roundtrip.md completed with counts and field checks.

Acceptance gate P4:
- JSON compatibility proven both directions.

## Phase 5 - CSV Import/Export Compatibility

### Task 5.1 - CSV writer
Done criteria:
- Header exactly:
  TIPO,FECHA,DETALLE1,DETALLE2,DETALLE3,NOTAS,ZONA_HORARIA
- Record tokens and mapping match spec.
- Proper quoted-cell escaping implemented.

Verification:
- Golden diff test against expected lines.

### Task 5.2 - CSV parser
Done criteria:
- Robust quoted parser handles commas and escaped quotes.
- Type-specific import mappings match spec.
- Medicine nextDose recomputation behavior implemented.

Verification:
- Parser tests for all record types and edge-cases.

### Task 5.3 - CSV round-trip tests
Done criteria:
- Android export imports successfully into web app.
- Web export imports successfully into Android app.

Verification:
- reports/csv-roundtrip.md completed with counts and known caveats.

Acceptance gate P5:
- CSV compatibility proven both directions.

## Phase 6 - Supabase Integration and Sync

### Task 6.1 - Supabase configuration and client init
Done criteria:
- Config fields available: enabled, url, anon key, profile id strategy.
- Client init and health-check implemented.

Verification:
- Manual connect action returns success status.

### Task 6.2 - Snapshot payload builder
Done criteria:
- Snapshot includes all required keys from spec.
- Payload values are sourced from local DB/settings.

Verification:
- Snapshot contract test passes.

### Task 6.3 - Backup operation
Done criteria:
- Insert into bft_backups with reason and payload.
- Local emergency backup stored before cloud write.

Verification:
- Row appears in Supabase with correct profile_id and reason.

### Task 6.4 - Latest-state sync operation
Done criteria:
- Upsert into bft_latest_state by profile_id conflict.

Verification:
- Same profile_id updates one row repeatedly.

### Task 6.5 - Cloud restore flow
Done criteria:
- Restore from bft_latest_state implemented.
- User can choose merge or replace-local.

Verification:
- End-to-end restore test with both modes passes.

### Task 6.6 - Auto-sync behavior
Done criteria:
- Periodic sync and reconnect-triggered sync implemented.
- Works within Android background constraints.

Verification:
- Offline -> online transition test confirms sync trigger.

Acceptance gate P6:
- Supabase backup, sync, and restore all operational.

## Phase 7 - Notifications and Scheduling

### Task 7.1 - Next feeding calculation and countdown
Done criteria:
- Based on latest feeding + interval.
- Uses per-record interval fallback to default.

Verification:
- Unit tests for multiple feeding scenarios pass.

### Task 7.2 - Reminder window and cooldown
Done criteria:
- Alert when within +5 minutes or up to 30 minutes overdue.
- Cooldown prevents repeated notifications within ~1 hour for same cycle.

Verification:
- Time-simulated tests pass.

Acceptance gate P7:
- Reminder parity behavior confirmed.

## Phase 8 - UI Delivery and Feature Completion

### Task 8.1 - Implement main screens
Done criteria:
- Screens exist for Tracker, Diapers, Growth, Health, Statistics, Settings.
- All required inputs from spec are present.

Verification:
- Manual test script completed for all create/list/delete actions.

### Task 8.2 - Import/Export and cloud actions in settings
Done criteria:
- Buttons/actions for export CSV/JSON, import CSV/JSON, connect, backup now, sync now, restore from cloud, clear all.

Verification:
- All actions reachable and functional in debug build.

### Task 8.3 - Empty/error/loading states
Done criteria:
- User-visible states implemented for empty data, parsing errors, sync errors, and success results.

Verification:
- QA checklist completed.

Acceptance gate P8:
- Full feature surface reachable from UI.

## Phase 9 - Full Compatibility Validation

### Task 9.1 - End-to-end matrix execution
Done criteria:
- Execute the compatibility matrix from the spec (JSON, CSV, Supabase, offline-first, medicine semantics, complementary fields).

Verification:
- reports/compatibility-matrix.md completed with pass/fail per case.

### Task 9.2 - Regression pass
Done criteria:
- No breaking changes after final fixes.

Verification:
- Re-run all automated tests and key manual tests.

Acceptance gate P9:
- All compatibility-critical tests pass.

## Phase 10 - Release Readiness

### Task 10.1 - Production hardening
Done criteria:
- Crash logging, input validation hardening, retry strategy for sync, and migration-safe DB versioning documented.

Verification:
- Release readiness checklist approved.

### Task 10.2 - Security review for Supabase
Done criteria:
- RLS/auth production plan documented (even if parity mode starts with anon policies).

Verification:
- Security sign-off note exists.

### Task 10.3 - Release candidate build
Done criteria:
- Signed release candidate produced and tested.

Verification:
- RC smoke-test report completed.

Acceptance gate P10:
- Ready for controlled rollout.

## Required Evidence Package
Before declaring migration complete, provide:
- Test reports:
  - reports/json-roundtrip.md
  - reports/csv-roundtrip.md
  - reports/compatibility-matrix.md
- Supabase verification notes with profile_id behavior.
- Screenshots or recordings of:
  - Import/export success flows
  - Backup/sync/restore flows
  - Reminder notifications
- Final parity declaration mapped to ANDROID_MIGRATION_SPEC.md acceptance criteria.

## Stop Conditions
Stop and escalate immediately if any of the following occur:
- CSV header/token mismatch discovered after implementation.
- JSON top-level key mismatch with compatibility contract.
- Supabase table contract cannot be met in target environment.
- Offline-first operation is broken by cloud failures.

## Final Go/No-Go Checklist
- P0 through P10 acceptance gates all passed.
- Both-direction web/android file compatibility proven for JSON and CSV.
- Supabase backup + latest-state sync + restore all verified.
- Offline operation verified under network loss.
- Known caveats documented and approved.
