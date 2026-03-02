# Device Support

## Primary Path — WebAuthn PRF

| Environment | PRF Support | Notes |
|---|---|---|
| iOS 18+ / iPadOS 18+ — Safari 18+ | ✅ Full | Via iCloud Keychain platform passkeys |
| Android 14+ — Chrome >= 130 | ✅ Full | Via Google Password Manager |
| macOS Sequoia 15.4+ — Chrome/Edge >= 128 or Safari 18.4 | ✅ Full | Requires iCloud Keychain enabled |
| Hardware security keys (YubiKey 5, Titan M2, Feitian) | ✅ Full | Via any PRF-aware browser |
| Firefox — hardware security key | 🟡 Partial | PRF with external CTAP2 keys only |
| **Windows Hello (Windows 11)** | ❌ None | PRF not yet shipped — fallback required |
| iOS/iPadOS — external USB/NFC keys | ❌ None | Apple doesn't pass PRF data to roaming authenticators |
| Older Android (< 14) / Chrome (< 130) | ❌ None | Fallback required |
| iOS/iPadOS < 18 | ❌ None | Fallback required |
| macOS < 15 | ❌ None | Fallback required |

> **Practical implication:** A significant portion of desktop users (particularly Windows users) will require the fallback path until Microsoft ships PRF support for Windows Hello.

## Fallback Path

The fallback path depends only on the Web Crypto API, which is universally supported in all modern browsers. It is available on **any device** that cannot support the primary path.
