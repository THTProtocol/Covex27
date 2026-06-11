import { useState, useCallback } from 'react';
import { validateCovenantConfig, isValidCovenantConfig, createDefaultConfig } from './covenant-config';

/**
 * Hook for managing Covenant Configuration inside the Terminal
 */
export function useCovenantConfig(initialCreatorAddress = '') {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);

  const loadOrCreate = useCallback((address) => {
    // Try to load from session/local storage first (for continuity)
    const saved = sessionStorage.getItem('pending_covenant_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const validated = validateCovenantConfig(parsed);
        setConfig(validated);
        return validated;
      } catch (e) {
        // console.warn('Failed to load saved config'); // cleaned for prod
      }
    }

    // Create a sensible default
    const defaultCfg = createDefaultConfig(address || initialCreatorAddress, 'chess');
    setConfig(defaultCfg);
    return defaultCfg;
  }, [initialCreatorAddress]);

  const updateConfig = useCallback((updates) => {
    if (!config) return;
    try {
      const newConfig = { ...config, ...updates };
      const validated = validateCovenantConfig(newConfig);
      setConfig(validated);
      setError(null);
      sessionStorage.setItem('pending_covenant_config', JSON.stringify(validated));
    } catch (err) {
      setError(err.message);
    }
  }, [config]);

  const loadFromJson = useCallback((jsonString) => {
    try {
      const parsed = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
      const validated = validateCovenantConfig(parsed);
      setConfig(validated);
      setError(null);
      sessionStorage.setItem('pending_covenant_config', JSON.stringify(validated));
      return true;
    } catch (err) {
      setError(err.message || 'Invalid configuration');
      return false;
    }
  }, []);

  const exportToStudio = useCallback(() => {
    if (!config) return null;
    const encoded = btoa(JSON.stringify(config));
    // This will be the deep link to Covenant Studio (update URL when Studio supports it)
    return `https://studio.covex.pro/import?config=${encoded}`;
  }, [config]);

  return {
    config,
    error,
    loadOrCreate,
    updateConfig,
    loadFromJson,
    exportToStudio,
    isValid: config ? isValidCovenantConfig(config) : false,
  };
}
