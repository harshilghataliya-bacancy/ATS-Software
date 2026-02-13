#!/usr/bin/env node
/**
 * Run this script to apply the AI matching migration.
 *
 * Option 1 (Recommended): Copy the contents of supabase/migrations/00002_ai_matching.sql
 * and paste it into the Supabase Dashboard SQL Editor:
 * https://supabase.com/dashboard/project/osodibfoigyvitfwzoew/sql/new
 *
 * Option 2: If you have psql installed, run:
 * psql "postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres" -f supabase/migrations/00002_ai_matching.sql
 */

const fs = require('fs')
const path = require('path')

const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '00002_ai_matching.sql')
const sql = fs.readFileSync(migrationPath, 'utf8')

console.log('=== AI Matching Migration ===')
console.log('')
console.log('Please run the following SQL in your Supabase Dashboard SQL Editor:')
console.log('URL: https://supabase.com/dashboard/project/osodibfoigyvitfwzoew/sql/new')
console.log('')
console.log('--- Copy from here ---')
console.log(sql)
console.log('--- End copy ---')
