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
