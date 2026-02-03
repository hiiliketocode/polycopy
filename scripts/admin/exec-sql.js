#!/usr/bin/env node
/**
 * Execute SQL via Supabase REST API
 * Usage: node scripts/exec-sql.js "SELECT * FROM profiles LIMIT 5;"
 * 
 * Note: For complex queries, you may need to create an RPC function in Supabase
 */

require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function execSQL(query) {
  try {
    // For simple SELECT queries, use the client
    if (query.trim().toUpperCase().startsWith('SELECT')) {
      // Parse basic SELECT queries
      const selectMatch = query.match(/SELECT\s+(.+?)\s+FROM\s+(\w+)/i)
      if (selectMatch) {
        const columns = selectMatch[1].trim()
        const table = selectMatch[2].trim()
        
        let queryBuilder = supabase.from(table).select(columns === '*' ? '*' : columns)
        
        // Handle WHERE
        const whereMatch = query.match(/WHERE\s+(.+?)(?:\s+(?:ORDER|LIMIT|GROUP|HAVING)|$)/i)
        if (whereMatch) {
          const whereClause = whereMatch[1].trim()
          // Basic WHERE parsing - supports: column = value, column != value
          const eqMatch = whereClause.match(/(\w+)\s*=\s*['"]?([^'"]+)['"]?/)
          const neMatch = whereClause.match(/(\w+)\s*!=\s*['"]?([^'"]+)['"]?/)
          
          if (eqMatch) {
            queryBuilder = queryBuilder.eq(eqMatch[1], eqMatch[2])
          } else if (neMatch) {
            queryBuilder = queryBuilder.neq(neMatch[1], neMatch[2])
          }
        }
        
        // Handle LIMIT
        const limitMatch = query.match(/LIMIT\s+(\d+)/i)
        if (limitMatch) {
          queryBuilder = queryBuilder.limit(parseInt(limitMatch[1]))
        }
        
        // Handle ORDER BY
        const orderMatch = query.match(/ORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?/i)
        if (orderMatch) {
          queryBuilder = queryBuilder.order(orderMatch[1], { ascending: orderMatch[2]?.toUpperCase() !== 'DESC' })
        }
        
        const { data, error } = await queryBuilder
        
        if (error) throw error
        return data
      }
    }
    
    // For other queries, try RPC
    console.log('⚠️  Complex queries require Supabase RPC functions')
    console.log('💡 Create an RPC function in Supabase Dashboard SQL Editor:')
    console.log('   CREATE OR REPLACE FUNCTION exec_sql(sql_text text)')
    console.log('   RETURNS json AS $$')
    console.log('   BEGIN')
    console.log('     RETURN (SELECT json_agg(row_to_json(t)) FROM (EXECUTE sql_text) t);')
    console.log('   END;')
    console.log('   $$ LANGUAGE plpgsql SECURITY DEFINER;')
    
    return null
  } catch (error) {
    console.error('❌ Query error:', error.message)
    throw error
  }
}

const query = process.argv[2]

if (!query) {
  console.log('Usage: node scripts/exec-sql.js "SELECT * FROM profiles LIMIT 5;"')
  console.log('')
  console.log('Supported:')
  console.log('  - SELECT with WHERE, LIMIT, ORDER BY')
  console.log('  - Simple WHERE clauses (column = value)')
  console.log('')
  console.log('For complex queries, use Supabase Dashboard SQL Editor')
  process.exit(1)
}

execSQL(query)
  .then(data => {
    if (data) {
      console.log(JSON.stringify(data, null, 2))
    }
  })
  .catch(err => {
    console.error('Error:', err)
    process.exit(1)
  })


