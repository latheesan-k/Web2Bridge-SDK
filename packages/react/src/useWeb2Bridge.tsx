import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  ReactNode,
} from "react";
import type {
  AuthAdapter,
  Result,
  Web2BridgeWallet,
  Web2BridgeError as CoreError,
  EntropyPath,
} from "@web2bridge/core";
import {
  detectPRFSupport,
  generateEntropy,
  generateEntropyFromPassword,
  buildNamespacedUserId,
  deriveAppId,
  entropyToMnemonic,
  createWallet,
  getDefaultConfig,
  type Web2BridgeProviderConfig,
  type NetworkId,
  PRFNotSupportedError,
  PasskeyAuthError,
  PasskeyRegistrationError,
  ExportVerificationError,
  EntropyPathMismatchError,
  authenticateWithPRF,
  getPRFSecret,
} from "@web2bridge/core";

export interface Web2BridgeConfig {
  appDomain: string;
  networkId?: NetworkId;
  kdf?: "hkdf" | "pbkdf2" | "argon2id";
  fallback?: {
    enabled?: boolean;
    kdf?: "pbkdf2" | "argon2id";
  };
}

export interface Web2BridgeContextValue {
  isReady: boolean;
  isAuthenticated: boolean;
  wallet: Web2BridgeWallet | null;
  error: CoreError | null;
  /** Which entropy path was used for the current session. */
  entropyPath: EntropyPath;
  /** Whether the device supports WebAuthn PRF. `null` while detection is in progress. */
  prfSupported: boolean | null;
  /** `true` when the device lacks PRF and fallback is enabled — the UI should show a password field. */
  requiresPassword: boolean;

  /** Authenticate with the identity provider only (no wallet derivation). */
  authenticate: () => Promise<Result<void>>;
  /** Authenticate (if needed) and derive wallet. Returns the wallet instance for immediate use. */
  login: (options?: LoginOptions) => Promise<Result<Web2BridgeWallet>>;
  /** Clear wallet from memory without signing out. The auth session remains active. */
  lockWallet: () => void;
  logout: () => Promise<Result<void>>;
  exportRecoveryPhrase: (options?: ExportRecoveryPhraseOptions) => Promise<Result<string[]>>;
}

export interface LoginOptions {
  /** Spending password for the fallback path. Required when PRF is unavailable. */
  password?: string;
  /**
   * The entropy path the user registered with. Pass this (e.g. from your DB)
   * to detect cross-device path mismatches and surface EntropyPathMismatchError.
   * PRD §2.4.
   */
  expectedEntropyPath?: "prf" | "password";
}

export interface ExportRecoveryPhraseOptions {
  /** Spending password — required when entropyPath is "password". */
  password?: string;
}

const Web2BridgeContext = createContext<Web2BridgeContextValue | null>(null);

export interface Web2BridgeProviderProps {
  adapter: AuthAdapter;
  config: Web2BridgeConfig;
  children: ReactNode;
}

/** Constant-time string comparison to prevent timing side-channels. */
export function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function Web2BridgeProvider({
  adapter,
  config,
  children,
}: Web2BridgeProviderProps): React.JSX.Element {
  const [isAuthenticated, setIsAuthenticated] = useState(adapter.isAuthenticated());
  const [wallet, setWallet] = useState<Web2BridgeWallet | null>(null);
  const [error, setError] = useState<CoreError | null>(null);
  const [entropyPath, setEntropyPath] = useState<EntropyPath>(null);
  const [prfSupported, setPrfSupported] = useState<boolean | null>(null);
  const mnemonicRef = useRef<string[] | null>(null);
  const [namespacedUserId, setNamespacedUserId] = useState<string | null>(null);

  const providerConfig = useMemo<Web2BridgeProviderConfig>(
    () => getDefaultConfig(config),
    [config],
  );

  // On mount, restore isAuthenticated state from the adapter without triggering
  // any WebAuthn prompts. The wallet is in-memory only and cannot be restored
  // across page reloads — the developer must call login() explicitly after a
  // user interaction. (PRD §F1)
  useEffect(() => {
    setIsAuthenticated(adapter.isAuthenticated());
  }, [adapter]);

  // Detect WebAuthn PRF support once on mount so the UI can self-configure
  // without needing a failed login attempt first.
  useEffect(() => {
    let cancelled = false;
    detectPRFSupport().then((supported) => {
      if (!cancelled) setPrfSupported(supported);
    }).catch(() => {
      if (!cancelled) setPrfSupported(false);
    });
    return () => { cancelled = true; };
  }, []);

  const requiresPassword = prfSupported === false && providerConfig.fallback.enabled;

  const authenticate = useCallback(
    async (): Promise<Result<void>> => {
      setError(null);
      const loginResult = await adapter.login();
      if (loginResult.error) {
        setError(loginResult.error);
        return { data: null, error: loginResult.error };
      }
      const userIdResult = await adapter.getUserId();
      if (userIdResult.error) {
        setError(userIdResult.error);
        return { data: null, error: userIdResult.error };
      }
      const nsUserId = buildNamespacedUserId(adapter.providerId, userIdResult.data!);
      setNamespacedUserId(nsUserId);
      setIsAuthenticated(true);
      return { data: undefined, error: null };
    },
    [adapter],
  );

  const lockWallet = useCallback(() => {
    setWallet(null);
    if (mnemonicRef.current) {
      mnemonicRef.current.fill(0 as unknown as string);
      mnemonicRef.current = null;
    }
    setEntropyPath(null);
  }, []);

  const login = useCallback(
    async (options?: LoginOptions): Promise<Result<Web2BridgeWallet>> => {
      setError(null);

      // --- Early guard: if we already know PRF is unavailable and fallback
      // requires a password, bail out BEFORE opening the auth provider's
      // sign-in UI.  This prevents the Clerk modal from appearing only to
      // fail afterwards with a "password required" error.  PRD §F2b. ---
      if (prfSupported === false && providerConfig.fallback.enabled && !options?.password) {
        const errObj = new PRFNotSupportedError();
        setError(errObj);
        return {
          data: null,
          error: Object.assign(errObj, {
            message: "Password required: PRF is unavailable on this device",
          }),
        };
      }

      // --- Step 1: Authenticate with the identity provider ---
      // If already authenticated, adapter.login() returns immediately.
      const loginResult = await adapter.login();
      if (loginResult.error) {
        setError(loginResult.error);
        return { data: null, error: loginResult.error };
      }

      const userIdResult = await adapter.getUserId();
      if (userIdResult.error) {
        setError(userIdResult.error);
        return { data: null, error: userIdResult.error };
      }

      const nsUserId = buildNamespacedUserId(adapter.providerId, userIdResult.data!);
      setNamespacedUserId(nsUserId);

      // --- Step 2: Determine entropy path ---
      // Use the cached detection result when available; fall back to a fresh check.
      const isPrfSupported = prfSupported ?? await detectPRFSupport();
      let entropy: Uint8Array | undefined;
      let path: EntropyPath;

      if (isPrfSupported) {
        try {
          const prfSecret = await getPRFSecret(nsUserId);
          const entropyResult = await generateEntropy(nsUserId, new Uint8Array(prfSecret), {
            algorithm: providerConfig.kdf ?? "hkdf",
          });
          if (entropyResult.error) {
            if (!providerConfig.fallback.enabled) {
              setError(entropyResult.error);
              return { data: null, error: entropyResult.error };
            }
            // Fall through to password path
          } else {
            entropy = entropyResult.data!;
            path = "prf";
          }
        } catch (e) {
          if (e instanceof PasskeyRegistrationError || e instanceof PasskeyAuthError) {
            if (!providerConfig.fallback.enabled) {
              const errObj = e as CoreError;
              setError(errObj);
              return { data: null, error: errObj };
            }
            // Fall through to password path
          } else {
            if (!providerConfig.fallback.enabled) {
              const errObj = new PRFNotSupportedError();
              setError(errObj);
              return { data: null, error: errObj };
            }
          }
        }
      }

      if (!entropy && providerConfig.fallback.enabled) {
        const password = options?.password;
        if (!password) {
          const errObj = new PRFNotSupportedError();
          setError(errObj);
          // Return a clear signal that a password is needed
          return {
            data: null,
            error: Object.assign(errObj, {
              message: "Password required: PRF is unavailable on this device",
            }),
          };
        }

        const entropyResult = await generateEntropyFromPassword(nsUserId, password, {
          algorithm: providerConfig.fallback.kdf ?? "argon2id",
        });
        if (entropyResult.error) {
          setError(entropyResult.error);
          return { data: null, error: entropyResult.error };
        }
        entropy = entropyResult.data!;
        path = "password";
      } else if (!entropy) {
        const errObj = new PRFNotSupportedError();
        setError(errObj);
        return { data: null, error: errObj };
      }

      // --- Step 3: Detect entropy path mismatch (PRD §2.4) ---
      if (options?.expectedEntropyPath && options.expectedEntropyPath !== path!) {
        const errObj = new EntropyPathMismatchError();
        setError(errObj);
        return { data: null, error: errObj };
      }

      // --- Step 4: Derive mnemonic and create wallet ---
      const mnemonicResult = await entropyToMnemonic(entropy!);
      if (mnemonicResult.error) {
        setError(mnemonicResult.error);
        return { data: null, error: mnemonicResult.error };
      }
      const mnemonicWords = mnemonicResult.data!;
      mnemonicRef.current = mnemonicWords;

      const appId = await deriveAppId(providerConfig.appDomain);
      const walletResult = createWallet(mnemonicWords, appId, {
        networkId: providerConfig.networkId ?? 1,
      });

      if (walletResult.error) {
        setError(walletResult.error);
        return { data: null, error: walletResult.error };
      }

      const w = walletResult.data!;
      setWallet(w);
      setEntropyPath(path!);
      setIsAuthenticated(true);
      return { data: w, error: null };
    },
    [adapter, providerConfig, prfSupported],
  );

  const logout = useCallback(async (): Promise<Result<void>> => {
    // Clear wallet and wipe mnemonic from memory before calling provider logout
    setWallet(null);
    if (mnemonicRef.current) {
      mnemonicRef.current.fill(0 as unknown as string);
      mnemonicRef.current = null;
    }
    setEntropyPath(null);
    setNamespacedUserId(null);
    setIsAuthenticated(false);

    const logoutResult = await adapter.logout();
    if (logoutResult.error) {
      setError(logoutResult.error);
      return logoutResult;
    }

    setError(null);
    return { data: undefined, error: null };
  }, [adapter]);

  const exportRecoveryPhrase = useCallback(
    async (options?: ExportRecoveryPhraseOptions): Promise<Result<string[]>> => {
      if (!mnemonicRef.current || !namespacedUserId) {
        const errObj = new ExportVerificationError("No wallet available — please login first");
        setError(errObj);
        return { data: null, error: errObj };
      }

      const prfSupported = await detectPRFSupport();

      // --- Re-verification before exposing the mnemonic (PRD §F6) ---
      if (entropyPath === "prf" && prfSupported) {
        try {
          // Fresh WebAuthn re-authentication — user must touch their authenticator
          await authenticateWithPRF(namespacedUserId);
        } catch {
          const errObj = new ExportVerificationError("Re-authentication failed");
          setError(errObj);
          return { data: null, error: errObj };
        }
      } else if (entropyPath === "password") {
        const password = options?.password;
        if (!password) {
          const errObj = new ExportVerificationError(
            "Password required for recovery phrase export",
          );
          setError(errObj);
          return { data: null, error: errObj };
        }

        try {
          const verifyResult = await generateEntropyFromPassword(
            namespacedUserId,
            password,
            { algorithm: providerConfig.fallback.kdf ?? "argon2id" },
          );
          if (verifyResult.error) {
            const errObj = new ExportVerificationError("Password verification failed");
            setError(errObj);
            return { data: null, error: errObj };
          }

          const verifyMnemonicResult = await entropyToMnemonic(verifyResult.data!);
          if (verifyMnemonicResult.error) {
            const errObj = new ExportVerificationError("Password verification failed");
            setError(errObj);
            return { data: null, error: errObj };
          }

          // Constant-time comparison — prevents timing side-channels (SPEC-05)
          const verifyStr = verifyMnemonicResult.data!.join(" ");
          const storedStr = mnemonicRef.current.join(" ");
          if (!timingSafeStringEqual(verifyStr, storedStr)) {
            const errObj = new ExportVerificationError("Password verification failed");
            setError(errObj);
            return { data: null, error: errObj };
          }
        } catch {
          const errObj = new ExportVerificationError("Password verification failed");
          setError(errObj);
          return { data: null, error: errObj };
        }
      }

      // Spread to a new array so callers cannot mutate the ref's contents
      return { data: [...mnemonicRef.current], error: null };
    },
    [adapter, entropyPath, namespacedUserId, providerConfig],
  );

  const value: Web2BridgeContextValue = useMemo(
    () => ({
      isReady: true,
      isAuthenticated,
      wallet,
      error,
      entropyPath,
      prfSupported,
      requiresPassword,
      authenticate,
      login,
      lockWallet,
      logout,
      exportRecoveryPhrase,
    }),
    [isAuthenticated, wallet, error, entropyPath, prfSupported, requiresPassword, authenticate, login, lockWallet, logout, exportRecoveryPhrase],
  );

  return <Web2BridgeContext.Provider value={value}>{children}</Web2BridgeContext.Provider>;
}

export function useWeb2Bridge(): Web2BridgeContextValue {
  const context = useContext(Web2BridgeContext);
  if (!context) {
    throw new Error("useWeb2Bridge must be used within a Web2BridgeProvider");
  }
  return context;
}

export { Web2BridgeContext };
