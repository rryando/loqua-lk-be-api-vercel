-- Insert sample data for testing
INSERT INTO users (user_id, email, display_name) VALUES
  ('test-user-1', 'test@example.com', 'Test User'),
  ('demo-user', 'demo@example.com', 'Demo User');

INSERT INTO user_contexts (user_id) VALUES
  ('test-user-1'),
  ('demo-user');

-- Sample learning session
INSERT INTO learning_sessions (
  user_id, 
  session_id, 
  duration_minutes, 
  topics_covered, 
  new_vocabulary, 
  grammar_points,
  overall_performance
) VALUES (
  'test-user-1',
  'sample-session-1',
  25,
  ARRAY['greetings', 'food'],
  ARRAY['こんにちは', 'ありがとう', 'すし'],
  ARRAY['は particle', 'です ending'],
  'Great progress with basic greetings!'
);

-- Sample achievements
INSERT INTO achievements (user_id, achievement_id, title, description) VALUES
  ('test-user-1', 'first_session', 'First Session', 'Completed your first Japanese lesson!'),
  ('test-user-1', 'pronunciation_star', 'Pronunciation Star', 'Excellent pronunciation practice!');