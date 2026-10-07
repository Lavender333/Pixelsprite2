# App Store In-App Purchase Metadata

## Product

- Reference Name: Monthly
- Product ID: Monthly
- Duration: 1 month
- Type: Auto-renewable subscription
- Price: $1.99

## Localization: English (U.S.)

- Display Name: Pixel Sprite Vibe Plus Monthly
- Description: Unlock more saves, frames, exports, and packs.

## App Review Information

- Screenshot: `app-store-screenshots/iap-monthly-pixel-sprite-vibe-plus-review.png`
- Review Notes:
  - The monthly subscription is shown in the Me tab as Pixel Sprite Vibe Plus Monthly.
  - Product ID in the app code is `Monthly`.
  - The purchase button opens the app's in-app purchase flow for the submitted Monthly product.
  - Reviewer sign-in is available with the App Review account listed in `APP_REVIEW_NOTES.md`.

## App Store Connect Checklist

1. Open the Monthly subscription product.
2. Add the English (U.S.) display name and description above.
3. Upload the screenshot listed above under App Review screenshot.
4. Confirm pricing is set to $1.99.
5. Submit the Monthly IAP with the app version.

## Native purchase repair — release validation

The app now registers an `InAppPurchase` Capacitor bridge backed by StoreKit 2.
The storyboard must instantiate `PixelSpriteViewController`; its bridge registration
and purchase implementation are in the existing compiled AppDelegate.swift source.
Only the exact product ID `Monthly` is accepted. Apple-verified active entitlements
unlock Plus; cancelled, pending, and unverified results do not. Restore Purchases
uses AppStore.sync. Entitlements refresh at launch, foreground, and transaction updates.
Apple supplies localized pricing. No outside payment provider is used.

This change requires a new native build; publishing website files cannot update
an already-installed App Store or TestFlight binary.

1. On a Mac with Xcode, run `npm ci`, then `npm run cap:sync`, then `npm run ios:open`.
2. Confirm `Monthly` belongs to bundle ID `com.truelavender.pixelspritevibe` in
   App Store Connect, with subscription group, localization, pricing and availability.
   Confirm Paid Apps agreement, tax and banking requirements are complete.
3. Build and run on an iPhone with a StoreKit test configuration containing `Monthly`,
   then validate again through TestFlight against the real App Store Connect product.
4. Test success, cancellation, pending approval, unavailable product, restoration,
   expiration and refund/revocation. Ensure only verified active subscriptions unlock.
5. Increment the build number, archive and upload the new build to App Store Connect.
   Submit the subscription with the app version when required.

JavaScript behavior and web asset preparation can be checked in Linux. Xcode compilation,
Apple payment-sheet presentation, signed transactions and storefront configuration
must be verified on macOS/iOS before release. StoreKit verification currently controls
native-device access; this is not a server-side entitlement service for web accounts.
