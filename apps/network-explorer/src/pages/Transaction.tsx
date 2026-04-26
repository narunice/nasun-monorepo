import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useSignerAddress } from '@nasun/wallet';
import { getTransaction } from '../lib/sui-client';
import { useDocumentTitle } from '../hooks';
import { Card } from '../components/ui/Card';

// Sub-components
import TransactionOverview from '../components/transaction/TransactionOverview';
import TransactionGas from '../components/transaction/TransactionGas';
import TransactionObjectChanges from '../components/transaction/TransactionObjectChanges';
import TransactionBalanceChanges from '../components/transaction/TransactionBalanceChanges';
import TransactionEvents from '../components/transaction/TransactionEvents';
import TransactionRawData from '../components/transaction/TransactionRawData';

const TX_DIGEST_RE = /^[1-9A-HJ-NP-Za-km-z]{43,44}$/;

export default function Transaction() {
  const { digest } = useParams<{ digest: string }>();
  const [searchParams] = useSearchParams();
  const connectedAddress = useSignerAddress();
  const viewerAddress = searchParams.get('viewer') ?? connectedAddress;
  useDocumentTitle(digest ? `Tx ${digest.slice(0, 8)}...` : 'Transaction');
  const isValidDigest = digest ? TX_DIGEST_RE.test(digest) : false;

  const {
    data: tx,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['transaction', digest],
    queryFn: () => getTransaction(digest!),
    enabled: isValidDigest,
  });

  return (
    <>
      <div className="mb-6">
        <Link to="/" className="text-primary hover:underline">
          &larr; Back to Home
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-6 text-foreground">Transaction Details</h1>

      {!isValidDigest && digest ? (
        <Card variant="default" className="p-4 border-destructive/50">
          <span className="text-destructive">Invalid transaction digest format</span>
        </Card>
      ) : isLoading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : error || !tx ? (
        <Card variant="default" className="p-4 border-destructive/50">
          <span className="text-destructive">Transaction not found or error occurred</span>
        </Card>
      ) : (
        <div className="flex flex-col gap-6 md:gap-8 lg:gap-10">
          {/* Overview Section */}
          <TransactionOverview
            digest={tx.digest}
            status={tx.effects?.status?.status}
            timestampMs={tx.timestampMs}
            checkpoint={tx.checkpoint}
            sender={tx.transaction?.data?.sender}
            transactions={
              tx.transaction?.data?.transaction?.kind === 'ProgrammableTransaction'
                ? tx.transaction.data.transaction.transactions
                : null
            }
          />

          {/* Gas Section */}
          <TransactionGas
            budget={tx.transaction?.data?.gasData?.budget}
            price={tx.transaction?.data?.gasData?.price}
            gasUsed={tx.effects?.gasUsed}
          />

          {/* Object Changes Section */}
          <TransactionObjectChanges objectChanges={tx.objectChanges} />

          {/* Balance Changes Section */}
          <TransactionBalanceChanges
            balanceChanges={tx.balanceChanges}
            viewerAddress={viewerAddress}
          />

          {/* Events Section */}
          <TransactionEvents events={tx.events} />

          {/* Raw Data Section */}
          <TransactionRawData data={tx} />
        </div>
      )}
    </>
  );
}