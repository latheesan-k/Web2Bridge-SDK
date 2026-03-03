// Export from WebAuthn module
export * from "./webauthn";
export * from "./kdf";
export * from "./fallback";
export * from "./encryption";

// Export detailed PRF detection types and function
export type {
  PRFDetectionResult,
  PRFDetectionDetails,
  PRFSupportLevel,
  BrowserInfo,
} from "./prf";
export { detectPRFSupportDetailed } from "./prf";
