// useLiveBalances - real-time locked balances for a set of covenant addresses.
//
// Each covenant locks funds in its on-chain address. The funded amount the backend indexes
// (amount_kaspa) is a snapshot captured at deploy time and is NEVER decremented when the covenant
// is spent, so it cannot tell you what is locked RIGHT NOW. This hook fetches the LIVE balance of
// each address from the public CORS-enabled Kaspa indexer (api.kaspa.org for mainnet, via
// lib/kaspaPublicApi.js), exactly like the Recover page does, with no Covex backend involved.
//
// A covenant whose live balance is 0 has been spent (used up). Honesty rule: we only ever report
// 'spent' when a balance fetch SUCCEEDS and returns 0. A failed/aborted/in-flight fetch is
// 'loading' or 'error', never 'spent' - a transport hiccup must not mislabel a funded covenant.
//
// Bounded concurrency + a short-TTL module cache keep the request volume to the public node sane
// even when many covenants are on screen, and dedupe across components and re-renders.

import { useEffect, useState } from 'react';
import { fetchAddressBalanceSompi, hasPublicApi, sompiToKas } from './kaspaPublicApi.js';

// `${network}:${address}` -> { sompi, ts }. Shared across every consumer + render.
const CACHE = new Map();
const TTL_MS = 30000; // a cached balance is considered fresh for 30s

// Run async tasks with at most `concurrency` in flight at once.
async function runPool(tasks, concurrency) {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const idx = next;
      next += 1;
      await tasks[idx]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
}

/**
 * @param {string[]} addresses - covenant on-chain addresses to watch.
 * @param {string} network - the active network (mainnet).
 * @param {{intervalMs?:number, concurrency?:number, max?:number}} [opts]
 * @returns {Record<string,{sompi:number|null,kas:number|null,status:'loading'|'ok'|'error'}>}
 *          keyed by address. Absent address => not yet started (treat as unknown, i.e. active).
 */
export function useLiveBalances(addresses, network, opts = {}) {
  const { intervalMs = 45000, concurrency = 5, max = 150 } = opts;
  const [byAddr, setByAddr] = useState({});

  // Stable dependency: a sorted, de-duped, capped join of the addresses. Avoids re-running the
  // effect on every render just because a new array identity arrived with the same contents.
  const unique = Array.from(new Set((addresses || []).filter(Boolean))).slice(0, max);
  const addrKey = unique.join('|');

  useEffect(() => {
    if (!addrKey || !hasPublicApi(network)) return undefined;
    const list = addrKey.split('|');
    let cancelled = false;
    const ac = new AbortController();

    const fetchAll = async (force) => {
      const tasks = list.map((address) => async () => {
        if (cancelled) return;
        const ck = `${network}:${address}`;
        const cached = CACHE.get(ck);
        if (!force && cached && Date.now() - cached.ts < TTL_MS) {
          if (!cancelled) {
            setByAddr((m) => (m[address] && m[address].status === 'ok' && m[address].sompi === cached.sompi
              ? m
              : { ...m, [address]: { sompi: cached.sompi, kas: sompiToKas(cached.sompi), status: 'ok' } }));
          }
          return;
        }
        try {
          const sompi = await fetchAddressBalanceSompi(address, network, ac.signal);
          CACHE.set(ck, { sompi, ts: Date.now() });
          if (!cancelled) setByAddr((m) => ({ ...m, [address]: { sompi, kas: sompiToKas(sompi), status: 'ok' } }));
        } catch {
          if (cancelled || ac.signal.aborted) return;
          // Never downgrade a previously-good reading to error on a transient failure.
          setByAddr((m) => (m[address] && m[address].status === 'ok'
            ? m
            : { ...m, [address]: { sompi: null, kas: null, status: 'error' } }));
        }
      });
      await runPool(tasks, concurrency);
    };

    fetchAll(false);
    const id = setInterval(() => fetchAll(true), intervalMs);
    return () => { cancelled = true; ac.abort(); clearInterval(id); };
  }, [addrKey, network, intervalMs, concurrency]);

  return byAddr;
}

// A covenant is spent (used up) only when a live balance fetch SUCCEEDED and returned exactly 0.
// Unknown / loading / error => not spent (shown as active), so a node hiccup never hides a covenant.
export function isSpentByLiveBalance(liveBalance) {
  return !!liveBalance && liveBalance.status === 'ok' && liveBalance.sompi === 0;
}
