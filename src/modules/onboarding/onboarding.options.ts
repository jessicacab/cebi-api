import { SocialPlatform, UserRole } from '../../generated/prisma/enums.js';

// Choices shown during sign-up (Signup artboard in the app). The app loads
// them from GET /v1/onboarding/options; ids are what gets saved.

export const ROLES = [
  { id: UserRole.CREATOR, name: 'Creator', description: 'I make videos and posts' },
  { id: UserRole.BUSINESS, name: 'Business', description: 'I own or run a business' },
];

export const PLATFORMS = [
  { id: SocialPlatform.TIKTOK, name: 'TikTok', description: 'Short videos' },
  { id: SocialPlatform.INSTAGRAM, name: 'Instagram', description: 'Reels, posts & stories' },
  { id: SocialPlatform.YOUTUBE, name: 'YouTube', description: 'Videos & Shorts' },
  { id: SocialPlatform.FACEBOOK, name: 'Facebook', description: 'Posts, reels & groups' },
];

export const NICHES = [
  { id: 'food', name: 'Food' },
  { id: 'travel', name: 'Travel' },
  { id: 'beauty', name: 'Beauty' },
  { id: 'lifestyle', name: 'Lifestyle' },
  { id: 'fitness', name: 'Fitness' },
  { id: 'tech', name: 'Tech' },
  { id: 'fashion', name: 'Fashion' },
  { id: 'family', name: 'Family' },
];

export const MAX_NICHES = 3;

export const BUSINESS_CATEGORIES = [
  { id: 'restaurant', name: 'Restaurant' },
  { id: 'cafe', name: 'Café' },
  { id: 'resort', name: 'Resort & stays' },
  { id: 'beauty_spa', name: 'Beauty & spa' },
  { id: 'retail', name: 'Retail' },
  { id: 'fitness', name: 'Fitness' },
];

export const DEFAULT_CITY = 'Cebu City';

export const NICHE_IDS = NICHES.map((n) => n.id);
export const CATEGORY_IDS = BUSINESS_CATEGORIES.map((c) => c.id);

export const onboardingOptions = () => ({
  roles: ROLES,
  platforms: PLATFORMS,
  niches: NICHES,
  maxNiches: MAX_NICHES,
  categories: BUSINESS_CATEGORIES,
  defaultCity: DEFAULT_CITY,
});
