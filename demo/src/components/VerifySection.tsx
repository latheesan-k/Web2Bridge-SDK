import { useState, useEffect } from 'react'
import { useCip8Verify, type VerificationResult } from '../hooks/useCip8Verify'

interface VerifySectionProps {
  pendingCbor: string | null
  onConsumed: () => void
}

function VerifySection({ pendingCbor, onConsumed }: VerifySectionProps) {
  const [cborHex, setCborHex] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [result, setResult] = useState<VerificationResult | null>(null)

  const { verify } = useCip8Verify()

  useEffect(() => {
    if (pendingCbor) {
      setCborHex(pendingCbor)
      onConsumed()
      runVerify(pendingCbor.trim())
    }
  }, [pendingCbor, onConsumed])

  async function runVerify(hex: string) {
    setIsVerifying(true)
    setResult(null)
    try {
      setResult(await verify(hex))
    } catch (err) {
      setResult({ valid: false, error: err instanceof Error ? err.message : 'Verification failed' })
    } finally {
      setIsVerifying(false)
    }
  }

  const handleVerify = () => {
    if (cborHex.trim()) runVerify(cborHex.trim())
  }

  return (
    <div>
      <div className="section-label">🔍 Verify a Signature (CIP-8)</div>
      <div className="card">
        <div className="card-sub">
          Paste a CIP-8 CBOR signature to decode and verify it.
        </div>

        <textarea
          id="cbor-input"
          value={cborHex}
          onChange={(e) => { setCborHex(e.target.value); setResult(null) }}
          placeholder="Paste a CBOR hex signature here..."
          rows={3}
          style={{ marginBottom: 12 }}
        />

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn-primary"
            onClick={handleVerify}
            disabled={isVerifying || !cborHex.trim()}
          >
            {isVerifying ? <><span className="spinner" /> Verifying...</> : 'Verify Signature'}
          </button>
          {(cborHex || result) && (
            <button className="btn-sm" onClick={() => { setCborHex(''); setResult(null) }} style={{ width: 'auto' }}>Clear</button>
          )}
        </div>

        {result && (
          <div className={`result-box ${result.valid ? 'result-valid' : 'result-invalid'}`}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: result.valid ? 12 : 0 }}>
              <span className="result-icon">{result.valid ? '✓' : '✗'}</span>
              <span className="result-title">
                {result.valid ? 'Valid CIP-8 Signature' : 'Invalid Signature'}
              </span>
            </div>

            {result.valid && (
              <div className="result-detail">
                {result.message && (
                  <div className="verify-field">
                    <label>Message</label>
                    <div className="mono-box">{result.message}</div>
                  </div>
                )}

                {result.stakeAddress && (
                  <div className="verify-field">
                    <label>Stake Address (from payload)</label>
                    <div className="mono-box">{result.stakeAddress}</div>
                  </div>
                )}

                {result.signerAddressHex && (
                  <div className="verify-field">
                    <label>Signing Address (from CIP-8 headers)</label>
                    <div className="mono-box" style={{ fontSize: '0.7rem' }}>{result.signerAddressHex}</div>
                  </div>
                )}

                {result.publicKeyHex && (
                  <div className="verify-field">
                    <label>Public Key (Ed25519)</label>
                    <div className="mono-box" style={{ fontSize: '0.7rem' }}>{result.publicKeyHex}</div>
                  </div>
                )}
              </div>
            )}

            {result.error && (
              <div style={{ marginTop: 8, fontSize: '0.82rem' }}>{result.error}</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default VerifySection
