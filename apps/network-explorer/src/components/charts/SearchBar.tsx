import { useState } from 'react';
import { getObject } from '../../lib/sui-client';

export function SearchBar() {
  const [isSearching, setIsSearching] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const query = formData.get('query') as string;

    if (!query.trim()) return;

    // Detect type and redirect
    if (query.length === 44 || query.length === 43) {
      // Transaction digest (base58)
      window.location.href = `/tx/${query}`;
    } else if (query.startsWith('0x') && query.length === 66) {
      // Could be object ID or address - check if object exists
      setIsSearching(true);
      try {
        const obj = await getObject(query);
        if (obj?.data) {
          window.location.href = `/object/${query}`;
        } else {
          window.location.href = `/address/${query}`;
        }
      } catch {
        // On error, default to address
        window.location.href = `/address/${query}`;
      } finally {
        setIsSearching(false);
      }
    } else if (query.startsWith('0x') && query.length === 42) {
      // Address (shorter format)
      window.location.href = `/address/${query}`;
    } else {
      // Default to object
      window.location.href = `/object/${query}`;
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
