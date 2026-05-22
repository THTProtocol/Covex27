<div align="center">

```text
 ██████╗ ██████╗ ██╗   ██╗███████╗██╗  ██╗
██╔════╝██╔═══██╗██║   ██║██╔════╝╚██╗██╔╝
██║     ██║   ██║██║   ██║█████╗   ╚███╔╝ 
██║     ██║   ██║╚██╗ ██╔╝██╔══╝   ██╔██╗ 
╚██████╗╚██████╔╝ ╚████╔╝ ███████╗██╔╝ ██╗
 ╚═════╝ ╚═════╝   ╚═══╝  ╚══════╝╚═╝  ╚═╝
The Stateful Kaspa Covenant Indexer 🪟
DAG is the truth. Covex is the window.

Index → Discover → Customize → Deploy • All on the BlockDAG.

🪟 What is Covex?
Covex is a high-performance, non-custodial indexer and Custom UI builder for Kaspa's native UTXO smart contracts (Covenants). Built entirely in Rust and React, Covex abstracts the complexity of SilverScript into a seamless, interactive, and beautifully designed frontend experience.

Currently live on Kaspa Testnet-10 in preparation for the Toccata Hardfork.

⚡ Core Features
Historic BlockDAG Crawler: Automatically traverses the Kaspa DAG to discover and index historical covenants.

Live Mempool Indexing: Connects directly to local kaspad nodes via wRPC to instantly capture new SilverScript deployments.

Custom UI Builder: A payment-gated SaaS layer allowing market makers to customize how their covenants are displayed (Creator, PRO, and MAX tiers).

Oracle Ready: Architecture explicitly designed to handle off-chain cryptographic signatures (DLCs) for Predictive Markets.
🏗 Architecture
Covex is built for high-throughput (10+ BPS) environments. It does not rely on third-party APIs or proxies—it speaks directly to the Kaspa node.

Current Testnet-10 Stack
Fragment kodu
graph TD
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
Future Mainnet Stack (Post-Toccata)
Fragment kodu
graph TD
    subgraph Client [User Environment]
        Browser[Covex Pro Frontend]
        Wallet[Kaspa Native Wallets]
    end

    subgraph Cloud Infrastructure [Covex Mainnet Cluster]
        LB[Load Balancer]
        API1[Rust Axum API Fleet]
        
        subgraph Indexing Fleet
            Crawler[Distributed DAG Crawlers]
            LiveIdx[Live Mempool Indexers]
        end
        
        DB[(PostgreSQL Cluster)]
    end

    subgraph Kaspa Network
        KNode1[Kaspad Archival Node]
    end

    Browser --> LB --> API1
    Wallet -. TX .-> KNode1
    
    API1 -- Read/Write --> DB
    Crawler & LiveIdx --> DB
    Crawler & LiveIdx -- wRPC --> KNode1
    
    classDef kaspa fill:#49EACB,stroke:#000,stroke-width:2px,color:#000;
    class KNode1,Wallet kaspa;🛠 Technology StackComponentTechnologyPurposeNodekaspadDirect wRPC access to Testnet-10BackendRust + AxumHigh-concurrency indexing and REST APIDatabaseSQLiteFast, local state persistenceFrontendReact + Vite + TailwindResponsive, cyberpunk-styled UIProxyNginxSecure routing and API reverse-proxy🚀 Getting StartedEnsure your Kaspa node is exposing the Borsh wRPC endpoint:Bashkaspad --testnet --utxoindex --rpclisten-borsh=0.0.0.0:17110