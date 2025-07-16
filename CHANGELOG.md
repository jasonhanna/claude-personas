# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2025-01-16

### Added
- Context-aware feedback framework that automatically detects work stage (POC, MVP, Production, Bug Fix, etc.)
- Template system for persona section in CLAUDE.md with comprehensive feedback guidelines
- Automatic context detection from PR titles, commit messages, branch names, and issue labels
- Stage-specific review guidelines to provide appropriate feedback for each development phase
- Feedback calibration examples showing do's and don'ts for different contexts
- Tests for template functionality and context-aware content

### Changed
- Product Manager persona updated with stronger leadership positioning and ownership focus
- manage-personas.js now uses template file for generating persona sections
- Personas now actively solicit stakeholder insights rather than just managing expectations
- Enhanced decision frameworks with emphasis on experimentation and assumption testing

## [1.0.1] - 2025-01-09

### Fixed
- Fixed incorrect git clone URL in README (multi-agent → claude-personas)
- Corrected project-specific npm commands to use `--project` flag syntax
- Fixed broken documentation links (LICENSE → LICENSE.md)
- Updated missing personas reference in Edit Existing Personas section
- Minor grammatical improvements throughout documentation

### Changed
- Improved tagline from "Ship" to "Build" stronger products
- Changed "virtuous" to "positive" feedback loops for clarity
- Renamed "Per Project Setup" to "Single Project Setup" for consistency

### Added
- Added MIT LICENSE.md file
- Added animated GIF demonstrating persona workflow

## [1.0.0] - 2024-07-01

### Added
- Initial release of Claude Code Personas
- Three starter personas: Engineering Manager, Product Manager, QA Manager
- Simple file-based persona system using Claude Code's memory imports
- Installation and management scripts
- Comprehensive test suite
- Documentation for customization and creating new personas

### Changed
- Simplified architecture from MCP server-based to memory import system
- Removed complex server infrastructure in favor of direct file imports

[Unreleased]: https://github.com/jasonhanna/claude-personas/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/jasonhanna/claude-personas/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/jasonhanna/claude-personas/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/jasonhanna/claude-personas/releases/tag/v1.0.0