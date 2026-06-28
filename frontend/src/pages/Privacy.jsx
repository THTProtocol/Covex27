import { Link } from 'react-router-dom';

export default function Privacy() {
  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-10 space-y-8">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-gray-200 light:text-slate-600 hover:text-kaspa-green light:hover:text-teal-600 transition-colors"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M19 12H5m6-6-6 6 6 6" />
        </svg>
        Explorer
      </Link>

      <div className="glass-panel p-6 sm:p-8">
        <h1 className="text-2xl font-semibold text-white light:text-slate-900 tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-gray-300 light:text-slate-600 mt-2">Last updated: June 2026</p>
        <p className="text-sm text-gray-300 light:text-slate-700 mt-3">
          This Policy describes the very limited data the Covex platform (the "Platform", "we", "us")
          processes and why. Covex is non-custodial, account-free software: we do not run user accounts,
          do not ask for personal identifying information, and never receive your private keys or seed
          phrases. This page is a plain-English description of our data practices and is not legal advice.
          It complements, and is cross-referenced by, the Platform{' '}
          <Link to="/terms" className="text-kaspa-green light:text-teal-600 hover:underline">Terms and Conditions</Link>.
        </p>
      </div>

      <div className="glass-panel p-6 sm:p-8 space-y-8 text-sm text-gray-300 light:text-slate-700 leading-relaxed">
        {/* 1. Summary */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white light:text-slate-900">1. Summary</h2>
          <p>
            Covex is designed to minimize data collection. There are no user accounts, no sign-up, no
            email collection, no advertising trackers, and no cookies or third-party analytics scripts.
            We do not build behavioural profiles and we do not sell or share data with advertisers. The
            small amount of data we do process is described below and falls into three buckets: network
            request metadata (your IP address), public on-chain data we index, and operational data you
            choose to publish through the Platform.
          </p>
        </section>

        {/* 2. No accounts, no PII, no key access */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white light:text-slate-900">2. No Accounts, No Personal Information, No Key Access</h2>
          <p>
            You do not create an account to use Covex. We do not request or store names, email addresses,
            phone numbers, government identifiers, or other personal identifying information, and we run
            no know-your-customer process. Covex never accesses, requests, transmits, or stores your
            private keys, seed phrases, hashlock preimages, or wallet credentials. Spends are signed in
            your own wallet or on your own device; only a signature you authorize is ever transmitted,
            never a key.
          </p>
        </section>

        {/* 3. IP address: rate limiting only */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white light:text-slate-900">3. IP Address (Rate Limiting)</h2>
          <p>
            Like any web service, our servers receive the IP address of incoming requests. Our reverse
            proxy records the connecting IP address (as <span className="font-mono text-gray-200 light:text-slate-800">X-Real-IP</span>)
            and the Platform uses it only for the following operational and security purpose:
          </p>
          <ul className="list-disc list-inside space-y-2 pl-2 text-gray-200 light:text-slate-700">
            <li>Abuse prevention and rate limiting: an in-memory, per-IP token bucket throttles expensive endpoints (such as compile, sign-and-broadcast, and oracle routes) so one source cannot overload the service. This counter is held in server memory, is transient, and is not written to a database or long-term log.</li>
          </ul>
          <p>
            The Platform does <strong className="text-white light:text-slate-900">not</strong> perform IP-based geoblocking or sanctions
            screening. We do not use your IP address to track you across sites, build an advertising profile, or
            identify you personally, and we do not sell it. We deliberately key rate limiting on the
            proxy-set source address and ignore client-supplied forwarding headers, so we are not relying
            on attacker-controllable identity data.
          </p>
        </section>

        {/* 4. Public on-chain data (wallet-address indexing) */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white light:text-slate-900">4. Public On-Chain Data and Wallet-Address Indexing</h2>
          <p>
            Covex is, at its core, a read-only Kaspa BlockDAG explorer and indexer. The Kaspa network is
            a public ledger: addresses, transactions, covenant UTXOs, and scripts are inherently public
            and visible to anyone running a node. Covex indexes this publicly available data directly from
            a Kaspa node. As part of that indexing, the Platform stores and indexes
            <strong className="text-white light:text-slate-900"> wallet addresses</strong> that appear on-chain, including covenant
            creator addresses and covenant receiving/participant addresses, so it can group covenants by
            creator, present portfolio and explorer views, and surface activity statistics.
          </p>
          <p>
            A Kaspa address is a public blockchain identifier, not information we collect from you, and is
            equally visible on any public block explorer. We do not link addresses to real-world
            identities, and Covex has no way to do so. Indexing Covex does not change, add to, or remove
            anything from the public chain; removing Covex entirely leaves the same on-chain data publicly
            available elsewhere.
          </p>
        </section>

        {/* 5. Server-stored operational data */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white light:text-slate-900">5. Operational Data You Publish (Server-Side Storage)</h2>
          <p>
            When you use optional Platform features, you may submit non-personal operational data that the
            Platform stores on its own server in order to provide the service, namely:
          </p>
          <ul className="list-disc list-inside space-y-2 pl-2 text-gray-200 light:text-slate-700">
            <li>Covenant display configurations: the labels, descriptions, and presentation settings attached to a covenant you choose to surface.</li>
            <li>Generated user interfaces: the custom interactive UIs produced for covenants (the generated HTML and its configuration), stored with the on-chain owner address that published them.</li>
            <li>Public game state: the moves and status of peer-to-peer games surfaced through the Platform, which are inherently public to the participants.</li>
          </ul>
          <p>
            This data is operational, non-personal, and tied to public on-chain identifiers rather than to
            a person. It exists to render the optional display layer; it does not change any on-chain
            covenant logic, and deleting it does not affect funds or covenants on the chain.
          </p>
        </section>

        {/* 6. Browser-local data, never transmitted */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white light:text-slate-900">6. Data That Stays in Your Browser</h2>
          <p>
            Some data lives only in your own browser storage and is never sent to our servers. This may
            include your connected wallet address, your selected network, and, in development mode, a
            locally generated wallet. On mainnet, <strong className="text-white light:text-slate-900">key material never leaves your browser</strong>:
            private keys are used locally to produce signatures, and only those authorized signatures (not
            the keys) are transmitted. Treat any locally stored key material as you would cash, and clear
            your browser storage on shared or untrusted devices.
          </p>
        </section>

        {/* 7. Third-party services and dependencies */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white light:text-slate-900">7. Third-Party Wallets, Nodes, and Explorers</h2>
          <p>
            The Platform depends on third parties that Covex does not control and that are governed by
            their own privacy practices, including browser wallet extensions, the Kaspa network and its
            public nodes, and external block explorers. When you connect a wallet or follow an explorer
            link, your interaction with that third party is subject to its own policies, not this one. We
            are not responsible for the data practices of these independent parties, and external links
            are provided for convenience, not as endorsements.
          </p>
        </section>

        {/* 8. Retention and security */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white light:text-slate-900">8. Retention and Security</h2>
          <p>
            Indexed public on-chain data and the operational data you publish are retained for as long as
            needed to provide the service. The in-memory rate-limit state is transient and is discarded as
            it expires or when the service restarts. Because there are no accounts and no personal
            profiles, there is no personal dataset to export or to keep. No method of transmission or
            storage is perfectly secure; the Platform is experimental software provided "as is", and you
            use it at your own risk as described in the Terms.
          </p>
        </section>

        {/* 9. Not directed to children */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white light:text-slate-900">9. Not Directed to Children</h2>
          <p>
            The Platform is general-purpose developer tooling and is not directed to children. We do
            not knowingly process data from children.
          </p>
        </section>

        {/* 10. Changes */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white light:text-slate-900">10. Changes to This Policy</h2>
          <p>
            We may update this Policy from time to time. Continued use of the Platform after an update
            constitutes acceptance of the revised Policy. Any change to this Policy is unrelated to, and
            does not affect, covenant logic on-chain.
          </p>
        </section>

        {/* 11. Contact */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white light:text-slate-900">11. Contact</h2>
          <p>
            Questions about this Policy can be raised via the
            <a
              href="https://github.com/THTProtocol/Covex27"
              target="_blank"
              rel="noopener noreferrer"
              className="text-kaspa-green light:text-teal-600 hover:underline mx-1"
            >
              Covex GitHub repository
            </a>
            (open an issue).
          </p>
        </section>
      </div>

      <div className="glass-panel p-6 text-xs text-gray-200 light:text-slate-600 text-center">
        <p>
          No accounts, no personal information, no tracking cookies. Covex processes your IP address only
          for per-IP rate limiting (no geoblocking or sanctions screening), indexes public on-chain wallet
          addresses, and stores the display configs, generated UIs, and public game state you choose to
          publish. Your keys stay in your wallet.
        </p>
      </div>
    </div>
  );
}
