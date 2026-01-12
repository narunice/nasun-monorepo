import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getAddressInfo, getAddressTransactions, loadMoreObjects } from '../lib/sui-client';
import { formatBalance, formatObjectType } from '../lib/format';
import { isNFTObject } from '../lib/media';
import InfoRow from '../components/InfoRow';
import NFTCard from '../components/NFTCard';
import { CoinSymbol } from '../components/CoinSymbol';
import { SectionBox } from '../components/ui/SectionBox';
import { Card } from '../components/ui/Card';
import type { SuiObjectResponse } from '@mysten/sui/client';

function formatTimestamp(timestampMs: string | number | null | undefined) {
  if (!timestampMs) return '-';
  const date = new Date(Number(timestampMs));
  return date.toLocaleString('en-US');
}

function truncateDigest(digest: string) {
  return `${digest.slice(0, 8)}...${digest.slice(-6)}`;
}

// 토큰 잔액 포맷 (decimals 고려)
// 알려진 토큰 decimals: NASUN=9, NUSDC=6, NBTC=8
function formatTokenBalance(balance: string, coinType: string): string {
  const value = BigInt(balance);

  // 알려진 토큰 decimals
  let decimals = 9; // 기본값 (NASUN/SUI)
  if (coinType.includes('::nusdc::')) decimals = 6;
  else if (coinType.includes('::nbtc::')) decimals = 8;

  const divisor = BigInt(10 ** decimals);
  const integerPart = value / divisor;
  const remainder = value % divisor;

  if (remainder === BigInt(0)) {
    return integerPart.toLocaleString();
  }

  // 소수점 이하 최대 4자리
  const fractionalStr = remainder.toString().padStart(decimals, '0');
  const trimmed = fractionalStr.slice(0, 4).replace(/0+$/, '');

  if (trimmed === '') {
    return integerPart.toLocaleString();
  }

  return `${integerPart.toLocaleString()}.${trimmed}`;
}

export default function Address() {
  const { addr } = useParams<{ addr: string }>();

  // State for pagination
  const [accumulatedObjects, setAccumulatedObjects] = useState<SuiObjectResponse[]>([]);
  const [objectCursor, setObjectCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const { data: addressInfo, isLoading, error } = useQuery({
    queryKey: ['address', addr],
    queryFn: () => getAddressInfo(addr!),
    enabled: !!addr,
  });

  const { data: transactions, isLoading: txLoading } = useQuery({
    queryKey: ['address-transactions', addr],
    queryFn: () => getAddressTransactions(addr!, 20),
    enabled: !!addr,
  });

  // Initialize accumulated objects when addressInfo changes
  useEffect(() => {
    if (addressInfo?.ownedObjects) {
      setAccumulatedObjects(addressInfo.ownedObjects);
      setObjectCursor(addressInfo.nextCursor || null);
    }
  }, [addressInfo]);

  // Reset state when address changes
  useEffect(() => {
    setAccumulatedObjects([]);
    setObjectCursor(null);
  }, [addr]);

  // Load more objects handler
  const handleLoadMore = useCallback(async () => {
    if (!addr || !objectCursor || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const result = await loadMoreObjects(addr, objectCursor);
      if (result) {
        setAccumulatedObjects(prev => {
          const existingIds = new Set(prev.map(o => o.data?.objectId));
          const newObjects = result.ownedObjects.filter(o => !existingIds.has(o.data?.objectId));
          return [...prev, ...newObjects];
        });
        setObjectCursor(result.nextCursor || null);
      }
    } finally {
      setIsLoadingMore(false);
    }
  }, [addr, objectCursor, isLoadingMore]);

  const hasNextPage = objectCursor !== null;

  return (
    <>
      <div className="mb-6">
        <Link to="/" className="text-nasun-c4 hover:underline">
          &larr; Back to Home
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-6">Address Details</h1>

      {isLoading ? (
        <div className="text-nasun-white/60">Loading...</div>
      ) : error || !addressInfo ? (
        <Card variant="c6" className="p-4 border-nasun-c1/50">
          <span className="text-nasun-c1">Address not found or error occurred</span>
        </Card>
      ) : (
        <div className="space-y-6">
            {/* Overview */}
            <SectionBox title="Overview" color="c4">
              <div className="grid grid-cols-1 gap-4">
                <InfoRow label="Address" value={addr || '-'} mono copyable />
                <InfoRow
                  label="Balance"
                  value={`${formatBalance(addressInfo.balance?.totalBalance)} NASUN`}
                />
                <InfoRow
                  label="Owned Objects"
                  value={`${accumulatedObjects.length}${hasNextPage ? '+' : ''} objects`}
                />
              </div>
            </SectionBox>

            {/* Balance Details */}
            <SectionBox title="Token Balances" color="c4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {addressInfo.allBalances && addressInfo.allBalances.length > 0 ? (
                  addressInfo.allBalances.map((bal) => (
                    <Card key={bal.coinType} variant="c4" className="p-4">
                      <div className="text-nasun-white/60 text-sm uppercase tracking-wider mb-1">
                        <CoinSymbol type={bal.coinType} />
                      </div>
                      <div className="text-xl font-bold text-nasun-c4">
                        {formatTokenBalance(bal.totalBalance, bal.coinType)}
                      </div>
                      <div className="text-xs text-nasun-white/40 mt-1">
                        {bal.coinObjectCount} coin object{bal.coinObjectCount !== 1 ? 's' : ''}
                      </div>
                    </Card>
                  ))
                ) : (
                  <Card variant="c4" className="p-4">
                    <div className="text-nasun-white/60">No tokens found</div>
                  </Card>
                )}
              </div>
            </SectionBox>

            {/* NFTs */}
            {(() => {
              // Helper to parse content for NFT check
              const parseContent = (content: unknown): { fields?: Record<string, unknown> } | null => {
                if (!content || typeof content !== 'object') return null;
                const c = content as { dataType?: string; fields?: unknown };
                if (c.dataType !== 'moveObject') return null;
                return { fields: c.fields as Record<string, unknown> };
              };

              const nftObjects = accumulatedObjects.filter(obj =>
                isNFTObject(obj.data?.display?.data, parseContent(obj.data?.content))
              );
              const otherObjects = accumulatedObjects.filter(obj =>
                !isNFTObject(obj.data?.display?.data, parseContent(obj.data?.content))
              );

              return (
                <>
                  {/* NFTs Section */}
                  {nftObjects.length > 0 && (
                    <SectionBox title={`NFTs (${nftObjects.length}${hasNextPage ? '+' : ''})`} color="c4">
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {nftObjects.map((obj, idx) => (
                          <NFTCard
                            key={obj.data?.objectId ?? idx}
                            objectId={obj.data?.objectId ?? ''}
                            type={obj.data?.type ?? undefined}
                            display={obj.data?.display?.data}
                            content={parseContent(obj.data?.content)}
                          />
                        ))}
                      </div>
                      {/* Load More button */}
                      {hasNextPage && (
                        <button
                          onClick={handleLoadMore}
                          disabled={isLoadingMore}
                          className="w-full mt-4 py-2 text-nasun-c4 hover:bg-nasun-c4/10 rounded border border-nasun-c4/30 transition-colors disabled:opacity-50"
                        >
                          {isLoadingMore ? 'Loading...' : 'Load More Objects'}
                        </button>
                      )}
                    </SectionBox>
                  )}

                  {/* Other Objects Section */}
                  <SectionBox title={`Other Objects (${otherObjects.length}${hasNextPage ? '+' : ''})`} color="c3">
                    {otherObjects.length > 0 ? (
                      <>
                        <div className="overflow-x-auto rounded-lg border border-nasun-c3/30">
                          <table className="w-full">
                            <thead className="bg-nasun-c6/60 border-b border-nasun-c3/30">
                              <tr>
                                <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-nasun-white/80">Object ID</th>
                                <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-nasun-white/80">Type</th>
                                <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-nasun-white/80">Version</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-nasun-c3/20">
                              {otherObjects.map((obj, idx) => (
                                <tr key={obj.data?.objectId ?? idx} className="hover:bg-nasun-c3/10 transition-colors">
                                  <td className="px-4 py-3">
                                    <Link
                                      to={`/object/${obj.data?.objectId}`}
                                      className="font-mono text-sm text-nasun-c4 hover:underline"
                                    >
                                      {truncateId(obj.data?.objectId ?? '')}
                                    </Link>
                                  </td>
                                  <td className="px-4 py-3 text-nasun-white/60 text-sm max-w-xs truncate">
                                    {formatObjectType(obj.data?.type ?? undefined)}
                                  </td>
                                  <td className="px-4 py-3 text-nasun-white/60 font-mono">
                                    {obj.data?.version || '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {/* Load More button */}
                        {hasNextPage && (
                          <button
                            onClick={handleLoadMore}
                            disabled={isLoadingMore}
                            className="w-full mt-4 py-2 text-nasun-c3 hover:bg-nasun-c3/10 rounded border border-nasun-c3/30 transition-colors disabled:opacity-50"
                          >
                            {isLoadingMore ? 'Loading...' : 'Load More Objects'}
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="text-nasun-white/60 text-center py-8">
                        No objects owned by this address
                      </div>
                    )}
                  </SectionBox>
                </>
              );
            })()}

            {/* Transaction History */}
            <SectionBox title="Transaction History" color="c5">
              {txLoading ? (
                <div className="text-nasun-white/60 text-center py-8">Loading transactions...</div>
              ) : transactions && transactions.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-nasun-c5/30">
                  <table className="w-full">
                    <thead className="bg-nasun-c6/60 border-b border-nasun-c5/30">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-nasun-white/80">Digest</th>
                        <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-nasun-white/80">Status</th>
                        <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-nasun-white/80">Time</th>
                        <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-nasun-white/80">Checkpoint</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-nasun-c5/20">
                      {transactions.map((tx) => (
                        <tr key={tx.digest} className="hover:bg-nasun-c5/10 transition-colors">
                          <td className="px-4 py-3">
                            <Link
                              to={`/tx/${tx.digest}`}
                              className="font-mono text-sm text-nasun-c4 hover:underline"
                            >
                              {truncateDigest(tx.digest)}
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 text-xs rounded ${
                              tx.effects?.status?.status === 'success'
                                ? 'bg-nasun-c3/20 text-nasun-c3'
                                : 'bg-nasun-c1/20 text-nasun-c1'
                            }`}>
                              {tx.effects?.status?.status || 'unknown'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-nasun-white/60 text-sm">
                            {formatTimestamp(tx.timestampMs)}
                          </td>
                          <td className="px-4 py-3 text-nasun-white/60 font-mono">
                            {tx.checkpoint || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-nasun-white/60 text-center py-8">
                  No transactions found for this address
                </div>
              )}
            </SectionBox>
          </div>
        )}
    </>
  );
}

function truncateId(id: string) {
  if (id.length <= 20) return id;
  return `${id.slice(0, 10)}...${id.slice(-8)}`;
}

