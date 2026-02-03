import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getObject } from '../../lib/sui-client';

// Base58 character set (no 0, O, I, l)
const TX_DIGEST_RE = /^[1-9A-HJ-NP-Za-km-z]{43,44}$/;
// Sui object ID or address: 0x + 64 hex chars
const HEX_ID_RE = /^0x[0-9a-fA-F]{64}$/;

export function SearchBar() {
  const [isSearching, setIsSearching] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const query = (formData.get('query') as string).trim();

    if (!query) return;

    // Transaction digest (base58 encoded, 43-44 chars)
    if (TX_DIGEST_RE.test(query)) {
      navigate(`/tx/${query}`);
      return;
    }

    // Object ID or address (0x + 64 hex chars)
    if (HEX_ID_RE.test(query)) {
      setIsSearching(true);
      try {
        const obj = await getObject(query);
        if (obj?.data) {
          navigate(`/object/${query}`);
        } else {
          navigate(`/address/${query}`);
        }
      } catch {
        navigate(`/address/${query}`);
      } finally {
        setIsSearching(false);
      }
      return;
    }

    // Unrecognized format — try as object ID if starts with 0x
    if (query.startsWith('0x')) {
      navigate(`/object/${encodeURIComponent(query)}`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        name="query"
        placeholder="Search by Transaction Digest, Object ID, or Address"
        className="flex-1 bg-card border border-input rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary backdrop-blur-md transition-colors"
        disabled={isSearching}
      />
      <button
        type="submit"
        disabled={isSearching}
        className="bg-primary hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground px-6 py-3 rounded-xl font-medium transition-all active:scale-[0.97] text-primary-foreground"
      >
        {isSearching ? 'Searching...' : 'Search'}
      </button>
    </form>
  );
}
