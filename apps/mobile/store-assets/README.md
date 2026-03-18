# App Store Submission Materials

This directory contains all materials needed for App Store (iOS) and Google Play (Android) submissions.

## Directory Structure

```
store-assets/
├── screenshots/           # Generated app screenshots
│   ├── ios/
│   │   ├── hy/           # Armenian screenshots
│   │   ├── ru/           # Russian screenshots
│   │   └── en/           # English screenshots
│   └── android/
│       ├── hy/
│       ├── ru/
│       └── en/
└── metadata/             # Store listing metadata
    ├── app-description.json    # App descriptions in all languages
    ├── keywords.json           # ASO keywords
    └── whats-new.json         # Release notes templates
```

## Screenshot Automation

Screenshots are generated using Detox E2E testing framework.

### Prerequisites

1. **iOS Development:**
   - macOS with Xcode installed
   - iOS Simulator (iPhone 15 Pro Max, iPad Pro 12.9")
   - Detox CLI: `npm install -g detox-cli`

2. **Android Development:**
   - Android SDK and emulator
   - AVD: Pixel 8 Pro (API 34)
   - Detox CLI installed

### Generating Screenshots

#### iOS Screenshots

```bash
# Build the app for iOS
cd apps/mobile
detox build --configuration ios.sim.release

# Run screenshot tests
detox test --configuration ios.sim.release e2e/screenshots/screenshots.test.ts
```

#### Android Screenshots

```bash
# Build the app for Android
cd apps/mobile
detox build --configuration android.emu.release

# Run screenshot tests
detox test --configuration android.emu.release e2e/screenshots/screenshots.test.ts
```

#### All Platforms and Locales

```bash
# Run the comprehensive screenshot generation script
cd apps/mobile
pnpm run screenshots:generate
```

This will:

1. Build both iOS and Android apps
2. Generate screenshots for all locales (hy, ru, en)
3. Organize screenshots by platform and locale
4. Clean up artifacts

### Screenshot Specifications

#### iOS App Store

- **iPhone 15 Pro Max:** 1290 x 2796 pixels (6.7")
- **iPhone 15 Pro:** 1179 x 2556 pixels (6.1")
- **iPad Pro 12.9":** 2048 x 2732 pixels

#### Google Play

- **Phone:** 1344 x 2992 pixels (Pixel 8 Pro)
- **Tablet:** 2560 x 1600 pixels (10" tablet)

### Screenshots Captured

1. **Map Screen** - Interactive map showing charging stations
2. **Station Details** - Detailed view of a charging station
3. **Active Charging** - Live charging session in progress
4. **Payment** - Payment methods and options
5. **Profile** - User profile and settings

## Store Listings

### App Descriptions

See `metadata/app-description.json` for:

- App name and subtitle
- Short description (170 chars for iOS)
- Full description (4000 chars max)
- Promotional text

All available in Armenian (hy), Russian (ru), and English (en).

### Keywords

See `metadata/keywords.json` for ASO keywords optimized for:

- iOS App Store (100 chars, comma-separated)
- Google Play (unlimited, but best practice ~50 chars)

### What's New

See `metadata/whats-new.json` for release notes templates.

## Privacy Policy

Privacy policies in all languages are located in `/docs/privacy-policy/`:

- `privacy-policy-hy.md` - Armenian
- `privacy-policy-ru.md` - Russian
- `privacy-policy-en.md` - English
- `privacy-policy.json` - Structured data

### Privacy Policy URL

Host the privacy policy at:

```
https://lilocharge.am/privacy-policy
```

The server should detect language from Accept-Language header or query parameter.

## App Store Connect Setup

### iOS Submission

1. **App Information:**
   - Name: LiloCharge
   - Subtitle: From `app-description.json`
   - Category: Navigation
   - Content Rating: 4+

2. **Version Information:**
   - Version: 1.0.0
   - What's New: From `whats-new.json`
   - Keywords: From `keywords.json` (iOS)
   - Promotional Text: From `app-description.json`

3. **Localizations:**
   - Add Armenian (hy), Russian (ru), English (en)
   - Upload screenshots for each locale
   - Add descriptions for each locale

4. **Privacy:**
   - Privacy Policy URL: https://lilocharge.am/privacy-policy
   - Data Collection: Location, Email, Payment Tokens

### Google Play Console Setup

1. **Store Listing:**
   - App name: LiloCharge
   - Short description: From `app-description.json`
   - Full description: From `app-description.json`
   - Category: Maps & Navigation
   - Content rating: Everyone

2. **Graphics:**
   - Upload screenshots for phones and tablets
   - Feature graphic (1024 x 500)
   - App icon (512 x 512)

3. **Localizations:**
   - Add hy-AM, ru-RU, en-US
   - Upload localized screenshots and descriptions

4. **Privacy:**
   - Privacy Policy URL: https://lilocharge.am/privacy-policy
   - Data Safety: Complete questionnaire based on privacy-policy.json

## Maintenance

### Updating Screenshots

When the app UI changes:

1. Update mock data in screenshot tests if needed
2. Regenerate screenshots: `pnpm run screenshots:generate`
3. Review generated images
4. Upload to App Store Connect and Google Play Console

### Updating Descriptions

1. Edit `metadata/app-description.json`
2. Ensure translations are accurate
3. Update in App Store Connect and Google Play Console

### Updating Privacy Policy

1. Edit all three markdown files in `/docs/privacy-policy/`
2. Update `privacy-policy.json` with changes
3. Publish to https://lilocharge.am/privacy-policy
4. Update links in App Store Connect and Google Play Console

## Resources

- [App Store Screenshot Specifications](https://help.apple.com/app-store-connect/#/devd274dd925)
- [Google Play Screenshot Guidelines](https://support.google.com/googleplay/android-developer/answer/9866151)
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play Policy Center](https://support.google.com/googleplay/android-developer/topic/9858052)
