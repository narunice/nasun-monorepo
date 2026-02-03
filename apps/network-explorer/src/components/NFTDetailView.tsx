/**
 * NFTDetailView Component
 * Specialized view for NFT objects with visual-first layout
 */

import { useState } from 'react';
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
import { parseContent, getOwnerAddress } from '../lib/object-utils';

interface NFTDetailViewProps {
  object: SuiObjectResponse;
}

export default function NFTDetailView({ object }: NFTDetailViewProps) {
  const [showRawData, setShowRawData] = useState(false);

  const data = object.data;
  if (!data) return null;

  const display = data.display?.data;
  const content = parseContent(data.content);

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
        <Link to="/" className="text-primary hover:underline">
          &larr; Back to Home
        </Link>
        <button
          onClick={() => setShowRawData(!showRawData)}
          className="text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          {showRawData ? 'Hide Raw Data' : 'Show Raw Data'}
        </button>
      </div>

      {/* Main content: 2-column layout on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: NFT Image (large) */}
        <Card variant="default" className="p-4">
          <div className="aspect-square rounded-lg overflow-hidden bg-muted/30">
            {mediaUrl ? (
              <NFTMedia
                url={mediaUrl}
                name={name}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg
                  className="w-16 h-16 text-muted-foreground/20"
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
              <span className="px-3 py-1 bg-secondary/20 border border-secondary/50 rounded-full text-xs text-primary font-medium">
                {collectionName || moduleName}
              </span>
            </div>
          )}

          {/* NFT Name */}
          <h1 className="text-2xl font-bold text-foreground">{name}</h1>

          {/* Owner */}
          {ownerAddress && (
            <Card variant="default" className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-secondary/20 flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-primary"
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
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Owner</p>
                  <CopyableId
                    value={ownerAddress}
                    shorten={8}
                    showCopy
                    showLink
                    linkType="address"
                    size="sm"
                  />
                </div>
              </div>
            </Card>
          )}

          {/* Object Details */}
          <Card variant="default" className="p-4 space-y-3">
            <CopyableId
              value={data.objectId}
              label="Object ID"
              shorten={10}
              showCopy
              size="xs"
            />
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Type</p>
              <p className="text-xs text-muted-foreground font-mono mt-1 break-all">
                {formatObjectType(data.type ?? undefined)}
              </p>
            </div>
            <div className="flex gap-6">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Version</p>
                <p className="text-sm text-foreground mt-1">{data.version}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Digest</p>
                <p className="text-sm text-muted-foreground font-mono mt-1">
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
          <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
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
              <pre className="text-xs overflow-auto bg-muted/30 border border-border p-4 rounded-lg max-h-96 text-muted-foreground">
                {JSON.stringify(content, null, 2)}
              </pre>
            </SectionBox>
          )}

          <SectionBox title="Raw Object Data" color="c6">
            <pre className="text-xs overflow-auto bg-muted/30 border border-border p-4 rounded-lg max-h-96 text-muted-foreground">
              {JSON.stringify(object, null, 2)}
            </pre>
          </SectionBox>
        </>
      )}
    </div>
  );
}
