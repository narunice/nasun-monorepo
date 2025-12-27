import { Button } from '../common';

interface MnemonicBackupProps {
  mnemonic: string;
  onConfirm: () => void;
}

export function MnemonicBackup({ mnemonic, onConfirm }: MnemonicBackupProps) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 rounded-lg p-6 max-w-lg">
        <h2 className="text-xl font-semibold mb-4 text-yellow-400">
          Backup Your Recovery Phrase!
        </h2>
        <p className="text-sm text-gray-400 mb-4">
          Write down these 12 words and store them safely. You will need them to recover your wallet.
        </p>
        <div className="bg-gray-900 p-4 rounded mb-4 font-mono text-sm break-words">
          {mnemonic}
        </div>
        <Button onClick={onConfirm} variant="success" fullWidth>
          I've saved my recovery phrase
        </Button>
      </div>
    </div>
  );
}
