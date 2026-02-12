# Text Panel Layout Redesign

## Overview

Change the TextPane layout from a vertical stack of text sections to a responsive split-pane layout:

- **2 groups**: Side-by-side (left/right) with a vertical divider/slider
- **3-4 groups**: 2x2 grid with a cross-shaped divider/slider
- **1 group**: Full area (no change from current behavior)
- **5+ groups**: Display only the first four groups

The dividers act as draggable sliders, allowing the user to resize panes interactively.

## Current Implementation

The TextPane ([text-pane.tsx](src/components/text-pane/text-pane.tsx)) currently:
1. Calculates total container height (pane height minus 36px title bar)
2. Divides height equally among all text sections: `sectionHeight = containerHeight / sectionCount`
3. Renders each `TextSection` in a vertical block layout (`.text-container { display: block }`)

Each `TextSection` ([text-section.tsx](src/components/text-pane/text-section.tsx)) is a flex column with a title bar and scrollable text content.

## Detailed Design

### Layout Rules

| Group Count | Layout | Divider |
|---|---|---|
| 1 | Full area | None |
| 2 | Two panes side-by-side (left/right) | Vertical bar (24px wide) |
| 3 | 2x2 grid (bottom-right quadrant empty) | Cross-shaped divider |
| 4 | 2x2 grid | Cross-shaped divider |
| 5+ | Show first 4 groups in 2x2 grid | Cross-shaped divider |

### Two-Pane Layout (2 groups)

```
+----------------+----+----------------+
|                |    |                |
|   Section 1    | || |   Section 2    |
|                |    |                |
+----------------+----+----------------+
                 24px
```

- Each section starts at 50% of available width
- The vertical slider (24px wide) between them is draggable left/right
- Dragging adjusts the width split (e.g., 30%/70%)
- Both sections take the full available height
- The slider displays `drag-thumb-icon.svg` at its center

### Four-Pane Layout (3-4 groups)

```
+----------------+----+----------------+
|                |    |                |
|   Section 1    |    |   Section 2    |
|                |    |                |
+----+-----------+----+-----------+----+
|    |                             |    |
+----+-----------+----+-----------+----+
|                |    |                |
|   Section 3    |    |   Section 4    |
|                |    |                |
+----------------+----+----------------+
                 24px
         24px horizontal bar
```

- Each section starts at 25% of available area (50% width, 50% height)
- The cross-shaped divider consists of:
  - A **horizontal bar** (24px tall, full width) controlling the vertical split
  - A **vertical bar** (24px wide, full height) controlling the horizontal split
  - A **center handle** (24px x 24px intersection) that controls both simultaneously
- Dragging the horizontal bar adjusts the top/bottom height ratio
- Dragging the vertical bar adjusts the left/right width ratio
- Dragging the center handle adjusts both ratios simultaneously
- With 3 groups, the bottom-right quadrant is empty

### Slider Styling

All slider bars share the following base styles:

| Property | Default | Hover | Dragging |
|---|---|---|---|
| Background | `#eee` | `#e8e8e8` | `#cfcfcf` |
| Border | `solid 1px #cacaca` | `solid 1px #cacaca` | `solid 1px #cacaca` |

**Cursors:**
- Vertical bar: `col-resize`
- Horizontal bar: `row-resize`
- Center handle: `move`

**Central accent lines:**
- Each bar has a thin `#177991` line along its center axis:
  - Vertical bar: a vertical line centered horizontally
  - Horizontal bar: a horizontal line centered vertically
  - Cross: both lines
- Lines end 18px from each end of the bar (i.e., 18px inset from top/bottom or left/right edges)

**Grip icon ([drag-thumb-icon.svg](src/assets/drag-thumb-icon.svg)):**
- **Two-pane vertical slider**: one `drag-thumb-icon.svg` centered in the bar
- **Cross center handle**: two copies of `drag-thumb-icon.svg` overlaid at center, one at default orientation (vertical dots), one rotated 90 degrees (horizontal dots)

**Cross hover behavior:**
- Hovering over the **vertical part** of the cross highlights the entire vertical bar including the center handle (all change to `#e8e8e8`)
- Hovering over the **horizontal part** of the cross highlights the entire horizontal bar including the center handle
- Hovering over the **center handle** highlights the entire cross (all bars change to `#e8e8e8`)
- During drag, the same zones apply but use the dragging color (`#cfcfcf`)

### Ordering of Sections

Sections are placed in this order:
1. Top-left (or left for 2-pane)
2. Top-right (or right for 2-pane)
3. Bottom-left
4. Bottom-right

The existing sort order (target label section first) is preserved.

### Title Bar

The TextPane title bar (36px, shows "Selected [attributes] in [dataset]") remains above the full layout, unchanged.

## Implementation Steps

### Phase 1: Resizable Divider Component

Create a new divider component with full drag behavior and styling.

**New file: `src/components/text-pane/pane-divider.tsx`**

Create a `PaneDivider` component that:
- Accepts props:
  - `orientation: "vertical" | "cross"` — vertical for 2-pane layout, cross for 3-4 pane layout
  - `containerWidth: number` — pixel width of the text container
  - `containerHeight: number` — pixel height of the text container
  - `horizontalSplitRatio: number` — current left/right ratio (0-1)
  - `verticalSplitRatio: number` — current top/bottom ratio (0-1, only used for cross)
  - `onHorizontalRatioChange: (ratio: number) => void`
  - `onVerticalRatioChange: (ratio: number) => void`
- For `"vertical"`: renders a 24px-wide full-height bar positioned at `horizontalSplitRatio * (containerWidth - 24)` from the left. Listens for horizontal mouse drag to update `horizontalSplitRatio`.
- For `"cross"`: renders the full cross overlay:
  - A vertical bar (24px wide, full container height) positioned at the horizontal split point
  - A horizontal bar (24px tall, full container width) positioned at the vertical split point
  - The center handle is the intersection area
  - On mousedown, determines which zone was clicked (vertical bar, horizontal bar, or center) and constrains drag accordingly:
    - Vertical bar click: only updates `horizontalSplitRatio`
    - Horizontal bar click: only updates `verticalSplitRatio`
    - Center handle click: updates both
- Tracks drag state (`idle`, `hovering-vertical`, `hovering-horizontal`, `hovering-center`, `dragging-vertical`, `dragging-horizontal`, `dragging-center`) for styling
- Uses `mousedown`/`mousemove`/`mouseup` event listeners (attached to `document` during drag for smooth tracking)
- Applies `user-select: none` to the body during drag to prevent text selection
- Clamps ratios to `[0.15, 0.85]`

**New file: `src/components/text-pane/pane-divider.scss`**

Style the divider with:
- Base background `#eee`, hover `#e8e8e8`, dragging `#cfcfcf`
- Border: `solid 1px #cacaca`
- Central `#177991` accent lines (18px inset from edges)
- `drag-thumb-icon.svg` centered (one for vertical, two overlaid for cross center)
- Appropriate cursors per zone
- Cross hover zones: vertical hover highlights vertical + center, horizontal hover highlights horizontal + center, center hover highlights all

### Phase 2: Update TextPane Layout

Refactor `TextPane` to use the new layout system.

**File: [src/components/text-pane/text-pane.tsx](src/components/text-pane/text-pane.tsx)**

1. Add React state (via `useState` in the component or class-level state):
   - `horizontalSplitRatio: number` initialized to `0.5`
   - `verticalSplitRatio: number` initialized to `0.5`
   - These are ephemeral — they reset on remount, no persistence needed
2. Track container width in addition to the existing container height (the existing `ResizeObserver` already measures the container)
3. Determine layout mode based on `textStore.textSections.length`:
   - 1 section: single pane (current behavior, full width/height)
   - 2 sections: two-pane side-by-side layout
   - 3+ sections: four-pane grid layout (cap at 4 sections)
4. Replace the current simple vertical stack rendering in `.text-container` with layout-specific rendering:
   - **Single pane**: One `TextSection` at full size (full container width and height)
   - **Two-pane**: Position two `TextSection` components and a vertical `PaneDivider` using absolute positioning or flex row. Calculate widths:
     - Left width = `horizontalSplitRatio * (containerWidth - 24)`
     - Right width = `(1 - horizontalSplitRatio) * (containerWidth - 24)`
     - Both sections get full container height
   - **Four-pane**: Position four `TextSection` components and a cross `PaneDivider`. Calculate dimensions:
     - Left column width = `horizontalSplitRatio * (containerWidth - 24)`
     - Right column width = `(1 - horizontalSplitRatio) * (containerWidth - 24)`
     - Top row height = `verticalSplitRatio * (containerHeight - 24)`
     - Bottom row height = `(1 - verticalSplitRatio) * (containerHeight - 24)`
5. Pass calculated pixel widths/heights to each `TextSection` via style props
6. Remove the old equal-height-per-section calculation

### Phase 3: Update TextSection for Width Flexibility

**File: [src/components/text-pane/text-section.tsx](src/components/text-pane/text-section.tsx)**

1. Accept both `width` and `height` as optional style props (currently only uses `height`)
2. Apply both dimensions to the section container via inline styles
3. Ensure the section content adapts to variable widths (text wrapping, scrolling)

### Phase 4: Update Styles

**File: [src/components/text-pane/text-pane.scss](src/components/text-pane/text-pane.scss)**

1. Update `.text-container` styles:
   - Change to `position: relative` to support absolute positioning of the divider overlay and pane quadrants
   - Remove `display: block`
2. Add layout-specific class names (e.g., `.text-container--two-pane`, `.text-container--four-pane`) if needed

**File: [src/components/text-pane/text-section.scss](src/components/text-pane/text-section.scss)**

1. Ensure sections work at any width (not just full container width)
2. Add `overflow: hidden` on the outer section container to prevent layout blowout
3. Ensure `.text-section-title` text truncates or wraps gracefully at narrow widths

### Phase 5: Testing

1. **Unit tests** for `PaneDivider`:
   - Renders correct orientation (vertical vs cross)
   - Mouse drag events compute and report correct ratios
   - Ratios are clamped to [0.15, 0.85]
2. **Visual/manual testing**:
   - 1 group: full pane, no divider
   - 2 groups: side-by-side, vertical slider works, drag-thumb-icon visible
   - 3 groups: 2x2 grid with empty bottom-right, cross slider works
   - 4 groups: 2x2 grid, cross slider works
   - Drag each part of the cross independently and confirm correct axis is affected
   - Drag center handle and confirm both axes move
   - Hover states: verify correct zones highlight (vertical hover = vertical + center, etc.)
   - Verify no text selection during drag
   - Verify accent lines and grip icons render correctly

## Questions

Q: For the 3-group case, which quadrant should be empty — bottom-right, or should the 3 groups be arranged differently (e.g., 2 on top, 1 centered on bottom)?
A: Bottom right is empty

Q: Should the split ratios reset to 50/50 when the number of groups changes (e.g., user goes from 2 groups to 4 groups), or should they persist?
A: Persist

Q: For the divider grip affordance, should there be a visual indicator (e.g., three small dots or lines in the center of each bar) to hint that it's draggable, or just the plain gray bar?
A: drag-thumb-icon.svg shows three dots

Q: The current TextPane title bar (36px, shows "Selected [attributes] in [dataset]") sits above the entire text container. Should it remain above the full layout, or should each pane get its own title bar? (Note: each TextSection already has its own section title showing actual/predicted labels.)
A: Keep it unchanged

Q: Should there be minimum pane sizes enforced (the spec currently clamps ratios to 0.15-0.85)? Is that range acceptable, or should the min/max be different?
A: 0.15-0.85 is good

Q: When there are 5+ groups (which can happen with the 3x3 actual/predicted matrix), what layout should be used? Should we cap at 4 visible panes, or add additional rows?
A: Only four groups are possible. If there are more, it's fine to just display four for now.

Q: For the two-pane layout, you described a "vertical slider" (24px wide bar between two side-by-side panes). Should this slider also display the `drag-thumb-icon.svg` grip icon, and should it have the same `#177991` accent line? Or only the accent line?
A: Both the icon and the accent line.

Q: For the cross layout, the horizontal bar and vertical bar each get a `#177991` accent line. Should the vertical bar (outside the center handle area) also display a `drag-thumb-icon.svg`, or is the icon only at the cross center and on the standalone vertical slider?
A: Icon only at the cross center and the standalone vertical slider (2-pane mode). The accent lines are sufficient affordance for the cross arms.
