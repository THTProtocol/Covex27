<div align="center">

```text
 ██████╗ ██████╗ ██╗   ██╗███████╗██╗  ██╗
██╔════╝██╔═══██╗██║   ██║██╔════╝╚██╗██╔╝
██║     ██║   ██║██║   ██║█████╗   ╚███╔╝ 
██║     ██║   ██║╚██╗ ██╔╝██╔══╝   ██╔██╗ 
╚██████╗╚██████╔╝ ╚████╔╝ ███████╗██╔╝ ██╗
 ╚═════╝ ╚═════╝   ╚═══╝  ╚══════╝╚═╝  ╚═╝
The Stateful Kaspa Covenant Indexer 🪟DAG is the truth. Covex is the window.Index → Discover → Customize → Deploy • All on the BlockDAG.🪟 What is Covex?Covex is a high-performance, non-custodial indexer and Custom UI builder for Kaspa's native UTXO smart contracts (Covenants). Built entirely in Rust and React, Covex abstracts the complexity of SilverScript into a seamless, interactive, and beautifully designed frontend experience.Currently live on Kaspa Testnet-10 in preparation for the Toccata Hardfork.⚡ Core FeaturesHistoric BlockDAG Crawler: Automatically traverses the Kaspa DAG to discover and index historical covenants.Live Mempool Indexing: Connects directly to local kaspad nodes via wRPC to instantly capture new SilverScript deployments.Custom UI Builder: A payment-gated SaaS layer allowing market makers to customize how their covenants are displayed (Creator, PRO, and MAX tiers).Oracle Ready: Architecture explicitly designed to handle off-chain cryptographic signatures (DLCs) for Predictive Markets.🏗 ArchitectureCurrent Testnet-10 StackFragment kodugraph TD
    subgraph Client [User Environment]
        Browser[React Frontend]
        Wallet[KasWare / Kaspium]
    end

    subgraph Hetzner Server [Covex Infrastructure]
        Nginx[Nginx Web Server]
        
        subgraph Rust Backend [Covex27-API]
            Axum[Axum API Server]
            LiveIdx[Live wRPC Indexer]
            Crawler[Historic DAG Crawler]
            PayVerify[Payment Verifier]
        end
        
        DB[(SQLite DB)]
        Kaspad[Kaspad Node TN10]
    end

    Browser -- HTTPS --> Nginx
    Wallet -. SilverScript TX .-> Kaspad
    
    Nginx -- Proxy /api/* --> Axum
    Axum -- Read/Write --> DB
    
    LiveIdx -- Stream New TXs --> Kaspad
    Crawler -- Batch Scan DAG --> Kaspad
    PayVerify -- Verify Treasury UTXOs --> Kaspad
    
    LiveIdx & Crawler & PayVerify -- INSERT/UPDATE --> DB
    
    classDef kaspa fill:#49EACB,stroke:#000,stroke-width:2px,color:#000;
    class Kaspad,Wallet kaspa;
🛠 Technology StackComponentTechnologyPurposeNodekaspadDirect wRPC access to Testnet-10BackendRust + AxumHigh-concurrency indexing and REST APIDatabaseSQLiteFast, local state persistenceFrontendReact + Vite + TailwindResponsive, cyberpunk-styled UIProxyNginxSecure routing and API reverse-proxy