# Public Survey Discovery Design

## Overview

The explore page is Attestly's public marketplace — where users discover, search, and browse surveys. Features keyword search, category filtering, bounty filtering, featured/trending sections, and creator profiles. Only public, open-access, published surveys appear.

## Routes

| Route | Auth | Description |
|-------|------|-------------|
| `/explore` | Public | Survey marketplace — browse, search, filter |
| `/u/[userId]` | Public | Creator profile — bio, avatar, public surveys |
| `/settings/profile` | Protected | Edit profile (display name, avatar, bio) |

## Explore Page (`/explore`)

### Navigation

"Explore" is added to the main navbar for all users (authenticated and unauthenticated):

- **Authenticated:** Logo | **Explore** | Dashboard | My Responses | [Avatar]
- **Unauthenticated:** Logo | **Explore** | [Sign In]

### Page Sections (top to bottom)

#### 1. Search Bar

Full-width keyword search at the top of the page.

- Searches across survey titles, descriptions, and tags
- Results replace the page content with a filtered survey list
- Debounced input (300ms) for live search results
- Clear button to reset search and return to default view

#### 2. Featured Surveys

Horizontally scrollable card row of manually curated surveys.

- Curated by Attestly admin via `/admin` page (see Admin section below)
- Up to 6 featured surveys
- Visual cards showing: title, creator display name, response count, primary category
- Click to go to survey landing page
- Only visible on default view (hidden during search/filter)

#### 3. Trending Surveys

Top 5-10 surveys ranked by response velocity (responses per unit time).

- A survey that got 200 responses today ranks higher than one with 5,000 total but inactive for weeks
- List format with: title, creator, response count, time since published, category badge
- Refreshed periodically (e.g., every hour, or on page load)
- Only visible on default view

#### 4. Categories

Clickable filter pills showing all platform categories.

**Fixed category list:**
- Business
- Education
- Research
- Health
- Technology
- Politics
- Entertainment
- Science
- Community
- Other

- Clicking a category filters the "All Surveys" list below
- Multiple categories can be selected (OR logic — shows surveys matching any selected category)
- Selected categories are visually highlighted
- Click again to deselect

#### 5. Bounty Filter (Phase 4 — hidden until Phase 4 ships)

Filter for paid surveys (USDC bounty):

- Toggle: "Has bounty" — show only surveys with a USDC bounty
- Minimum bounty input: "Min reward: $___" — show only surveys where per-response payout meets the threshold
- Appears alongside category filters
- Bounty badges on survey cards also hidden until Phase 4

#### 6. All Surveys

Paginated list of all eligible surveys. "Load more" button or infinite scroll.

**Sort options:**
- **Trending** (default) — response velocity
- **Newest** — most recently published
- **Most responses** — total response count
- **Highest bounty** — per-response USDC payout (Phase 4 — hidden until Phase 4 ships)

**Survey cards show:**
- Title (links to survey landing page)
- Creator display name (links to creator profile)
- Response count
- Time since published ("2d ago", "1w ago")
- Category badges (up to 5)
- Freeform tags (if any)
- Bounty badge if applicable ("$0.50 USDC per response")

### Visibility Rules

Only these surveys appear in the marketplace:
- `status = PUBLISHED` (not DRAFT, not CLOSED)
- `accessMode = OPEN` (not INVITE_ONLY)
- `isPrivate = false`

Closed surveys, invite-only surveys, private surveys, and drafts are never shown.

## User Profile Page (`/u/[userId]`)

Public page showing a creator's profile and their public surveys.

### Profile Header

- **Avatar** — uploaded image, or default placeholder
- **Display name** — or wallet address if no display name set
- **Wallet address / ENS name**
- **Bio** — short text, max 200 characters
- **Join date**
- **Stats:** public survey count, total response count across public surveys

### Survey List

All public surveys by this creator:
- Includes both PUBLISHED and CLOSED surveys
- Same card format as explore page
- Sort: Newest (default), Most responses
- No drafts, no private surveys, no invite-only surveys

## Profile Settings (`/settings/profile`)

Protected route for editing profile information.

### Editable Fields

- **Display name** — text input, max 50 characters
- **Avatar** — image upload (max 2MB, JPEG/PNG/WebP). Stored via a file storage service (e.g., Vercel Blob, AWS S3, or Cloudflare R2).
- **Bio** — textarea, max 200 characters, character counter

### Non-Editable Fields (displayed but not editable)

- Wallet address — set by Privy, not user-editable
- Email — managed through Privy
- Join date — auto-set at account creation

## Categories & Tags on Survey Builder

The survey builder spec needs these additions:

### Categories (required before publish)

- Multi-select from fixed platform list (max 5)
- Displayed as selectable pills or checkbox list in the survey metadata section
- At least 1 category required before publishing
- Added to publish validation rules

### Tags (optional)

- Freeform text input, max 10 tags per survey
- Comma-separated or enter-to-add input style
- Tags are lowercased and trimmed automatically
- Used for search indexing, displayed on survey cards in the marketplace

## Data Model Additions

### Survey table (new fields)

| Field | Type | Notes |
|-------|------|-------|
| categories | Json | String array, 1-5 from fixed platform list. Required before publish. |
| tags | Json | String array, 0-10 freeform. Optional. Lowercased. |

### User table (new fields)

| Field | Type | Notes |
|-------|------|-------|
| avatar | String? | URL to uploaded avatar image |
| bio | String? | Short bio, max 200 characters |

## tRPC Procedures

| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `explore.search` | Query | Public | Search surveys by keyword (title, description, tags) |
| `explore.featured` | Query | Public | Get featured surveys |
| `explore.trending` | Query | Public | Get trending surveys by response velocity |
| `explore.browse` | Query | Public | Get paginated survey list with category, tag, bounty filters and sort |
| `explore.categories` | Query | Public | Get list of platform categories |
| `user.getProfile` | Query | Public | Get creator profile by userId |
| `user.getPublicSurveys` | Query | Public | Get public surveys by a creator |
| `profile.update` | Mutation | Protected | Update display name, bio |
| `profile.uploadAvatar` | Mutation | Protected | Upload avatar image, returns URL |

## Component Structure

```
ExplorePage (/explore)
├── SearchBar
├── FeaturedSection
│   └── FeaturedCard (horizontally scrollable)
├── TrendingSection
│   └── TrendingSurveyRow
├── FilterBar
│   ├── CategoryPills (multi-select)
│   ├── BountyFilter (toggle + min value input)
│   └── SortDropdown
└── SurveyList (paginated)
    └── SurveyCard
        ├── Title + UserLink
        ├── Meta (responses, time, categories, tags)
        └── BountyBadge (if applicable)

UserProfilePage (/u/[userId])
├── ProfileHeader
│   ├── Avatar
│   ├── DisplayName + WalletAddress
│   ├── Bio
│   └── Stats (survey count, response count, join date)
└── UserSurveyList
    └── SurveyCard

ProfileSettingsPage (/settings/profile)
├── AvatarUpload
├── DisplayNameInput
├── BioTextarea
└── ReadOnlyFields (wallet, email, join date)

AdminPage (/admin) — restricted to admin user(s)
├── FeaturedSurveyManager
│   ├── SearchSurveyInput (search by title/slug)
│   ├── FeaturedList (current featured surveys, max 6)
│   │   └── FeaturedSurveyRow (title, responses, [Remove])
│   └── AddToFeaturedButton
```

## Admin Page (`/admin`)

Protected route restricted to admin users. Simple page for managing platform-level settings, starting with featured survey curation. Designed to be expanded with additional admin features over time.

### Access Control

- Route is protected and restricted to specific admin user IDs (hardcoded or via an `isAdmin` boolean on the User table)
- Non-admin users who navigate to `/admin` see a 404

### Featured Survey Management

- Search for published public surveys by title or slug
- Add a survey to the featured list (max 6)
- View current featured surveys with title, response count, and date featured
- Remove a survey from the featured list
- Drag to reorder featured surveys (determines display order on explore page)

### Data Model

Add to Survey table:

| Field | Type | Notes |
|-------|------|-------|
| featuredAt | DateTime? | Set when admin features the survey. Null = not featured. |
| featuredOrder | Int? | Display order on explore page. Null = not featured. |

Add to User table:

| Field | Type | Notes |
|-------|------|-------|
| isAdmin | Boolean | Default false. Grants access to `/admin`. |

### tRPC Procedures

| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `admin.featureSurvey` | Mutation | Admin | Add a survey to the featured list |
| `admin.unfeatureSurvey` | Mutation | Admin | Remove a survey from featured |
| `admin.reorderFeatured` | Mutation | Admin | Update featured survey display order |
| `admin.searchSurveys` | Query | Admin | Search published public surveys for featuring |
