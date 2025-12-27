import { useState } from 'react';
import { useWallet } from '../../wallet';
import { Button } from '../common';

export function UnlockForm() {
  const { unlockWallet } = useWallet();
  const [password, setPassword] = useState('');

  const handleUnlock = async () => {
    try {
      await unlockWallet(password);
      setPassword('');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to unlock');
    }
  };

  return (
    <div className="max-w-md mx-auto bg-gray-800 rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">Unlock Wallet</h2>
      <input
        type="password"
        placeholder="Enter password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
        className="w-full px-4 py-2 bg-gray-700 rounded mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <Button onClick={handleUnlock} fullWidth>
        Unlock
      </Button>
    </div>
  );
}
