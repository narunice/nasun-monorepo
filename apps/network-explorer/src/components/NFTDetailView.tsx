/**
 * NFTDetailView Component
 * Specialized view for NFT objects with visual-first layout
 */

import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import type { SuiObjectResponse } from '@mysten/sui/client';
import NFTMedia from './NFTMedia';
import NFTAttributes from './NFTAttributes';
import CopyableId from './CopyableId';
import { SectionBox } from './ui/SectionBox';
import { Card } from './ui/Card';
import { getDisplayMediaUrl, getNFTName, getNFTDescription } from '../lib/media';
import { extractAttributes, getCollectionName, getModuleName, shortenId } from '../lib/nft';
import { formatObjectType } from '../lib/format';

interface NFTDetailViewProps {
  object: SuiObjectResponse;
}

// Parse content to get fields
function parseContent(
  content: SuiObjectResponse['data']
): { fields?: Record<string, unknown> } | null {
  if (!content?.content) return null;
  if (content.content.dataType !== 'moveObject') return null;
  return { fields: content.content.fields as Record<string, unknown> };
}

// Get owner address from owner object
function getOwnerAddress(owner: unknown): string | null {
  if (!owner || typeof owner !== 'object') return null;
  if ('AddressOwner' in (owner as Record<string, unknown>)) {
    return (owner as { AddressOwner: string }).AddressOwner;
  }
  if ('ObjectOwner' in (owner as Record<string, unknown>)) {
    return (owner as { ObjectOwner: string }).ObjectOwner;
  }
  return null;
}

export default function NFTDetailView({ object }: NFTDetailViewProps) {
  const [showRawData, setShowRawData] = useState(false);
  const [ownerCopied, setOwnerCopied] = useState(false);

  const handleCopyOwner = useCallback(async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setOwnerCopied(true);
      setTimeout(() => setOwnerCopied(false), 1500);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }, []);

  const data = object.data;
  if (!data) return null;

  const display = data.display?.data;
  const content = parseContent(data);

  // Extract NFT info with fallback
  const mediaUrl = getDisplayMediaUrl(display, content);
  const name = getNFTName(display, content) || 'Unnamed NFT';
  const description = getNFTDescription(display, content);
  const attributes = extractAttributes(display, content);
  const collectionName = getCollectionName(data.type);
  const moduleName = getModuleName(data.type);
  const ownerAddress = getOwnerAddress(data.owner);

  return (
    <div className="space-y-6">
      {/* Header with back button and raw data toggle */}
      <div className="flex items-center justify-between">
        <Link to="/" className="text-nasun-c4 hover:underline">
          &larr; Back to Home
        </Link>
        <button
          onClick={() => setShowRawData(!showRawData)}
          className="text-sm text-nasun-white/60 hover:text-nasun-c4 transition-colors"
        >
          {showRawData ? 'Hide Raw Data' : 'Show Raw Data'}
        </button>
      </div>

      {/* Main content: 2-column layout on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: NFT Image (large) */}
        <Card variant="c6" className="p-4">
          <div className="aspect-square rounded-lg overflow-hidden bg-nasun-c6/60">
            {mediaUrl ? (
              <NFTMedia
                url={mediaUrl}
                name={name}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg
                  className="w-16 h-16 text-nasun-white/20"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
            )}
          </div>
        </Card>

        {/* Right: NFT Info */}
        <div className="space-y-4">
          {/* Collection badge */}
          {(collectionName || moduleName) && (
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-nasun-c5/30 border border-nasun-c5/50 rounded-full text-xs text-nasun-c4 font-medium">
                {collectionName || moduleName}
              </span>
            </div>
          )}

          {/* NFT Name */}
          <h1 className="text-2xl font-bold text-nasun-white">{name}</h1>

          {/* Owner */}
          {ownerAddress && (
            <Card variant="c6" className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-nasun-c5/30 flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-nasun-c4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-nasun-white/50 uppercase tracking-wide">Owner</p>
                  <div className="flex items-center gap-1">
                    <Link
                      to={`/address/${ownerAddress}`}
                      className="text-sm text-nasun-c4 hover:underline font-mono"
                    >
                      {shortenId(ownerAddress, 8)}
                    </Link>
                    <button
                      onClick={() => handleCopyOwner(ownerAddress)}
                      className="p-0.5 text-nasun-white/40 hover:text-nasun-c4 transition-colors"
                      title={ownerCopied ? 'Copied!' : 'Copy address'}
                      type="button"
                    >
                      {ownerCopied ? (
                        <svg
                          className="w-3.5 h-3.5 text-nasun-c3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      ) : (
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Object Details */}
          <Card variant="c6" className="p-4 space-y-3">
            <CopyableId
              value={data.objectId}
              label="Object ID"
              shorten={10}
              showCopy
              size="xs"
            />
            <div>
              <p className="text-xs text-nasun-white/50 uppercase tracking-wide">Type</p>
              <p className="text-xs text-nasun-white/80 font-mono mt-1 break-all">
                {formatObjectType(data.type ?? undefined)}
              </p>
            </div>
            <div className="flex gap-6">
              <div>
                <p className="text-xs text-nasun-white/50 uppercase tracking-wide">Version</p>
                <p className="text-sm text-nasun-white mt-1">{data.version}</p>
              </div>
              <div>
                <p className="text-xs text-nasun-white/50 uppercase tracking-wide">Digest</p>
                <p className="text-sm text-nasun-white/80 font-mono mt-1">
                  {shortenId(data.digest || '', 6)}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Description */}
      {description && (
        <SectionBox title="Description" color="c5">
          <p className="text-nasun-white/80 text-sm leading-relaxed">{description}</p>
        </SectionBox>
      )}

      {/* Attributes */}
      {attributes.length > 0 && (
        <SectionBox title="Attributes" color="c4">
          <NFTAttributes attributes={attributes} />
        </SectionBox>
      )}

      {/* Raw Data (toggleable) */}
      {showRawData && (
        <>
          {content && (
            <SectionBox title="Content" color="c3">
              <pre className="text-xs overflow-auto bg-nasun-c6/60 border border-nasun-c3/30 p-4 rounded-lg max-h-96 text-nasun-white/80">
                {JSON.stringify(content, null, 2)}
              </pre>
            </SectionBox>
          )}

          <SectionBox title="Raw Object Data" color="c6">
            <pre className="text-xs overflow-auto bg-nasun-c6/60 border border-nasun-c5/30 p-4 rounded-lg max-h-96 text-nasun-white/80">
              {JSON.stringify(object, null, 2)}
            </pre>
          </SectionBox>
        </>
      )}
    </div>
  );
}
