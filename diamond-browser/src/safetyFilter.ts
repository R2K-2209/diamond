/**
 * Diamond Safety Filter — Layer 3
 * 
 * Multi-category URL and content filter with cloud policy integration.
 * This is a fast, synchronous local fallback that works alongside:
 *   Layer 1 (Cloudflare Family DNS) — blocks millions of domains at DNS level
 *   Layer 2 (Firebase Policy Sync) — parent-managed dynamic rules
 *   Layer 4 (DOM Content Scanner) — post-load page inspection + MutationObserver
 *   Layer 5 (ML Image Analysis) — on-device nsfwjs image classification
 * 
 * All word lists and domain patterns are imported from the unified
 * shieldDictionary module (base64-encoded for source code cleanliness).
 */

import { getPolicy, type ContentPolicy } from './policySync';
import {
  ADULT_DOMAIN_PATTERNS,
  ADULT_TLDS,
  ADULT_TOKENS,
  GAMBLING_PATTERNS,
  GAMBLING_TOKENS,
  PIRACY_PATTERNS,
  SOCIAL_MEDIA_DOMAINS,
  GAMING_DOMAINS,
  VPN_PROXY_DOMAINS,
  URL_SHORTENER_DOMAINS,
} from './shieldDictionary';

// ─── Safety Result Types ────────────────────────────────────────

export type SafetyCategory =
  | 'Adult Content'
  | 'Gambling & Betting'
  | 'Piracy & Malware'
  | 'Social Media (Restricted)'
  | 'Gaming (Restricted)'
  | 'VPN & Proxy (Bypass Attempt)'
  | 'URL Shortener (Hidden Link)'
  | 'Restricted Search Query'
  | 'Inappropriate Page Content'
  | 'Parent-Blocked Domain'
  | 'Not on Allowed List';

export interface SafetyCheckResult {
  blocked: boolean;
  category?: SafetyCategory;
  reason?: string;
  matchedRule?: string;
  layer?: 'local' | 'cloud' | 'dns' | 'content-scan';
}

// ─── Helper Functions ───────────────────────────────────────────

/**
 * Extract the registrable domain from a hostname.
 * e.g., "www.sub.example.com" → "example.com"
 *       "reddit.com" → "reddit.com"
 */
function getRegistrableDomain(hostname: string): string {
  const parts = hostname.split('.');
  if (parts.length <= 2) return hostname;
  // Handle co.uk, com.au etc. (simplified)
  const knownSuffixes = ['co.uk', 'com.au', 'co.in', 'co.jp', 'com.br', 'co.nz', 'co.za'];
  const last2 = parts.slice(-2).join('.');
  if (knownSuffixes.includes(last2)) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

/**
 * Check if a hostname matches any domain or keyword in a list.
 * Handles subdomains: "www.reddit.com" matches "reddit.com".
 * Handles dotless keywords: "reddit" matches "reddit.com", "www.reddit.com", "m.reddit.com".
 * Handles dirty inputs: "https://www.reddit.com/" matches "reddit.com".
 */
export function matchesDomainList(hostname: string, domains: string[]): string | null {
  if (!hostname || !domains || !domains.length) return null;
  const cleanHost = hostname.toLowerCase().trim();
  const registrable = getRegistrableDomain(cleanHost);
  const hostParts = cleanHost.split('.');

  for (const raw of domains) {
    if (!raw) continue;
    // Strip protocol, www prefix, and trailing path if parent entered full URL
    const domain = raw
      .toLowerCase()
      .trim()
      .replace(/^(https?:\/\/)?(www\.)?/, '')
      .replace(/\/.*$/, '');
    if (!domain) continue;

    // Exact hostname or registrable domain match
    if (cleanHost === domain || registrable === domain) {
      return domain;
    }

    // Subdomain match: e.g. "www.reddit.com".endsWith(".reddit.com") or "old.reddit.com".endsWith(".reddit.com")
    if (cleanHost.endsWith('.' + domain)) {
      return domain;
    }

    // Dotless keyword match: parent typed "reddit" (without .com)
    if (!domain.includes('.')) {
      if (hostParts.includes(domain)) {
        return domain;
      }
    }
  }
  return null;
}

// ─── Main Safety Check ──────────────────────────────────────────

/**
 * Validates a URL or user input against all child-safety rules.
 * Checks in priority order:
 *   1. Cloud policy allow-list (bypass all other checks)
 *   2. Cloud policy block-list
 *   3. Browsing mode (allowlist_only)
 *   4. Adult TLDs
 *   5. Adult domain patterns
 *   6. Gambling patterns
 *   7. Piracy patterns
 *   8. Social media (if restricted)
 *   9. Gaming (if restricted)
 *  10. VPN/Proxy sites
 *  11. URL shorteners
 *  12. Keyword token analysis (hostname, path, query)
 */
export function checkUrlSafety(inputUrl: string): SafetyCheckResult {
  if (!inputUrl || typeof inputUrl !== 'string') {
    return { blocked: false };
  }

  const urlString = inputUrl.trim();
  const policy = getPolicy();

  // ── Try parsing as URL ──
  let parsed: URL | null = null;
  try {
    if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
      parsed = new URL('https://' + urlString);
    } else {
      parsed = new URL(urlString);
    }
  } catch {
    // Not a valid URL — treat as raw text query
    return checkRawQuerySafety(urlString, policy);
  }

  const hostname = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname.toLowerCase();
  const search = parsed.search.toLowerCase();

  // ── Unpack search engine redirects (e.g. Google /url?url=... or /url?q=...) ──
  if (hostname.includes('google.') && pathname === '/url') {
    const dest = parsed.searchParams.get('url') || parsed.searchParams.get('q');
    if (dest) {
      const destCheck = checkUrlSafety(dest);
      if (destCheck.blocked) {
        return destCheck;
      }
    }
  }

  // ── 1. Cloud policy: custom allow-list (highest priority) ──
  if (policy.customAllowedDomains.length > 0) {
    const allowMatch = matchesDomainList(hostname, policy.customAllowedDomains);
    if (allowMatch) {
      return { blocked: false }; // Parent explicitly allowed this domain
    }
  }

  // ── 2. Cloud policy: custom block-list ──
  if (policy.customBlockedDomains.length > 0) {
    const blockMatch = matchesDomainList(hostname, policy.customBlockedDomains);
    if (blockMatch) {
      return {
        blocked: true,
        category: 'Parent-Blocked Domain',
        reason: `Your parent has restricted access to "${blockMatch}".`,
        matchedRule: blockMatch,
        layer: 'cloud',
      };
    }
  }

  // ── 3. Browsing mode: allowlist_only (walled garden) ──
  if (policy.mode === 'allowlist_only') {
    const walledMatch = matchesDomainList(hostname, policy.walledGardenSites);
    if (!walledMatch) {
      return {
        blocked: true,
        category: 'Not on Allowed List',
        reason: `This website is not on your approved list. Ask a parent to add "${getRegistrableDomain(hostname)}" to your allowed sites.`,
        matchedRule: hostname,
        layer: 'cloud',
      };
    }
    // Even in allowlist mode, still check adult content on allowed sites
  }

  // ── 4. Adult TLDs ──
  if (policy.blockAdultContent) {
    for (const tld of ADULT_TLDS) {
      if (hostname.endsWith(tld)) {
        return {
          blocked: true,
          category: 'Adult Content',
          reason: `Domains with "${tld}" extension are strictly prohibited.`,
          matchedRule: tld,
          layer: 'local',
        };
      }
    }
  }

  // ── 5. Adult domain patterns ──
  if (policy.blockAdultContent) {
    for (const pattern of ADULT_DOMAIN_PATTERNS) {
      if (hostname.includes(pattern)) {
        return {
          blocked: true,
          category: 'Adult Content',
          reason: `Domain matches known explicit content provider.`,
          matchedRule: pattern,
          layer: 'local',
        };
      }
    }
  }

  // ── 6. Gambling domain patterns ──
  if (policy.blockGambling) {
    for (const pattern of GAMBLING_PATTERNS) {
      if (hostname.includes(pattern)) {
        return {
          blocked: true,
          category: 'Gambling & Betting',
          reason: `Domain matches known gambling provider.`,
          matchedRule: pattern,
          layer: 'local',
        };
      }
    }
  }

  // ── 7. Piracy patterns ──
  for (const pattern of PIRACY_PATTERNS) {
    if (hostname.includes(pattern)) {
      return {
        blocked: true,
        category: 'Piracy & Malware',
        reason: `Domain matches known piracy or malicious site.`,
        matchedRule: pattern,
        layer: 'local',
      };
    }
  }

  // ── 8. Social media (if restricted by parent) ──
  if (policy.blockSocialMedia) {
    const socialMatch = matchesDomainList(hostname, SOCIAL_MEDIA_DOMAINS);
    if (socialMatch) {
      return {
        blocked: true,
        category: 'Social Media (Restricted)',
        reason: `Social media access has been restricted by your parent.`,
        matchedRule: socialMatch,
        layer: 'cloud',
      };
    }
  }

  // ── 9. Gaming sites (if restricted by parent) ──
  if (policy.blockGaming) {
    const gameMatch = matchesDomainList(hostname, GAMING_DOMAINS);
    if (gameMatch) {
      return {
        blocked: true,
        category: 'Gaming (Restricted)',
        reason: `Gaming platform access has been restricted by your parent.`,
        matchedRule: gameMatch,
        layer: 'cloud',
      };
    }
  }

  // ── 10. VPN/Proxy sites (bypass prevention) ──
  if (policy.blockVpnProxy) {
    const vpnMatch = matchesDomainList(hostname, VPN_PROXY_DOMAINS);
    if (vpnMatch) {
      return {
        blocked: true,
        category: 'VPN & Proxy (Bypass Attempt)',
        reason: `VPN and proxy services are blocked to maintain browsing protection.`,
        matchedRule: vpnMatch,
        layer: 'local',
      };
    }
  }

  // ── 11. URL shorteners ──
  if (policy.blockUrlShorteners) {
    const shortMatch = matchesDomainList(hostname, URL_SHORTENER_DOMAINS);
    if (shortMatch) {
      return {
        blocked: true,
        category: 'URL Shortener (Hidden Link)',
        reason: `Shortened links are blocked because they can hide the real destination.`,
        matchedRule: shortMatch,
        layer: 'local',
      };
    }
  }

  // ── 12. Keyword token analysis ──
  if (policy.blockAdultContent) {
    // Tokenize hostname
    const hostTokens = hostname.split(/[^a-z0-9]+/);
    for (const token of hostTokens) {
      const cleanToken = token.replace(/^\d+|\d+$/g, '');
      if (ADULT_TOKENS.has(cleanToken)) {
        return {
          blocked: true,
          category: 'Adult Content',
          reason: `Domain contains restricted keyword "${cleanToken}".`,
          matchedRule: cleanToken,
          layer: 'local',
        };
      }
    }

    if (policy.blockGambling) {
      for (const token of hostTokens) {
        const cleanToken = token.replace(/^\d+|\d+$/g, '');
        if (GAMBLING_TOKENS.has(cleanToken)) {
          return {
            blocked: true,
            category: 'Gambling & Betting',
            reason: `Domain contains gambling-related keyword "${cleanToken}".`,
            matchedRule: cleanToken,
            layer: 'local',
          };
        }
      }
    }

    // Check path segments (skip search engines — they use SafeSearch)
    const isSearchEngine = hostname.includes('google.') || hostname.includes('bing.') ||
      hostname.includes('duckduckgo.') || hostname.includes('yahoo.');
    if (!isSearchEngine) {
      const pathTokens = pathname.split(/[^a-z0-9]+/);
      for (const token of pathTokens) {
        if (token.length > 2 && ADULT_TOKENS.has(token)) {
          return {
            blocked: true,
            category: 'Adult Content',
            reason: `URL path contains explicit keyword "${token}".`,
            matchedRule: token,
            layer: 'local',
          };
        }
      }

      // Check query parameters
      if (search) {
        const searchTokens = search.split(/[^a-z0-9]+/);
        for (const token of searchTokens) {
          if (token.length > 2 && ADULT_TOKENS.has(token)) {
            return {
              blocked: true,
              category: 'Adult Content',
              reason: `URL query contains explicit keyword "${token}".`,
              matchedRule: token,
              layer: 'local',
            };
          }
        }
      }
    }
  }

  return { blocked: false };
}

// ─── Raw Query Check ────────────────────────────────────────────

function checkRawQuerySafety(rawText: string, policy: ContentPolicy): SafetyCheckResult {
  if (!policy.blockAdultContent) return { blocked: false };

  const lowerInput = rawText.toLowerCase();
  for (const token of ADULT_TOKENS) {
    const regex = new RegExp(`\\b${token}\\b`, 'i');
    if (regex.test(lowerInput)) {
      return {
        blocked: true,
        category: 'Restricted Search Query',
        reason: `Search contains prohibited keyword "${token}".`,
        matchedRule: token,
        layer: 'local',
      };
    }
  }
  return { blocked: false };
}

// ─── SafeSearch Enforcement ─────────────────────────────────────

/**
 * Transforms a URL to enforce SafeSearch on supported search engines.
 */
export function enforceSafeSearch(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('google.') && parsed.pathname.includes('/search')) {
      parsed.searchParams.set('safe', 'active');
      return parsed.toString();
    }
    if (parsed.hostname.includes('bing.') && parsed.pathname.includes('/search')) {
      parsed.searchParams.set('adlt', 'strict');
      return parsed.toString();
    }
    if (parsed.hostname.includes('duckduckgo.')) {
      parsed.searchParams.set('kp', '1');
      return parsed.toString();
    }
    if (parsed.hostname.includes('yahoo.')) {
      parsed.searchParams.set('vm', 'r');
      return parsed.toString();
    }
  } catch {
    // Not a valid URL
  }
  return url;
}
