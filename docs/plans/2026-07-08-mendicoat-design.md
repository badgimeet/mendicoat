# Mendicoat — Game Design Document
> Approved: 2026-07-08

## Overview
Mendicoat (also known as Mendikot/Dehla Pakad) is a classic Indian trick-taking card game played in teams. This document captures the approved design for the web-based multiplayer implementation.

## Game Rules

### Player Count & Deck
| Players | Teams | Cards Each | Deck |
|---------|-------|-----------|------|
| 4 | 2×2 | 13 | Full 52-card deck |
| 6 | 2×3 | 8 | Remove all four 2s → 48 cards |
| 8 | 2×4 | 6 | Remove all four 2s → 48 cards |

### Card Ranking
A (high) → K → Q → J → 10 → 9 → 8 → 7 → 6 → 5 → 4 → 3 → 2 (low)

### Trump (Hukum)
- **Cut Mode (Open)**: No trump chosen initially. When a player cannot follow the led suit, the first card played off-suit becomes the trump for the rest of the game.

### Gameplay
1. Cards are dealt equally to all players
2. Player to dealer's right leads the first trick
3. Play proceeds clockwise
4. Players MUST follow the led suit if they have it
5. If unable to follow suit, any card can be played (first off-suit triggers trump reveal in Cut Mode)
6. Highest trump wins the trick; otherwise highest card of led suit wins
7. Trick winner leads next trick

### Scoring
- Team that wins 7+ tricks → **1 point**
- Team that captures all four 10s (Mendikot) → **2 points**
- Losing team → **0 points**
- First team to **7 points** wins the match

## Architecture

### Stack
- **Backend**: Node.js + Express + Socket.io
- **Frontend**: Vanilla HTML5 + CSS3 + JavaScript + Socket.io client
- **State**: In-memory (no database needed for v1)

### Communication
All game state flows through WebSocket events via Socket.io. REST endpoints are only used for static file serving.

## UI Theme

### Monochrome Modern
- Background: Deep black `#0a0a0a`
- Table surface: Dark charcoal `#111` with subtle linen texture
- Cards: White with sharp black suits; Hearts/Diamonds in cool red `#e63946`
- Typography: `Inter` (Google Fonts)
- Panels: Glassmorphism (frosted dark glass, `backdrop-filter: blur`)
- Special: 10s (Mendis) show gold shimmer border `#f5c518` when played
- Animations: Smooth card slide-in, flip reveal for trump, pulse on active player

## Room System
- Host creates room → 6-character room code generated
- Players join with code + display name
- Host selects player count (4/6/8) and assigns teams
- Game starts when all seats filled
- 60-second reconnect window on disconnect

## Project Structure
```
Mendicoat/
├── docs/plans/
│   └── 2026-07-08-mendicoat-design.md
├── server/
│   ├── index.js          # Express + Socket.io server entry
│   ├── gameEngine.js     # Pure game logic (deck, tricks, scoring)
│   └── roomManager.js    # Room lifecycle, player connections
├── client/
│   ├── index.html        # SPA shell
│   ├── css/style.css     # Full design system + animations
│   └── js/
│       ├── app.js        # State + screen routing
│       ├── socket.js     # Socket.io client events
│       └── ui.js         # Card rendering, table layout, animations
├── package.json
└── README.md
```
