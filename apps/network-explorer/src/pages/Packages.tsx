import { Link } from 'react-router-dom';
import { Badge } from '../components/ui/Badge';
import { truncateId } from '../lib/format';

// Nasun Devnet V7 known packages — update after devnet reset (sync with devnet-ids.json)
const KNOWN_PACKAGES = [
  // System (permanent)
  { id: '0x0000000000000000000000000000000000000000000000000000000000000001', name: 'Move Stdlib', description: 'Move standard library', category: 'system' as const },
  { id: '0x0000000000000000000000000000000000000000000000000000000000000002', name: 'Sui Framework', description: 'Core framework: Coin, NFT, Transfer', category: 'system' as const },
  { id: '0x0000000000000000000000000000000000000000000000000000000000000003', name: 'Sui System', description: 'Validator and staking logic', category: 'system' as const },
  // Protocol — V7
  { id: '0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731', name: 'devnet_tokens V1', description: 'NBTC, NUSDC token contracts', category: 'protocol' as const },
  { id: '0x7f8dba64318adb8042b266d52d372b4b876778aa7f27f7e37847cc15611f75b2', name: 'devnet_tokens V2', description: 'Upgraded token package', category: 'protocol' as const },
  { id: '0xcc65166f76b0aed75f8c94527405cec82bb4b416483c7bcdd7725490179601b2', name: 'Tokens V2 (NSOL)', description: 'NSOL token', category: 'protocol' as const },
  { id: '0xe672843fd6e5388ca1248200059c6ef50e82a68689f42f7b9efb3e70dcabdf31', name: 'NETH Token', description: 'NETH token', category: 'protocol' as const },
  { id: '0xb4a100f26550fe84d8134e9e97ef1569e8f2e63cd864adf4774249ee05178134', name: 'DeepBook V3', description: 'Central limit order book', category: 'protocol' as const },
  { id: '0x98765cc3765324148db9815da8bce85e6ca895e94eed910b6cc9bec55cc22895', name: 'Prediction', description: 'Prediction markets', category: 'pado' as const },
  { id: '0xd56f405af7127a15e30a5104ec91574a7483699e5ac1d74383ed5478aee43900', name: 'Lottery', description: 'On-chain lottery (Sui Random)', category: 'pado' as const },
  { id: '0x3a3babecdd13b588c29fcd854819fc79f050ac7a7919b41d24ba66ab21dc1de3', name: 'Governance V1', description: 'On-chain governance', category: 'nasun' as const },
  { id: '0xe2fb0947f43473e21d1f8aef40e1d6799aa61b3d4fa80b6a1973d1e658de1256', name: 'Governance V2', description: 'Upgraded governance', category: 'nasun' as const },
  { id: '0xaf77e8d92826156b9392c4e3c094d6927fd4397c768e983a8c0bbc9071ea19e6', name: 'Baram V1', description: 'AI Settlement Layer (escrow)', category: 'baram' as const },
  { id: '0x60375a271223b222ac7060f2c076d0041ef9b1d2fed8d360556eeb29eb43a8b1', name: 'Baram V2', description: 'Upgraded Baram + BetaAccess', category: 'baram' as const },
  { id: '0x45efd887fdaee9d9ad29fb98d4d5c21083769cdc8ce5fb8a5f7d4701e4675ebd', name: 'Baram Executor', description: 'Executor registry and staking', category: 'baram' as const },
  { id: '0x809f22f2262fd4211e51c1d890addfaeadb21e4bbf61748d7714306272427692', name: 'Baram AER', description: 'AI Execution Reports', category: 'baram' as const },
  { id: '0x6ab728f371455e7db3530794a1c02426f673ec5d2292835bdf365dd248519b9a', name: 'Baram Attestation', description: 'TEE PCR baseline registry', category: 'baram' as const },
  { id: '0x8a0acb40e5546a01e276a367e583df32b134306ebce6118cc01d9e164edf4c1c', name: 'Oracle', description: 'Dev price feed oracle', category: 'pado' as const },
  { id: '0xdd1e36881a1d47ad4f0f331b6a949948f308ded71c1d46802f23e258ca1ebafe', name: 'Lending', description: 'Lending protocol', category: 'pado' as const },
  { id: '0x5bdbf3aaa5999674bea412f2dd7dce417a188343f7213cb7105d9c1eaacce31d', name: 'Margin', description: 'Unified margin (multi-collateral)', category: 'pado' as const },
  { id: '0x6821a73cfc3cd45dc6318db379c2c88f0acb61ec6a26060f4de8cbe4718d3658', name: 'Perpetuals', description: 'Perpetual DEX', category: 'pado' as const },
  { id: '0x097e96d5e0c09915b6ba2ed744fe2d4ee0bd21df1d453e6528d4d82c96c1c44b', name: 'NSA V1', description: 'Nasun Smart Account', category: 'nasun' as const },
  { id: '0x566eb1ba9e403dcd46c33c45d9a023570f09327b35bde4b8d6fd8b63e70012f3', name: 'NSA V2', description: 'Upgraded Smart Account', category: 'nasun' as const },
];

type Category = 'system' | 'nasun' | 'protocol' | 'pado' | 'baram';

const CATEGORY_VARIANT: Record<Category, 'immutable' | 'child' | 'info' | 'success' | 'shared'> = {
  system: 'immutable',   // purple — Sui core
  nasun: 'child',        // amber — Nasun network-level
  protocol: 'info',      // blue — shared infra/tokens
  pado: 'success',       // green — Pado DeFi app
  baram: 'shared',       // blue-400 — Baram AI settlement
};

export default function Packages() {
  return (
    <>
      <div className="mb-6">
        <Link to="/" className="text-primary hover:underline">
          &larr; Back to Home
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-6 text-foreground">Packages</h1>

      <div className="rounded-xl overflow-hidden border border-border/20 bg-card/60 backdrop-blur-md">
        <table className="w-full">
          <thead className="bg-muted/50 border-b border-border/20">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Name
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground hidden sm:table-cell">
                Description
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Package ID
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-muted-foreground hidden md:table-cell">
                Category
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {KNOWN_PACKAGES.map((pkg) => (
              <tr key={pkg.id} className="hover:bg-muted/50 transition-colors">
                <td className="px-4 py-3">
                  <Link
                    to={`/package/${pkg.id}`}
                    className="font-medium text-sm text-foreground hover:text-primary hover:underline"
                  >
                    {pkg.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">
                  {pkg.description}
                </td>
                <td className="px-4 py-3">
                  <Link
                    to={`/package/${pkg.id}`}
                    className="font-mono text-xs text-foreground hover:text-primary hover:underline"
                    title={pkg.id}
                  >
                    {truncateId(pkg.id, 6, 4)}
                  </Link>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <Badge variant={CATEGORY_VARIANT[pkg.category]}>{pkg.category}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
