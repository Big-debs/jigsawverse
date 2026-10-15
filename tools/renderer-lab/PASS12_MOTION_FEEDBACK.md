# Living Atlas — Pass 12: Gameplay Motion and Feedback Laboratory

**Status:** Experimental preview implementation, not production gameplay. Both Assemble and Jigsawverse Planar included; standalone Planar-Cube excluded.

## Implemented

- `src/motionContract.js`: renderer-independent semantic cues derived from local *accepted* fixture actions. Assemble `select` and `place` cues contain only visible tile ID/cell, never correctness, hidden solution mappings or score. Planar `shift` cue uses line and direction only.
- `src/feedbackController.js`: accessible status text, muted-by-default synthesized sounds gated by user click, cancellation-aware storyboard. Respect OS reduced-motion preferences and permit sound opt-in/out.
- `src/threeScene.js`: short, neutral Assemble selection-lift animation derived from the semantic cue, canceled when the scene/piece is rebuilt; existing tile movement retains mode-specific motion.
- `src/main.js`: dedicated feedback row and Planar **illustrative** clear → drop → refill sequence. The storyboard is **not** a real match, does not change tile kinds or board arrays, and carries no competitive result.
- `tests/motion-contract.test.mjs`: safety contract, selected rack, accepted placement, Planar shift, deterministic storyboard boundaries and reduced-motion duration.

## UX and integrity rules

1. Board state is authoritative for visuals; renderer cues cannot validate or commit moves.
2. No correctness glow, floating score, opponent secret or award shown ahead of authorized reveal. Neutral selection/placement sound only.
3. A new cue cancels an earlier scripted storyboard. Reset or switching views also cancels the pending presentation.
4. OS reduced motion snaps ornamental motion; hints and usability must still work without animations.
5. Sound defaults to **off** and is activated by explicit user action. Avoid audio claims or third-party licensed recordings.
6. Lab Planar cascade sequence is a **non-mutating storyboard**. The real Planar match/clear/cascade engine must supply authorized animation events later. Never infer matches from the renderer's colors.
7. Standalone educational Planar-Cube is outside scope.

## Test record

- Five isolated Node contract checks for this pass were executed against the same motion logic with representative fixture state and **passed**. This is not a clean full GitHub branch test run.
- Full lab `npm ci && npm test && npm run build` has **not** been completed in the current tool environment because registry access was unavailable.
- Three.js browser motion and optional audio have **not** been verified on a device in this pass.

## Codex verification steps

1. Run clean install, complete current branch tests, and Vite build.
2. Test on real WebGL2 and Canvas2D at 390×844 and desktop. Click an Assemble rack tile, place it and inspect neutral cue text; verify no hidden score/correctness leak.
3. Shift one Planar row/column; confirm wrap animation settles at exactly the authoritative fixture positions. Repeated rapid shifting must interrupt safely.
4. Play the clearly labeled Planar storyboard, then reset or switch modes mid-sequence; ensure no stale status, mutation, or resource leak.
5. With OS reduced-motion enabled, selection and preview should snap without losing controls.
6. Start muted. Opt into audio after user gesture; verify control can mute again, and verify iOS Safari autoplay and suspended AudioContext behavior.
7. Compare rendering tiers and test 2D fallback/context loss, ensuring single active canvas and no duplicate feedback.
8. Test on budget Android, midrange Android and iOS Safari for p95 frame timing, input delay, audio, battery/heat, and readability.
9. For production integration, accept only authoritative game events. Actual Planar clears/refills must be emitted by real rules engine; ranked Assemble score reveal remains server-private.

**No existing production game, root dependencies, multiplayer protocol, Supabase code, or scoring logic modified.** This draft PR is stacked on Pass 11.
