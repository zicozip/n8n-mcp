# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.7.0] - 2025-06-29

### Added
- New `n8n_diagnostic` tool to help troubleshoot management tools visibility issues
- Version utility (`src/utils/version.ts`) to read version from package.json as single source of truth
- Script to sync package.runtime.json version (`scripts/sync-runtime-version.js`)

### Changed
- Renamed core MCP files to remove unnecessary suffixes:
  - `tools-update.ts` → `tools.ts`
  - `server-update.ts` → `server.ts`
  - `http-server-fixed.ts` → `http-server.ts`
- Updated imports across 21+ files to use the new file names

### Fixed
- Version mismatch issue where version was hardcoded as 2.4.1 instead of reading from package.json (GitHub issue #5)

### Removed
- Legacy HTTP server implementation (`src/http-server.ts`) with known issues
- Unused legacy API client (`src/utils/n8n-client.ts`)

## [Previous versions]

For changes in versions prior to 2.7.0, please refer to the git history and CLAUDE.md file which contains detailed update notes for versions 2.0.0 through 2.6.3.