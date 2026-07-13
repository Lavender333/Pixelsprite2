//
//  StoreKitPlugin.swift
//  Pixel Sprite Vibe
//
//  Native StoreKit 2 bridge for Capacitor 8 (SPM).
//  Install to: ios/App/CapApp-SPM/Sources/CapApp-SPM/StoreKitPlugin.swift
//
//  Exposes window.Capacitor.Plugins.StoreKit with:
//    getProducts({ productIds: [String] })  -> { products: [...] }
//    purchaseProduct({ productId: String }) -> { status, productId, expiresAt? }
//    restorePurchases()                     -> { productIds: [String] }
//    currentEntitlements()                  -> { productIds: [String] }
//
//  Requires iOS 15+ (your deployment target is already 15.0).
//

import Foundation
import Capacitor
import StoreKit

@objc(StoreKitPlugin)
public class StoreKitPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "StoreKitPlugin"
    public let jsName = "StoreKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts",         returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchaseProduct",     returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases",    returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "currentEntitlements", returnType: CAPPluginReturnPromise)
    ]

    private var updatesTask: Task<Void, Never>?

    // MARK: - Lifecycle

    override public func load() {
        // Catches transactions that complete outside the purchase call:
        // Ask to Buy approvals, App Store promo purchases, interrupted flows,
        // and renewals. Without this, subscriptions silently break.
        updatesTask = Task.detached { [weak self] in
            for await result in Transaction.updates {
                guard case .verified(let transaction) = result else { continue }
                await transaction.finish()
                await self?.emitEntitlements()
            }
        }
    }

    deinit {
        updatesTask?.cancel()
    }

    // MARK: - Products

    @objc func getProducts(_ call: CAPPluginCall) {
        guard let ids = call.getArray("productIds", String.self), !ids.isEmpty else {
            call.reject("productIds is required and must be a non-empty array.")
            return
        }
        Task {
            do {
                let products = try await Product.products(for: ids)
                let payload: [[String: Any]] = products.map { product in
                    var item: [String: Any] = [
                        "id": product.id,
                        "title": product.displayName,
                        "description": product.description,
                        "price": product.displayPrice
                    ]
                    if let sub = product.subscription {
                        item["period"] = self.periodLabel(sub.subscriptionPeriod)
                    }
                    return item
                }
                call.resolve(["products": payload])
            } catch {
                call.reject("Could not load products from the App Store: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Purchase

    @objc func purchaseProduct(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId"), !productId.isEmpty else {
            call.reject("productId is required.")
            return
        }
        Task {
            do {
                guard let product = try await Product.products(for: [productId]).first else {
                    call.reject("Product \"\(productId)\" was not found in the App Store. Check that the product ID matches App Store Connect exactly.")
                    return
                }

                let result = try await product.purchase()

                switch result {
                case .success(let verification):
                    guard case .verified(let transaction) = verification else {
                        call.reject("The purchase could not be verified by the App Store.")
                        return
                    }
                    await transaction.finish()
                    var payload: [String: Any] = [
                        "status": "purchased",
                        "productId": transaction.productID
                    ]
                    if let expires = transaction.expirationDate {
                        payload["expiresAt"] = ISO8601DateFormatter().string(from: expires)
                    }
                    call.resolve(payload)

                case .userCancelled:
                    call.resolve(["status": "cancelled"])

                case .pending:
                    // Ask to Buy / SCA. Entitlement arrives later via Transaction.updates.
                    call.resolve(["status": "pending"])

                @unknown default:
                    call.resolve(["status": "unknown"])
                }
            } catch {
                call.reject("Purchase failed: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Restore  (App Store Guideline 3.1.1 — REQUIRED)

    @objc func restorePurchases(_ call: CAPPluginCall) {
        Task {
            // AppStore.sync() prompts for the Apple ID password. Only call it from
            // an explicit "Restore Purchases" tap — never automatically on launch.
            do {
                try await AppStore.sync()
            } catch {
                // A cancelled password prompt lands here. Still report what we know.
            }
            call.resolve(["productIds": await activeProductIds()])
        }
    }

    // MARK: - Entitlements  (safe to call on every launch)

    @objc func currentEntitlements(_ call: CAPPluginCall) {
        Task {
            call.resolve(["productIds": await activeProductIds()])
        }
    }

    // MARK: - Helpers

    private func activeProductIds() async -> [String] {
        var ids: [String] = []
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result else { continue }
            guard transaction.revocationDate == nil else { continue }
            if let expires = transaction.expirationDate, expires < Date() { continue }
            ids.append(transaction.productID)
        }
        return ids
    }

    private func emitEntitlements() async {
        let ids = await activeProductIds()
        notifyListeners("entitlementsChanged", data: ["productIds": ids])
    }

    private func periodLabel(_ period: Product.SubscriptionPeriod) -> String {
        let n = period.value
        switch period.unit {
        case .day:   return n == 1 ? "day"   : "\(n) days"
        case .week:  return n == 1 ? "week"  : "\(n) weeks"
        case .month: return n == 1 ? "month" : "\(n) months"
        case .year:  return n == 1 ? "year"  : "\(n) years"
        @unknown default: return "period"
        }
    }
}
