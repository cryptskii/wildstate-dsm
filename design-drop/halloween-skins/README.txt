Halloween Creatures — corrected directional animations | 2026-10-10
Nine characters, each with 3x4 (768x1024) directional walking sheet + front-facing store art (384x384).
ROWS: front, left, right, back. COLS: walk stride A, passing pose, walk stride B. Each cell 256x256.
Original character artwork retained; facial direction and upper-body silhouettes standardized.
Opposite facing is a true mirrored side silhouette, not a blend of side and three-quarter views.
Stride motion is programmatic compositing of foot regions. For ghost: floating bobbing cycle.
Store art faces front. Transparent pixels are binary alpha; no semi-transparent edge artifacts.
Each frame checked for dimensions, opacity, populated pixels, containment, and meaningful visual movement.
Note: geometry/alpha checks are automated; visual game-engine motion QA is still required to approve polished animation.
See animation_preview.gif and QA.json.

Mummy update: assembled from individually selected opposite stride poses and
neutral poses. Complete side sprites are mirrored for the opposite facing;
no foot-region shifting. Review mummy-preview.html for the current mummy cycle.
The older preview.png and animation_preview.gif still show the earlier mummy.
Source frames and packing notes: art/mummy-walk/README.md.

Current profile correction: all nine third rows are exact horizontal mirrors
of the second row, frame by frame in the same column order. Verified from
saved PNG pixels; other rows preserved. See profile-mirror-QA.json.
Review creature-preview.html or the individual character preview pages.
The older preview.png and animation_preview.gif are historical.
