# Quick Cleanup Checklist - Files Safe to Delete

## PRIORITY 1: DEFINITELY UNUSED - Safe to Delete Immediately

### Unused Library Files
```
✅ artifacts/api-server/src/lib/scheduler-new.ts
✅ artifacts/api-server/src/lib/bid-processor2.ts
✅ src/lib/scheduler-new.ts
✅ src/lib/bid-processor2.ts
```

### Unused Utility Scripts (17 files)
```
✅ scripts/src/analyze-website.ts
✅ scripts/src/check-bids.ts
✅ scripts/src/check-markets.ts
✅ scripts/src/check-relations.ts
✅ scripts/src/check-website.ts
✅ scripts/src/debug-scraper.ts
✅ scripts/src/inspect-satta.ts
✅ scripts/src/kalyan-now.ts
✅ scripts/src/scrape-last-5-days.ts
✅ scripts/src/test-delete.ts
✅ scripts/src/test-fetch-now.ts
✅ scripts/src/test-game-rates-put.ts
✅ scripts/src/test-game-rates.ts
✅ scripts/src/test-market-bidding.ts
✅ scripts/src/test-scraping.ts
✅ scripts/src/update-markets.ts
✅ scripts/src/update-names.ts
```

---

## PRIORITY 2: LIKELY UNUSED - Review Before Deleting

### Potentially Unused UI Components (12 files)
These components are defined but not imported anywhere in the admin-panel:

```
⚠️ artifacts/admin-panel/src/components/ui/aspect-ratio.tsx
⚠️ artifacts/admin-panel/src/components/ui/carousel.tsx
⚠️ artifacts/admin-panel/src/components/ui/context-menu.tsx
⚠️ artifacts/admin-panel/src/components/ui/hover-card.tsx
⚠️ artifacts/admin-panel/src/components/ui/menubar.tsx
⚠️ artifacts/admin-panel/src/components/ui/navigation-menu.tsx
⚠️ artifacts/admin-panel/src/components/ui/popover.tsx
⚠️ artifacts/admin-panel/src/components/ui/progress.tsx
⚠️ artifacts/admin-panel/src/components/ui/radio-group.tsx
⚠️ artifacts/admin-panel/src/components/ui/resizable.tsx
⚠️ artifacts/admin-panel/src/components/ui/slider.tsx
⚠️ artifacts/admin-panel/src/components/ui/tabs.tsx
```

**Consider keeping as:**
- Component library for future use
- Reference implementations
- Part of UI framework infrastructure

---

## PRIORITY 3: ARCHIVED/OBSOLETE FILES - Review & Archive

### Deployment Documentation (5-7 files)
Review if still relevant - consider archiving to a `docs/archived/` directory:

```
⚠️ HOSTINGER_DEPLOYMENT_ANALYSIS.md
⚠️ HOSTINGER_DEPLOYMENT_CHECKLIST.md
⚠️ HOSTINGER_DEPLOYMENT_EXECUTIVE_SUMMARY.md
⚠️ HOSTINGER_DEPLOYMENT_FIXES.md
⚠️ HOSTINGER_DEPLOYMENT_TRACKER.md
⚠️ README_HOSTINGER.md
⚠️ ADMIN_PANEL_DEPLOYMENT.md
```

### Deployment Configuration Files
Verify which deployment platforms are actively used:

```
⚠️ render-api-server.yaml
⚠️ render.yaml
⚠️ vercel.json
⚠️ hostinger.yaml
⚠️ Procfile
```

### Deployment Scripts
Verify if these are still part of deployment workflow:

```
⚠️ hostinger-deploy.sh
⚠️ hostinger-deploy.bat
⚠️ PUSH_TO_NEW_REPO.sh
```

---

## ARCHITECTURAL ISSUE: Duplicate Source Tree

The codebase contains duplicate source files in two locations:

```
/src/                                          (Root level)
├── app.ts
├── index.ts  
├── lib/
├── middlewares/
└── routes/

/artifacts/api-server/src/                     (Duplicate in artifacts)
├── app.ts
├── index.ts
├── lib/
├── middlewares/
└── routes/
```

**Action Required:** Determine if this is:
1. Intentional (monorepo pattern) - then document it
2. Accidental duplication - then consolidate to one location

---

## UNUSED DEPENDENCIES (Optional Cleanup)

These dependencies in `artifacts/admin-panel/package.json` may be unused:
- `input-otp` - Not imported in any page
- `tw-animate-css` - Verify if used in CSS/Tailwind config
- `embla-carousel-react` - Carousel component exists but unused

**Recommendation:** Check imports before removing, as some can be indirect or CSS-based.

---

## Summary Statistics

**Total files recommended for deletion (Priority 1):**
- 4 library files (scheduler-new, bid-processor2)
- 17 script files (test/debug utilities)
- **Total: 21 files | Estimated savings: ~250 KB**

**Total files for review (Priority 2-3):**
- 12 UI components (library/future use)
- 12+ deployment files and configs
- **Total: 24+ files | Estimated savings: 100+ KB**

**Total potential cleanup: 45+ files | Estimated space savings: 350+ KB**

---

## Cleanup Commands

### Delete Priority 1 Files (If Confirmed Safe)
```bash
# Delete unused library files
rm src/lib/scheduler-new.ts
rm src/lib/bid-processor2.ts
rm artifacts/api-server/src/lib/scheduler-new.ts
rm artifacts/api-server/src/lib/bid-processor2.ts

# Delete unused scripts (all 17 files)
rm scripts/src/analyze-website.ts
rm scripts/src/check-bids.ts
rm scripts/src/check-markets.ts
# ... (see full list above)
```

### After Deletion - Clean Build Cache
```bash
# Rebuild TypeScript to remove compiled files
npm run build

# Clean node_modules if using pnpm (monorepo)
pnpm install
```

---

## Notes

- **No Breaking Changes Expected:** All deletions are unused files not referenced elsewhere
- **Backup First:** Consider git commit before bulk deletions
- **Test After:** Run full test suite after deletions to confirm nothing broke
- **Monorepo Check:** Verify duplicate `/src/` structure with your team before consolidating
