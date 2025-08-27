-- Create Topics Table for hybrid approach
CREATE TABLE topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  category VARCHAR NOT NULL CHECK (category IN (
    'general',           -- General conversation, small talk, casual topics
    'daily_life',        -- Basic communication, family, home, routines, weather
    'travel',            -- Airport, hotels, transportation, tourism
    'shopping',          -- Grocery, clothing, banking, commerce
    'food',              -- Restaurants, cooking, dietary preferences
    'health',            -- Medical, pharmacy, fitness, emergencies
    'professional',      -- Work, interviews, meetings, business communication
    'education',         -- School, learning, books, exams
    'social',            -- Friends, entertainment, hobbies, celebrations
    'technology',        -- Internet, phones, computers, social media
    'culture'            -- Customs, traditions, history, current events
  )),
  parent_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX idx_topics_category ON topics(category);
CREATE INDEX idx_topics_parent_id ON topics(parent_id);
CREATE INDEX idx_topics_is_active ON topics(is_active);
CREATE INDEX idx_topics_name ON topics(name);

INSERT INTO topics (name, category) VALUES
  -- Daily Life & Basic Communication
  ('Introductions & Greetings', 'daily_life'),
  ('Family & Relationships', 'daily_life'),
  ('Home & Living', 'daily_life'),
  ('Daily Routines', 'daily_life'),
  ('Weather & Seasons', 'daily_life'),
  ('Time & Dates', 'daily_life'),
  
  -- Travel & Transportation
  ('Airport & Flying', 'travel'),
  ('Hotels & Accommodation', 'travel'),
  ('Directions & Navigation', 'travel'),
  ('Public Transportation', 'travel'),
  ('Tourist Activities', 'travel'),
  ('Customs & Immigration', 'travel'),
  
  -- Shopping & Commerce
  ('Grocery Shopping', 'shopping'),
  ('Clothing & Fashion', 'shopping'),
  ('Banking & Money', 'shopping'),
  ('Bargaining & Prices', 'shopping'),
  ('Online Shopping', 'shopping'),
  
  -- Food & Dining
  ('Restaurant Dining', 'food'),
  ('Ordering Food', 'food'),
  ('Cooking & Recipes', 'food'),
  ('Food Preferences', 'food'),
  ('Dietary Restrictions', 'food'),
  
  -- Health & Wellness
  ('Medical Appointments', 'health'),
  ('Pharmacy & Medicine', 'health'),
  ('Body Parts & Symptoms', 'health'),
  ('Emergency Situations', 'health'),
  ('Fitness & Exercise', 'health'),
  
  -- Work & Professional
  ('Job Interviews', 'professional'),
  ('Office Communication', 'professional'),
  ('Business Meetings', 'professional'),
  ('Phone Calls & Emails', 'professional'),
  ('Presentations', 'professional'),
  
  -- Education & Learning
  ('School & University', 'education'),
  ('Language Learning', 'education'),
  ('Books & Reading', 'education'),
  ('Exams & Tests', 'education'),
  
  -- Social & Entertainment
  ('Making Friends', 'social'),
  ('Hobbies & Interests', 'social'),
  ('Movies & TV Shows', 'social'),
  ('Music & Concerts', 'social'),
  ('Sports & Games', 'social'),
  ('Celebrations & Holidays', 'social'),
  
  -- Technology & Communication
  ('Phone & Internet', 'technology'),
  ('Social Media', 'technology'),
  ('Computer Problems', 'technology'),
  
  -- Cultural & Society
  ('Local Customs', 'culture'),
  ('History & Traditions', 'culture'),
  ('Religion & Beliefs', 'culture'),
  ('Current Events', 'culture');
  ('General Conversation', 'general');

-- Enable Row Level Security (RLS)
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies for topics table
-- Allow all users to read topics (they're reference data)
CREATE POLICY "Everyone can view topics" ON topics
  FOR SELECT USING (true);

-- Only authenticated users can suggest new topics (for future admin features)
CREATE POLICY "Authenticated users can suggest topics" ON topics
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');