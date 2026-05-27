# SKILL Store Scaffold Notes

## Overview

This change scaffolds a local-first `SKILL Store` and `SKILL Detail` flow for the project so the team can iterate on store UX and import/install behavior without depending on a remote marketplace first.

Current scope:

- Adds backend list/detail APIs for a local skill store
- Adds frontend store/detail pages under Community Hub settings
- Seeds a few sample skills for UI verification
- Adds a Windows-friendly one-click local dev launcher

This is intentionally a scaffold, not the final marketplace implementation.

## Why this approach

The repo already had Community Hub patterns for:

- settings sidebar grouping
- admin routes
- import/review pages

So this change extends that structure instead of introducing a separate parallel system.

The store is currently local and file-backed so teammates can:

- verify routing and page layout quickly
- inspect detail rendering
- iterate on metadata shape
- later swap the backing store to a real service or synced marketplace

## Backend changes

### New files

- `server/models/skillStore.js`
- `server/endpoints/skillStore.js`

### New API endpoints

- `GET /api/skills/store`
  - returns a local list of skills
- `GET /api/skills/store/:slug`
  - returns full detail for one skill

### Data source

The backend currently reads local skills from:

- `server/storage/skill-store`

Each skill folder currently contains:

- `skill.json`
- `SKILL.md`

### Current metadata shape

Example fields supported in `skill.json`:

- `slug`
- `name`
- `title`
- `description`
- `summary`
- `author`
- `version`
- `tags`
- `featured`
- `entryFile`
- `sourcePath`

### Current backend behavior

- reads skill directories from `server/storage/skill-store`
- loads `skill.json`
- loads markdown content from `entryFile` (default `SKILL.md`)
- returns file list and lightweight stats
- protects routes using the existing admin validation pattern

## Frontend changes

### New files

- `frontend/src/models/skillStore.js`
- `frontend/src/pages/GeneralSettings/CommunityHub/SkillStore/index.jsx`
- `frontend/src/pages/GeneralSettings/CommunityHub/SkillDetail/index.jsx`

### Updated files

- `frontend/src/main.jsx`
- `frontend/src/utils/paths.js`
- `frontend/src/components/SettingsSidebar/index.jsx`

### New frontend routes

- `/settings/community-hub/skills`
- `/settings/community-hub/skills/:slug`

### UX behavior

#### Store page

- lives under Community Hub
- lists local seeded skills
- supports simple client-side search
- shows title, name, version, tags, featured state, file count
- links into detail page

#### Detail page

- shows metadata
- shows source path
- shows file list
- renders `SKILL.md` markdown content
- is suitable for validating whether backend content is wired correctly

## Seeded sample data

Seeded sample skill folders:

- `server/storage/skill-store/imagegen`
- `server/storage/skill-store/openai-docs`
- `server/storage/skill-store/skill-installer`

These were added only to make store/detail verification possible immediately.

They are local sample records and can later be:

- replaced with real marketplace content
- expanded into richer fixtures
- removed once remote integration exists

## Dev launcher changes

### New files

- `start-dev.bat`
- `start-dev.ps1`

### Updated package script

- `yarn start:dev`

### Why this was changed

The earlier launcher approach relied on `npx concurrently`, which triggered package-fetch/cache permission failures in this environment.

The current launcher avoids that by:

- opening 3 local terminal windows directly
- starting `server`, `frontend`, and `collector` separately

This is more reliable for a Windows teammate workflow.

## Verification performed

### Backend

- local skill store list read succeeded
- local skill detail read succeeded

### Frontend

- `yarn build` completed successfully after the store/detail pages were added

### Manual validation target

After starting the app, teammates should verify:

1. Open `/settings/community-hub/skills`
2. Confirm sample skills appear
3. Open one detail page such as `/settings/community-hub/skills/imagegen`
4. Confirm markdown content renders
5. Confirm metadata and file list match seeded data

## Team handoff notes

Recommended next steps for collaborators:

1. Replace local seed data with a normalized internal schema if needed
2. Decide whether the final store is:
   - local file-backed
   - DB-backed
   - remote marketplace-backed
3. Add install/import actions from detail page
4. Add cover images, timestamps, and richer author metadata
5. Add tests for:
   - malformed `skill.json`
   - missing `SKILL.md`
   - empty store behavior
   - detail route 404 handling

## Suggested branch/PR framing

Suggested branch name:

- `feature/skill-store-scaffold`

Suggested PR title:

- `feat: scaffold local skill store and skill detail pages`

Suggested PR summary:

- add local skill store list/detail APIs
- add Community Hub skill store/detail pages
- seed sample skills for validation
- add Windows-friendly one-click dev launcher

