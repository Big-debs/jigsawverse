-- =====================================================
-- SUPABASE DATABASE SCHEMA FOR JIGSAWVERSE
-- File: supabase/migrations/20240101000000_initial_schema.sql
-- =====================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- PROFILES TABLE (extends auth.users)
-- =====================================================

CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  is_anonymous BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Public profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- =====================================================
-- USER STATS TABLE
-- =====================================================

CREATE TABLE public.user_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  games_played INTEGER DEFAULT 0,
  games_won INTEGER DEFAULT 0,
  games_lost INTEGER DEFAULT 0,
  games_tied INTEGER DEFAULT 0,
  total_score INTEGER DEFAULT 0,
  best_streak INTEGER DEFAULT 0,
  best_accuracy DECIMAL(5,2) DEFAULT 0,
  total_playtime_seconds INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own stats"
  ON public.user_stats FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own stats"
  ON public.user_stats FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own stats"
  ON public.user_stats FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- IMAGES TABLE
-- =====================================================

CREATE TABLE public.images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  storage_url TEXT NOT NULL,
  category TEXT DEFAULT 'custom',
  grid_size INTEGER NOT NULL,
  is_public BOOLEAN DEFAULT FALSE,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public images are viewable by everyone"
  ON public.images FOR SELECT
  USING (is_public = true OR auth.uid() = uploaded_by);

CREATE POLICY "Users can upload images"
  ON public.images FOR INSERT
  WITH CHECK (auth.uid() = uploaded_by);

CREATE POLICY "Users can update own images"
  ON public.images FOR UPDATE
  USING (auth.uid() = uploaded_by);

CREATE POLICY "Users can delete own images"
  ON public.images FOR DELETE
  USING (auth.uid() = uploaded_by);

-- =====================================================
-- GAMES TABLE
-- =====================================================

CREATE TYPE game_status AS ENUM ('waiting', 'active', 'paused', 'completed', 'abandoned');
CREATE TYPE game_mode AS ENUM ('single_player', 'multiplayer', 'tournament');

CREATE TABLE public.games (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  host_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  game_code TEXT UNIQUE,
  status game_status DEFAULT 'waiting',
  mode game_mode DEFAULT 'multiplayer',
  
  -- Settings
  grid_size INTEGER NOT NULL,
  time_limit INTEGER, -- in seconds
  image_id UUID REFERENCES public.images(id),
  
  -- Players
  player_a_id UUID REFERENCES public.profiles(id),
  player_a_name TEXT,
  player_a_score INTEGER DEFAULT 0,
  player_a_accuracy DECIMAL(5,2) DEFAULT 100,
  player_a_streak INTEGER DEFAULT 0,
  
  player_b_id UUID REFERENCES public.profiles(id),
  player_b_name TEXT,
  player_b_score INTEGER DEFAULT 0,
  player_b_accuracy DECIMAL(5,2) DEFAULT 100,
  player_b_streak INTEGER DEFAULT 0,
  
  -- Game state
  current_turn TEXT, -- 'playerA' or 'playerB'
  winner TEXT, -- 'playerA', 'playerB', or 'tie'
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view games they're in"
  ON public.games FOR SELECT
  USING (
    auth.uid() = host_id OR 
    auth.uid() = player_a_id OR 
    auth.uid() = player_b_id OR
    status = 'waiting'
  );

CREATE POLICY "Users can create games"
  ON public.games FOR INSERT
  WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Players can update their games"
  ON public.games FOR UPDATE
  USING (
    auth.uid() = host_id OR 
    auth.uid() = player_a_id OR 
    auth.uid() = player_b_id
  );

-- Index for finding open games
CREATE INDEX idx_games_status ON public.games(status) WHERE status = 'waiting';
CREATE INDEX idx_games_code ON public.games(game_code);

-- =====================================================
-- GAME_STATE TABLE (for real-time gameplay)
-- =====================================================

CREATE TABLE public.game_state (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id UUID REFERENCES public.games(id) ON DELETE CASCADE NOT NULL UNIQUE,
  
  -- Grid state (stored as JSONB for flexibility)
  grid JSONB NOT NULL DEFAULT '[]',
  
  -- Player racks
  player_a_rack JSONB NOT NULL DEFAULT '[]',
  player_b_rack JSONB NOT NULL DEFAULT '[]',
  
  -- Piece pool
  piece_pool JSONB NOT NULL DEFAULT '[]',
  
  -- All pieces data
  pieces JSONB NOT NULL DEFAULT '[]',
  
  -- Current game state
  current_turn TEXT DEFAULT 'playerA',
  timer_remaining INTEGER,
  
  -- Pass/Check flow
  pending_check JSONB,
  awaiting_decision TEXT, -- 'opponent_check', 'placer_check', null
  
  -- Move history
  move_history JSONB DEFAULT '[]',
  
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.game_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can view game state"
  ON public.game_state FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.games 
      WHERE games.id = game_state.game_id 
      AND (
        auth.uid() = games.host_id OR 
        auth.uid() = games.player_a_id OR 
        auth.uid() = games.player_b_id
      )
    )
  );

CREATE POLICY "Players can update game state"
  ON public.game_state FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.games 
      WHERE games.id = game_state.game_id 
      AND (
        auth.uid() = games.host_id OR 
        auth.uid() = games.player_a_id OR 
        auth.uid() = games.player_b_id
      )
    )
  );

CREATE POLICY "Host can insert game state"
  ON public.game_state FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.games 
      WHERE games.id = game_state.game_id 
      AND auth.uid() = games.host_id
    )
  );

-- =====================================================
-- PLAYER PRESENCE TABLE
-- =====================================================

CREATE TABLE public.player_presence (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  game_id UUID REFERENCES public.games(id) ON DELETE CASCADE,
  is_online BOOLEAN DEFAULT TRUE,
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.player_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view presence"
  ON public.player_presence FOR SELECT
  USING (true);

CREATE POLICY "Users can update own presence"
  ON public.player_presence FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own presence"
  ON public.player_presence FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to generate unique game code
CREATE OR REPLACE FUNCTION generate_game_code()
RETURNS TEXT AS $$
DECLARE
  code TEXT;
  done BOOLEAN;
BEGIN
  done := FALSE;
  WHILE NOT done LOOP
    code := upper(substr(md5(random()::text), 1, 6));
    done := NOT EXISTS(SELECT 1 FROM public.games WHERE game_code = code);
  END LOOP;
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_stats_updated_at BEFORE UPDATE ON public.user_stats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_games_updated_at BEFORE UPDATE ON public.games
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_game_state_updated_at BEFORE UPDATE ON public.game_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger to set game_code on insert
CREATE OR REPLACE FUNCTION set_game_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.game_code IS NULL THEN
    NEW.game_code := generate_game_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER games_set_code BEFORE INSERT ON public.games
  FOR EACH ROW EXECUTE FUNCTION set_game_code();

-- Function to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  
  INSERT INTO public.user_stats (user_id)
  VALUES (NEW.id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call handle_new_user on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- INDEXES for Performance
-- =====================================================

CREATE INDEX idx_profiles_username ON public.profiles(username);
CREATE INDEX idx_user_stats_user_id ON public.user_stats(user_id);
CREATE INDEX idx_images_uploaded_by ON public.images(uploaded_by);
CREATE INDEX idx_images_category ON public.images(category) WHERE is_public = true;
CREATE INDEX idx_games_host_id ON public.games(host_id);
CREATE INDEX idx_games_player_ids ON public.games(player_a_id, player_b_id);
CREATE INDEX idx_game_state_game_id ON public.game_state(game_id);
CREATE INDEX idx_player_presence_user_id ON public.player_presence(user_id);
CREATE INDEX idx_player_presence_game_id ON public.player_presence(game_id);

-- =====================================================
-- ENABLE REALTIME
-- =====================================================

-- Enable realtime for tables that need it
ALTER PUBLICATION supabase_realtime ADD TABLE public.games;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_state;
ALTER PUBLICATION supabase_realtime ADD TABLE public.player_presence;