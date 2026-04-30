export type SocialPlatform = 'x';

export type SocialAccount = {
  kind: 'org' | 'team' | 'driver';
  label: string;
  platform: SocialPlatform;
  handle: string;
  url: string;
  sourceUrl?: string;
};

export const officialOrgAccounts: SocialAccount[] = [
  { kind: 'org', label: 'Formula 1', platform: 'x', handle: 'F1', url: 'https://x.com/F1' },
  { kind: 'org', label: 'FIA', platform: 'x', handle: 'fia', url: 'https://x.com/fia' },
];

export const socialIndexMarkdown = `# Official Social Accounts (X)

This server supports:

- A small curated set of official org accounts (F1, FIA).
- Tools to discover official team/driver accounts from Wikidata (cited).

Resources:

- fastf1://social/x
`;

