import { apiFetch, type Result } from './http';
import type { Progress } from './progress-api';

/** Development servers only (ADS_TRUST_CLIENT): claim a test ad's reward, which Google never verifies. */
export const claimAdReward = (token: string, customData: string): Promise<Result<{ coins: number; progress: Progress }>> =>
    apiFetch(token, '/ads/claim', { method: 'POST', body: JSON.stringify({ customData }) });
