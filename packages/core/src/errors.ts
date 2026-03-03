export class Web2BridgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Web2BridgeError";
  }
}

export class PRFNotSupportedError extends Web2BridgeError {
  constructor() {
    super("WebAuthn PRF is not supported on this device");
    this.name = "PRFNotSupportedError";
  }
}

export class PasskeyRegistrationError extends Web2BridgeError {
  constructor(message: string) {
    super(message);
    this.name = "PasskeyRegistrationError";
  }
}

export class PasskeyAuthError extends Web2BridgeError {
  constructor(message: string) {
    super(message);
    this.name = "PasskeyAuthError";
  }
}

export class AuthAdapterError extends Web2BridgeError {
  constructor(message: string) {
    super(message);
    this.name = "AuthAdapterError";
  }
}

export class DerivationError extends Web2BridgeError {
  constructor(message: string) {
    super(message);
    this.name = "DerivationError";
  }
}

export class WalletError extends Web2BridgeError {
  constructor(message: string) {
    super(message);
    this.name = "WalletError";
  }
}

export class ExportVerificationError extends Web2BridgeError {
  constructor(message: string) {
    super(message);
    this.name = "ExportVerificationError";
  }
}

export class WeakPasswordError extends Web2BridgeError {
  constructor(message: string = "Password does not meet minimum strength requirements") {
    super(message);
    this.name = "WeakPasswordError";
  }
}

export class PasswordAuthError extends Web2BridgeError {
  constructor(message: string) {
    super(message);
    this.name = "PasswordAuthError";
  }
}

export class EntropyPathMismatchError extends Web2BridgeError {
  constructor(message: string = "Entropy path mismatch: cannot switch between PRF and password authentication") {
    super(message);
    this.name = "EntropyPathMismatchError";
  }
}

export class StorageError extends Web2BridgeError {
  readonly code = "STORAGE_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}

export class EncryptionError extends Web2BridgeError {
  readonly code = "ENCRYPTION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "EncryptionError";
  }
}
