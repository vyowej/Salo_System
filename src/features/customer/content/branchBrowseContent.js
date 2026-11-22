export const BRANCH_BROWSE_COPY = Object.freeze({
  switcherAriaLabel: 'Switch restaurant branch',
  youAreViewingPrefix: 'You are viewing:',
  otherBranchesLabel: 'Other branches:',
  openLabel: 'Open',
  closedLabel: 'Closed',
  siblingCartHint:
    'Your cart already has items from another branch of this restaurant. Each branch is ordered and delivered separately.',
  adminMainBranchBadge: (count) => `Main branch (${count} branches)`,
  adminChildBranchBadge: (brandName) => `Branch of ${brandName}`,
  adminApplyToAllLabel: (count) => `Apply to all ${count} branches`,
  adminApplyToAllWarning: (count) =>
    `This will update all ${count} branches of this business in one action.`,
});
