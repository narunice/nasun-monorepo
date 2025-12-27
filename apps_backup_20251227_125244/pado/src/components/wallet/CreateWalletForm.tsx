import { useState } from 'react';
import { useWallet } from '@nasun/wallet';
import { Button } from '../common';

interface CreateWalletFormProps {
  onCreateSuccess: (mnemonic: string) => void;
}

export function CreateWalletForm({ onCreateSuccess }: CreateWalletFormProps) {
  const { createWalletWithBackup } = useWallet();
  const [password, setPassword] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!password || password.length < 8) {
      alert('Password must be at least 8 characters');
      return;
    }

    setIsCreating(true);
    try {
      const result = await createWalletWithBackup(password);
      onCreateSuccess(result.mnemonic);
      setPassword('');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to create wallet');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      <p className="text-sm text-gray-400 mb-4">
        Create a new wallet with a secure password.
      </p>
      <input
        type="password"
        placeholder="Enter password (min 8 chars)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full px-4 py-2 bg-gray-700 rounded mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <Button
        onClick={handleCreate}
        isLoading={isCreating}
        fullWidth
      >
        Create New Wallet
      </Button>
    </>
  );
}
