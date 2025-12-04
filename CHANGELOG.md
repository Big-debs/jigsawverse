# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed - Gameplay Rules Update

#### Summary
Major overhaul of the gameplay check/pass mechanism to simplify the flow and improve fairness. The new rules eliminate the placer-decision round, making the game faster and more strategic.

#### New Rules

**Placement & Turn Flow:**
- When a player places a piece, the opponent must immediately decide: CHECK or PASS
- Only a single CHECK or PASS is allowed per placement (no placer-decision round)
- Server-side turn validation prevents out-of-turn placements
- Placement lock prevents duplicate placements during resolution
- After resolution, turn always goes to the CHECKER (opponent)
- No player may take two consecutive turns

**CHECK Outcomes:**
- CHECK incorrect piece: Checker +5 points, piece removed and returned to placer's rack, turn to checker
- CHECK correct piece: Placer +10 points, piece stays placed, turn to checker

**PASS Outcomes:**
- PASS correct piece: Piece stays placed, turn to checker (immediate resolution, no placer decision)
- PASS incorrect piece: Piece removed and returned to placer's rack, both players -3 points, turn to checker

**Point Values:**
- Checker reward for catching incorrect piece: +5
- Placer reward for correct piece when checked: +10
- Penalty on PASS & incorrect: both players -3

#### Technical Changes

**src/lib/gameLogic.js:**
- Added `returnPieceToRack(player, piece)` function to return pieces to original placer's rack
- Completely rewrote `handleOpponentCheck(checker, checkDecision)` to implement new rules
- Removed `handlePlacerCheck` method (no longer needed)
- Enhanced `fillRack` to robustly handle null/undefined slots
- Turn validation and placement lock already present in `placePiece` method

**src/lib/multiplayer.js:**
- Updated `respondToCheck` for both Host and Guest to persist both players' scores
- Clears `awaiting_decision` after resolution (no more placer_check state)
- Parallel database updates for better performance

**src/components/JigsawVerseApp.jsx:**
- Updated `handlePlacement` to set `awaitingDecision` state and show waiting message
- Enhanced `handleCheckDecision` to calculate score deltas and display user-friendly messages
- Messages show "You gained X points" or "Opponent gained X points" based on local player
- Game end logic persists final scores to database when timer expires or game completes

#### Database Schema
- `awaiting_decision` column usage: 'opponent_check' after placement; cleared after resolution
- Scores synced to database after each resolution via `gameService.updateGame`
- Final scores persisted when game ends (completion or timer expiration)

#### UI/UX Improvements
- Real-time score delta display after each resolution
- Friendly messages based on local player perspective
- Clear turn indicators prevent confusion
- Check/Pass buttons clearly labeled with point rewards

#### Testing
See `GAMEPLAY_RULES_TEST.md` for comprehensive manual test cases covering:
- All CHECK and PASS outcomes
- Turn validation and placement lock
- Rack refill behavior
- Score persistence
- Game end scenarios

### Migration Notes
No database migrations required. The changes are backward compatible with existing game records.

---

## [1.0.0] - Previous Release
- Initial release with basic gameplay mechanics
