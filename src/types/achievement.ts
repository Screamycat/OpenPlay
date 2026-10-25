export interface Achievement {
  game_id: string;
  api_name: string;
  display_name: string;
  description?: string | null;
  icon_url: string;
  icon_gray_url?: string | null;
  is_unlocked: boolean;
  unlock_time?: string | null;
  rarity_percentage: number;
  is_secret: boolean;
}

export interface GameAchievementSummary {
  game_id: string;
  game_title: string;
  cover_image?: string | null;
  total_achievements: number;
  unlocked_achievements: number;
  completion_percentage: number;
  is_perfect: boolean;
  latest_unlocked?: Achievement | null;
  recent_unlocked: Achievement[];
  upcoming_locked: Achievement[];
}

export interface HunterProfile {
  level: number;
  total_score: number;
  current_level_xp: number;
  next_level_xp: number;
  level_progress_percent: number;
  total_achievements_count: number;
  unlocked_achievements_count: number;
  average_completion_percent: number;
  perfect_games_count: number;
  rarest_achievements: Achievement[];
  almost_there_games: GameAchievementSummary[];
  games_summaries: GameAchievementSummary[];
}
