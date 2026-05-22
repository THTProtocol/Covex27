<div align="center">

```text
 ██████╗ ██████╗ ██╗   ██╗███████╗██╗  ██╗
██╔════╝██╔═══██╗██║   ██║██╔════╝╚██╗██╔╝
██║     ██║   ██║██║   ██║█████╗   ╚███╔╝ 
██║     ██║   ██║╚██╗ ██╔╝██╔══╝   ██╔██╗ 
╚██████╗╚██████╔╝ ╚████╔╝ ███████╗██╔╝ ██╗
 ╚═════╝ ╚═════╝   ╚═══╝  ╚══════╝╚═╝  ╚═╝
The Stateful Kaspa Covenant Indexer 🪟DAG is the truth. Covex is the window.Index → Discover → Customize → Deploy • All on the BlockDAG.🪟 What is Covex?Covex is a high-performance, non-custodial indexer and Custom UI builder for Kaspa's native UTXO smart contracts (Covenants). Built entirely in Rust and React, Covex abstracts the complexity of SilverScript into a seamless, interactive, and beautifully designed frontend experience.⚡ Core FeaturesHistoric BlockDAG Crawler: Automatically traverses the Kaspa DAG to discover and index historical covenants.Live Mempool Indexing: Connects directly to kaspad wRPC to instantly capture new SilverScript deployments.Custom UI Builder: Payment-gated SaaS layer allowing market makers to customize covenant displays.Oracle Ready: Architecture designed to handle off-chain cryptographic signatures (DLCs).🏗 ArchitectureCurrent Testnet-10 StackFragment kodugraph TD
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
        end
        
        DB[(SQLite DB)]
        Kaspad[Public TN10 Resolver]
    end

    Browser -- HTTPS --> Nginx
    Wallet -. SilverScript TX .-> Kaspad
    
    Nginx -- Proxy /api/* --> Axum
    Axum -- Read/Write --> DB
    
    LiveIdx -- Stream New TXs --> Kaspad
    Crawler -- Batch Scan DAG --> Kaspad
    LiveIdx & Crawler -- INSERT/UPDATE --> DB
    
    classDef kaspa fill:#49EACB,stroke:#000,stroke-width:2px,color:#000;
    class Kaspad,Wallet kaspa;
🛠 Technology StackComponentTechnologyPurposeNodekaspadwRPC access to Testnet-10BackendRust + AxumHigh-concurrency indexingDatabaseSQLiteFast, local state persistenceFrontendReact + ViteCyberpunk-styled UIProxyNginxSecure routing and API reverse-proxy