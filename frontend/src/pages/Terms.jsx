import { Link } from 'react-router-dom';

export default function Terms() {
  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-10 space-y-8">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-gray-200 light:text-slate-700 hover:text-kaspa-green light:hover:text-teal-600 transition-colors"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M19 12H5m6-6-6 6 6 6" />
        </svg>
        Explorer
      </Link>

      <div className="glass-panel light:bg-white/80 light:border-slate-200 p-6 sm:p-8">
        <h1 className="text-2xl font-semibold text-white light:text-slate-900 tracking-tight">Terms and Conditions</h1>
        <p className="text-sm text-gray-300 light:text-slate-600 mt-2">Last updated: June 2026</p>
        <p className="text-sm text-gray-300 light:text-slate-700 mt-3">
          These Terms govern your use of Covex (the "Platform", "we", "us"). By using the Platform you
          agree to them. If you do not agree, do not use the Platform. This page is a plain-English
          description of how the Platform works and the limits of our role; it is not legal advice.
        </p>
      </div>

      <div className="glass-panel light:bg-white/80 light:border-slate-200 p-6 sm:p-8 space-y-8 text-sm text-gray-300 light:text-slate-700 leading-relaxed">
        {/* 1. What Covex is and is not */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white light:text-slate-900">1. What Covex Is (and Is Not)</h2>
          <p>
            Covex is software: a read-only Kaspa BlockDAG explorer, an indexer of publicly available
            on-chain data, and an optional user-interface generator. <strong className="text-white light:text-slate-900">Covex is not the operator,
            custodian, issuer, counterparty, broker, dealer, exchange, money transmitter, or money
            services business of any covenant, game, market, or transaction.</strong>
          </p>
          <p>
            Covenants on Kaspa are autonomous on-chain programs. Where a covenant is script-enforced
            (pay-to-script-hash), its outcome is determined and enforced by Kaspa network consensus,
            not by Covex. We do not execute, settle, guarantee, reverse, freeze, or control any
            covenant, and we cannot move, seize, or recover funds locked in one. Removing Covex entirely
            does not change, stop, or impair any covenant on the chain.
          </p>
        </section>

        {/* 2. Non-custodial + recoverable without us */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white light:text-slate-900">2. Non-Custodial and Recoverable Without Covex</h2>
          <p>
            Covex never custodies, holds, receives, transmits, or controls user funds, and never
            accesses, requests, or stores private keys, seed phrases, or wallet credentials. Spends are
            signed in your own wallet or on your own device; only a signature, never a key, is ever
            transmitted.
          </p>
          <p>
            For script-enforced covenants, the redeem script required to spend the funds is published
            on-chain and is recoverable from the public Kaspa network without any reliance on Covex. The
            open-source recovery tool in the project repository (<span className="font-mono text-gray-200 light:text-slate-800">tools/recover-covenant.mjs</span>)
            reconstructs the redeem script from chain data alone. <strong className="text-white light:text-slate-900">If Covex disappears, your funds remain
            spendable by you using only your key and the public chain.</strong> You are solely responsible for
            safeguarding your keys, secrets (e.g. hashlock preimages), and redeem scripts.
          </p>
        </section>

        {/* 3. Indexing + UI */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white light:text-slate-900">3. Covenant Indexing and UI Generation</h2>
          <p>Covex indexes publicly available BlockDAG data. The Platform:</p>
          <ul className="list-disc list-inside space-y-2 pl-2 text-gray-200 light:text-slate-700">
            <li>Does not create, modify, or control any on-chain covenant.</li>
            <li>Indexes covenant UTXOs via a direct connection to a Kaspa node.</li>
            <li>Labels each covenant's enforcement reality honestly (on-chain script-enforced, oracle-attested, or metadata-only) and never implies more enforcement than the chain provides. Zero-knowledge proofs, where used, are verified off-chain by the disclosed oracle (Kaspa has no on-chain proof verifier); only the oracle's Schnorr co-signature is checked on-chain.</li>
            <li>Generates optional interactive interfaces for paid users; these are display layers only and do not change on-chain logic.</li>
          </ul>
        </section>

        {/* 4. Skill-based interactions / games */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white light:text-slate-900">4. Skill-Based Interactions and Games</h2>
          <p>
            Any games surfaced through the Platform (e.g. chess, connect-four, tic-tac-toe) are
            <strong className="text-white light:text-slate-900"> games of skill played peer-to-peer between participants</strong>. Covex is not a
            participant, is not the "house", does not take a position, does not set odds, and does not
            operate a game of chance. Any stake is locked in an on-chain covenant between the players;
            Covex does not custody the stake and the chain (or the disclosed oracle's consensus-required
            co-signature, where applicable) determines the recipient.
          </p>
          <p>
            You are solely responsible for determining whether participating in any covenant, market, or
            game is lawful in your jurisdiction, and for complying with all applicable laws. You may not
            use the Platform where doing so is prohibited. Covex provides no legal advice and is not
            associated with gambling, prediction markets, securities, or any unlawful activity.
          </p>
        </section>

        {/* 5. Eligibility */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white light:text-slate-900">5. Eligibility</h2>
          <p>By using the Platform you represent that you:</p>
          <ul className="list-disc list-inside space-y-2 pl-2 text-gray-200 light:text-slate-700">
            <li>Are at least the age of majority in your jurisdiction.</li>
            <li>Are not located in, or a resident of, any jurisdiction where use of the Platform is prohibited, and are not subject to applicable sanctions.</li>
            <li>Will use the Platform only for lawful purposes and in compliance with all applicable laws and regulations.</li>
          </ul>
        </section>

        {/* 6. Payments */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white light:text-slate-900">6. On-Chain Payments</h2>
          <p>
            Optional paid tiers (e.g. custom interactive UIs, visibility features) are paid on-chain in
            KAS for Platform software services only. Payments are non-refundable once confirmed on the
            Kaspa network. A paid tier does not constitute custody of funds, an investment, or any
            promise of financial return.
          </p>
        </section>

        {/* 7. User responsibility */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white light:text-slate-900">7. User Responsibility</h2>
          <p>By using Covex, you acknowledge that:</p>
          <ul className="list-disc list-inside space-y-2 pl-2 text-gray-200 light:text-slate-700">
            <li>You are solely responsible for every transaction you sign, and for verifying amounts, addresses, scripts, and outcomes before signing.</li>
            <li>Covenants deployed to Kaspa are permanent and immutable; they cannot be changed or reversed by anyone, including us.</li>
            <li>You must independently verify the authenticity and enforcement reality of any covenant before interacting with it.</li>
            <li>You bear all risk of loss, including from your own errors, lost keys or secrets, smart-contract/script risk, chain reorgs, and third-party software.</li>
          </ul>
        </section>

        {/* 8. Experimental software, mainnet real value, assumption of risk */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white light:text-slate-900">8. Experimental Software, Mainnet Launch, and Assumption of Risk</h2>
          <p>
            Covex and Kaspa covenant tooling are <strong className="text-white light:text-slate-900">experimental and under active development</strong>. Full
            scriptable covenants on Kaspa mainnet depend on the Toccata upgrade, scheduled to activate on
            <strong className="text-white light:text-slate-900"> 30 June 2026</strong>. From that activation Covex operates on Kaspa
            <strong className="text-white light:text-slate-900"> mainnet with real KAS of real monetary value</strong>: covenants you fund, stake, or
            interact with put real funds at risk. The SilverScript language, the zero-knowledge circuits, and the
            trusted-setup ceremonies remain pre-production: the current ZK trusted setup is a single-contributor
            development ceremony, not an independent multi-party ceremony, and ZK proofs are verified off-chain by
            the disclosed oracle rather than on-chain. Do not treat any of this as audited or final.
          </p>
          <p>
            You use the Platform at your own risk and assume all risks inherent to experimental blockchain
            software, including bugs, unaudited code, economic and cryptographic risk, network forks and
            reorgs, oracle failure or downtime, and total loss of funds. Do not commit value you cannot
            afford to lose.
          </p>
        </section>

        {/* 9. No advice */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white light:text-slate-900">9. No Financial, Investment, Legal, or Tax Advice</h2>
          <p>
            Nothing on Covex constitutes financial, investment, legal, or tax advice. All data is for
            informational purposes only and should not be relied upon without independent verification
            and, where appropriate, advice from a qualified professional in your jurisdiction.
          </p>
        </section>

        {/* 10. Privacy and data */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white light:text-slate-900">10. Privacy and Data</h2>
          <p>
            Covex is designed to minimize data collection. We do not run user accounts, do not request
            personal identifying information, and do not collect private keys or seed phrases. Public
            on-chain data (addresses, transactions, covenant UTXOs) is inherently public and is indexed
            from the Kaspa network. The Platform may store, on its own server, non-personal operational
            data you submit through it, such as covenant display configurations, generated interfaces,
            and public game state, in order to provide the service.
          </p>
          <p>
            Your browser may keep local data (for example a connected wallet address or a locally
            generated wallet) in your own browser storage; this never leaves your device except as a
            signature you authorize. Treat any locally stored key material as you would cash, and clear
            it on shared or untrusted devices. Wallet extensions and the Kaspa network are independent
            third parties governed by their own policies. See the full{' '}
            <Link to="/privacy" className="text-kaspa-green light:text-teal-600 hover:underline">Privacy Policy</Link>{' '}
            for how the Platform processes IP addresses (for per-IP rate limiting only),
            indexes public wallet addresses, and stores operational data you publish. The Platform does not
            perform IP-based geoblocking or sanctions screening; eligibility is your own responsibility as
            described in Section 5.
          </p>
        </section>

        {/* 11. Third-party services and dependencies */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white light:text-slate-900">11. Third-Party Services and Dependencies</h2>
          <p>
            The Platform depends on third parties Covex does not control, including the Kaspa network and
            its consensus, public Kaspa nodes, block explorers, and browser wallet extensions. Their
            availability, correctness, and security are outside our control, and we are not responsible
            for their acts, omissions, downtime, or changes. Links to external sites and explorers are
            provided for convenience and are not endorsements.
          </p>
        </section>

        {/* 12. Intellectual property / open source */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white light:text-slate-900">12. Intellectual Property and Open Source</h2>
          <p>
            The Covex source code is published in the project repository under its stated open-source
            license, which governs your rights to use, copy, and modify the code. Covex name and branding
            aside, on-chain covenant data is public and owned by no one. You retain ownership of content
            you create with the Platform (for example, a generated UI), and grant Covex the limited
            permission needed to host and display it where you choose to publish it.
          </p>
        </section>

        {/* 13. Disclaimer of warranty */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white light:text-slate-900">13. Disclaimer of Warranty</h2>
          <p>
            The Platform is provided "AS IS" and "AS AVAILABLE", without warranties of any kind, express
            or implied, including merchantability, fitness for a particular purpose, and non-infringement.
            BlockDAG data is presented as retrieved from the underlying node and may be subject to
            reorgs, latency, or incomplete propagation. We make no guarantee of accuracy, completeness,
            timeliness, or uninterrupted availability.
          </p>
        </section>

        {/* 14. Limitation of liability */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white light:text-slate-900">14. Limitation of Liability</h2>
          <p>
            To the fullest extent permitted by applicable law, Covex and its developers, contributors,
            and affiliates shall not be liable for any direct, indirect, incidental, special,
            consequential, exemplary, or punitive damages, or any loss of funds, profits, data, or
            goodwill, arising from or related to your use of (or inability to use) the Platform, any
            covenant, any game, or the Kaspa network, even if advised of the possibility of such damages.
          </p>
        </section>

        {/* 15. Indemnification */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white light:text-slate-900">15. Indemnification</h2>
          <p>
            You agree to indemnify and hold harmless Covex and its developers, contributors, and
            affiliates from any claim, demand, loss, or expense (including reasonable legal fees) arising
            from your use of the Platform, your violation of these Terms, or your violation of any law or
            the rights of any third party.
          </p>
        </section>

        {/* 16. Governing law and disputes */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white light:text-slate-900">16. Governing Law and Disputes</h2>
          <p>
            To the extent permitted by law, any dispute arising from these Terms or your use of the
            Platform shall be resolved on an individual basis, and you waive any right to participate in a
            class, collective, or representative action. Nothing in these Terms limits any right you may
            have that cannot be waived under the mandatory law of your place of residence. Because the
            Platform is open-source software with no central operator, you are responsible for compliance
            with the laws of your own jurisdiction.
          </p>
        </section>

        {/* 17. Severability and entire agreement */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white light:text-slate-900">17. Severability and Entire Agreement</h2>
          <p>
            If any provision of these Terms is held unenforceable, the remaining provisions continue in
            full force, and the unenforceable provision is applied to the maximum extent permitted. These
            Terms are the entire agreement between you and Covex regarding the Platform and supersede any
            prior understanding. Our failure to enforce any provision is not a waiver of it.
          </p>
        </section>

        {/* 18. Changes */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white light:text-slate-900">18. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. Continued use of the Platform after an update
            constitutes acceptance of the revised Terms. The covenant logic on-chain is unaffected by
            any change to these Terms.
          </p>
        </section>

        {/* 19. Contact */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white light:text-slate-900">19. Contact</h2>
          <p>
            Questions about these Terms can be raised via the
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

      <div className="glass-panel light:bg-white/80 light:border-slate-200 p-6 text-xs text-gray-200 light:text-slate-600 text-center">
        <p>
          DAG is the truth. Covex is the window. Covenants are autonomous on-chain programs enforced by
          Kaspa consensus; Covex only indexes them and generates optional interfaces, never custodies
          funds, and is fully removable without affecting your ability to spend.
        </p>
      </div>
    </div>
  );
}
