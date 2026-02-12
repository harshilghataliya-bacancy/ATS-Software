// Quick script to list all Supabase auth users
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  const { data: { users }, error } = await supabase.auth.admin.listUsers()
  if (error) {
    console.error('Error:', error.message)
    return
  }
  console.log(`\nFound ${users.length} users:\n`)
  for (const user of users) {
    // Check org memberships
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('role, organization:organizations(name)')
      .eq('user_id', user.id)

    const orgs = memberships?.map((m: any) => `${(m.organization as any)?.name} (${m.role})`).join(', ') || 'none'
    console.log(`  ${user.email} | id: ${user.id} | orgs: ${orgs}`)
  }
}

main()
