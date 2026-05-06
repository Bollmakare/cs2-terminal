import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://dwtyuihbyasxqpyotqxm.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3dHl1aWhieWFzeHFweW90cXhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDA0NzMsImV4cCI6MjA5MzQ3NjQ3M30.uuHseV7XmG-XNUNawubWIjsDV0R36qoUst2iNSFAOTY'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'vault_session',
  },
})
