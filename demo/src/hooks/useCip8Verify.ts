import { useCallback } from 'react'

export interface VerificationResult {
  valid: boolean
  /** Raw payload text (or hex if not UTF-8) */
  rawPayload?: string
  /** Parsed stake_address from JSON payload, if present */
  stakeAddress?: string
  /** Parsed message field from JSON payload, if present */
  message?: string
  /** Signing address extracted from CIP-8 protected headers (hex) */
  signerAddressHex?: string
  /** Ed25519 public key from unprotected headers (hex) */
  publicKeyHex?: string
  /** Ed25519 signature (hex) */
  signatureHex?: string
  error?: string
}

export function useCip8Verify() {
  const verify = useCallback(async (cborHex: string): Promise<VerificationResult> => {
    try {
      if (!cborHex) {
        return { valid: false, error: 'No CBOR hex provided' }
      }

      const cleaned = cborHex.replace(/\s/g, '').replace(/^0x/i, '')
      if (!/^[0-9a-fA-F]+$/.test(cleaned)) {
        return { valid: false, error: 'Invalid hex format' }
      }

      const bytes = hexToBytes(cleaned)
      const parsed = parseCoseSign1(bytes)
      if (!parsed) {
        return { valid: false, error: 'Failed to parse COSE_Sign1 structure' }
      }

      const { protectedHeaders, payload, signature, publicKey } = parsed

      if (signature.length !== 64) {
        return { valid: false, error: `Invalid signature length: expected 64 bytes, got ${signature.length}` }
      }

      if (publicKey && publicKey.length !== 32) {
        return { valid: false, error: `Invalid public key length: expected 32 bytes, got ${publicKey.length}` }
      }

      let rawPayload: string | undefined
      let stakeAddress: string | undefined
      let message: string | undefined

      if (payload && payload.length > 0) {
        try {
          rawPayload = new TextDecoder('utf-8', { fatal: true }).decode(payload)
          const jsonPayload = JSON.parse(rawPayload)
          if (jsonPayload.stake_address) stakeAddress = jsonPayload.stake_address
          if (jsonPayload.message) message = jsonPayload.message
        } catch {
          rawPayload = rawPayload || bytesToHex(payload)
        }
      }

      const signerAddressHex = extractAddressFromProtectedHeaders(protectedHeaders)

      return {
        valid: true,
        rawPayload,
        stakeAddress,
        message,
        signerAddressHex: signerAddressHex || undefined,
        publicKeyHex: publicKey ? bytesToHex(publicKey) : undefined,
        signatureHex: bytesToHex(signature),
      }
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : 'Verification failed',
      }
    }
  }, [])

  return { verify }
}

interface CoseSign1 {
  protectedHeaders: Uint8Array
  payload: Uint8Array | null
  signature: Uint8Array
  publicKey: Uint8Array | null
}

function extractAddressFromProtectedHeaders(protectedHeaderBytes: Uint8Array): string | null {
  if (protectedHeaderBytes.length < 2) return null

  try {
    const headerMap = protectedHeaderBytes
    const addrMarker = new TextEncoder().encode('address')

    for (let i = 0; i < headerMap.length - addrMarker.length - 2; i++) {
      let found = true
      const textLen = headerMap[i]
      if ((textLen & 0xe0) !== 0x60) continue
      const strLen = textLen & 0x1f
      if (strLen !== addrMarker.length) continue

      for (let j = 0; j < addrMarker.length; j++) {
        if (headerMap[i + 1 + j] !== addrMarker[j]) {
          found = false
          break
        }
      }

      if (found) {
        const afterKey = i + 1 + addrMarker.length
        if (afterKey < headerMap.length) {
          const item = readCborItem(headerMap, afterKey)
          if (item.data && item.data.length > 0) {
            return bytesToHex(item.data)
          }
        }
      }
    }
  } catch {
    // Ignore parse errors
  }

  return null
}

function parseCoseSign1(bytes: Uint8Array): CoseSign1 | null {
  if (bytes.length < 4) return null
  if (bytes[0] !== 0x84) return null

  let offset = 1
  const items: (Uint8Array | null)[] = []

  for (let i = 0; i < 4; i++) {
    if (offset >= bytes.length) {
      items.push(null)
      continue
    }
    const result = readCborItem(bytes, offset)
    items.push(result.data)
    offset = result.next
  }

  const protectedHeaders = items[0] || new Uint8Array(0)
  const unprotectedMap = items[1]
  const payload = items[2]
  const signature = items[3] || new Uint8Array(0)

  let publicKey: Uint8Array | null = null

  if (unprotectedMap) {
    publicKey = findPublicKeyInMap(bytes, 1)
  }

  return { protectedHeaders, payload, signature, publicKey }
}

function findPublicKeyInMap(fullBytes: Uint8Array, mapStartOffset: number): Uint8Array | null {
  for (let i = mapStartOffset; i < fullBytes.length - 34; i++) {
    if (fullBytes[i] === 0x58 && fullBytes[i + 1] === 0x20) {
      const key = fullBytes.slice(i + 2, i + 2 + 32)
      if (key.some((b) => b !== 0 && b !== 0xff)) {
        return key
      }
    }
  }
  return null
}

function readCborItem(bytes: Uint8Array, offset: number): { data: Uint8Array | null; next: number } {
  if (offset >= bytes.length) return { data: null, next: bytes.length }

  const byte = bytes[offset]
  const major = byte >> 5
  const additional = byte & 0x1f

  if (major === 2 || major === 3) {
    let len: number
    let dataStart: number

    if (additional < 24) {
      len = additional
      dataStart = offset + 1
    } else if (additional === 24) {
      len = bytes[offset + 1]
      dataStart = offset + 2
    } else if (additional === 25) {
      len = (bytes[offset + 1] << 8) | bytes[offset + 2]
      dataStart = offset + 3
    } else {
      return { data: null, next: offset + 1 }
    }

    if (dataStart + len > bytes.length) {
      return { data: null, next: bytes.length }
    }

    return { data: bytes.slice(dataStart, dataStart + len), next: dataStart + len }
  }

  if (major === 5) {
    let mapEntries: number
    let pos: number

    if (additional < 24) {
      mapEntries = additional
      pos = offset + 1
    } else if (additional === 24) {
      mapEntries = bytes[offset + 1]
      pos = offset + 2
    } else {
      return { data: bytes.slice(offset, offset + 1), next: offset + 1 }
    }

    for (let i = 0; i < mapEntries * 2; i++) {
      const skip = readCborItem(bytes, pos)
      pos = skip.next
    }

    return { data: bytes.slice(offset, pos), next: pos }
  }

  if (byte === 0xf6) {
    return { data: null, next: offset + 1 }
  }

  if (major === 0) {
    if (additional < 24) return { data: null, next: offset + 1 }
    if (additional === 24) return { data: null, next: offset + 2 }
    if (additional === 25) return { data: null, next: offset + 3 }
    return { data: null, next: offset + 1 }
  }

  if (major === 1) {
    if (additional < 24) return { data: null, next: offset + 2 }
    if (additional === 24) return { data: null, next: offset + 2 }
    return { data: null, next: offset + 1 }
  }

  return { data: null, next: offset + 1 }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}
