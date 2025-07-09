# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/jasonhanna/claude-personas/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/jasonhanna/claude-personas/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/jasonhanna/claude-personas/releases/tag/v1.0.0