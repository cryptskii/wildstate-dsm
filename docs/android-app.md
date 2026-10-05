# Wildstate Android app

The Android app opens the hosted Wildstate game in a hardware-accelerated WebView, in portrait, with the game icon. DSM links open the installed DSM wallet; returning preserves the game's WebView and login storage. Wallet approval stays in the wallet. Android 8 or newer is required. The APK contains the Android host, not an offline game server.

## Local preview

Use JDK 17 or 21 and Android SDK 35. Set ANDROID_HOME, or create ignored android/local.properties with sdk.dir. Run `npm run android:debug`. The default debug-only URL is the current development game at http://192.168.4.46:5173/. Override it with WILDSTATE_GAME_URL. The preview installs as Wildstate Preview, with a separate app ID so it will not conflict with public releases. A debug APK is not the public release.

## Public APK for GitHub

Set WILDSTATE_GAME_URL to the final public HTTPS Vercel game URL. Release builds reject missing/publicly unsuitable endpoints and missing signing credentials. The public manifest does not allow cleartext HTTP. The Wi-Fi address is never accepted for a release.

Use one permanent release signing key for every update. Keep an encrypted backup outside GitHub. Generate it with Android Studio's signed APK wizard or keytool; never commit the key or passwords. Configure these GitHub secrets:

- WILDSTATE_KEYSTORE_BASE64: base64 of the release keystore.
- WILDSTATE_KEYSTORE_PASSWORD: keystore password.
- WILDSTATE_KEY_ALIAS: signing key alias.
- WILDSTATE_KEY_PASSWORD: key password.

Set the repository variable WILDSTATE_GAME_URL. Run the Android APK workflow with the game URL/version, or push a v-prefixed tag. The workflow validates the game, builds a signed APK, uploads an artifact, and creates a **draft** GitHub release for tags with wildstate.apk and SHA256SUMS. Test the hosted game, touch controls, wallet handoff/return, disconnect/reconnect, and upgrades before publishing the draft. People download wildstate.apk from Releases and permit installation from their browser or file manager.

Local release builds use WILDSTATE_KEYSTORE_PATH (an absolute file path), plus the same password/alias variables. Run `npm run android:release`. The Android package is org.deterministicstatemachine.wildstate. Increment WILDSTATE_VERSION_CODE for each distributed update.

## Vercel deployment status

Vercel serves the frontend at https://wildstate-dsm.vercel.app/. The live RPGJS backend and the game's DSM account run separately on the existing cloud fleet with persistent room and profile storage. `VITE_GAME_HOST` selects the public backend address at frontend build time; no account keys belong in browser settings.

The game repository is https://github.com/cryptskii/wildstate-dsm. See [production hosting](../deploy/README.md) for the exact cloud layout, network boundaries, and activation status. Public play and a public APK remain pending until the backend's public connection and wallet workflow are verified.

References: https://developer.android.com/develop/ui/views/layout/webapps/webview, https://developer.android.com/studio/publish/app-signing, https://vercel.com/docs/functions/websockets.
