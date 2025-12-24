'use client';

import { useState, useRef, useEffect } from 'react';
import { Filter, X, ChevronDown, Image, Video, FileText, Music, Archive, File } from 'lucide-react';

export interface SearchFilters {
  type?: string;
  modifiedAfter?: string;
  modifiedBefore?: string;
  minSize?: number;
  maxSize?: number;
  sortBy?: 'name' | 'updatedAt' | 'sizeBytes';
  sortOrder?: 'ASC' | 'DESC';
}

interface SearchFiltersProps {
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
}

const FILE_TYPES = [
  { value: '', label: 'All Types', icon: File },
  { value: 'image', label: 'Images', icon: Image },
  { value: 'video', label: 'Videos', icon: Video },
  { value: 'document', label: 'Documents', icon: FileText },
  { value: 'audio', label: 'Audio', icon: Music },
  { value: 'archive', label: 'Archives', icon: Archive },
  { value: 'other', label: 'Other', icon: File },
];

const DATE_OPTIONS = [
  { value: '', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'Last 30 days' },
  { value: 'year', label: 'Last year' },
];

const SIZE_OPTIONS = [
  { value: '', label: 'Any size', min: undefined, max: undefined },
  { value: 'small', label: 'Small (< 1 MB)', min: undefined, max: 1048576 },
  { value: 'medium', label: 'Medium (1-100 MB)', min: 1048576, max: 104857600 },
  { value: 'large', label: 'Large (> 100 MB)', min: 104857600, max: undefined },
];

export function SearchFiltersComponent({ filters, onFiltersChange }: SearchFiltersProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getDateRange = (option: string): { after?: string; before?: string } => {
    const now = new Date();
    switch (option) {
      case 'today':
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return { after: todayStart.toISOString() };
      case 'week':
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return { after: weekAgo.toISOString() };
      case 'month':
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return { after: monthAgo.toISOString() };
      case 'year':
        const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        return { after: yearAgo.toISOString() };
      default:
        return {};
    }
  };

  const handleTypeChange = (type: string) => {
    onFiltersChange({ ...filters, type: type || undefined });
    setActiveDropdown(null);
  };

  const handleDateChange = (option: string) => {
    const range = getDateRange(option);
    onFiltersChange({ 
      ...filters, 
      modifiedAfter: range.after, 
      modifiedBefore: range.before 
    });
    setActiveDropdown(null);
  };

  const handleSizeChange = (option: typeof SIZE_OPTIONS[0]) => {
    onFiltersChange({ 
      ...filters, 
      minSize: option.min, 
      maxSize: option.max 
    });
    setActiveDropdown(null);
  };

  const handleSortChange = (sortBy: 'name' | 'updatedAt' | 'sizeBytes') => {
    const newOrder = filters.sortBy === sortBy && filters.sortOrder === 'ASC' ? 'DESC' : 'ASC';
    onFiltersChange({ ...filters, sortBy, sortOrder: newOrder });
    setActiveDropdown(null);
  };

  const clearFilters = () => {
    onFiltersChange({});
    setShowFilters(false);
  };

  const hasActiveFilters = filters.type || filters.modifiedAfter || filters.minSize !== undefined || filters.maxSize !== undefined;

  const getCurrentTypeName = () => FILE_TYPES.find(t => t.value === (filters.type || ''))?.label || 'Type';
  const getCurrentDateName = () => {
    if (filters.modifiedAfter) {
      const found = DATE_OPTIONS.find(d => {
        const range = getDateRange(d.value);
        return range.after === filters.modifiedAfter;
      });
      return found?.label || 'Modified';
    }
    return 'Modified';
  };
  const getCurrentSizeName = () => {
    const found = SIZE_OPTIONS.find(s => s.min === filters.minSize && s.max === filters.maxSize);
    return found?.label || 'Size';
  };

  return (
    <div ref={containerRef} className="relative flex items-center gap-2">
      <button
        onClick={() => setShowFilters(!showFilters)}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          hasActiveFilters 
            ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' 
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        <Filter className="w-4 h-4" />
        Filters
        {hasActiveFilters && (
          <span className="ml-1 px-1.5 py-0.5 text-xs bg-purple-500 text-white rounded-full">
            {[filters.type, filters.modifiedAfter, filters.minSize !== undefined || filters.maxSize !== undefined].filter(Boolean).length}
          </span>
        )}
      </button>

      {showFilters && (
        <div className="flex items-center gap-2 animate-in slide-in-from-left-2">
          {/* Type Filter */}
          <div className="relative">
            <button
              onClick={() => setActiveDropdown(activeDropdown === 'type' ? null : 'type')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors ${
                filters.type ? 'border-purple-300 bg-purple-50 text-purple-700' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {getCurrentTypeName()}
              <ChevronDown className="w-4 h-4" />
            </button>
            {activeDropdown === 'type' && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                {FILE_TYPES.map(type => (
                  <button
                    key={type.value}
                    onClick={() => handleTypeChange(type.value)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 ${
                      filters.type === type.value ? 'bg-purple-50 text-purple-700' : ''
                    }`}
                  >
                    <type.icon className="w-4 h-4" />
                    {type.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Date Filter */}
          <div className="relative">
            <button
              onClick={() => setActiveDropdown(activeDropdown === 'date' ? null : 'date')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors ${
                filters.modifiedAfter ? 'border-purple-300 bg-purple-50 text-purple-700' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {getCurrentDateName()}
              <ChevronDown className="w-4 h-4" />
            </button>
            {activeDropdown === 'date' && (
              <div className="absolute top-full left-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                {DATE_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    onClick={() => handleDateChange(option.value)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                      getDateRange(option.value).after === filters.modifiedAfter ? 'bg-purple-50 text-purple-700' : ''
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Size Filter */}
          <div className="relative">
            <button
              onClick={() => setActiveDropdown(activeDropdown === 'size' ? null : 'size')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors ${
                filters.minSize !== undefined || filters.maxSize !== undefined ? 'border-purple-300 bg-purple-50 text-purple-700' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {getCurrentSizeName()}
              <ChevronDown className="w-4 h-4" />
            </button>
            {activeDropdown === 'size' && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                {SIZE_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    onClick={() => handleSizeChange(option)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                      filters.minSize === option.min && filters.maxSize === option.max ? 'bg-purple-50 text-purple-700' : ''
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sort Options */}
          <div className="relative">
            <button
              onClick={() => setActiveDropdown(activeDropdown === 'sort' ? null : 'sort')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-gray-200 hover:border-gray-300 transition-colors"
            >
              Sort: {filters.sortBy === 'updatedAt' ? 'Date' : filters.sortBy === 'sizeBytes' ? 'Size' : 'Name'}
              <ChevronDown className="w-4 h-4" />
            </button>
            {activeDropdown === 'sort' && (
              <div className="absolute top-full left-0 mt-1 w-36 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                {[
                  { value: 'name', label: 'Name' },
                  { value: 'updatedAt', label: 'Date Modified' },
                  { value: 'sizeBytes', label: 'Size' },
                ].map(option => (
                  <button
                    key={option.value}
                    onClick={() => handleSortChange(option.value as 'name' | 'updatedAt' | 'sizeBytes')}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                      filters.sortBy === option.value ? 'bg-purple-50 text-purple-700' : ''
                    }`}
                  >
                    {option.label} {filters.sortBy === option.value && (filters.sortOrder === 'ASC' ? '↑' : '↓')}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-2 py-2 text-gray-500 hover:text-red-500 transition-colors"
              title="Clear all filters"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
