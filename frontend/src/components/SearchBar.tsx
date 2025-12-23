'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';

interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
}

export function SearchBar({ onSearch, placeholder = 'Search in Drive' }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  const handleClear = () => {
    setQuery('');
    onSearch('');
    inputRef.current?.focus();
  };

  // Keyboard shortcut: / to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !focused && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape' && focused) {
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focused]);

  return (
    <form 
      onSubmit={handleSubmit}
      className={`flex items-center flex-1 max-w-2xl mx-4 transition-all ${
        focused 
          ? 'bg-white shadow-lg rounded-lg' 
          : 'bg-gray-100 hover:bg-gray-200 hover:shadow-sm rounded-full'
      }`}
    >
      <button 
        type="submit"
        className="p-3 text-gray-500 hover:text-gray-700"
      >
        <Search className="w-5 h-5" />
      </button>
      
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        className={`flex-1 py-3 pr-3 bg-transparent outline-none text-gray-700 placeholder-gray-500 ${
          focused ? 'rounded-lg' : 'rounded-full'
        }`}
      />

      {query && (
        <button
          type="button"
          onClick={handleClear}
          className="p-3 text-gray-500 hover:text-gray-700"
        >
          <X className="w-5 h-5" />
        </button>
      )}
    </form>
  );
}
