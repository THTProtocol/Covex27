import { Link } from 'react-router-dom';

export default function Terms() {
  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-10 space-y-8">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-kaspa-green transition-colors"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M19 12H5m6-6-6 6 6 6" />
        </svg>
        Explorer
      </Link>

      <div className="glass-panel p-8">
        <h1 className="text-2xl font-semibold text-white tracking-tight">
          Terms and Conditions
        </h1>
        <p className="text-sm text-gray-500 mt-2">Last updated: May 2026</p>
      </div>

      <div className="glass-panel p-8 space-y-8 text-sm text-gray-300 leading-relaxed">
        {/* 1. Non-Custodial Nature */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white">1. Non-Custodial Operation</h2>
          <p>
            Covex ("the Platform") is a read-only BlockDAG explorer. The Platform does not custody,
            hold, transmit, control, or manage user funds at any time. All covenant interactions are
            executed via wallet deep-links that open in the user's own wallet application.
          </p>
          <p>
            At no point does Covex access, request, or store private keys, seed phrases, or wallet
            credentials. Users are solely responsible for the security of their own signing keys and
            for verifying all transaction details, including amounts, recipient addresses, and covenant
            scripts, within their wallet before signing.
          </p>
        </section>

        {/* 2. Covenant Indexing */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white">2. Covenant Indexing and UI Generation</h2>
          <p>
            Covex indexes publicly available BlockDAG data from the Kaspa network. All covenants
            displayed are immutable on-chain records. The Platform:
          </p>
          <ul className="list-disc list-inside space-y-2 pl-2 text-gray-400">
            <li>Does not create, modify, or control any on-chain covenant.</li>
            <li>Indexes covenant UTXOs via direct wRPC connection to a Kaspa node.</li>
            <li>Generates optional interactive UI interfaces for paid users triggered by verified on-chain payments.</li>
            <li>Provides visibility services (featured listings, search ranking) for paid tiers.</li>
          </ul>
        </section>

        {/* 3. Payment Terms */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white">3. On-Chain Payment Terms</h2>
          <p>
            All payments on Covex occur on-chain in KAS. Upon payment confirmation:
          </p>
          <ul className="list-disc list-inside space-y-2 pl-2 text-gray-400">
            <li>User accounts are automatically upgraded to the corresponding tier.</li>
            <li>Interactive UI generation is triggered for the associated covenant.</li>
            <li>Visibility boost settings are applied based on tier level.</li>
          </ul>
          <p>
            Payment tiers are defined at the time of payment. All payments are non-refundable once
            confirmed on the Kaspa network. Covex guarantees that upon confirmed payment, users receive
            exactly the service described at their tier level.
          </p>
        </section>

        {/* 4. User Responsibility */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white">4. User Responsibility</h2>
          <p>By using Covex, you acknowledge that:</p>
          <ul className="list-disc list-inside space-y-2 pl-2 text-gray-400">
            <li>You are solely responsible for any transactions initiated through wallet deep-links.</li>
            <li>You must independently verify the authenticity of covenant addresses and scripts.</li>
            <li>Covenants deployed to the Kaspa BlockDAG are permanently immutable and cannot be changed.</li>
            <li>It is solely your liability to ensure any covenant you create or interact with is legal in your jurisdiction.</li>
            <li>Covex provides no legal advice and has no connection to predictive markets, gambling, or any illegal activity.</li>
            <li>We cannot change covenants once deployed on the Kaspa BlockDAG.</li>
          </ul>
        </section>

        {/* 5. No Financial Advice */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white">5. No Financial or Legal Advice</h2>
          <p>
            Nothing on Covex constitutes financial, investment, legal, or tax advice. Data displayed on
            the Platform, including covenant types, locked amounts, and transaction history, is provided
            for informational purposes only and should not be relied upon for decision-making without
            independent verification.
          </p>
        </section>

        {/* 6. Disclaimer */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white">6. Disclaimer of Warranty</h2>
          <p>
            Covex provides information "as is" without warranty of any kind. BlockDAG data is presented
            as retrieved from the underlying Kaspa node and may be subject to reorgs, latency, or
            incomplete propagation. The Platform makes no guarantees regarding the accuracy, completeness,
            or timeliness of indexed data.
          </p>
        </section>

        {/* 7. Limitation of Liability */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white">7. Limitation of Liability</h2>
          <p>
            To the fullest extent permitted by applicable law, Covex, its developers, contributors, and
            affiliates shall not be liable for any direct, indirect, incidental, special, consequential,
            or punitive damages arising from your use of the Platform, including but not limited to loss
            of funds, data inaccuracies, or wallet deep-link failures.
          </p>
        </section>

        {/* 8. Contact */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white">8. Contact</h2>
          <p>
            For questions about these terms, reach out via the
            <a
              href="https://github.com/THTProtocol/Covex27"
              target="_blank"
              rel="noopener noreferrer"
              className="text-kaspa-green hover:underline mx-1"
            >
              Covex GitHub repository
            </a>
            or open an issue.
          </p>
        </section>
      </div>

      <div className="glass-panel p-6 text-xs text-gray-600 text-center">
        <p>
          DAG is the truth. Covex is the window. All covenants remain immutable on-chain; Covex only
          indexes them publicly and generates custom interactive UIs for paid users.
        </p>
      </div>
    </div>
  );
}
