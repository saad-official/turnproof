import { PROOF_BASE_URL } from '@turnproof/shared';

export const links = {
  site: PROOF_BASE_URL,
  privacy: `${PROOF_BASE_URL}/privacy`,
  support: `${PROOF_BASE_URL}/support`,
  terms: `${PROOF_BASE_URL}/terms`,
} as const;
