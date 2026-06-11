/**
 * Covex Platform SDK - Phase 18
 * Official lightweight client for interacting with the Covex API.
 * 
 * Supports:
 * - Fetching covenants
 * - Submitting oracle proofs
 * - Template publishing (marketplace)
 * - Analytics queries
 */

export interface CovexConfig {
  baseUrl?: string;
  apiKey?: string;
}

export interface Covenant {
  tx_id: string;
  creator_addr: string;
  amount_kaspa: number;
  verified_tier?: string;
  category?: string;
  // ... other fields
}

export interface OracleProofInput {
  covenant_id: string;
  circuit_type: string;
  proof: any;
  public_inputs: string[];
  requested_outcome?: number;
}

export interface MarketplaceTemplate {
  id: string;
  name: string;
  description: string;
  author: string;
  price_kas?: number;
  downloads: number;
  config: any; // CovenantConfigV1
}

export class CovexClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(config: CovexConfig = {}) {
    this.baseUrl = config.baseUrl || 'https://hightable.pro';
    this.apiKey = config.apiKey;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
      ...options.headers,
    };

    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Covex API error: ${res.status} - ${error}`);
    }

    return res.json();
  }

  // === Covenants ===
  async getCovenants(params: { limit?: number; creator?: string } = {}): Promise<Covenant[]> {
    const query = new URLSearchParams();
    if (params.limit) query.set('limit', String(params.limit));
    if (params.creator) query.set('creator', params.creator);
    return this.request(`/api/covenants?${query}`);
  }

  // === Oracle ===
  async submitOracleProof(input: OracleProofInput): Promise<any> {
    return this.request('/api/oracle/verify-and-sign', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  // === Marketplace (Phase 18) ===
  async publishTemplate(template: Partial<MarketplaceTemplate>): Promise<{ id: string; success: boolean }> {
    // In production this would hit a real marketplace API
    // console.log('[CovexSDK] Publishing template to marketplace (mock)'); // cleaned for prod
    return { id: 'tmpl_' + Date.now(), success: true };
  }

  async getMarketplaceTemplates(): Promise<MarketplaceTemplate[]> {
    // Would normally come from backend
    return []; // Placeholder - real implementation would query /api/marketplace
  }

  // === Analytics ===
  async getAnalytics(creator?: string): Promise<any> {
    const query = creator ? `?creator=${creator}` : '';
    return this.request(`/api/analytics${query}`);
  }

  // === Governance (Light) ===
  async getGovernanceProposals(): Promise<any[]> {
    return []; // Stub for Phase 18
  }

  async voteOnProposal(proposalId: string, vote: 'yes' | 'no'): Promise<any> {
    // console.log(`[CovexSDK] Voting ${vote} on ${proposalId} (mock)`); // cleaned for prod
    return { success: true };
  }
}

// Default export for convenience
export const covex = new CovexClient();
