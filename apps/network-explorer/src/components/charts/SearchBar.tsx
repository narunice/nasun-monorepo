import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getObject } from '../../lib/sui-client';

// Base58 character set (no 0, O, I, l)
const TX_DIGEST_RE = /^[1-9A-HJ-NP-Za-km-z]{43,44}$/;
// Sui object ID or address: 0x + hex chars (1-64)
const HEX_ID_RE = /^0x[0-9a-fA-F]{1,64}$/;
// Full-length Sui ID (0x + exactly 64 hex chars)
const FULL_HEX_ID_RE = /^0x[0-9a-fA-F]{64}$/;

type QueryType = 'TX' | 'Object' | 'Address' | null;

function detectQueryType(query: string): QueryType {
  if (!query) return null;
  if (TX_DIGEST_RE.test(query)) return 'TX';
  if (FULL_HEX_ID_RE.test(query)) return 'Address'; // Could be Object or Address — resolved on submit
  if (HEX_ID_RE.test(query)) return 'Object';
  return null;
}

export function SearchBar() {
  const [isSearching, setIsSearching] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const navigate = useNavigate();

  // '/' key focuses the search bar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  const detectedType = detectQueryType(inputValue.trim());

  const showError = (msg: string) => {
    setErrorMsg(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setErrorMsg(''), 4000);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg('');
    const query = inputValue.trim();

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
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            name="query"
            value={inputValue}
            placeholder="Search by Tx Digest, Object ID, or Address  [/]"
            className={`w-full bg-card border rounded-xl px-4 py-3 pr-20 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary backdrop-blur-md transition-colors ${errorMsg ? 'border-destructive' : 'border-input'}`}
            disabled={isSearching}
            onChange={(e) => {
              setInputValue(e.target.value);
              if (errorMsg) setErrorMsg('');
            }}
          />
          {detectedType && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-sm pointer-events-none">
              {detectedType}
            </span>
          )}
        </div>
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
