# HERMES README OVERHAUL PROMPT - Architecture Flowcharts + Pure Information

You are Hermes. Your task is to completely rewrite the README.md for the Covex27 project so it is the best possible technical and product overview.

## Strict Rules for the New README

- Pure information only. No marketing fluff, no "exciting" language, no unnecessary adjectives. Every sentence must deliver useful facts.
- No em dashes at all. Never use — 
- Avoid parentheses. Rephrase sentences to eliminate ( ) where possible. Use commas, colons, or restructure.
- Use clear short sentences and strong structure.
- Make it look great visually in Markdown: consistent headings, high-quality tables, proper code blocks, and especially multiple Mermaid flowcharts.
- The README must show the entire architecture and how everything works with visual flowcharts.

## Required Content and Structure

Start with the existing centered ASCII logo header and badges. Keep the live link, network, license, and Covenant Studio badge.

Then organize exactly like this:

1. What Covex Is
   - One paragraph factual description of what the project does today.

2. Core Capabilities
   - Bullet list of concrete current capabilities. Include free deployment, paid tiers with exact names BUILDER PRO MAX, Terminal, pro full screen games, ZK and oracle resolution.

3. Architecture Overview
   - High level diagram using Mermaid flowchart showing Browser -> Nginx -> Backend -> SQLite -> kaspad.
   - Then a detailed textual breakdown of the four main background tasks in the Rust binary.

4. Data Flow - From On Chain Covenant to Resolution
   - Large Mermaid flowchart showing the complete lifecycle:
     Transaction with aa20-aa23 payload on Kaspa
     -> Crawler or Indexer detection
     -> Classification using from_script_ops and covenant_type
     -> Tier payment verification
     -> UI generation and Terminal configuration
     -> Pro game play after equal stakes
     -> Oracle or ZK submission
     -> Signed outcome used for covenant unlock
   - Explain each step with short factual paragraphs.

5. Covenant Classification System
   - Detailed explanation of how the indexer and crawler classify covenants.
   - Show the current enum from covenant_types.rs.
   - Mermaid flowchart for the classification decision tree (based on opcode presence, payload length, specific byte patterns like 51 52 53, etc.).
   - Full table of all categories with detection rules and typical use cases. Include the new ones: VerifiableSkill and MembershipClaim.
   - Explain the difference between broad category and granular covenant_type.
   - Mention that BUILDER+ users can override with custom_category via the Terminal.
   - Show how classification is centralized and used in crawler.rs and indexer.rs.

6. Pro Game Experiences and Resolution
   - Factual description of the full screen game system (chess as primary example).
   - How stake matching works before the professional arena unlocks.
   - How results are submitted to the oracle service.
   - Current state of ZK circuits (Merkle Membership production ready, others in progress).
   - Mermaid sequence diagram showing Game Play -> Submit Result -> Oracle Verification -> Signed Outcome -> Covenant Resolution.

7. Technology Stack
   - Comprehensive table or clearly sectioned lists covering:
     - Kaspa layer
     - Backend (Rust crates, tasks, SQLite usage)
     - Frontend (React, styling system, game libraries)
     - ZK layer (circom, snarkjs, oracle integration)
     - Infrastructure
   - Be precise with versions and key libraries where relevant.

8. Tiers and Access Model
   - Table showing FREE, BUILDER, PRO, MAX with exact fees and what each actually unlocks.
   - Emphasize that paid tiers are for visibility and Terminal access. Free deployment is always available.

9. Key Components and Code Locations
   - List the most important files and what they do (covenant_types.rs for classification, CovexTerminal.jsx for game arenas and configuration, oracle.rs, crawler.rs, indexer.rs, compiler.rs, etc.).
   - Keep it factual and useful for someone who wants to understand or extend the system.

10. Database and API
    - Brief factual overview of the main tables.
    - List the most important API endpoints with short descriptions.

11. Running and Deployment
    - Factual quick start for local TN12 setup.
    - Note on the production deploy script.

End with the standard "Built by HIGH TABLE PROTOCOL" line and links.

## Visual Requirements

- Use at least four high quality Mermaid diagrams:
  1. High level architecture.
  2. Complete covenant lifecycle flowchart.
  3. Classification decision tree flowchart.
  4. Game resolution sequence diagram.

- Use tables for tiers, categories, stack, and API.
- Use code blocks for important structs or logic snippets where they add clarity.
- Use bold for file names and exact tier names.

## Execution Instructions

1. Read the current README.md fully.
2. Read these key files to get accurate current information:
   - backend/src/covenant_types.rs (especially the enum and from_script_ops + covenant_type functions)
   - backend/src/crawler.rs (classify and categorize functions)
   - backend/src/indexer.rs (classify_covenant)
   - backend/src/oracle.rs (high level)
   - frontend/src/components/CovexTerminal.jsx (pro game arenas and oracle submission)
   - Any recent changes related to full screen games and classification.
3. Rewrite README.md from scratch following the structure and rules above.
4. Make sure the new classification categories (VerifiableSkill, MembershipClaim) and the improved detection logic are accurately documented with flowcharts.
5. Ensure there are zero em dashes and minimal parentheses.
6. After writing, run the frontend build to make sure nothing is broken (though README is static).
7. Commit with a clear message: "README: Major improvement with full architecture flowcharts, detailed classification system, and pure factual information".
8. Push to master.
9. Provide the exact deploy command the user should run to sync Hetzner and hightable.pro.

After you finish, output a short summary of what diagrams you added and which files you read to ensure accuracy.

Start now. Be precise and thorough. The goal is a README that clearly explains the entire system with excellent visual flowcharts so anyone can understand how covenants are discovered, classified, turned into pro experiences, and resolved.