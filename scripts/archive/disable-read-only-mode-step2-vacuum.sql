-- STEP 2: Reclaim Space with VACUUM (OPTIONAL)
-- Run this in a SEPARATE query after Step 1
-- VACUUM cannot run inside a transaction block, so it must be run separately
-- Only run this if you've deleted data and want to reclaim space

VACUUM;
