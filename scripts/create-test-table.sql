-- Create a simple test table to verify writes are working
-- You can delete this table after testing

-- Create the test table
CREATE TABLE IF NOT EXISTS test_write_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Test INSERT (this should work now!)
INSERT INTO test_write_access (test_message) 
VALUES ('Database is writable! ✅');

-- Verify it worked
SELECT * FROM test_write_access;

-- When you're done testing, delete the table:
-- DROP TABLE test_write_access;
