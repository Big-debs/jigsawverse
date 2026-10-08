# JigsawVerse

A real-time multiplayer jigsaw puzzle game with strategic gameplay.

## Features

- 🧩 **Custom Puzzles**: Upload any image and turn it into a puzzle
- 👥 **Real-Time Multiplayer**: Challenge friends in synchronized gameplay
- 🏆 **Competitive Scoring**: Strategic check/pass system with streak bonuses
- 📱 **Responsive Design**: Play on any device
- ✨ **Planar Match Prototype**: Shift complete wrapping rows and columns to create matches and cascading chains

## Tech Stack

- **Frontend**: React 18, Vite, TailwindCSS
- **Backend**: Supabase (PostgreSQL, Auth, Realtime, Storage)
- **Icons**: Lucide React

## Getting Started

### Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn
- Supabase account (for backend)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/Big-debs/jigsawverse.git
cd jigsawverse
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

4. Add your Supabase credentials to `.env.local`:
```
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

5. Start the development server:
```bash
npm run dev
```

## Project Structure

```
jigsawverse/
├── public/               # Static assets
├── src/
│   ├── components/       # React components
│   ├── config/           # Configuration files (Supabase)
│   ├── hooks/            # Custom React hooks
│   ├── lib/              # Core game logic
│   ├── services/         # API services
│   ├── App.jsx           # Main App component
│   ├── main.jsx          # Entry point
│   └── index.css         # Global styles
├── supabase/
│   └── migrations/       # Database migrations
├── index.html            # HTML template
├── package.json          # Dependencies
├── vite.config.js        # Vite configuration
├── tailwind.config.js    # Tailwind configuration
└── postcss.config.js     # PostCSS configuration
```

## Database Setup

Run the SQL migrations in your Supabase dashboard or using the Supabase CLI:

1. `supabase/migrations/20240101000000_initial_schema.sql` - Core database schema
2. `supabase/migrations/20240101000001_storage_buckets.sql` - Storage bucket policies

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Game Logic

The game consists of:

- **ImageProcessor**: Slices images into puzzle pieces
- **GameLogic**: Core game mechanics including scoring and turn management
- **Multiplayer**: Host/Guest game management with real-time synchronization
- **Planar Match Engine**: Independent 6×6 shift-and-match rules with wrapped edges, collapse/refill cascades, hints, scoring, and move limits

## License

MIT
