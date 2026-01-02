/**
 * PaymentQRCode - QR code for receiving payments
 * Generates a QR code with payment link that includes recipient address
 */

import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { useWallet, useZkLogin, shortenAddress } from '@nasun/wallet';

interface PaymentQRCodeProps {
  amount?: string;
  token?: string;
  message?: string;
}

export function PaymentQRCode({ amount, token = 'NASUN', message }: PaymentQRCodeProps) {
  const { account, status } = useWallet();
  const { isConnected: isZkLoggedIn, state: zkState } = useZkLogin();
  const [copied, setCopied] = useState(false);

  // Check if connected via traditional wallet OR zkLogin
  const isConnected = (status === 'unlocked' && account) || isZkLoggedIn;
  const connectedAddress = account?.address || zkState?.address;

  // Wallet not connected
  if (!isConnected || !connectedAddress) {
    return (
      <div className="p-6 bg-theme-bg-secondary rounded-lg text-center">
        <p className="text-theme-text-muted">Connect wallet to generate QR code</p>
      </div>
    );
  }

  // Build payment URL
  const paymentUrl = new URL(`${window.location.origin}/send`);
  paymentUrl.searchParams.set('to', connectedAddress);
  if (amount) paymentUrl.searchParams.set('amount', amount);
  if (token) paymentUrl.searchParams.set('token', token);
  if (message) paymentUrl.searchParams.set('msg', message);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(paymentUrl.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyAddress = async () => {
    await navigator.clipboard.writeText(connectedAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-6 bg-theme-bg-secondary rounded-lg">
      <h3 className="text-lg font-medium text-theme-text-primary mb-4">Receive Payment</h3>

      {/* QR Code */}
      <div className="flex justify-center mb-4">
        <div className="p-4 bg-white rounded-lg shadow-sm">
          <QRCodeSVG
            value={paymentUrl.toString()}
            size={180}
            level="M"
            includeMargin={false}
          />
        </div>
      </div>

      {/* Amount display (if set) */}
      {amount && (
        <div className="text-center mb-4">
          <p className="text-2xl font-bold text-theme-text-primary">
            {amount} <span className="text-theme-accent">{token}</span>
          </p>
        </div>
      )}

      {/* Address */}
      <div
        className="bg-theme-bg-tertiary rounded p-3 mb-4 cursor-pointer hover:bg-theme-border transition-colors"
        onClick={handleCopyAddress}
        title="Click to copy address"
      >
        <p className="text-xs text-theme-text-muted mb-1">Your Address</p>
        <p className="text-sm text-theme-text-primary font-mono break-all">
          {shortenAddress(connectedAddress, 10)}
        </p>
      </div>

      {/* Copy link button */}
      <button
        onClick={handleCopy}
        className="w-full py-2.5 px-4 bg-theme-accent text-white rounded-lg hover:opacity-90 transition-opacity font-medium"
      >
        {copied ? 'Copied!' : 'Copy Payment Link'}
      </button>

      {/* Hint */}
      <p className="text-xs text-theme-text-muted text-center mt-3">
        Scan this QR code to send tokens to your wallet
      </p>
    </div>
  );
}
