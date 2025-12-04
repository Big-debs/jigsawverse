# Gameplay Rules Test Guide

This document describes the new gameplay rules and provides manual test cases to verify the implementation.

## New Gameplay Rules

### 1. Placement & Turn Rules
- When a player (placer) places a piece, the opponent immediately has one action: CHECK or PASS
- Only a single CHECK or PASS is allowed (no placer-decision round)
- Turn validation enforced server-side: reject placements when currentTurn !== player
- Placement lock (isPlacementInProgress) prevents duplicate placements while a placement is unresolved
- After resolution (check or pass), placement lock is released and currentTurn is set to the CHECKER (opponent)
- No player may take two turns in a row

### 2. CHECK Outcome

#### CHECK Incorrect Piece
- **Condition**: Checker chooses CHECK and the piece is INCORRECT
- **Result**:
  - Checker gets +5 points
  - Piece removed from board and returned to the PLACER's rack
  - TURN goes to CHECKER
  - UI message: "Checker gained 5 points for catching an incorrect piece."

#### CHECK Correct Piece
- **Condition**: Checker chooses CHECK and the piece is CORRECT
- **Result**:
  - PLACER gets +10 points
  - Piece remains placed on board
  - TURN goes to CHECKER
  - UI message: "Placer awarded 10 points for a correct piece."

### 3. PASS Outcome

#### PASS Correct Piece
- **Condition**: Checker chooses PASS and the piece is CORRECT
- **Result**:
  - Immediate resolution: piece remains placed
  - TURN goes to CHECKER
  - No placer-decision state
  - UI message: "Opponent passed — piece was correct. Turn moves to opponent."

#### PASS Incorrect Piece
- **Condition**: Checker chooses PASS and the piece is INCORRECT
- **Result**:
  - Piece removed from board and returned to PLACER's rack
  - BOTH players penalized -3 points
  - TURN goes to CHECKER
  - UI message: "Both players penalized (-3). Piece removed and returned to placer."

### 4. Rack Behavior
- When a piece is removed, it must be returned to the original placer's rack
- Piece fills first null/undefined slot or is pushed to end of rack
- fillRack and switchTurn robustly handle null/undefined holes in racks

### 5. Scores & Persistence
- Scores are updated in-game logic
- Scores persisted to games table when the game ends (timer expiration or completion)
- Scores synced after each resolution to the DB via gameService.updateGame
- GameOverScreen shows final results from persisted data

## Manual Test Cases

### Test Case 1: CHECK Incorrect Piece
1. Player A places an incorrect piece at position X
2. Player B (checker) clicks "Check"
3. **Expected**:
   - Player B score increases by +5
   - Piece disappears from position X
   - Piece reappears in Player A's rack
   - Turn indicator shows Player B's turn
   - UI shows: "You gained 5 points for catching an incorrect piece!" (for Player B)
   - UI shows: "Opponent gained 5 points for catching an incorrect piece." (for Player A)

### Test Case 2: CHECK Correct Piece
1. Player A places a correct piece at position Y
2. Player B (checker) clicks "Check"
3. **Expected**:
   - Player A score increases by +10
   - Piece remains at position Y on the board
   - Turn indicator shows Player B's turn
   - UI shows: "Opponent gained 10 points for a correct piece." (for Player B)
   - UI shows: "You gained 10 points for a correct piece!" (for Player A)

### Test Case 3: PASS Correct Piece
1. Player A places a correct piece at position Z
2. Player B (checker) clicks "Pass"
3. **Expected**:
   - Piece remains at position Z on the board
   - No score changes
   - Turn indicator shows Player B's turn
   - No placer-decision prompt appears
   - UI shows: "Opponent passed — piece was correct. Turn moves to opponent."

### Test Case 4: PASS Incorrect Piece
1. Player A places an incorrect piece at position W
2. Player B (checker) clicks "Pass"
3. **Expected**:
   - Both Player A and Player B scores decrease by -3
   - Piece disappears from position W
   - Piece reappears in Player A's rack
   - Turn indicator shows Player B's turn
   - UI shows: "Both players penalized (-3). Piece removed and returned to placer."

### Test Case 5: Turn Validation
1. Player A places a piece
2. Player A tries to place another piece before Player B responds
3. **Expected**:
   - Second placement is rejected
   - Error message: "Not your turn" or "Placement in progress, please wait"
   - UI prevents interaction (grayed out or disabled)

### Test Case 6: Rack Refill
1. Player A uses all pieces in their rack
2. After a move is resolved, check Player A's rack
3. **Expected**:
   - Rack is automatically refilled from the piece pool
   - Rack has up to 10 pieces (or as many as remain in pool)
   - Null/undefined slots are properly handled

### Test Case 7: Timer End
1. Play a game until the timer reaches 0:00
2. **Expected**:
   - Game ends automatically
   - Final scores are persisted to the database
   - GameOverScreen displays with correct final scores
   - Winner is determined by highest score

### Test Case 8: Game Completion
1. Play a game until all pieces are placed or piece pool is empty
2. **Expected**:
   - Game ends automatically
   - Final scores are persisted to the database
   - GameOverScreen displays with correct final scores
   - Winner is determined by highest score

## Implementation Files Modified

1. **src/lib/gameLogic.js**
   - Added `returnPieceToRack(player, piece)` function
   - Updated `handleOpponentCheck(checker, checkDecision)` with new rules
   - Removed `handlePlacerCheck` method (no longer needed)
   - Turn validation and placement lock already present in `placePiece`

2. **src/lib/multiplayer.js**
   - Updated `respondToCheck` for both Host and Guest to persist all scores
   - Clears `awaiting_decision` after resolution

3. **src/components/JigsawVerseApp.jsx**
   - Updated `handlePlacement` to set `awaitingDecision` state
   - Updated `handleCheckDecision` to calculate score deltas and show friendly messages
   - Game end logic already persists final scores to database

## Point Values Summary

- **CHECK incorrect piece**: Checker +5 points
- **CHECK correct piece**: Placer +10 points  
- **PASS incorrect piece**: Both players -3 points
- **PASS correct piece**: No point changes

## Testing Checklist

- [ ] Test Case 1: CHECK Incorrect Piece
- [ ] Test Case 2: CHECK Correct Piece
- [ ] Test Case 3: PASS Correct Piece
- [ ] Test Case 4: PASS Incorrect Piece
- [ ] Test Case 5: Turn Validation
- [ ] Test Case 6: Rack Refill
- [ ] Test Case 7: Timer End
- [ ] Test Case 8: Game Completion
- [ ] Verify no player can place twice in a row
- [ ] Verify final scores are persisted to database
- [ ] Verify GameOverScreen shows correct final scores
