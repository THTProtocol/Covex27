import { Link } from 'react-router-dom';

/* ───────────────────────────────────────────────────────────────────
   Terms & Conditions — legal page
   ─────────────────────────────────────────────────────────────────── */

export default function Terms() {
  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-10 space-y-8">
      {/* Back link */}
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-kaspa-green transition-colors"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M19 12H5m6-6-6 6 6 6" />
        </svg>
        Explorer
      </Link>

      {/* Header */}
      <div className="glass p-8">
        <h1 className="text-2xl font-semibold text-white tracking-tight">
          Terms &amp; Conditions
        </h1>
        <p className="text-sm text-gray-500 mt-2">
          Last updated: May 2026
        </p>
      </div>

      {/* Body */}
      <div className="glass p-8 space-y-8 text-sm text-gray-300 leading-relaxed">

        {/* 1. Non-Custodial Nature */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white">
            1. Non-Custodial Operation
          </h2>
          <p>
            Covex is a read-only blockchain explorer and does not custody, hold,
            transmit, control, or manage user funds at any time. All covenant
            interactions are executed via wallet deep-links
            (<code className="text-kaspa-green text-xs bg-black/30 px-1.5 py-0.5 rounded font-mono">kaspatest:</code> /
            <code className="text-kaspa-green text-xs bg-black/30 px-1.5 py-0.5 rounded font-mono">kaspa:</code> URIs)
            that open in the user&apos;s own wallet application.
          </p>
          <p>
            At no point does Covex access, request, or store private keys,
            seed phrases, or wallet credentials. Users are solely responsible
            for the security of their own signing keys and for verifying all
            transaction details — including amounts, recipient addresses, and
            covenant scripts — within their wallet before signing.
          </p>
        </section>

        {/* 2. User Responsibility */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white">
            2. User Responsibility
          </h2>
          <p>
            By using Covex, you acknowledge and agree that:
          </p>
          <ul className="list-disc list-inside space-y-2 pl-2 text-gray-400">
            <li>
              You are solely responsible for any transactions you initiate
              through the wallet deep-links provided by this platform.
            </li>
            <li>
              You have independently verified the authenticity and correctness
              of the covenant address and script before interacting with it.
            </li>
            <li>
              Covex provides information &quot;as is&quot; without warranty of
              any kind. Blockchain data is presented as retrieved from the
              underlying Kaspa node and may be subject to reorgs, latency, or
              incomplete propagation.
            </li>
            <li>
              You understand the risks inherent to interacting with smart
              contracts and covenants on a public blockchain, including but
              not limited to irreversible loss of funds, script vulnerabilities,
              and network congestion.
            </li>
          </ul>
        </section>

        {/* 3. Protocol Fees */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white">
            3. Protocol &amp; Listing Fees
          </h2>
          <p>
            The Host Covenant feature allows third parties to submit their
            covenant for listing on the Covex explorer for a fee of
            <strong className="text-white"> 100 KAS</strong>. This fee is paid
            directly to the Covex treasury address via a Kaspa wallet deep-link.
          </p>
          <p>
            Listing fees are:
          </p>
          <ul className="list-disc list-inside space-y-2 pl-2 text-gray-400">
            <li>
              Non-refundable once the transaction is confirmed on the Kaspa
              network.
            </li>
            <li>
              Collected by the Covex Protocol treasury and used to fund ongoing
              development, infrastructure, and maintenance of the explorer.
            </li>
            <li>
              Subject to change at the discretion of the Covex development team.
              The current fee will always be displayed on the Host Covenant page
              at the time of payment.
            </li>
          </ul>
        </section>

        {/* 4. No Financial Advice */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white">
            4. No Financial or Legal Advice
          </h2>
          <p>
            Nothing on Covex constitutes financial, investment, legal, or tax
            advice. Data displayed on the explorer — including covenant types,
            locked amounts, and transaction history — is provided for
            informational purposes only and should not be relied upon for
            decision-making without independent verification.
          </p>
        </section>

        {/* 5. Indemnification */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white">
            5. Limitation of Liability &amp; Indemnification
          </h2>
          <p>
            To the fullest extent permitted by applicable law, the Covex
            Protocol, its developers, contributors, and affiliates shall not
            be liable for any direct, indirect, incidental, special,
            consequential, or punitive damages arising from your use of the
            explorer, including but not limited to loss of funds, data
            inaccuracies, or wallet deep-link failures.
          </p>
          <p>
            You agree to indemnify and hold harmless the Covex team against
            any claims, damages, or expenses arising from your use of the
            platform or violation of these terms.
          </p>
        </section>

        {/* 6. Contact */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white">
            6. Contact
          </h2>
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
    </div>
  );
}
