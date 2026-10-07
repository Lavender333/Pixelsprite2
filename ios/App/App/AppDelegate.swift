import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        guard userActivity.activityType == NSUserActivityTypeBrowsingWeb,
              let url = userActivity.webpageURL else {
            return false
        }

        NotificationCenter.default.post(name: .capacitorOpenUniversalLink, object: [
            "url": url
        ])
        return true
    }

}

// Local StoreKit 2 bridge, compiled in the existing App target.
import StoreKit

@objc(PixelSpriteViewController)
class PixelSpriteViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(PixelSpritePurchasePlugin())
    }
}

@objc(PixelSpritePurchasePlugin)
public class PixelSpritePurchasePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PixelSpritePurchasePlugin"
    public let jsName = "InAppPurchase"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "purchaseProduct", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getEntitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise)
    ]
    private let productID = "Monthly"
    private var updatesTask: Task<Void, Never>?

    public override func load() {
        updatesTask = Task { [weak self] in
            for await update in StoreKit.Transaction.updates {
                guard let self else { return }
                guard case .verified(let transaction) = update,
                      transaction.productID == self.productID else { continue }
                let state = await self.entitlements()
                self.notifyListeners("entitlementsChanged", data: state, retainUntilConsumed: true)
                await transaction.finish()
            }
        }
    }

    deinit { updatesTask?.cancel() }

    private func entitlements() async -> [String: Any] {
        for await result in StoreKit.Transaction.currentEntitlements {
            guard case .verified(let transaction) = result,
                  transaction.productID == productID,
                  transaction.revocationDate == nil,
                  !transaction.isUpgraded,
                  transaction.expirationDate.map({ $0 > Date() }) ?? true else { continue }
            return ["active": true, "verified": true, "productId": productID,
                    "transactionId": String(transaction.id)]
        }
        return ["active": false, "verified": true]
    }

    @objc func getEntitlements(_ call: CAPPluginCall) {
        Task { call.resolve(await entitlements()) }
    }

    @objc func getProducts(_ call: CAPPluginCall) {
        Task {
            do {
                let products = try await Product.products(for: [productID])
                call.resolve(["products": products.map {
                    ["id": $0.id, "displayPrice": $0.displayPrice, "displayName": $0.displayName]
                }])
            } catch { call.reject(error.localizedDescription, "PRODUCT_LOOKUP_FAILED") }
        }
    }

    @objc func restorePurchases(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
                call.resolve(await entitlements())
            } catch { call.reject(error.localizedDescription, "RESTORE_FAILED") }
        }
    }

    @objc func purchaseProduct(_ call: CAPPluginCall) {
        guard call.getString("productId") == productID else {
            call.reject("Unknown App Store product.", "INVALID_PRODUCT")
            return
        }
        Task { @MainActor in
            do {
                guard let product = try await Product.products(for: [productID]).first else {
                    call.reject("Monthly is unavailable from Apple. Check the product ID, subscription status, storefront availability, and Paid Apps agreement in App Store Connect.", "PRODUCT_UNAVAILABLE")
                    return
                }
                switch try await product.purchase() {
                case .success(let verification):
                    guard case .verified(let transaction) = verification else {
                        call.reject("Apple could not verify this purchase.", "UNVERIFIED_TRANSACTION")
                        return
                    }
                    var state = await entitlements()
                    state["status"] = "purchased"
                    call.resolve(state)
                    await transaction.finish()
                case .userCancelled:
                    call.resolve(["status": "cancelled"])
                case .pending:
                    call.resolve(["status": "pending"])
                @unknown default:
                    call.reject("Unexpected Apple purchase result.", "UNKNOWN_RESULT")
                }
            } catch { call.reject(error.localizedDescription, "PURCHASE_FAILED") }
        }
    }
}
