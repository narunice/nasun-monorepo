import { useState } from 'react';
import { useWallet } from '../../wallet';
import { Button } from '../common';

interface ImportWalletFormProps {
  onImportSuccess: () => void;
}

export function ImportWalletForm({ onImportSuccess }: ImportWalletFormProps) {
  const { importFromMnemonic, importFromPrivateKey } = useWallet();
  const [importType, setImportType] = useState<'mnemonic' | 'privateKey'>('mnemonic');
  const [importMnemonic, setImportMnemonic] = useState('');
  const [importPrivateKey, setImportPrivateKey] = useState('');
  const [password, setPassword] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const handleImport = async () => {
    if (!password || password.length < 8) {
      alert('Password must be at least 8 characters');
      return;
    }

    setIsImporting(true);
    try {
      if (importType === 'mnemonic') {
        if (!importMnemonic.trim()) {
          alert('Please enter your recovery phrase');
          return;
        }
        await importFromMnemonic(importMnemonic.trim(), password);
      } else {
        if (!importPrivateKey.trim()) {
          alert('Please enter your private key');
          return;
        }
        await importFromPrivateKey(importPrivateKey.trim(), password);
      }
      // Clear form on success
      setPassword('');
      setImportMnemonic('');
      setImportPrivateKey('');
      onImportSuccess();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to import wallet');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <>
      <p className="text-sm text-gray-400 mb-4">
        Restore your wallet using a recovery phrase or private key.
      </p>

      {/* Import Type Toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setImportType('mnemonic')}
          className={`flex-1 py-2 text-sm rounded transition-colors ${
            importType === 'mnemonic'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
          }`}
        >
          Recovery Phrase
        </button>
        <button
          onClick={() => setImportType('privateKey')}
          className={`flex-1 py-2 text-sm rounded transition-colors ${
            importType === 'privateKey'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
          }`}
        >
          Private Key
        </button>
      </div>

      {/* Mnemonic Input */}
      {importType === 'mnemonic' && (
        <textarea
          placeholder="Enter your 12-word recovery phrase..."
          value={importMnemonic}
          onChange={(e) => setImportMnemonic(e.target.value)}
          rows={3}
          className="w-full px-4 py-2 bg-gray-700 rounded mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono text-sm"
        />
      )}

      {/* Private Key Input */}
      {importType === 'privateKey' && (
        <input
          type="password"
          placeholder="Enter private key (suiprivkey1...)"
          value={importPrivateKey}
          onChange={(e) => setImportPrivateKey(e.target.value)}
          className="w-full px-4 py-2 bg-gray-700 rounded mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
        />
      )}

      <input
        type="password"
        placeholder="Set password for this wallet (min 8 chars)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full px-4 py-2 bg-gray-700 rounded mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <Button
        onClick={handleImport}
        isLoading={isImporting}
        variant="success"
        fullWidth
      >
        Import Wallet
      </Button>
    </>
  );
}
