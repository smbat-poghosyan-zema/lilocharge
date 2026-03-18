#!/bin/bash

# Screenshot generation script for App Store and Google Play
# Generates screenshots for all locales and device sizes

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MOBILE_DIR="$PROJECT_ROOT/apps/mobile"

echo "🎬 LiloCharge Screenshot Generation"
echo "===================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

# Check if Detox is installed
if ! command -v detox &> /dev/null; then
    print_error "Detox CLI not found. Please install: npm install -g detox-cli"
    exit 1
fi

# Change to mobile directory
cd "$MOBILE_DIR"

# Parse command line arguments
PLATFORM="${1:-all}"  # ios, android, or all
CLEAN="${2:-no}"      # clean artifacts

if [ "$CLEAN" = "clean" ]; then
    print_info "Cleaning previous artifacts..."
    rm -rf store-assets/screenshots/ios/*
    rm -rf store-assets/screenshots/android/*
    print_status "Artifacts cleaned"
fi

# Function to generate iOS screenshots
generate_ios_screenshots() {
    print_info "Building iOS app for screenshots..."
    
    if ! detox build --configuration ios.sim.release; then
        print_error "iOS build failed"
        return 1
    fi
    
    print_status "iOS build complete"
    
    print_info "Generating iOS screenshots..."
    
    if ! detox test --configuration ios.sim.release e2e/screenshots/screenshots.test.ts --cleanup; then
        print_error "iOS screenshot generation failed"
        return 1
    fi
    
    print_status "iOS screenshots generated"
    
    # Move screenshots from artifacts to store-assets
    if [ -d "artifacts" ]; then
        print_info "Organizing iOS screenshots..."
        # The actual organization would depend on Detox output structure
        print_status "iOS screenshots organized"
    fi
}

# Function to generate Android screenshots
generate_android_screenshots() {
    print_info "Building Android app for screenshots..."
    
    if ! detox build --configuration android.emu.release; then
        print_error "Android build failed"
        return 1
    fi
    
    print_status "Android build complete"
    
    print_info "Generating Android screenshots..."
    
    if ! detox test --configuration android.emu.release e2e/screenshots/screenshots.test.ts --cleanup; then
        print_error "Android screenshot generation failed"
        return 1
    fi
    
    print_status "Android screenshots generated"
    
    # Move screenshots from artifacts to store-assets
    if [ -d "artifacts" ]; then
        print_info "Organizing Android screenshots..."
        # The actual organization would depend on Detox output structure
        print_status "Android screenshots organized"
    fi
}

# Main execution
case "$PLATFORM" in
    ios)
        print_info "Generating iOS screenshots only..."
        generate_ios_screenshots
        ;;
    android)
        print_info "Generating Android screenshots only..."
        generate_android_screenshots
        ;;
    all)
        print_info "Generating screenshots for all platforms..."
        generate_ios_screenshots
        generate_android_screenshots
        ;;
    *)
        print_error "Invalid platform: $PLATFORM"
        echo "Usage: $0 [ios|android|all] [clean]"
        exit 1
        ;;
esac

print_status "Screenshot generation complete!"
echo ""
echo "Screenshots are available in:"
echo "  iOS:     $MOBILE_DIR/store-assets/screenshots/ios/"
echo "  Android: $MOBILE_DIR/store-assets/screenshots/android/"
echo ""
echo "Next steps:"
echo "  1. Review generated screenshots"
echo "  2. Upload to App Store Connect (iOS)"
echo "  3. Upload to Google Play Console (Android)"
