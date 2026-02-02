/**
 * AddressBookPanel Component
 * Manage saved addresses with labels, trust status, and transaction history
 */

import { useState, useMemo, useEffect } from 'react';
import { useAddressBook, shortenAddress } from '@nasun/wallet';
import { CopyableAddress } from './CopyableAddress';
import { PanelHeader } from '../shared';

interface AddressBookPanelProps {
  onClose?: () => void;
  onSelect?: (address: string) => void;
  onSend?: (address: string) => void;
  compact?: boolean;
  /** Pre-fill address for adding/editing */
  initialAddress?: string;
}

export function AddressBookPanel({ onClose, onSelect, onSend, compact = false, initialAddress }: AddressBookPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingAddress, setEditingAddress] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // New address addition state
  const [addingNew, setAddingNew] = useState(false);
  const [newAddress, setNewAddress] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const {
    getAllEntries,
    getEntry,
    addAddress,
    updateLabel,
    trustAddress,
    untrustAddress,
    removeAddress,
  } = useAddressBook();

  // Handle initialAddress prop
  useEffect(() => {
    if (initialAddress) {
      const existingEntry = getEntry(initialAddress);
      if (existingEntry) {
        // Address already exists - go to edit mode
        setEditingAddress(initialAddress);
        setEditLabel(existingEntry.label || '');
      } else {
        // New address - go to add mode
        setAddingNew(true);
        setNewAddress(initialAddress);
        setNewLabel('');
      }
    }
  }, [initialAddress, getEntry]);

  const handleAddNew = () => {
    const trimmedAddress = newAddress.trim();
    if (trimmedAddress) {
      addAddress(trimmedAddress, newLabel.trim() || undefined);
      setAddingNew(false);
      setNewAddress('');
      setNewLabel('');
    }
  };

  const handleCancelAdd = () => {
    setAddingNew(false);
    setNewAddress('');
    setNewLabel('');
  };

  const entries = getAllEntries();

  const filteredEntries = useMemo(() => {
    if (!searchQuery) return entries;
    const q = searchQuery.toLowerCase();
    return entries.filter(
      (e) =>
        e.address.toLowerCase().includes(q) ||
        e.label?.toLowerCase().includes(q)
    );
  }, [entries, searchQuery]);

  const sortedEntries = useMemo(() => {
    return [...filteredEntries].sort((a, b) => {
      // Trusted first
      if (a.isTrusted && !b.isTrusted) return -1;
      if (!a.isTrusted && b.isTrusted) return 1;
      // Then by last transaction
      return (b.lastTransactionAt || 0) - (a.lastTransactionAt || 0);
    });
  }, [filteredEntries]);

  const handleStartEdit = (address: string, currentLabel?: string) => {
    setEditingAddress(address);
    setEditLabel(currentLabel || '');
  };

  const handleSaveLabel = () => {
    if (editingAddress) {
      updateLabel(editingAddress, editLabel);
      setEditingAddress(null);
      setEditLabel('');
    }
  };

  const handleCancelEdit = () => {
    setEditingAddress(null);
    setEditLabel('');
  };

  const handleToggleTrust = (address: string, currentlyTrusted: boolean) => {
    if (currentlyTrusted) {
      untrustAddress(address);
    } else {
      trustAddress(address);
    }
  };

  const handleDelete = (address: string) => {
    if (deleteConfirm === address) {
      removeAddress(address);
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(address);
      // Auto-clear confirm after 3 seconds
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  const handleSelect = (address: string) => {
    if (onSelect) {
      onSelect(address);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className={`${compact ? 'p-3' : 'p-4'} w-full`}>
      <PanelHeader
        title="Address Book"
        onClose={onClose}
        titleIcon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
        }
      />

      {/* Search */}
      <div className="relative mb-4">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-zinc-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          placeholder="Search addresses..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-3 py-2 bg-gray-100 dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded text-gray-900 dark:text-white text-sm xl:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 dark:placeholder-zinc-400"
        />
      </div>

      {/* Add New Address Section */}
      {addingNew ? (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <h4 className="text-sm xl:text-base font-medium text-gray-900 dark:text-white mb-2">
            Add New Address
          </h4>
          <input
            type="text"
            placeholder="0x..."
            value={newAddress}
            onChange={(e) => setNewAddress(e.target.value)}
            className="w-full px-3 py-2 mb-2 bg-white dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded text-sm xl:text-base text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 dark:placeholder-zinc-400"
            autoFocus={!initialAddress}
          />
          <input
            type="text"
            placeholder="Label (optional)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddNew();
              if (e.key === 'Escape') handleCancelAdd();
            }}
            className="w-full px-3 py-2 mb-3 bg-white dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded text-sm xl:text-base text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 dark:placeholder-zinc-400"
            autoFocus={!!initialAddress}
          />
          <div className="flex gap-2">
            <button
              onClick={handleAddNew}
              disabled={!newAddress.trim()}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded text-sm xl:text-base transition-colors"
            >
              Add
            </button>
            <button
              onClick={handleCancelAdd}
              className="px-3 py-1.5 text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-white text-sm xl:text-base transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAddingNew(true)}
          className="mb-4 w-full py-2 text-sm xl:text-base text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded border border-dashed border-blue-300 dark:border-blue-700 transition-colors"
        >
          + Add New Address
        </button>
      )}

      {/* Address List */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {sortedEntries.length === 0 ? (
          <div className="text-center py-8">
            <svg
              className="w-12 h-12 mx-auto text-gray-300 dark:text-zinc-600 mb-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <p className="text-gray-500 dark:text-zinc-400 text-sm xl:text-base">
              {searchQuery ? 'No addresses found' : 'No saved addresses yet'}
            </p>
            <p className="text-gray-400 dark:text-zinc-500 text-xs xl:text-sm mt-1">
              {searchQuery ? 'Try a different search' : 'Addresses are saved automatically after transactions'}
            </p>
          </div>
        ) : (
          sortedEntries.map((entry) => (
            <div
              key={entry.address}
              className={`p-3 bg-gray-50 dark:bg-zinc-700/50 rounded-lg border border-gray-200 dark:border-zinc-600/50 ${
                onSelect ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-700' : ''
              }`}
              onClick={onSelect ? () => handleSelect(entry.address) : undefined}
            >
              {/* Entry Header */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {entry.isTrusted && (
                    <span className="text-yellow-500" title="Trusted">
                      ⭐
                    </span>
                  )}
                  {editingAddress === entry.address ? (
                    <input
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveLabel();
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                      className="px-2 py-0.5 bg-white dark:bg-zinc-600 border border-gray-300 dark:border-zinc-500 rounded text-sm xl:text-base text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="Enter label..."
                      autoFocus
                    />
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="text-base md:text-lg xl:text-xl font-medium text-gray-900 dark:text-white truncate">
                        {entry.label || shortenAddress(entry.address)}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartEdit(entry.address, entry.label);
                        }}
                        className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors flex-shrink-0"
                        title="Edit name"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
                <span className="text-sm xl:text-base text-gray-500 dark:text-zinc-400">
                  {entry.transactionCount} tx{entry.transactionCount !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Address */}
              <div className="mb-2" onClick={(e) => e.stopPropagation()}>
                <CopyableAddress
                  value={entry.address}
                  shorten={8}
                  showExplorer
                  explorerType="address"
                  size="xs"
                />
              </div>

              {/* Last Transaction */}
              {entry.lastTransactionAt && (
                <p className="text-xs xl:text-sm text-gray-400 dark:text-zinc-500 mb-2">
                  Last: {formatDate(entry.lastTransactionAt)}
                </p>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                {editingAddress === entry.address ? (
                  <>
                    <button
                      onClick={handleSaveLabel}
                      className="px-2 py-1 text-xs xl:text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="px-2 py-1 text-sm xl:text-base text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    {onSend && (
                      <button
                        onClick={() => onSend(entry.address)}
                        className="px-2 py-1 text-xs xl:text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                      >
                        Send
                      </button>
                    )}
                    <button
                      onClick={() => handleToggleTrust(entry.address, entry.isTrusted)}
                      className={`px-2 py-1 text-xs xl:text-sm rounded transition-colors ${
                        entry.isTrusted
                          ? 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border border-yellow-300 dark:border-yellow-500/30'
                          : 'text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-white border border-gray-300 dark:border-zinc-600 hover:border-gray-400 dark:hover:border-zinc-500'
                      }`}
                    >
                      {entry.isTrusted ? 'Trusted ✓' : 'Trust'}
                    </button>
                    <button
                      onClick={() => handleDelete(entry.address)}
                      className={`px-2 py-1 text-xs xl:text-sm rounded transition-colors ${
                        deleteConfirm === entry.address
                          ? 'bg-red-600 text-white'
                          : 'text-gray-500 dark:text-zinc-400 hover:text-red-500 dark:hover:text-red-400 border border-gray-300 dark:border-zinc-600 hover:border-red-300 dark:hover:border-red-500/50'
                      }`}
                    >
                      {deleteConfirm === entry.address ? 'Confirm?' : 'Delete'}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Info Box */}
      {entries.length > 0 && (
        <div className="mt-4 bg-gray-100 dark:bg-zinc-700/50 rounded p-3">
          <p className="text-sm xl:text-base text-gray-500 dark:text-zinc-400">
            <span className="font-medium text-gray-600 dark:text-zinc-300">Tip:</span> Mark addresses as trusted to skip the first-time recipient warning when sending.
          </p>
        </div>
      )}
    </div>
  );
}
