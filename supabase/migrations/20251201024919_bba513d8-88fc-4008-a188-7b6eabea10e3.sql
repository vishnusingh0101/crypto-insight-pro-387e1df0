-- Create storage bucket for market data cache
INSERT INTO storage.buckets (id, name, public)
VALUES ('market-cache', 'market-cache', true);

-- Allow public read access to cached market data
CREATE POLICY "Public can read cached market data"
ON storage.objects FOR SELECT
USING (bucket_id = 'market-cache');

-- Allow service role to write cached market data
CREATE POLICY "Service role can write cached market data"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'market-cache');

-- Allow service role to update cached market data
CREATE POLICY "Service role can update cached market data"
ON storage.objects FOR UPDATE
USING (bucket_id = 'market-cache');