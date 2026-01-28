#!/usr/bin/env node
/**
 * Export markets data to CSV
 * Usage: node scripts/export-markets-csv.js
 */

require('dotenv').config({ path: '.env.local' })
const fs = require('fs')
const path = require('path')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

function escapeCsvField(field) {
  if (field === null || field === undefined) {
    return ''
  }
  const str = String(field)
  // If field contains comma, quote, or newline, wrap in quotes and escape quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function arrayToCsv(data) {
  if (!data || data.length === 0) {
    return 'clean_title,tags\n'
  }
  
  const headers = Object.keys(data[0])
  const headerRow = headers.map(escapeCsvField).join(',')
  
  const rows = data.map(row => {
    return headers.map(header => {
      const value = row[header]
      // Handle arrays (like tags)
      if (Array.isArray(value)) {
        return escapeCsvField(JSON.stringify(value))
      }
      return escapeCsvField(value)
    }).join(',')
  })
  
  return [headerRow, ...rows].join('\n')
}

async function exportMarkets() {
  try {
    console.log('📊 Fetching markets data...')
    
    // Fetch all markets with title and tags (we'll filter and process in JS)
    // Supabase has a default limit of 1000, so we need to fetch in batches
    let allData = []
    let page = 0
    const pageSize = 1000
    const maxRecords = 2000
    
    while (allData.length < maxRecords) {
      const { data, error } = await supabase
        .from('markets')
        .select('title, tags')
        .not('title', 'is', null)
        .not('tags', 'is', null)
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1)
      
      if (error) throw error
      
      if (!data || data.length === 0) {
        break
      }
      
      allData = allData.concat(data)
      
      if (data.length < pageSize) {
        break // No more data
      }
      
      page++
      
      if (allData.length >= maxRecords) {
        allData = allData.slice(0, maxRecords)
        break
      }
    }
    
    const data = allData
    
    if (!data || data.length === 0) {
      console.log('⚠️  No data found')
      return
    }
    
    console.log(`✅ Fetched ${data.length} records`)
    console.log('🔄 Processing data (applying LOWER and DISTINCT)...')
    
    // Process the data: apply LOWER to title and get distinct values
    const processed = data.map(row => ({
      clean_title: row.title ? row.title.toLowerCase() : null,
      tags: row.tags
    }))
    
    // Get distinct values based on clean_title and tags
    const seen = new Set()
    const distinct = []
    
    for (const row of processed) {
      const key = `${row.clean_title}|${JSON.stringify(row.tags)}`
      if (!seen.has(key)) {
        seen.add(key)
        distinct.push(row)
      }
    }
    
    console.log(`✅ Found ${distinct.length} distinct records`)
    
    // Convert to CSV
    const csv = arrayToCsv(distinct)
    
    // Write to file
    const outputPath = path.join(__dirname, '..', 'markets_export.csv')
    fs.writeFileSync(outputPath, csv, 'utf8')
    
    console.log(`✅ CSV file created: ${outputPath}`)
    console.log(`📄 Total rows: ${distinct.length}`)
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    if (error.details) {
      console.error('Details:', error.details)
    }
    process.exit(1)
  }
}

exportMarkets()
