#!/usr/bin/env node
/**
 * Query Supabase database via API
 * Usage: node scripts/query-db.js "SELECT * FROM profiles LIMIT 5;"
 */

require('dotenv').config({ path: '.env.local' })

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function runQuery(query) {
  try {
    // For SELECT queries, use RPC or direct table access
    if (query.trim().toUpperCase().startsWith('SELECT')) {
      // Try to extract table name and columns
      const match = query.match(/SELECT\s+(.+?)\s+FROM\s+(\w+)/i)
      if (match) {
        const columns = match[1].trim()
        const table = match[2].trim()
        
        let queryBuilder = supabase.from(table).select(columns === '*' ? '*' : columns)
        
        // Handle WHERE clauses
        const whereMatch = query.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|$)/i)
        if (whereMatch) {
          const whereClause = whereMatch[1].trim()
          // Simple WHERE parsing - you may need to extend this
          console.log('⚠️  WHERE clauses need manual implementation')
        }
        
        // Handle LIMIT
        const limitMatch = query.match(/LIMIT\s+(\d+)/i)
        if (limitMatch) {
          queryBuilder = queryBuilder.limit(parseInt(limitMatch[1]))
        }
        
        const { data, error } = await queryBuilder
        
        if (error) throw error
        return data
      }
    }
    
    // For other queries, use RPC (requires a function in Supabase)
    console.log('⚠️  Complex queries require Supabase RPC functions')
    console.log('💡 For raw SQL, use Supabase Dashboard SQL Editor or psql')
    return null
  } catch (error) {
    console.error('❌ Query error:', error.message)
    throw error
  }
}

// Get query from command line
const query = process.argv[2]

if (!query) {
  console.log('Usage: node scripts/query-db.js "SELECT * FROM profiles LIMIT 5;"')
  console.log('')
  console.log('Note: This script has limited SQL support.')
  console.log('For complex queries, use:')
  console.log('  1. Supabase Dashboard SQL Editor (recommended)')
  console.log('  2. psql with database password')
  process.exit(1)
}

runQuery(query)
  .then(data => {
    if (data) {
      console.log(JSON.stringify(data, null, 2))
    }
  })
  .catch(err => {
    console.error('Error:', err)
    process.exit(1)
  })


