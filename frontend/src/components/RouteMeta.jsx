import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/*
 * RouteMeta: per-route document.title, meta description, canonical link, and
 * Open Graph url/title/description.
 *
 * Client-side only. This improves browser tab titles and JS-executing crawlers
 * (e.g. Googlebot). Static social unfurls for covenants are served per-id by the
 * backend (GET /og/covenant/:id); the static index.html carries the site-wide
 * defaults for non-JS crawlers. Copy is honesty-disciplined and mainnet-first:
 * nothing here claims on-chain / trustless / ZK-verified beyond what is true, and
 * no em-dashes (the CI byte-gate).
 */

const SITE = 'Covex';
const DEFAULT_TITLE = 'Covex: The Covenant Explorer and Studio for Kaspa';
const DEFAULT_DESC =
  'Covex is the covenant explorer and studio for Kaspa mainnet. Index every covenant, interact with any of them, design and verify your own. Non-custodial, real on-chain data only, built for the Toccata mainnet era.';

// Order matters only for prefix routes (those ending in "/"). Exact paths win by ===.
const ROUTES = [
  { p: '/pricing', t: 'Pricing', d: 'Covex tiers are a flat one-time payment, never a cut of any pot. Explore and interact for free; paid Studio tiers unlock priority placement and the covenant-website builder.' },
  { p: '/about', t: 'About', d: 'What Covex is and is not: neutral, non-custodial covenant infrastructure for Kaspa. No rake, no custody, and it never attests an outcome. Every covenant is labeled by what actually enforces it.' },
  { p: '/whitepaper', t: 'Whitepaper', d: 'The Covex whitepaper: non-custodial covenants, the enforcement-reality model (on-chain vs oracle-attested vs full-zk), and the trust-by-removal roadmap for Kaspa mainnet.' },
  { p: '/readme', t: 'How It Works', d: 'How Covex works, honestly: index every covenant, redeem any P2SH covenant from your own wallet, and verify the disclosed keys, vkeys, and treasury for yourself.' },
  { p: '/kaspa', t: 'What is Kaspa', d: 'A primer on Kaspa: the BlockDAG, GHOSTDAG, ten blocks per second, and the Toccata hard fork that brings native covenants to mainnet.' },
  { p: '/zk-studio', t: 'ZK Studio', d: 'Prove and verify real Groth16 circuits in your browser. Proofs are verified off-chain, fail-closed; the secret witness never leaves your device.' },
  { p: '/zk', t: 'ZK Circuits', d: 'The Covex ZK circuit registry: real Groth16 circuits proven in-browser, labeled honestly as verified off-chain (the resolver co-signs the payout), not on-chain ZK.' },
  { p: '/templates', t: 'Templates', d: 'Covenant templates on Covex: escrow, vesting, fundraisers, HTLCs, and more, each labeled by what the Kaspa chain actually enforces.' },
  { p: '/stats', t: 'Stats', d: 'Live Covex network stats: covenants indexed, recent activity, and the honest mainnet count (zero until Toccata activation).' },
  { p: '/treasury', t: 'Treasury', d: 'The Covex treasury and payment history, public and on-chain. Settlement takes zero rake; the only value sink is the flat one-time tier payment.' },
  { p: '/terms', t: 'Terms', d: 'Covex Terms: neutral, non-custodial software. Covex is never the operator, counterparty, or house, attests no outcome, and takes no cut of any settlement.' },
  { p: '/privacy', t: 'Privacy', d: 'Covex privacy: keys never leave your browser, Covex holds no funds, and there is no IP-based geoblocking or sanctions screening. Real on-chain data only.' },
  { p: '/recover', t: 'Recover', d: 'Recover funds from any Covex covenant using only its published redeem script and your own wallet, with zero dependency on Covex being online.' },
  { p: '/sandbox', t: 'Sandbox', d: 'Experiment with Covex covenant building in a safe sandbox before deploying to a live Kaspa network.' },
  { p: '/deploy', t: 'Deploy', d: 'Design and deploy a Kaspa covenant non-custodially. You sign from your own wallet; Covex never holds a key or moves funds.' },
  { p: '/deploy/enforced', t: 'Deploy', d: 'Deploy a consensus-enforced Kaspa primitive (hashlock, timelock, HTLC, multisig) non-custodially. You sign from your own wallet; Covex never holds a key or moves funds.' },
  // prefix routes
  { p: '/covenant/', t: 'Covenant', d: 'A live Kaspa covenant on Covex: its lifecycle, finality, honest enforcement-reality badge, and the interactive page its creator built.' },
  { p: '/address/', t: 'Address', d: 'A Kaspa address portfolio on Covex: the covenants it deployed and interacted with, from independent on-chain indexing.' },
];

export default function RouteMeta() {
  const { pathname } = useLocation();
  useEffect(() => {
    const match = ROUTES.find((r) =>
      r.p.endsWith('/') ? pathname.startsWith(r.p) : pathname === r.p
    );
    const title = match ? `${match.t} · ${SITE}` : DEFAULT_TITLE;
    const desc = match ? match.d : DEFAULT_DESC;
    document.title = title;

    // Find-or-create a <head> element, then return it for attribute updates.
    const upsert = (selector, make) => {
      let el = document.head.querySelector(selector);
      if (!el) { el = make(); document.head.appendChild(el); }
      return el;
    };
    const meta = (attr, val) => () => {
      const m = document.createElement('meta');
      m.setAttribute(attr, val);
      return m;
    };

    upsert('meta[name="description"]', meta('name', 'description')).setAttribute('content', desc);

    // Per-route canonical + Open Graph url/title/description. The SPA serves one
    // static index.html for every route, so without this every page inherits the
    // homepage canonical/og:url and collapses onto "/" for JS-executing crawlers.
    // pathname excludes the query string; strip a trailing slash (except root) so
    // "/pricing" and "/pricing/" share one canonical.
    let path = pathname;
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    const url = `https://hightable.pro${path}`;
    upsert('link[rel="canonical"]', () => {
      const l = document.createElement('link');
      l.setAttribute('rel', 'canonical');
      return l;
    }).setAttribute('href', url);
    upsert('meta[property="og:url"]', meta('property', 'og:url')).setAttribute('content', url);
    upsert('meta[property="og:title"]', meta('property', 'og:title')).setAttribute('content', title);
    upsert('meta[property="og:description"]', meta('property', 'og:description')).setAttribute('content', desc);
  }, [pathname]);
  return null;
}
