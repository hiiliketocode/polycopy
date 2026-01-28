#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')
const { GoogleGenerativeAI } = require('@google/generative-ai')

const envPath = path.resolve(process.cwd(), '.env.local')
dotenv.config(fs.existsSync(envPath) ? { path: envPath } : {})

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

if (!GEMINI_API_KEY) {
  throw new Error('Missing GEMINI_API_KEY')
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)

async function listModels() {
  try {
    // Try to list models
    const models = await genAI.listModels()
    console.log('Available models:')
    console.log(JSON.stringify(models, null, 2))
  } catch (error) {
    console.error('Error listing models:', error.message)
    console.error('Trying direct API call...')
    
    // Try direct fetch
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${GEMINI_API_KEY}`)
      const data = await response.json()
      console.log('Models from API:')
      console.log(JSON.stringify(data, null, 2))
    } catch (fetchError) {
      console.error('Direct API call failed:', fetchError.message)
      
      // Try a simple test with a known model
      console.log('\nTrying to test with gemini-pro...')
      try {
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' })
        const result = await model.generateContent('Say hello')
        console.log('✅ gemini-pro works!')
        console.log('Response:', result.response.text())
      } catch (testError) {
        console.error('❌ gemini-pro test failed:', testError.message)
      }
    }
  }
}

listModels().catch(console.error)
