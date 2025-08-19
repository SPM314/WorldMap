# Remove inline dialog display override and add context‑menu auto‑hide

## Summary
- Fixes the Add/Edit Marker dialog not appearing by removing an inline display:none on #markerDialog so CSS .modal/.modal.active controls visibility.
- Improves UX by auto-hiding the custom context menu on outside click, ESC, and map interactions (move/zoom/click).

## Changes
- index.html: Removed inline display:none from #markerDialog.
- main.js: Added listeners to auto-hide the context menu on outside click, ESC, and map movestart/zoomstart/click.

## QA Checklist
- Right-click map → “Add marker here…” opens dialog; submitting adds marker and updates overlays/CSV.
- Right-click marker → “Edit marker…” opens dialog; submitting updates marker, popup, overlays, and CSV.
- Context menu hides on outside click, ESC, and map interactions.

## Notes
- No CSS changes required; .modal and .modal.active already control visibility.
- After deployment, hard-refresh the browser to avoid cached HTML/CSS (Shift+Reload).