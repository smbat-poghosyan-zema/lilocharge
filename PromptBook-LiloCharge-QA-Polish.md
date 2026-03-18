# PromptBook-LiloCharge-QA-Polish.md — QA, Polish & Production Readiness

> **Purpose:** Verify, fix, and polish the LiloCharge platform — a fully-built EV charging
> super-app for Armenia. This PromptBook covers API contract auditing, bug fixes, UI polish,
> comprehensive E2E testing, and a production-readiness assessment.
>
> Tech Stack: React Native (Expo) + TypeScript | NestJS + Fastify | PostgreSQL + PostGIS |
> Redis | Prisma ORM | Mapbox | shared-types monorepo package
>
> Executed by `scripts/run-promptbook-qa-polish.sh`
>
> **Section 1 (Steps 1–7):** Fix & Verification — API contracts, tests, bugs, UI polish
> **Section 2 (Step 8):** Production Readiness Report

---

## Section 1: Fix & Verification Steps

---

### Step 1: API Integration Audit & Contract Fix

**Goal:** Verify all mobile ↔ backend API contracts match end-to-end (shared-types vs DTOs vs ApiClient calls), then fix any mismatches found — starting with `StationDetailQueryRequest` missing fields.

**Why:** Contract drift between the mobile `ApiClient`, backend DTOs, and `shared-types` definitions causes silent runtime failures that TypeScript cannot catch at the call site. Fixing all mismatches at once prevents downstream bugs in Steps 4–6.

````
Read AGENTS.md fully. You are the API Contract Agent for LiloCharge.

CONTEXT:
The LiloCharge monorepo has three layers that must stay in sync:
  1. packages/shared-types — canonical TypeScript interfaces consumed by both sides
  2. apps/api/src/**/*.dto.ts — NestJS DTOs that validate/transform incoming HTTP requests
  3. apps/mobile/src/**/*-api.ts — React Native API client that serializes outgoing requests

When any of these three layers drifts from the others, silent runtime bugs appear (missing
query params silently ignored, wrong field names, wrong defaults). This step audits the entire
surface and fixes every mismatch found.

REFERENCE FILES (read these first):
- AGENTS.md
- packages/shared-types/src/station.ts
- packages/shared-types/src/index.ts
- apps/api/src/stations/dto/station-detail-query.dto.ts
- apps/api/src/stations/dto/nearby-stations-query.dto.ts
- apps/api/src/stations/dto/search-stations-query.dto.ts
- apps/mobile/src/features/stations/stations-api.ts
- apps/mobile/src/features/stations/stations-screen.tsx  (to see what params are passed)

AUDIT & FIX:

1. AUDIT shared-types vs DTOs:
   For every interface/type exported from packages/shared-types/src/station.ts, verify that
   the corresponding NestJS DTO has matching field names, types, and optional/required markers.
   Document every mismatch found as an inline comment before fixing.

2. FIX StationDetailQueryRequest in shared-types:
   The interface is missing two fields needed by Step 4 (filter-aware connector display).
   ADD these optional fields to StationDetailQueryRequest:
   ```typescript
   connectorTypes?: ConnectorType[];   // filter connectors by type
   minimumPowerKw?: number;             // filter connectors by minimum power
````

3. FIX StationDetailQueryDto in apps/api:
   Add matching fields to station-detail-query.dto.ts:

   ```typescript
   @IsOptional()
   @IsArray()
   @IsEnum(ConnectorType, { each: true })
   connectorTypes?: ConnectorType[];

   @IsOptional()
   @IsNumber()
   @Min(0)
   @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
   minimumPowerKw?: number;
   ```

4. FIX limit mismatch:
   - Check default value in mobile getNearbyStations() call
   - Check @Max() on limit field in nearby-stations-query.dto.ts
   - If mobile default > DTO max, either raise DTO max or lower mobile default so they match
   - Document which change you made and why

5. AUDIT all remaining station endpoints:
   Walk every station-related endpoint (search, nearby, detail, sessions) and verify:
   - Field names match exactly (camelCase on both sides)
   - No field exists in DTO but not in shared-types or vice versa
   - Response types in shared-types match what the controller actually returns

6. AUDIT mobile ApiClient:
   Walk apps/mobile/src/features/stations/stations-api.ts and verify every function:
   - Uses the correct shared-types request/response types as generics
   - Passes all required fields in query params / body
   - Handles the response shape correctly

7. RUN validation:
   pnpm typecheck
   Fix ALL TypeScript errors before marking done.

CONSTRAINTS:

- TypeScript strict mode, no any, no @ts-ignore
- Do not change field semantics, only fix structural mismatches
- Preserve all existing JSDoc comments; add JSDoc to new fields
- Do not add runtime logic in this step — schema/type changes only

DONE WHEN:

- StationDetailQueryRequest has connectorTypes? and minimumPowerKw? fields
- StationDetailQueryDto has matching @IsOptional decorated fields
- limit default in mobile matches or is <= @Max in DTO
- pnpm typecheck passes with zero errors
- All audit findings are documented in a brief comment at the top of each fixed file

```

---

### Step 2: Full Screen Functionality Verification

**Goal:** Run the complete test suite, identify all failing tests, fix broken implementations or incorrect test assertions, and ensure all station screens have full state coverage (loading, error, success, empty).

**Why:** A passing test suite is the foundation for confident refactoring in Steps 3–6. Broken tests either hide real bugs or block CI; both must be resolved before adding new features.

```

Read AGENTS.md fully. You are the QA Verification Agent for LiloCharge.

CONTEXT:
The LiloCharge mobile app has spec files for the main station screens. Some tests may be
failing due to implementation gaps, stale snapshots, or missing mock data. This step runs
everything, triages failures, and fixes them — whether by fixing the implementation or
correcting an incorrect assertion.

REFERENCE FILES (read these first):

- AGENTS.md
- apps/mobile/src/features/stations/**tests**/stations-screen.spec.tsx
- apps/mobile/src/features/stations/**tests**/station-bottom-sheet.spec.tsx
- apps/mobile/src/features/stations/**tests**/station-filters.spec.tsx
- apps/mobile/src/features/stations/stations-screen.tsx
- apps/mobile/src/features/stations/station-bottom-sheet.tsx
- apps/mobile/src/features/stations/station-filters.tsx

VERIFY & FIX:

1. RUN full test suite:
   pnpm test --passWithNoTests 2>&1 | tee /tmp/lilocharge-test-output.txt
   Read the output carefully. List every failing test with its file and failure reason.

2. TRIAGE failures — for each failing test, determine:
   a. Is the test asserting something that is WRONG (test bug) → fix the assertion
   b. Is the test asserting something CORRECT but the implementation is missing/broken → fix implementation
   c. Is it a missing mock or test utility → add the mock

3. ENSURE state coverage for each station screen:
   Every screen component must have test cases for:
   - Loading state: shows ActivityIndicator or skeleton
   - Error state: shows error message with retry button
   - Success state: shows correct data
   - Empty state: shows empty message (e.g., no stations found)

   Check stations-screen.spec.tsx, station-bottom-sheet.spec.tsx, station-filters.spec.tsx.
   Add missing state-coverage tests if absent.

4. VERIFY navigation flow:
   Ensure tests cover:
   - Map screen renders correctly with mock station data
   - Tapping a station marker triggers bottom sheet (or navigation to detail)
   - Session screen can be reached from station detail
     Mock react-navigation and mapbox as needed.

5. FIX all failures found in step 1 (both test bugs and implementation bugs).

6. RUN again to confirm:
   pnpm test
   Must pass with zero failures before marking done.

CONSTRAINTS:

- Do not delete tests — fix them
- Do not weaken assertions (e.g., toHaveBeenCalled is stronger than toBeDefined — keep the stronger one)
- Use existing test utilities and mocks from the project; don't introduce new testing libraries
- All new tests must follow the existing describe/it structure in each spec file

DONE WHEN:

- pnpm test passes with zero failures
- Every station screen spec has loading / error / success / empty state coverage
- Navigation flow tests exist and pass

```

---

### Step 3: Fix Station Aggregate Status Logic

**Goal:** Fix the bug where a station with 1 AVAILABLE + 2 OCCUPIED connectors reports its aggregate status as OCCUPIED instead of AVAILABLE. Implement correct priority: `AVAILABLE > OCCUPIED > MAINTENANCE > OFFLINE`.

**Why:** The aggregate status is what users see on the map and in station cards. Showing OCCUPIED when a free connector exists causes users to skip available stations, directly harming the product's value proposition.

```

Read AGENTS.md fully. You are the Backend Logic Agent for LiloCharge.

CONTEXT:
Station aggregate status is displayed on map pins, station cards, and filter results.
Currently the status is either stored as a flat column or computed incorrectly — a station
with mixed connector statuses shows the worst-case status instead of the best available.

The correct behavior: if ANY connector is AVAILABLE, the station is AVAILABLE.
If no connector is AVAILABLE but at least one is OCCUPIED (charging), the station is OCCUPIED.
If all connectors are MAINTENANCE, the station is MAINTENANCE.
If all connectors are OFFLINE, the station is OFFLINE.

Priority order: AVAILABLE > OCCUPIED > MAINTENANCE > OFFLINE

This must be fixed in two places:

1. READ PATH — SQL queries that compute aggregate status on-the-fly
2. WRITE PATH — ConnectorsService that updates connector status and must cascade to station

REFERENCE FILES (read these first):

- AGENTS.md
- apps/api/src/stations/stations.queries.ts
- apps/api/src/connectors/connectors.service.ts
- packages/shared-types/src/station.ts
- apps/api/src/stations/stations.service.ts
- apps/api/src/stations/dto/nearby-stations-query.dto.ts

FIX:

1. EXPORT STATION_STATUS_PRIORITY in shared-types:
   In packages/shared-types/src/station.ts, export:

   ```typescript
   export const STATION_STATUS_PRIORITY: Record<StationStatus, number> = {
     [StationStatus.AVAILABLE]: 4,
     [StationStatus.OCCUPIED]: 3,
     [StationStatus.MAINTENANCE]: 2,
     [StationStatus.OFFLINE]: 1,
   };
   ```

2. FIX READ PATH — SQL aggregate in stations.queries.ts:
   In buildNearbyStationsQuery, buildStationDetailQuery, and buildSearchStationsQuery,
   replace or add a computed aggregate_status column using a SQL CASE expression:

   ```sql
   CASE
     WHEN EXISTS (
       SELECT 1 FROM connectors c
       WHERE c."stationId" = s.id AND c.status = 'AVAILABLE'
     ) THEN 'AVAILABLE'
     WHEN EXISTS (
       SELECT 1 FROM connectors c
       WHERE c."stationId" = s.id AND c.status = 'OCCUPIED'
     ) THEN 'OCCUPIED'
     WHEN EXISTS (
       SELECT 1 FROM connectors c
       WHERE c."stationId" = s.id AND c.status = 'MAINTENANCE'
     ) THEN 'MAINTENANCE'
     ELSE 'OFFLINE'
   END AS aggregate_status
   ```

   Map aggregate_status → status in the result mapper so callers see the correct value.

3. FIX STATUS FILTER SQL:
   In buildStationStatusFilterSql (or wherever the WHERE clause filters by status),
   update it to use EXISTS logic matching the same CASE expression above, not just
   `s."status" = $N`. This ensures filter results match computed aggregate status.

4. FIX WRITE PATH — cascade in ConnectorsService:
   In connectors.service.ts, in the updateConnectorStatus method (or equivalent),
   after updating the connector record, recompute and persist the station's aggregate status:

   ```typescript
   // After updating connector, recompute station status
   const connectors = await this.prisma.connector.findMany({
     where: { stationId: connector.stationId },
     select: { status: true },
   });

   const newStationStatus = connectors.reduce<StationStatus>((best, c) => {
     return STATION_STATUS_PRIORITY[c.status as StationStatus] > STATION_STATUS_PRIORITY[best]
       ? (c.status as StationStatus)
       : best;
   }, StationStatus.OFFLINE);

   await this.prisma.station.update({
     where: { id: connector.stationId },
     data: { status: newStationStatus },
   });
   ```

5. RUN validation:
   pnpm typecheck && pnpm test
   Fix all failures before marking done.

CONSTRAINTS:

- Do not change the StationStatus enum values themselves
- The SQL CASE must handle the case where a station has zero connectors (defaults to OFFLINE)
- STATION_STATUS_PRIORITY must be exported from shared-types so mobile can import it too
- Preserve existing query structure; only add/modify the aggregate status column

DONE WHEN:

- STATION_STATUS_PRIORITY exported from @lilocharge/shared-types
- All three query builders compute aggregate_status via EXISTS subqueries
- buildStationStatusFilterSql uses EXISTS logic
- ConnectorsService.updateConnectorStatus cascades new aggregate to station
- pnpm typecheck && pnpm test both pass with zero errors/failures

```

---

### Step 4: Filter-Aware Connector Display in Station Detail

**Goal:** Fix the bug where station detail shows ALL connectors even when the user has an active power or connector-type filter. Only connectors matching the active filter should appear in the detail view.

**Why:** When a user filters for "50kW+ DC", seeing 3kW AC connectors in the detail sheet contradicts their search intent and wastes their time. The detail must respect the same filters as the map.

```

Read AGENTS.md fully. You are the Feature Integration Agent for LiloCharge.

CONTEXT:
The stations map screen has a filter panel (StationFilters component) that lets users filter
by connector type (AC, DC, CCS, CHAdeMO, etc.) and minimum power (kW). These filters are
applied to the nearby stations query. However, when a user taps a station to see its detail,
getStationDetail() is called without filter params — so ALL connectors for that station are
returned, not just the ones matching the active filter.

This step wires the active filters through to the station detail query, both on the mobile
side (passing params) and on the backend side (applying a conditional WHERE in the connector
lateral join). It also updates the UI to show a "Filtered" label when filters are active.

PREREQUISITES:
Step 1 must be complete (StationDetailQueryRequest now has connectorTypes? and minimumPowerKw?)
Step 2 must be complete (tests passing)

REFERENCE FILES (read these first):

- AGENTS.md
- apps/mobile/src/features/stations/stations-screen.tsx
- apps/mobile/src/features/stations/station-bottom-sheet.tsx
- apps/mobile/src/features/stations/stations-api.ts
- apps/api/src/stations/stations.queries.ts
- apps/api/src/stations/stations.service.ts
- apps/api/src/stations/stations.controller.ts
- packages/shared-types/src/station.ts (now has connectorTypes? and minimumPowerKw?)

FIX:

1. MOBILE — pass active filters to getStationDetail:
   In stations-screen.tsx, locate the call to getStationDetail (or the equivalent
   refreshSelectedStationDetail function). Update it to pass the active filter state:

   ```typescript
   const detail = await stationsApi.getStationDetail(stationId, {
     connectorTypes: stationFilters.connectorTypes,
     minimumPowerKw: stationFilters.minimumPowerKw,
   });
   ```

   Also add stationFilters to the useEffect dependency array for refreshSelectedStationDetail
   so that when the filter changes while a station is selected, the detail auto-refreshes.

2. MOBILE — bypass cache when filters are active:
   In stations-api.ts (or wherever the detail cache key is computed), update the cache key
   to include filter params:

   ```typescript
   const cacheKey = `station-detail:${stationId}:${JSON.stringify(filters)}`;
   ```

   Or, if a simpler approach: skip the cache entirely when connectorTypes or minimumPowerKw
   is set (since filtered results are not reusable across different filter states).

3. BACKEND — filter connectors in buildStationDetailQuery:
   In apps/api/src/stations/stations.queries.ts, in buildStationDetailQuery, locate the
   lateral join or subquery that fetches connectors. Add a conditional WHERE clause:

   ```sql
   -- Only applied when params.connectorTypes or params.minimumPowerKw is set
   WHERE 1=1
     ${params.connectorTypes?.length ? `AND c.type = ANY($N::text[])` : ''}
     ${params.minimumPowerKw ? `AND c."maxPowerKw" >= $M` : ''}
   ```

   Correctly manage parameterized query indices ($N, $M) — do not hardcode them;
   push values to the params array and use the next sequential index.

4. MOBILE UI — show "Filtered connectors" badge in StationBottomSheet:
   In station-bottom-sheet.tsx, when filtersActive prop is true (connectorTypes or
   minimumPowerKw is set), show a small inline label above the connector list:

   ```tsx
   {
     filtersActive && <Text style={styles.filteredLabel}>{t('station.filteredConnectors')}</Text>;
   }
   ```

   Add the filtersActive: boolean prop to StationBottomSheetProps.
   Pass it from stations-screen.tsx where the bottom sheet is rendered.

5. I18N — add translation keys:
   Add to all three locale files (en, hy, ru):
   - en: "station.filteredConnectors": "Showing filtered connectors"
   - hy: "station.filteredConnectors": "Ցուցադրվում են ֆիլտրված լիցքավորիչներ"
   - ru: "station.filteredConnectors": "Показаны отфильтрованные разъёмы"

6. RUN validation:
   pnpm typecheck && pnpm test
   Fix all failures before marking done.

CONSTRAINTS:

- Do not change the StationBottomSheet's existing layout — add the label above the list only
- Do not use React Query or any new caching library — use existing cache pattern
- SQL parameterization must be safe (no string interpolation of user values)
- filtersActive prop must be optional (false by default) to avoid breaking existing usages

DONE WHEN:

- Active filters are passed to getStationDetail call
- stationFilters is in useEffect dependency array for refreshSelectedStationDetail
- buildStationDetailQuery applies connector type and power WHERE conditions when params set
- StationBottomSheet shows "Filtered connectors" label when filtersActive=true
- i18n keys added in all three locale files
- pnpm typecheck && pnpm test pass with zero errors

```

---

### Step 5: Map Pin Visual Redesign

**Goal:** Replace simple colored circle + ⚡ emoji map pins with multi-layer pins that communicate station status, power tier (AC / DC / HPC), and connector count at a glance.

**Why:** The current single-circle pins make it impossible to distinguish a 3kW home charger from a 350kW HPC station without tapping. The redesigned pins let power users plan routes without opening station details.

```

Read AGENTS.md fully. You are the Mobile UI Agent for LiloCharge.

CONTEXT:
The station map currently renders each station as a single colored circle (color = status)
with a ⚡ emoji. Users cannot tell from the pin whether a station is AC or DC, how many
connectors it has, or what power tier it offers.

The new design uses a 3-layer MapboxGL layer stack:
Layer 1: Status circle (radius 14, white stroke 2px, fill = status color)
Layer 2: Power tier badge — text "AC", "DC", or "HPC" centered on the circle
Layer 3: Connector count — small offset label (top-right corner of circle)

Power tier is derived from maxPowerKw:
maxPowerKw <= 22 → "AC"
maxPowerKw <= 100 → "DC"
maxPowerKw > 100 → "HPC"

This requires adding two new fields to the GeoJSON feature properties (from the backend)
and updating both the backend query and the mobile map rendering.

REFERENCE FILES (read these first):

- AGENTS.md
- apps/mobile/src/features/stations/map/station-map.utils.ts
- apps/mobile/src/features/stations/stations-screen.tsx
- apps/mobile/src/features/stations/station-marker.tsx (if exists; or create it)
- apps/api/src/stations/stations.queries.ts
- packages/shared-types/src/station.ts

IMPLEMENT:

1. BACKEND — add connectorCount and maxPowerKw to NearbyStation query:
   In apps/api/src/stations/stations.queries.ts, in buildNearbyStationsQuery, add two
   computed columns via SQL subqueries:

   ```sql
   (SELECT COUNT(*)::int FROM connectors c WHERE c."stationId" = s.id) AS "connectorCount",
   (SELECT COALESCE(MAX(c."maxPowerKw"), 0) FROM connectors c WHERE c."stationId" = s.id) AS "maxPowerKw"
   ```

   Map both fields through to the result object and ensure they are returned in the response.

2. SHARED-TYPES — add fields to StationNearbyResponse:
   In packages/shared-types/src/station.ts, add to StationNearbyResponse:

   ```typescript
   connectorCount: number;
   maxPowerKw: number;
   ```

3. MOBILE — add powerTierLabel to StationFeatureProperties:
   In apps/mobile/src/features/stations/map/station-map.utils.ts, in the function that
   maps StationNearbyResponse to GeoJSON Feature properties, add:

   ```typescript
   powerTierLabel: maxPowerKw <= 22 ? 'AC' : maxPowerKw <= 100 ? 'DC' : 'HPC',
   connectorCount: feature.connectorCount,
   ```

   Also add these to the StationFeatureProperties type/interface.

4. MOBILE — replace single CircleLayer with 3-layer stack:
   In stations-screen.tsx (or station-marker.tsx if that's where layers are defined),
   replace the existing CircleLayer with three layers:

   Layer 1 — status circle:

   ```tsx
   <CircleLayer
     id="station-status-circle"
     style={{
       circleRadius: 14,
       circleColor: ['get', 'statusColor'], // use existing statusColor property
       circleStrokeColor: '#FFFFFF',
       circleStrokeWidth: 2,
     }}
   />
   ```

   Layer 2 — power tier badge (SymbolLayer):

   ```tsx
   <SymbolLayer
     id="station-power-tier"
     style={{
       textField: ['get', 'powerTierLabel'],
       textSize: 9,
       textColor: '#FFFFFF',
       textFont: ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
       textAllowOverlap: true,
       textIgnorePlacement: true,
     }}
   />
   ```

   Layer 3 — connector count (SymbolLayer, offset top-right):

   ```tsx
   <SymbolLayer
     id="station-connector-count"
     style={{
       textField: ['get', 'connectorCount'],
       textSize: 8,
       textColor: '#FFFFFF',
       textOffset: [1.0, -1.0],
       textFont: ['DIN Offc Pro Medium', 'Arial Unicode MS Regular'],
       textAllowOverlap: true,
       textIgnorePlacement: true,
     }}
   />
   ```

   Note: use ['get', 'connectorCount'] — MapboxGL will convert the number to string for display.

5. BACKEND — add composite DB index for performance:
   In the appropriate Prisma migration or raw SQL (check how migrations are managed in the project),
   add:

   ```sql
   CREATE INDEX IF NOT EXISTS idx_connectors_station_power
     ON connectors ("stationId", "maxPowerKw");
   ```

   If using Prisma schema, add: @@index([stationId, maxPowerKw]) to the Connector model.

6. RUN validation:
   pnpm typecheck && pnpm test
   Fix all failures before marking done.

CONSTRAINTS:

- Do not introduce Reanimated or any new animation library
- All three layers must use the same source/ShapeSource — do not create a separate source
- textFont arrays must include a fallback font ('Arial Unicode MS Bold' or 'Regular')
- The composite index must be idempotent (IF NOT EXISTS or via Prisma schema)
- connectorCount on the GeoJSON layer must be cast to string if MapboxGL requires it

DONE WHEN:

- buildNearbyStationsQuery returns connectorCount and maxPowerKw
- StationNearbyResponse type has both fields
- StationFeatureProperties has powerTierLabel and connectorCount
- Map renders 3-layer pins: status circle + power tier text + connector count
- Composite DB index exists in Prisma schema or migration
- pnpm typecheck && pnpm test pass with zero errors

```

---

### Step 6: Collapsible Filter Panel on Main Map Screen

**Goal:** Make the filter panel on the main map screen collapsible — hidden by default with a toggle button that animates it in/out — so the map has more visible space on load.

**Why:** The filter panel currently occupies ~320px of map height on every load, obscuring the map even for users who never use filters. Starting collapsed maximizes map real estate and makes the app feel more polished.

```

Read AGENTS.md fully. You are the Mobile UI Polish Agent for LiloCharge.

CONTEXT:
The main map screen (stations-screen.tsx) has a StationFilters panel that is always visible.
The new behavior: the panel starts hidden; a "Filters" toggle button at the top of the screen
shows/hides it with a smooth height + opacity animation.

Animation must use React Native's built-in Animated API (Animated.Value + Animated.timing
with useNativeDriver: false). Do NOT introduce Reanimated — it is not in the project
dependencies and would require a native module rebuild.

The toggle button shows:

- "Filters" when panel is hidden (with optional green dot badge if any filter is active)
- "Hide Filters" when panel is visible

REFERENCE FILES (read these first):

- AGENTS.md
- apps/mobile/src/features/stations/stations-screen.tsx
- apps/mobile/src/features/stations/station-bottom-sheet.tsx (reference for Animated pattern)
- apps/mobile/src/i18n/locales/en.json
- apps/mobile/src/i18n/locales/hy.json
- apps/mobile/src/i18n/locales/ru.json

IMPLEMENT:

1. EXTRACT isJestRuntime utility:
   Create apps/mobile/src/utils/is-jest-runtime.ts:

   ```typescript
   /**
    * Returns true when running inside a Jest test environment.
    * Used to disable animations that would otherwise hang test timers.
    */
   export function isJestRuntime(): boolean {
     return typeof jest !== 'undefined';
   }
   ```

   This is needed to make Animated.timing not hang Jest fake timers.

2. ADD collapsible state to stations-screen.tsx:
   Add to existing state/refs section:

   ```typescript
   const [isFiltersVisible, setIsFiltersVisible] = useState(false);
   const filtersHeight = useRef(new Animated.Value(0)).current;
   const filtersOpacity = useRef(new Animated.Value(0)).current;
   ```

3. ADD toggle function:

   ```typescript
   const toggleFilters = useCallback(() => {
     const toValue = isFiltersVisible ? 0 : 1;
     const duration = isFiltersVisible ? 160 : 200;

     if (isJestRuntime()) {
       filtersHeight.setValue(toValue);
       filtersOpacity.setValue(toValue);
       setIsFiltersVisible(!isFiltersVisible);
       return;
     }

     Animated.parallel([
       Animated.timing(filtersHeight, {
         toValue,
         duration,
         useNativeDriver: false,
       }),
       Animated.timing(filtersOpacity, {
         toValue,
         duration,
         useNativeDriver: false,
       }),
     ]).start();

     setIsFiltersVisible(!isFiltersVisible);
   }, [isFiltersVisible, filtersHeight, filtersOpacity]);
   ```

4. WRAP filter panel in Animated.View:

   ```tsx
   <Animated.View
     style={{
       maxHeight: filtersHeight.interpolate({
         inputRange:  [0, 1],
         outputRange: [0, 320],
       }),
       opacity: filtersOpacity,
       overflow: 'hidden',
     }}
   >
     <StationFilters ... />
   </Animated.View>
   ```

5. ADD toggle button above the Animated.View:

   ```tsx
   <TouchableOpacity
     style={styles.filtersToggleButton}
     onPress={toggleFilters}
     accessibilityRole="button"
     accessibilityLabel={isFiltersVisible ? t('filters.hide') : t('filters.show')}
   >
     <Text style={styles.filtersToggleText}>
       {isFiltersVisible ? t('filters.hide') : t('filters.show')}
     </Text>
     {isAnyFilterActive && !isFiltersVisible && <View style={styles.filterActiveDot} />}
   </TouchableOpacity>
   ```

   Where isAnyFilterActive is derived from the current stationFilters state:

   ```typescript
   const isAnyFilterActive = useMemo(
     () =>
       (stationFilters.connectorTypes?.length ?? 0) > 0 ||
       stationFilters.minimumPowerKw !== undefined ||
       stationFilters.status !== undefined,
     [stationFilters],
   );
   ```

6. ADD styles:

   ```typescript
   filtersToggleButton: {
     flexDirection: 'row',
     alignItems: 'center',
     alignSelf: 'flex-start',
     backgroundColor: '#FFFFFF',
     borderRadius: 20,
     paddingHorizontal: 16,
     paddingVertical: 8,
     marginHorizontal: 16,
     marginBottom: 4,
     shadowColor: '#000',
     shadowOffset: { width: 0, height: 2 },
     shadowOpacity: 0.12,
     shadowRadius: 4,
     elevation: 3,
   },
   filtersToggleText: {
     fontSize: 14,
     fontWeight: '600',
     color: '#1A1A1A',
   },
   filterActiveDot: {
     width: 8,
     height: 8,
     borderRadius: 4,
     backgroundColor: '#34C759',
     marginLeft: 6,
   },
   ```

7. ADD i18n keys to all three locale files:
   - en: "filters.show": "Filters", "filters.hide": "Hide Filters"
   - hy: "filters.show": "Ֆիլտրեր", "filters.hide": "Թաքցնել ֆիլտրերը"
   - ru: "filters.show": "Фильтры", "filters.hide": "Скрыть фильтры"

8. RUN validation:
   pnpm typecheck && pnpm test
   Fix all failures before marking done.

CONSTRAINTS:

- Do NOT use Reanimated — use only React Native's Animated API
- useNativeDriver MUST be false (maxHeight is not a native-driver-compatible property)
- isJestRuntime() must be used to bypass animation in tests
- Initial state must be isFiltersVisible: false (panel starts collapsed)
- The Animated.View overflow must be 'hidden' to clip content during animation

DONE WHEN:

- isJestRuntime() utility exists at apps/mobile/src/utils/is-jest-runtime.ts
- Filter panel starts collapsed (isFiltersVisible: false)
- Toggle button shows "Filters" / "Hide Filters" with correct i18n
- Animation uses Animated.Value + Animated.timing (no Reanimated)
- Green dot badge appears on toggle when any filter is active and panel is hidden
- i18n keys added in all three locale files
- pnpm typecheck && pnpm test pass with zero errors

```

---

### Step 7: End-to-End Integration Test Suite

**Goal:** Write a comprehensive integration test suite covering all changes from Steps 1–6: aggregate status logic, filter-aware connector display, collapsible filter panel, API contracts, and backend SQL correctness.

**Why:** Unit tests verify individual pieces; this suite verifies that all the fixed pieces work together correctly end-to-end, catching integration regressions before production.

```

Read AGENTS.md fully. You are the Integration Testing Agent for LiloCharge.

CONTEXT:
Steps 1–6 touched shared-types, backend queries, mobile screens, and UI components.
This step writes integration tests that verify all these pieces work together. Tests are
grouped into three categories:
A. Mobile integration tests — screens + hooks + API client working together
B. Backend unit tests — aggregate status and filter-aware SQL helpers
C. Backend Supertest controller specs — full HTTP request/response contracts

REFERENCE FILES (read these first):

- AGENTS.md
- apps/mobile/src/features/stations/**tests**/ (all existing spec files)
- apps/api/src/stations/stations.service.spec.ts (if exists)
- apps/api/src/stations/stations.controller.spec.ts (if exists)
- apps/api/src/stations/stations.queries.ts
- apps/api/src/connectors/connectors.service.ts
- apps/mobile/src/features/stations/stations-screen.tsx

WRITE TESTS:

A. MOBILE INTEGRATION TESTS:

A1. Aggregate status display (stations-screen.spec.tsx or new file): - Given a station with 1 AVAILABLE + 2 OCCUPIED connectors, the map pin shows AVAILABLE - Given a station with 0 AVAILABLE + 2 OCCUPIED connectors, the map pin shows OCCUPIED - Given all connectors OFFLINE, the map pin shows OFFLINE

A2. Filter-aware connector display (station-bottom-sheet.spec.tsx): - When minimumPowerKw filter is active and selected station has connectors below threshold,
the bottom sheet shows only connectors above the threshold - When no filter is active, all connectors are shown - When filter is active, the "Filtered connectors" label is visible - When filter is inactive, the "Filtered connectors" label is NOT visible

A3. Collapsible filter panel (stations-screen.spec.tsx or new file): - On mount, the filter panel is NOT visible (isFiltersVisible: false) - Pressing the toggle button shows the filter panel - Pressing the toggle button again hides the filter panel - When filters are active and panel is hidden, the green dot badge is visible - When no filters active, the green dot badge is NOT visible

A4. Filter context passed to API: - When stationFilters.minimumPowerKw is set and a station is selected,
the API call to getStationDetail includes minimumPowerKw in query params - When stationFilters changes while a station is selected, getStationDetail is re-called

B. BACKEND UNIT TESTS (stations.queries.ts or connectors.service.spec.ts):

B1. Aggregate status for all priority levels: - buildNearbyStationsQuery SQL contains the CASE...WHEN EXISTS pattern for AVAILABLE - buildNearbyStationsQuery SQL contains fallback to OFFLINE - buildSearchStationsQuery SQL contains the same aggregate_status CASE expression - buildStationDetailQuery SQL contains the same aggregate_status CASE expression

B2. Connector status cascade to station: - updateConnectorStatus with AVAILABLE connector cascades AVAILABLE to station
(even if other connectors are OCCUPIED) - updateConnectorStatus with OCCUPIED connector cascades OCCUPIED to station
(when no AVAILABLE connectors remain) - Station with all connectors OFFLINE → station.status = OFFLINE

B3. Filter-aware detail query SQL: - buildStationDetailQuery with connectorTypes=[] adds no WHERE clause for type - buildStationDetailQuery with connectorTypes=['CCS'] adds AND c.type = ANY(...) clause - buildStationDetailQuery with minimumPowerKw=50 adds AND c."maxPowerKw" >= 50 clause - buildStationDetailQuery with both params adds both clauses

C. BACKEND SUPERTEST CONTROLLER TESTS (stations.controller.spec.ts):

C1. GET /stations/nearby — returns connectorCount and maxPowerKw in response
C2. GET /stations/:id — returns 200 with full connector list when no filters
C3. GET /stations/:id?connectorTypes=CCS — returns only CCS connectors
C4. GET /stations/:id?minimumPowerKw=50 — returns only connectors >= 50kW
C5. GET /stations/:id?connectorTypes=CCS&minimumPowerKw=50 — both filters applied
C6. GET /stations/:id?minimumPowerKw=abc — returns 400 Bad Request (validation)

REQUIREMENTS for all tests:

- Mock all external dependencies (Prisma, Redis, Mapbox) — do not hit real services
- Use existing mock factories from the project if they exist
- Group tests with describe blocks matching the area being tested
- Each test must have a clear "Given / When / Then" structure in the test name

RUN validation:
pnpm test
All tests (new + existing) must pass.

CONSTRAINTS:

- Do not modify existing passing tests — only add new tests
- Do not use real database connections in tests (mock Prisma)
- Supertest tests must mock the NestJS module with TestingModule
- Keep mock data consistent — use the same station/connector fixture across all test files

DONE WHEN:

- All A1–A4 mobile integration tests written and passing
- All B1–B3 backend unit tests written and passing
- All C1–C6 Supertest controller tests written and passing
- pnpm test passes with zero failures across all packages

```

---

## Section 2: Production Readiness

---

### Step 8: Production Readiness Next Steps Report

**Goal:** Generate a comprehensive `docs/production-readiness-report.md` by auditing all project documentation, code, and the results of Steps 1–7. Produce a prioritized, actionable report for taking LiloCharge to production.

**Why:** After all fixes and polish in Steps 1–7, the team needs a single authoritative document that identifies remaining risks, missing infrastructure, and the ordered list of work items needed before App Store submission and live traffic.

```

Read AGENTS.md fully. You are the Production Readiness Agent for LiloCharge.

CONTEXT:
Steps 1–7 have audited API contracts, fixed bugs, polished UI, and built an integration
test suite. This step synthesizes all findings into a production-readiness report.

The report is not a rubber stamp — it must honestly document what is NOT ready, what risks
exist, and what the prioritized next steps are. Use P0 / P1 / P2 classifications.

REFERENCE FILES (read ALL of these first):

- AGENTS.md
- README.md (if exists)
- docs/ (all existing docs files)
- apps/api/src/stations/stations.queries.ts (Redis cache key logic)
- apps/mobile/src/features/stations/stations-screen.tsx (useEffect deps, location perms)
- apps/api/src/ocpp/ (or wherever OCPP routing lives)
- apps/api/src/stations/stations.controller.ts (OpenAPI decorators check)
- prisma/schema.prisma or apps/api/prisma/schema.prisma (index check)
- apps/mobile/src/features/stations/station-filters.tsx (maxHeight hardcoding)
- Log output from Steps 1–7 if available at logs/promptbook-qa-polish/

GENERATE: docs/production-readiness-report.md

The report must follow this exact structure:

---

# LiloCharge — Production Readiness Report

Generated: [today's date]
Steps completed: 1–7 of PromptBook-LiloCharge-QA-Polish.md

## Executive Summary

[2–3 sentences: overall readiness state, biggest blocker, estimated remaining effort]

## Priority Classification

### P0 — Critical (Must Fix Before Launch)

| #   | Issue                                      | Affected File                                         | Description                                                                                                                                                                                                                                                                               | Est. Effort |
| --- | ------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | Redis cache invalidation gap               | apps/api/src/stations/stations.service.ts             | The nearby-stations cache is keyed by lat/lng/radius. When a connector status changes, `invalidateStation(id)` clears the station-detail cache but does NOT bust nearby-stations cache entries that include this station. Users within ~1km may see stale status for up to [TTL] minutes. | 1–2 days    |
| 2   | stationFilters missing from useEffect deps | apps/mobile/src/features/stations/stations-screen.tsx | If stationFilters changes while a station is already selected, refreshSelectedStationDetail is NOT re-called, so the bottom sheet shows stale (unfiltered) connectors. Step 4 should have fixed this — verify it is in the dep array.                                                     | 30 min      |

### P1 — High Priority (Fix Within First Sprint Post-Launch)

| #   | Issue                              | Affected File                                         | Description                                                                                                                                                                                      | Est. Effort |
| --- | ---------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| 1   | User location permission not wired | apps/mobile/src/features/stations/stations-screen.tsx | DEFAULT_NEARBY_STATIONS_QUERY hardcodes Yerevan center coords. When the user grants location permission, the map should center on their actual location and re-query nearby stations.            | 1–2 days    |
| 2   | Composite connector index missing  | prisma/schema.prisma                                  | The idx_connectors_station_power index (stationId, maxPowerKw) added in Step 5 is needed for the subquery performance of nearby stations. Verify it exists in schema and migration.              | 1 hour      |
| 3   | OCPP 2.0.1 routing not implemented | apps/api/src/ocpp/                                    | OCPP 2.0.1 types are defined in shared-types but the OCPP message routing/handler for 2.0.1 protocol is not wired. All current chargers use 1.6J. 2.0.1 support is needed for next-gen hardware. | 6–8 weeks   |

### P2 — Medium Priority (Backlog)

| #   | Issue                                     | Affected File                                         | Description                                                                                                                                                                       | Est. Effort |
| --- | ----------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | Filter panel maxHeight hardcoded          | apps/mobile/src/features/stations/stations-screen.tsx | maxHeight: 320 is hardcoded in the Animated.View interpolation. If StationFilters content grows, this clips the panel. Use onLayout to measure actual content height.             | 2–3 hours   |
| 2   | Cluster layers missing power tier         | apps/mobile/src/features/stations/stations-screen.tsx | When stations are clustered (zoom out), the cluster circle does not show power tier info. Consider showing HPC count in cluster label.                                            | 1–2 days    |
| 3   | Missing OpenAPI @ApiQuery decorators      | apps/api/src/stations/stations.controller.ts          | The new connectorTypes and minimumPowerKw params added to the detail endpoint in Step 1/4 are not documented with @ApiQuery decorators. Swagger UI will not show them.            | 2–3 hours   |
| 4   | No ADR for aggregate status priority rule | docs/adr/                                             | The AVAILABLE > OCCUPIED > MAINTENANCE > OFFLINE priority is a product decision that should be documented as an Architecture Decision Record so future developers understand why. | 1 hour      |
| 5   | App Store / Play Store prep not started   | —                                                     | Bundle ID, provisioning profiles, store listings, privacy policy, screenshots, and review notes for Armenian stores.                                                              | 3–5 days    |

## Test Suite Summary

[Report on final test run results from Step 7: total tests, passing, failing, coverage %]

## Security Checklist

- [ ] All API endpoints require authentication (check auth guards on stations controller)
- [ ] OCPP WebSocket connections require station certificate verification
- [ ] No secrets in source code (check .env.example vs actual .env usage)
- [ ] Rate limiting applied to public station endpoints
- [ ] Input validation on all DTO fields (check for missing @IsString / @IsNumber)

## Infrastructure Checklist

- [ ] Docker Compose production file configured
- [ ] Redis persistence (AOF or RDB) configured — in-memory Redis loses cache on restart
- [ ] PostgreSQL backups configured (daily minimum)
- [ ] PostGIS extension enabled in production DB
- [ ] TimescaleDB hypertable for session metrics configured
- [ ] Environment variables documented in .env.example

## Recommended Launch Sequence

1. Fix all P0 issues (estimated: 2–3 days)
2. Complete P1 items 1–2 (location permission + index)
3. Load test with k6 or similar (target: 100 concurrent users, nearby endpoint < 200ms p95)
4. Soft launch to 50 beta users (TestFlight + Google Play Internal Testing)
5. Fix any beta issues
6. Public launch — Armenian App Store + Play Store

## Appendix: Files Changed in Steps 1–7

[List all files modified across Steps 1–7 with a one-line description of each change]

---

AUDIT INSTRUCTIONS:

1. Read every reference file listed above
2. Verify each P0 item: check if it is still an issue or if a previous step fixed it
3. For each item in the report, fill in the actual affected file path (not placeholder)
4. For the Test Suite Summary section, run: pnpm test -- --coverage and report actual numbers
5. For the Security Checklist, check each item against the actual code before marking [ ] or [x]
6. For the Infrastructure Checklist, check docker-compose files and environment configs
7. For the Appendix, actually list the files changed (read git diff or the step logs)

CONSTRAINTS:

- Be honest — do not mark items as done if they were not fixed
- Use real file paths from the actual codebase in the table
- Estimated effort values must be realistic (not "5 minutes" for complex features)
- The report must be written in clear English suitable for a technical product manager

DONE WHEN:

- docs/production-readiness-report.md is created with all sections filled in
- All P0/P1/P2 items have real file paths and honest effort estimates
- Test suite summary reflects actual test run output
- Security and infrastructure checklists reflect actual code state
- File is valid Markdown with no broken tables

```

---

## Appendix: Step Dependency Graph

```

Step 1 (API Contracts)
└─→ Step 2 (Tests)
└─→ Step 3 (Aggregate Status)
└─→ Step 4 (Filter-Aware Detail)
└─→ Step 5 (Map Pin Redesign)
└─→ Step 6 (Collapsible Filters)
└─→ Step 7 (Integration Tests)
└─→ Step 8 (Production Report)

```

Steps are linear — each step depends on the previous one completing successfully.
```
