# Model 7: two marked wooden inner tabs

Only the two left inner tabs marked in the user's screenshot were reconstructed. Their final engraved contours are equal 45-degree rectangles, 11.31 pixels long and 5.66 pixels wide, with a 1.25-pixel antialiased stroke. Original local wood texture is retained by sampling the unpainted center. Exact protected pixels in all outer crosses and four red motifs are excluded from every write, as are all four central diamonds.

Image editing workflow: built-in ImageGen produced a reference, then the two small rectangular contours were rectified at native resolution. The generated full image was never installed as a production image. All project pixel edits were constrained to the two small boxes in `edit-scope.json`.

Prompt: “Precise object edit of this wooden engraved medallion. Keep exact framing, dimensions and all artwork. Fix ONLY two tiny WOOD-colored inner stubs LEFT of center: upper stub around image coordinate (258,245) immediately ABOVE the left diamond, and lower stub around (259,378) BELOW the left diamond. Reconstruct these as straight-sided slender rectangular engraved wooden tabs, tilted along their existing direction, with clean near-square corners and thin dark brown engraved outline matching adjacent artwork. Keep natural wood texture inside both tabs. Remove their notched/jagged appearance. Do not alter any red paint pixel, the four red star motifs, any of the four wooden diamond holes, the central wood area beyond these two very small tabs, or other engraved outlines. No new text. Pixel-aligned same composition, no zoom or crop.”

Files: `before.png` and `after.png` show the same 236×215 native pixel crop enlarged 3×. These are controlled offline compositing previews, not browser screenshots. Original asset snapshots and the baseline hashes of Models 1–13 are stored here for regression checks.

The two wooden interiors and tiny adjacent disconnected remnants were excluded from region-7, leaving it connected with 4,491 pixels. All other region masks are byte-identical. Region IDs, grouping and renderer code are unchanged.

Verification: 51 tests passed, including exact scope/pixel preservation, intentional holes, region connectivity, model routing, paint behavior and other model hashes.
