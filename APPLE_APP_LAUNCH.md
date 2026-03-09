# Apple App Launch Checklist

## What is already prepared
- Capacitor iOS wrapper has been created in [ios/App](ios/App)
- Web assets are copied into [dist](dist) and then into the iOS app bundle
- App icon and native splash assets are generated from the project branding
- Launch-safe feature flags remain off for unfinished challenge, progression, and premium areas

## Files added for native packaging
- [package.json](package.json)
- [capacitor.config.json](capacitor.config.json)
- [scripts/prepare-capacitor-web.mjs](scripts/prepare-capacitor-web.mjs)
- [scripts/generate_ios_assets.py](scripts/generate_ios_assets.py)
- [ios/App](ios/App)

## Local commands
1. Install Xcode from the Mac App Store.
2. Point command line tools at Xcode:
   - `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`
3. Refresh native assets and sync the iOS project:
   - `npm run ios:prepare`
4. Open the iOS project:
   - `npm run ios:open`

## In Xcode
1. Open [ios/App/App.xcodeproj](ios/App/App.xcodeproj)
2. Select the `App` target
3. Set:
   - Bundle Identifier
   - Team
   - Version
   - Build number
4. In Signing & Capabilities:
   - enable automatic signing
   - confirm your Apple Developer team is selected
5. In General:
   - verify `Pixel Creator` display name
   - verify portrait/landscape support matches what you want to ship
   - add your App Store icon if you want to replace the generated one
6. On a real iPhone, run one smoke test for:
   - splash screen
   - opening Studio
   - saving a project
   - export flow
   - Privacy Policy Statement link

## App Store Connect
Before submission, prepare:
- app description
- keywords
- support URL
- marketing URL
- privacy policy URL
- screenshots for 6.7-inch and 6.5-inch iPhone sizes
- app icon review
- age rating answers
- privacy nutrition labels in App Store Connect

## Recommended release settings
Keep these launch flags disabled in [script.js](script.js):
- `challenges`
- `progression`
- `socialProof`
- `templateColoring`
- `templateChallenges`
- `premiumY2K`

## Important note
Full Xcode is not currently active on this Mac. The project is scaffolded and ready, but you still need the Xcode app installed before archive/upload can be completed.
