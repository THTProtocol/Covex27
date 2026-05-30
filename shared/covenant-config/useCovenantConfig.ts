/**
 * React hook for working with CovenantConfigV1
 * Use this in both Terminal and Studio during Phase 11 integration.
 */

import { useState, useCallback } from 'react';
import { CovenantConfigV1, validateCovenantConfig, isValidCovenantConfig } from './covenant-config';

interface UseCovenantConfigOptions {
  onChange?: (config: CovenantConfigV1) => void;
  initialConfig?: Partial<CovenantConfigV1>;
}

export function useCovenantConfig(options: UseCovenantConfigOptions = {}) {
  const [config, setConfig] = useState<CovenantConfigV1 | null>(() => {
    if (options.initialConfig) {
      try {
        return validateCovenantConfig(options.initialConfig);
      } catch {
        return null;
      }
    }
    return null;
  });

  const [error, setError] = useState<string | null>(null);

  const updateConfig = useCallback((partial: Partial<CovenantConfigV1>) => {
    if (!config) return;

    const newConfig = { ...config, ...partial };

    try {
      const validated = validateCovenantConfig(newConfig);
      setConfig(validated);
      setError(null);
      options.onChange?.(validated);
    } catch (err: any) {
      setError(err.message || 'Invalid configuration');
    }
  }, [config, options]);

  const loadFromJson = useCallback((json: unknown) => {
    try {
      const validated = validateCovenantConfig(json);
      setConfig(validated);
      setError(null);
      options.onChange?.(validated);
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to load configuration');
      return false;
    }
  }, [options]);

  const exportJson = useCallback(() => {
    if (!config) return null;
    return JSON.stringify(config, null, 2);
  }, [config]);

  const isValid = config ? isValidCovenantConfig(config) : false;

  return {
    config,
    error,
    isValid,
    updateConfig,
    loadFromJson,
    exportJson,
    setConfig: (c: CovenantConfigV1) => {
      if (isValidCovenantConfig(c)) {
        setConfig(c);
        setError(null);
      }
    },
  };
}
