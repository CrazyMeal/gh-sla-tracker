# Improvement Plan: GitHub SLA Tracker Refactoring

## Goal Description
Refactor the existing GitHub SLA Tracker application to adhere to Astro best practices. The primary goals are to improve code maintainability, reduce duplication, enhance type safety, and modularize the architecture by introducing reusable UI components and scoped styling.

## User Review Required
> [!NOTE]
> This refactoring will change the internal structure of the project but should not alter the visual appearance or functionality of the application.

## Proposed Changes

### Phase 1: Component Architecture
Extract reusable UI elements from `src/pages` into dedicated Astro components in `src/components`.

#### [NEW] src/components/ui/Badge.astro
- **Props**: `variant` ('success', 'warning', 'danger', 'info', 'secondary'), `text`
- **Usage**: Replaces `<span class="badge ...">`

#### [NEW] src/components/ui/Card.astro
- **Props**: `class` (optional)
- **Usage**: Wrapper for card styles, replaces `<div class="card ...">`

#### [NEW] src/components/incidents/IncidentCard.astro
- **Props**: `incident` (IncidentWithDuration)
- **Usage**: Displays individual incident details. Will encapsulate the logic for badges, dates, and updates.

#### [NEW] src/components/dashboard/QuarterCard.astro
- **Props**: `quarterData` (QuarterData)
- **Usage**: Displays the summary card for a quarter on the dashboard.

#### [NEW] src/components/dashboard/StatsCard.astro
- **Props**: `label`, `value`, `subtext`
- **Usage**: Displays high-level statistics.

#### [NEW] src/components/sla/SlaTable.astro
- **Props**: `results` (SLAResult[])
- **Usage**: Displays the component SLA breakdown table.

### Phase 2: Page Refactoring
Update pages to use the new components.

#### [MODIFY] src/pages/index.astro
- Import and use `QuarterCard`, `StatsCard`, `IncidentCard`.
- Remove inline styles related to these elements.

#### [MODIFY] src/pages/[quarter].astro
- Import and use `StatsCard`, `SlaTable`, `IncidentCard`.
- Remove inline styles related to these elements.
- Refactor `ComponentFilter` script to be cleaner.

### Phase 3: Styling & Global Structure

#### [NEW] src/styles/global.css
- Move global variables and reset styles from `Layout.astro`.

#### [MODIFY] src/layouts/Layout.astro
- Import `global.css`.
- Remove large `<style is:global>` block.

## Verification Plan

### Automated Tests
- Run `npm run build` to ensure no build errors.
- Run `npm run test` to ensure existing logic tests still pass.
- Create new component tests if needed (optional for this phase).

### Manual Verification
- **Dashboard**: Verify all cards and stats render correctly.
- **Quarter Page**: Verify SLA table, incident list, and filtering work as expected.
- **Responsiveness**: Check mobile view to ensure components adapt correctly.
