import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getObject } from '../../lib/sui-client';

// Base58 character set (no 0, O, I, l)
const TX_DIGEST_RE = /^[1-9A-HJ-NP-Za-km-z]{43,44}$/;
// Sui object ID or address: 0x + hex chars (1-64)
const HEX_ID_RE = /^0x[0-9a-fA-F]{1,64}$/;
// Full-length Sui ID (0x + exactly 64 hex chars)
const FULL_HEX_ID_RE = /^0x[0-9a-fA-F]{64}$/;

export function SearchBar() {
  const [isSearching, setIsSearching] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const errorTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const navigate = useNavigate();

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  const showError = (msg: string) => {
    setErrorMsg(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setErrorMsg(''), 4000);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg('');
    const formData = new FormData(e.currentTarget);
    const query = (formData.get('query') as string).trim();

    if (!query) return;

    // Transaction digest (base58 encoded, 43-44 chars)
    if (TX_DIGEST_RE.test(query)) {
      navigate(`/tx/${encodeURIComponent(query)}`);
      return;
    }

    // Full-length hex ID (0x + 64 hex chars) — try object, fallback to address
    if (FULL_HEX_ID_RE.test(query)) {
      setIsSearching(true);
      try {
        const obj = await getObject(query);
        if (obj?.data) {
          navigate(`/object/${encodeURIComponent(query)}`);
        } else {
          navigate(`/address/${encodeURIComponent(query)}`);
        }
      } catch {
        navigate(`/address/${encodeURIComponent(query)}`);
      } finally {
        setIsSearching(false);
      }
      return;
    }

    // Partial hex ID (0x + 1-63 hex chars) — try as object lookup
    if (HEX_ID_RE.test(query)) {
      navigate(`/object/${encodeURIComponent(query)}`);
      return;
    }

    // Unrecognized format
    showError('Enter a valid Transaction Digest, Object ID (0x...), or Address');
  };

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          name="query"
          placeholder="Search by Transaction Digest, Object ID, or Address"
          className={`flex-1 bg-card border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary backdrop-blur-md transition-colors ${errorMsg ? 'border-destructive' : 'border-input'}`}
          disabled={isSearching}
          onChange={() => errorMsg && setErrorMsg('')}
        />
        <button
          type="submit"
          disabled={isSearching}
          className="bg-primary hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground px-6 py-3 rounded-xl font-medium transition-all active:scale-[0.97] text-primary-foreground"
        >
          {isSearching ? 'Searching...' : 'Search'}
        </button>
      </form>
      {errorMsg && (
        <p className="text-destructive text-sm mt-1.5 ml-1">{errorMsg}</p>
      )}
    </div>
  );
}
