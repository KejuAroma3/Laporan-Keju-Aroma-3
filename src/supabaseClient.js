import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://amvphhqscapbmrhemvmu.supabase.co/rest/v1/'
const supabaseKey = 'sb_publishable_i4kDUlmdn39rfFuYlGo2OA_5jJ0nsNI'

export const supabase = createClient(supabaseUrl, supabaseKey)