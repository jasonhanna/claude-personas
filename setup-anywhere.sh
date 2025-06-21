#!/bin/bash

# Multi-Agent MCP Setup Script - Works from any directory
# This script sets up MCP servers for the multi-agent framework

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CURRENT_DIR="$(pwd)"

echo "Setting up Multi-Agent MCP Framework..."
echo "Script location: $SCRIPT_DIR"
echo "Current directory: $CURRENT_DIR"

# Check if we're in the project directory
if [ ! -f "$CURRENT_DIR/package.json" ] || [ ! -d "$CURRENT_DIR/personas" ]; then
    echo "Error: This script must be run from a directory containing:"
    echo "  - package.json"
    echo "  - personas/ directory"
    echo "  - dist/ directory (built artifacts)"
    exit 1
fi

# Build the project if needed
if [ ! -f "$CURRENT_DIR/dist/standalone-agent.js" ]; then
    echo "Building project..."
    npm run build
fi

# Generate configuration for current directory
echo "Generating MCP configuration for current directory..."
node "$SCRIPT_DIR/scripts/generate-claude-config.js"

echo "Setup complete! MCP servers configured for: $CURRENT_DIR"
echo "Available agents: engineering-manager, product-manager, qa-manager"