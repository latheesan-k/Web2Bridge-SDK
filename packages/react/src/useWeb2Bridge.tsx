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
  WalletInitState,
  WalletAddresses,
} from "@web2bridge/core";
import {
  isPRFSupported,
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
  createInitStateStorage,
  unlockPasswordWallet,
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
  /** True while the provider is initializing and auth state is being determined. Prevents UI flicker. */
  isLoading: boolean;
  isAuthenticated: boolean;
  wallet: Web2BridgeWallet | null;
  error: CoreError | null;
  /** Which entropy path was used for the current session. */
  entropyPath: EntropyPath;
  /** Whether the device supports WebAuthn PRF. `null` while detection is in progress. */
  prfSupported: boolean | null;
  /** `true` when the device lacks PRF and fallback is enabled — the UI should show a password field. */
  requiresPassword: boolean;

  // --- Seamless Wallet Issuance State ---
  /** True when wallet initialization state exists in storage (addresses may not be cached yet) */
  isWalletInitialized: boolean;
  /** True when wallet addresses are cached and ready for display */
  isWalletReady: boolean;
  /** Cached wallet addresses for immediate display */
  walletAddresses: WalletAddresses | null;
  /** The stored initialization state */
  initState: WalletInitState | null;
  /** True while auto-issuing wallet after auth */
  isAutoIssuing: boolean;

  // --- Methods ---
  /** Authenticate with the identity provider only (no wallet derivation). */
  authenticate: () => Promise<Result<void>>;
  /** Authenticate (if needed) and derive wallet. Returns the wallet instance for immediate use. */
  login: (options?: LoginOptions) => Promise<Result<Web2BridgeWallet>>;
  /** Clear wallet from memory without signing out. The auth session remains active. */
  lockWallet: () => void;
  logout: () => Promise<Result<void>>;
  exportRecoveryPhrase: (options?: ExportRecoveryPhraseOptions) => Promise<Result<string[]>>;
  /** 
   * Auto-issue wallet after successful Clerk authentication.
   * For PRF path: Stores credentialId for lazy authentication.
   * For password path: Requires password to create encrypted wallet.
   */
  autoIssueWallet: (password?: string) => Promise<Result<void>>;
  /**
   * Sign a message with lazy authentication.
   * For PRF: Prompts biometric, derives wallet, signs, caches addresses, locks.
   * For password: Prompts password, decrypts wallet, signs, caches addresses, locks.
   */
  signMessage: (message: string, password?: string) => Promise<Result<string>>;
  /**
   * Check if an existing wallet can be restored from storage.
   * Returns true if wallet state exists and belongs to current user.
   */
  restoreExistingWallet: () => Promise<boolean>;
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
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [wallet, setWallet] = useState<Web2BridgeWallet | null>(null);
  const [error, setError] = useState<CoreError | null>(null);
  const [entropyPath, setEntropyPath] = useState<EntropyPath>(null);
  const [prfSupported, setPrfSupported] = useState<boolean | null>(null);
  const mnemonicRef = useRef<string[] | null>(null);
  const [namespacedUserId, setNamespacedUserId] = useState<string | null>(null);
  const [credentialId, setCredentialId] = useState<string | null>(null);

  // --- Seamless Wallet Issuance State ---
  const [isWalletInitialized, setIsWalletInitialized] = useState(false);
  const [isWalletReady, setIsWalletReady] = useState(false);
  const [walletAddresses, setWalletAddresses] = useState<WalletAddresses | null>(null);
  const [initState, setInitState] = useState<WalletInitState | null>(null);
  const [isAutoIssuing, setIsAutoIssuing] = useState(false);

  const initStateStorage = useMemo(() => createInitStateStorage(), []);

  const providerConfig = useMemo<Web2BridgeProviderConfig>(
    () => getDefaultConfig(config),
    [config],
  );

  // On mount, restore session state and check for existing wallet
  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        // First, check for existing wallet initialization state
        const initResult = await initStateStorage.retrieve();
        if (!cancelled && initResult.data) {
          const state = initResult.data;
          setInitState(state);
          setIsWalletInitialized(true);
          setNamespacedUserId(state.namespacedUserId);

          // If addresses are cached, wallet is ready for display
          if (state.addresses) {
            setWalletAddresses(state.addresses);
            setIsWalletReady(true);
            setEntropyPath(state.entropyPath);
            if (state.credentialId) {
              setCredentialId(state.credentialId);
            }
          }
        }

        // Then restore auth session
        const hasSession = await adapter.restoreSession();
        if (!cancelled) {
          setIsAuthenticated(hasSession);
        }
      } catch {
        // Session restoration failed, assume not authenticated
        if (!cancelled) {
          setIsAuthenticated(false);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    initialize();

    return () => { cancelled = true; };
  }, [adapter, initStateStorage]);

  // Detect WebAuthn PRF support once on mount
  useEffect(() => {
    let cancelled = false;
    isPRFSupported().then((supported) => {
      if (!cancelled) setPrfSupported(supported);
    }).catch(() => {
      if (!cancelled) setPrfSupported(false);
    });
    return () => { cancelled = true; };
  }, []);

  const requiresPassword = prfSupported === false && providerConfig.fallback.enabled;

  // --- Auto-issue wallet after successful authentication ---
  useEffect(() => {
    let cancelled = false;

    async function autoIssue() {
      if (isAuthenticated && !isWalletInitialized && !isAutoIssuing && namespacedUserId) {
        setIsAutoIssuing(true);

        // For PRF path: We need to register/get credentialId but NOT prompt for biometrics
        // For password path: We'll wait for user to provide password

        if (prfSupported) {
          try {
            // Register PRF credential (this may prompt biometrics for initial registration)
            // Store credentialId for lazy authentication
            const prfResult = await getPRFSecret(namespacedUserId);

            const newInitState: WalletInitState = {
              version: "v1",
              namespacedUserId,
              entropyPath: "prf",
              addresses: null, // Addresses will be cached after first signing
              credentialId: prfResult.credentialId,
              createdAt: Date.now(),
              appDomain: providerConfig.appDomain,
            };

            await initStateStorage.store(newInitState);
            if (!cancelled) {
              setInitState(newInitState);
              setIsWalletInitialized(true);
              setCredentialId(prfResult.credentialId);
              setEntropyPath("prf");
            }
          } catch {
            // If PRF registration fails and fallback is enabled, switch to password path
            if (providerConfig.fallback.enabled && !cancelled) {
              // Don't auto-issue for password path - wait for user to provide password
              console.log("PRF registration failed, waiting for password");
            }
          }
        }
        // For password path, we don't auto-issue here - user must provide password

        if (!cancelled) {
          setIsAutoIssuing(false);
        }
      }
    }

    autoIssue();

    return () => { cancelled = true; };
  }, [isAuthenticated, isWalletInitialized, isAutoIssuing, namespacedUserId, prfSupported, providerConfig, initStateStorage]);

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
    // Note: JavaScript strings are immutable - we can only drop the reference
    mnemonicRef.current = null;
    setEntropyPath(null);
  }, []);

  const login = useCallback(
    async (options?: LoginOptions): Promise<Result<Web2BridgeWallet>> => {
      setError(null);

      // Early guard: if we already know PRF is unavailable and fallback requires a password
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

      // Step 1: Authenticate with the identity provider
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

      // Step 2: Determine entropy path and derive wallet
      const isPrfSupported = prfSupported ?? await isPRFSupported();
      let entropy: Uint8Array | undefined;
      let path: EntropyPath;
      let prfCredentialId: string | undefined;

      if (isPrfSupported) {
        console.log("[Web2Bridge] PRF is supported, attempting PRF-based wallet derivation");
        try {
          const prfResult = await getPRFSecret(nsUserId);
          console.log("[Web2Bridge] PRF secret obtained successfully", {
            credentialId: prfResult.credentialId,
            secretLength: prfResult.prfSecret.byteLength
          });
          prfCredentialId = prfResult.credentialId;
          const entropyResult = await generateEntropy(nsUserId, new Uint8Array(prfResult.prfSecret), {
            algorithm: providerConfig.kdf ?? "hkdf",
          });
          if (entropyResult.error) {
            console.error("[Web2Bridge] Entropy generation failed:", entropyResult.error);
            if (!providerConfig.fallback.enabled) {
              setError(entropyResult.error);
              return { data: null, error: entropyResult.error };
            }
          } else {
            entropy = entropyResult.data!;
            path = "prf";
            console.log("[Web2Bridge] PRF path successful, entropy generated");
          }
        } catch (e) {
          console.error("[Web2Bridge] PRF authentication failed:", e);
          if (e instanceof PasskeyRegistrationError || e instanceof PasskeyAuthError) {
            console.log("[Web2Bridge] Falling back to password (passkey error):", e.message);
            if (!providerConfig.fallback.enabled) {
              const errObj = e as CoreError;
              setError(errObj);
              return { data: null, error: errObj };
            }
            // PRF failed, mark as not supported so UI shows password input
            setPrfSupported(false);
          } else {
            console.log("[Web2Bridge] Falling back to password (unknown error)");
            if (!providerConfig.fallback.enabled) {
              const errObj = new PRFNotSupportedError();
              setError(errObj);
              return { data: null, error: errObj };
            }
            // PRF failed, mark as not supported so UI shows password input
            setPrfSupported(false);
          }
        }
      } else {
        console.log("[Web2Bridge] PRF not supported, will use password fallback");
      }

      if (!entropy && providerConfig.fallback.enabled) {
        const password = options?.password;
        if (!password) {
          console.log("[Web2Bridge] No entropy and no password provided");
          const errObj = new PRFNotSupportedError();
          setError(errObj);
          // Mark PRF as not supported so UI shows password input
          setPrfSupported(false);
          return {
            data: null,
            error: Object.assign(errObj, {
              message: "Password required: PRF is unavailable on this device",
            }),
          };
        }
        console.log("[Web2Bridge] Using password fallback path");

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

      // Step 3: Detect entropy path mismatch
      if (options?.expectedEntropyPath && options.expectedEntropyPath !== path!) {
        const errObj = new EntropyPathMismatchError();
        setError(errObj);
        return { data: null, error: errObj };
      }

      // Step 4: Derive mnemonic and create wallet
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
      if (path === "prf" && prfCredentialId) {
        setCredentialId(prfCredentialId);
      }
      setIsAuthenticated(true);
      return { data: w, error: null };
    },
    [adapter, providerConfig, prfSupported],
  );

  /**
   * Auto-issue wallet after Clerk authentication
   * For PRF: Registers credential and stores for lazy auth
   * For password: Creates encrypted wallet with provided password
   */
  const autoIssueWallet = useCallback(
    async (password?: string): Promise<Result<void>> => {
      if (!namespacedUserId) {
        const errObj = new Error("No authenticated user") as CoreError;
        setError(errObj);
        return { data: null, error: errObj };
      }

      setIsAutoIssuing(true);
      setError(null);

      try {
        const isPrfSupported = prfSupported ?? await isPRFSupported();

        if (isPrfSupported) {
          // PRF path: Register credential for lazy authentication
          try {
            const prfResult = await getPRFSecret(namespacedUserId);

            const newInitState: WalletInitState = {
              version: "v1",
              namespacedUserId,
              entropyPath: "prf",
              addresses: null,
              credentialId: prfResult.credentialId,
              createdAt: Date.now(),
              appDomain: providerConfig.appDomain,
            };

            await initStateStorage.store(newInitState);
            setInitState(newInitState);
            setIsWalletInitialized(true);
            setCredentialId(prfResult.credentialId);
            setEntropyPath("prf");
            setIsWalletReady(true); // Mark wallet as ready (addresses fetched lazily on first use)

            return { data: undefined, error: null };
          } catch (e) {
            // Fall through to password path if fallback enabled
            if (!providerConfig.fallback.enabled) {
              const errObj = e instanceof Error ? (e as CoreError) : new Error("PRF registration failed") as CoreError;
              setError(errObj);
              return { data: null, error: errObj };
            }
          }
        }

        // Password path: Create encrypted wallet
        if (!password) {
          const errObj = new PRFNotSupportedError();
          setError(errObj);
          return {
            data: null,
            error: Object.assign(errObj, {
              message: "Password required to create wallet",
            }),
          };
        }

        const walletResult = await unlockPasswordWallet({
          namespacedUserId,
          password,
          appDomain: providerConfig.appDomain,
          config: providerConfig,
        });

        if (walletResult.error) {
          setError(walletResult.error);
          return { data: null, error: walletResult.error };
        }

        // Get addresses from the newly created wallet
        const w = walletResult.data!.wallet;
        const addrsResult = await w.getUsedAddresses();
        const stakeResult = await w.getRewardAddresses();
        const netResult = await w.getNetworkId();

        if (addrsResult.error || !addrsResult.data?.length ||
          stakeResult.error || !stakeResult.data?.length) {
          const errObj = new Error("Failed to get wallet addresses") as CoreError;
          setError(errObj);
          return { data: null, error: errObj };
        }

        const addresses: WalletAddresses = {
          payment: addrsResult.data[0],
          stake: stakeResult.data[0],
          networkId: netResult.data ?? 1,
        };

        // Store initialization state with cached addresses
        const newInitState: WalletInitState = {
          version: "v1",
          namespacedUserId,
          entropyPath: "password",
          addresses,
          createdAt: Date.now(),
          appDomain: providerConfig.appDomain,
        };

        await initStateStorage.store(newInitState);
        setInitState(newInitState);
        setIsWalletInitialized(true);
        setWalletAddresses(addresses);
        setIsWalletReady(true);
        setEntropyPath("password");

        // Lock wallet after getting addresses
        lockWallet();

        return { data: undefined, error: null };
      } finally {
        setIsAutoIssuing(false);
      }
    },
    [namespacedUserId, prfSupported, providerConfig, initStateStorage, lockWallet],
  );

  /**
   * Sign a message with lazy authentication
   * Derives/unlocks wallet, signs, caches addresses, then locks
   */
  const signMessage = useCallback(
    async (message: string, password?: string): Promise<Result<string>> => {
      if (!initState || !namespacedUserId) {
        const errObj = new Error("Wallet not initialized") as CoreError;
        setError(errObj);
        return { data: null, error: errObj };
      }

      setError(null);

      try {
        let w: Web2BridgeWallet;
        let addresses: WalletAddresses;

        if (initState.entropyPath === "prf" && initState.credentialId) {
          // PRF path: Authenticate with biometrics, then derive wallet
          const prfResult = await authenticateWithPRF(namespacedUserId, initState.credentialId);

          const entropyResult = await generateEntropy(
            namespacedUserId,
            new Uint8Array(prfResult.prfSecret),
            { algorithm: providerConfig.kdf ?? "hkdf" },
          );

          if (entropyResult.error) {
            setError(entropyResult.error);
            return { data: null, error: entropyResult.error };
          }

          const mnemonicResult = await entropyToMnemonic(entropyResult.data!);
          if (mnemonicResult.error) {
            setError(mnemonicResult.error);
            return { data: null, error: mnemonicResult.error };
          }

          const appId = await deriveAppId(providerConfig.appDomain);
          const walletResult = createWallet(mnemonicResult.data!, appId, {
            networkId: providerConfig.networkId ?? 1,
          });

          if (walletResult.error) {
            setError(walletResult.error);
            return { data: null, error: walletResult.error };
          }

          w = walletResult.data!;

          // Get addresses
          const addrsResult = await w.getUsedAddresses();
          const stakeResult = await w.getRewardAddresses();
          const netResult = await w.getNetworkId();

          if (addrsResult.error || !addrsResult.data?.length ||
            stakeResult.error || !stakeResult.data?.length) {
            const errObj = new Error("Failed to get wallet addresses") as CoreError;
            setError(errObj);
            return { data: null, error: errObj };
          }

          addresses = {
            payment: addrsResult.data[0],
            stake: stakeResult.data[0],
            networkId: netResult.data ?? 1,
          };
        } else {
          // Password path: Decrypt wallet
          if (!password) {
            const errObj = new PRFNotSupportedError();
            setError(errObj);
            return {
              data: null,
              error: Object.assign(errObj, {
                message: "Password required to sign message",
              }),
            };
          }

          const walletResult = await unlockPasswordWallet({
            namespacedUserId,
            password,
            appDomain: providerConfig.appDomain,
            config: providerConfig,
          });

          if (walletResult.error) {
            setError(walletResult.error);
            return { data: null, error: walletResult.error };
          }

          w = walletResult.data!.wallet;

          // Use cached addresses or get from wallet
          if (initState.addresses) {
            addresses = initState.addresses;
          } else {
            const addrsResult = await w.getUsedAddresses();
            const stakeResult = await w.getRewardAddresses();
            const netResult = await w.getNetworkId();

            if (addrsResult.error || !addrsResult.data?.length ||
              stakeResult.error || !stakeResult.data?.length) {
              const errObj = new Error("Failed to get wallet addresses") as CoreError;
              setError(errObj);
              return { data: null, error: errObj };
            }

            addresses = {
              payment: addrsResult.data[0],
              stake: stakeResult.data[0],
              networkId: netResult.data ?? 1,
            };
          }
        }

        // Sign the message
        const payload = JSON.stringify({
          stake_address: addresses.stake,
          message: message.trim(),
        });

        const signResult = await w.signData(addresses.payment, payload);

        // Lock wallet after signing
        lockWallet();

        if (signResult.error) {
          setError(signResult.error);
          return { data: null, error: signResult.error };
        }

        // Cache addresses if not already cached
        if (!initState.addresses) {
          const updatedInitState: WalletInitState = {
            ...initState,
            addresses,
          };
          await initStateStorage.store(updatedInitState);
          setInitState(updatedInitState);
          setWalletAddresses(addresses);
          setIsWalletReady(true);
        }

        return { data: signResult.data!, error: null };
      } catch (e) {
        // Ensure wallet is locked even on error
        lockWallet();
        const errObj = e instanceof Error ? (e as CoreError) : new Error("Signing failed") as CoreError;
        setError(errObj);
        return { data: null, error: errObj };
      }
    },
    [initState, namespacedUserId, providerConfig, initStateStorage, lockWallet],
  );

  /**
   * Check if an existing wallet can be restored from storage
   */
  const restoreExistingWallet = useCallback(
    async (): Promise<boolean> => {
      const result = await initStateStorage.retrieve();
      if (result.error || !result.data) return false;

      const state = result.data;
      setInitState(state);
      setIsWalletInitialized(true);
      setNamespacedUserId(state.namespacedUserId);

      if (state.addresses) {
        setWalletAddresses(state.addresses);
        setIsWalletReady(true);
      }

      setEntropyPath(state.entropyPath);
      if (state.credentialId) {
        setCredentialId(state.credentialId);
      }

      return true;
    },
    [initStateStorage],
  );

  const logout = useCallback(async (): Promise<Result<void>> => {
    // Clear wallet and mnemonic ref before calling provider logout
    // Note: JavaScript strings are immutable - we can only drop the reference
    setWallet(null);
    if (mnemonicRef.current) {
      mnemonicRef.current = null;
    }
    setEntropyPath(null);
    setCredentialId(null);
    setNamespacedUserId(null);
    setIsAuthenticated(false);

    // Clear initialization state
    await initStateStorage.clear();
    setInitState(null);
    setIsWalletInitialized(false);
    setIsWalletReady(false);
    setWalletAddresses(null);

    const logoutResult = await adapter.logout();
    if (logoutResult.error) {
      setError(logoutResult.error);
      return logoutResult;
    }

    setError(null);
    return { data: undefined, error: null };
  }, [adapter, initStateStorage]);

  const exportRecoveryPhrase = useCallback(
    async (options?: ExportRecoveryPhraseOptions): Promise<Result<string[]>> => {
      if (!mnemonicRef.current || !namespacedUserId) {
        const errObj = new ExportVerificationError("No wallet available — please login first");
        setError(errObj);
        return { data: null, error: errObj };
      }

      const prfSupportedNow = await isPRFSupported();

      // Re-verification before exposing the mnemonic
      if (entropyPath === "prf" && prfSupportedNow && credentialId) {
        try {
          await authenticateWithPRF(namespacedUserId, credentialId);
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

      return { data: [...mnemonicRef.current], error: null };
    },
    [adapter, entropyPath, namespacedUserId, credentialId, providerConfig],
  );

  const value: Web2BridgeContextValue = useMemo(
    () => ({
      isReady: true,
      isLoading,
      isAuthenticated,
      wallet,
      error,
      entropyPath,
      prfSupported,
      requiresPassword,
      // Seamless wallet state
      isWalletInitialized,
      isWalletReady,
      walletAddresses,
      initState,
      isAutoIssuing,
      // Methods
      authenticate,
      login,
      lockWallet,
      logout,
      exportRecoveryPhrase,
      autoIssueWallet,
      signMessage,
      restoreExistingWallet,
    }),
    [
      isLoading,
      isAuthenticated,
      wallet,
      error,
      entropyPath,
      prfSupported,
      requiresPassword,
      isWalletInitialized,
      isWalletReady,
      walletAddresses,
      initState,
      isAutoIssuing,
      authenticate,
      login,
      lockWallet,
      logout,
      exportRecoveryPhrase,
      autoIssueWallet,
      signMessage,
      restoreExistingWallet,
    ],
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
