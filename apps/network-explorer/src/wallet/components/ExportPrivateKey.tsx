/**
 * Nasun Wallet Export Private Key Component
 * 개인키 내보내기 (비밀번호 확인 필요)
 */

import { useState, useCallback } from 'react';

interface ExportPrivateKeyProps {
  onExport: (password: string) => Promise<string>;
  onClose: () => void;
}

export function ExportPrivateKey({ onExport, onClose }: ExportPrivateKeyProps) {
  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const handleExport = useCallback(async () => {
    if (!password) {
      setError('Please enter your password');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const key = await onExport(password);
      setPrivateKey(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export private key');
    } finally {
      setIsLoading(false);
    }
  }, [password, onExport]);

  const handleCopy = useCallback(async () => {
    if (!privateKey) return;

    try {
      await navigator.clipboard.writeText(privateKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // 클립보드 접근 실패 시 무시
    }
  }, [privateKey]);

  const handleClose = useCallback(() => {
    // 민감 정보 정리
    setPrivateKey(null);
    setPassword('');
    onClose();
  }, [onClose]);

  // 개인키가 표시된 상태
  if (privateKey) {
    return (
      <div className="p-4 bg-zinc-800 rounded-lg">
        <h3 className="text-lg font-bold text-red-500 mb-4 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Your Private Key
        </h3>

        {/* 경고 메시지 */}
        <div className="bg-red-900/30 border border-red-500/50 rounded p-3 mb-4">
          <ul className="text-xs text-red-400 space-y-1">
            <li className="flex items-start gap-2">
              <span className="text-red-500 mt-0.5">!</span>
              <span>Anyone with this key can access your funds</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-500 mt-0.5">!</span>
              <span>Never share this key with anyone</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-500 mt-0.5">!</span>
              <span>Store it in a secure location</span>
            </li>
          </ul>
        </div>

        {/* 개인키 표시 */}
        <div className="mb-4">
          <div className="relative">
            <div className="p-3 bg-zinc-900 border border-zinc-700 rounded font-mono text-sm break-all">
              {showKey ? (
                <span className="text-white">{privateKey}</span>
              ) : (
                <span className="text-zinc-500">{'•'.repeat(64)}</span>
              )}
            </div>
            <button
              onClick={() => setShowKey(!showKey)}
              className="absolute top-2 right-2 p-1.5 bg-zinc-700 hover:bg-zinc-600 rounded transition-colors"
              title={showKey ? 'Hide' : 'Show'}
            >
              {showKey ? (
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className={`flex-1 py-2 flex items-center justify-center gap-2 rounded transition-colors ${
              copied
                ? 'bg-green-500/20 text-green-400'
                : 'bg-zinc-700 hover:bg-zinc-600 text-white'
            }`}
          >
            {copied ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy
              </>
            )}
          </button>
          <button
            onClick={handleClose}
            className="flex-1 py-2 bg-red-500/80 hover:bg-red-500 text-white font-medium rounded transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // 비밀번호 입력 화면
  return (
    <div className="p-4 bg-zinc-800 rounded-lg">
      <h3 className="text-lg font-bold text-white mb-4">Export Private Key</h3>

      {/* 경고 */}
      <div className="bg-yellow-900/30 border border-yellow-500/50 rounded p-3 mb-4">
        <p className="text-xs text-yellow-400">
          Warning: Your private key grants full access to your wallet. Make sure no one is watching your screen.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-zinc-400 mb-2">
            Enter your password to continue
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your wallet password"
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-white placeholder-zinc-500 focus:border-yellow-500 focus:outline-none"
            disabled={isLoading}
            onKeyDown={(e) => e.key === 'Enter' && handleExport()}
          />
        </div>

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="flex-1 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={isLoading || !password}
            className="flex-1 py-2 bg-yellow-500 hover:bg-yellow-400 disabled:bg-zinc-600 disabled:text-zinc-400 text-black font-medium rounded transition-colors"
          >
            {isLoading ? 'Verifying...' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
}
