import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getAddressTransactions } from '../lib/sui-client';
import { useAddressObjects } from '../hooks/useAddressObjects';
import { Card } from '../components/ui/Card';

// Sub-components
import AddressOverview from '../components/address/AddressOverview';
import AddressTokenBalances from '../components/address/AddressTokenBalances';
import AddressNFTs from '../components/address/AddressNFTs';
import AddressOtherObjects from '../components/address/AddressOtherObjects';
import AddressTransactionHistory from '../components/address/AddressTransactionHistory';

export default function Address() {
  const { addr } = useParams<{ addr: string }>();

  // Data loading via custom hook
  const {
    addressInfo,
    nftObjects,
    otherObjects,
    isLoading,
    error,
    isLoadingMore,
    hasNextPage,
    handleLoadMore,
  } = useAddressObjects(addr);

  // Separate query for transaction history
  const { data: transactions, isLoading: txLoading } = useQuery({
    queryKey: ['address-transactions', addr],
    queryFn: () => getAddressTransactions(addr!, 20),
    enabled: !!addr,
  });

  return (
    <>
      <div className="mb-6">
        <Link to="/" className="text-primary hover:underline">
          &larr; Back to Home
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-6 text-foreground">Address Details</h1>

      {isLoading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : error || !addressInfo ? (
        <Card variant="default" className="p-4 border-destructive/50">
          <span className="text-destructive">Address not found or error occurred</span>
        </Card>
      ) : (
        <div className="flex flex-col gap-6 md:gap-8 lg:gap-10">
          {/* Overview Section */}
          <AddressOverview
            address={addr || ''}
            totalBalance={addressInfo.balance?.totalBalance}
            objectCount={nftObjects.length + otherObjects.length}
            hasNextPage={hasNextPage}
          />

          {/* Token Balances Section */}
          <AddressTokenBalances balances={addressInfo.allBalances} />

          {/* NFTs Section */}
          <AddressNFTs
            nftObjects={nftObjects}
            hasNextPage={hasNextPage}
            isLoadingMore={isLoadingMore}
            onLoadMore={handleLoadMore}
          />

          {/* Other Objects Section */}
          <AddressOtherObjects
            otherObjects={otherObjects}
            hasNextPage={hasNextPage}
            isLoadingMore={isLoadingMore}
            onLoadMore={handleLoadMore}
          />

          {/* Transaction History Section */}
          <AddressTransactionHistory transactions={transactions} isLoading={txLoading} />
        </div>
      )}
    </>
  );
}