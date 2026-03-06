-- Add confirmed boolean column to feed_posts for expense confirmation
ALTER TABLE feed_posts ADD COLUMN confirmed boolean DEFAULT false;
